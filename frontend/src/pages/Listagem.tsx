import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import type { Alerta, ComunicacaoReceptor } from "@argos/shared";
import { Button } from "@/components/ui/button";
import { consultarApi } from "@/lib/sessao";

type Item = { id: string; texto: string };
type Pagina<T> = { data: T[]; count: number };
type Secao = "Animais" | "Receptores" | "Alertas";

async function carregar(secao: Secao, offset: number, signal: AbortSignal): Promise<Pagina<Item>> {
	const filtros = `?limit=20&offset=${offset}`;
	if (secao === "Receptores") {
		const { data, count } = await consultarApi<Pagina<ComunicacaoReceptor>>("/monitoramento/receptores" + filtros, signal);
		return { count, data: data.map(r => ({ id: r.id, texto: r.nome ?? r.codigo })) };
	}
	if (secao === "Alertas") {
		const { data, count } = await consultarApi<Pagina<Alerta>>("/alertas" + filtros, signal);
		return { count, data: data.map(a => ({ id: a.id, texto: a.titulo })) };
	}
	const { data, count } = await consultarApi<Pagina<{ id: string; identificacao: string }>>("/animais" + filtros, signal);
	return { count, data: data.map(a => ({ id: a.id, texto: a.identificacao })) };
}

export default function Listagem({ secao }: { secao: Secao }) {
	const [offset, setOffset] = useState(0);
	const consulta = useQuery({ queryKey: ["lista", secao, offset], queryFn: ({ signal }) => carregar(secao, offset, signal) });
	return (
		<>
			<h1>{secao}</h1>
			{consulta.isPending && <p role="status">Carregando…</p>}
			{consulta.isError && <p role="alert">{consulta.error.message}</p>}
			{consulta.data && <>
				{consulta.data.data.length ? <ul>{consulta.data.data.map(item => <li key={item.id}>{item.texto}</li>)}</ul> : <p>Nenhum registro encontrado.</p>}
				{(offset > 0 || consulta.data.count > 20) && <>
					<Button disabled={!offset} onClick={() => setOffset(offset - 20)}>Anterior</Button>
					<Button disabled={offset + 20 >= consulta.data.count} onClick={() => setOffset(offset + 20)}>Próxima</Button>
				</>}
			</>}
		</>
	);
}
