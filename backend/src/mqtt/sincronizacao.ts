import { MensagemInvalida, type DeteccaoMqtt } from './contract.js';
import type { FilaDeteccoes } from './fila.js';

export async function sincronizarLote(
  fila: FilaDeteccoes,
  enviar: (evento: DeteccaoMqtt) => Promise<unknown>,
): Promise<number> {
  const eventos = fila.pendentes();
  for (const evento of eventos) {
    try {
      await enviar(evento);
    } catch (erro) {
      if (!(erro instanceof MensagemInvalida)) throw erro;
      fila.concluir(evento, 'rejeitada');
      console.warn('Detecção rejeitada:', evento.eventoId, erro.message);
      continue;
    }
    fila.concluir(evento, 'sincronizada');
  }
  return eventos.length;
}
