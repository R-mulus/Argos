import assert from 'node:assert/strict';
import test from 'node:test';
import { filtrosDeteccoes } from '../src/models/deteccao.model.js';
import { deteccoesCsv } from '../src/lib/csv.js';
import type { DeteccaoHistorico } from '@argos/shared';

test('CSV preserva números, escapa texto e protege fórmulas de cadastro', () => {
  const csv = deteccoesCsv([{
    id: 'id', evento_id: 'evento', animal_id: null, animal_identificacao: '=1+1',
    receptor_codigo: 'R;"01"', zona_nome: 'Área\n02', rssi_dbm: -60,
    bateria_percentual: 80, detectado_em: null, recebido_no_gateway_em: null,
    recebido_em: '2026-11-13T00:00:00Z', instante_referencia: null,
  } as DeteccaoHistorico]);
  assert.ok(csv.startsWith('\uFEFF'));
  assert.ok(csv.includes('"\'=1+1"'));
  assert.ok(csv.includes('"R;""01"""'));
  assert.ok(csv.includes('"-60";"80"'));
  assert.ok(csv.includes('"Área\n02"'));
  assert.equal(deteccoesCsv([]).split('\r\n').length, 2);
});

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
