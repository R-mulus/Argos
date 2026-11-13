import type { SupabaseClient } from '@supabase/supabase-js';
import type { ResumoMonitoramento } from '@argos/shared';

export async function buscarResumoMonitoramento(db: SupabaseClient, propriedadeId: string) {
  const { data, error } = await db.rpc('resumo_monitoramento', {
    p_propriedade: propriedadeId,
  }).returns<ResumoMonitoramento>();
  if (error) throw error;
  return data;
}
