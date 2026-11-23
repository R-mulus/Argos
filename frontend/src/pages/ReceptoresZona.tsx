import { useMemo, useRef, useState } from "react";
import { keepPreviousData, useQuery } from "@tanstack/react-query";
import { useSearchParams } from "react-router";
import type { ComunicacaoReceptor } from "@argos/shared";
import { AnalisesModelo } from "@/components/custom/AnalisesModelo";
import { CabecalhoZona } from "@/components/custom/CabecalhoZona";
import { AvisoAntigo, EstadoBloco, Secao } from "@/components/custom/EstadoConsulta";
import { MapaMonitoramento } from "@/components/custom/MapaMonitoramento";
import { ReceptorCard } from "@/components/custom/ReceptorCard";
import { ReceptorResumoCard } from "@/components/custom/ResumoReceptorCard";
import { ResumoZona } from "@/components/custom/ResumoZona";
import { SeloSimulado } from "@/components/custom/SeloSimulado";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { useAgora, usePeriodo, useZonaMonitorada } from "@/hooks/useMonitoramento";
import { fonteDemonstracao, type CenarioDemonstracao } from "@/lib/demonstracaoMonitoramento";
import { espacialApi, espacialDemonstracao } from "@/lib/espacial";
import { chaveMonitoramento, fonteApi } from "@/lib/fonteMonitoramento";
import { LIMITE_LINHAS, buscarHistoricoCompleto, metricasReceptor } from "@/lib/historico";
import { ATUALIZACAO_MS, RECENCIA_MS } from "@/lib/monitoramento";

const POR_PAGINA = 4;

function mensagemReceptor(receptor: ComunicacaoReceptor, temZona: boolean, parcial: boolean) {
  const base = receptor.status === "inativo" ? "Receptor inativo no cadastro."
    : receptor.estado_comunicacao === "recente" ? "O dispositivo está funcionando adequadamente."
    : receptor.estado_comunicacao === "aguardando_primeira_leitura" ? "Aguardando a primeira leitura deste receptor."
    : "Sem leituras nos últimos 5 minutos. Pode não haver coleiras por perto; confira se o receptor está ligado.";
  if (!temZona) return `${base} Sem zona ativa: métricas do período indisponíveis.`;
  return parcial ? `${base} Métricas calculadas sobre as ${LIMITE_LINHAS.toLocaleString("pt-BR")} leituras mais recentes.` : base;
}

