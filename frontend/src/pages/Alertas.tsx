import { useMemo, useState } from "react";
import { keepPreviousData, useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { CheckCheck, CircleCheck, OctagonAlert, TriangleAlert } from "lucide-react";
import { AvisoAntigo, EstadoBloco, Secao } from "@/components/custom/EstadoConsulta";
import { IndicadorResumo } from "@/components/custom/IndicadorResumo";
import { ItemAlerta } from "@/components/custom/ItemAlerta";
import { SeletorEstadoAlerta, type FiltroEstadoAlerta } from "@/components/custom/SeletorEstadoAlerta";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { toast } from "@/components/ui/toast";
import { useAgora } from "@/hooks/useMonitoramento";
import { fonteDemonstracao, type CenarioDemonstracao } from "@/lib/demonstracaoMonitoramento";
import { chaveMonitoramento, fonteApi } from "@/lib/fonteMonitoramento";
import { ATUALIZACAO_MS } from "@/lib/monitoramento";

const POR_PAGINA = 10;

const vazioPorFiltro: Record<FiltroEstadoAlerta, string> = {
  todos: "Nenhum aviso registrado na central.",
  novo: "Nenhum aviso novo. Tudo em dia!",
  lido: "Nenhum aviso lido aguardando resolução.",
  resolvido: "Nenhum aviso resolvido até o momento.",
};

/** Central de avisos operacionais (`/alertas`). Tela criada sem frame no Figma, com a identidade das demais. */
export default function Alertas({ demonstracao }: { demonstracao?: CenarioDemonstracao }) {
  const fonte = useMemo(() => (demonstracao ? fonteDemonstracao(demonstracao) : fonteApi), [demonstracao]);
  const origem = demonstracao ?? "api";
  const cliente = useQueryClient();
  const agora = useAgora();
  const [filtro, setFiltro] = useState<FiltroEstadoAlerta>("novo");
  const [paginaEscolhida, setPagina] = useState(0);

  const contagem = useQuery({
    queryKey: chaveMonitoramento(origem, "alertas", "contagem"),
    refetchInterval: ATUALIZACAO_MS,
    queryFn: async ({ signal }) => {
      const [novo, lido, resolvido] = await Promise.all((["novo", "lido", "resolvido"] as const).map(e => fonte.alertas(e, 0, 1, signal)));
      return { novo: novo.count, lido: lido.count, resolvido: resolvido.count };
    },
  });
  // Prioridade entre os novos: a API filtra só por estado, então a contagem usa a lista de novos (até 100).
  const novos = useQuery({ queryKey: chaveMonitoramento(origem, "alertas-novos"), queryFn: ({ signal }) => fonte.alertasNovos(signal), refetchInterval: ATUALIZACAO_MS });
  const urgentes = novos.data?.data.filter(a => a.prioridade === "alta" || a.prioridade === "critica").length ?? null;

  const lista = useQuery({
    queryKey: chaveMonitoramento(origem, "alertas", "lista", filtro, paginaEscolhida),
    queryFn: ({ signal }) => fonte.alertas(filtro === "todos" ? null : filtro, paginaEscolhida * POR_PAGINA, POR_PAGINA, signal),
    placeholderData: keepPreviousData,
    refetchInterval: ATUALIZACAO_MS,
  });
  const total = lista.data?.count ?? 0;
  const paginas = Math.max(1, Math.ceil(total / POR_PAGINA));
  // Ao resolver o último aviso da página, volta para a página anterior existente.
  const pagina = Math.min(paginaEscolhida, paginas - 1);
  if (pagina !== paginaEscolhida && !lista.isFetching) setPagina(pagina);

  const atualizar = useMutation({
    mutationFn: ({ id, estado }: { id: string; estado: "lido" | "resolvido" }) => fonte.atualizarAlerta(id, estado),
    onSuccess: (alerta, { estado }) => {
      toast.add({ type: "success", title: estado === "resolvido" ? "Aviso resolvido" : "Aviso marcado como lido", description: alerta.titulo });
    },
    onError: erro => toast.add({ type: "error", title: "Não foi possível atualizar o aviso", description: erro.message }),
    onSettled: () => Promise.all([
      cliente.invalidateQueries({ queryKey: chaveMonitoramento(origem, "alertas") }),
      cliente.invalidateQueries({ queryKey: chaveMonitoramento(origem, "alertas-novos") }),
    ]),
  });

  const contagens = contagem.data && { todos: contagem.data.novo + contagem.data.lido + contagem.data.resolvido, ...contagem.data };

  return (
    <div className="mx-auto w-full max-w-[1786px] min-w-0 pt-8 pb-16 lg:pt-[64px] [&_[data-slot=card]]:ring-foreground/30">
      <div className="mb-6 flex flex-wrap items-center justify-between gap-4 lg:mb-[54px]">
        <h1 className="text-2xl leading-tight font-medium lg:text-[30px]">Central de Alertas</h1>
        <SeletorEstadoAlerta
          value={filtro}
          contagens={contagens ?? undefined}
          onChange={proximo => { setFiltro(proximo); setPagina(0); }}
          className="sm:w-[460px]"
        />
      </div>

      <AvisoAntigo consultas={[contagem, novos, lista]} agora={agora} />
      <section aria-label="Resumo dos avisos" className="grid min-w-0 grid-cols-2 gap-3 sm:gap-5 xl:grid-cols-4 xl:gap-[27px]">
        <IndicadorResumo tom="primario" icone={TriangleAlert} titulo="Avisos Novos" valor={contagem.data?.novo ?? null} descricao="Ainda não lidos" />
        <IndicadorResumo tom="critico" icone={OctagonAlert} titulo="Prioridade Alta" valor={urgentes} descricao="Alta ou crítica, entre os novos" />
        <IndicadorResumo tom="secundario" icone={CheckCheck} titulo="Lidos" valor={contagem.data?.lido ?? null} descricao="Aguardando resolução" />
        <IndicadorResumo tom="sucesso" icone={CircleCheck} titulo="Resolvidos" valor={contagem.data?.resolvido ?? null} descricao="Encerrados na central" />
      </section>
      {contagem.isError && !contagem.data && <EstadoBloco consulta={contagem} nome="o resumo dos avisos" className="mt-5" />}

      <Secao
        titulo="Avisos"
        id="avisos"
        className="mt-10 lg:mt-14"
        extra={lista.data && total > 0 && (
          <p className="text-sm text-muted-foreground">
            {total.toLocaleString("pt-BR")} {total === 1 ? "aviso" : "avisos"} · do mais recente ao mais antigo
          </p>
        )}
      >
        <EstadoBloco consulta={lista} nome="os avisos" />
        {lista.data && (lista.data.data.length === 0
          ? <Card className="p-6 text-muted-foreground">{vazioPorFiltro[filtro]}</Card>
          : (
            <ul className={`grid gap-3 transition-opacity xl:gap-4 ${lista.isPlaceholderData ? "opacity-60" : ""}`} aria-busy={lista.isFetching}>
              {lista.data.data.map(alerta => (
                <li key={alerta.id}>
                  <ItemAlerta
                    alerta={alerta}
                    salvando={atualizar.isPending && atualizar.variables?.id === alerta.id ? atualizar.variables.estado : null}
                    aoAtualizar={estado => atualizar.mutate({ id: alerta.id, estado })}
                  />
                </li>
              ))}
            </ul>
          ))}
        {paginas > 1 && (
          <div className="mt-5 flex flex-wrap items-center justify-end gap-3">
            <Button variant="outline" disabled={pagina === 0 || lista.isFetching} onClick={() => setPagina(pagina - 1)}>Anterior</Button>
            <span className="text-sm">Página {pagina + 1} de {paginas}</span>
            <Button variant="outline" disabled={pagina + 1 >= paginas || lista.isFetching} onClick={() => setPagina(pagina + 1)}>Próxima</Button>
          </div>
        )}
      </Secao>
    </div>
  );
}
