
import { useState } from "react";
import { useLocation, useNavigate } from "react-router";

import {
  Home,
  Icon,
  SatelliteDish,
  TriangleAlert,
  UserRound,
  LogOut,
  Menu,
  Settings,
} from "lucide-react";

import { cowHead } from "@lucide/lab";

import { Button } from "@/components/ui/button";
import { ButtonGroup } from "@/components/ui/button-group";
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";

import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
} from "@/components/ui/sheet";

export default function Navbar() {
  const navigate = useNavigate();
  const location = useLocation();

  const [mobileOpen, setMobileOpen] = useState(false);

  return (
    <nav
      aria-label="Navegação principal"
      className="flex w-full items-center justify-center gap-2 p-2"
    >
      {/* Logo */}
      <div className="flex h-12.5 shrink-0 items-center justify-center gap-5 rounded-argos bg-secondary px-5">
        <img src="./logo.svg" alt="" className="h-8 w-10 object-contain" />
        <img src="./argos.svg" alt="Argos" className="w-18.75 object-contain" />
      </div>

      {/* ========================= */}
      {/* NAVEGAÇÃO DESKTOP         */}
      {/* ========================= */}

      <div className="hidden items-center gap-2 lg:flex">
        {/* Navegação principal */}
        <ButtonGroup className="rounded-argos bg-secondary p-2">
          <ToggleGroup
            size="default"
            variant="default"
            value={[location.pathname]}
            onValueChange={(values) => {
              const selected = values[0];

              if (selected) {
                navigate(selected);
              }
            }}
            className="gap-1"
          >
            {/* Início */}
            <ToggleGroupItem
              value="/"
              aria-label="Ir para Início"
              className="h-9 cursor-pointer gap-2 rounded-argos! border-0! bg-transparent px-3 text-secondary-foreground transition-colors duration-200 hover:bg-secondary-foreground data-pressed:bg-secondary-foreground data-pressed:font-semibold data-pressed:text-secondary"
            >
              <Home className="size-5" />
              <span>Início</span>
            </ToggleGroupItem>

            {/* Animais */}
            <ToggleGroupItem
              value="/animals"
              aria-label="Ir para Animais"
              className="h-9 cursor-pointer gap-2 rounded-argos! border-0! bg-transparent px-3 text-secondary-foreground transition-colors duration-200 hover:bg-secondary-foreground data-pressed:bg-foreground data-pressed:font-semibold data-pressed:text-secondary"
            >
              <Icon iconNode={cowHead} className="size-5" />
              <span>Animais</span>
            </ToggleGroupItem>

            {/* Receptores */}
            <ToggleGroupItem
              value="/receptores"
              aria-label="Ir para Receptores"
              className="h-9 cursor-pointer gap-2 rounded-argos! border-0! bg-transparent px-3 text-secondary-foreground transition-colors duration-200 hover:bg-secondary-foreground data-pressed:bg-foreground data-pressed:font-semibold data-pressed:text-secondary"
            >
              <SatelliteDish className="size-5" />
              <span>Receptores</span>
            </ToggleGroupItem>

            {/* Alertas */}
            <ToggleGroupItem
              value="/alertas"
              aria-label="Ir para Alertas"
              className="h-9 cursor-pointer gap-2 rounded-argos! border-0! bg-transparent px-3 text-secondary-foreground transition-colors duration-200 hover:bg-secondary-foreground data-pressed:bg-foreground data-pressed:font-semibold data-pressed:text-secondary"
            >
              <TriangleAlert className="size-5" />
              <span>Alertas</span>
            </ToggleGroupItem>
          </ToggleGroup>
        </ButtonGroup>

        {/* Navegação da conta */}
        <ButtonGroup className="rounded-argos bg-secondary p-2">
          <ToggleGroup
            size="default"
            variant="default"
            value={[location.pathname]}
            onValueChange={(values) => {
              const selected = values[0];

              if (selected) {
                navigate(selected);
              }
            }}
            className="gap-1"
          >
            {/* Configurações */}
            <ToggleGroupItem
              value="/configuracoes"
              aria-label="Ir para Configurações"
              className="h-9 cursor-pointer gap-2 rounded-argos! border-0! bg-transparent px-3 text-secondary-foreground transition-colors duration-200 hover:bg-secondary-foreground data-pressed:bg-foreground data-pressed:font-semibold data-pressed:text-secondary"
            >
              <Settings className="size-5" />
              <span>Configurações</span>
            </ToggleGroupItem>

            {/* Perfil */}
            <ToggleGroupItem
              value="/perfil"
              aria-label="Ir para Perfil"
              className="h-9 cursor-pointer gap-2 rounded-argos! border-0! bg-transparent px-3 text-secondary-foreground transition-colors duration-200 hover:bg-secondary-foreground data-pressed:bg-foreground data-pressed:font-semibold data-pressed:text-secondary"
            >
              <UserRound className="size-5" />
              <span>Perfil</span>
            </ToggleGroupItem>
          </ToggleGroup>

          {/* Sair */}
          <Button
            variant="ghost"
            onClick={() => {
              // Adicionar lógica de logout.
            }}
            className="h-9 cursor-pointer gap-2 rounded-argos! border-0! bg-transparent px-3 text-secondary-foreground transition-colors duration-200 hover:bg-secondary-foreground hover:text-secondary"
          >
            <LogOut className="size-5" />
            <span>Sair</span>
          </Button>
        </ButtonGroup>
      </div>

      {/* ========================= */}
      {/* NAVEGAÇÃO MOBILE          */}
      {/* ========================= */}

      <Sheet open={mobileOpen} onOpenChange={setMobileOpen}>
        <SheetTrigger
          render={
            <Button
              variant="ghost"
              size="icon"
              aria-label="Abrir menu"
              className="size-12.5 bg-secondary text-secondary-foreground hover:bg-secondary/90 hover:text-secondary-foreground lg:hidden"
            >
              <Menu className="size-5" />
            </Button>
          }
        />

        <SheetContent side="right" className="w-72 bg-secondary text-secondary-foreground">
          <SheetHeader>
            <SheetTitle className="text-secondary-foreground">
              Navegação
            </SheetTitle>
          </SheetHeader>

          <div className="flex flex-col gap-2 px-4">
            {/* Início */}
            <Button
              variant="ghost"
              onClick={() => navigate("/")}
              className={`justify-start gap-3 ${
                location.pathname === "/"
                  ? "bg-secondary-foreground font-semibold text-secondary hover:bg-foreground hover:text-secondary"
                  : "text-secondary-foreground hover:bg-foreground/10 hover:text-secondary-foreground"
              }`}
            >
              <Home className="size-5" />
              Início
            </Button>

            {/* Animais */}
            <Button
              variant="ghost"
              onClick={() => navigate("/animals")}
              className={`justify-start gap-3 ${
                location.pathname === "/animals"
                  ? "bg-secondary-foreground font-semibold text-secondary hover:bg-foreground hover:text-secondary"
                  : "text-secondary-foreground hover:bg-foreground/10 hover:text-secondary-foreground"
              }`}
            >
              <Icon iconNode={cowHead} className="size-5" />
              Animais
            </Button>

            {/* Receptores */}
            <Button
              variant="ghost"
              onClick={() => navigate("/receptores")}
              className={`justify-start gap-3 ${
                location.pathname === "/receptores"
                  ? "bg-secondary-foreground font-semibold text-secondary hover:bg-foreground hover:text-secondary"
                  : "text-secondary-foreground hover:bg-foreground/10 hover:text-secondary-foreground"
              }`}
            >
              <SatelliteDish className="size-5" />
              Receptores
            </Button>

            {/* Alertas */}
            <Button
              variant="ghost"
              onClick={() => navigate("/alertas")}
              className={`justify-start gap-3 ${
                location.pathname === "/alertas"
                  ? "bg-foreground font-semibold text-secondary hover:bg-foreground hover:text-secondary"
                  : "text-secondary-foreground hover:bg-foreground/10 hover:text-secondary-foreground"
              }`}
            >
              <TriangleAlert className="size-5" />
              Alertas
            </Button>

            <div className="my-2 border-t border-secondary-foreground/20" />

            {/* Perfil */}
            <Button
              variant="ghost"
              onClick={() => navigate("/perfil")}
              className={`justify-start gap-3 ${
                location.pathname === "/perfil"
                  ? "bg-foreground font-semibold text-secondary hover:bg-foreground hover:text-secondary"
                  : "text-secondary-foreground hover:bg-foreground/10 hover:text-secondary-foreground"
              }`}
            >
              <UserRound className="size-5" />
              Perfil
            </Button>

            {/* Configurações */}
            <Button
              variant="ghost"
              onClick={() => navigate("/configuracoes")}
              className={`justify-start gap-3 ${
                location.pathname === "/configuracoes"
                  ? "bg-foreground font-semibold text-secondary hover:bg-foreground hover:text-secondary"
                  : "text-secondary-foreground hover:bg-foreground/10 hover:text-secondary-foreground"
              }`}
            >
              <Settings className="size-5" />
              Configurações
            </Button>

            {/* Sair */}
            <Button
              variant="ghost"
              onClick={() => {
                // Adicionar lógica de logout.
              }}
              className="justify-start gap-3 text-secondary-foreground hover:bg-foreground/10 hover:text-secondary-foreground"
            >
              <LogOut className="size-5" />
              Sair
            </Button>
          </div>
        </SheetContent>
      </Sheet>
    </nav>
  );
}
