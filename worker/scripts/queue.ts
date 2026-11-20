import { DatabaseSync } from 'node:sqlite';
import { resolve } from 'node:path';
import lockfile from 'proper-lockfile';
import { DurableQueue } from '../src/queue.js';
const path = resolve(process.env.QUEUE_PATH || './data/ingestion.sqlite');
const [command = 'status', key] = process.argv.slice(2);
if (command === 'retry') {
  if (!key) throw new Error('Uso: npm run queue -- retry <chave> (pare o worker antes)');
  const release = await lockfile.lock(path, { realpath: false, stale: 30000 });
  const queue = new DurableQueue(path);
  try { console.log({ requeued: queue.requeue(key) }); }
  finally { queue.close(); await release(); }
} else {
  const db = new DatabaseSync(path, { readOnly: true });
  try {
    if (command === 'status') console.log(db.prepare('SELECT state,count(*) AS total,min(created_at) AS oldest FROM events GROUP BY state').all());
    else if (command === 'rejected') console.log(db.prepare("SELECT key,reason,created_at FROM events WHERE state='dead' ORDER BY created_at LIMIT 50").all());
    else throw new Error('Use status, rejected ou retry <chave>');
  } finally { db.close(); }
}
