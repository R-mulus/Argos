import { MensagemInvalida, type DeteccaoMqtt } from './contract.js';
import type { FilaDeteccoes, LoteSincronizado } from './fila.js';

export async function sincronizarLote(
  fila: FilaDeteccoes,
  enviar: (evento: DeteccaoMqtt) => Promise<unknown>,
  registrarRejeicao: (evento: DeteccaoMqtt, motivo: string) => Promise<void> = async () => {},
  registrarSincronizacao?: (lote: LoteSincronizado) => Promise<void>,
): Promise<number> {
  const eventos = fila.pendentes();
  for (const evento of eventos) {
    try {
      await enviar(evento);
    } catch (erro) {
      if (!(erro instanceof MensagemInvalida)) {
        fila.registrarInterrupcao(evento);
        throw erro;
      }
      try {
        await registrarRejeicao(evento, erro.message);
      } catch (falha) {
        fila.registrarInterrupcao(evento);
        throw falha;
      }
      fila.concluir(evento, 'rejeitada');
      console.warn('Detecção rejeitada:', evento.eventoId, erro.message);
      continue;
    }
    fila.concluir(evento, 'sincronizada');
  }
  if (registrarSincronizacao) {
    for (const lote of fila.avisosPendentes()) {
      await registrarSincronizacao(lote);
      fila.confirmarAviso(lote.id);
    }
  }
  return eventos.length;
}
