import { useQuery } from "@tanstack/react-query";
import type { ResumoMonitoramento } from "@argos/shared";
import { QuantidadeCabecas } from "@/components/custom/QuantidadeCabecas";
import { consultarApi } from "@/lib/sessao";

export default function Monitoramento() {
	const consulta = useQuery({
		queryKey: ["monitoramento", "resumo"],
		queryFn: ({ signal }) => consultarApi<{ data: ResumoMonitoramento }>("/monitoramento/resumo", signal),
		refetchInterval: 30_000,
	});
	if (consulta.isPending) return <p role="status">Carregando monitoramento…</p>;
	if (consulta.isError) return <p role="alert">{consulta.error.message}</p>;
	const resumo = consulta.data.data;
	const zonas = resumo.recentes_sem_zona > 0
		? [...resumo.zonas, { id: "sem-zona", nome: "Sem zona", quantidade: resumo.recentes_sem_zona }]
		: resumo.zonas;
	return <><h1>Monitoramento</h1><p>{resumo.total_ativos} animais ativos · {resumo.recentes} com detecção recente</p><QuantidadeCabecas dados={zonas} /></>;
}
