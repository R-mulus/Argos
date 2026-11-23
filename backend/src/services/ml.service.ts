import { resolve } from 'node:path';
import { readFile } from 'node:fs/promises';
import type { ModeloML } from '@argos/shared';

/** Só métricas públicas; não retorna scalers, hashes, caminhos ou registros de treino. */
export async function modelMetrics(propertyId: string): Promise<ModeloML[]> {
  return Promise.all((['position', 'behavior'] as const).map(async task => {
    const empty: ModeloML = { task, model_version: null, approved: false, training_samples: 0,
      model_parameters: null, tensorflow_version: null, prediction_horizon_minutes: null, inference_time_ms: null, evaluation: null };
    const directory = process.env[task === 'position' ? 'ARGOS_MODEL_DIR' : 'ARGOS_BEHAVIOR_MODEL_DIR'];
    if (!directory) return empty;
    try {
      const m = JSON.parse(await readFile(resolve(directory, 'manifest.json'), 'utf8')) as Record<string, unknown>;
      if (m.property_id !== propertyId || m.task !== task || m.schema_version !== 2) return empty;
      const number = (key: string) => typeof m[key] === 'number' && Number.isFinite(m[key]) ? m[key] as number : null;
      const e = m.evaluation as Record<string, unknown> | null;
      const evaluation = e ? Object.fromEntries(['mae_m', 'rmse_m', 'classification_accuracy']
        .filter(key => typeof e[key] === 'number' && Number.isFinite(e[key])).map(key => [key, e[key]])) : null;
      return { ...empty, model_version: typeof m.model_version === 'string' ? m.model_version : null,
        approved: m.approved === true && m.source === 'real' && m.reviewed_real_data === true && m.synthetic === false,
        training_samples: number('training_samples') ?? 0, model_parameters: number('model_parameters'),
        tensorflow_version: typeof m.tensorflow_version === 'string' ? m.tensorflow_version : null,
        prediction_horizon_minutes: number('prediction_horizon_minutes'), inference_time_ms: number('inference_time_ms'), evaluation };
    } catch { return empty; }
  }));
}
