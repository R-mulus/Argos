import { useMemo } from "react";
import { keepPreviousData, useQuery } from "@tanstack/react-query";
import { addDays, format } from "date-fns";
import { useSearchParams } from "react-router";
import { AnaliseGeral } from "@/components/custom/AnaliseGeral";
import { AnimaisSemDeteccao, type RegistroSemDeteccao } from "@/components/custom/AnimaisSemDeteccao";
import { AnimalDestaque } from "@/components/custom/AnimalDestaque";
import { CabecalhoZona } from "@/components/custom/CabecalhoZona";
import { DistribuicaoComportamento } from "@/components/custom/DistribuicaoComportamento";
import { AvisoAntigo, EstadoBloco, Secao } from "@/components/custom/EstadoConsulta";
import { HistoricoLeitura, registroDeDeteccao } from "@/components/custom/HistoricoLeitura";
import { MapaIlustrativoZona } from "@/components/custom/MapaIlustrativoZona";
import { ResumoZona } from "@/components/custom/ResumoZona";
import { SeloSimulado } from "@/components/custom/SeloSimulado";
import { Card } from "@/components/ui/card";
import { useAgora, usePeriodo, useZonaMonitorada } from "@/hooks/useMonitoramento";
import { fonteDemonstracao, type CenarioDemonstracao } from "@/lib/demonstracaoMonitoramento";
import { baixarBlob, buscarHistoricoCompleto } from "@/lib/historico";
import { chaveMonitoramento, fonteApi, type FiltroHistorico } from "@/lib/fonteMonitoramento";

// Série de exemplo no formato do Figma: não há histórico de animais sem detecção na API.
const serieSimulada: RegistroSemDeteccao[] = [
  ["06:00", 37, 50], ["06:30", 70, 30], ["07:00", 71, 79], ["07:30", 61, 69], ["08:00", 55, 47],
  ["08:30", 33, 20], ["09:00", 52, 43], ["09:30", 67, 50], ["10:00", 43, 34],
].map(([horario, anterior, atual]) => ({ horario: String(horario), anterior: Number(anterior), atual: Number(atual) }));

