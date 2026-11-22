import { DatabaseSync } from 'node:sqlite';
import { mkdirSync } from 'node:fs';
import { dirname } from 'node:path';
import type { Detection } from './types.js';

export interface Pending { key: string; event: Detection; attempts: number }
export class QueueFull extends Error {}
export class DurableQueue {
  private db: DatabaseSync;
  constructor(path: string, private maxItems = 100000, private deadMax = 10000) {
    if (path !== ':memory:') mkdirSync(dirname(path), { recursive: true });
    this.db = new DatabaseSync(path);
    this.db.exec(`PRAGMA journal_mode=WAL; PRAGMA synchronous=FULL; PRAGMA busy_timeout=5000;
      CREATE TABLE IF NOT EXISTS events (
        key TEXT PRIMARY KEY, body TEXT NOT NULL, state TEXT NOT NULL DEFAULT 'pending',
        attempts INTEGER NOT NULL DEFAULT 0, next_at INTEGER NOT NULL DEFAULT 0,
        reason TEXT, created_at TEXT NOT NULL
      ) STRICT;
      CREATE INDEX IF NOT EXISTS events_ready ON events(state, next_at, created_at);`);
  }
  enqueue(event: Detection): boolean {
    const key = `${event.receiverId}:${event.eventId}`;
    const existing = this.db.prepare('SELECT body FROM events WHERE key=?').get(key);
    if (existing) {
      const old = JSON.parse(existing.body as string) as Detection;
      if (old.propertyId !== event.propertyId) throw new Error('evento_conflita_com_propriedade_pendente');
      return false;
    }
    if (this.count() >= this.maxItems) throw new QueueFull('fila_cheia');
    this.db.prepare('INSERT INTO events(key,body,created_at) VALUES(?,?,?)').run(key, JSON.stringify(event), event.receivedAt);
    return true;
  }
  ready(limit: number, now = Date.now()): Pending[] {
    return this.db.prepare("SELECT key,body,attempts FROM events WHERE state='pending' AND next_at<=? ORDER BY next_at,created_at LIMIT ?")
      .all(now, limit).map(row => ({ key: row.key as string, event: JSON.parse(row.body as string) as Detection, attempts: Number(row.attempts) }));
  }
  complete(keys: string[]) {
    this.db.exec('BEGIN IMMEDIATE');
    try {
      const stmt = this.db.prepare('DELETE FROM events WHERE key=?');
      for (const key of keys) stmt.run(key);
      this.db.exec('COMMIT');
    } catch (error) { this.db.exec('ROLLBACK'); throw error; }
  }
  retry(key: string, reason: string, nextAt: number) {
    this.db.prepare('UPDATE events SET attempts=attempts+1,reason=?,next_at=? WHERE key=?').run(reason.slice(0, 300), nextAt, key);
  }
  reject(key: string, reason: string): boolean {
    if (this.count('dead') >= this.deadMax) return false;
    this.db.prepare("UPDATE events SET state='dead',reason=? WHERE key=?").run(reason.slice(0, 300), key);
    return true;
  }
  count(state?: string): number {
    return Number((state ? this.db.prepare('SELECT count(*) AS n FROM events WHERE state=?').get(state)
      : this.db.prepare('SELECT count(*) AS n FROM events').get())?.n ?? 0);
  }
  stats() { return { pending: this.count('pending'), rejected: this.count('dead'), total: this.count() }; }
  rejected(limit = 50) { return this.db.prepare("SELECT key,reason,created_at FROM events WHERE state='dead' ORDER BY created_at LIMIT ?").all(limit); }
  requeue(key: string) { return this.db.prepare("UPDATE events SET state='pending',next_at=0,attempts=0,reason=NULL WHERE key=? AND state='dead'").run(key).changes; }
  close() { this.db.close(); }
}
