import { useEffect, useMemo, useRef, useState } from "react";
import * as maplibregl from "maplibre-gl";
import type { GeoJSONSource, Map as MapaMapLibre } from "maplibre-gl";
import "maplibre-gl/dist/maplibre-gl.css";
import { CORES_MAPA, estiloBase, mapaAtivo, removerMapa } from "@/components/custom/MapaCanvas";
import { criarProjecao, type LngLat } from "@/lib/referenciaEspacial";

export type ReceptorPosicionavel = { id: string; codigo: string; nome: string | null; x: number | null; y: number | null };
export type Ferramenta = { tipo: "origem" } | { tipo: "receptor"; id: string };

export type PropsPosicionamento = {
  origem: { latitude: number; longitude: number } | null;
  azimute: number;
  receptores: ReceptorPosicionavel[];
  /** Receptores colocados ou arrastados nesta edição: ficam presos ao chão mesmo se a origem mudar. */
  movidos: ReadonlyMap<string, LngLat>;
  zonas: [number, number][][];
  ferramenta: Ferramenta;
  /** Muda para levar o mapa a um ponto (busca por coordenadas ou localização do navegador). */
  destino: { latitude: number; longitude: number; chave: number } | null;
  aoMarcarOrigem: (latitude: number, longitude: number) => void;
  aoMoverReceptor: (id: string, lngLat: LngLat) => void;
  aoFalhar: (mensagem: string) => void;
};

/** Ícones estáticos (lucide), sem conteúdo do usuário. */
const ICONE_RECEPTOR = '<svg aria-hidden="true" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="M4 10a7.31 7.31 0 0 0 10 10Z"/><path d="m9 15 3-3"/><path d="M17 13a6 6 0 0 0-6-6"/><path d="M21 13A10 10 0 0 0 11 3"/></svg>';

/** Brasil inteiro, enquanto a origem não foi marcada. */
const VISAO_INICIAL = { center: [-51.9, -14.2] as LngLat, zoom: 3.5 };

/**
 * Mapa de satélite para marcar a origem do sistema local e a posição dos receptores. Os receptores
 * com coordenadas salvas acompanham a origem (são metros relativos a ela); os arrastados nesta
 * edição ficam presos ao ponto escolhido.
 */
