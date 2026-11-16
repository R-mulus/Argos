import { useEffect, useState } from "react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import type { Session } from "@supabase/supabase-js";
import { Link, Navigate, Route, Routes, useLocation } from "react-router";
import { Toaster } from "./components/ui/toast";
import MainLayout from "./layouts/MainLayout";
import { supabase } from "./lib/sessao";
import Auth from "./pages/Auth";
import Configuracoes from "./pages/Configuracoes";
import Perfil from "./pages/Perfil";
import GuardaPropriedade from "./layouts/GuardaPropriedade";
import { cadastrosApi } from "./lib/cadastros";
import Alertas from "./pages/Alertas";
import Animals from "./pages/Animals";
import Home from "./pages/Home";
import Monitoramento from "./pages/Monitoramento";
import ReceptoresZona from "./pages/ReceptoresZona";
import DemonstracaoInicio from "./pages/DemonstracaoInicio";
import Vite from "./pages/Vite";

function AreaAutenticada({ sessao }: { sessao: Session }) {
	const [client] = useState(() => new QueryClient({ defaultOptions: { queries: { retry: 1 } } }));
	return (
		<QueryClientProvider client={client}>
			<GuardaPropriedade fonte={cadastrosApi} origem="api" email={sessao.user.email}>
			<Routes>
				<Route element={<MainLayout />}>
					<Route index element={<Monitoramento />} />
					<Route path="animals" element={<Animals />} />
					<Route path="receptores" element={<ReceptoresZona />} />
					<Route path="alertas" element={<Alertas />} />
					<Route path="perfil" element={<Perfil conta={{ email: sessao.user.email ?? null, criadaEm: sessao.user.created_at ?? null, ultimoAcesso: sessao.user.last_sign_in_at ?? null }} />} />
					<Route path="configuracoes" element={<Configuracoes />} />
					<Route path="*" element={<><h1>Página não encontrada</h1><Link to="/">Voltar ao início</Link></>} />
				</Route>
			</Routes>
			</GuardaPropriedade>
		</QueryClientProvider>
	);
}

export default function App() {
	const local = useLocation();
	const [sessao, setSessao] = useState<Session | null | undefined>(supabase ? undefined : null);
	useEffect(() => {
		if (!supabase) return;
		const { data } = supabase.auth.onAuthStateChange((_evento, atual) => setSessao(atual));
		return () => data.subscription.unsubscribe();
	}, []);
	const destino = new URLSearchParams(local.search).get("destino") ?? "/";
	const retorno = /^\/(?![/\\])/.test(destino) && destino.split("?")[0] !== "/auth" ? destino : "/";
	return (
		<>
			<Routes>
				<Route path="/demonstracao" element={<><p>Dados de demonstração</p><Home /></>} />
				<Route path="/demonstracao/inicio" element={<DemonstracaoInicio />} />
				<Route path="/demonstracao/animais" element={<DemonstracaoInicio key="animais" tela="animais" />} />
				<Route path="/demonstracao/receptores" element={<DemonstracaoInicio key="receptores" tela="receptores" />} />
				<Route path="/demonstracao/alertas" element={<DemonstracaoInicio key="alertas" tela="alertas" />} />
				<Route path="/demonstracao/configuracoes" element={<DemonstracaoInicio key="configuracoes" tela="configuracoes" />} />
				<Route path="/demonstracao/perfil" element={<DemonstracaoInicio key="perfil" tela="perfil" />} />
				<Route path="/demonstracao/primeiro-acesso" element={<DemonstracaoInicio key="primeiro-acesso" tela="primeiro-acesso" />} />
				<Route path="/vite" element={<Vite />} />
				<Route path="/auth" element={sessao === undefined ? <p role="status">Verificando sessão…</p> : sessao ? <Navigate to={retorno} replace /> : <Auth />} />
				<Route path="*" element={
					sessao === undefined ? <p role="status">Verificando sessão…</p>
						: sessao ? <AreaAutenticada key={sessao.user.id} sessao={sessao} />
						: <Navigate to={`/auth?destino=${encodeURIComponent(local.pathname + local.search)}`} replace />
				} />
			</Routes>
			<Toaster />
		</>
	);
}
