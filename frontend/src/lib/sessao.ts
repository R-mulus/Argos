import { createClient } from "@supabase/supabase-js";

const url = import.meta.env.VITE_SUPABASE_URL;
const chave = import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY;
export const supabase = url && chave ? createClient(url, chave) : null;

export async function consultarApi<T>(caminho: string, signal: AbortSignal): Promise<T> {
	const sessao = await supabase?.auth.getSession();
	const token = sessao?.data.session?.access_token;
	if (!token) throw new Error("Entre novamente para consultar seus dados.");
	const base = import.meta.env.VITE_API_URL || "http://localhost:3333/api";
	const resposta = await fetch(base.replace(/\/$/, "") + caminho, {
		headers: { Authorization: `Bearer ${token}` },
		signal,
	});
	if (!resposta.ok) {
		const corpo = await resposta.json().catch(() => null);
		throw new Error(corpo?.error?.message || "Não foi possível consultar a API.");
	}
	return resposta.json();
}
