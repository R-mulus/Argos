import { DatabaseSync } from 'node:sqlite';
import { mkdirSync } from 'node:fs';
import { dirname } from 'node:path';
import type { Detection, Notice } from './types.js';
import { randomUUID } from 'node:crypto';

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
      CREATE INDEX IF NOT EXISTS events_ready ON events(state, next_at, created_at);
      CREATE TABLE IF NOT EXISTS notices (key TEXT PRIMARY KEY, body TEXT NOT NULL) STRICT;
      CREATE TABLE IF NOT EXISTS recovery_batches (id TEXT PRIMARY KEY, property TEXT NOT NULL UNIQUE, started TEXT NOT NULL) STRICT;
      CREATE TABLE IF NOT EXISTS recovery_members (key TEXT PRIMARY KEY, batch TEXT NOT NULL, state TEXT NOT NULL) STRICT;`);
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
      for (const key of keys) { this.finishRecovery(key, 'synced'); stmt.run(key); }
      this.db.exec('COMMIT');
    } catch (error) { this.db.exec('ROLLBACK'); throw error; }
  }
  retry(key: string, reason: string, nextAt: number) {
    this.db.exec('BEGIN IMMEDIATE');
    try {
      const row = this.db.prepare('SELECT body FROM events WHERE key=?').get(key);
      if (row) {
        const event = JSON.parse(String(row.body)) as Detection;
        this.db.prepare('INSERT OR IGNORE INTO recovery_batches VALUES(?,?,?)').run(randomUUID(), event.propertyId, new Date().toISOString());
        const batch = this.db.prepare('SELECT id FROM recovery_batches WHERE property=?').get(event.propertyId)!;
        this.db.prepare("INSERT OR IGNORE INTO recovery_members VALUES(?,?,'pending')").run(key, String(batch.id));
      }
      this.db.prepare('UPDATE events SET attempts=attempts+1,reason=?,next_at=? WHERE key=?').run(reason.slice(0, 300), nextAt, key);
      this.db.exec('COMMIT');
    } catch(error) { this.db.exec('ROLLBACK'); throw error; }
  }
  reject(key: string, reason: string): boolean {
    if (this.count('dead') >= this.deadMax) return false;
    this.db.exec('BEGIN IMMEDIATE');
    try {
      const row = this.db.prepare('SELECT body FROM events WHERE key=?').get(key);
      if (row) {
        const e = JSON.parse(String(row.body)) as Detection;
        this.notice({ propriedade_id:e.propertyId, dispositivo_id:e.receiverId, origem_evento:key,
          tipo:'deteccao_rejeitada',titulo:'Detecção rejeitada por cadastro incompatível',descricao:reason.slice(0,300),prioridade:'media' });
        this.finishRecovery(key,'rejected');
      }
      this.db.prepare("UPDATE events SET state='dead',reason=? WHERE key=?").run(reason.slice(0, 300), key);
      this.db.exec('COMMIT');
    } catch(error) { this.db.exec('ROLLBACK'); throw error; }
    return true;
  }
  private notice(value: Notice) {
    this.db.prepare('INSERT OR IGNORE INTO notices VALUES(?,?)').run(`${value.propriedade_id}:${value.origem_evento}`, JSON.stringify(value));
  }
  private finishRecovery(key: string, state: 'synced' | 'rejected') {
    const member = this.db.prepare('SELECT batch FROM recovery_members WHERE key=?').get(key);
    if (!member) return;
    this.db.prepare('UPDATE recovery_members SET state=? WHERE key=?').run(state,key);
    if (this.db.prepare("SELECT 1 FROM recovery_members WHERE batch=? AND state='pending'").get(member.batch!)) return;
    const batch = this.db.prepare('SELECT * FROM recovery_batches WHERE id=?').get(member.batch!)!;
    const counts = this.db.prepare("SELECT sum(state='synced') AS synced,sum(state='rejected') AS rejected FROM recovery_members WHERE batch=?").get(member.batch!)!;
    this.notice({ propriedade_id:String(batch.property),origem_evento:`sincronizacao:${batch.id}`,
      tipo:'sincronizacao_concluida',titulo:'Detecções pendentes processadas',prioridade:'baixa',
      descricao:`Interrupção observada em ${batch.started}. Processamento concluído em ${new Date().toISOString()}. ${counts.synced} detecções confirmadas e ${counts.rejected} rejeitadas.` });
    this.db.prepare('DELETE FROM recovery_members WHERE batch=?').run(member.batch!);
    this.db.prepare('DELETE FROM recovery_batches WHERE id=?').run(member.batch!);
  }
  notices() {
    return this.db.prepare('SELECT key,body FROM notices ORDER BY rowid LIMIT 50').all()
      .map(r => ({ key:String(r.key), value:JSON.parse(String(r.body)) as Notice }));
  }
  acknowledgeNotice(key: string) { this.db.prepare('DELETE FROM notices WHERE key=?').run(key); }
  count(state?: string): number {
    return Number((state ? this.db.prepare('SELECT count(*) AS n FROM events WHERE state=?').get(state)
      : this.db.prepare('SELECT count(*) AS n FROM events').get())?.n ?? 0);
  }
  stats() { return { pending: this.count('pending'), rejected: this.count('dead'), total: this.count() }; }
  rejected(limit = 50) { return this.db.prepare("SELECT key,reason,created_at FROM events WHERE state='dead' ORDER BY created_at LIMIT ?").all(limit); }
  requeue(key: string) { return this.db.prepare("UPDATE events SET state='pending',next_at=0,attempts=0,reason=NULL WHERE key=? AND state='dead'").run(key).changes; }
  close() { this.db.close(); }
}
