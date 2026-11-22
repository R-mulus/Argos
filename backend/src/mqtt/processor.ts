import { MensagemInvalida, type DeteccaoMqtt } from './contract.js';

export type DispositivoIoT = { id: string; tipo: string; status: string };
export type VinculoIoT = { id: string; inicio_em: string; fim_em: string | null };
export type DetecaoPersistida = {
  propriedade_id: string;
  receptor_id: string;
  transmissor_id: string;
  evento_id: string;
  rssi_dbm: number;
  bateria_percentual: number | null;
  detectado_em: string | null;
  recebido_no_gateway_em: string;
  zona_id: string | null;
  vinculo_id: string | null;
};

// A persistência fica separada da lógica de negócios para testes sem credenciais/broker.
export interface RepositorioDeteccoes {
  buscarDispositivo(propriedadeId: string, id: string): Promise<DispositivoIoT | null>;
  buscarZonaAtiva(propriedadeId: string, receptorId: string, instante: string): Promise<{ id: string } | null>;
  buscarVinculoNoInstante(
    propriedadeId: string, transmissorId: string, data: string,
  ): Promise<VinculoIoT | null>;
  inserirSeInedita(row: DetecaoPersistida): Promise<boolean>;
  atualizarUltimaComunicacao(propriedadeId: string, dispositivoId: string, em: string): Promise<void>;
}

export type ResultadoDeteccao = 'gravada' | 'duplicada';

export async function processarDeteccao(
  repositorio: RepositorioDeteccoes, evento: DeteccaoMqtt,
  avisar: (message: string, err: unknown) => void = console.warn,
): Promise<ResultadoDeteccao> {
  const [receptor, transmissor] = await Promise.all([
    repositorio.buscarDispositivo(evento.propriedadeId, evento.receptorId),
    repositorio.buscarDispositivo(evento.propriedadeId, evento.transmissorId),
  ]);
  if (!receptor || receptor.tipo !== 'receptor' || receptor.status !== 'ativo') {
    throw new MensagemInvalida('Receptor não cadastrado, inativo ou pertencente a outra propriedade.');
  }
  if (!transmissor || transmissor.tipo !== 'transmissor' || transmissor.status !== 'ativo') {
    throw new MensagemInvalida('Transmissor não cadastrado, inativo ou pertencente a outra propriedade.');
  }

  // Relógio ausente: um buffer pode ser antigo; não atribuir animal/zona atuais.
  // A hora do gateway continua registrada separadamente para diagnóstico.
  const instante = evento.detectadoEm ?? evento.recebidoEm;
  const recenciaMs = Date.parse(evento.recebidoEm) - Date.parse(instante);
  const recente = evento.detectadoEm !== null && recenciaMs >= -60_000 && recenciaMs <= 5 * 60_000;
  // Zona também vale para leitura atrasada (fila do receptor ou do gateway): o repositório só
  // devolve a zona se ela não foi alterada depois da detecção (zonas.updated_at <= instante),
  // então a associação receptor→zona é a mesma que valia no momento observado.
  const [zona, vinculo] = await Promise.all([
    evento.detectadoEm !== null
      ? repositorio.buscarZonaAtiva(evento.propriedadeId, evento.receptorId, instante)
      : Promise.resolve(null),
    evento.detectadoEm !== null
      ? repositorio.buscarVinculoNoInstante(evento.propriedadeId, evento.transmissorId, instante)
      : Promise.resolve(null),
  ]);
  const vinculoId = vinculo && Date.parse(vinculo.inicio_em) <= Date.parse(instante) &&
    (vinculo.fim_em === null || Date.parse(vinculo.fim_em) > Date.parse(instante))
    ? vinculo.id : null;

  const inedita = await repositorio.inserirSeInedita({
    propriedade_id: evento.propriedadeId,
    receptor_id: evento.receptorId,
    transmissor_id: evento.transmissorId,
    evento_id: evento.eventoId,
    rssi_dbm: evento.rssiDbm,
    bateria_percentual: evento.bateriaPercentual,
    detectado_em: evento.detectadoEm,
    recebido_no_gateway_em: evento.recebidoEm,
    zona_id: zona?.id ?? null,
    vinculo_id: vinculoId,
  });

  if (!inedita) return 'duplicada';

  // Status operacional é auxiliar: falha nesta atualização não invalida a
  // detecção já gravada, e jamais provoca reenfileiramento infinito.
  try {
    await repositorio.atualizarUltimaComunicacao(
      evento.propriedadeId, evento.receptorId, evento.recebidoEm,
    );
    // Um pacote muito antigo não comprova comunicação recente do transmissor.
    if (recente) {
      await repositorio.atualizarUltimaComunicacao(
        evento.propriedadeId, evento.transmissorId, evento.recebidoEm,
      );
    }
  } catch (error) {
    avisar('Não foi possível atualizar ultima_comunicacao_em.', error);
  }
  return 'gravada';
}
