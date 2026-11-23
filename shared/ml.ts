export type OrigemML = 'experimental' | 'real' | 'synthetic';
export type ClasseML = 'parado' | 'comendo' | 'em_movimento' | 'outro';
export interface LocalizacaoML {
  origem?: OrigemML | null; referencial_versao?: string | null; calibracao_sha256?: string | null;
  id: string; propriedade_id: string; animal_id: string | null; transmissor_id: string;
  evento_id: string; observado_em: string | null; x_m: number; y_m: number;
  erro_residual_m: number; receptores_utilizados: number;
}
export interface PredicaoML {
  origem?: OrigemML | null; referencial_versao?: string | null; calibracao_sha256?: string | null;
  id: string; propriedade_id: string; animal_id: string; evento_id: string;
  observado_em: string; previsto_para: string; modelo_versao: string;
  atual_x_m: number | null; atual_y_m: number | null;
  proximo_x_m: number | null; proximo_y_m: number | null;
  comportamento: ClasseML | null; confianca: number | null;
  probabilidades: Record<ClasseML, number> | null;
}
export interface ComportamentosML {
  origem: 'observado_validado'; disponivel: boolean; cobertura_percentual: number;
  percentuais: Record<ClasseML, number | null>;
}
export interface AnaliseML {
  resumo: { distancia_estimada_m: number | null; velocidade_media_estimada_m_s: number | null;
    segundos_repouso_aparente: number | null; segundos_movimento_aparente: number | null;
    cobertura_percentual: number; localizacoes: number; rms_medio_m: number | null };
  movimentacao: { origem: 'derivado_rssi'; periodo: 'dia' | 'semana' | 'mes'; pontos: Array<{
    inicio: string; fim: string; distancia_estimada_m: number | null;
    velocidade_media_estimada_m_s: number | null; cobertura_percentual: number;
    segundos_observados: number; segundos_repouso_aparente: number; segundos_movimento_aparente: number;
    segundos_indeterminados: number; movimento_aparente: Record<string, number | null>;
  }> };
  comportamentos: ComportamentosML;
}
export interface ModeloML {
  approval_status?: 'demo_approved' | 'production_approved'; origem?: OrigemML;
  referencial_versao?: string; atualizado_em?: string;
  task: 'position' | 'behavior'; model_version: string | null; approved: boolean;
  training_samples: number; model_parameters: number | null; tensorflow_version: string | null;
  prediction_horizon_minutes: number | null; inference_time_ms: number | null;
  evaluation: {mae_m?: number; rmse_m?: number; classification_accuracy?: number} | null;
}
export interface PainelML extends AnaliseML {
  qualidade?: QualidadeML; resumo_previsoes?: ResumoPrevisoesML;
  previsoes_total?: number; previsoes_truncadas?: boolean;
  ultima_observacao_em?: string | null;
  animal_id: string; propriedade_id: string; inicio: string; fim: string; consultado_em: string;
  origem: OrigemML; referencial: string; avisos: string[];
  historico: LocalizacaoML[]; historico_total: number; historico_truncado: boolean;
  previsoes: PredicaoML[]; modelos: ModeloML[];
}

export interface QualidadeML {
  versao_contrato: 1; segundos_sem_cobertura: number; segundos_indeterminados_observados: number;
  velocidade_maxima_estimada_m_s: number | null; localizacoes_excluidas: number;
  receptores_minimos: number | null; referenciais: string[]; origens: OrigemML[];
  observacoes_confiaveis: number;
}
export interface ResumoPrevisoesML {
  quantidade: number; disponivel: boolean; observado_em: string | null; previsto_para: string | null;
  horizonte_segundos: number | null; modelo_versao: string | null; origem: OrigemML | null;
  referencial_versao: string | null; desempenho_validado: null;
}
