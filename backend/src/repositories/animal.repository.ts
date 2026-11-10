import type { SupabaseClient } from '@supabase/supabase-js';
import { ApiError } from '../lib/http.js';
import type { AnimalPayload } from '../models/animal.model.js';

export async function findAnimal(db: SupabaseClient, propriedadeId: string, id: string) {
  const { data, error } = await db.from('animais')
    .select('*').eq('propriedade_id', propriedadeId).eq('id', id).maybeSingle();
  if (error) throw error;
  return data;
}

export async function listAnimais(db: SupabaseClient, propriedadeId: string, limit: number, offset: number) {
  const { data, count, error } = await db.from('animais')
    .select('*', { count: 'exact' })
    .eq('propriedade_id', propriedadeId)
    .order('created_at', { ascending: false })
    .order('id', { ascending: true })
    .range(offset, offset + limit - 1);
  if (error) throw error;
  return { data: data ?? [], count: count ?? 0, limit, offset };
}

export async function createAnimal(db: SupabaseClient, propriedadeId: string, body: AnimalPayload) {
  const { data, error } = await db.from('animais')
    .insert({ ...body, propriedade_id: propriedadeId }).select('*').single();
  if (error) throw error;
  return data;
}

export async function updateAnimal(
  db: SupabaseClient, propriedadeId: string, id: string, body: AnimalPayload,
) {
  const { data, error } = await db.from('animais')
    .update(body).eq('propriedade_id', propriedadeId).eq('id', id).select('*').maybeSingle();
  if (error) throw error;
  if (!data) throw new ApiError(404, 'Animal não encontrado.', 'NOT_FOUND');
  return data;
}
