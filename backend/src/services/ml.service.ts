import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { resolve } from 'node:path';
import { readFile } from 'node:fs/promises';
import type { AnaliseML, ModeloML } from '@argos/shared';
import { ApiError } from '../lib/http.js';

const mlDirectory = fileURLToPath(new URL('../../../ml/', import.meta.url));
let running = 0;

/** Reutiliza os cálculos Python via stdin; nenhum HTTP paralelo ou credencial administrativa. */
export async function analyze(payload: object): Promise<AnaliseML> {
  if (running >= 2) throw new ApiError(429, 'Análises ocupadas. Tente novamente.', 'ML_BUSY');
  const input = JSON.stringify(payload);
  if (Buffer.byteLength(input) > 8 * 1024 * 1024) throw new ApiError(413, 'Reduza o intervalo da análise.', 'ML_LIMIT');
  running++;
  try {
    return await new Promise<AnaliseML>((accept, reject) => {
      const python = process.env.ARGOS_ML_PYTHON || resolve(mlDirectory, '.venv', process.platform === 'win32' ? 'Scripts/python.exe' : 'bin/python');
      const child = spawn(python, ['-m', 'argos_ml.bridge'], { cwd: mlDirectory, shell: false, windowsHide: true,
        stdio: ['pipe', 'pipe', 'ignore'], env: { ...process.env, PYTHONIOENCODING: 'utf-8' } });
      let output = '';
      const timer = setTimeout(() => { child.kill(); reject(new ApiError(503, 'Análise excedeu o tempo disponível.', 'ML_TIMEOUT')); }, 15000);
      child.on('error', () => { clearTimeout(timer); reject(new ApiError(503, 'Processador de análises indisponível.', 'ML_UNAVAILABLE')); });
      child.stdin.on('error', () => { /* Encerramento é tratado em error/close. */ });
      child.stdout.on('data', (chunk: Buffer) => {
        output += chunk.toString('utf8');
        if (Buffer.byteLength(output) > 2 * 1024 * 1024) child.kill();
      });
      child.on('close', code => {
        clearTimeout(timer);
        if (code !== 0) { reject(new ApiError(503, 'Não foi possível calcular a análise.', 'ML_UNAVAILABLE')); return; }
        try { accept(JSON.parse(output) as AnaliseML); }
        catch { reject(new ApiError(503, 'Resposta de análise inválida.', 'ML_UNAVAILABLE')); }
      });
      child.stdin.end(input);
    });
  } finally { running--; }
}

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
