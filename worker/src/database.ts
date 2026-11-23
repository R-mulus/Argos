import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import { PermanentError, log, type Detection, type DetectionRow, type Repository, type Notice } from './types.js';

interface Device { id: string; propriedade_id: string; tipo: string; status: string }
interface Link { id: string; inicio_em: string; fim_em: string | null }
interface ApiError { code?: string; message: string }

function fail(error: ApiError): never {
  // Erros de autenticação/schema são operacionais: preservar e tentar após correção.
  if (['23503', '23514', '23502', '22P02', 'P0001'].includes(error.code ?? ''))
    throw new PermanentError(`banco_rejeitou:${error.code}`);
  throw new Error(`supabase:${error.code || 'rede_ou_http'}`);
}
class Cache<T> {
  private values = new Map<string, { value: T; expires: number }>();
  constructor(private ttl: number, private max = 1024) {}
  get(key: string): T | undefined {
    const item = this.values.get(key);
    if (!item || item.expires <= Date.now()) { this.values.delete(key); return undefined; }
    return item.value;
  }
  set(key: string, value: T) {
    if (!this.ttl) return;
    if (this.values.size >= this.max) this.values.delete(this.values.keys().next().value!);
    this.values.set(key, { value, expires: Date.now() + this.ttl });
  }
}
export function mapDetection(event: Detection, tx: Device | undefined, rx: Device | undefined, link: string | null): DetectionRow {
  if (!tx || !rx) throw new PermanentError('dispositivo_desconhecido');
  if (tx.tipo !== 'transmissor' || rx.tipo !== 'receptor') throw new PermanentError('tipo_incorreto');
  if (tx.status !== 'ativo' || rx.status !== 'ativo') throw new PermanentError('dispositivo_inativo');
  if (tx.propriedade_id !== event.propertyId || rx.propriedade_id !== event.propertyId)
    throw new PermanentError('propriedade_incompativel');
  return {
    propriedade_id: event.propertyId, receptor_id: event.receiverId, transmissor_id: event.transmitterId,
    evento_id: event.eventId, rssi_dbm: event.rssi, bateria_percentual: event.battery,
    detectado_em: event.observedAt, recebido_no_gateway_em: event.receivedAt,
    vinculo_id: event.observedAt ? link : null, zona_id: null,
  };
}
export class SupabaseRepository implements Repository {
  readonly client: SupabaseClient;
  async notify(notice: Notice): Promise<void> {
    // Mesmo contrato da central; não cria alerta para receptor de outra propriedade.
    if (notice.dispositivo_id) {
      const { data, error } = await this.client.from('dispositivos').select('id').eq('id', notice.dispositivo_id)
        .eq('propriedade_id', notice.propriedade_id).eq('tipo','receptor').maybeSingle();
      if (error) fail(error);
      if (!data) return;
    } else {
      const { data, error } = await this.client.from('propriedades').select('id').eq('id',notice.propriedade_id).maybeSingle();
      if (error) fail(error);
      if (!data) return;
    }
    const { error } = await this.client.from('alertas').upsert(notice,
      { onConflict:'propriedade_id,origem_evento',ignoreDuplicates:true });
    if (error) fail(error);
  }
  private devices: Cache<Device>;
  private links: Cache<{ id: string | null }>;
  private heartbeats = new Map<string, number>();
  constructor(url: string, key: string, timeoutMs = 10000, cacheMs = 10000, fetcher: typeof fetch = fetch) {
    this.devices = new Cache(cacheMs); this.links = new Cache(cacheMs);
    this.client = createClient(url, key, {
      auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
      global: { fetch: (input, init) => fetcher(input, { ...init, signal: init?.signal
        ? AbortSignal.any([init.signal, AbortSignal.timeout(timeoutMs)]) : AbortSignal.timeout(timeoutMs) }) },
    });
  }
  async prepare(event: Detection): Promise<DetectionRow> {
    const missing = [event.transmitterId, event.receiverId].filter(id => !this.devices.get(id));
    const loaded = new Map<string, Device>();
    if (missing.length) {
      const { data, error } = await this.client.from('dispositivos').select('id,propriedade_id,tipo,status').in('id', missing);
      if (error) fail(error);
      for (const device of (data ?? []) as Device[]) { loaded.set(device.id, device); this.devices.set(device.id, device); }
    }
    const tx = loaded.get(event.transmitterId) ?? this.devices.get(event.transmitterId);
    const rx = loaded.get(event.receiverId) ?? this.devices.get(event.receiverId);
    const row = mapDetection(event, tx, rx, null);
    if (!event.observedAt) return row;
    const cacheKey = `${event.propertyId}:${event.transmitterId}:${event.observedAt}`;
    let link = this.links.get(cacheKey);
    if (!link) {
      const { data, error } = await this.client.from('vinculos').select('id,inicio_em,fim_em')
        .eq('propriedade_id', event.propertyId).eq('transmissor_id', event.transmitterId)
        .lte('inicio_em', event.observedAt).or(`fim_em.is.null,fim_em.gt.${event.observedAt}`).limit(2);
      if (error) fail(error);
      if ((data?.length ?? 0) > 1) throw new PermanentError('vinculo_historico_ambiguo');
      link = { id: (data as Link[] | null)?.[0]?.id ?? null }; this.links.set(cacheKey, link);
    }
    row.vinculo_id = link.id;
    return row;
  }
  async insert(rows: DetectionRow[]): Promise<void> {
    if (!rows.length) return;
    const { error } = await this.client.from('deteccoes').upsert(rows, {
      onConflict: 'receptor_id,evento_id', ignoreDuplicates: true, defaultToNull: false,
    });
    if (error) fail(error);
    // Compatibilidade com o monitoramento de dispositivos; atualização monotônica,
    // limitada a uma por minuto por dispositivo, fora da garantia principal da detecção.
    const latest = new Map<string, string>();
    for (const row of rows) {
      for (const [id, at] of [[row.receptor_id, row.recebido_no_gateway_em], [row.transmissor_id, row.detectado_em]]) {
        if (id && at && (!latest.has(id) || at > latest.get(id)!)) latest.set(id, at);
      }
    }
    const groups = new Map<string, string[]>();
    for (const [id, at] of latest) {
      if (Date.parse(at) - (this.heartbeats.get(id) ?? 0) < 60000) continue;
      groups.set(at, [...(groups.get(at) ?? []), id]);
    }
    for (const [at, ids] of groups) {
      const { error: heartbeatError } = await this.client.from('dispositivos')
        .update({ ultima_comunicacao_em: at }).in('id', ids)
        .or(`ultima_comunicacao_em.is.null,ultima_comunicacao_em.lt.${at}`);
      if (heartbeatError) { log('comunicacao_nao_atualizada', { code: heartbeatError.code }); continue; }
      for (const id of ids) {
        if (this.heartbeats.size >= 1024) this.heartbeats.delete(this.heartbeats.keys().next().value!);
        this.heartbeats.set(id, Date.parse(at));
      }
    }
  }
}
