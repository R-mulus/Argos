import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { DurableQueue, QueueFull } from '../src/queue.js';
import { event, receivers } from './helpers.js';
test('deduplicação local por RX/evento e preservação do primeiro recebimento', () => {
  const q = new DurableQueue(':memory:');
  try {
    q.enqueue(event()); q.enqueue({ ...event(), receivedAt: '2026-11-21T00:00:00Z' });
    for (const rx of receivers.slice(1)) q.enqueue(event(1, rx));
    assert.equal(q.count(), 3); assert.equal(q.ready(3)[0]?.event.receivedAt, event().receivedAt);
  } finally { q.close(); }
});
test('fila sobrevive a reabertura, backoff e quarentena sem apagar pendências', () => {
  const file = join(mkdtempSync(join(tmpdir(), 'argos-queue-')), 'test.sqlite');
  let q = new DurableQueue(file); q.enqueue(event());
  const key = q.ready(1)[0]!.key; q.retry(key, 'offline', 500); q.close();
  q = new DurableQueue(file);
  try {
    assert.equal(q.ready(10, 499).length, 0); assert.equal(q.ready(10, 500)[0]?.attempts, 1);
    assert(q.reject(key, 'unknown')); assert.equal(q.count('dead'), 1);
    assert.equal(q.requeue(key), 1); assert.equal(q.count('pending'), 1);
    q.complete([key]); assert.equal(q.count(), 0);
  } finally { q.close(); }
});
test('capacidade gera backpressure e duplicata já durável ainda pode ser confirmada', () => {
  const q = new DurableQueue(':memory:', 1);
  try { q.enqueue(event()); assert.equal(q.enqueue(event()), false); assert.throws(() => q.enqueue(event(2)), QueueFull); }
  finally { q.close(); }
});
