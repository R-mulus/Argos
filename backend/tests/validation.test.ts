import assert from 'node:assert/strict';
import test from 'node:test';
import { parseAnimal } from '../src/models/animal.model.js';
import { parsePropriedade } from '../src/models/propriedade.model.js';
import { pagination, uuidParam } from '../src/lib/validation.js';

test('propriedade aceita apenas campos cadastrais', () => {
  assert.deepEqual(parsePropriedade({ nome: ' Fazenda ', uf: 'MG' }), { nome: 'Fazenda', uf: 'MG' });
  assert.throws(() => parsePropriedade({ nome: 'Fazenda', usuario_id: 'outro' }), /não permitidos/);
  assert.throws(() => parsePropriedade({}, true), /ao menos um/);
});
test('animal valida campos, status e data', () => {
  assert.deepEqual(parseAnimal({ identificacao: ' A001 ', sexo: 'femea' }), { identificacao: 'A001', sexo: 'femea' });
  assert.throws(() => parseAnimal({ identificacao: 'A001', data_nascimento: '2026-02-30' }), /inválida/);
  assert.throws(() => parseAnimal({ identificacao: 'A001', propriedade_id: 'outro' }), /não permitidos/);
  assert.throws(() => parseAnimal({ status: null }, true), /não pode ser nulo/);
});
test('paginação possui limite máximo e offset válido', () => {
  assert.deepEqual(pagination({}), { limit: 20, offset: 0 });
  assert.deepEqual(pagination({ limit: '100', offset: '9' }), { limit: 100, offset: 9 });
  assert.throws(() => pagination({ limit: '101' }), /limit/);
  assert.throws(() => pagination({ offset: '-1' }), /offset/);
});
test('ids de rota exigem UUID válido', () => {
  assert.equal(uuidParam('652fca4e-b911-4638-8ac4-20db0c24c027'), '652fca4e-b911-4638-8ac4-20db0c24c027');
  assert.throws(() => uuidParam('not-an-id'), /UUID/);
});
