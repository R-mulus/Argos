// Contratos propostos para integração no backend de dev. Nenhum servidor HTTP novo.
export type Behavior = 'parado' | 'comendo' | 'em_movimento' | 'outro';
export type Source = 'observado_validado' | 'derivado_rssi' | 'inferido_modelo' | 'previsto_modelo';
export interface Location {
  id: string; propriedade_id: string; transmissor_id: string; animal_id: string | null;
  evento_id: string; x_m: number; y_m: number; erro_residual_m: number;
  receptores_utilizados: number; observado_em: string | null; calculado_em: string;
}
export interface Prediction {
  id: string; propriedade_id: string; animal_id: string; evento_id: string;
  observado_em: string; previsto_para: string; modelo_versao: string;
  atual_x_m: number; atual_y_m: number;
  proximo_x_m: number | null; proximo_y_m: number | null;
  comportamento: Behavior | null; confianca: number | null;
  probabilidades: Record<Behavior, number> | null; criado_em: string;
}
export interface BehaviorDistribution {
  origem: Source; disponivel: boolean; cobertura_percentual: number;
  percentuais: Record<Behavior, number | null>;
}
export interface Movement {
  origem: 'derivado_rssi'; periodo: 'dia' | 'semana' | 'mes';
  pontos: Array<{inicio: string; fim: string; distancia_estimada_m: number | null;
    velocidade_media_estimada_m_s: number | null; cobertura_percentual: number;
    segundos_observados: number; segundos_movimento_aparente: number;
    movimento_aparente: Record<'parado_aparente' | 'em_movimento_aparente' | 'indeterminado', number | null>}>;
}
export interface ModelMetrics {
  model_version: string; approved: boolean; tensorflow_version?: string;
  model_parameters?: number; trained_at?: string; training_samples: number;
  validation_samples?: number; test_samples?: number; prediction_horizon_minutes: number;
  inference_time_ms?: number; evaluation: {
    mae_m?: number; rmse_m?: number; classification_accuracy?: number;
    confusion_matrix?: number[][]; per_class?: Record<string, unknown>;
  } | null;
}
