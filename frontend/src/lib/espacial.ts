import type { CoordenadaReceptorIoT, GeometriaZona, LocalizacaoIoT, LocalizacaoRecenteIoT, ReferenciaEspacial } from "@argos/shared";
import type { CenarioDemonstracao } from "@/lib/demonstracaoMonitoramento";
import { consultarApi, enviarApi } from "@/lib/sessao";

export type ReferenciaEspacialDados =
  | { modo: "geografico"; origem_latitude: number; origem_longitude: number; azimute_eixo_y_graus: number }
  | { modo: "planta"; azimute_eixo_y_graus: number; planta_url: string; planta_x_min_m: number; planta_y_min_m: number; planta_x_max_m: number; planta_y_max_m: number };

export type CoordenadaReceptorDados = Pick<CoordenadaReceptorIoT, "receptor_id" | "x_m" | "y_m" | "rssi_1m_dbm" | "expoente_perda">;

export type LocalizacoesRecentes = { data: LocalizacaoRecenteIoT[]; count: number; limit: number; consultado_em: string };

/** Dados espaciais do mapa (`/api/iot/*`). A prévia pública usa a mesma interface, isolada da API. */
export interface FonteEspacial {
  referencia(signal: AbortSignal): Promise<ReferenciaEspacial | null>;
  coordenadas(signal: AbortSignal): Promise<CoordenadaReceptorIoT[]>;
  geometrias(signal: AbortSignal): Promise<GeometriaZona[]>;
  /** Até cinco estimativas por animal, mais novas primeiro. */
  recentes(signal: AbortSignal): Promise<LocalizacoesRecentes>;
  /** Até 100 estimativas do animal, mais novas primeiro. */
  trilha(animalId: string, signal: AbortSignal): Promise<LocalizacaoIoT[]>;
  salvarReferencia(dados: ReferenciaEspacialDados): Promise<ReferenciaEspacial>;
  salvarCoordenada(dados: CoordenadaReceptorDados): Promise<CoordenadaReceptorIoT>;
  salvarGeometria(zonaId: string, pontos: [number, number][]): Promise<GeometriaZona>;
  removerGeometria(zonaId: string): Promise<void>;
}

/** Chaves do TanStack Query do mapa; `origem` separa API e prévia. */
export const chaveEspacial = (origem: string, ...partes: string[]) => ["espacial", origem, ...partes];

type Lista<T> = { data: T[] };

export const espacialApi: FonteEspacial = {
  referencia: async signal => (await consultarApi<{ data: ReferenciaEspacial | null }>("/iot/referencia-espacial", signal)).data,
  coordenadas: async signal => (await consultarApi<Lista<CoordenadaReceptorIoT>>("/iot/receptores/coordenadas?limit=100&offset=0", signal)).data,
  geometrias: async signal => (await consultarApi<Lista<GeometriaZona>>("/iot/zonas/geometrias", signal)).data,
  recentes: signal => consultarApi<LocalizacoesRecentes>("/iot/localizacoes/recentes", signal),
  trilha: async (animalId, signal) =>
    (await consultarApi<Lista<LocalizacaoIoT>>(`/iot/localizacoes?${new URLSearchParams({ animal_id: animalId, limit: "100", offset: "0" })}`, signal)).data,
  salvarReferencia: async dados => (await enviarApi<{ data: ReferenciaEspacial }>("/iot/referencia-espacial", "PUT", dados)).data,
  salvarCoordenada: async dados => (await enviarApi<{ data: CoordenadaReceptorIoT }>("/iot/receptores/coordenadas", "PUT", dados)).data,
  salvarGeometria: async (zonaId, pontos) =>
    (await enviarApi<{ data: GeometriaZona }>(`/iot/zonas/${encodeURIComponent(zonaId)}/geometria`, "PUT", { pontos })).data,
  removerGeometria: zonaId => enviarApi<void>(`/iot/zonas/${encodeURIComponent(zonaId)}/geometria`, "DELETE"),
};

// ---------------------------------------------------------------------------------------------
// Prévia pública (#/demonstracao/*). Tudo abaixo é simulado e só é usado quando a rota é de
// demonstração; nunca substitui uma resposta ou um erro da API.
// ---------------------------------------------------------------------------------------------

