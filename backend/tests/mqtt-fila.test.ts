import assert from 'node:assert/strict';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';
import { MensagemInvalida, parseDeteccaoMqtt } from '../src/mqtt/contract.js';
import { FilaDeteccoes } from '../src/mqtt/fila.js';
import { sincronizarLote } from '../src/mqtt/sincronizacao.js';

const propriedade = '652fca4e-b911-4638-8ac4-20db0c24c027';
const receptor = '5a61dabf-08c8-4ee1-9de7-1a134751f6bb';
const transmissor = 'aafde201-a4d8-462b-822a-30be5e233230';
const topico = `argos/v1/propriedades/${propriedade}/receptores/${receptor}/deteccoes`;
const payload = Buffer.from(JSON.stringify({
  versao: 1, evento_id: 'boot:1', transmissor_id: transmissor, rssi_dbm: -60,
}));

test('fila sobrevive à queda, reinício e perda da confirmação remota', async () => {
  const pasta = mkdtempSync(join(tmpdir(), 'argos-fila-'));
  const arquivo = join(pasta, 'fila.sqlite');
  let fila = new FilaDeteccoes(arquivo);
  try {
    const original = parseDeteccaoMqtt(topico, payload, new Date('2026-11-11T10:00:00Z'));
    for (const id of ['boot:1', 'boot:2', 'boot:3']) {
      assert.equal(fila.guardar({ ...original, eventoId: id }), true);
    }
    const repetido = parseDeteccaoMqtt(topico.replace(receptor, receptor.toUpperCase()), payload);
    assert.equal(fila.guardar(repetido), false);
    await assert.rejects(sincronizarLote(fila, async () => { throw Error('sem internet'); }));
    fila.fechar();
    fila = new FilaDeteccoes(arquivo);
    assert.equal(fila.pendentes().length, 3);
    assert.deepEqual(fila.pendentes()[0], original);

    const remotas = new Set<string>();
    await assert.rejects(sincronizarLote(fila, async evento => {
      remotas.add(evento.eventoId);
      throw Error('resposta perdida após insert');
    }));
    assert.equal(fila.pendentes().length, 3);
    assert.equal(await sincronizarLote(fila, async evento => remotas.add(evento.eventoId)), 3);
    assert.equal(remotas.size, 3);
    assert.equal(fila.guardar(repetido), false);
    assert.equal(fila.resumo(), 'Pendentes: 0, sincronizadas: 3, rejeitadas: 0.');
  } finally {
    fila.fechar();
    rmSync(pasta, { recursive: true });
  }
});

test('cadastro inválido não impede o envio dos próximos eventos', async () => {
  const fila = new FilaDeteccoes(':memory:');
  try {
    const evento = parseDeteccaoMqtt(topico, payload);
    fila.guardar(evento);
    fila.guardar({ ...evento, eventoId: 'boot:2' });
    await sincronizarLote(fila, async item => {
      if (item.eventoId === evento.eventoId) throw new MensagemInvalida('Receptor inativo.');
    });
    assert.equal(fila.resumo(), 'Pendentes: 0, sincronizadas: 1, rejeitadas: 1.');
  } finally {
    fila.fechar();
  }
});
