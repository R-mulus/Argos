import { mkdirSync, closeSync, openSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { setTimeout as sleep } from 'node:timers/promises';
import lockfile from 'proper-lockfile';
import { readConfig } from './config.js';
import { DurableQueue } from './queue.js';
import { SupabaseRepository } from './database.js';
import { Processor } from './processor.js';
import { startMqtt } from './mqtt.js';
import { log } from './types.js';

async function main() {
  const config = readConfig();
  const path = resolve(config.queuePath);
  mkdirSync(dirname(path), { recursive: true }); closeSync(openSync(path, 'a', 0o600));
  // Impede dois workers na mesma fila; após crash o lock expira em 30 segundos.
  const release = await lockfile.lock(path, { realpath: false, stale: 30000, update: 10000,
    onCompromised: () => { log('lock_perdido'); process.exit(1); } });
  let queue: DurableQueue | undefined;
  let stopping = false;
  let exitCode = 0;
  const stop = (error?: Error) => {
    if (stopping) return;
    stopping = true;
    if (error) { exitCode = 1; log('falha', { reason: error.message }); }
    log('encerrando');
    setTimeout(() => process.exit(1), 30000).unref();
  };
  process.once('SIGINT', () => stop()); process.once('SIGTERM', () => stop());
  try {
    queue = new DurableQueue(path, config.maxItems, config.deadMax);
    const repository = new SupabaseRepository(config.supabaseUrl, config.supabaseKey, config.requestTimeout, config.cacheMs);
    const processor = new Processor(queue, repository, log, config.batchSize, config.retryBase, config.retryMax);
    const mqtt = startMqtt(config, queue, log, stop);
    log('worker_iniciado', { queue: path, ...queue.stats() });
    let reportAt = 0;
    try {
      while (!stopping) {
        await processor.tick();
        if (Date.now() - reportAt >= 30000) { log('estado', { mqtt: mqtt.connected, ...queue.stats() }); reportAt = Date.now(); }
        await sleep(config.pollMs);
      }
    } finally { await mqtt.endAsync(true); }
  } finally {
    queue?.close(); await release();
  }
  process.exitCode = exitCode;
}
main().catch(error => { log('erro_fatal', { reason: error instanceof Error ? error.message : 'erro' }); process.exitCode = 1; });
