import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { Route, Routes } from "react-router";
import { Toaster } from "./components/ui/toast";
import MainLayout from "./layouts/MainLayout";
import Vite from "./pages/Vite";
import Auth from "./pages/Auth";
import Home from "./pages/Home";

// ? Isso é da biblioteca Tanstack Query. Serve pra facilitar requisições da API
const queryClient = new QueryClient({
	defaultOptions: {
		queries: {
			// Tempo que o dado é considerado "fresco", ou seja, nenhuma nova
			// requisição HTTP será feita se o usuário voltar para essa tela.
			staleTime: 1000 * 60 * 5, // ? 5 minutos
		},
	},
});

function App() {
	return (
		// Está sendo usado o React Router no modo DECLARATIVO
		<QueryClientProvider client={queryClient}>
			<Routes>
				// ? Renderização condicional de elementos: na rota "auth" alguns elementos não são renderizados, que no caso são a NavBar e o Footer
				<Route element={<MainLayout />}>
					<Route path="/vite" element={<Vite />} />
					<Route path="/" element={<Home />} />
				</Route>
				<Route path="/auth" element={<Auth />} />
			</Routes>
			<Toaster />
		</QueryClientProvider>
	);
}

export default App;
