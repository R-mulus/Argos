import type { SupabaseClient } from '@supabase/supabase-js';
import type { DeteccaoHistorico } from '@argos/shared';
import type { filtrosDeteccoes } from '../models/deteccao.model.js';

export async function listDeteccoes(
  db: SupabaseClient, propriedadeId: string, filtros: ReturnType<typeof filtrosDeteccoes>,
) {
  const { limit, offset, animalId, zonaId, inicio, fim } = filtros;
  let query = db.from('historico_deteccoes').select('*', { count: 'exact' })
    .eq('propriedade_id', propriedadeId);
  if (animalId) query = query.eq('animal_id', animalId);
  if (zonaId) query = query.eq('zona_id', zonaId);
  if (inicio) query = query.gte('instante_referencia', inicio);
  if (fim) query = query.lt('instante_referencia', fim);
  const { data, count, error } = await query
    .order('instante_referencia', { ascending: false, nullsFirst: false })
    .order('recebido_em', { ascending: false }).order('id', { ascending: true })
    .range(offset, offset + limit - 1).returns<DeteccaoHistorico[]>();
  if (error) throw error;
  return { data: data ?? [], count: count ?? 0, limit, offset };
}
