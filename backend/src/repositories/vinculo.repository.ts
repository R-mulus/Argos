import type { SupabaseClient } from '@supabase/supabase-js';
import { ApiError } from '../lib/http.js';
import type { FiltrosVinculos, VinculoPayload } from '../models/vinculo.model.js';

export async function findVinculo(db: SupabaseClient, propriedadeId: string, id: string) {
  const { data, error } = await db.from('vinculos')
    .select('*').eq('propriedade_id', propriedadeId).eq('id', id).maybeSingle();
  if (error) throw error;
  return data;
}

export async function listVinculos(
  db: SupabaseClient, propriedadeId: string, limit: number, offset: number, filtros: FiltrosVinculos,
) {
  let query = db.from('vinculos')
    .select('*', { count: 'exact' }).eq('propriedade_id', propriedadeId);
  if (filtros.animal_id) query = query.eq('animal_id', filtros.animal_id);
  if (filtros.transmissor_id) query = query.eq('transmissor_id', filtros.transmissor_id);
  if (filtros.ativo === true) query = query.is('fim_em', null);
  if (filtros.ativo === false) query = query.not('fim_em', 'is', null);
  const { data, count, error } = await query.order('inicio_em', { ascending: false })
    .order('id', { ascending: true }).range(offset, offset + limit - 1);
  if (error) throw error;
  return { data: data ?? [], count: count ?? 0, limit, offset };
}

export async function createVinculo(
  db: SupabaseClient, propriedadeId: string, payload: VinculoPayload,
) {
  const { data, error } = await db.from('vinculos')
    .insert({ ...payload, propriedade_id: propriedadeId }).select('*').single();
  if (error) throw error;
  return data;
}

export async function encerrarVinculo(
  db: SupabaseClient, propriedadeId: string, id: string, fimEm: string,
) {
  const { data, error } = await db.from('vinculos')
    .update({ fim_em: fimEm }).eq('propriedade_id', propriedadeId).eq('id', id)
    .is('fim_em', null).select('*').maybeSingle();
  if (error) throw error;
  if (!data) {
    throw new ApiError(409, 'O vínculo já foi encerrado; atualize a listagem.', 'CONFLICT');
  }
  return data;
}
