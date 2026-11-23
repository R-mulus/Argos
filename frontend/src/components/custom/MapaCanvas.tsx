import { useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import * as maplibregl from "maplibre-gl";
import type { GeoJSONSource, Map as MapaMapLibre, StyleSpecification } from "maplibre-gl";
import type * as GeoJSON from "geojson";
import "maplibre-gl/dist/maplibre-gl.css";
// O worker do MapLibre é empacotado pelo Vite; o caminho padrão (relativo ao módulo) quebra no pré-empacotamento.
import urlTrabalhadorMapa from "maplibre-gl/dist/maplibre-gl-worker.mjs?worker&url";
import { cowHead } from "@lucide/lab";
import { Icon } from "lucide-react";
import { SatelliteDish } from "lucide-react";
import { cn } from "cn";
import type { ReferenciaEspacial } from "@argos/shared";
import type { AnimalMapa, DadosMapa, ReceptorMapa, TrilhaMapa, ZonaMapa } from "@/lib/mapa";
import { zoomMaximoSatelite } from "@/lib/mapa";
import { limites, passoGrade, type LngLat, type Projecao } from "@/lib/referenciaEspacial";
import { DetalheAnimalMapa, DetalheReceptorMapa } from "@/components/custom/DetalhesMapa";

/** Cores da identidade (tokens --primary, --secondary e verde de comunicação já usado nos receptores). */
export const CORES_MAPA = {
  primaria: "#EE8A1B",
  secundaria: "#503723",
  comunicacao: "#0AA146",
  desatualizado: "#8A8A8A",
  zona: "#8FAE5B",
  fundoLocal: "#EFEBDD",
  grade: "#503723",
} as const;

maplibregl.setWorkerUrl(urlTrabalhadorMapa);

/**
 * Mapas já descartados. Quando a referência espacial muda, a instância é recriada; efeitos do mesmo
 * ciclo ainda veem a anterior e precisam ignorá-la (as fontes dela não existem mais).
 */
const mapasRemovidos = new WeakSet<MapaMapLibre>();
export const mapaAtivo = (mapa: MapaMapLibre | null): mapa is MapaMapLibre => mapa !== null && !mapasRemovidos.has(mapa);
export function removerMapa(mapa: MapaMapLibre) {
  mapasRemovidos.add(mapa);
  mapa.remove();
}

const ICONE = { recente: "argos-animal-recente", desatualizado: "argos-animal-desatualizado" } as const;
const ANIMACAO_MS = 900;
/**
 * Imagem de satélite padrão do modo geográfico: Esri World Imagery, com a atribuição exigida.
 * Uso não comercial (projeto acadêmico); para uso comercial, configure um provedor licenciado em
 * VITE_MAPA_ESTILO_URL (ver docs/MAPA.md).
 */
const TILES_SATELITE = "https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}";
const ATRIBUICAO_SATELITE = 'Powered by <a href="https://www.esri.com" target="_blank" rel="noreferrer">Esri</a> · Esri, Maxar, Earthstar Geographics e GIS User Community';

export type PropsMapaCanvas = {
  projecao: Projecao;
  referencia: ReferenciaEspacial | null;
  dados: DadosMapa;
  trilha: TrilhaMapa | null;
  /** Na tela Receptores os receptores ficam em primeiro plano e os animais em segundo. */
  foco: "animais" | "receptores";
  zonaFocoId: string | null;
  animalSelecionado: string | null;
  receptorSelecionado: string | null;
  aoSelecionarAnimal: (id: string | null) => void;
  aoSelecionarReceptor: (id: string | null) => void;
  rotulo: string;
  aoFalhar: (mensagem: string) => void;
};

type Colecao = GeoJSON.FeatureCollection;
const colecao = (features: GeoJSON.Feature[] = []): Colecao => ({ type: "FeatureCollection", features });

/** Estilo-base: mapa geográfico licenciado, imagem da planta ou só o fundo da grade local. */
export function estiloBase(projecao: Projecao, referencia: ReferenciaEspacial | null): StyleSpecification | string {
  const fundo = { id: "fundo", type: "background" as const, paint: { "background-color": CORES_MAPA.fundoLocal } };
  if (projecao.modo === "geografico") {
    const configurado = import.meta.env.VITE_MAPA_ESTILO_URL;
    if (configurado) return configurado;
    return {
      version: 8,
      sources: {
        satelite: { type: "raster", tiles: [TILES_SATELITE], tileSize: 256,
          maxzoom: zoomMaximoSatelite(import.meta.env.VITE_MAPA_SATELITE_ZOOM_MAX), attribution: ATRIBUICAO_SATELITE },
      },
      layers: [{ ...fundo, paint: { "background-color": "#3F4A33" } }, { id: "base-satelite", type: "raster", source: "satelite" }],
    };
  }
  if (projecao.modo === "planta" && referencia?.modo === "planta") {
    const p = (x: number, y: number) => projecao.paraMapa(x, y)!;
    return {
      version: 8,
      sources: {
        planta: {
          type: "image", url: referencia.planta_url,
          coordinates: [
            p(referencia.planta_x_min_m, referencia.planta_y_max_m), p(referencia.planta_x_max_m, referencia.planta_y_max_m),
            p(referencia.planta_x_max_m, referencia.planta_y_min_m), p(referencia.planta_x_min_m, referencia.planta_y_min_m),
          ],
        },
      },
      layers: [fundo, { id: "base-planta", type: "raster", source: "planta" }],
    };
  }
  return { version: 8, sources: {}, layers: [fundo] };
}

/**
 * Ícone do animal desenhado em canvas (sem foreignObject): círculo branco com a cabeça de bovino,
 * como no Figma, em tamanho fixo de pixels em qualquer zoom. Desatualizado: anel tracejado e ícone cinza.
 */
function imagemAnimal(desatualizado: boolean, escala: number) {
  const lado = 40 * escala;
  const canvas = document.createElement("canvas");
  canvas.width = canvas.height = lado;
  const ctx = canvas.getContext("2d")!;
  ctx.scale(escala, escala);
  ctx.save();
  ctx.shadowColor = "rgba(0,0,0,0.35)";
  ctx.shadowBlur = 4;
  ctx.shadowOffsetY = 1;
  ctx.beginPath();
  ctx.arc(20, 20, 16, 0, Math.PI * 2);
  ctx.fillStyle = desatualizado ? "#F1F1F1" : "#ffffff";
  ctx.fill();
  ctx.restore();
  if (desatualizado) {
    ctx.setLineDash([3, 2.5]);
    ctx.lineWidth = 2;
    ctx.strokeStyle = CORES_MAPA.desatualizado;
    ctx.beginPath();
    ctx.arc(20, 20, 15, 0, Math.PI * 2);
    ctx.stroke();
    ctx.setLineDash([]);
  }
  ctx.translate(10, 10);
  ctx.scale(20 / 24, 20 / 24);
  ctx.lineWidth = 2;
  ctx.lineCap = "round";
  ctx.lineJoin = "round";
  ctx.strokeStyle = desatualizado ? CORES_MAPA.desatualizado : CORES_MAPA.secundaria;
  for (const [, atributos] of cowHead) ctx.stroke(new Path2D(String(atributos.d)));
  return ctx.getImageData(0, 0, lado, lado);
}

function chaveBase(projecao: Projecao, referencia: ReferenciaEspacial | null) {
  if (referencia?.modo === "geografico") return `geo:${referencia.origem_latitude}:${referencia.origem_longitude}:${referencia.azimute_eixo_y_graus}`;
  if (referencia?.modo === "planta") return `planta:${referencia.planta_url}:${referencia.planta_x_min_m}:${referencia.planta_y_min_m}:${referencia.planta_x_max_m}:${referencia.planta_y_max_m}`;
  return projecao.modo;
}

/** Extensão em metros de tudo que o mapa desenha, para a grade local e o enquadramento. */
function extensaoMetros(dados: DadosMapa, referencia: ReferenciaEspacial | null) {
  const xs: number[] = [];
  const ys: number[] = [];
  const somar = (x: number, y: number) => { xs.push(x); ys.push(y); };
  dados.receptores.forEach(r => somar(r.x, r.y));
  dados.animais.forEach(a => somar(a.x, a.y));
  dados.zonas.forEach(z => z.pontos?.forEach(([x, y]) => somar(x, y)));
  if (referencia?.modo === "planta") {
    somar(referencia.planta_x_min_m, referencia.planta_y_min_m);
    somar(referencia.planta_x_max_m, referencia.planta_y_max_m);
  }
  if (!xs.length) return null;
  return { xMin: Math.min(...xs), xMax: Math.max(...xs), yMin: Math.min(...ys), yMax: Math.max(...ys) };
}

/** Botão Centralizar no mesmo grupo dos controles de zoom do MapLibre. */
class ControleCentralizar implements maplibregl.IControl {
  private elemento: HTMLDivElement | null = null;
  private readonly aoClicar: () => void;
  constructor(aoClicar: () => void) {
    this.aoClicar = aoClicar;
  }
  onAdd() {
    const grupo = document.createElement("div");
    grupo.className = "maplibregl-ctrl maplibregl-ctrl-group";
    const botao = document.createElement("button");
    botao.type = "button";
    botao.title = "Centralizar na zona ou na propriedade";
    botao.setAttribute("aria-label", "Centralizar na zona ou na propriedade");
    botao.className = "flex items-center justify-center";
    // Ícone LocateFixed (lucide), estático.
    botao.innerHTML = '<svg aria-hidden="true" width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="margin:auto"><line x1="2" x2="5" y1="12" y2="12"/><line x1="19" x2="22" y1="12" y2="12"/><line x1="12" x2="12" y1="2" y2="5"/><line x1="12" x2="12" y1="19" y2="22"/><circle cx="12" cy="12" r="7"/><circle cx="12" cy="12" r="3"/></svg>';
    botao.addEventListener("click", this.aoClicar);
    grupo.append(botao);
    this.elemento = grupo;
    return grupo;
  }
  onRemove() {
    this.elemento?.remove();
    this.elemento = null;
  }
}

/** Metros locais sob o cursor (útil para conferir a calibração). Estado próprio: não re-renderiza o mapa. */
function LeituraCursor({ mapa, projecao }: { mapa: MapaMapLibre; projecao: Projecao }) {
  const [cursor, setCursor] = useState<{ x: number; y: number } | null>(null);
  useEffect(() => {
    const mover = (e: maplibregl.MapMouseEvent) => setCursor(projecao.paraLocal(e.lngLat.lng, e.lngLat.lat));
    const sair = () => setCursor(null);
    mapa.on("mousemove", mover);
    mapa.on("mouseout", sair);
    return () => { mapa.off("mousemove", mover); mapa.off("mouseout", sair); };
  }, [mapa, projecao]);
  if (!cursor) return null;
  const f = (v: number) => v.toLocaleString("pt-BR", { maximumFractionDigits: 1 });
  return (
    <p aria-hidden="true" className="pointer-events-none absolute bottom-9 left-2 z-10 rounded bg-card/90 px-1.5 py-0.5 text-[11px] tabular-nums text-muted-foreground shadow-sm">
      x {f(cursor.x)} m · y {f(cursor.y)} m
    </p>
  );
}

function interpolar(de: LngLat, para: LngLat, t: number): LngLat {
  const s = t < 0.5 ? 2 * t * t : 1 - (-2 * t + 2) ** 2 / 2;
  return [de[0] + (para[0] - de[0]) * s, de[1] + (para[1] - de[1]) * s];
}

export default function MapaCanvas(props: PropsMapaCanvas) {
  const { projecao, referencia, dados, trilha, foco, zonaFocoId, animalSelecionado, receptorSelecionado, rotulo } = props;
  const container = useRef<HTMLDivElement>(null);
  const [mapa, setMapa] = useState<MapaMapLibre | null>(null);
  const [erroBase, setErroBase] = useState(false);
  const base = chaveBase(projecao, referencia);

  // Props que mudam a cada renderização ficam em refs: os eventos do mapa são ligados uma vez.
  const atual = useRef(props);
  useEffect(() => { atual.current = props; });

  // Posição exibida de cada animal (difere do alvo só durante a animação).
  const exibidas = useRef(new Map<string, LngLat>());
  const animacao = useRef<number | null>(null);
  const enquadrar = useRef<() => void>(() => {});

  // ---- Instância do MapLibre: criada uma vez por referência espacial, nunca pelos dados. ----
  useEffect(() => {
    if (!container.current) return;
    const posicoes = exibidas.current;
    let instancia: MapaMapLibre;
    try {
      instancia = new maplibregl.Map({
        container: container.current,
        style: estiloBase(projecao, referencia),
        center: [0, 0], zoom: 2,
        bearing: projecao.rotacaoInicial,
        maxZoom: 22,
        minZoom: projecao.modo === "geografico" ? 3 : 8,
        attributionControl: projecao.modo === "geografico" ? { compact: true } : false,
        dragRotate: projecao.modo === "geografico",
        touchPitch: false,
        pitchWithRotate: false,
        renderWorldCopies: false,
      });
    } catch {
      atual.current.aoFalhar("Este navegador não conseguiu iniciar o mapa (WebGL indisponível). Os dados continuam na lista abaixo.");
      return;
    }
    instancia.addControl(new maplibregl.NavigationControl({ showCompass: projecao.modo === "geografico", visualizePitch: false }), "bottom-right");
    instancia.addControl(new maplibregl.ScaleControl({ unit: "metric" }), "bottom-left");
    instancia.getCanvas().setAttribute("aria-label", atual.current.rotulo);
    if (import.meta.env.DEV) (window as Window & { __mapaArgos?: MapaMapLibre }).__mapaArgos = instancia;

    instancia.on("error", evento => {
      const fonte = (evento as { sourceId?: string }).sourceId;
      if (fonte === "satelite" || fonte === "planta") setErroBase(true);
    });
    instancia.addControl(new ControleCentralizar(() => enquadrar.current()), "bottom-right");

    instancia.once("load", () => {
      const escala = Math.max(2, Math.ceil(window.devicePixelRatio || 1));
      instancia.addImage(ICONE.recente, imagemAnimal(false, escala), { pixelRatio: escala });
      instancia.addImage(ICONE.desatualizado, imagemAnimal(true, escala), { pixelRatio: escala });

      for (const id of ["grade", "zonas", "trilha", "trilha-pontos", "animal-selecionado"]) instancia.addSource(id, { type: "geojson", data: colecao() });
      instancia.addSource("animais", { type: "geojson", data: colecao(), cluster: true, clusterRadius: 38, clusterMaxZoom: 21, maxzoom: 22 });

      instancia.addLayer({ id: "grade", type: "line", source: "grade", paint: { "line-color": CORES_MAPA.grade, "line-opacity": ["case", ["get", "eixo"], 0.45, 0.12], "line-width": 1 } });
      // Zonas como no Figma: contorno laranja; as fora de foco ficam com contorno branco tracejado.
      instancia.addLayer({ id: "zonas-preenchimento", type: "fill", source: "zonas", paint: { "fill-color": projecao.modo === "geografico" ? CORES_MAPA.primaria : CORES_MAPA.zona, "fill-opacity": ["case", ["get", "foco"], projecao.modo === "geografico" ? 0.08 : 0.3, projecao.modo === "geografico" ? 0.03 : 0.15] } });
      instancia.addLayer({ id: "zonas-contorno", type: "line", source: "zonas", filter: ["get", "foco"], layout: { "line-join": "round" }, paint: { "line-color": CORES_MAPA.primaria, "line-width": 4 } });
      instancia.addLayer({ id: "zonas-contorno-outras", type: "line", source: "zonas", filter: ["!", ["get", "foco"]], layout: { "line-join": "round" }, paint: { "line-color": projecao.modo === "geografico" ? "#ffffff" : CORES_MAPA.secundaria, "line-width": 2, "line-opacity": 0.85, "line-dasharray": [2, 1.5] } });
      instancia.addLayer({ id: "trilha", type: "line", source: "trilha", filter: ["!", ["get", "lacuna"]], layout: { "line-cap": "round", "line-join": "round" }, paint: { "line-color": CORES_MAPA.secundaria, "line-width": 2.5, "line-opacity": 0.8 } });
      instancia.addLayer({ id: "trilha-lacuna", type: "line", source: "trilha", filter: ["get", "lacuna"], paint: { "line-color": CORES_MAPA.secundaria, "line-width": 2, "line-opacity": 0.6, "line-dasharray": [1.5, 2] } });
      instancia.addLayer({
        id: "trilha-pontos", type: "circle", source: "trilha-pontos",
        paint: {
          "circle-radius": ["case", ["get", "usada"], 3.5, 4.5],
          "circle-color": ["case", ["get", "usada"], CORES_MAPA.secundaria, "#ffffff"],
          "circle-stroke-color": ["case", ["get", "usada"], "#ffffff", CORES_MAPA.desatualizado],
          "circle-stroke-width": 1.5,
        },
      });
      instancia.addLayer({
        id: "animais-icone", type: "symbol", source: "animais", filter: ["!", ["has", "point_count"]],
        layout: { "icon-image": ["get", "icone"], "icon-size": 1, "icon-allow-overlap": true, "icon-ignore-placement": true },
        paint: { "icon-opacity": ["case", ["get", "secundario"], 0.8, 1] },
      });
      instancia.addLayer({ id: "animal-selecionado-halo", type: "circle", source: "animal-selecionado", paint: { "circle-radius": 24, "circle-color": CORES_MAPA.primaria, "circle-opacity": 0.25, "circle-stroke-color": CORES_MAPA.primaria, "circle-stroke-width": 2 } });
      instancia.addLayer({ id: "animal-selecionado-icone", type: "symbol", source: "animal-selecionado", layout: { "icon-image": ["get", "icone"], "icon-size": 1.15, "icon-allow-overlap": true, "icon-ignore-placement": true } });

      const clicarAnimal = (e: maplibregl.MapLayerMouseEvent) => {
        const id = e.features?.[0]?.properties?.id;
        if (typeof id === "string") atual.current.aoSelecionarAnimal(id);
      };
      for (const camada of ["animais-icone", "animal-selecionado-icone"]) {
        instancia.on("click", camada, clicarAnimal);
        instancia.on("mouseenter", camada, () => { instancia.getCanvas().style.cursor = "pointer"; });
        instancia.on("mouseleave", camada, () => { instancia.getCanvas().style.cursor = ""; });
      }
      instancia.on("click", e => {
        if (!instancia.queryRenderedFeatures(e.point, { layers: ["animais-icone", "animal-selecionado-icone"] }).length) {
          atual.current.aoSelecionarAnimal(null);
          atual.current.aoSelecionarReceptor(null);
        }
      });
      setMapa(instancia);
    });

    return () => {
      if (animacao.current !== null) cancelAnimationFrame(animacao.current);
      animacao.current = null;
      posicoes.clear();
      setMapa(null);
      removerMapa(instancia);
      const global = window as Window & { __mapaArgos?: MapaMapLibre };
      if (global.__mapaArgos === instancia) delete global.__mapaArgos;
    };
    // A instância só é recriada quando muda a referência espacial (chave `base`).
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [base]);

  // ---- Grade local e zonas ----
  const extensao = useMemo(() => extensaoMetros(dados, referencia), [dados, referencia]);
  useEffect(() => {
    if (!mapaAtivo(mapa)) return;
    const grade: GeoJSON.Feature[] = [];
    if (projecao.modo !== "geografico" && extensao) {
      const margem = Math.max(20, 0.25 * Math.max(extensao.xMax - extensao.xMin, extensao.yMax - extensao.yMin));
      const passo = passoGrade(Math.max(extensao.xMax - extensao.xMin, extensao.yMax - extensao.yMin) + 2 * margem);
      const x0 = Math.floor((extensao.xMin - margem) / passo) * passo;
      const x1 = Math.ceil((extensao.xMax + margem) / passo) * passo;
      const y0 = Math.floor((extensao.yMin - margem) / passo) * passo;
      const y1 = Math.ceil((extensao.yMax + margem) / passo) * passo;
      const linha = (a: [number, number], b: [number, number], eixo: boolean): GeoJSON.Feature => ({
        type: "Feature", properties: { eixo }, geometry: { type: "LineString", coordinates: [projecao.paraMapa(...a)!, projecao.paraMapa(...b)!] },
      });
      for (let x = x0; x <= x1; x += passo) grade.push(linha([x, y0], [x, y1], x === 0));
      for (let y = y0; y <= y1; y += passo) grade.push(linha([x0, y], [x1, y], y === 0));
    }
    (mapa.getSource("grade") as GeoJSONSource).setData(colecao(grade));
  }, [mapa, projecao, extensao]);

  useEffect(() => {
    if (!mapaAtivo(mapa)) return;
    const zonas = dados.zonas.filter(z => z.pontos).map((z): GeoJSON.Feature => ({
      type: "Feature", properties: { id: z.id, foco: z.id === zonaFocoId },
      geometry: { type: "Polygon", coordinates: [[...z.pontos!, z.pontos![0]].map(([x, y]) => projecao.paraMapa(x, y)!)] },
    }));
    (mapa.getSource("zonas") as GeoJSONSource).setData(colecao(zonas));
  }, [mapa, projecao, dados.zonas, zonaFocoId]);

  // ---- Trilha do animal selecionado ----
  useEffect(() => {
    if (!mapaAtivo(mapa)) return;
    const linhas: GeoJSON.Feature[] = (trilha?.trechos ?? []).map(t => ({
      type: "Feature", properties: { lacuna: t.lacuna },
      geometry: { type: "LineString", coordinates: t.pontos.map(([x, y]) => projecao.paraMapa(x, y)!) },
    }));
    const pontos: GeoJSON.Feature[] = [
      ...(trilha?.aceitas ?? []).map(e => ({ e, usada: true })),
      ...(trilha?.naoUsadas ?? []).map(a => ({ e: a.estimativa, usada: false })),
    ].map(({ e, usada }) => ({ type: "Feature", properties: { usada }, geometry: { type: "Point", coordinates: projecao.paraMapa(e.x_m, e.y_m)! } }));
    (mapa.getSource("trilha") as GeoJSONSource).setData(colecao(linhas));
    (mapa.getSource("trilha-pontos") as GeoJSONSource).setData(colecao(pontos));
  }, [mapa, projecao, trilha]);

  // ---- Animais: só se movem quando chega uma estimativa nova aceita. ----
  const porId = useMemo(() => new Map(dados.animais.map(a => [a.id, a])), [dados.animais]);
  const publicar = useRef<() => void>(() => {});
  useEffect(() => {
    publicar.current = () => {
      if (!mapaAtivo(mapa)) return;
      const selecionado = atual.current.animalSelecionado;
      const feicao = (a: AnimalMapa): GeoJSON.Feature | null => {
        const p = exibidas.current.get(a.id);
        return p ? {
          type: "Feature",
          properties: { id: a.id, icone: a.atualidade === "recente" ? ICONE.recente : ICONE.desatualizado, secundario: foco === "receptores" },
          geometry: { type: "Point", coordinates: p },
        } : null;
      };
      const todas = dados.animais.filter(a => a.id !== selecionado).map(feicao).filter((f): f is GeoJSON.Feature => f !== null);
      const escolhido = selecionado ? porId.get(selecionado) : undefined;
      const destaque = escolhido ? feicao(escolhido) : null;
      (mapa.getSource("animais") as GeoJSONSource | undefined)?.setData(colecao(todas));
      (mapa.getSource("animal-selecionado") as GeoJSONSource | undefined)?.setData(colecao(destaque ? [destaque] : []));
    };
  }, [mapa, dados.animais, porId, foco]);

  useEffect(() => {
    if (!mapaAtivo(mapa)) return;
    const alvos = new Map<string, LngLat>();
    for (const a of dados.animais) {
      const p = projecao.paraMapa(a.x, a.y);
      if (p) alvos.set(a.id, p);
    }
    for (const id of [...exibidas.current.keys()]) if (!alvos.has(id)) exibidas.current.delete(id);
    const reduzido = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    const trajetos = new Map<string, { de: LngLat; para: LngLat }>();
    for (const [id, para] of alvos) {
      const de = exibidas.current.get(id);
      if (!de || reduzido || (de[0] === para[0] && de[1] === para[1])) exibidas.current.set(id, para);
      else trajetos.set(id, { de, para });
    }
    if (animacao.current !== null) cancelAnimationFrame(animacao.current);
    animacao.current = null;
    if (!trajetos.size) { publicar.current(); return; }
    const inicio = performance.now();
    const passo = (agora: number) => {
      const t = Math.min(1, (agora - inicio) / ANIMACAO_MS);
      for (const [id, { de, para }] of trajetos) exibidas.current.set(id, interpolar(de, para, t));
      publicar.current();
      animacao.current = t < 1 ? requestAnimationFrame(passo) : null;
    };
    animacao.current = requestAnimationFrame(passo);
  }, [mapa, projecao, dados.animais]);

  useEffect(() => { publicar.current(); }, [animalSelecionado, foco, dados.animais]);

  // ---- Agrupamentos: marcadores DOM com a contagem (sem fonte de glifos externa). ----
  useEffect(() => {
    if (!mapaAtivo(mapa)) return;
    const marcadores = new Map<number, maplibregl.Marker>();
    let pendente = false;
    const sincronizar = () => {
      pendente = false;
      if (!mapa.getSource("animais") || !mapa.isSourceLoaded("animais")) return;
      const vistos = new Set<number>();
      for (const f of mapa.querySourceFeatures("animais", { filter: ["has", "point_count"] })) {
        const id = Number(f.properties?.cluster_id);
        if (vistos.has(id) || f.geometry.type !== "Point") continue;
        vistos.add(id);
        const quantidade = Number(f.properties?.point_count);
        const coordenadas = f.geometry.coordinates as LngLat;
        let marcador = marcadores.get(id);
        if (!marcador) {
          const botao = document.createElement("button");
          botao.type = "button";
          botao.className = "flex size-9 items-center justify-center rounded-full border-2 border-white bg-secondary text-sm font-semibold text-white shadow-md outline-none focus-visible:ring-3 focus-visible:ring-primary";
          botao.addEventListener("click", evento => {
            evento.stopPropagation();
            (mapa.getSource("animais") as GeoJSONSource).getClusterExpansionZoom(id)
              .then(zoom => mapa.easeTo({ center: coordenadas, zoom: Math.min(zoom + 0.5, mapa.getMaxZoom()) }))
              .catch(() => undefined);
          });
          marcador = new maplibregl.Marker({ element: botao }).setLngLat(coordenadas).addTo(mapa);
          marcador.getElement().style.zIndex = "1";
          marcadores.set(id, marcador);
        }
        marcador.setLngLat(coordenadas);
        const elemento = marcador.getElement();
        elemento.textContent = String(quantidade);
        elemento.setAttribute("aria-label", `${quantidade} animais com posição próxima. Aproximar.`);
      }
      for (const [id, marcador] of marcadores) if (!vistos.has(id)) { marcador.remove(); marcadores.delete(id); }
    };
    const agendar = () => { if (!pendente) { pendente = true; requestAnimationFrame(sincronizar); } };
    mapa.on("render", agendar);
    agendar();
    return () => {
      mapa.off("render", agendar);
      marcadores.forEach(m => m.remove());
    };
  }, [mapa]);

  // ---- Receptores e contagens por zona: botões React posicionados por marcadores do MapLibre. ----
  const idsReceptores = dados.receptores.map(r => r.id).join("|");
  const elementosReceptores = useMemo(
    () => new Map(idsReceptores.split("|").filter(Boolean).map(id => [id, document.createElement("div")])),
    [idsReceptores],
  );
  const zonasComAncora = useMemo(() => dados.zonas.filter(z => z.ancora && z.semPosicao > 0), [dados.zonas]);
  const idsZonas = zonasComAncora.map(z => z.id).join("|");
  const elementosZonas = useMemo(
    () => new Map(idsZonas.split("|").filter(Boolean).map(id => [id, document.createElement("div")])),
    [idsZonas],
  );
  const posicoesReceptores = dados.receptores.map(r => `${r.id}:${r.x}:${r.y}`).join("|");
  const posicoesZonas = zonasComAncora.map(z => `${z.id}:${z.ancora}:${z.ancoraNoReceptor}`).join("|");

  useEffect(() => {
    if (!mapaAtivo(mapa)) return;
    const marcadores: maplibregl.Marker[] = [];
    const adicionar = (elemento: HTMLElement, x: number, y: number, ancora: maplibregl.PositionAnchor, deslocamento: [number, number], camada: number) => {
      const p = projecao.paraMapa(x, y);
      if (!p) return;
      const marcador = new maplibregl.Marker({ element: elemento, anchor: ancora, offset: deslocamento }).setLngLat(p).addTo(mapa);
      // Receptores acima das contagens, e ambos acima dos agrupamentos de animais.
      marcador.getElement().style.zIndex = String(camada);
      marcadores.push(marcador);
    };
    for (const r of atual.current.dados.receptores) {
      const el = elementosReceptores.get(r.id);
      if (el) adicionar(el, r.x, r.y, "center", [0, 0], 3);
    }
    for (const z of atual.current.dados.zonas) {
      const el = elementosZonas.get(z.id);
      // Sem contorno, a contagem fica acima do receptor; com contorno, logo abaixo da borda superior.
      if (el && z.ancora) adicionar(el, z.ancora[0], z.ancora[1], z.ancoraNoReceptor ? "bottom" : "top", z.ancoraNoReceptor ? [0, -24] : [0, 6], 2);
    }
    return () => marcadores.forEach(m => m.remove());
  }, [mapa, projecao, elementosReceptores, elementosZonas, posicoesReceptores, posicoesZonas]);

  // ---- Popups: conteúdo React em portal, posição pelo MapLibre. ----
  const conteudoPopupAnimal = useMemo(() => document.createElement("div"), []);
  const conteudoPopupReceptor = useMemo(() => document.createElement("div"), []);
  const animalEscolhido = animalSelecionado ? porId.get(animalSelecionado) ?? null : null;
  const receptorEscolhido = receptorSelecionado ? dados.receptores.find(r => r.id === receptorSelecionado) ?? null : null;

  useEffect(() => {
    if (!mapaAtivo(mapa) || !animalEscolhido) return;
    const popup = new maplibregl.Popup({ offset: 26, closeButton: true, maxWidth: "300px", focusAfterOpen: false, className: "argos-popup" })
      .setDOMContent(conteudoPopupAnimal);
    let fechandoPeloCodigo = false;
    popup.on("close", () => { if (!fechandoPeloCodigo) atual.current.aoSelecionarAnimal(null); });
    const acompanhar = () => {
      const p = exibidas.current.get(animalEscolhido.id);
      if (p) popup.setLngLat(p);
    };
    acompanhar();
    popup.addTo(mapa);
    mapa.on("render", acompanhar);
    return () => {
      mapa.off("render", acompanhar);
      fechandoPeloCodigo = true;
      popup.remove();
    };
  }, [mapa, animalEscolhido?.id, conteudoPopupAnimal]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    if (!mapaAtivo(mapa) || !receptorEscolhido) return;
    const p = projecao.paraMapa(receptorEscolhido.x, receptorEscolhido.y);
    if (!p) return;
    const popup = new maplibregl.Popup({ offset: 24, maxWidth: "300px", focusAfterOpen: false, className: "argos-popup" })
      .setDOMContent(conteudoPopupReceptor).setLngLat(p);
    let fechandoPeloCodigo = false;
    popup.on("close", () => { if (!fechandoPeloCodigo) atual.current.aoSelecionarReceptor(null); });
    popup.addTo(mapa);
    return () => { fechandoPeloCodigo = true; popup.remove(); };
  }, [mapa, projecao, receptorEscolhido?.id, receptorEscolhido?.x, receptorEscolhido?.y, conteudoPopupReceptor]); // eslint-disable-line react-hooks/exhaustive-deps

  // ---- Enquadramento: na carga, ao trocar de zona e no botão Centralizar; nunca a cada consulta. ----
  useEffect(() => {
    enquadrar.current = () => {
      if (!mapaAtivo(mapa)) return;
      const d = atual.current.dados;
      const zona = d.zonas.find(z => z.id === atual.current.zonaFocoId);
      const emMetros: [number, number][] = [];
      if (zona?.pontos) emMetros.push(...zona.pontos);
      else if (zona?.ancora) emMetros.push([zona.ancora[0] - 25, zona.ancora[1] - 25], [zona.ancora[0] + 25, zona.ancora[1] + 25]);
      if (zona) d.animais.filter(a => a.zonaId === zona.id).forEach(a => emMetros.push([a.x, a.y]));
      if (!emMetros.length) {
        d.receptores.forEach(r => emMetros.push([r.x, r.y]));
        d.animais.forEach(a => emMetros.push([a.x, a.y]));
        d.zonas.forEach(z => z.pontos?.forEach(p => emMetros.push(p)));
        const ref = atual.current.referencia;
        if (ref?.modo === "planta") emMetros.push([ref.planta_x_min_m, ref.planta_y_min_m], [ref.planta_x_max_m, ref.planta_y_max_m]);
        if (ref?.modo === "geografico" && !emMetros.length) emMetros.push([-100, -100], [100, 100]);
      }
      const caixa = limites(emMetros.map(([x, y]) => projecao.paraMapa(x, y)));
      if (!caixa) return;
      const [o, s, l, n] = caixa;
      const minimo = 30 / 111_000; // Pelo menos ~30 m de largura, para não ampliar demais um único ponto.
      const cx = (o + l) / 2;
      const cy = (s + n) / 2;
      mapa.fitBounds([[Math.min(o, cx - minimo), Math.min(s, cy - minimo)], [Math.max(l, cx + minimo), Math.max(n, cy + minimo)]], {
        padding: 48, maxZoom: 20, bearing: projecao.rotacaoInicial, duration: window.matchMedia("(prefers-reduced-motion: reduce)").matches ? 0 : 600,
      });
    };
  }, [mapa, projecao]);
  const temConteudo = dados.receptores.length + dados.animais.length + dados.zonas.filter(z => z.pontos || z.ancora).length > 0;
  useEffect(() => { enquadrar.current(); }, [mapa, zonaFocoId, temConteudo]);

  // Seleção vinda da lista: traz o item para a área visível sem mudar o zoom.
  useEffect(() => {
    if (!mapaAtivo(mapa)) return;
    const alvo = animalSelecionado ? exibidas.current.get(animalSelecionado)
      : receptorEscolhido ? projecao.paraMapa(receptorEscolhido.x, receptorEscolhido.y) : null;
    if (alvo && !mapa.getBounds().contains(alvo)) mapa.easeTo({ center: alvo, duration: 500 });
  }, [mapa, projecao, animalSelecionado, receptorEscolhido?.id]); // eslint-disable-line react-hooks/exhaustive-deps

  const rotuloReceptor = (r: ReceptorMapa) => `${r.nome ?? r.codigo}: ${r.inativo ? "inativo" : r.estado === "recente" ? "comunicação recente" : r.estado === "aguardando_primeira_leitura" ? "aguardando primeira leitura" : r.estado === "sem_leitura_recente" ? "sem leitura recente" : "comunicação desconhecida"}`;
  const rotuloZona = (z: ZonaMapa) => `${z.nome}: ${z.semPosicao} ${z.semPosicao === 1 ? "animal detectado" : "animais detectados"} sem posição individual`;

  return (
    <div className="absolute inset-0">
      <div ref={container} className="size-full" role="region" aria-label={rotulo} />
      {erroBase && (
        <p role="status" className="absolute top-3 right-3 z-10 max-w-[70%] rounded-md bg-card/95 px-2.5 py-1.5 text-xs shadow">
          {projecao.modo === "planta" ? "Imagem da planta indisponível." : "Mapa-base indisponível no momento."} Marcadores e zonas continuam corretos.
        </p>
      )}
      {mapa && <LeituraCursor mapa={mapa} projecao={projecao} />}

      {dados.receptores.map(r => {
        const el = elementosReceptores.get(r.id);
        if (!el) return null;
        const selecionado = r.id === receptorSelecionado;
        const comunicando = !r.inativo && r.estado === "recente";
        return createPortal(
          <button
            type="button"
            aria-label={rotuloReceptor(r)}
            aria-pressed={selecionado}
            title={rotuloReceptor(r)}
            onClick={evento => { evento.stopPropagation(); props.aoSelecionarReceptor(selecionado ? null : r.id); }}
            className={cn(
              "relative flex items-center justify-center rounded-full bg-white text-secondary shadow-[0_1px_4px_rgba(0,0,0,0.4)] outline-none transition-transform focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary",
              foco === "receptores" ? "size-10" : "size-9",
              selecionado && "scale-115 ring-3 ring-primary",
              r.inativo && "opacity-75",
            )}
          >
            <SatelliteDish aria-hidden="true" className={foco === "receptores" ? "size-5" : "size-[18px]"} strokeWidth={2.2} />
            <span aria-hidden="true" className={cn("absolute -right-0.5 -bottom-0.5 size-3 rounded-full border-2 border-white", comunicando ? "bg-[#0AA146]" : "bg-zinc-400")} />
          </button>,
          el,
          r.id,
        );
      })}

      {zonasComAncora.map(z => {
        const el = elementosZonas.get(z.id);
        if (!el) return null;
        return createPortal(
          <span
            role="img"
            aria-label={rotuloZona(z)}
            title={rotuloZona(z)}
            className={cn(
              "pointer-events-auto flex items-center gap-1 rounded-full border-2 border-dashed bg-card/95 px-2 py-0.5 text-xs font-semibold whitespace-nowrap text-secondary shadow-sm",
              z.id === zonaFocoId ? "border-primary" : "border-secondary/60",
            )}
          >
            <Icon iconNode={cowHead} aria-hidden="true" className="size-3.5" />
            {z.semPosicao}
            <span className="font-normal text-muted-foreground">na zona</span>
          </span>,
          el,
          z.id,
        );
      })}

      {animalEscolhido && createPortal(<DetalheAnimalMapa animal={animalEscolhido} trilha={trilha} />, conteudoPopupAnimal)}
      {receptorEscolhido && createPortal(<DetalheReceptorMapa receptor={receptorEscolhido} />, conteudoPopupReceptor)}
    </div>
  );
}
