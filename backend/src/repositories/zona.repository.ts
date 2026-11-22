import type { SupabaseClient } from '@supabase/supabase-js';
import { ApiError } from '../lib/http.js';
import type { ZonaPayload } from '../models/zona.model.js';

export async function findZona(db: SupabaseClient, propriedadeId: string, id: string) {
  const { data, error } = await db.from('zonas')
    .select('*').eq('propriedade_id', propriedadeId).eq('id', id).maybeSingle();
  if (error) throw error;
  return data;
}

export async function listZonas(
  db: SupabaseClient, propriedadeId: string, limit: number, offset: number, ativa?: boolean,
) {
  let query = db.from('zonas')
    .select('*', { count: 'exact' }).eq('propriedade_id', propriedadeId);
  if (ativa !== undefined) query = query.eq('ativa', ativa);
  const { data, count, error } = await query.order('nome', { ascending: true })
    .order('id', { ascending: true }).range(offset, offset + limit - 1);
  if (error) throw error;
  return { data: data ?? [], count: count ?? 0, limit, offset };
}

export async function createZona(db: SupabaseClient, propriedadeId: string, payload: ZonaPayload) {
  const { data, error } = await db.from('zonas')
    .insert({ ...payload, propriedade_id: propriedadeId }).select('*').single();
  if (error) throw error;
  return data;
}

export async function updateZona(
  db: SupabaseClient, propriedadeId: string, id: string, payload: ZonaPayload,
) {
  const { data, error } = await db.from('zonas')
    .update(payload).eq('propriedade_id', propriedadeId).eq('id', id)
    .select('*').maybeSingle();
  if (error) throw error;
  if (!data) throw new ApiError(404, 'Zona não encontrada.', 'NOT_FOUND');
  return data;
}
