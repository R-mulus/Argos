import { describe, expect, it } from "vitest";
import type { ReferenciaEspacial } from "@argos/shared";
import { METROS_POR_GRAU_EQUADOR, anelParaMetros, areaPoligono, criarProjecao, limites, metrosPorGrau, passoGrade } from "./referenciaEspacial";

const base = { propriedade_id: "p", atualizado_em: "2026-11-17T00:00:00Z" };
const geografica = (azimute: number): ReferenciaEspacial => ({
  ...base, modo: "geografico", origem_latitude: -18.58, origem_longitude: -46.51, azimute_eixo_y_graus: azimute,
  planta_url: null, planta_x_min_m: null, planta_y_min_m: null, planta_x_max_m: null, planta_y_max_m: null,
});

describe("criarProjecao", () => {
  it("sem referência usa o plano local em metros, sem rotação", () => {
    const p = criarProjecao(null);
    expect(p.modo).toBe("local");
    expect(p.paraMapa(METROS_POR_GRAU_EQUADOR, 0)).toEqual([1, 0]);
    expect(p.paraLocal(...p.paraMapa(120, 35)!)).toEqual({ x: 120, y: 35 });
    expect(p.paraMapa(Number.NaN, 0)).toBeNull();
  });

  it("planta não usa a origem geográfica", () => {
    const p = criarProjecao({ ...base, modo: "planta", origem_latitude: null, origem_longitude: null, azimute_eixo_y_graus: 30,
      planta_url: "https://exemplo.com/p.png", planta_x_min_m: 0, planta_y_min_m: 0, planta_x_max_m: 100, planta_y_max_m: 50 });
    expect(p.modo).toBe("planta");
    expect(p.rotacaoInicial).toBe(0);
  });

  it("geográfica sem rotação: +x para leste e +y para norte", () => {
    const p = criarProjecao(geografica(0));
    const escala = metrosPorGrau(-18.58);
    const [lng, lat] = p.paraMapa(100, 50)!;
    expect((lng + 46.51) * escala.longitude).toBeCloseTo(100, 6);
    expect((lat + 18.58) * escala.latitude).toBeCloseTo(50, 6);
  });

  it("geográfica com azimute 90°: +y aponta para leste", () => {
    const p = criarProjecao(geografica(90));
    const [lng, lat] = p.paraMapa(0, 100)!;
    expect(lng).toBeGreaterThan(-46.51);
    expect(lat).toBeCloseTo(-18.58, 9);
    expect(p.rotacaoInicial).toBe(90);
  });

  it("ida e volta preserva os metros em qualquer azimute", () => {
    for (const az of [0, 15, 133.5, 270]) {
      const p = criarProjecao(geografica(az));
      const volta = p.paraLocal(...p.paraMapa(-321.4, 87.2)!);
      expect(volta.x).toBeCloseTo(-321.4, 6);
      expect(volta.y).toBeCloseTo(87.2, 6);
    }
  });

  it("um grau de latitude perto de Patos de Minas mede cerca de 110,7 km", () => {
    expect(metrosPorGrau(-18.58).latitude).toBeGreaterThan(110_600);
    expect(metrosPorGrau(-18.58).latitude).toBeLessThan(110_800);
  });
});

describe("desenho de zonas", () => {
  it("converte o anel desenhado para metros, sem repetir o primeiro vértice", () => {
    for (const ref of [null, geografica(25)]) {
      const p = criarProjecao(ref);
      const metros: [number, number][] = [[0, 0], [40.5, 0], [40.5, 20.25], [0, 20.25]];
      const anel = [...metros, metros[0]].map(([x, y]) => p.paraMapa(x, y)!);
      expect(anelParaMetros(anel, p)).toEqual(metros);
    }
  });
  it("calcula a área em m²", () => {
    expect(areaPoligono([[0, 0], [40, 0], [40, 20], [0, 20]])).toBe(800);
    expect(areaPoligono([[0, 0], [10, 0], [20, 0]])).toBe(0);
  });
});

describe("auxiliares", () => {
  it("limites ignora pontos inválidos", () => {
    expect(limites([[0, 1], null, [2, -1]])).toEqual([0, -1, 2, 1]);
    expect(limites([null])).toBeNull();
  });
  it("passo da grade acompanha a extensão", () => {
    expect(passoGrade(120)).toBe(20);
    expect(passoGrade(5)).toBe(1);
    expect(passoGrade(3000)).toBe(500);
  });
});
