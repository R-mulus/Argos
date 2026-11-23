import type { RequestHandler } from 'express';
import type { SupabaseClient } from '@supabase/supabase-js';
import type { LocalizacaoML, PredicaoML, PainelML } from '@argos/shared';
import { ApiError } from '../lib/http.js';
import { uuidParam } from '../lib/validation.js';
import { getAuth } from '../middlewares/auth.js';
import { requirePropriedade } from '../services/propriedade.service.js';
import { modelMetrics } from '../services/ml.service.js';
import type { AnaliseML } from '@argos/shared';

export function mlFilter(query: Record<string, unknown>) {
  const animal = uuidParam(query.animal_id, 'animal_id');
  const date = (value: unknown) => {
    if (typeof value !== 'string' || !/T.*(Z|[+-]\d{2}:\d{2})$/.test(value) || !Number.isFinite(Date.parse(value)))
      throw new ApiError(400, 'Informe datas ISO com fuso em inicio e fim.');
    return new Date(value).toISOString();
  };
  const start = date(query.inicio), end = date(query.fim);
  if (Date.parse(end) <= Date.parse(start) || Date.parse(end) - Date.parse(start) > 31 * 86400000)
    throw new ApiError(400, 'Intervalo deve ser positivo e de até 31 dias.');
  const period = query.periodo ?? 'dia';
  if (period !== 'dia' && period !== 'semana' && period !== 'mes') throw new ApiError(400, 'Período inválido.');
  return { animal, start, end, period };
}

interface Scoped { propriedade_id: string; animal_id: string | null }

export async function readSeries<T extends Scoped>(db: SupabaseClient, table: string, propertyId: string, animal: string, start: string, end: string): Promise<T[]> {
  const rows: T[] = [];
  while (true) {
    const { data, error } = await db.from(table).select('*').eq('propriedade_id', propertyId).eq('animal_id', animal)
      .gte('observado_em', start).lt('observado_em', end).order('observado_em').order('id').range(rows.length, rows.length + 499);
    if (error) throw error;
    if (!data?.length) return rows;
    if (data.some(row => row.propriedade_id !== propertyId || row.animal_id !== animal))
      throw new ApiError(403, 'Dados fora do escopo autorizado.', 'FORBIDDEN');
    rows.push(...data as T[]);
    if (rows.length > 10000) throw new ApiError(413, 'Reduza o intervalo: limite de 10 mil amostras.', 'ML_LIMIT');
  }
}

export const painelML: RequestHandler = async (req, res) => {
  const auth = getAuth(res);
  const property = await requirePropriedade(auth);
  const { animal, start, end, period } = mlFilter(req.query);
  const { data: owned, error } = await auth.db.from('animais').select('id').eq('id', animal).eq('propriedade_id', property.id).maybeSingle();
  if (error) throw error;
  if (!owned) throw new ApiError(404, 'Animal não encontrado.');
  const extendedStart = new Date(Date.parse(start) - 120000).toISOString();
  const extendedEnd = new Date(Date.parse(end) + 120000).toISOString();
  const [locations, predictions, models] = await Promise.all([
    readSeries<LocalizacaoML>(auth.db, 'argos_localizacoes', property.id, animal, extendedStart, extendedEnd),
    readSeries<PredicaoML>(auth.db, 'argos_predicoes', property.id, animal, start, end), modelMetrics(property.id),
  ]);
  const warnings: string[] = [];
  // Contrato proposto à Sprint 7: implementação SQL SECURITY INVOKER, nunca fallback Python.
  const { data: analysisData, error: analysisError } = await auth.db.rpc('argos_ml_analise', {
    p_animal_id: animal, p_inicio: start, p_fim: end, p_periodo: period,
  });
  if (analysisError) throw new ApiError(503, 'KPIs SQL indisponíveis. Verifique a implantação da Sprint 7.', 'ML_SQL_UNAVAILABLE');
  if (!analysisData || typeof analysisData !== 'object' || !('resumo' in analysisData)
      || !('movimentacao' in analysisData) || !('comportamentos' in analysisData))
    throw new ApiError(503, 'Contrato de KPIs SQL incompatível.', 'ML_SQL_CONTRACT');
  const analysis = analysisData as AnaliseML;
  const source = process.env.ARGOS_DATA_ORIGIN === 'real' && process.env.ARGOS_CALIBRATION_VALIDATED === '1' ? 'real' : 'experimental';
  if (source === 'experimental') warnings.push('Referencial não validado: posições e indicadores são experimentais.');
  const inPeriod = locations.filter(row => row.observado_em && Date.parse(row.observado_em) >= Date.parse(start) && Date.parse(row.observado_em) < Date.parse(end));
  // Histórico limitado para a visualização; KPIs consideram todas as páginas consultadas.
  const result: PainelML = { ...analysis, animal_id: animal, propriedade_id: property.id, inicio: start, fim: end,
    consultado_em: new Date().toISOString(), origem: source, referencial: process.env.ARGOS_REFERENCE_VERSION || 'development-unvalidated',
    avisos: warnings, historico: inPeriod.slice(-500), historico_total: inPeriod.length,
    historico_truncado: inPeriod.length > 500, previsoes: predictions.slice(-100), modelos: models };
  res.json({ data: result });
};
