import { InvalidDetection, type Detection } from './types.js';

export const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;
export const TOPIC_FILTER = 'argos/v1/propriedades/+/receptores/+/deteccoes';
const fields = ['versao', 'evento_id', 'transmissor_id', 'rssi_dbm', 'bateria_percentual', 'detectado_em'];
const decoder = new TextDecoder('utf-8', { fatal: true });

export function parseDetection(topic: string, payload: Uint8Array, receivedAt = new Date()): Detection {
  const parts = topic.split('/');
  const propertyId = parts[3] ?? '', receiverId = parts[5] ?? '';
  if (parts.length !== 7 || parts[0] !== 'argos' || parts[1] !== 'v1' || parts[2] !== 'propriedades' ||
      parts[4] !== 'receptores' || parts[6] !== 'deteccoes' || !UUID.test(propertyId) || !UUID.test(receiverId))
    throw new InvalidDetection('topico_invalido');
  if (!payload.length || payload.length > 4096) throw new InvalidDetection('tamanho_invalido');
  let body: Record<string, unknown>;
  try {
    const parsed: unknown = JSON.parse(decoder.decode(payload));
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) throw new Error();
    body = parsed as Record<string, unknown>;
  } catch { throw new InvalidDetection('json_invalido'); }
  if (Object.keys(body).length !== fields.length || fields.some(k => !(k in body))) throw new InvalidDetection('campos_invalidos');
  if (body.versao !== 1 || typeof body.transmissor_id !== 'string' || !UUID.test(body.transmissor_id))
    throw new InvalidDetection('versao_ou_transmissor_invalido');
  // Formato exato emitido pelo firmware: não aceitar evento de outro transmissor.
  if (typeof body.evento_id !== 'string') throw new InvalidDetection('evento_invalido');
  const event = body.evento_id.split(':');
  const sequence = event[2] ?? '', nonce = event[1] ?? '';
  if (event.length !== 3 || event[0] !== body.transmissor_id || !/^[0-9a-f]{16}$/.test(nonce) ||
      nonce === '0000000000000000' || !/^[1-9][0-9]{0,9}$/.test(sequence) || Number(sequence) > 0xffffffff)
    throw new InvalidDetection('evento_invalido');
  if (!Number.isInteger(body.rssi_dbm) || Number(body.rssi_dbm) < -127 || Number(body.rssi_dbm) > 0)
    throw new InvalidDetection('rssi_invalido');
  if (body.bateria_percentual !== null && (!Number.isInteger(body.bateria_percentual) ||
      Number(body.bateria_percentual) < 0 || Number(body.bateria_percentual) > 100)) throw new InvalidDetection('bateria_invalida');
  let observedAt: string | null = null;
  if (body.detectado_em !== null) {
    if (typeof body.detectado_em !== 'string' || !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}Z$/.test(body.detectado_em))
      throw new InvalidDetection('horario_invalido');
    const time = Date.parse(body.detectado_em);
    if (!Number.isFinite(time) || time < 1700000000000 || new Date(time).toISOString() !== body.detectado_em.replace('Z', '.000Z') ||
        time > receivedAt.getTime() + 60000) throw new InvalidDetection('horario_invalido');
    observedAt = new Date(time).toISOString();
  }
  return { propertyId, receiverId, transmitterId: body.transmissor_id, eventId: body.evento_id,
    rssi: body.rssi_dbm as number, battery: body.bateria_percentual as number | null,
    observedAt, receivedAt: receivedAt.toISOString() };
}
