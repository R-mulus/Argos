import { useEffect, useMemo, useState } from "react";
import { keepPreviousData, useQuery } from "@tanstack/react-query";
import { addDays, differenceInCalendarDays, format, startOfDay } from "date-fns";
import { AnimalDestaque } from "@/components/custom/AnimalDestaque";
import { CartaoZona } from "@/components/custom/CartaoZona";
import { AvisoAntigo, EstadoBloco, Secao } from "@/components/custom/EstadoConsulta";
import { ContabilizacaoCabecasMes, type RegistroMensalCabecas } from "@/components/custom/ContabilizacaoCabecasMes";
import { DadosProcessadosDia } from "@/components/custom/DadosProcessadosDia";
import { MediaMovimentacao } from "@/components/custom/MediaMovimentacao";
import { QuantidadeCabecas } from "@/components/custom/QuantidadeCabecas";
import { ReceptorResumoCard } from "@/components/custom/ResumoReceptorCard";
import { SeloSimulado } from "@/components/custom/SeloSimulado";
import { SeletorIntervaloDatas } from "@/components/custom/SeletorIntervaloDatas";
import { SeletorPeriodo, type PeriodoVisualizacao } from "@/components/custom/SeletorPeriodo";
import { TemperaturaMedia } from "@/components/custom/TemperaturaMedia";
import type { IntervaloDatas } from "@/components/custom/CalendarioIntervalo";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { fonteDemonstracao, type CenarioDemonstracao } from "@/lib/demonstracaoMonitoramento";
import { chaveMonitoramento, fonteApi } from "@/lib/fonteMonitoramento";
import { ATUALIZACAO_MS, RECENCIA_MS, escolherDestaque, indicadoresZona, intervaloDoPeriodo } from "@/lib/monitoramento";

const RECEPTORES_POR_PAGINA = 4;

// Série mensal de exemplo (Jan–Out, como no Figma). Não há endpoint de histórico mensal nem meta "ideal".
const mesesSimulados: RegistroMensalCabecas[] = [
  { mes: "Jan", real: 860, ideal: 740 }, { mes: "Fev", real: 300, ideal: 90 }, { mes: "Mar", real: 510, ideal: 450 },
  { mes: "Abr", real: 250, ideal: 380 }, { mes: "Mai", real: 235, ideal: 500 }, { mes: "Jun", real: 660, ideal: 800 },
  { mes: "Jul", real: 390, ideal: 420 }, { mes: "Ago", real: 605, ideal: 520 }, { mes: "Set", real: 285, ideal: 790 },
  { mes: "Out", real: 530, ideal: 785 },
];

