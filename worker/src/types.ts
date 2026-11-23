export interface Detection {
  propertyId: string;
  receiverId: string;
  transmitterId: string;
  eventId: string;
  rssi: number;
  battery: number | null;
  observedAt: string | null;
  receivedAt: string;
}
export interface DetectionRow {
  propriedade_id: string;
  receptor_id: string;
  transmissor_id: string;
  evento_id: string;
  rssi_dbm: number;
  bateria_percentual: number | null;
  detectado_em: string | null;
  recebido_no_gateway_em: string;
  vinculo_id: string | null;
  zona_id: null;
}
export interface Repository {
  prepare(event: Detection): Promise<DetectionRow>;
  insert(rows: DetectionRow[]): Promise<void>;
  notify?(notice: Notice): Promise<void>;
}
export interface Notice {
  propriedade_id: string; origem_evento: string; tipo: 'sincronizacao_concluida' | 'deteccao_rejeitada';
  titulo: string; descricao: string; prioridade: 'baixa' | 'media'; dispositivo_id?: string;
}
export class InvalidDetection extends Error {}
export class PermanentError extends Error {}
export type Log = (event: string, fields?: Record<string, unknown>) => void;
export const log: Log = (event, fields = {}) => console.log(JSON.stringify({ time: new Date().toISOString(), event, ...fields }));
