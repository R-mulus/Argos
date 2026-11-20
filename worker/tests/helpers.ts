import type { Detection } from '../src/types.js';
export const property = '11111111-1111-4111-8111-111111111111';
export const tx = '22222222-2222-4222-8222-222222222222';
export const receivers = [1, 2, 3].map(n => `33333333-3333-4333-8333-${String(n).padStart(12, '0')}`);
export const topic = (rx = receivers[0]!) => `argos/v1/propriedades/${property}/receptores/${rx}/deteccoes`;
export function payload(sequence = 1, observed: string | null = null) {
  return { versao: 1, evento_id: `${tx}:0123456789abcdef:${sequence}`, transmissor_id: tx,
    rssi_dbm: -65, bateria_percentual: null, detectado_em: observed };
}
export function event(sequence = 1, rx = receivers[0]!): Detection {
  return { propertyId: property, receiverId: rx, transmitterId: tx, eventId: payload(sequence).evento_id,
    rssi: -65, battery: null, observedAt: null, receivedAt: '2026-11-20T15:00:00.000Z' };
}
