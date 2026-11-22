import { startOfDay, subDays } from "date-fns";
import type { ComunicacaoReceptor, PosicaoAnimal, ResumoMonitoramento } from "@argos/shared";
import type { IntervaloDatas } from "@/components/custom/CalendarioIntervalo";
import type { PeriodoVisualizacao } from "@/components/custom/SeletorPeriodo";
import type { ZonaCadastro } from "@/lib/fonteMonitoramento";

export const ATUALIZACAO_MS = 30_000;
/** Janela de recência usada pelo backend para considerar uma detecção atual. */
export const RECENCIA_MS = 5 * 60_000;

export function intervaloDoPeriodo(periodo: PeriodoVisualizacao): IntervaloDatas {
  const hoje = startOfDay(new Date());
  return { from: subDays(hoje, periodo === "dia" ? 0 : periodo === "semana" ? 6 : 29), to: hoje };
}

/** Destaque estável: o primeiro animal recente por identificação; sem recentes, o detectado por último. */
export function escolherDestaque(animais: PosicaoAnimal[]): PosicaoAnimal | null {
  const recentes = animais.filter(a => a.estado === "recente")
    .sort((a, b) => a.identificacao.localeCompare(b.identificacao, "pt-BR", { numeric: true }));
  if (recentes[0]) return recentes[0];
  return animais.filter(a => a.ultima_deteccao_em)
    .sort((a, b) => Date.parse(b.ultima_deteccao_em!) - Date.parse(a.ultima_deteccao_em!))[0] ?? null;
}

/**
 * Indicadores de equipamentos de uma zona. Cada zona tem no máximo um receptor (`zonas.receptor_id`).
 * Devolve `null` nos receptores enquanto zonas ou comunicação ainda não foram carregadas.
 */
export function indicadoresZona(
  zonaId: string,
  resumo: ResumoMonitoramento,
  zonas: ZonaCadastro[] | undefined,
  receptores: ComunicacaoReceptor[] | undefined,
) {
  const receptorId = zonas?.find(z => z.id === zonaId)?.receptor_id ?? null;
  const prontos = zonas !== undefined && receptores !== undefined;
  const recente = receptores?.find(r => r.id === receptorId)?.estado_comunicacao === "recente";
  return {
    receptorId,
    receptoresAtivos: prontos ? (receptorId && recente ? 1 : 0) : null,
    totalReceptores: prontos ? (receptorId ? 1 : 0) : null,
    coleirasAtivas: resumo.animais.filter(a => a.zona_id === zonaId && a.estado === "recente").length,
  };
}