export default function PosicionamentoCanvas(props: PropsPosicionamento) {
  const { origem, azimute, receptores, movidos, zonas, ferramenta, destino } = props;
  const container = useRef<HTMLDivElement>(null);
  const atual = useRef(props);
  useEffect(() => { atual.current = props; });
  const [mapa, setMapa] = useState<MapaMapLibre | null>(null);

  const projecao = useMemo(() => origem ? criarProjecao({
    propriedade_id: "", atualizado_em: "", modo: "geografico", origem_latitude: origem.latitude, origem_longitude: origem.longitude,
    azimute_eixo_y_graus: azimute, planta_url: null, planta_x_min_m: null, planta_y_min_m: null, planta_x_max_m: null, planta_y_max_m: null,
  }) : null, [origem, azimute]);

  useEffect(() => {
    if (!container.current) return;
    let instancia: MapaMapLibre;
    try {
      const inicio = atual.current.origem;
      instancia = new maplibregl.Map({
        container: container.current,
        style: estiloBase(criarProjecao({
          propriedade_id: "", atualizado_em: "", modo: "geografico", origem_latitude: 0, origem_longitude: 0, azimute_eixo_y_graus: 0,
          planta_url: null, planta_x_min_m: null, planta_y_min_m: null, planta_x_max_m: null, planta_y_max_m: null,
        }), null),
        center: inicio ? [inicio.longitude, inicio.latitude] : VISAO_INICIAL.center,
        zoom: inicio ? 17 : VISAO_INICIAL.zoom,
        maxZoom: 21, minZoom: 2, attributionControl: { compact: true },
        dragRotate: false, touchPitch: false, pitchWithRotate: false, renderWorldCopies: false,
      });
    } catch {
      atual.current.aoFalhar("Este navegador não conseguiu iniciar o mapa (WebGL indisponível). Digite latitude e longitude abaixo.");
      return;
    }
    instancia.addControl(new maplibregl.NavigationControl({ showCompass: false }), "bottom-right");
    instancia.addControl(new maplibregl.ScaleControl({ unit: "metric" }), "bottom-left");
    if (import.meta.env.DEV) (window as Window & { __posicionamentoArgos?: MapaMapLibre }).__posicionamentoArgos = instancia;
    instancia.on("click", e => {
      const f = atual.current.ferramenta;
      if (f.tipo === "origem") atual.current.aoMarcarOrigem(e.lngLat.lat, e.lngLat.lng);
      else atual.current.aoMoverReceptor(f.id, [e.lngLat.lng, e.lngLat.lat]);
    });
    instancia.once("load", () => {
      instancia.addSource("zonas", { type: "geojson", data: { type: "FeatureCollection", features: [] } });
      instancia.addLayer({ id: "zonas", type: "line", source: "zonas", layout: { "line-join": "round" }, paint: { "line-color": CORES_MAPA.primaria, "line-width": 3, "line-opacity": 0.9 } });
      setMapa(instancia);
    });
    return () => {
      setMapa(null);
      removerMapa(instancia);
      const global = window as Window & { __posicionamentoArgos?: MapaMapLibre };
      if (global.__posicionamentoArgos === instancia) delete global.__posicionamentoArgos;
    };
  }, []);

  // Leva o mapa à coordenada buscada.
  useEffect(() => {
    if (mapaAtivo(mapa) && destino) mapa.flyTo({ center: [destino.longitude, destino.latitude], zoom: Math.max(mapa.getZoom(), 17), duration: 900 });
  }, [mapa, destino]);

  // Contornos das zonas (metros relativos à origem).
  useEffect(() => {
    if (!mapaAtivo(mapa)) return;
    (mapa.getSource("zonas") as GeoJSONSource).setData({
      type: "FeatureCollection",
      features: projecao ? zonas.map(pontos => ({
        type: "Feature", properties: {},
        geometry: { type: "Polygon", coordinates: [[...pontos, pontos[0]].map(([x, y]) => projecao.paraMapa(x, y)!)] },
      })) : [],
    });
  }, [mapa, projecao, zonas]);

  // Origem e receptores como marcadores arrastáveis.
  useEffect(() => {
    if (!mapaAtivo(mapa)) return;
    const marcadores: maplibregl.Marker[] = [];
    if (origem) {
      const el = document.createElement("div");
      el.className = "flex flex-col items-center";
      el.setAttribute("role", "img");
      el.setAttribute("aria-label", "Origem (0, 0) do sistema local");
      const pino = document.createElement("span");
      pino.className = "flex size-7 cursor-grab items-center justify-center rounded-full border-[3px] border-white bg-primary text-[10px] font-bold text-white shadow-[0_1px_4px_rgba(0,0,0,0.5)]";
      pino.textContent = "0,0";
      el.append(pino);
      const marcador = new maplibregl.Marker({ element: el, draggable: true }).setLngLat([origem.longitude, origem.latitude]).addTo(mapa);
      marcador.on("dragend", () => { const p = marcador.getLngLat(); atual.current.aoMarcarOrigem(p.lat, p.lng); });
      marcadores.push(marcador);
    }
    for (const r of receptores) {
      const preso = movidos.get(r.id);
      const posicao = preso ?? (projecao && r.x !== null && r.y !== null ? projecao.paraMapa(r.x, r.y) : null);
      if (!posicao) continue;
      const el = document.createElement("div");
      el.className = "flex cursor-grab flex-col items-center gap-0.5";
      el.setAttribute("role", "img");
      el.setAttribute("aria-label", `Receptor ${r.codigo}${preso ? " (posição alterada, não salva)" : ""}`);
      const circulo = document.createElement("span");
      circulo.className = `flex size-9 items-center justify-center rounded-full bg-white text-secondary shadow-[0_1px_4px_rgba(0,0,0,0.45)] ${preso ? "ring-3 ring-primary" : ""}`;
      circulo.innerHTML = ICONE_RECEPTOR;
      const rotulo = document.createElement("span");
      rotulo.className = "rounded bg-white/90 px-1 text-[10px] font-semibold text-secondary shadow-sm";
      rotulo.textContent = r.codigo;
      el.append(circulo, rotulo);
      const marcador = new maplibregl.Marker({ element: el, draggable: true, anchor: "top", offset: [0, -18] }).setLngLat(posicao).addTo(mapa);
      marcador.on("dragend", () => { const p = marcador.getLngLat(); atual.current.aoMoverReceptor(r.id, [p.lng, p.lat]); });
      marcadores.push(marcador);
    }
    return () => marcadores.forEach(m => m.remove());
  }, [mapa, origem, projecao, receptores, movidos]);

  // Cursor indica o que o clique faz.
  useEffect(() => {
    if (mapaAtivo(mapa)) mapa.getCanvas().style.cursor = "crosshair";
  }, [mapa, ferramenta]);

  return (
    <div
      ref={container}
      className="size-full"
      role="application"
      aria-label="Mapa de satélite: clique para marcar a origem ou o receptor escolhido; arraste os marcadores para ajustar. Alternativa sem mouse: campos de latitude, longitude e coordenadas abaixo."
    />
  );
}
