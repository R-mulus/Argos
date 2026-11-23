import { useQuery } from "@tanstack/react-query";
import type { PainelML } from "@argos/shared";
import { Card } from "@/components/ui/card";
import { consultarApi } from "@/lib/sessao";

const valor = (n: number | null, unidade = "") => n == null ? "Sem dados" : `${n.toLocaleString("pt-BR", { maximumFractionDigits: 2 })}${unidade}`;

/** Apresenta resultados calculados pelo SQL; nunca estima KPIs no navegador. */
export function PainelAnaliseML({ animal, inicio, fim, periodo }: {
  animal?: string; inicio: string | null; fim: string | null; periodo: "dia" | "semana" | "mes";
}) {
  const consulta = useQuery({
    queryKey: ["analise-ml", animal, inicio, fim, periodo],
    enabled: Boolean(animal && inicio && fim), retry: false, staleTime: 30_000,
    queryFn: ({ signal }) => consultarApi<{ data: PainelML }>(`/iot/analise?${new URLSearchParams({
      animal_id: animal!, inicio: inicio!, fim: fim!, periodo,
    })}`, signal),
  });
  const painel = consulta.data?.data;
  return <Card className="mt-5 p-6" aria-label="Análise ML do animal em destaque">
    <h2 className="text-xl font-semibold">Análise ML do animal em destaque</h2>
    {!animal || !inicio || !fim ? <p>Selecione um animal e um período.</p>
      : consulta.isPending ? <p role="status">Carregando análise…</p>
      : consulta.isError ? <div role="alert"><p>Análise indisponível. A integração depende das funções SQL da Sprint 7.</p><button type="button" onClick={() => void consulta.refetch()}>Tentar novamente</button></div>
      : painel && <>
        <p>Referencial: {painel.referencial} · Origem: {painel.origem}</p>
        {painel.avisos.map(aviso => <p key={aviso} role="note">{aviso}</p>)}
        <dl className="grid gap-4 sm:grid-cols-3">
          <div><dt>Distância estimada</dt><dd>{valor(painel.resumo.distancia_estimada_m, " m")}</dd></div>
          <div><dt>Cobertura do período</dt><dd>{valor(painel.resumo.cobertura_percentual, "%")}</dd></div>
          <div><dt>Resíduo RMS médio</dt><dd>{valor(painel.resumo.rms_medio_m, " m")}</dd></div>
        </dl>
        <h3 className="font-semibold">Comportamentos observados e validados</h3>
        {painel.comportamentos.disponivel ? <dl className="grid gap-4 sm:grid-cols-4">
          {Object.entries(painel.comportamentos.percentuais).map(([classe, percentual]) => <div key={classe}><dt>{classe.replaceAll("_", " ")}</dt><dd>{valor(percentual, "%")}</dd></div>)}
        </dl> : <p>Sem observações confiáveis para classificar comportamentos.</p>}
        <h3 className="font-semibold">Previsões de posição</h3>
        {!painel.previsoes.length ? <p>Sem previsões disponíveis.</p> : <ul>
          {painel.previsoes.slice(-5).map(p => <li key={p.id}>
            {new Date(p.previsto_para).toLocaleString("pt-BR")}: X {valor(p.proximo_x_m, " m")}, Y {valor(p.proximo_y_m, " m")} · {p.comportamento ?? "Comportamento não classificado"}
          </li>)}
        </ul>}
        <p className="text-sm">Coordenadas no referencial local. Uma previsão de posição não confirma comportamento.</p>
      </>}
  </Card>;
}
