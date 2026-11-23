import type { RequestHandler } from 'express';
import type { SupabaseClient } from '@supabase/supabase-js';
import type { LocalizacaoML, PredicaoML, PainelML } from '@argos/shared';
import { ApiError } from '../lib/http.js';
import { uuidParam } from '../lib/validation.js';
import { getAuth } from '../middlewares/auth.js';
import { requirePropriedade } from '../services/propriedade.service.js';
import { analyze, modelMetrics } from '../services/ml.service.js';

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

export async function readHistory<T extends Scoped>(db: SupabaseClient, table: string, propertyId: string, animal: string, start: string, end: string, limit: number): Promise<{rows:T[];total:number}> {
    const { data, count, error } = await db.from(table).select('*',{count:'exact'}).eq('propriedade_id', propertyId).eq('animal_id', animal)
      .gte('observado_em', start).lt('observado_em', end).order('observado_em',{ascending:false}).order('id',{ascending:false}).range(0,limit-1);
    if (error) throw new ApiError(503,'Histórico indisponível.','ML_DATABASE_UNAVAILABLE');
    if (data?.some(row => row.propriedade_id !== propertyId || row.animal_id !== animal))
      throw new ApiError(403, 'Dados fora do escopo autorizado.', 'FORBIDDEN');
    if(count===null)throw new ApiError(503,'Contagem do histórico indisponível.','ML_DATABASE_UNAVAILABLE');
    return {rows:((data??[]) as T[]).reverse(),total:count};
}

export const painelML: RequestHandler = async (req, res) => {
 try {
  const auth = getAuth(res);
  const property = await requirePropriedade(auth);
  const { animal, start, end, period } = mlFilter(req.query);
  const { data: owned, error } = await auth.db.from('animais').select('id').eq('id', animal).eq('propriedade_id', property.id).maybeSingle();
  if (error) throw error;
  if (!owned) throw new ApiError(404, 'Animal não encontrado.');
  const [locationPage, predictionPage, registry, analysis] = await Promise.all([
    readHistory<LocalizacaoML>(auth.db, 'argos_localizacoes', property.id, animal, start, end,500),
    readHistory<PredicaoML>(auth.db, 'argos_predicoes', property.id, animal, start, end,100), modelMetrics(auth.db,property.id),
    analyze(auth.db,{animal,start,end,period}),
  ]);
  const locations=locationPage.rows, predictions=predictionPage.rows;
  const warnings: string[] = [];
  if(registry.unavailable)warnings.push('Registro de modelos indisponível; verifique a migration de metadados.');
  const origins=new Set([...analysis.qualidade.origens,...locations.map(r=>r.origem),...predictions.map(r=>r.origem)]);
  const source=origins.size===1 && origins.has('real') ? 'real' : origins.size===1 && origins.has('synthetic') ? 'synthetic' : 'experimental';
  if (source === 'experimental') warnings.push('Referencial não validado: posições e indicadores são experimentais.');
  const inPeriod = locations.filter(row => row.observado_em && Date.parse(row.observado_em) >= Date.parse(start) && Date.parse(row.observado_em) < Date.parse(end));
  const references=[...new Set([...analysis.qualidade.referenciais,...locations.map(r=>r.referencial_versao),...predictions.map(r=>r.referencial_versao)].filter((r):r is string=>typeof r==='string'&&r.length>0))];
  if(origins.size>1)warnings.push('Origens distintas no período; consulte a proveniência de cada registro.');
  const latest=inPeriod.at(-1)?.observado_em??null;
  if(latest && Date.now()-Date.parse(latest)>300000)warnings.push('Última localização do período tem mais de cinco minutos; histórico preservado.');
  // Histórico limitado para visualização; a RPC calcula os KPIs do período completo.
  const result: PainelML = { ...analysis, animal_id: animal, propriedade_id: property.id, inicio: start, fim: end,
    consultado_em: new Date().toISOString(), origem: source, referencial: references.length===1?references[0]!:'indisponivel-ou-multiplos',
    avisos: warnings, historico: inPeriod, historico_total: locationPage.total,
    historico_truncado: locationPage.total > 500, previsoes: predictions, modelos: registry.models,
    qualidade:analysis.qualidade,resumo_previsoes:analysis.previsoes,
    previsoes_total:predictionPage.total,previsoes_truncadas:predictionPage.total>100,ultima_observacao_em:latest };
  res.json({ data: result });
 } catch(error) {
   if(error instanceof ApiError)throw error;
   throw new ApiError(503,'Banco de análises indisponível.','ML_DATABASE_UNAVAILABLE');
 }
};
