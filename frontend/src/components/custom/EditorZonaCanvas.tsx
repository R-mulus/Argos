import { useEffect, useRef, useState } from "react";
import * as maplibregl from "maplibre-gl";
import type { GeoJSONSource, Map as MapaMapLibre } from "maplibre-gl";
import "maplibre-gl/dist/maplibre-gl.css";
import { TerraDraw, TerraDrawPolygonMode, TerraDrawSelectMode, ValidateNotSelfIntersecting, type GeoJSONStoreFeatures } from "terra-draw";
import { TerraDrawMapLibreGLAdapter } from "terra-draw-maplibre-gl-adapter";
import type { ReferenciaEspacial } from "@argos/shared";
import { CORES_MAPA, estiloBase, mapaAtivo, removerMapa } from "@/components/custom/MapaCanvas";
import { anelParaMetros, limites, type LngLat, type Projecao } from "@/lib/referenciaEspacial";

export type PropsEditorZona = {
  projecao: Projecao;
  referencia: ReferenciaEspacial | null;
  /** Contorno atual da zona em edição (metros locais), ou `null` para começar sem desenho. */
  pontosIniciais: [number, number][] | null;
  /** Contornos das demais zonas, só para referência visual. */
  outrasZonas: { id: string; nome: string; pontos: [number, number][] }[];
  receptores: { id: string; codigo: string; x: number; y: number }[];
  /** `true` liga o modo de desenho de um contorno novo (o anterior é descartado). */
  desenhando: boolean;
  aoAlterar: (pontos: [number, number][] | null) => void;
  aoTerminarDesenho: () => void;
  aoFalhar: (mensagem: string) => void;
};

/**
 * Mapa de edição do contorno de uma zona (Terra Draw sobre MapLibre). Desenha no mesmo plano do
 * mapa de monitoramento: geográfico, planta ou grade local, e devolve sempre metros locais.
 */