const PASSO_DEMO_MS = 20_000;
const CENTROS_DEMO: [number, number][] = [[45, 35], [150, 30], [65, 120]];
const QUANTOS_DEMO = [10, 5, 4];
const PRIMEIRO_DA_ZONA = [0, 36, 54];

function coordenadasDemonstracao(): CoordenadaReceptorIoT[] {
  const pontos: [number, number][] = [[40, 40], [150, 30], [60, 120], [170, 120]];
  return pontos.map(([x, y], i) => ({
    receptor_id: `receptor-${i}`, propriedade_id: "propriedade-demo", x_m: x, y_m: y,
    rssi_1m_dbm: -50, expoente_perda: 2.6, atualizado_em: "2026-11-10T12:00:00Z",
  }));
}

function geometriasDemonstracao(): GeometriaZona[] {
  const contornos: [number, number][][] = [
    [[0, 0], [90, 0], [90, 70], [0, 70]],
    [[110, 0], [195, 0], [195, 60], [110, 60]],
    [[20, 90], [110, 90], [110, 150], [20, 150]],
  ];
  return contornos.map((pontos, i) => ({ zona_id: `zona-${i}`, pontos, atualizado_em: "2026-11-10T12:00:00Z" }));
}

/**
 * Estimativas simuladas: um passo a cada 20 s, com deslocamento suave dentro da zona. Uma das
 * estimativas tem um salto isolado (para mostrar o descarte) e um animal desatualizado mantém a
 * última posição de 40 min atrás. Nada aqui é medição.
 */
function estimativasDemonstracao(agora: number): LocalizacaoRecenteIoT[] {
  const passoAtual = Math.floor(agora / PASSO_DEMO_MS);
  const lista: LocalizacaoRecenteIoT[] = [];
  const criar = (animal: number, passo: number, x: number, y: number, deslocamentoMs = 0): LocalizacaoRecenteIoT => {
    const observado = passo * PASSO_DEMO_MS + 1500 + deslocamentoMs;
    return {
      id: `loc-${animal}-${passo}`, propriedade_id: "propriedade-demo", transmissor_id: `coleira-${animal}`,
      animal_id: `animal-${animal}`, evento_id: `demo:${animal}:${passo}`,
      x_m: Math.round(x * 100) / 100, y_m: Math.round(y * 100) / 100, erro_residual_m: 1.5 + (animal % 4),
      receptores_utilizados: 3, observado_em: new Date(observado).toISOString(),
      calculado_em: new Date(observado + 2500).toISOString(), recebido_em: new Date(observado + 900).toISOString(),
    };
  };
  CENTROS_DEMO.forEach(([cx, cy], zona) => {
    for (let k = 0; k < QUANTOS_DEMO[zona]; k++) {
      const animal = PRIMEIRO_DA_ZONA[zona] + k;
      for (let p = passoAtual - 4; p <= passoAtual; p++) {
        const x = cx + 22 * Math.sin(p * 0.11 + k * 1.7);
        const y = cy + 16 * Math.cos(p * 0.08 + k * 2.3);
        // Salto isolado do ARG-0126 a cada nove passos: a estimativa seguinte volta ao lugar.
        lista.push(animal === 3 && p % 9 === 4 ? criar(animal, p, x + 160, y + 90) : criar(animal, p, x, y));
      }
    }
  });
  // Animal "desatualizado" do resumo (índice 74, Curral 03): última posição de 40 min atrás.
  const antigo = Math.floor((agora - 40 * 60_000) / PASSO_DEMO_MS);
  lista.push(criar(74, antigo, 70, 55));
  return lista.sort((a, b) => a.animal_id.localeCompare(b.animal_id) || Date.parse(b.observado_em) - Date.parse(a.observado_em));
}

// Uma instância por cenário: a aba Mapa da prévia e as telas de monitoramento veem as mesmas edições.
const instanciasDemonstracao = new Map<CenarioDemonstracao, FonteEspacial>();

