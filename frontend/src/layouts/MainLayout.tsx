import { Outlet } from "react-router";
import Navbar from "@/components/custom/Navbar";

export default function MainLayout() {
	return (
		<>
			<Navbar />

			<main className="lg:px-16 px-4">
				<Outlet />{" "}
				{/* // ? "Outlet" é como um placeholder para o conteúdo que será renderizado*/}
			</main>

			
		</>
	);
}
