import assert from 'node:assert/strict';
import test from 'node:test';
import type { SupabaseClient } from '@supabase/supabase-js';
import { mlFilter, readSeries } from '../src/controllers/ml.controller.js';

const animal = '5a61dabf-08c8-4ee1-9de7-1a134751f6bb';
test('ML normaliza fuso e rejeita períodos inválidos ou maiores que 31 dias', () => {
  const filter = { animal_id: animal, inicio: '2026-11-01T00:00:00-03:00', fim: '2026-11-02T00:00:00-03:00' };
  assert.equal(mlFilter(filter).start, '2026-11-01T03:00:00.000Z');
  for (const change of [{ fim: filter.inicio }, { inicio: '2026-11-01' }, { fim: '2027-01-01T00:00:00Z' }, { periodo: 'ano' }])
    assert.throws(() => mlFilter({ ...filter, ...change }));
});

test('ML pagina mantendo escopo e rejeita linhas de outra propriedade', async () => {
  const filters: unknown[][] = [];
  let calls = 0;
  let foreign = false;
  const chain = {
    select() { return this; },
    eq(...args: unknown[]) { filters.push(args); return this; },
    gte() { return this; }, lt() { return this; }, order() { return this; },
    async range(start: number, end: number) {
      assert.equal(end - start, 499);
      return { data: calls++ === 0 ? [{ propriedade_id: foreign ? 'other' : 'property', animal_id: animal }] : [], error: null };
    },
  };
  const db = { from: () => chain } as unknown as SupabaseClient;
  assert.equal((await readSeries(db, 'argos_localizacoes', 'property', animal, 'start', 'end')).length, 1);
  assert.deepEqual(filters, [['propriedade_id', 'property'], ['animal_id', animal], ['propriedade_id', 'property'], ['animal_id', animal]]);
  calls = 0; foreign = true;
  await assert.rejects(readSeries(db, 'argos_localizacoes', 'property', animal, 'start', 'end'), /escopo/);
});
