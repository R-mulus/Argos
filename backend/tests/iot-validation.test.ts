import assert from 'node:assert/strict';
import test from 'node:test';
import { parseDispositivo, parseFiltrosDispositivos } from '../src/models/dispositivo.model.js';
import { parseZona, parseFiltroZona } from '../src/models/zona.model.js';
import {
  calcularFimEm, parseEncerramentoVinculo, parseFiltrosVinculos, parseVinculo,
} from '../src/models/vinculo.model.js';

const animalId = '652fca4e-b911-4638-8ac4-20db0c24c027';
const transmissorId = '5a61dabf-08c8-4ee1-9de7-1a134751f6bb';

test('dispositivo aceita cadastro sem identificador físico e bloqueia mudança de tipo', () => {
  assert.deepEqual(parseDispositivo({ codigo: ' T01 ', tipo: 'transmissor' }), {
    codigo: 'T01', tipo: 'transmissor',
  });
  assert.deepEqual(parseDispositivo({ identificador_hardware: ' ABC ' }, true), {
    identificador_hardware: 'ABC',
  });
  assert.throws(() => parseDispositivo({ codigo: 'A' }), /tipo é obrigatório/);
  assert.throws(() => parseDispositivo({ codigo: 'A', tipo: 'sensor' }), /tipo/);
  assert.throws(() => parseDispositivo({ tipo: 'receptor' }, true), /não permitidos/);
  assert.throws(() => parseDispositivo({ status: null }, true), /nulo/);
  assert.throws(() => parseDispositivo({ ultima_comunicacao_em: '2026-11-10T12:00:00Z' }, true), /não permitidos/);
  assert.throws(() => parseDispositivo({ codigo: 'T01', tipo: 'transmissor', propriedade_id: animalId }), /não permitidos/);
  assert.deepEqual(parseFiltrosDispositivos({ tipo: 'receptor', status: 'ativo' }), {
    tipo: 'receptor', status: 'ativo',
  });
  assert.throws(() => parseFiltrosDispositivos({ tipo: ['receptor', 'transmissor'] }), /tipo/);
});

test('zona aceita cadastro inativo sem receptor, mas exige receptor para ativar', () => {
  assert.deepEqual(parseZona({ nome: ' Curral 1 ' }), { nome: 'Curral 1' });
  assert.deepEqual(parseZona({ nome: 'Curral', ativa: true, receptor_id: transmissorId }), {
    nome: 'Curral', ativa: true, receptor_id: transmissorId,
  });
  assert.deepEqual(parseZona({ receptor_id: null }, true), { receptor_id: null });
  assert.throws(() => parseZona({ nome: 'Curral', ativa: true }), /receptor_id/);
  assert.throws(() => parseZona({ ativa: true, receptor_id: null }, true), /receptor_id/);
  assert.throws(() => parseZona({ nome: 'Curral', ativa: 'yes' }), /true ou false/);
  assert.throws(() => parseZona({ nome: 'Curral', receptor_id: 'XXX' }), /UUID/);
  assert.throws(() => parseZona({ nome: 'Curral', propriedade_id: animalId }), /não permitidos/);
  assert.equal(parseFiltroZona({ ativa: 'false' }), false);
  assert.throws(() => parseFiltroZona({ ativa: 'yes' }), /true ou false/);
});

test('vínculo recebe apenas os identificadores de animal e transmissor', () => {
  assert.deepEqual(parseVinculo({ animal_id: animalId, transmissor_id: transmissorId }), {
    animal_id: animalId, transmissor_id: transmissorId,
  });
  assert.throws(() => parseVinculo({ animal_id: animalId }), /UUID/);
  assert.throws(() => parseVinculo({ animal_id: animalId, transmissor_id: transmissorId, fim_em: null }), /não permitidos/);
  assert.deepEqual(parseFiltrosVinculos({ animal_id: animalId, ativo: 'true' }), {
    animal_id: animalId, ativo: true,
  });
  assert.throws(() => parseFiltrosVinculos({ ativo: '1' }), /true ou false/);
  assert.doesNotThrow(() => parseEncerramentoVinculo({}));
  assert.throws(() => parseEncerramentoVinculo({ fim_em: '2025-01-01' }), /não permitidos/);
});

test('fechamento não acontece antes do início', () => {
  const inicio = '2026-11-10T17:00:00.500Z';
  assert.equal(calcularFimEm(inicio, Date.parse(inicio)), '2026-11-10T17:00:01.500Z');
  assert.equal(calcularFimEm(inicio, Date.parse(inicio) + 3000), '2026-11-10T17:00:03.500Z');
});
