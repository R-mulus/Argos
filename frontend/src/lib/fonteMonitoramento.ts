import type { Alerta, ComunicacaoReceptor, DeteccaoHistorico, HistoricoPesagens, Pesagem, ResumoMonitoramento } from "@argos/shared";
import { lerCsv, type LeituraAnimal } from "@/lib/historico";
import { baixarDaApi, consultarApi, enviarApi } from "@/lib/sessao";

export type Pagina<T> = { data: T[]; count: number; limit: number; offset: number };

/** Campos do cadastro de zona (`GET /api/zonas`) usados pela tela inicial. */
export type ZonaCadastro = { id: string; nome: string; receptor_id: string | null; ativa: boolean };

/** Campos do cadastro de animal (`GET /api/animais/:id`) usados pela tela inicial. */
export type AnimalCadastro = {
	id: string;
	identificacao: string;
	sexo: "macho" | "femea" | null;
	raca: string | null;
	data_nascimento: string | null;
};

export type EstadoAlerta = Alerta["estado"];

/** Filtros do histórico de detecções; o período inclui `inicio` e exclui `fim`. */
export type FiltroHistorico = { zonaId: string; inicio: string; fim: string };

/** Consultas das telas de monitoramento. A prévia pública fornece a mesma interface com dados simulados. */
export interface FonteMonitoramento {
	resumo(signal: AbortSignal): Promise<ResumoMonitoramento>;
	/** Até 100 receptores, suficiente para a demonstração acadêmica. */
	receptores(signal: AbortSignal): Promise<Pagina<ComunicacaoReceptor>>;
	zonas(signal: AbortSignal): Promise<Pagina<ZonaCadastro>>;
	/** Total de leituras com instante de referência em [inicio, fim). */
	contarLeituras(inicio: string, fim: string, signal: AbortSignal): Promise<number>;
	animal(id: string, signal: AbortSignal): Promise<AnimalCadastro>;
	ultimaPesagem(animalId: string, signal: AbortSignal): Promise<Pesagem | null>;
	ultimaLeituraZona(zonaId: string, signal: AbortSignal): Promise<DeteccaoHistorico | null>;
	/** Avisos novos da propriedade (até 100). */
	alertasNovos(signal: AbortSignal): Promise<Pagina<Alerta>>;
	/** Uma página do histórico (até 100 linhas), do mais recente ao mais antigo. */
	historico(filtro: FiltroHistorico, offset: number, signal: AbortSignal): Promise<Pagina<DeteccaoHistorico>>;
	/** CSV completo do filtro, gerado pelo servidor em uma única consulta. */
	exportarHistorico(filtro: FiltroHistorico): Promise<Blob>;
	/**
	 * Animal e instante de todas as leituras em [inicio, fim), de todas as zonas. Usa a exportação do
	 * servidor, que devolve o período inteiro numa consulta; serve à contagem de cabeças por mês.
	 */
	leiturasPorAnimal(inicio: string, fim: string, signal: AbortSignal): Promise<LeituraAnimal[]>;
	/** Central de avisos: página filtrada por estado (`null` = todos), da criação mais recente à mais antiga. */
	alertas(estado: EstadoAlerta | null, offset: number, limite: number, signal: AbortSignal): Promise<Pagina<Alerta>>;
	/** Marca um aviso como lido ou resolvido; o banco preenche as datas. */
	atualizarAlerta(id: string, estado: Exclude<EstadoAlerta, "novo">): Promise<Alerta>;
}

/** Chaves do TanStack Query da tela inicial; `origem` separa API e prévia simulada. */
export const chaveMonitoramento = (origem: string, ...partes: (string | number)[]) => ["inicio", origem, ...partes];

const parametros =(valores: Record<string, string>) => new URLSearchParams(valores).toString();

export const fonteApi: FonteMonitoramento = {
	resumo: async signal => (await consultarApi<{ data: ResumoMonitoramento }>("/monitoramento/resumo", signal)).data,
	receptores: signal => consultarApi<Pagina<ComunicacaoReceptor>>("/monitoramento/receptores?limit=100&offset=0", signal),
	zonas: signal => consultarApi<Pagina<ZonaCadastro>>("/zonas?limit=100&offset=0", signal),
	contarLeituras: async (inicio, fim, signal) =>
		(await consultarApi<Pagina<DeteccaoHistorico>>(`/deteccoes?${parametros({ inicio, fim, limit: "1", offset: "0" })}`, signal)).count,
	animal: async (id, signal) => (await consultarApi<{ data: AnimalCadastro }>(`/animais/${encodeURIComponent(id)}`, signal)).data,
	ultimaPesagem: async (animalId, signal) =>
		(await consultarApi<HistoricoPesagens>(`/animais/${encodeURIComponent(animalId)}/pesagens?limit=1&offset=0`, signal)).data[0] ?? null,
	ultimaLeituraZona: async (zonaId, signal) =>
		(await consultarApi<Pagina<DeteccaoHistorico>>(`/deteccoes?${parametros({ zona_id: zonaId, limit: "1", offset: "0" })}`, signal)).data[0] ?? null,
	alertasNovos: signal => consultarApi<Pagina<Alerta>>("/alertas?estado=novo&limit=100&offset=0", signal),
	historico: ({ zonaId, inicio, fim }, offset, signal) =>
		consultarApi<Pagina<DeteccaoHistorico>>(`/deteccoes?${parametros({ zona_id: zonaId, inicio, fim, limit: "100", offset: String(offset) })}`, signal),
	exportarHistorico: ({ zonaId, inicio, fim }) => baixarDaApi(`/deteccoes/exportar?${parametros({ zona_id: zonaId, inicio, fim })}`),
	leiturasPorAnimal: async (inicio, fim, signal) => {
		const csv = await (await baixarDaApi(`/deteccoes/exportar?${parametros({ inicio, fim })}`, signal)).text();
		return lerCsv(csv).flatMap(l => (l.animal_id && l.instante_referencia ? [{ animalId: l.animal_id, instante: l.instante_referencia }] : []));
	},
	alertas: (estado, offset, limite, signal) =>
		consultarApi<Pagina<Alerta>>(`/alertas?${parametros({ ...(estado ? { estado } : {}), limit: String(limite), offset: String(offset) })}`, signal),
	atualizarAlerta: async (id, estado) => (await enviarApi<{ data: Alerta }>(`/alertas/${encodeURIComponent(id)}`, "PATCH", { estado })).data,
};
