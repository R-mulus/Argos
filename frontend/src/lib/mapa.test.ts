import { describe, expect, it } from "vitest";
import type { ComunicacaoReceptor, LocalizacaoRecenteIoT, PosicaoAnimal, ResumoMonitoramento } from "@argos/shared";
import { montarDadosMapa, montarTrilha, zoomMaximoSatelite } from "./mapa";

const AGORA = Date.parse("2026-11-17T12:00:00Z");
const iso = (minutosAtras: number) => new Date(AGORA - minutosAtras * 60_000).toISOString();

function animal(id: string, zona: string | null, estado: PosicaoAnimal["estado"] = "recente"): PosicaoAnimal {
  return { animal_id: id, identificacao: id.toUpperCase(), ultima_deteccao_em: iso(1), instante_posicao: iso(1), zona_id: zona, zona_nome: zona, receptor_id: null, rssi_dbm: -60, estado };
}
function estimativa(animalId: string, minutosAtras: number, x: number, y: number, n = 1): LocalizacaoRecenteIoT {
  return {
    id: `${animalId}-${n}`, propriedade_id: "p", transmissor_id: `t-${animalId}`, animal_id: animalId, evento_id: `${animalId}:${n}`,
    x_m: x, y_m: y, erro_residual_m: 2, receptores_utilizados: 3, observado_em: iso(minutosAtras),
    calculado_em: iso(minutosAtras - 0.05), recebido_em: iso(minutosAtras - 0.02),
  };
}
const resumo = (animais: PosicaoAnimal[]): ResumoMonitoramento => ({
  atualizado_em: iso(0), total_ativos: animais.length, recentes: 0, recentes_sem_zona: 0, desatualizados: 0, sem_horario: 0, nunca_detectados: 0,
  animais, zonas: [{ id: "z1", nome: "Curral", quantidade: animais.filter(a => a.zona_id === "z1" && a.estado === "recente").length }],
});
const receptor = (id: string, estado: ComunicacaoReceptor["estado_comunicacao"] = "recente"): ComunicacaoReceptor =>
  ({ id, codigo: id.toUpperCase(), nome: null, status: "ativo", ultima_comunicacao_em: iso(1), estado_comunicacao: estado });
const coordenada = (id: string, x: number, y: number) => ({ receptor_id: id, propriedade_id: "p", x_m: x, y_m: y, rssi_1m_dbm: -50, expoente_perda: 2.6, atualizado_em: iso(100) });

describe("montarDadosMapa", () => {
  const base = {
    comunicacao: [receptor("r1"), receptor("r2"), receptor("r3", "sem_leitura_recente")],
    zonasCadastro: [{ id: "z1", nome: "Curral", receptor_id: "r1", ativa: true }],
    coordenadas: [coordenada("r1", 0, 0), coordenada("r2", 100, 0)],
    agora: AGORA,
  };

  it("dá marcador só a quem tem estimativa aceita e conta o resto por zona", () => {
    const dados = montarDadosMapa({
      ...base, geometrias: [],
      resumo: resumo([animal("a", "z1"), animal("b", "z1"), animal("c", "z1")]),
      recentes: [estimativa("a", 1, 10, 10), estimativa("b", 1, 30, 5)],
    });
    expect(dados.animais.map(a => a.id)).toEqual(["a", "b"]);
    expect(dados.zonas[0]).toMatchObject({ quantidade: 3, semPosicao: 1, ancora: [0, 0], ancoraNoReceptor: true });
    expect(dados.semPosicao).toBe(1);
  });

  it("receptor sem coordenada fica fora do mapa e é listado", () => {
    const dados = montarDadosMapa({ ...base, geometrias: [], resumo: resumo([]), recentes: [] });
    expect(dados.receptores.map(r => r.id)).toEqual(["r1", "r2"]);
    expect(dados.receptoresSemCoordenada.map(r => r.id)).toEqual(["r3"]);
  });

  it("posição antiga não concorre com detecção mais nova por zona", () => {
    const dados = montarDadosMapa({
      ...base, geometrias: [],
      resumo: resumo([animal("a", "z1"), animal("b", null, "desatualizado")]),
      recentes: [estimativa("a", 40, 10, 10), estimativa("b", 40, 50, 50)],
    });
    expect(dados.animais.map(a => [a.id, a.atualidade])).toEqual([["b", "desatualizada"]]);
    expect(dados.zonas[0].semPosicao).toBe(1);
  });

  it("ignora estimativas de animais fora do resumo da propriedade", () => {
    const dados = montarDadosMapa({ ...base, geometrias: [], resumo: resumo([animal("a", "z1")]), recentes: [estimativa("intruso", 1, 0, 0)] });
    expect(dados.animais).toEqual([]);
  });

  it("contagem com contorno fica na borda superior da zona", () => {
    const dados = montarDadosMapa({
      ...base, resumo: resumo([animal("a", "z1")]), recentes: [],
      geometrias: [{ zona_id: "z1", pontos: [[0, 0], [40, 0], [40, 20], [0, 20]], atualizado_em: iso(5) }],
    });
    expect(dados.zonas[0]).toMatchObject({ ancora: [20, 20], ancoraNoReceptor: false });
  });

  it("vários animais no mesmo lugar mantêm marcadores distintos", () => {
    const dados = montarDadosMapa({
      ...base, geometrias: [], resumo: resumo([animal("a", "z1"), animal("b", "z1")]),
      recentes: [estimativa("a", 1, 10, 10), estimativa("b", 1, 10, 10)],
    });
    expect(new Set(dados.animais.map(a => a.id)).size).toBe(2);
  });
});

describe("montarTrilha", () => {
  it("separa as não usadas da linha", () => {
    const trilha = montarTrilha([estimativa("a", 3, 0, 0, 1), estimativa("a", 2.5, 900, 900, 2), estimativa("a", 2, 3, 1, 3)], AGORA)!;
    expect(trilha.aceitas.map(e => e.x_m)).toEqual([0, 3]);
    expect(trilha.naoUsadas.map(a => a.situacao)).toEqual(["salto_descartado"]);
    expect(montarTrilha([], AGORA)).toBeNull();
  });
});

describe("zoomMaximoSatelite", () => {
  it("usa 17 por padrão e aceita só inteiros de 1 a 19", () => {
    expect(zoomMaximoSatelite(undefined)).toBe(17);
    expect(zoomMaximoSatelite("")).toBe(17);
    expect(zoomMaximoSatelite("18")).toBe(18);
    expect(zoomMaximoSatelite("19")).toBe(19);
    expect(zoomMaximoSatelite("20")).toBe(17);
    expect(zoomMaximoSatelite("16.5")).toBe(17);
    expect(zoomMaximoSatelite("abc")).toBe(17);
  });
});
