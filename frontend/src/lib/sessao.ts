import { createClient } from "@supabase/supabase-js";

const url = import.meta.env.VITE_SUPABASE_URL;
const chave = import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY;
export const supabase = url && chave ? createClient(url, chave) : null;

/** Erro HTTP da API, com o status e o código do corpo `{ error: { code, message } }`. */
export class ErroApi extends Error {
	readonly status: number;
	readonly codigo?: string;
	constructor(mensagem: string, status: number, codigo?: string) {
		super(mensagem);
		this.name = "ErroApi";
		this.status = status;
		this.codigo = codigo;
	}
}

/** Requisição autenticada na API do Argos; devolve a resposta já validada. */
async function requisitarApi(caminho: string, signal?: AbortSignal, init: RequestInit = {}): Promise<Response> {
	const sessao = await supabase?.auth.getSession();
	const token = sessao?.data.session?.access_token;
	if (!token) throw new Error("Entre novamente para consultar seus dados.");
	const base = import.meta.env.VITE_API_URL || "http://localhost:3333/api";
	const resposta = await fetch(base.replace(/\/$/, "") + caminho, {
		...init,
		headers: { ...init.headers, Authorization: `Bearer ${token}` },
		signal,
	});
	if (!resposta.ok) {
		const corpo = await resposta.json().catch(() => null);
		throw new ErroApi(corpo?.error?.message || "Não foi possível consultar a API.", resposta.status, corpo?.error?.code);
	}
	return resposta;
}

export async function consultarApi<T>(caminho: string, signal: AbortSignal): Promise<T> {
	return (await requisitarApi(caminho, signal)).json();
}

/** Baixa um arquivo gerado pela API, como a exportação CSV do histórico. */
export async function baixarDaApi(caminho: string, signal?: AbortSignal): Promise<Blob> {
	return (await requisitarApi(caminho, signal)).blob();
}

/** POST ou PATCH com corpo JSON; devolve o JSON da resposta. */
export async function enviarApi<T>(caminho: string, metodo: "POST" | "PATCH", corpo: unknown): Promise<T> {
	const resposta = await requisitarApi(caminho, undefined, {
		method: metodo,
		headers: { "Content-Type": "application/json" },
		body: JSON.stringify(corpo),
	});
	return resposta.json();
}
