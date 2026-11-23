import { useMemo } from "react";
import { keepPreviousData, useQuery } from "@tanstack/react-query";
import type { ComunicacaoReceptor, ResumoMonitoramento } from "@argos/shared";
import { chaveEspacial, type FonteEspacial } from "@/lib/espacial";
import type { ZonaCadastro } from "@/lib/fonteMonitoramento";
import { montarDadosMapa, montarTrilha } from "@/lib/mapa";
import { ATUALIZACAO_MS } from "@/lib/monitoramento";
import { criarProjecao } from "@/lib/referenciaEspacial";

/**
 * Intervalo das estimativas RSSI. O Realtime do Supabase ainda não está habilitado para
 * argos_localizacoes (sem publicação), então o mapa consulta a API periodicamente. A view devolve
 * as cinco últimas estimativas por animal, o que recupera o que chegou durante uma queda de conexão.
 */
export const ATUALIZACAO_POSICOES_MS = 15_000;

type Entradas = {
  fonte: FonteEspacial;
  origem: string;
  resumo: ResumoMonitoramento | undefined;
  comunicacao: ComunicacaoReceptor[] | undefined;
  zonasCadastro: ZonaCadastro[] | undefined;
  animalSelecionado: string | null;
  agora: number;
};

/** Consultas e dados derivados do mapa. Não cria nem conhece a instância do MapLibre. */
export function useMapaMonitoramento({ fonte, origem, resumo, comunicacao, zonasCadastro, animalSelecionado, agora }: Entradas) {
  const referencia = useQuery({
    queryKey: chaveEspacial(origem, "referencia"),
    queryFn: ({ signal }) => fonte.referencia(signal),
    staleTime: 5 * 60_000,
    refetchInterval: 2 * ATUALIZACAO_MS,
  });
  const coordenadas = useQuery({
    queryKey: chaveEspacial(origem, "coordenadas"),
    queryFn: ({ signal }) => fonte.coordenadas(signal),
    staleTime: 60_000,
    refetchInterval: 2 * ATUALIZACAO_MS,
  });
  const geometrias = useQuery({
    queryKey: chaveEspacial(origem, "geometrias"),
    queryFn: ({ signal }) => fonte.geometrias(signal),
    staleTime: 60_000,
    refetchInterval: 2 * ATUALIZACAO_MS,
  });
  const recentes = useQuery({
    queryKey: chaveEspacial(origem, "recentes"),
    queryFn: ({ signal }) => fonte.recentes(signal),
    refetchInterval: ATUALIZACAO_POSICOES_MS,
  });
  const trilha = useQuery({
    queryKey: chaveEspacial(origem, "trilha", animalSelecionado ?? ""),
    queryFn: ({ signal }) => fonte.trilha(animalSelecionado!, signal),
    enabled: Boolean(animalSelecionado),
    placeholderData: keepPreviousData,
    refetchInterval: ATUALIZACAO_POSICOES_MS,
  });

  const projecao = useMemo(() => criarProjecao(referencia.data ?? null), [referencia.data]);
  // `agora` muda a cada 30 s; as estimativas, a cada consulta. O mapa só reage a mudanças reais.
  const dados = useMemo(() => montarDadosMapa({
    resumo, comunicacao, zonasCadastro,
    coordenadas: coordenadas.data, geometrias: geometrias.data, recentes: recentes.data?.data, agora,
  }), [resumo, comunicacao, zonasCadastro, coordenadas.data, geometrias.data, recentes.data, agora]);
  const trilhaMapa = useMemo(
    () => (animalSelecionado && trilha.data ? montarTrilha(trilha.data.filter(e => e.animal_id === animalSelecionado), agora) : null),
    [animalSelecionado, trilha.data, agora],
  );

  const consultasBase = [referencia, coordenadas, geometrias];
  // Falha de uma parte não derruba o mapa: o que carregou continua visível, com o aviso da parte que faltou.
  const falhas = ([["a referência espacial", referencia], ["as coordenadas dos receptores", coordenadas], ["os contornos das zonas", geometrias]] as const)
    .filter(([, c]) => c.isError && c.data === undefined).map(([nome, c]) => ({ nome, mensagem: c.error!.message }));
  return {
    referencia, coordenadas, geometrias, recentes, trilha,
    projecao, dados, trilhaMapa,
    carregando: consultasBase.some(c => c.isPending && c.fetchStatus !== "idle"),
    falhas,
    async atualizar() {
      await Promise.all([referencia.refetch(), coordenadas.refetch(), geometrias.refetch(), recentes.refetch()]);
    },
  };
}
