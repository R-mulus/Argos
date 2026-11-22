import { useEffect, useMemo, useState } from "react";
import { keepPreviousData, useQuery } from "@tanstack/react-query";
import { addDays, addMonths, differenceInCalendarDays, format, startOfDay, startOfMonth } from "date-fns";
import { ptBR } from "date-fns/locale";
import { CircleOff, Clock3, MapPinOff, RadioTower, Radio, ScanSearch, Signal } from "lucide-react";
import { IconeBovino } from "@/components/custom/IconeBovino";
import { AnimalDestaque } from "@/components/custom/AnimalDestaque";
import { AvisoEstado } from "@/components/custom/AvisoEstado";
import { IndicadorMonitoramento, type EstadoIndicador } from "@/components/custom/IndicadorMonitoramento";
import { CartaoZona } from "@/components/custom/CartaoZona";
import { AvisoAntigo, EstadoBloco, Secao } from "@/components/custom/EstadoConsulta";
import { ContabilizacaoCabecasMes } from "@/components/custom/ContabilizacaoCabecasMes";
import { MediaMovimentacao } from "@/components/custom/MediaMovimentacao";
import { QuantidadeCabecas } from "@/components/custom/QuantidadeCabecas";
import { ReceptorResumoCard } from "@/components/custom/ResumoReceptorCard";
import { SeletorIntervaloDatas } from "@/components/custom/SeletorIntervaloDatas";
import { SeletorPeriodo, type PeriodoVisualizacao } from "@/components/custom/SeletorPeriodo";
import type { IntervaloDatas } from "@/components/custom/CalendarioIntervalo";
import { Button } from "@/components/ui/button";
import { fonteDemonstracao, type CenarioDemonstracao } from "@/lib/demonstracaoMonitoramento";
import { chaveMonitoramento, fonteApi } from "@/lib/fonteMonitoramento";
import { cabecasPorMes } from "@/lib/historico";
import { rotaApp } from "@/lib/rotas";
import { ATUALIZACAO_MS, RECENCIA_MS, escolherDestaque, indicadoresZona, intervaloDoPeriodo } from "@/lib/monitoramento";

const RECEPTORES_POR_PAGINA = 4;

// Meses exibidos no gráfico de cabeças, incluindo o atual.
const MESES_CABECAS = 6;
const RECENCIA_MIN = RECENCIA_MS / 60_000;

