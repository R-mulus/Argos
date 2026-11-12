import { TextDecoder } from 'node:util';

// Contrato v1: uma leitura de RSSI feita por um receptor ESP32.
// A identidade do receptor e da propriedade vem do tópico, não do JSON.
export type DeteccaoMqtt = {
  propriedadeId: string;
  receptorId: string;
  transmissorId: string;
  eventoId: string;
  rssiDbm: number;
  bateriaPercentual: number | null;
  detectadoEm: string | null;
  recebidoEm: string;
};

export class MensagemInvalida extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'MensagemInvalida';
  }
}

const ID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const EVENTO = /^[a-zA-Z0-9._:-]{1,160}$/;
const textDecoder = new TextDecoder('utf-8', { fatal: true });
const maxPayload = 4096;

export const TOPICO_DETECCOES = 'argos/v1/propriedades/+/receptores/+/deteccoes';

export function parseDeteccaoMqtt(
  topic: string, payload: Uint8Array, agora = new Date(),
): DeteccaoMqtt {
  const parts = topic.split('/');
  if (parts.length !== 7 || parts[0] !== 'argos' || parts[1] !== 'v1' ||
      parts[2] !== 'propriedades' || parts[4] !== 'receptores' ||
      parts[6] !== 'deteccoes' || !ID.test(parts[3]) || !ID.test(parts[5])) {
    throw new MensagemInvalida('Tópico MQTT não corresponde ao contrato Argos v1.');
  }
  if (payload.byteLength < 2 || payload.byteLength > maxPayload) {
    throw new MensagemInvalida('JSON MQTT excede 4096 bytes ou está vazio.');
  }
  let body: Record<string, unknown>;
  try {
    const raw: unknown = JSON.parse(textDecoder.decode(payload));
    if (!raw || typeof raw !== 'object' || Array.isArray(raw)) throw new Error('JSON inválido');
    body = raw as Record<string, unknown>;
  } catch {
    throw new MensagemInvalida('Corpo MQTT deve ser um objeto JSON UTF-8 válido.');
  }
  const allowed = ['versao', 'evento_id', 'transmissor_id', 'rssi_dbm', 'bateria_percentual', 'detectado_em'];
  if (Object.keys(body).some((key) => !allowed.includes(key))) {
    throw new MensagemInvalida('O pacote MQTT contém campos não reconhecidos.');
  }
  if (body.versao !== 1 || typeof body.evento_id !== 'string' ||
      !EVENTO.test(body.evento_id)) {
    throw new MensagemInvalida('versao deve ser 1 e evento_id deve ser estável e válido.');
  }
  if (typeof body.transmissor_id !== 'string' || !ID.test(body.transmissor_id)) {
    throw new MensagemInvalida('transmissor_id deve ser UUID válido.');
  }
  if (typeof body.rssi_dbm !== 'number' || !Number.isInteger(body.rssi_dbm) ||
      body.rssi_dbm < -127 || body.rssi_dbm > 0) {
    throw new MensagemInvalida('rssi_dbm deve ser inteiro entre -127 e 0.');
  }
  const bateria = body.bateria_percentual;
  if (bateria !== undefined && bateria !== null &&
      (typeof bateria !== 'number' || !Number.isInteger(bateria) || bateria < 0 || bateria > 100)) {
    throw new MensagemInvalida('bateria_percentual deve estar entre 0 e 100.');
  }
  const timestamp = body.detectado_em;
  let detectadoEm: string | null = null;
  if (timestamp !== undefined && timestamp !== null) {
    if (typeof timestamp !== 'string' ||
        !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{1,6})?(?:Z|[+-]\d{2}:\d{2})$/.test(timestamp)) {
      throw new MensagemInvalida('detectado_em deve ser timestamp ISO 8601 com fuso horário.');
    }
    const millis = Date.parse(timestamp);
    if (!Number.isFinite(millis) || millis > agora.getTime() + 60_000) {
      throw new MensagemInvalida('detectado_em inválido ou no futuro além de 60 segundos.');
    }
    detectadoEm = new Date(millis).toISOString();
  }
  return {
    propriedadeId: parts[3].toLowerCase(),
    receptorId: parts[5].toLowerCase(),
    transmissorId: body.transmissor_id.toLowerCase(),
    eventoId: body.evento_id,
    rssiDbm: body.rssi_dbm,
    bateriaPercentual: typeof bateria === 'number' ? bateria : null,
    detectadoEm,
    recebidoEm: agora.toISOString(),
  };
}
