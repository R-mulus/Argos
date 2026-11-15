import { useRef, useState, type FormEvent } from "react";
import { ArrowRight, Eye, EyeOff, LoaderCircle, LockKeyhole, Mail } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { supabase } from "@/lib/sessao";
import "./Auth.css";

const caminhoLogo = `${import.meta.env.BASE_URL}logo.svg`;
const caminhoNomeArgos = `${import.meta.env.BASE_URL}argos.svg`;

export default function Auth() {
	const [erro, setErro] = useState("");
	const [enviando, setEnviando] = useState(false);
	const [senhaVisivel, setSenhaVisivel] = useState(false);
	const campoSenha = useRef<HTMLInputElement>(null);

	function alternarVisibilidadeSenha() {
		const campo = campoSenha.current;
		const selecao = campo && document.activeElement === campo
			? [campo.selectionStart, campo.selectionEnd] as const
			: null;

		setSenhaVisivel((visivel) => !visivel);
		if (campo && selecao) {
			requestAnimationFrame(() => campo.setSelectionRange(selecao[0], selecao[1]));
		}
	}

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
			if (error) {
				setErro(error.code === "invalid_credentials"
					? "E-mail ou senha inválidos."
					: "Não foi possível entrar. Confira a conexão e os dados da conta.");
			}
		} catch {
			setErro("Não foi possível conectar ao serviço de login.");
		} finally {
			setEnviando(false);
		}
	}

	return (
		<main className="auth">
			<div className="auth-abertura" aria-hidden="true">
				<img src={caminhoLogo} alt="" />
			</div>

			<section className="auth-institucional" aria-label="Argos">
				<img className="auth-marca-dagua" src={caminhoLogo} alt="" aria-hidden="true" />

				<div className="auth-identidade auth-entrada-identidade">
					<img className="auth-simbolo" src={caminhoLogo} alt="" />
					<span className="auth-produto">
						<img src={caminhoNomeArgos} alt="Argos" />
						<span>Monitoramento inteligente de rebanhos</span>
					</span>
				</div>

				<div className="auth-mensagem auth-entrada-mensagem">
					<h2>
						Seu rebanho, sob uma <span>nova perspectiva.</span>
					</h2>
					<p>Acompanhe animais, zonas de detecção e históricos de monitoramento em um só lugar.</p>
				</div>
			</section>

			<section className="auth-area" aria-labelledby="auth-titulo">
				<div className="auth-card auth-entrada-card">
					<header>
						<p className="auth-sobretitulo">Bem-vindo de volta</p>
						<h1 id="auth-titulo">Entrar no Argos</h1>
						<p>Acesse sua propriedade com seu e-mail e senha.</p>
					</header>

					<form className="auth-formulario" onSubmit={entrar} aria-busy={enviando}>
						<fieldset disabled={enviando}>
							<div className="auth-campo auth-entrada-campo">
								<Label htmlFor="email">E-mail</Label>
								<div className="auth-controle">
									<Mail aria-hidden="true" />
									<Input id="email" name="email" type="email" inputMode="email" autoComplete="username" autoCapitalize="none" spellCheck={false} enterKeyHint="next" placeholder="seuemail@exemplo.com" required />
								</div>
							</div>

							<div className="auth-campo auth-entrada-campo">
								<Label htmlFor="senha">Senha</Label>
								<div className="auth-controle auth-controle-senha">
									<LockKeyhole aria-hidden="true" />
									<Input ref={campoSenha} id="senha" name="senha" type={senhaVisivel ? "text" : "password"} autoComplete="current-password" enterKeyHint="go" placeholder="Digite sua senha" required />
									<button
										className="auth-mostrar-senha"
										type="button"
										aria-label={senhaVisivel ? "Ocultar senha" : "Mostrar senha"}
										aria-pressed={senhaVisivel}
										aria-controls="senha"
										onPointerDown={(evento) => evento.preventDefault()}
										onClick={alternarVisibilidadeSenha}
									>
										{senhaVisivel ? <EyeOff aria-hidden="true" /> : <Eye aria-hidden="true" />}
									</button>
								</div>
							</div>

							<div className="auth-feedback auth-entrada-campo" aria-live="polite">
								{!supabase && <p role="alert">Configure o endereço e a chave pública do Supabase para habilitar o login.</p>}
								{erro && <p role="alert">{erro}</p>}
							</div>

							<Button className="auth-entrar auth-entrada-campo" type="submit" disabled={enviando || !supabase}>
								{enviando ? (
									<><LoaderCircle className="auth-carregando" aria-hidden="true" /> Entrando…</>
								) : (
									<>Entrar <ArrowRight aria-hidden="true" /></>
								)}
							</Button>
						</fieldset>
					</form>

					<p className="auth-ajuda">Precisa de acesso? Fale com a equipe responsável pela sua propriedade.</p>
				</div>

				<footer className="auth-rodape auth-entrada-card">Argos · Monitoramento bovino por IoT</footer>
			</section>
		</main>
	);
}
