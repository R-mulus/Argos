import { useState, type FormEvent } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { supabase } from "@/lib/sessao";

export default function Auth() {
	const [erro, setErro] = useState("");
	const [enviando, setEnviando] = useState(false);
	async function entrar(evento: FormEvent<HTMLFormElement>) {
		evento.preventDefault();
		if (!supabase || enviando) return;
		const dados = new FormData(evento.currentTarget);
		setErro("");
		setEnviando(true);
		try {
			const { error } = await supabase.auth.signInWithPassword({
				email: String(dados.get("email")).trim(),
				password: String(dados.get("senha")),
			});
			if (error) setErro(error.code === "invalid_credentials" ? "E-mail ou senha inválidos." : "Não foi possível entrar. Confira a conexão e os dados da conta.");
		} catch {
			setErro("Não foi possível conectar ao serviço de login.");
		} finally {
			setEnviando(false);
		}
	}
	return (
		<main>
			<h1>Entrar no Argos</h1>
			<form onSubmit={entrar}>
				<Label htmlFor="email">E-mail</Label>
				<Input id="email" name="email" type="email" autoComplete="username" required />
				<Label htmlFor="senha">Senha</Label>
				<Input id="senha" name="senha" type="password" autoComplete="current-password" required />
				<Button type="submit" disabled={enviando || !supabase}>{enviando ? "Entrando…" : "Entrar"}</Button>
				{!supabase && <p role="alert">Configure o endereço e a chave pública do Supabase para habilitar o login.</p>}
				{erro && <p role="alert">{erro}</p>}
			</form>
		</main>
	);
}
