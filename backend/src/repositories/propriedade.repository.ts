import type { SupabaseClient } from '@supabase/supabase-js';
import { ApiError } from '../lib/http.js';
import type { PropriedadePayload } from '../models/propriedade.model.js';

export async function findMinhaPropriedade(db: SupabaseClient, userId: string) {
  const { data, error } = await db.from('propriedades')
    .select('*').eq('usuario_id', userId).maybeSingle();
  if (error) throw error;
  return data;
}

export async function createPropriedade(db: SupabaseClient, userId: string, body: PropriedadePayload) {
  const { data, error } = await db.from('propriedades')
    .insert({ ...body, usuario_id: userId }).select('*').single();
  if (error) throw error;
  return data;
}

export async function updatePropriedade(
  db: SupabaseClient, userId: string, body: PropriedadePayload,
) {
  const { data, error } = await db.from('propriedades')
    .update(body).eq('usuario_id', userId).select('*').maybeSingle();
  if (error) throw error;
  if (!data) throw new ApiError(404, 'Propriedade não encontrada.', 'NOT_FOUND');
  return data;
}
