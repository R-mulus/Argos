import assert from 'node:assert/strict';
import test from 'node:test';
import { filtrosDeteccoes } from '../src/models/deteccao.model.js';

test('histórico valida identificadores, paginação e intervalo com fuso', () => {
  const animal = '5a61dabf-08c8-4ee1-9de7-1a134751f6bb';
  const filtros = filtrosDeteccoes({
    animal_id: animal, zona_id: animal, inicio: '2026-11-12T08:00:00-03:00',
    fim: '2026-11-12T12:00:00Z', limit: '5', offset: '2',
  });
  assert.deepEqual(filtros, { animalId: animal, zonaId: animal, inicio: '2026-11-12T11:00:00.000Z',
    fim: '2026-11-12T12:00:00.000Z', limit: 5, offset: 2 });
  for (const query of [
    { propriedade_id: animal }, { inicio: '2026-02-30T00:00:00Z' },
    { inicio: '2026-11-12T08:00:00' }, { fim: ['2026-11-12T12:00:00Z'] },
    { inicio: filtros.fim, fim: filtros.inicio }, { zona_id: 'x' }, { limit: '101' },
  ]) assert.throws(() => filtrosDeteccoes(query));
});
