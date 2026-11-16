import { Outlet } from "react-router";
import Navbar from "@/components/custom/Navbar";

export default function MainLayout() {
	// Fundo branco e espaço superior do Figma em todas as telas autenticadas.
	return (
		<div className="min-h-screen bg-card pt-5 lg:pt-12">
			<Navbar />

			<main className="lg:px-16 px-4">
				<Outlet />{" "}
				{/* // ? "Outlet" é como um placeholder para o conteúdo que será renderizado*/}
			</main>

			
		</div>
	);
}
