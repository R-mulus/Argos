import { ApiError } from '../lib/http.js';
import { objectBody } from '../lib/validation.js';

/** Limites do sistema local em metros, os mesmos de argos_posicoes_receptores. */
const LIMITE_M = 1_000_000;
const MAX_VERTICES = 200;

function numero(valor: unknown, nome: string, min: number, max: number, maxExclusivo = false): number {
  if (typeof valor !== 'number' || !Number.isFinite(valor) || valor < min || (maxExclusivo ? valor >= max : valor > max)) {
    throw new ApiError(400, `${nome} deve ser número entre ${min} e ${max}${maxExclusivo ? ' (exclusivo)' : ''}.`);
  }
  return valor;
}

export type ReferenciaEspacialDados =
  | { modo: 'geografico'; origem_latitude: number; origem_longitude: number; azimute_eixo_y_graus: number;
      planta_url: null; planta_x_min_m: null; planta_y_min_m: null; planta_x_max_m: null; planta_y_max_m: null }
  | { modo: 'planta'; origem_latitude: null; origem_longitude: null; azimute_eixo_y_graus: number;
      planta_url: string; planta_x_min_m: number; planta_y_min_m: number; planta_x_max_m: number; planta_y_max_m: number };

/**
 * Referência espacial da propriedade. No modo geográfico a origem do sistema local é uma posição
 * medida em campo; no modo planta só há metros, sem latitude/longitude.
 */
export function parseReferenciaEspacial(valor: unknown): ReferenciaEspacialDados {
  const b = objectBody(valor, [
    'modo', 'origem_latitude', 'origem_longitude', 'azimute_eixo_y_graus',
    'planta_url', 'planta_x_min_m', 'planta_y_min_m', 'planta_x_max_m', 'planta_y_max_m',
  ]);
  const azimute = b.azimute_eixo_y_graus === undefined ? 0 : numero(b.azimute_eixo_y_graus, 'azimute_eixo_y_graus', 0, 360, true);
  if (b.modo === 'geografico') {
    const extras = ['planta_url', 'planta_x_min_m', 'planta_y_min_m', 'planta_x_max_m', 'planta_y_max_m'].filter(k => b[k] != null);
    if (extras.length) throw new ApiError(400, `Campos da planta não se aplicam ao modo geográfico: ${extras.join(', ')}.`);
    return {
      modo: 'geografico',
      origem_latitude: numero(b.origem_latitude, 'origem_latitude', -85, 85),
      origem_longitude: numero(b.origem_longitude, 'origem_longitude', -180, 180),
      azimute_eixo_y_graus: azimute,
      planta_url: null, planta_x_min_m: null, planta_y_min_m: null, planta_x_max_m: null, planta_y_max_m: null,
    };
  }
  if (b.modo === 'planta') {
    if (b.origem_latitude != null || b.origem_longitude != null) {
      throw new ApiError(400, 'O modo planta não usa latitude/longitude.');
    }
    const url = b.planta_url;
    if (typeof url !== 'string' || url.length > 2048 || !/^https:\/\/\S+$/.test(url.trim())) {
      throw new ApiError(400, 'planta_url deve ser um endereço https de até 2048 caracteres.');
    }
    try {
      new URL(url.trim());
    } catch {
      throw new ApiError(400, 'planta_url inválida.');
    }
    const xMin = numero(b.planta_x_min_m, 'planta_x_min_m', -LIMITE_M, LIMITE_M);
    const yMin = numero(b.planta_y_min_m, 'planta_y_min_m', -LIMITE_M, LIMITE_M);
    const xMax = numero(b.planta_x_max_m, 'planta_x_max_m', -LIMITE_M, LIMITE_M);
    const yMax = numero(b.planta_y_max_m, 'planta_y_max_m', -LIMITE_M, LIMITE_M);
    if (xMax <= xMin || yMax <= yMin) throw new ApiError(400, 'O retângulo da planta deve ter máximo maior que mínimo em x e y.');
    return {
      modo: 'planta', origem_latitude: null, origem_longitude: null, azimute_eixo_y_graus: azimute,
      planta_url: url.trim(), planta_x_min_m: xMin, planta_y_min_m: yMin, planta_x_max_m: xMax, planta_y_max_m: yMax,
    };
  }
  throw new ApiError(400, 'modo deve ser geografico ou planta.');
}

/** Contorno da zona em metros locais: de 3 a 200 vértices [x_m, y_m], sem repetir o primeiro. */
export function parseGeometriaZona(valor: unknown): { pontos: [number, number][] } {
  const b = objectBody(valor, ['pontos']);
  if (!Array.isArray(b.pontos) || b.pontos.length < 3 || b.pontos.length > MAX_VERTICES) {
    throw new ApiError(400, `pontos deve ser uma lista de 3 a ${MAX_VERTICES} vértices.`);
  }
  const pontos = b.pontos.map((p, i): [number, number] => {
    if (!Array.isArray(p) || p.length !== 2) throw new ApiError(400, `Vértice ${i + 1} deve ser [x_m, y_m].`);
    return [numero(p[0], `x_m do vértice ${i + 1}`, -LIMITE_M, LIMITE_M), numero(p[1], `y_m do vértice ${i + 1}`, -LIMITE_M, LIMITE_M)];
  });
  const chaves = new Set(pontos.map(([x, y]) => `${x},${y}`));
  if (chaves.size !== pontos.length) throw new ApiError(400, 'A geometria tem vértices repetidos.');
  // Área pela fórmula do laço: polígono degenerado (colinear) não delimita uma zona.
  const area = pontos.reduce((s, [x, y], i) => {
    const [x2, y2] = pontos[(i + 1) % pontos.length];
    return s + x * y2 - x2 * y;
  }, 0) / 2;
  if (Math.abs(area) < 1) throw new ApiError(400, 'A geometria precisa delimitar uma área de pelo menos 1 m².');
  return { pontos };
}
