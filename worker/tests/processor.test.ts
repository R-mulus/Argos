import { test } from 'node:test';
import assert from 'node:assert/strict';
import { DurableQueue } from '../src/queue.js';
import { Processor } from '../src/processor.js';
import { mapDetection } from '../src/database.js';
import { PermanentError, type Repository, type DetectionRow } from '../src/types.js';
import { event, property, receivers, tx } from './helpers.js';
const devices = (rx = receivers[0]!) => [{ id: tx, propriedade_id: property, tipo: 'transmissor', status: 'ativo' },
  { id: rx, propriedade_id: property, tipo: 'receptor', status: 'ativo' }] as const;
const prepare: Repository['prepare'] = async e => mapDetection(e, ...devices(e.receiverId), null);
test('mapa respeita esquema, papéis, status e propriedade; sem horário não inventa vínculo', () => {
  const [t, r] = devices(); const row = mapDetection(event(), t, r, 'ignored');
  assert.equal(row.vinculo_id, null); assert.equal(row.zona_id, null); assert(!('animal_id' in row));
  assert.throws(() => mapDetection(event(), undefined, r, null), PermanentError);
  assert.throws(() => mapDetection(event(), { ...t, status: 'inativo' }, r, null), PermanentError);
  assert.throws(() => mapDetection(event(), t, { ...r, tipo: 'transmissor' }, null), PermanentError);
  assert.throws(() => mapDetection(event(), t, { ...r, propriedade_id: tx }, null), PermanentError);
});
test('três receptores gravados em um lote, sem colapsar evento', async () => {
  const q = new DurableQueue(':memory:'); const batches: DetectionRow[][] = [];
  try {
    for (const rx of receivers) q.enqueue(event(1, rx));
    await new Processor(q, { prepare, insert: async rows => { batches.push(rows); } }, () => {}).tick();
    assert.equal(batches.length, 1); assert.equal(batches[0]?.length, 3); assert.equal(q.count(), 0);
  } finally { q.close(); }
});
test('indisponibilidade preserva fila; rejeição permanente não impede outros registros', async () => {
  const q = new DurableQueue(':memory:'); q.enqueue(event()); q.enqueue(event(2));
  let calls = 0;
  try {
    await new Processor(q, { prepare: async () => { ++calls; throw new Error('offline'); }, insert: async () => {} }, () => {}).tick();
    assert.equal(calls, 1); assert.equal(q.count('pending'), 2);
    q.close();
  } catch (error) { q.close(); throw error; }
  const other = new DurableQueue(':memory:'); other.enqueue(event()); other.enqueue(event(2));
  try {
    await new Processor(other, { prepare: async e => { if (e.eventId.endsWith(':1')) throw new PermanentError('unknown'); return prepare(e); },
      insert: async () => {} }, () => {}).tick();
    assert.equal(other.count('pending'), 0); assert.equal(other.count('dead'), 1);
  } finally { other.close(); }
});
test('registro rejeitado pelo banco é isolado sem descartar lote inteiro', async () => {
  const q = new DurableQueue(':memory:'); q.enqueue(event()); q.enqueue(event(2));
  try {
    await new Processor(q, { prepare, insert: async rows => {
      if (rows.some(row => row.evento_id.endsWith(':1'))) throw new PermanentError('fk');
    } }, () => {}).tick();
    assert.equal(q.count('pending'), 0); assert.equal(q.count('dead'), 1);
  } finally { q.close(); }
});
