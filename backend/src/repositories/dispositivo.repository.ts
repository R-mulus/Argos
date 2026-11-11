import type { SupabaseClient } from '@supabase/supabase-js';
import { ApiError } from '../lib/http.js';
import type { DispositivoPayload } from '../models/dispositivo.model.js';

export async function findDispositivo(db: SupabaseClient, propriedadeId: string, id: string) {
  const { data, error } = await db.from('dispositivos')
    .select('*').eq('propriedade_id', propriedadeId).eq('id', id).maybeSingle();
  if (error) throw error;
  return data;
}

export async function listDispositivos(
  db: SupabaseClient, propriedadeId: string, limit: number, offset: number,
  filtros: { tipo?: 'transmissor' | 'receptor'; status?: 'ativo' | 'inativo' },
) {
  let query = db.from('dispositivos')
    .select('*', { count: 'exact' }).eq('propriedade_id', propriedadeId);
  if (filtros.tipo) query = query.eq('tipo', filtros.tipo);
  if (filtros.status) query = query.eq('status', filtros.status);
  const { data, count, error } = await query.order('created_at', { ascending: false })
    .order('id', { ascending: true }).range(offset, offset + limit - 1);
  if (error) throw error;
  return { data: data ?? [], count: count ?? 0, limit, offset };
}

export async function createDispositivo(
  db: SupabaseClient, propriedadeId: string, payload: DispositivoPayload,
) {
  const { data, error } = await db.from('dispositivos')
    .insert({ ...payload, propriedade_id: propriedadeId }).select('*').single();
  if (error) throw error;
  return data;
}

export async function updateDispositivo(
  db: SupabaseClient, propriedadeId: string, id: string, payload: DispositivoPayload,
) {
  const { data, error } = await db.from('dispositivos')
    .update(payload).eq('propriedade_id', propriedadeId).eq('id', id)
    .select('*').maybeSingle();
  if (error) throw error;
  if (!data) throw new ApiError(404, 'Dispositivo não encontrado.', 'NOT_FOUND');
  return data;
}
