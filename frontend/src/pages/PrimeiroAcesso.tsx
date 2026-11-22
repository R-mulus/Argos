import { useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { useNavigate } from "react-router";
import { Check, LogOut } from "lucide-react";
import { CamposPropriedade } from "@/components/custom/CamposPropriedade";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { toast } from "@/components/ui/toast";
import { chaveCadastros } from "@/hooks/useCadastros";
import type { FonteCadastros } from "@/lib/cadastros";
import { SEM_UF, dadosPropriedade, validarPropriedade, type FormularioPropriedade } from "@/lib/propriedade";
import { supabase } from "@/lib/sessao";

const proximosPassos = ["Cadastre os receptores e as coleiras", "Crie as zonas e atribua um receptor a cada uma", "Cadastre os animais", "Vincule cada coleira a um animal"];

/** Exibida quando o usuário autenticado ainda não tem propriedade: todas as rotas da API dependem dela. */
export default function PrimeiroAcesso({ fonte, origem, email, destino = "/configuracoes?aba=dispositivos" }: { fonte: FonteCadastros; origem: string; email?: string; destino?: string }) {
  const cliente = useQueryClient();
  const navegar = useNavigate();
  const [form, setForm] = useState<FormularioPropriedade>({ nome: "", municipio: "", uf: SEM_UF });
  const [tentou, setTentou] = useState(false);
  const [salvando, setSalvando] = useState(false);
  const [erro, setErro] = useState<string | null>(null);
  const erros = tentou ? validarPropriedade(form) : {};

  async function enviar(evento: React.FormEvent) {
    evento.preventDefault();
    setTentou(true);
    if (salvando || Object.keys(validarPropriedade(form)).length) return;
    setSalvando(true);
    setErro(null);
    try {
      const propriedade = await fonte.criarPropriedade(dadosPropriedade(form));
      cliente.setQueryData(chaveCadastros(origem, "propriedade"), propriedade);
      toast.add({ type: "success", title: `${propriedade.nome} cadastrada`, description: "Comece pelos receptores e coleiras." });
      navegar(destino);
    } catch (e) {
      setErro(e instanceof Error ? e.message : "Não foi possível cadastrar a propriedade.");
    } finally {
      setSalvando(false);
    }
  }

  return (
    <div className="flex min-h-screen items-start justify-center bg-card px-4 py-10 lg:py-20">
      <div className="w-full max-w-[880px]">
        <div className="mb-8 flex justify-center">
          <div className="flex h-12.5 items-center gap-5 rounded-argos bg-secondary px-5">
            <img src={`${import.meta.env.BASE_URL}logo.svg`} alt="" className="h-8 w-10 object-contain" />
            <img src={`${import.meta.env.BASE_URL}argos.svg`} alt="Argos" className="w-18.75 object-contain" />
          </div>
        </div>
        <Card className="@container gap-0 overflow-hidden py-0 ring-foreground/30">
          <div className="rounded-bl-[28px] bg-secondary px-6 py-6 text-secondary-foreground @min-[600px]:px-10 @min-[600px]:py-8">
            <h1 className="text-2xl font-medium @min-[600px]:text-[30px]">Bem-vindo ao Argos</h1>
            <p className="mt-1 text-sm opacity-85 @min-[600px]:text-base">
              {email ? `Conta ${email}. ` : ""}Cadastre a sua propriedade para começar o monitoramento do rebanho.
            </p>
          </div>
          <div className="grid gap-8 px-6 py-8 @min-[700px]:grid-cols-[1.3fr_1fr] @min-[700px]:px-10">
            <form noValidate onSubmit={enviar} className="space-y-5">
              <CamposPropriedade valor={form} onChange={setForm} erros={erros} />
              {erro && <p role="alert" className="text-sm text-destructive">{erro}</p>}
              <div className="flex flex-wrap items-center gap-3 pt-2">
                <Button type="submit" disabled={salvando} className="h-11 rounded-full px-6 text-white">{salvando ? "Cadastrando…" : "Cadastrar propriedade"}</Button>
                {supabase && (
                  <Button type="button" variant="ghost" className="h-11" onClick={() => void supabase?.auth.signOut({ scope: "local" })}>
                    <LogOut aria-hidden="true" className="size-4" />Sair
                  </Button>
                )}
              </div>
            </form>
            <div className="rounded-xl bg-muted p-5">
              <h2 className="text-lg font-medium">Próximos passos</h2>
              <ol className="mt-4 space-y-3 text-sm">
                {proximosPassos.map((passo, i) => (
                  <li key={passo} className="flex gap-3">
                    <span className="flex size-6 shrink-0 items-center justify-center rounded-full bg-primary text-xs font-semibold text-white">{i + 1}</span>
                    <span className="pt-0.5">{passo}</span>
                  </li>
                ))}
              </ol>
              <p className="mt-5 flex gap-2 text-xs text-muted-foreground"><Check aria-hidden="true" className="size-4 shrink-0" />Tudo fica na tela Cadastrar e pode ser alterado depois.</p>
            </div>
          </div>
        </Card>
      </div>
    </div>
  );
}
