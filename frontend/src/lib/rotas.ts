import type { CenarioDemonstracao } from "@/lib/demonstracaoMonitoramento";

/** Telas autenticadas que têm prévia equivalente em /demonstracao. */
const previas: Record<string, string> = {
  "/": "/demonstracao/inicio",
  "/animals": "/demonstracao/animais",
  "/receptores": "/demonstracao/receptores",
  "/alertas": "/demonstracao/alertas",
  "/configuracoes": "/demonstracao/configuracoes",
  "/perfil": "/demonstracao/perfil",
};

/**
 * Destino de um link interno. Na prévia, aponta para a tela de demonstração correspondente e mantém
 * o cenário escolhido; fora dela, devolve o caminho da aplicação autenticada sem alteração.
 */
export function rotaApp(caminho: string, demonstracao?: CenarioDemonstracao): string {
  if (!demonstracao) return caminho;
  const [rota, consulta = ""] = caminho.split("?");
  const parametros = new URLSearchParams(consulta);
  parametros.set("cenario", demonstracao);
  return `${previas[rota] ?? rota}?${parametros}`;
}
