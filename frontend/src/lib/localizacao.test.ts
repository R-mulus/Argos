import { describe, expect, it } from "vitest";
import type { LocalizacaoIoT } from "@argos/shared";
import { LIMITES_LOCALIZACAO, atualidade, avaliarTrajetoria, trechosTrilha } from "./localizacao";

const T0 = Date.parse("2026-11-17T12:00:00Z");
let sequencia = 0;
function est(segundos: number | null, x: number, y: number, extra: Partial<LocalizacaoIoT> = {}): LocalizacaoIoT {
  sequencia += 1;
  const observado = segundos === null ? null : new Date(T0 + segundos * 1000).toISOString();
  return {
    id: `id-${sequencia}`, propriedade_id: "p", transmissor_id: "t", animal_id: "a",
    evento_id: `ev-${sequencia}`, x_m: x, y_m: y, erro_residual_m: 2, receptores_utilizados: 3,
    observado_em: observado, calculado_em: new Date(T0 + (segundos ?? 0) * 1000 + 3000).toISOString(),
    ...extra,
  };
}
const agora = T0 + 3600_000;

describe("avaliarTrajetoria", () => {
  it("aceita deslocamentos plausíveis e usa a última observação como posição", () => {
    const r = avaliarTrajetoria([est(60, 5, 0), est(0, 0, 0), est(120, 10, 0)], agora);
    expect(r.avaliadas.map(a => a.situacao)).toEqual(["aceita", "aceita", "aceita"]);
    expect(r.atual?.estimativa.x_m).toBe(10);
  });

  it("descarta salto isolado que a estimativa seguinte não confirma", () => {
    const r = avaliarTrajetoria([est(0, 0, 0), est(30, 500, 500), est(60, 2, 1)], agora);
    expect(r.avaliadas.map(a => a.situacao)).toEqual(["aceita", "salto_descartado", "aceita"]);
    expect(r.atual?.estimativa.x_m).toBe(2);
  });

  it("deixa o salto mais recente aguardando confirmação sem mover o marcador", () => {
    const r = avaliarTrajetoria([est(0, 0, 0), est(30, 500, 500)], agora);
    expect(r.avaliadas[1].situacao).toBe("aguardando_confirmacao");
    expect(r.atual?.estimativa.x_m).toBe(0);
  });

  it("aceita o salto quando duas estimativas consecutivas concordam", () => {
    const r = avaliarTrajetoria([est(0, 0, 0), est(30, 500, 500), est(60, 505, 498)], agora);
    expect(r.avaliadas.map(a => a.situacao)).toEqual(["aceita", "aceita", "aceita"]);
    expect(r.atual?.estimativa.x_m).toBe(505);
  });

  it("aceita deslocamento grande quando o intervalo de tempo o explica", () => {
    const r = avaliarTrajetoria([est(0, 0, 0), est(600, 1500, 0)], agora);
    expect(r.atual?.estimativa.x_m).toBe(1500);
  });

  it("não cria movimento a partir do mesmo evento repetido", () => {
    const original = est(0, 0, 0);
    const repetido = { ...original, id: "outro", x_m: 1, calculado_em: new Date(T0 + 9000).toISOString() };
    const r = avaliarTrajetoria([original, repetido], agora);
    expect(r.duplicadas).toBe(1);
    expect(r.avaliadas).toHaveLength(1);
    expect(r.atual?.estimativa.x_m).toBe(1);
  });

  it("estimativa atrasada entra na ordem certa e não puxa o marcador para trás", () => {
    const atrasada = est(30, 3, 0, { calculado_em: new Date(T0 + 900_000).toISOString() });
    const r = avaliarTrajetoria([est(0, 0, 0), est(60, 6, 0), atrasada], agora);
    expect(r.avaliadas.map(a => a.estimativa.x_m)).toEqual([0, 3, 6]);
    expect(r.avaliadas[1].atrasada).toBe(true);
    expect(r.atual?.estimativa.x_m).toBe(6);
  });

  it("separa estimativas sem horário, inválidas e no futuro, sem usá-las na posição", () => {
    const r = avaliarTrajetoria([
      est(0, 1, 1),
      est(null, 9, 9),
      est(10, Number.NaN, 0),
      est(20, 2, 2, { receptores_utilizados: 2 }),
      est(Math.round((agora - T0) / 1000) + 600, 3, 3),
    ], agora);
    const situacoes = Object.fromEntries(r.avaliadas.map(a => [a.estimativa.x_m, a.situacao]));
    expect(situacoes[1]).toBe("aceita");
    expect(situacoes[9]).toBe("sem_horario");
    expect(situacoes[2]).toBe("invalida");
    expect(situacoes[3]).toBe("horario_futuro");
    expect(r.atual?.estimativa.x_m).toBe(1);
  });

  it("sem estimativas válidas não há posição", () => {
    expect(avaliarTrajetoria([est(null, 0, 0)], agora).atual).toBeNull();
    expect(avaliarTrajetoria([], agora).atual).toBeNull();
  });
});

describe("atualidade e trilha", () => {
  it("marca como desatualizada fora da janela de recência", () => {
    expect(atualidade(new Date(agora - 60_000).toISOString(), agora)).toBe("recente");
    expect(atualidade(new Date(agora - LIMITES_LOCALIZACAO.recenciaMs - 1).toISOString(), agora)).toBe("desatualizada");
  });

  it("separa trechos sem cobertura sem inventar pontos", () => {
    const pontos = [est(0, 0, 0), est(60, 1, 0), est(60 + 3600, 50, 0), est(60 + 3660, 51, 0)];
    const trechos = trechosTrilha(pontos);
    expect(trechos).toEqual([
      { pontos: [[0, 0], [1, 0]], lacuna: false },
      { pontos: [[1, 0], [50, 0]], lacuna: true },
      { pontos: [[50, 0], [51, 0]], lacuna: false },
    ]);
  });
});
