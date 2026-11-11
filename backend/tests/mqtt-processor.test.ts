import assert from 'node:assert/strict';
import test from 'node:test';
import { MensagemInvalida, type DeteccaoMqtt } from '../src/mqtt/contract.js';
import { processarDeteccao, type RepositorioDeteccoes, type DetecaoPersistida, type VinculoIoT } from '../src/mqtt/processor.js';

const evento: DeteccaoMqtt = {
  propriedadeId: 'propriedade-1', receptorId: 'receptor-1', transmissorId: 'transmissor-1',
  eventoId: 'boot1:000001', rssiDbm: -66, bateriaPercentual: 83,
  detectadoEm: '2026-11-11T14:59:00.000Z', recebidoEm: '2026-11-11T15:00:00.000Z',
};
class FakeRepo implements RepositorioDeteccoes {
  detecoes: DetecaoPersistida[] = [];
  comunicações: string[] = [];
  vinculo: VinculoIoT | null = { id: 'vinculo-1', inicio_em: '2026-11-01T00:00:00Z', fim_em: null };
  receptorAtivo = true;
  transmissorPropriedade = true;
  zonaLookups = 0;
  failInsert = false;
  failCommunication = false;
  async buscarDispositivo(propriedadeId: string, id: string) {
    if (propriedadeId !== evento.propriedadeId) return null;
    if (id === evento.receptorId) return { id, tipo: 'receptor', status: this.receptorAtivo ? 'ativo' : 'inativo' };
    if (id === evento.transmissorId && this.transmissorPropriedade) {
      return { id, tipo: 'transmissor', status: 'ativo' };
    }
    return null;
  }
  async buscarZonaAtiva(_p: string, _r: string) {
    this.zonaLookups++;
    return { id: 'zona-1' };
  }
  async buscarVinculoNoInstante(_p: string, _t: string, _d: string) { return this.vinculo; }
  async inserirSeInedita(row: DetecaoPersistida) {
    if (this.failInsert) throw new Error('database offline');
    if (this.detecoes.some((x) => x.receptor_id === row.receptor_id && x.evento_id === row.evento_id)) return false;
    this.detecoes.push(row);
    return true;
  }
  async atualizarUltimaComunicacao(_p: string, id: string, _at: string) {
    if (this.failCommunication) throw new Error('status offline');
    this.comunicações.push(id);
  }
}
test('insere evento e preenche zona e vínculo corretos', async () => {
  const repo = new FakeRepo();
  assert.equal(await processarDeteccao(repo, evento), 'gravada');
  assert.deepEqual(repo.detecoes[0], {
    propriedade_id: evento.propriedadeId, receptor_id: evento.receptorId,
    transmissor_id: evento.transmissorId, evento_id: evento.eventoId,
    rssi_dbm: -66, bateria_percentual: 83, detectado_em: evento.detectadoEm,
    zona_id: 'zona-1', vinculo_id: 'vinculo-1',
  });
  assert.deepEqual(repo.comunicações, [evento.receptorId, evento.transmissorId]);
  assert.equal(await processarDeteccao(repo, evento), 'duplicada');
  assert.equal(repo.detecoes.length, 1);
});
test('replay antigo não inventa zona, mas recupera vínculo histórico', async () => {
  const repo = new FakeRepo();
  const antigo = { ...evento, detectadoEm: '2026-11-05T12:00:00.000Z' };
  repo.vinculo = { id: 'vinculo-antigo', inicio_em: '2026-11-01T00:00:00Z', fim_em: '2026-11-08T00:00:00Z' };
  assert.equal(await processarDeteccao(repo, antigo), 'gravada');
  assert.equal(repo.detecoes[0].zona_id, null);
  assert.equal(repo.detecoes[0].vinculo_id, 'vinculo-antigo');
  assert.equal(repo.zonaLookups, 0);
  assert.deepEqual(repo.comunicações, [evento.receptorId]);
});
test('vínculo após o evento não pode ser atribuído retroativamente', async () => {
  const repo = new FakeRepo();
  repo.vinculo = { id: 'novo', inicio_em: '2026-11-12T00:00:00Z', fim_em: null };
  await processarDeteccao(repo, evento);
  assert.equal(repo.detecoes[0].vinculo_id, null);
});
test('dispositivos desconhecidos/inativos são rejeitados antes do insert', async () => {
  const repo = new FakeRepo();
  repo.receptorAtivo = false;
  await assert.rejects(processarDeteccao(repo, evento), MensagemInvalida);
  repo.receptorAtivo = true;
  repo.transmissorPropriedade = false;
  await assert.rejects(processarDeteccao(repo, evento), MensagemInvalida);
  assert.equal(repo.detecoes.length, 0);
});
test('erro de persistência deve subir para replay; erro de status não invalida gravação', async () => {
  const repo = new FakeRepo();
  repo.failInsert = true;
  await assert.rejects(processarDeteccao(repo, evento), /database offline/);
  repo.failInsert = false;
  repo.failCommunication = true;
  const errors: string[] = [];
  assert.equal(await processarDeteccao(repo, evento, (message) => errors.push(message)), 'gravada');
  assert.equal(errors.length, 1);
});
