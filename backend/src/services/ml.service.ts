import type { SupabaseClient } from '@supabase/supabase-js';
import type { AnaliseML, ModeloML, QualidadeML, ResumoPrevisoesML } from '@argos/shared';
import { ApiError } from '../lib/http.js';

type Obj = Record<string, unknown>;
const object = (v: unknown): v is Obj => typeof v==='object' && v!==null && !Array.isArray(v);
const number = (v: unknown): v is number => typeof v==='number' && Number.isFinite(v);
const nullable = (v: unknown) => v===null || number(v);
const coverage = (v: unknown) => number(v) && v>=0 && v<=100;
const date = (v: unknown) => typeof v==='string' && Number.isFinite(Date.parse(v));
const strings = (v: unknown): v is string[] => Array.isArray(v) && v.every(x=>typeof x==='string');
const classes = ['parado','comendo','em_movimento','outro'];
export type AnaliseSQL = AnaliseML & { qualidade: QualidadeML; previsoes: ResumoPrevisoesML };

export function validateAnalysis(value: unknown): AnaliseSQL {
  const fail = () => { throw new ApiError(503,'Contrato da análise SQL incompatível.','ML_SQL_CONTRACT'); };
  if (!object(value)) return fail();
  const {resumo:r,movimentacao:m,comportamentos:c,qualidade:q,previsoes:p}=value;
  if (!object(r)||!object(m)||!object(c)||!object(q)||!object(p)) return fail();
  if (!['distancia_estimada_m','velocidade_media_estimada_m_s','segundos_repouso_aparente','segundos_movimento_aparente','rms_medio_m'].every(k=>nullable(r[k]))
    || !coverage(r.cobertura_percentual)||!Number.isInteger(r.localizacoes)||Number(r.localizacoes)<0) return fail();
  if (m.origem!=='derivado_rssi'||!['dia','semana','mes'].includes(String(m.periodo))||!Array.isArray(m.pontos)) return fail();
  for (const point of m.pontos) {
    if (!object(point)||!date(point.inicio)||!date(point.fim)||Date.parse(String(point.fim))<=Date.parse(String(point.inicio))
      ||!coverage(point.cobertura_percentual)||!nullable(point.distancia_estimada_m)||!nullable(point.velocidade_media_estimada_m_s)
      ||!['segundos_observados','segundos_repouso_aparente','segundos_movimento_aparente','segundos_indeterminados'].every(k=>number(point[k])&&Number(point[k])>=0)
      ||!object(point.movimento_aparente)||!['parado_aparente','em_movimento_aparente','indeterminado'].every(k=>nullable((point.movimento_aparente as Obj)[k]))) return fail();
  }
  if(c.origem!=='observado_validado'||typeof c.disponivel!=='boolean'||!coverage(c.cobertura_percentual)||!object(c.percentuais)) return fail();
  const percentages=c.percentuais;
  if(!classes.every(k=>percentages[k]===null||coverage(percentages[k])))return fail();
  if(c.disponivel ? !classes.every(k=>number(percentages[k]))||Math.abs(classes.reduce((sum,k)=>sum+Number(percentages[k]),0)-100)>0.001
    : !classes.every(k=>percentages[k]===null))return fail();
  if(q.versao_contrato!==1||!strings(q.referenciais)||!strings(q.origens)||!q.origens.every(s=>['real','experimental','synthetic'].includes(s))
    ||!['segundos_sem_cobertura','segundos_indeterminados_observados','localizacoes_excluidas','observacoes_confiaveis'].every(k=>number(q[k])&&Number(q[k])>=0)
    ||!nullable(q.velocidade_maxima_estimada_m_s)||!nullable(q.receptores_minimos))return fail();
  if(!Number.isInteger(p.quantidade)||Number(p.quantidade)<0||typeof p.disponivel!=='boolean'||!nullable(p.horizonte_segundos)
    ||!(p.observado_em===null||date(p.observado_em))||!(p.previsto_para===null||date(p.previsto_para))
    ||!(p.modelo_versao===null||typeof p.modelo_versao==='string')||p.desempenho_validado!==null
    ||!(p.origem===null||['real','experimental','synthetic'].includes(String(p.origem)))
    ||!(p.referencial_versao===null||typeof p.referencial_versao==='string'))return fail();
  return value as unknown as AnaliseSQL;
}

export async function analyze(db: SupabaseClient, params: {animal:string;start:string;end:string;period:string}): Promise<AnaliseSQL> {
  const {data,error}=await db.rpc('argos_ml_analise',{
    p_animal_id:params.animal,p_inicio:params.start,p_fim:params.end,p_periodo:params.period,
  });
  if(error)throw new ApiError(error.code==='42501'?403:503,'Análise SQL indisponível.','ML_SQL_UNAVAILABLE');
  return validateAnalysis(data);
}

export async function modelMetrics(db: SupabaseClient, propertyId: string): Promise<{ models: ModeloML[]; unavailable: boolean }> {
  const {data,error}=await db.from('argos_modelos_ml')
    .select('propriedade_id,task,model_version,approved,approval_status,origem,referencial_versao,training_samples,model_parameters,tensorflow_version,prediction_horizon_minutes,inference_time_ms,evaluation,atualizado_em')
    .eq('propriedade_id',propertyId).order('atualizado_em',{ascending:false}).limit(100);
  if(error) {
    if(['42P01','PGRST205'].includes(error.code))return {models:[],unavailable:true};
    throw new ApiError(503,'Metadados de modelos indisponíveis.','ML_DATABASE_UNAVAILABLE');
  }
  if(data?.some(row=>row.propriedade_id!==propertyId))throw new ApiError(403,'Escopo de modelo inválido.','FORBIDDEN');
  return {models:(data??[]).map(({propriedade_id:_,...row})=>row as ModeloML),unavailable:false};
}
