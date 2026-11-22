import { useMemo } from "react";
import { useSearchParams } from "react-router";
import { SeletorPilulas } from "@/components/custom/SeletorPilulas";
import { cadastrosApi, cadastrosDemonstracao } from "@/lib/cadastros";
import type { CenarioDemonstracao } from "@/lib/demonstracaoMonitoramento";
import { CadastroAnimais } from "./cadastros/Animais";
import { CadastroDispositivos } from "./cadastros/Dispositivos";
import { CadastroVinculos } from "./cadastros/Vinculos";
import { CadastroZonas } from "./cadastros/Zonas";

type Aba = "zonas" | "dispositivos" | "animais" | "vinculos";
const abas: { value: Aba; label: string }[] = [
  { value: "zonas", label: "Zonas" },
  { value: "dispositivos", label: "Dispositivos" },
  { value: "animais", label: "Animais" },
  { value: "vinculos", label: "Vínculos" },
];

/** Configurações do monitoramento (`/configuracoes`): cadastros de zonas, dispositivos, animais (com pesagens) e vínculos. Sem frame no Figma. */
export default function Configuracoes({ demonstracao }: { demonstracao?: CenarioDemonstracao }) {
  const fonte = useMemo(() => (demonstracao ? cadastrosDemonstracao(demonstracao === "vazio") : cadastrosApi), [demonstracao]);
  const origem = demonstracao ?? "api";
  const [parametros, setParametros] = useSearchParams();
  const aba = abas.find(a => a.value === parametros.get("aba"))?.value ?? "zonas";

  return (
    <div className="mx-auto w-full max-w-[1786px] min-w-0 pt-8 pb-16 lg:pt-[64px] [&_[data-slot=card]]:ring-foreground/30">
      <div className="mb-6 flex flex-wrap items-center justify-between gap-4 lg:mb-[54px]">
        <h1 className="text-2xl leading-tight font-medium lg:text-[30px]">Configurações</h1>
        <SeletorPilulas rotulo="Seção das configurações" opcoes={abas} value={aba} onChange={valor => setParametros({ ...Object.fromEntries(parametros), aba: valor })} />
      </div>
      {aba === "zonas" && <CadastroZonas fonte={fonte} origem={origem} />}
      {aba === "dispositivos" && <CadastroDispositivos fonte={fonte} origem={origem} />}
      {aba === "animais" && <CadastroAnimais fonte={fonte} origem={origem} />}
      {aba === "vinculos" && <CadastroVinculos fonte={fonte} origem={origem} />}
    </div>
  );
}