/** Tela Animais: visão de uma zona escolhida no título (`?zona=<id>`). */
export default function AnimaisZona({ demonstracao }: { demonstracao?: CenarioDemonstracao }) {
  const fonte = useMemo(() => (demonstracao ? fonteDemonstracao(demonstracao) : fonteApi), [demonstracao]);
  const origem = demonstracao ?? "api";
  const [parametros, setParametros] = useSearchParams();
  const periodo = usePeriodo();
  const { inicio, fimExclusivo } = periodo;
  const agora = useAgora();
  const { resumo, receptores, zonas, alertas, dadosResumo, listaZonas, zona, animaisDaZona, indicadores, posicaoDestaque, alertasZona, atualizarTudo } =
    useZonaMonitorada(fonte, origem, parametros.get("zona"));

  const destaque = useQuery({
    queryKey: chaveMonitoramento(origem, "destaque", posicaoDestaque?.animal_id ?? ""),
    enabled: Boolean(posicaoDestaque),
    staleTime: 5 * 60_000,
    queryFn: async ({ signal }) => {
      const id = posicaoDestaque!.animal_id;
      const [animal, pesagem] = await Promise.all([fonte.animal(id, signal), fonte.ultimaPesagem(id, signal)]);
      return { animal, pesagem };
    },
  });

  // Histórico do período e da zona: todas as páginas até o limite, para filtros e ordenação locais corretos.
  const filtro: FiltroHistorico | null = zona && inicio && fimExclusivo ? { zonaId: zona.id, inicio: inicio.toISOString(), fim: fimExclusivo.toISOString() } : null;
  const historico = useQuery({
    queryKey: chaveMonitoramento(origem, "historico", filtro?.zonaId ?? "", filtro?.inicio ?? "", filtro?.fim ?? ""),
    enabled: Boolean(filtro),
    placeholderData: keepPreviousData,
    queryFn: ({ signal }) => buscarHistoricoCompleto(fonte, filtro!, signal),
  });

  const semDeteccao = zona ? (() => {
    const antigos = animaisDaZona.filter(a => a.estado === "desatualizado" && a.ultima_deteccao_em);
    const maior = antigos.length ? Math.max(...antigos.map(a => (agora - Date.parse(a.ultima_deteccao_em!)) / 60_000)) : null;
    return { quantidade: antigos.length, maiorTempoMinutos: maior, detectadosAgora: zona.quantidade };
  })() : null;

  const registros = useMemo(() => (historico.data?.linhas ?? []).map(registroDeDeteccao), [historico.data]);
  const historicoCompleto = historico.data ? historico.data.linhas.length >= historico.data.total : false;

  return (
    <div className="mx-auto w-full max-w-[1786px] min-w-0 pt-8 pb-16 lg:pt-[64px] [&_[data-slot=card]]:ring-foreground/30">
      <CabecalhoZona
        titulo="Visão Geral"
        zonas={listaZonas}
        zonaAtual={zona}
        aoEscolherZona={id => setParametros({ zona: id })}
        periodo={periodo.periodo}
        aoMudarPeriodo={periodo.mudarPeriodo}
        intervalo={periodo.intervalo}
        aoMudarIntervalo={periodo.setIntervalo}
      />

      <EstadoBloco consulta={resumo} nome="as zonas monitoradas" />
      <AvisoAntigo consultas={[resumo, zonas, receptores, alertas]} agora={agora} />
      {dadosResumo && !zona && <Card className="p-6">Nenhuma zona ativa para monitoramento. Cadastre uma zona com receptor para acompanhar os animais.</Card>}

      {zona && dadosResumo && <>
        <ResumoZona
          nome={zona.nome}
          animaisAtivos={zona.quantidade}
          receptoresAtivos={indicadores?.receptoresAtivos ?? null}
          totalReceptores={indicadores?.totalReceptores ?? null}
          coleirasAtivas={indicadores?.coleirasAtivas ?? null}
          animalDestaqueId={posicaoDestaque?.identificacao}
          atualizadoEm={dadosResumo.atualizado_em}
          alertas={alertasZona}
          aoAtualizar={atualizarTudo}
        />

        <section aria-label="Análises de comportamento" className="mt-5 grid min-w-0 gap-5 lg:mt-[27px] xl:grid-cols-2 xl:gap-[27px]">
          <div className="relative min-w-0 [&>[data-slot=card]]:h-full">
            <AnaliseGeral />
            <SeloSimulado className="absolute right-4 bottom-4" descricao="Tamanho do grupo, coesão e comportamento dependem do futuro modelo de análise." />
          </div>
          <div className="relative min-w-0 [&>[data-slot=card]]:h-full">
            <DistribuicaoComportamento />
            <SeloSimulado className="absolute right-4 bottom-4" descricao="A distribuição de comportamento depende do futuro modelo de análise." />
          </div>
        </section>

        <section aria-label="Animal em destaque e animais sem detecção" className="mt-5 grid min-w-0 gap-5 lg:mt-[27px] xl:grid-cols-2 xl:gap-[27px]">
          <div className="min-w-0">
            <AnimalDestaque
              destino={null}
              dados={posicaoDestaque ? {
                identificacao: posicaoDestaque.identificacao,
                ultimaDeteccaoEm: posicaoDestaque.ultima_deteccao_em,
                dataNascimento: destaque.data?.animal.data_nascimento ?? null,
                sexo: destaque.data?.animal.sexo ?? null,
                raca: destaque.data?.animal.raca ?? null,
                pesoKg: destaque.data?.pesagem?.peso_kg ?? null,
              } : null}
              atualizadoEm={dadosResumo.atualizado_em}
              carregando={Boolean(posicaoDestaque) && destaque.isPending}
            />
            {destaque.isError && <p role="alert" className="mt-2 text-sm text-destructive">Cadastro do animal indisponível: {destaque.error.message}</p>}
          </div>
          <AnimaisSemDeteccao dados={semDeteccao} serie={serieSimulada} serieSimulada />
        </section>

        <Secao titulo="Análise Geral" id="mapa" className="mt-12 lg:mt-[78px]">
          <MapaIlustrativoZona nomeZona={zona.nome} animaisNaZona={zona.quantidade} />
        </Secao>

        <Secao titulo="Histórico de Leitura" id="historico" className="mt-12 lg:mt-[70px]">
          {!filtro ? <Card className="p-6"><p role="status">Selecione a data inicial e a final para consultar o histórico.</p></Card> : <>
            <EstadoBloco consulta={historico} nome="o histórico de leituras" />
            {historico.isError && historico.data && <p role="alert" className="mb-3 text-sm text-destructive">Não foi possível atualizar o histórico; a tabela mostra a consulta anterior.</p>}
            {historico.data && !historicoCompleto && (
              <p className="mb-3 text-sm text-muted-foreground">
                A tabela mostra as {historico.data.linhas.length.toLocaleString("pt-BR")} leituras mais recentes de {historico.data.total.toLocaleString("pt-BR")} no período. Use Exportar para o período completo.
              </p>
            )}
            {historico.data && (
              <HistoricoLeitura
                dados={registros}
                exibirComportamento={false}
                permitirExportacao={historicoCompleto}
                exportacaoCompleta={{
                  rotulo: "Exportar período completo (CSV)",
                  aoExportar: async () => baixarBlob(
                    await fonte.exportarHistorico(filtro),
                    `argos-${zona.nome.replace(/[^\p{L}\p{N}]+/gu, "-").toLowerCase()}-${format(inicio!, "yyyyMMdd")}-${format(addDays(fimExclusivo!, -1), "yyyyMMdd")}.csv`,
                  ),
                }}
              />
            )}
          </>}
        </Secao>
      </>}
    </div>
  );
}
