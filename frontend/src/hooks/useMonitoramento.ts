import { useEffect, useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { addDays, differenceInCalendarDays, startOfDay } from "date-fns";
import type { AlertaCurral } from "@/components/custom/ResumoCurral";
import type { IntervaloDatas } from "@/components/custom/CalendarioIntervalo";
import type { PeriodoVisualizacao } from "@/components/custom/SeletorPeriodo";
import { chaveMonitoramento, type FonteMonitoramento } from "@/lib/fonteMonitoramento";
import { ATUALIZACAO_MS, escolherDestaque, indicadoresZona, intervaloDoPeriodo } from "@/lib/monitoramento";

/** Relógio da tela, atualizado a cada ciclo de consulta (30 s). */
export function useAgora() {
  const [agora, setAgora] = useState(() => Date.now());
  useEffect(() => {
    const timer = window.setInterval(() => setAgora(Date.now()), ATUALIZACAO_MS);
    return () => window.clearInterval(timer);
  }, []);
  return agora;
}

/** Dia/Semana/Mês e calendário. O fim é exclusivo, no início do dia seguinte ao último dia escolhido. */
export function usePeriodo(inicial: PeriodoVisualizacao = "semana") {
  const [periodo, setPeriodo] = useState<PeriodoVisualizacao>(inicial);
  const [intervalo, setIntervaloInterno] = useState<IntervaloDatas>(() => intervaloDoPeriodo(inicial));
  const inicio = intervalo.from ? startOfDay(intervalo.from) : null;
  const fimExclusivo = intervalo.to ? addDays(startOfDay(intervalo.to), 1) : null;
  return {
    periodo,
    intervalo,
    inicio,
    fimExclusivo,
    dias: inicio && fimExclusivo ? differenceInCalendarDays(fimExclusivo, inicio) : 0,
    mudarPeriodo(proximo: PeriodoVisualizacao) {
      setPeriodo(proximo);
      setIntervaloInterno(intervaloDoPeriodo(proximo));
    },
    setIntervalo(valor: IntervaloDatas | undefined) {
      setIntervaloInterno(valor ?? { from: undefined });
    },
  };
}

/** Consultas comuns às telas por zona (Animais e Receptores) e os dados derivados da zona escolhida. */
export function useZonaMonitorada(fonte: FonteMonitoramento, origem: string, zonaEscolhida: string | null) {
  const resumo = useQuery({ queryKey: chaveMonitoramento(origem, "resumo"), queryFn: ({ signal }) => fonte.resumo(signal), refetchInterval: ATUALIZACAO_MS });
  const receptores = useQuery({ queryKey: chaveMonitoramento(origem, "receptores"), queryFn: ({ signal }) => fonte.receptores(signal), refetchInterval: ATUALIZACAO_MS });
  const zonas = useQuery({ queryKey: chaveMonitoramento(origem, "zonas"), queryFn: ({ signal }) => fonte.zonas(signal), refetchInterval: 2 * ATUALIZACAO_MS });
  const alertas = useQuery({ queryKey: chaveMonitoramento(origem, "alertas-novos"), queryFn: ({ signal }) => fonte.alertasNovos(signal), refetchInterval: ATUALIZACAO_MS });

  const dadosResumo = resumo.data;
  const listaZonas = useMemo(() => dadosResumo?.zonas ?? [], [dadosResumo]);
  const zona = listaZonas.find(z => z.id === zonaEscolhida) ?? listaZonas[0] ?? null;
  const animaisDaZona = useMemo(() => (dadosResumo?.animais ?? []).filter(a => a.zona_id === zona?.id), [dadosResumo, zona?.id]);
  const indicadores = zona && dadosResumo ? indicadoresZona(zona.id, dadosResumo, zonas.data?.data, receptores.data?.data) : null;
  const posicaoDestaque = useMemo(() => escolherDestaque(animaisDaZona), [animaisDaZona]);

  // Alerta prioritário da zona: avisos novos de animais da zona ou do seu receptor.
  const alertasZona: AlertaCurral[] | undefined = alertas.data && zona
    ? alertas.data.data
      .filter(a => (a.animal_id && animaisDaZona.some(an => an.animal_id === a.animal_id)) || (a.dispositivo_id && a.dispositivo_id === indicadores?.receptorId))
      .map(a => ({ id: a.id, mensagem: a.titulo, criadoEm: a.criado_em, prioridade: a.prioridade }))
    : undefined;

  async function atualizarTudo() {
    const resultados = await Promise.all([resumo.refetch(), receptores.refetch(), zonas.refetch(), alertas.refetch()]);
    if (resultados.some(r => r.isError)) throw new Error("Falha ao atualizar");
  }

  return { resumo, receptores, zonas, alertas, dadosResumo, listaZonas, zona, animaisDaZona, indicadores, posicaoDestaque, alertasZona, atualizarTudo };
}
