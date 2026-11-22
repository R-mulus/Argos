import { useMemo, useState } from "react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { useSearchParams } from "react-router";
import Navbar from "@/components/custom/Navbar";
import { cacheDesatualizado, type CenarioDemonstracao } from "@/lib/demonstracaoMonitoramento";
import { chaveMonitoramento } from "@/lib/fonteMonitoramento";
import Alertas from "./Alertas";
import AnimaisZona from "./AnimaisZona";
import Configuracoes from "./Configuracoes";
import Perfil from "./Perfil";
import PrimeiroAcesso from "./PrimeiroAcesso";
import { cadastrosDemonstracao } from "@/lib/cadastros";
import Monitoramento from "./Monitoramento";
import ReceptoresZona from "./ReceptoresZona";

const cenarios: Record<CenarioDemonstracao, string> = {
  preenchido: "Com dados",
  vazio: "Vazio",
  erro: "Erro",
  carregando: "Carregando",
  desatualizado: "Desatualizado",
};

function criarCliente(cenario: CenarioDemonstracao) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  if (cenario === "desatualizado") {
    // Resultado de 10 minutos atrás; as próximas consultas falham e a tela sinaliza dados antigos.
    const updatedAt = Date.now() - 10 * 60_000;
    client.setQueryData(chaveMonitoramento(cenario, "resumo"), cacheDesatualizado.resumo(), { updatedAt });
    client.setQueryData(chaveMonitoramento(cenario, "receptores"), cacheDesatualizado.receptores(), { updatedAt });
    client.setQueryData(chaveMonitoramento(cenario, "zonas"), cacheDesatualizado.zonas(), { updatedAt });
  }
  return client;
}

/** Prévia pública das telas Início, Animais, Receptores, Alertas, Configurações, Perfil e primeiro acesso, sem acesso à API. `?cenario=` seleciona o estado inicial. */
export default function DemonstracaoInicio({ tela = "inicio" }: { tela?: "inicio" | "animais" | "receptores" | "alertas" | "configuracoes" | "perfil" | "primeiro-acesso" }) {
  const [parametros] = useSearchParams();
  const inicial = parametros.get("cenario");
  const [cenario, setCenario] = useState<CenarioDemonstracao>(inicial && inicial in cenarios ? (inicial as CenarioDemonstracao) : "preenchido");
  const client = useMemo(() => criarCliente(cenario), [cenario]);
  const fontePrimeiroAcesso = useMemo(() => cadastrosDemonstracao(true), []);
  if (tela === "primeiro-acesso") {
    return (
      <QueryClientProvider client={client}>
        <PrimeiroAcesso fonte={fontePrimeiroAcesso} origem="demo-primeiro-acesso" email="produtor@exemplo.com" destino="/demonstracao/configuracoes?aba=dispositivos" />
      </QueryClientProvider>
    );
  }
  return (
    <div className="min-h-screen bg-card pt-5 lg:pt-12">
      <Navbar />
      <main className="px-4 lg:px-16">
        <QueryClientProvider client={client}>
          {tela === "animais" ? <AnimaisZona key={cenario} demonstracao={cenario} />
            : tela === "receptores" ? <ReceptoresZona key={cenario} demonstracao={cenario} />
            : tela === "alertas" ? <Alertas key={cenario} demonstracao={cenario} />
            : tela === "configuracoes" ? <Configuracoes key={cenario} demonstracao={cenario} />
            : tela === "perfil" ? <Perfil key={cenario} demonstracao={cenario} conta={{ email: "produtor@exemplo.com", criadaEm: "2026-11-01T12:00:00-03:00", ultimoAcesso: new Date().toISOString() }} />
            : <Monitoramento key={cenario} demonstracao={cenario} />}
        </QueryClientProvider>
      </main>
      {/* Painel flutuante para não deslocar a grade comparada ao Figma. */}
      <aside className="fixed right-4 bottom-4 z-50 flex flex-wrap items-center gap-2 rounded-lg border bg-muted p-3 text-sm shadow-lg">
        <strong>Prévia · dados simulados</strong>
        <label htmlFor="cenario-inicio">Cenário:</label>
        <select id="cenario-inicio" className="rounded-md border bg-card p-1.5" value={cenario} onChange={e => setCenario(e.target.value as CenarioDemonstracao)}>
          {Object.entries(cenarios).map(([valor, nome]) => <option key={valor} value={valor}>{nome}</option>)}
        </select>
      </aside>
    </div>
  );
}