/** Estado de um indicador a partir da consulta que o alimenta: sem dados, nunca zero. */
function estadoDe(consulta: { data?: unknown; isError: boolean }): EstadoIndicador {
  return consulta.data !== undefined ? "pronto" : consulta.isError ? "erro" : "carregando";
}

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

  // Leituras de hoje e média diária do intervalo escolhido (linha sob o título). Fim exclusivo no dia seguinte.
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

  // Animais distintos detectados por mês, calculados das leituras do período inteiro.
  const inicioMeses = startOfMonth(addMonths(new Date(agora), -(MESES_CABECAS - 1)));
  const fimMeses = startOfMonth(addMonths(new Date(agora), 1));
  const cabecas = useQuery({
    queryKey: chaveMonitoramento(origem, "cabecas-mes", inicioMeses.toISOString(), fimMeses.toISOString()),
    placeholderData: keepPreviousData,
    staleTime: 10 * 60_000,
    refetchInterval: 10 * 60_000,
    queryFn: async ({ signal }) => {
      const leituras = await fonte.leiturasPorAnimal(inicioMeses.toISOString(), fimMeses.toISOString(), signal);
      return cabecasPorMes(leituras, inicioMeses, fimMeses).map(({ inicio, quantidade }) => {
        const mes = format(inicio, "MMM", { locale: ptBR });
        return { mes: mes.charAt(0).toUpperCase() + mes.slice(1, 3), real: quantidade };
      });
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

  const rota = (caminho: string) => rotaApp(caminho, demonstracao);
  const intervaloTexto = !inicio || !fimExclusivo ? null
    : dias === 1 ? `em ${format(inicio, "dd/MM")}`
    : `de ${format(inicio, "dd/MM")} a ${format(addDays(fimExclusivo, -1), "dd/MM")}`;
  const linhaLeituras = !intervaloTexto ? "Selecione a data inicial e a final para consultar as leituras."
    : leituras.data ? `${leituras.data.deHoje.toLocaleString("pt-BR")} leituras hoje · média de ${leituras.data.mediaDiaria.toLocaleString("pt-BR")} por dia ${intervaloTexto}`
    : leituras.isError ? "Não foi possível consultar as leituras do período."
    : "Consultando as leituras do período…";

  // Indicadores derivados das consultas existentes (resumo, zonas e comunicação dos receptores).
  const listaZonas = zonas.data?.data;
  const zonasAtivas = listaZonas?.filter(z => z.ativa).length ?? null;
  const receptoresRecentes = receptores.data ? listaReceptores.filter(r => r.estado_comunicacao === "recente").length : null;
  const receptoresAguardando = receptores.data ? listaReceptores.filter(r => r.estado_comunicacao === "aguardando_primeira_leitura").length : null;
  const receptoresSemLeitura = listaReceptores.filter(r => r.estado_comunicacao === "sem_leitura_recente").length;
  const totalReceptores = receptores.data?.count ?? null;
  const estadoResumo = estadoDe(resumo);
  const contabilizados = dadosResumo ? dadosResumo.zonas.reduce((soma, z) => soma + z.quantidade, 0) + dadosResumo.recentes_sem_zona : null;

  const avisoZonas = listaZonas && listaZonas.length > 0 ? (
    <AvisoEstado tom="atencao" titulo="Nenhuma zona de monitoramento ativa" acao={{ rotulo: "Ativar zona", destino: rota("/configuracoes?aba=zonas") }}>
      {listaZonas.length === 1 ? "Há 1 zona cadastrada" : `Há ${listaZonas.length} zonas cadastradas`}, mas nenhuma está ativa. Ative uma zona e vincule um receptor a ela para acompanhar os animais.
    </AvisoEstado>
  ) : (
    <AvisoEstado tom="atencao" titulo="Nenhuma zona de monitoramento ativa" acao={{ rotulo: "Cadastrar zona", destino: rota("/configuracoes?aba=zonas") }}>
      Cadastre ou ative uma zona para começar a acompanhar os animais da propriedade.
    </AvisoEstado>
  );
  const periodoCabecas = `${format(inicioMeses, "MMMM 'de' yyyy", { locale: ptBR })} e ${format(addMonths(fimMeses, -1), "MMMM 'de' yyyy", { locale: ptBR })}`;
  const avisoCabecas = (
    <AvisoEstado tom="informacao" titulo="Ainda não há leituras para este período" className="w-full">
      Não foram registradas detecções de animais entre {periodoCabecas}. O gráfico será preenchido quando houver leituras disponíveis.
    </AvisoEstado>
  );
  const avisoQuantidade = dadosResumo && contabilizados === 0 ? (dadosResumo.total_ativos === 0 ? (
    <AvisoEstado tom="atencao" titulo="Nenhum animal contabilizado" acao={{ rotulo: "Cadastrar animal", destino: rota("/configuracoes?aba=animais") }}>
      Ainda não existem animais contabilizados nas zonas de monitoramento. Cadastre os animais da propriedade para começar.
    </AvisoEstado>
  ) : (
    <AvisoEstado tom="atencao" titulo="Nenhum animal contabilizado" acao={{ rotulo: "Revisar vínculos", destino: rota("/configuracoes?aba=vinculos") }}>
      {dadosResumo.total_ativos.toLocaleString("pt-BR")} {dadosResumo.total_ativos === 1 ? "animal cadastrado" : "animais cadastrados"}, nenhum detectado nos últimos {RECENCIA_MIN} minutos. Confira se as zonas estão ativas, se as coleiras estão vinculadas e se os receptores estão se comunicando.
    </AvisoEstado>
  )) : undefined;

  return (
    <div className="mx-auto w-full max-w-[1786px] min-w-0 pt-8 pb-16 lg:pt-[64px] [&_[data-slot=card]]:ring-foreground/30">
      <section aria-labelledby="resumo-monitoramento">
        <div className="mb-6 flex flex-wrap items-center justify-between gap-4 lg:mb-[54px]">
          <div className="min-w-0">
            <h1 id="resumo-monitoramento" className="text-2xl leading-tight font-medium lg:text-[30px]">Resumo do Monitoramento</h1>
            <p role={leituras.isError ? "alert" : undefined} className={`mt-1 text-sm ${leituras.isError ? "text-destructive" : "text-muted-foreground"}`}>{linhaLeituras}</p>
          </div>
          <div className="flex w-full flex-wrap items-center gap-3 sm:w-auto">
            <SeletorPeriodo value={periodo} onChange={mudarPeriodo} className="sm:w-[291px]" />
            <SeletorIntervaloDatas value={intervalo} onChange={valor => setIntervalo(valor ?? { from: undefined })} className="sm:w-[263px]" />
          </div>
        </div>
        <AvisoAntigo consultas={[resumo, zonas, receptores, leituras]} agora={agora} />
        <div className="grid min-w-0 gap-5 sm:grid-cols-2 xl:grid-cols-4 xl:gap-[27px]">
          <IndicadorMonitoramento
            titulo="Animais cadastrados"
            icone={IconeBovino}
            estado={estadoResumo}
            valor={dadosResumo?.total_ativos ?? null}
            descricao="Animais ativos na propriedade, detectados ou não"
          />
          <IndicadorMonitoramento
            titulo="Detectados recentemente"
            icone={ScanSearch}
            estado={estadoResumo}
            valor={dadosResumo?.recentes ?? null}
            descricao={dadosResumo ? `Últimos ${RECENCIA_MIN} min · de ${dadosResumo.total_ativos.toLocaleString("pt-BR")} cadastrados` : `Detecção nos últimos ${RECENCIA_MIN} minutos`}
          />
          <IndicadorMonitoramento
            titulo="Zonas ativas"
            icone={RadioTower}
            estado={estadoDe(zonas)}
            valor={zonasAtivas}
            descricao={listaZonas ? `De ${listaZonas.length.toLocaleString("pt-BR")} ${listaZonas.length === 1 ? "zona cadastrada" : "zonas cadastradas"}` : "Zonas com monitoramento ativo"}
          />
          <IndicadorMonitoramento
            titulo="Receptores comunicando"
            icone={Signal}
            estado={estadoDe(receptores)}
            valor={receptoresRecentes}
            descricao={totalReceptores !== null ? `Comunicação recente · de ${totalReceptores.toLocaleString("pt-BR")} ${totalReceptores === 1 ? "receptor" : "receptores"}` : "Receptores com comunicação recente"}
          />
        </div>
      </section>

      <section aria-label="Animal em destaque e situação dos animais e receptores" className="mt-10 grid min-w-0 gap-5 sm:grid-cols-2 lg:mt-[119px] xl:grid-cols-4 xl:gap-[27px]">
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
            destino={rota("/animals")}
            atualizadoEm={dadosResumo?.atualizado_em}
            carregando={resumo.isPending || (Boolean(posicaoDestaque) && destaque.isPending)}
          />}
          {destaque.isError && <p role="alert" className="mt-2 text-sm text-destructive">Cadastro do animal indisponível: {destaque.error.message}</p>}
        </div>
        <IndicadorMonitoramento
          variante="destaque"
          titulo="Nunca detectados"
          icone={CircleOff}
          estado={estadoResumo}
          valor={dadosResumo?.nunca_detectados ?? null}
          descricao="Animais cadastrados que ainda não têm nenhuma detecção registrada"
        />
        <IndicadorMonitoramento
          variante="destaque"
          titulo="Detecção desatualizada"
          icone={Clock3}
          estado={estadoResumo}
          valor={dadosResumo?.desatualizados ?? null}
          atencao
          descricao={`Última detecção há mais de ${RECENCIA_MIN} minutos${dadosResumo && dadosResumo.sem_horario > 0 ? ` · ${dadosResumo.sem_horario.toLocaleString("pt-BR")} sem horário confiável` : ""}`}
        />
        <IndicadorMonitoramento
          variante="destaque"
          titulo="Detectados sem zona"
          icone={MapPinOff}
          estado={estadoResumo}
          valor={dadosResumo?.recentes_sem_zona ?? null}
          descricao="Detecção recente por receptor sem zona ativa; não indica saída da propriedade"
        />
        <IndicadorMonitoramento
          variante="destaque"
          titulo="Receptores sem primeira leitura"
          icone={Radio}
          estado={estadoDe(receptores)}
          valor={receptoresAguardando}
          descricao={receptoresSemLeitura > 0
            ? `Nunca enviaram leitura · ${receptoresSemLeitura.toLocaleString("pt-BR")} já enviaram e estão sem leitura recente`
            : "Cadastrados que ainda não enviaram nenhuma leitura"}
        />
      </section>

      <Secao titulo="Monitoramento por Zonas" id="zonas" className="mt-12 lg:mt-[106px]">
        <EstadoBloco consulta={resumo} nome="o monitoramento por zona" />
        <AvisoAntigo consultas={[resumo, zonas, receptores]} agora={agora} />
        {dadosResumo && (dadosResumo.zonas.length ? (
          <div className="grid min-w-0 gap-5 sm:grid-cols-2 xl:grid-cols-4 xl:gap-[26px]">
            {dadosResumo.zonas.map(zona => {
              const { receptoresAtivos, totalReceptores, coleirasAtivas } = indicadoresZona(zona.id, dadosResumo, zonas.data?.data, receptores.data?.data);
              return (
                <CartaoZona
                  key={zona.id}
                  destino={rota(`/animals?zona=${encodeURIComponent(zona.id)}`)}
                  dados={{ nome: zona.nome, animaisAtivos: zona.quantidade, receptoresAtivos, totalReceptores, coleirasAtivas }}
                />
              );
            })}
          </div>
        ) : avisoZonas)}
      </Secao>

      <Secao titulo="Contagem e Histórico do Rebanho" id="graficos" className="mt-12 lg:mt-[75px]">
        <AvisoAntigo consultas={[cabecas]} agora={agora} />
        {/* Barras e rosca lado a lado, com a mesma altura; a linha de movimentação ocupa a largura toda. */}
        <div className="grid min-w-0 items-stretch gap-5 xl:grid-cols-2 xl:gap-[26px]">
          <div className="flex min-w-0">
            {cabecas.data ? (
              <ContabilizacaoCabecasMes
                titulo="Cabeças Detectadas por Mês"
                dados={cabecas.data}
                rotulos={{ real: "Cabeças detectadas" }}
                descricao={`Animais distintos detectados em cada mês, desde o primeiro mês com leitura (até ${MESES_CABECAS} meses).`}
                aviso={avisoCabecas}
                className="flex-1"
              />
            ) : <EstadoBloco consulta={cabecas} nome="a contagem de cabeças por mês" className="flex-1" />}
          </div>
          <div className="flex min-w-0">
            {dadosResumo
              ? <QuantidadeCabecas titulo="Cabeças por Zona" dados={dadosResumo.zonas} recentesSemZona={dadosResumo.recentes_sem_zona} aviso={avisoQuantidade} className="flex-1" />
              : <EstadoBloco consulta={resumo} nome="a quantidade de cabeças" className="flex-1" />}
          </div>
        </div>
        <div className="mt-5 min-w-0 xl:mt-[26px]">
          {/* Sem fonte validada: nenhum valor simulado. A distância não é calculada pelo RSSI. */}
          <MediaMovimentacao dados={null} />
        </div>
      </Secao>

      <Secao titulo="Status dos Receptores" id="receptores" className="mt-12 lg:mt-[43px]">
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
        ) : (
          <AvisoEstado tom="atencao" titulo="Nenhum receptor cadastrado" acao={{ rotulo: "Cadastrar receptor", destino: rota("/configuracoes?aba=dispositivos") }}>
            Cadastre um receptor para configurar o monitoramento dos animais nas zonas da propriedade.
          </AvisoEstado>
        ))}
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