export function espacialDemonstracao(cenario: CenarioDemonstracao): FonteEspacial {
  let fonte = instanciasDemonstracao.get(cenario);
  if (!fonte) instanciasDemonstracao.set(cenario, fonte = criarEspacialDemonstracao(cenario));
  return fonte;
}

function criarEspacialDemonstracao(cenario: CenarioDemonstracao): FonteEspacial {
  const vazio = cenario === "vazio";
  let referencia: ReferenciaEspacial | null = null;
  const coordenadas = vazio ? [] : coordenadasDemonstracao();
  const geometrias = vazio ? [] : geometriasDemonstracao();
  const responder = <T,>(valor: () => T): Promise<T> => {
    if (cenario === "carregando") return new Promise<T>(() => {});
    if (cenario === "erro" || cenario === "desatualizado") return Promise.reject(new Error("Falha simulada de conexão com a API."));
    return Promise.resolve(valor());
  };
  const gravar = <T,>(valor: () => T) => new Promise<T>((ok, falha) => window.setTimeout(() => { try { ok(valor()); } catch (e) { falha(e); } }, 300));
  return {
    referencia: () => responder(() => referencia && { ...referencia }),
    coordenadas: () => responder(() => coordenadas.map(c => ({ ...c }))),
    geometrias: () => responder(() => geometrias.map(g => ({ ...g, pontos: g.pontos.map(p => [...p] as [number, number]) }))),
    recentes: () => responder(() => {
      const data = vazio ? [] : estimativasDemonstracao(Date.now());
      return { data, count: data.length, limit: 1000, consultado_em: new Date().toISOString() };
    }),
    trilha: animalId => responder(() => {
      if (vazio) return [];
      // Trilha da prévia: os passos dos últimos 20 minutos, a partir do mesmo gerador.
      const agora = Date.now();
      const passos = Array.from({ length: 60 }, (_, i) => agora - i * PASSO_DEMO_MS);
      const vistos = new Set<string>();
      return passos.flatMap(t => estimativasDemonstracao(t))
        .filter(e => e.animal_id === animalId && !vistos.has(e.evento_id) && vistos.add(e.evento_id))
        .sort((a, b) => Date.parse(b.observado_em) - Date.parse(a.observado_em))
        .slice(0, 100);
    }),
    salvarReferencia: dados => gravar(() => {
      const comum = { propriedade_id: "propriedade-demo", atualizado_em: new Date().toISOString(), azimute_eixo_y_graus: dados.azimute_eixo_y_graus };
      referencia = dados.modo === "geografico"
        ? { ...comum, modo: "geografico", origem_latitude: dados.origem_latitude, origem_longitude: dados.origem_longitude,
            planta_url: null, planta_x_min_m: null, planta_y_min_m: null, planta_x_max_m: null, planta_y_max_m: null }
        : { ...comum, modo: "planta", origem_latitude: null, origem_longitude: null, planta_url: dados.planta_url,
            planta_x_min_m: dados.planta_x_min_m, planta_y_min_m: dados.planta_y_min_m, planta_x_max_m: dados.planta_x_max_m, planta_y_max_m: dados.planta_y_max_m };
      return { ...referencia };
    }),
    salvarCoordenada: dados => gravar(() => {
      const nova: CoordenadaReceptorIoT = { ...dados, propriedade_id: "propriedade-demo", atualizado_em: new Date().toISOString() };
      const i = coordenadas.findIndex(c => c.receptor_id === dados.receptor_id);
      if (i >= 0) coordenadas[i] = nova; else coordenadas.push(nova);
      return { ...nova };
    }),
    salvarGeometria: (zonaId, pontos) => gravar(() => {
      const nova: GeometriaZona = { zona_id: zonaId, pontos: pontos.map(p => [...p] as [number, number]), atualizado_em: new Date().toISOString() };
      const i = geometrias.findIndex(g => g.zona_id === zonaId);
      if (i >= 0) geometrias[i] = nova; else geometrias.push(nova);
      return nova;
    }),
    removerGeometria: zonaId => gravar(() => {
      const i = geometrias.findIndex(g => g.zona_id === zonaId);
      if (i >= 0) geometrias.splice(i, 1);
    }),
  };
}
