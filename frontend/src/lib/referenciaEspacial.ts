import type { ReferenciaEspacial } from "@argos/shared";

/**
 * Conversão do sistema local da propriedade (x_m, y_m em metros, o mesmo da trilateração) para as
 * coordenadas que o MapLibre desenha.
 *
 * - `geografico`: a origem foi medida em campo. Os metros viram leste/norte pelo azimute do eixo +y
 *   e depois latitude/longitude por um plano tangente, adequado a distâncias de alguns quilômetros.
 * - `planta` e `local`: não há referência geográfica. O MapLibre só desenha em longitude/latitude, então
 *   os metros são colocados num plano de desenho perto de (0°, 0°), onde 1 m equivale a 1 m na
 *   escala do mapa. Esses valores nunca são exibidos nem tratados como posição GPS: a tela mostra
 *   apenas metros e não carrega mapa-base geográfico.
 */
export type ModoMapa = "geografico" | "planta" | "local";

export type LngLat = [number, number];

export type Projecao = {
  modo: ModoMapa;
  /** Converte metros locais para o plano do mapa; `null` para valores inválidos. */
  paraMapa(x: number, y: number): LngLat | null;
  /** Inversa de `paraMapa`, para mostrar metros sob o cursor. */
  paraLocal(lng: number, lat: number): { x: number; y: number };
  /** Rotação do mapa que deixa o eixo +y local para cima (só no modo geográfico). */
  rotacaoInicial: number;
};

/** Metros por grau de longitude no equador (WGS 84), usados pelo plano de desenho sem georreferência. */
export const METROS_POR_GRAU_EQUADOR = (6_378_137 * Math.PI) / 180;

const radianos = (graus: number) => (graus * Math.PI) / 180;

/** Metros por grau de latitude e de longitude na latitude informada (série de Helmert). */
export function metrosPorGrau(latitude: number) {
  const f = radianos(latitude);
  return {
    latitude: 111_132.954 - 559.822 * Math.cos(2 * f) + 1.175 * Math.cos(4 * f),
    longitude: 111_412.84 * Math.cos(f) - 93.5 * Math.cos(3 * f) + 0.118 * Math.cos(5 * f),
  };
}

const finito = (...valores: number[]) => valores.every(Number.isFinite);

export function criarProjecao(referencia: ReferenciaEspacial | null): Projecao {
  if (referencia?.modo === "geografico") {
    const { origem_latitude: lat0, origem_longitude: lon0 } = referencia;
    const t = radianos(referencia.azimute_eixo_y_graus);
    const escala = metrosPorGrau(lat0);
    return {
      modo: "geografico",
      paraMapa(x, y) {
        if (!finito(x, y)) return null;
        const leste = x * Math.cos(t) + y * Math.sin(t);
        const norte = -x * Math.sin(t) + y * Math.cos(t);
        return [lon0 + leste / escala.longitude, lat0 + norte / escala.latitude];
      },
      paraLocal(lng, lat) {
        const leste = (lng - lon0) * escala.longitude;
        const norte = (lat - lat0) * escala.latitude;
        return { x: leste * Math.cos(t) - norte * Math.sin(t), y: leste * Math.sin(t) + norte * Math.cos(t) };
      },
      rotacaoInicial: referencia.azimute_eixo_y_graus,
    };
  }
  return {
    modo: referencia?.modo === "planta" ? "planta" : "local",
    paraMapa: (x, y) => (finito(x, y) ? [x / METROS_POR_GRAU_EQUADOR, y / METROS_POR_GRAU_EQUADOR] : null),
    paraLocal: (lng, lat) => ({ x: lng * METROS_POR_GRAU_EQUADOR, y: lat * METROS_POR_GRAU_EQUADOR }),
    rotacaoInicial: 0,
  };
}

/** Retângulo [oeste, sul, leste, norte] que contém os pontos, ou `null` sem pontos válidos. */
export function limites(pontos: (LngLat | null)[]): [number, number, number, number] | null {
  const validos = pontos.filter((p): p is LngLat => p !== null && finito(p[0], p[1]));
  if (!validos.length) return null;
  const lngs = validos.map(p => p[0]);
  const lats = validos.map(p => p[1]);
  return [Math.min(...lngs), Math.min(...lats), Math.max(...lngs), Math.max(...lats)];
}

/** Espaçamento da grade local, em metros, para cerca de dez linhas na maior dimensão. */
export function passoGrade(larguraM: number) {
  const alvo = Math.max(1, larguraM / 10);
  return [1, 2, 5, 10, 20, 25, 50, 100, 200, 250, 500, 1000, 2000, 5000].find(p => p >= alvo) ?? 10_000;
}

/** Centro de um polígono pela média dos vértices: só posiciona o rótulo, não é posição de animal. */
export function centroDoPoligono(pontos: [number, number][]): [number, number] {
  const soma = pontos.reduce((s, [x, y]) => [s[0] + x, s[1] + y], [0, 0]);
  return [soma[0] / pontos.length, soma[1] / pontos.length];
}

/** Anel de polígono do desenho (lng/lat, fechado) → vértices em metros locais com 1 cm, sem repetir o primeiro. */
export function anelParaMetros(anel: number[][], projecao: Projecao): [number, number][] {
  const ultimo = anel[anel.length - 1];
  const abertos = anel.length > 1 && anel[0][0] === ultimo[0] && anel[0][1] === ultimo[1] ? anel.slice(0, -1) : anel;
  return abertos.map(([lng, lat]) => {
    const { x, y } = projecao.paraLocal(lng, lat);
    return [Math.round(x * 100) / 100, Math.round(y * 100) / 100];
  });
}

/** Área do polígono em m² (fórmula do laço). */
export function areaPoligono(pontos: [number, number][]) {
  return Math.abs(pontos.reduce((s, [x, y], i) => {
    const [x2, y2] = pontos[(i + 1) % pontos.length];
    return s + x * y2 - x2 * y;
  }, 0) / 2);
}