export default function EditorZonaCanvas(props: PropsEditorZona) {
  const { projecao, referencia, pontosIniciais, outrasZonas, receptores, desenhando } = props;
  const container = useRef<HTMLDivElement>(null);
  const atual = useRef(props);
  useEffect(() => { atual.current = props; });
  const [pronto, setPronto] = useState<{ mapa: MapaMapLibre; desenho: TerraDraw } | null>(null);

  // Instância do mapa e do Terra Draw: uma por referência espacial.
  useEffect(() => {
    if (!container.current) return;
    let mapa: MapaMapLibre;
    try {
      mapa = new maplibregl.Map({
        container: container.current,
        style: estiloBase(projecao, referencia),
        center: [0, 0], zoom: 2, maxZoom: 22,
        minZoom: projecao.modo === "geografico" ? 3 : 8,
        bearing: projecao.rotacaoInicial,
        attributionControl: projecao.modo === "geografico" ? { compact: true } : false,
        dragRotate: false, touchPitch: false, pitchWithRotate: false, doubleClickZoom: false,
        renderWorldCopies: false,
      });
    } catch {
      atual.current.aoFalhar("Este navegador não conseguiu iniciar o mapa (WebGL indisponível). Digite os vértices abaixo.");
      return;
    }
    mapa.addControl(new maplibregl.NavigationControl({ showCompass: false }), "bottom-right");
    mapa.addControl(new maplibregl.ScaleControl({ unit: "metric" }), "bottom-left");
    if (import.meta.env.DEV) (window as Window & { __editorZonaArgos?: MapaMapLibre }).__editorZonaArgos = mapa;
    let desenho: TerraDraw | null = null;

    mapa.once("load", () => {
      mapa.addSource("outras-zonas", { type: "geojson", data: { type: "FeatureCollection", features: [] } });
      mapa.addLayer({ id: "outras-zonas-preenchimento", type: "fill", source: "outras-zonas", paint: { "fill-color": CORES_MAPA.zona, "fill-opacity": 0.15 } });
      mapa.addLayer({ id: "outras-zonas-contorno", type: "line", source: "outras-zonas", paint: { "line-color": projecao.modo === "geografico" ? "#ffffff" : CORES_MAPA.secundaria, "line-width": 2, "line-dasharray": [2, 1.5], "line-opacity": 0.85 } });
      mapa.addSource("receptores", { type: "geojson", data: { type: "FeatureCollection", features: [] } });
      mapa.addLayer({ id: "receptores", type: "circle", source: "receptores", paint: { "circle-radius": 7, "circle-color": "#ffffff", "circle-stroke-color": CORES_MAPA.secundaria, "circle-stroke-width": 3 } });

      desenho = new TerraDraw({
        adapter: new TerraDrawMapLibreGLAdapter({ map: mapa, coordinatePrecision: 9 }),
        modes: [
          new TerraDrawPolygonMode({
            validation: ValidateNotSelfIntersecting,
            styles: {
              fillColor: CORES_MAPA.primaria, fillOpacity: 0.12, outlineColor: CORES_MAPA.primaria, outlineWidth: 4,
              closingPointColor: "#ffffff", closingPointOutlineColor: CORES_MAPA.primaria, closingPointWidth: 6, closingPointOutlineWidth: 2,
            },
          }),
          new TerraDrawSelectMode({
            flags: {
              polygon: {
                feature: {
                  draggable: true,
                  validation: ValidateNotSelfIntersecting,
                  coordinates: { draggable: true, midpoints: true, deletable: true },
                },
              },
            },
            styles: {
              selectedPolygonColor: CORES_MAPA.primaria, selectedPolygonFillOpacity: 0.12, selectedPolygonOutlineColor: CORES_MAPA.primaria, selectedPolygonOutlineWidth: 4,
              selectionPointColor: "#ffffff", selectionPointOutlineColor: CORES_MAPA.primaria, selectionPointWidth: 6, selectionPointOutlineWidth: 2,
              midPointColor: CORES_MAPA.primaria, midPointOutlineColor: "#ffffff", midPointWidth: 4,
            },
          }),
        ],
      });
      desenho.start();

      const publicar = () => {
        const poligono = desenho?.getSnapshot().find(f => f.geometry.type === "Polygon" && !f.properties.currentlyDrawing);
        atual.current.aoAlterar(poligono && poligono.geometry.type === "Polygon" ? anelParaMetros(poligono.geometry.coordinates[0], projecao) : null);
      };
      desenho.on("finish", (id, contexto) => {
        if (contexto.mode === "polygon" && contexto.action === "draw") {
          // Só um contorno por zona: o novo substitui o anterior.
          const antigos = desenho!.getSnapshot().filter(f => f.id !== id).map(f => f.id!);
          if (antigos.length) desenho!.removeFeatures(antigos);
          desenho!.setMode("select");
          desenho!.selectFeature(id);
          atual.current.aoTerminarDesenho();
        }
        publicar();
      });
      desenho.on("change", (_ids, tipo) => { if (tipo !== "styling") publicar(); });
      setPronto({ mapa, desenho });
    });

    return () => {
      setPronto(null);
      try { desenho?.stop(); } catch { /* o mapa pode já ter descartado as camadas */ }
      removerMapa(mapa);
      const global = window as Window & { __editorZonaArgos?: MapaMapLibre };
      if (global.__editorZonaArgos === mapa) delete global.__editorZonaArgos;
    };
    // Recria só quando muda a referência espacial.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [projecao]);

  // Contornos das outras zonas e receptores, com rótulos.
  useEffect(() => {
    if (!pronto || !mapaAtivo(pronto.mapa)) return;
    const { mapa } = pronto;
    const p = (x: number, y: number) => projecao.paraMapa(x, y)!;
    (mapa.getSource("outras-zonas") as GeoJSONSource).setData({
      type: "FeatureCollection",
      features: outrasZonas.map(z => ({ type: "Feature", properties: { id: z.id }, geometry: { type: "Polygon", coordinates: [[...z.pontos, z.pontos[0]].map(([x, y]) => p(x, y))] } })),
    });
    (mapa.getSource("receptores") as GeoJSONSource).setData({
      type: "FeatureCollection",
      features: receptores.map(r => ({ type: "Feature", properties: { id: r.id }, geometry: { type: "Point", coordinates: p(r.x, r.y) } })),
    });
    const rotulo = (texto: string, lngLat: LngLat, deslocamento: [number, number]) => {
      const el = document.createElement("span");
      el.className = "pointer-events-none rounded bg-card/90 px-1.5 py-0.5 text-[11px] font-medium whitespace-nowrap text-secondary shadow-sm";
      el.textContent = texto;
      return new maplibregl.Marker({ element: el, offset: deslocamento }).setLngLat(lngLat).addTo(mapa);
    };
    const marcadores = [
      ...receptores.map(r => rotulo(r.codigo, p(r.x, r.y), [0, -16])),
      ...outrasZonas.map(z => {
        const [cx, cy] = z.pontos.reduce((s, [x, y]) => [s[0] + x / z.pontos.length, s[1] + y / z.pontos.length], [0, 0]);
        return rotulo(z.nome, p(cx, cy), [0, 0]);
      }),
    ];
    return () => marcadores.forEach(m => m.remove());
  }, [pronto, projecao, outrasZonas, receptores]);

  // Contorno da zona escolhida: carregado no Terra Draw e enquadrado.
  const chaveInicial = JSON.stringify(pontosIniciais);
  useEffect(() => {
    if (!pronto || !mapaAtivo(pronto.mapa)) return;
    const { mapa, desenho } = pronto;
    desenho.clear();
    desenho.setMode("select");
    const iniciais = atual.current.pontosIniciais;
    if (iniciais && iniciais.length >= 3) {
      const anel = [...iniciais, iniciais[0]].map(([x, y]) => projecao.paraMapa(x, y)!);
      const feicao: GeoJSONStoreFeatures = { type: "Feature", id: desenho.getFeatureId(), properties: { mode: "polygon" }, geometry: { type: "Polygon", coordinates: [anel] } };
      const [validacao] = desenho.addFeatures([feicao]);
      if (validacao?.valid) desenho.selectFeature(feicao.id!);
    }
    // addFeatures não dispara "change": informa o contorno carregado.
    atual.current.aoAlterar(iniciais && iniciais.length >= 3 ? iniciais : null);
    const metros: [number, number][] = [
      ...(iniciais ?? []),
      ...atual.current.outrasZonas.flatMap(z => z.pontos),
      ...atual.current.receptores.map(r => [r.x, r.y] as [number, number]),
    ];
    if (referencia?.modo === "planta") metros.push([referencia.planta_x_min_m, referencia.planta_y_min_m], [referencia.planta_x_max_m, referencia.planta_y_max_m]);
    if (!metros.length) metros.push([-50, -50], [50, 50]);
    const foco = iniciais && iniciais.length >= 3 ? iniciais.concat(atual.current.receptores.map(r => [r.x, r.y])) : metros;
    const caixa = limites(foco.map(([x, y]) => projecao.paraMapa(x, y)));
    if (caixa) {
      const minimo = 40 / 111_000;
      const cx = (caixa[0] + caixa[2]) / 2;
      const cy = (caixa[1] + caixa[3]) / 2;
      mapa.fitBounds([[Math.min(caixa[0], cx - minimo), Math.min(caixa[1], cy - minimo)], [Math.max(caixa[2], cx + minimo), Math.max(caixa[3], cy + minimo)]], { padding: 48, maxZoom: 20, bearing: projecao.rotacaoInicial, duration: 0 });
    }
  }, [pronto, projecao, chaveInicial, referencia]);

  // Modo de desenho de um contorno novo.
  useEffect(() => {
    if (!pronto || !mapaAtivo(pronto.mapa)) return;
    if (desenhando) {
      pronto.desenho.clear();
      atual.current.aoAlterar(null);
      pronto.desenho.setMode("polygon");
    } else if (pronto.desenho.getMode() === "polygon") {
      pronto.desenho.setMode("select");
    }
  }, [pronto, desenhando]);

  return <div ref={container} className="size-full" role="application" aria-label="Mapa para desenhar o contorno da zona. Alternativa sem mouse: digite os vértices na lista abaixo." />;
}
