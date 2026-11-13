import { useEffect, useState } from "react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import type { Session } from "@supabase/supabase-js";
import { Link, Navigate, Route, Routes, useLocation } from "react-router";
import { Toaster } from "./components/ui/toast";
import MainLayout from "./layouts/MainLayout";
import { supabase } from "./lib/sessao";
import Auth from "./pages/Auth";
import Animals from "./pages/Animals";
import Home from "./pages/Home";
import Listagem from "./pages/Listagem";
import Monitoramento from "./pages/Monitoramento";
import Vite from "./pages/Vite";

function AreaAutenticada({ sessao }: { sessao: Session }) {
	const [client] = useState(() => new QueryClient({ defaultOptions: { queries: { retry: 1 } } }));
	return (
		<QueryClientProvider client={client}>
			<Routes>
				<Route element={<MainLayout />}>
					<Route index element={<Monitoramento />} />
					<Route path="animals" element={<Animals />} />
					<Route path="receptores" element={<Listagem key="receptores" secao="Receptores" />} />
					<Route path="alertas" element={<Listagem key="alertas" secao="Alertas" />} />
					<Route path="perfil" element={<><h1>Perfil</h1><p>{sessao.user.email}</p></>} />
					<Route path="configuracoes" element={<><h1>Configurações</h1><p>Configurações em desenvolvimento.</p></>} />
					<Route path="*" element={<><h1>Página não encontrada</h1><Link to="/">Voltar ao início</Link></>} />
				</Route>
			</Routes>
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