export default function Monitoramento({ demonstracao }: { demonstracao?: CenarioDemonstracao }) {
  const fonte = useMemo(() => (demonstracao ? fonteDemonstracao(demonstracao) : fonteApi), [demonstracao]);
  const origem = demonstracao ?? "api";
  const [periodo, setPeriodo] = useState<PeriodoVisualizacao>("semana");
  const [intervalo, setIntervalo] = useState<IntervaloDatas>(() => intervaloDoPeriodo("semana"));
  const [paginaReceptores, setPaginaReceptores] = useState(0);
  const [agora, setAgora] = useState(() => Date.now());
  useEffect(() => {
    const timer = window.setInterval(() => setAgora(Date.now()), ATUALIZACAO_MS);
    return () => window.clearInterval(timer);
  }, []);

  const resumo = useQuery({ queryKey: chaveMonitoramento(origem, "resumo"), queryFn: ({ signal }) => fonte.resumo(signal), refetchInterval: ATUALIZACAO_MS });
  const receptores = useQuery({ queryKey: chaveMonitoramento(origem, "receptores"), queryFn: ({ signal }) => fonte.receptores(signal), refetchInterval: ATUALIZACAO_MS });
  const zonas = useQuery({ queryKey: chaveMonitoramento(origem, "zonas"), queryFn: ({ signal }) => fonte.zonas(signal), refetchInterval: 2 * ATUALIZACAO_MS });

  // Leituras: hoje (card 3) e média diária do intervalo escolhido (card 4). Fim exclusivo no dia seguinte.
  const hojeInicio = startOfDay(new Date(agora));
  const hoje = hojeInicio.toISOString();
  const amanha = addDays(hojeInicio, 1).toISOString();
  const inicio = intervalo.from ? startOfDay(intervalo.from) : null;
  const fimExclusivo = intervalo.to ? addDays(startOfDay(intervalo.to), 1) : null;
  const dias = inicio && fimExclusivo ? differenceInCalendarDays(fimExclusivo, inicio) : 0;
  const leituras = useQuery({
    queryKey: chaveMonitoramento(origem, "leituras", hoje, inicio?.toISOString() ?? "", fimExclusivo?.toISOString() ?? ""),
    enabled: dias > 0,
    placeholderData: keepPreviousData,
    refetchInterval: ATUALIZACAO_MS,
    queryFn: async ({ signal }) => {
      const [deHoje, doPeriodo] = await Promise.all([
        fonte.contarLeituras(hoje, amanha, signal),
        fonte.contarLeituras(inicio!.toISOString(), fimExclusivo!.toISOString(), signal),
      ]);
      return { deHoje, mediaDiaria: Math.round((doPeriodo / dias) * 10) / 10 };
    },
  });

  const dadosResumo = resumo.data;
  const posicaoDestaque = useMemo(() => escolherDestaque(dadosResumo?.animais ?? []), [dadosResumo]);
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

  const listaReceptores = receptores.data?.data ?? [];
  const zonaDoReceptor = new Map((zonas.data?.data ?? []).filter(z => z.ativa && z.receptor_id).map(z => [z.receptor_id!, z.id]));
  const paginas = Math.max(1, Math.ceil(listaReceptores.length / RECEPTORES_POR_PAGINA));
  const pagina = Math.min(paginaReceptores, paginas - 1);
  const visiveis = listaReceptores.slice(pagina * RECEPTORES_POR_PAGINA, (pagina + 1) * RECEPTORES_POR_PAGINA);

  // RSSI exibido: a última leitura da zona do receptor, quando foi ele quem a recebeu nos últimos 5 minutos.
  const alvosRssi = visiveis.filter(r => r.estado_comunicacao === "recente" && zonaDoReceptor.has(r.id)).map(r => ({ receptor: r.id, zona: zonaDoReceptor.get(r.id)! }));
  const rssi = useQuery({
    queryKey: chaveMonitoramento(origem, "rssi", alvosRssi.map(a => `${a.receptor}:${a.zona}`).join(",")),
    enabled: alvosRssi.length > 0,
    placeholderData: keepPreviousData,
    refetchInterval: ATUALIZACAO_MS,
    queryFn: async ({ signal }) => {
      const pares = await Promise.all(alvosRssi.map(async ({ receptor, zona }) => {
        const leitura = await fonte.ultimaLeituraZona(zona, signal);
        const instante = leitura?.instante_referencia ? Date.parse(leitura.instante_referencia) : NaN;
        const valida = leitura && leitura.receptor_id === receptor && Date.now() - instante <= RECENCIA_MS;
        return [receptor, valida ? leitura.rssi_dbm : null] as const;
      }));
      return Object.fromEntries(pares) as Record<string, number | null>;
    },
  });

  function mudarPeriodo(proximo: PeriodoVisualizacao) {
    setPeriodo(proximo);
    setIntervalo(intervaloDoPeriodo(proximo));
  }

  const descricaoPeriodo = !inicio || !fimExclusivo ? "Selecione a data final do período"
    : dias === 1 ? `Leituras em ${format(inicio, "dd/MM")}`
    : `Média diária de ${format(inicio, "dd/MM")} a ${format(addDays(fimExclusivo, -1), "dd/MM")}`;

  const resumoCompleto = dadosResumo && (
    <p className="text-sm text-muted-foreground">
      {dadosResumo.recentes.toLocaleString("pt-BR")} de {dadosResumo.total_ativos.toLocaleString("pt-BR")} animais detectados nos últimos 5 min
      {dadosResumo.desatualizados > 0 && ` · ${dadosResumo.desatualizados} com detecção antiga`}
      {dadosResumo.sem_horario > 0 && ` · ${dadosResumo.sem_horario} sem horário confiável`}
      {dadosResumo.nunca_detectados > 0 && ` · ${dadosResumo.nunca_detectados} nunca detectados`}
    </p>
  );

  return (
    <div className="mx-auto w-full max-w-[1786px] min-w-0 pt-8 pb-16 lg:pt-[64px] [&_[data-slot=card]]:ring-foreground/30">
      <section aria-labelledby="visao-geral">
        <div className="mb-6 flex flex-wrap items-center justify-between gap-4 lg:mb-[54px]">
          <h1 id="visao-geral" className="text-2xl leading-tight font-medium lg:text-[30px]">Visão Geral</h1>
          <div className="flex w-full flex-wrap items-center gap-3 sm:w-auto">
            <SeletorPeriodo value={periodo} onChange={mudarPeriodo} className="sm:w-[291px]" />
            <SeletorIntervaloDatas value={intervalo} onChange={valor => setIntervalo(valor ?? { from: undefined })} className="sm:w-[263px]" />
          </div>
        </div>
        <AvisoAntigo consultas={[leituras]} agora={agora} />
        <div className="grid min-w-0 gap-5 sm:grid-cols-2 xl:grid-cols-4 xl:gap-[27px]">
          {[0, 1].map(i => (
            <div key={i} className="@container relative min-w-0">
              <TemperaturaMedia dados={{ temperaturaCelsius: 26, idAnimalComTemperaturaAlterada: 234 }} className="h-full" />
              <SeloSimulado className="absolute top-9 right-3 @min-[360px]:top-[50px] @min-[360px]:right-4" descricao="Não há sensor de temperatura integrado; valor de exemplo." />
            </div>
          ))}
          {leituras.data ? <>
            <DadosProcessadosDia dados={{ quantidade: leituras.data.deHoje, intervaloMinutos: 0 }} descricao="Leituras registradas hoje" />
            <DadosProcessadosDia dados={{ quantidade: leituras.data.mediaDiaria, intervaloMinutos: 0 }} descricao={descricaoPeriodo} />
          </> : dias > 0
            ? <EstadoBloco consulta={leituras} nome="as leituras do período" className="sm:col-span-2" />
            : <Card className="p-6 sm:col-span-2"><p role="status">Selecione a data inicial e a final para consultar as leituras.</p></Card>}
        </div>
      </section>

      <section aria-label="Animal em destaque e processamento de imagens" className="mt-10 grid min-w-0 gap-5 sm:grid-cols-2 lg:mt-[119px] xl:grid-cols-4 xl:gap-[27px]">
        <div className="min-w-0 sm:col-span-2 xl:row-span-2">
          {resumo.isError && !dadosResumo ? <EstadoBloco consulta={resumo} nome="o animal em destaque" className="h-full" /> : <AnimalDestaque
            dados={posicaoDestaque ? {
              identificacao: posicaoDestaque.identificacao,
              ultimaDeteccaoEm: posicaoDestaque.ultima_deteccao_em,
              dataNascimento: destaque.data?.animal.data_nascimento ?? null,
              sexo: destaque.data?.animal.sexo ?? null,
              raca: destaque.data?.animal.raca ?? null,
              pesoKg: destaque.data?.pesagem?.peso_kg ?? null,
            } : null}
            atualizadoEm={dadosResumo?.atualizado_em}
            carregando={resumo.isPending || (Boolean(posicaoDestaque) && destaque.isPending)}
          />}
          {destaque.isError && <p role="alert" className="mt-2 text-sm text-destructive">Cadastro do animal indisponível: {destaque.error.message}</p>}
        </div>
        {[0, 1, 2, 3].map(i => (
          <div key={i} className="@container relative min-w-0">
            <DadosProcessadosDia
              titulo="Dados Processados"
              variante="detalhado"
              dados={{ quantidade: 25, intervaloMinutos: 60 }}
              className="h-full"
              detalhes="Exemplo de processamento de imagens. A fonte de imagens e o modelo de análise ainda não estão integrados."
            />
            <SeloSimulado className="absolute top-14 right-3 @min-[400px]:top-[84px] @min-[400px]:right-5" />
          </div>
        ))}
      </section>

      <Secao titulo="Análise Geral" id="zonas" extra={resumoCompleto} className="mt-12 lg:mt-[106px]">
        <EstadoBloco consulta={resumo} nome="o monitoramento por zona" />
        <AvisoAntigo consultas={[resumo, zonas, receptores]} agora={agora} />
        {dadosResumo && (dadosResumo.zonas.length ? (
          <div className="grid min-w-0 gap-5 sm:grid-cols-2 xl:grid-cols-4 xl:gap-[26px]">
            {dadosResumo.zonas.map(zona => {
              const { receptoresAtivos, totalReceptores, coleirasAtivas } = indicadoresZona(zona.id, dadosResumo, zonas.data?.data, receptores.data?.data);
              return (
                <CartaoZona
                  key={zona.id}
                  destino={`/animals?zona=${encodeURIComponent(zona.id)}`}
                  dados={{ nome: zona.nome, animaisAtivos: zona.quantidade, receptoresAtivos, totalReceptores, coleirasAtivas }}
                />
              );
            })}
          </div>
        ) : <Card className="p-6">Nenhuma zona ativa para monitoramento.</Card>)}
      </Secao>

      <Secao titulo="Análise Geral" id="graficos" className="mt-12 lg:mt-[75px]">
        <div className="grid min-w-0 items-stretch gap-5 xl:grid-cols-[1034fr_725fr] xl:gap-[26px]">
          <div className="relative min-w-0 xl:min-h-[420px]">
            <ContabilizacaoCabecasMes dados={mesesSimulados} className="h-full" />
            <SeloSimulado className="absolute right-3 bottom-1.5" descricao="Não há histórico mensal nem meta ideal na API; série de exemplo." />
          </div>
          <div className="min-w-0">
            {dadosResumo
              ? <QuantidadeCabecas dados={dadosResumo.zonas} recentesSemZona={dadosResumo.recentes_sem_zona} className="h-full" />
              : <EstadoBloco consulta={resumo} nome="a quantidade de cabeças" className="h-full" />}
          </div>
        </div>
        <div className="relative mt-5 min-w-0 xl:mt-[26px] xl:ml-auto xl:flex xl:min-h-[425px] xl:w-[57.9%] xl:flex-col">
          <MediaMovimentacao className="xl:flex-1" />
          <SeloSimulado className="absolute right-3 bottom-1.5" descricao="Movimentação ilustrativa; a distância não é calculada pelo RSSI." />
        </div>
      </Secao>

      <Secao titulo="Status Receptores" id="receptores" className="mt-12 lg:mt-[43px]">
        <EstadoBloco consulta={receptores} nome="os receptores" />
        <AvisoAntigo consultas={[receptores]} agora={agora} />
        {receptores.data && (visiveis.length ? (
          <div className="grid min-w-0 gap-5 sm:grid-cols-2 xl:grid-cols-4 xl:gap-[35px]">
            {visiveis.map(receptor => (
              <ReceptorResumoCard
                key={receptor.id}
                className="h-full max-w-none"
                data={{ ...receptor, rssiDbm: rssi.data?.[receptor.id] ?? null, batteryPercent: null, model: null }}
              />
            ))}
          </div>
        ) : <Card className="p-6">Nenhum receptor cadastrado.</Card>)}
        {paginas > 1 && (
          <div className="mt-5 flex flex-wrap items-center justify-end gap-3">
            <Button variant="outline" disabled={pagina === 0} onClick={() => setPaginaReceptores(pagina - 1)}>Anterior</Button>
            <span className="text-sm">Página {pagina + 1} de {paginas}</span>
            <Button variant="outline" disabled={pagina + 1 >= paginas} onClick={() => setPaginaReceptores(pagina + 1)}>Próxima</Button>
          </div>
        )}
      </Secao>
    </div>
  );
}