/** Tela Receptores: banner e mapa da zona escolhida; cards de todos os receptores da propriedade. */
export default function ReceptoresZona({ demonstracao }: { demonstracao?: CenarioDemonstracao }) {
  const fonte = useMemo(() => (demonstracao ? fonteDemonstracao(demonstracao) : fonteApi), [demonstracao]);
  const fonteEspacial = useMemo(() => (demonstracao ? espacialDemonstracao(demonstracao) : espacialApi), [demonstracao]);
  const origem = demonstracao ?? "api";
  const [parametros, setParametros] = useSearchParams();
  const periodo = usePeriodo();
  const { inicio, fimExclusivo, dias } = periodo;
  const agora = useAgora();
  const { resumo, receptores, zonas, alertas, dadosResumo, listaZonas, zona, indicadores, posicaoDestaque, alertasZona, atualizarTudo } =
    useZonaMonitorada(fonte, origem, parametros.get("zona"));
  const [paginaEscolhida, setPagina] = useState(0);
  const [selecionado, setSelecionado] = useState<string | null>(null);
  const detalhesRef = useRef<HTMLElement>(null);

  const lista = receptores.data?.data ?? [];
  const zonaDoReceptor = new Map((zonas.data?.data ?? []).filter(z => z.ativa && z.receptor_id).map(z => [z.receptor_id!, z.id]));
  const paginas = Math.max(1, Math.ceil(lista.length / POR_PAGINA));
  const pagina = Math.min(paginaEscolhida, paginas - 1);
  const visiveis = lista.slice(pagina * POR_PAGINA, (pagina + 1) * POR_PAGINA);

  // RSSI atual: última leitura da zona recebida pelo próprio receptor nos últimos 5 minutos.
  const alvosRssi = lista.filter(r => r.estado_comunicacao === "recente" && zonaDoReceptor.has(r.id)).map(r => ({ receptor: r.id, zona: zonaDoReceptor.get(r.id)! }));
  const rssi = useQuery({
    queryKey: chaveMonitoramento(origem, "rssi", alvosRssi.map(a => `${a.receptor}:${a.zona}`).join(",")),
    enabled: alvosRssi.length > 0,
    placeholderData: keepPreviousData,
    refetchInterval: ATUALIZACAO_MS,
    queryFn: async ({ signal }) => Object.fromEntries(await Promise.all(alvosRssi.map(async ({ receptor, zona: zonaId }) => {
      const leitura = await fonte.ultimaLeituraZona(zonaId, signal);
      const instante = leitura?.instante_referencia ? Date.parse(leitura.instante_referencia) : NaN;
      return [receptor, leitura && leitura.receptor_id === receptor && Date.now() - instante <= RECENCIA_MS ? leitura.rssi_dbm : null] as const;
    }))) as Record<string, number | null>,
  });

  // Intervalo, registros por dia e perdas de sinal no período, para os receptores da página atual.
  const alvosMetricas = visiveis.filter(r => zonaDoReceptor.has(r.id)).map(r => ({ receptor: r.id, zona: zonaDoReceptor.get(r.id)! }));
  const metricas = useQuery({
    queryKey: chaveMonitoramento(origem, "metricas-receptores", alvosMetricas.map(a => `${a.receptor}:${a.zona}`).join(","), inicio?.toISOString() ?? "", fimExclusivo?.toISOString() ?? ""),
    enabled: alvosMetricas.length > 0 && dias > 0,
    placeholderData: keepPreviousData,
    queryFn: async ({ signal }) => Object.fromEntries(await Promise.all(alvosMetricas.map(async ({ receptor, zona: zonaId }) => {
      const { linhas, total } = await buscarHistoricoCompleto(fonte, { zonaId, inicio: inicio!.toISOString(), fim: fimExclusivo!.toISOString() }, signal);
      const doReceptor = linhas.filter(l => l.receptor_id === receptor);
      const calculo = metricasReceptor(doReceptor, total, fimExclusivo!.getTime());
      const registros = calculo.parcial ? total : doReceptor.length;
      return [receptor, { ...calculo, registrosPorDia: Math.round((registros / dias) * 10) / 10 }] as const;
    }))),
  });

  // Histórico da zona no período (mesma consulta e cache da tela Animais), para o intervalo do banner.
  const historicoZona = useQuery({
    queryKey: chaveMonitoramento(origem, "historico", zona?.id ?? "", inicio?.toISOString() ?? "", fimExclusivo?.toISOString() ?? ""),
    enabled: Boolean(zona && inicio && fimExclusivo),
    placeholderData: keepPreviousData,
    queryFn: ({ signal }) => buscarHistoricoCompleto(fonte, { zonaId: zona!.id, inicio: inicio!.toISOString(), fim: fimExclusivo!.toISOString() }, signal),
  });
  const intervaloZona = historicoZona.data && fimExclusivo
    ? metricasReceptor(historicoZona.data.linhas, historicoZona.data.total, fimExclusivo.getTime()).intervaloMinutos
    : null;

  function abrirDetalhe(indice: number, id: string) {
    setPagina(Math.floor(indice / POR_PAGINA));
    setSelecionado(id);
    detalhesRef.current?.scrollIntoView({ behavior: "smooth", block: "start" });
  }

  // Seleção no mapa: destaca o card e abre a página dele, sem rolar a tela para longe do mapa.
  function selecionarNoMapa(id: string | null) {
    setSelecionado(id);
    const indice = id ? lista.findIndex(r => r.id === id) : -1;
    if (indice >= 0) setPagina(Math.floor(indice / POR_PAGINA));
  }

  const resumidos = lista.length > POR_PAGINA;

  return (
    <div className="mx-auto w-full max-w-[1786px] min-w-0 pt-8 pb-16 lg:pt-[64px] [&_[data-slot=card]]:ring-foreground/30">
      <CabecalhoZona
        titulo="Status Receptores"
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
      {zona && dadosResumo && (
        <ResumoZona
          nome={zona.nome}
          animaisAtivos={zona.quantidade}
          receptoresAtivos={indicadores?.receptoresAtivos ?? null}
          totalReceptores={indicadores?.totalReceptores ?? null}
          coleirasAtivas={indicadores?.coleirasAtivas ?? null}
          intervaloMinutos={intervaloZona}
          animalDestaqueId={posicaoDestaque?.identificacao}
          atualizadoEm={dadosResumo.atualizado_em}
          alertas={alertasZona}
          aoAtualizar={atualizarTudo}
        />
      )}
      {dadosResumo && !zona && <Card className="p-6">Nenhuma zona ativa. Os receptores cadastrados aparecem abaixo.</Card>}

      <section ref={detalhesRef} aria-label="Detalhes dos receptores" className="mt-5 scroll-mt-6 lg:mt-[27px]">
        <EstadoBloco consulta={receptores} nome="os receptores" />
        {receptores.data && (lista.length === 0 ? <Card className="p-6">Nenhum receptor cadastrado.</Card> : <>
          {metricas.isError && <p role="alert" className="mb-3 text-sm text-destructive">Não foi possível calcular as métricas do período: {metricas.error.message}</p>}
          {dias === 0 && <p role="status" className="mb-3 text-sm text-muted-foreground">Selecione a data inicial e a final para calcular as métricas do período.</p>}
          <div className="grid min-w-0 gap-5 xl:grid-cols-2 xl:gap-x-[27px] xl:gap-y-[26px]">
            {visiveis.map(receptor => {
              const zonaId = zonaDoReceptor.get(receptor.id);
              const m = metricas.data?.[receptor.id];
              return (
                <div key={receptor.id} className={selecionado === receptor.id ? "rounded-xl ring-2 ring-primary ring-offset-2" : undefined}>
                  <ReceptorCard
                    detailsPath={zonaId ? `/animals?zona=${encodeURIComponent(zonaId)}` : undefined}
                    mensagem={mensagemReceptor(receptor, Boolean(zonaId), Boolean(m?.parcial))}
                    data={{
                      ...receptor,
                      rssiDbm: rssi.data?.[receptor.id] ?? null,
                      model: null,
                      batteryPercent: null,
                      intervalMinutes: m?.intervaloMinutos == null ? null : Math.round(m.intervaloMinutos * 10) / 10,
                      recordsPerDay: m?.registrosPorDia ?? null,
                      signalLosses: m?.perdasSinal ?? null,
                    }}
                  />
                </div>
              );
            })}
          </div>
          {paginas > 1 && (
            <div className="mt-5 flex flex-wrap items-center justify-end gap-3">
              <Button variant="outline" disabled={pagina === 0} onClick={() => setPagina(pagina - 1)}>Anterior</Button>
              <span className="text-sm">Página {pagina + 1} de {paginas}</span>
              <Button variant="outline" disabled={pagina + 1 >= paginas} onClick={() => setPagina(pagina + 1)}>Próxima</Button>
            </div>
          )}
        </>)}
      </section>

      {/* Com até 4 receptores os cards grandes já mostram todos; os pequenos só aparecem acima disso. */}
      <section aria-label="Todos os receptores e análises do modelo" className={`mt-10 grid min-w-0 items-start gap-5 lg:mt-[83px] xl:gap-[27px] ${resumidos ? "xl:grid-cols-2" : ""}`}>
        {resumidos && <div className="grid min-w-0 gap-5 sm:grid-cols-2 xl:gap-[27px]">
          {lista.map((receptor, indice) => (
            <div key={receptor.id} className="relative min-w-0">
              <ReceptorResumoCard className="h-full max-w-none" data={{ ...receptor, rssiDbm: rssi.data?.[receptor.id] ?? null, batteryPercent: null, model: null }} />
              <button
                type="button"
                onClick={() => abrirDetalhe(indice, receptor.id)}
                aria-label={`Ver detalhes de ${receptor.nome ?? receptor.codigo}`}
                className="absolute inset-0 rounded-xl transition-shadow hover:shadow-md focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring"
              />
            </div>
          ))}
        </div>}
        <div className="relative min-w-0">
          <AnalisesModelo />
          <SeloSimulado className="absolute right-4 bottom-3" descricao="O modelo GRU ainda não está integrado; métricas de exemplo." />
        </div>
      </section>

      <Secao
        titulo="Mapa dos Receptores"
        id="mapa-receptores"
        className="mt-12 lg:mt-[50px]"
        extra={selecionado && lista.some(r => r.id === selecionado) ? (
          <Button variant="outline" className="rounded-full border-2" onClick={() => detalhesRef.current?.scrollIntoView({ behavior: "smooth", block: "start" })}>
            Ver card de {lista.find(r => r.id === selecionado)!.nome ?? lista.find(r => r.id === selecionado)!.codigo}
          </Button>
        ) : undefined}
      >
        <MapaMonitoramento
          fonte={fonteEspacial}
          origem={origem}
          demonstracao={demonstracao}
          resumo={dadosResumo}
          comunicacao={receptores.data?.data}
          zonasCadastro={zonas.data?.data}
          zonaFocoId={zona?.id ?? null}
          foco="receptores"
          agora={agora}
          receptorSelecionado={selecionado}
          aoSelecionarReceptor={selecionarNoMapa}
        />
      </Secao>
    </div>
  );
}
