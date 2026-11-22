import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { format } from "date-fns";
import { Link } from "react-router";
import { House, Icon, LogOut, Pencil, SatelliteDish, Tag, UserRound } from "lucide-react";
import { cowHead } from "@lucide/lab";
import { CamposPropriedade } from "@/components/custom/CamposPropriedade";
import { EstadoBloco, Secao } from "@/components/custom/EstadoConsulta";
import { IndicadorResumo } from "@/components/custom/IndicadorResumo";
import { PainelFormulario } from "@/components/custom/PainelFormulario";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { toast } from "@/components/ui/toast";
import { chaveCadastros, useListasCadastro, useMutacaoCadastro } from "@/hooks/useCadastros";
import { cadastrosApi, cadastrosDemonstracao } from "@/lib/cadastros";
import type { CenarioDemonstracao } from "@/lib/demonstracaoMonitoramento";
import { SEM_UF, dadosPropriedade, validarPropriedade, type FormularioPropriedade } from "@/lib/propriedade";
import { supabase } from "@/lib/sessao";

export type ContaPerfil = { email: string | null; criadaEm: string | null; ultimoAcesso: string | null };
const dataHora = (valor: string | null) => (valor ? format(new Date(valor), "dd/MM/yyyy HH:mm") : "—");
const CowHead = ({ className }: { className?: string }) => <Icon iconNode={cowHead} aria-hidden="true" className={className} />;

function Dado({ rotulo, valor, destaque }: { rotulo: string; valor: string; destaque?: boolean }) {
  return (
    <div className="min-w-0">
      <dt className="text-xs @min-[500px]:text-[15px]">{rotulo}</dt>
      <dd className={destaque ? "mt-0.5 break-words text-2xl leading-tight font-semibold @min-[500px]:text-[30px]" : "mt-0.5 break-words text-lg leading-tight font-semibold @min-[500px]:text-[22px]"}>{valor}</dd>
    </div>
  );
}

/** Perfil (`/perfil`): conta, propriedade editável e resumo dos cadastros. Sem frame no Figma. */
export default function Perfil({ conta, demonstracao }: { conta: ContaPerfil; demonstracao?: CenarioDemonstracao }) {
  const fonte = useMemo(() => (demonstracao ? cadastrosDemonstracao(demonstracao === "vazio") : cadastrosApi), [demonstracao]);
  const origem = demonstracao ?? "api";
  const propriedade = useQuery({ queryKey: chaveCadastros(origem, "propriedade"), queryFn: ({ signal }) => fonte.propriedade(signal) });
  const { animais, dispositivos, zonas } = useListasCadastro(fonte, origem);
  const [editando, setEditando] = useState(false);
  const [form, setForm] = useState<FormularioPropriedade>({ nome: "", municipio: "", uf: SEM_UF });
  const [tentou, setTentou] = useState(false);
  const [saindo, setSaindo] = useState(false);
  const salvar = useMutacaoCadastro(origem, (f: FormularioPropriedade) => fonte.editarPropriedade(dadosPropriedade(f)), p => `Propriedade ${p.nome} atualizada`);

  function abrirEdicao() {
    const p = propriedade.data;
    setForm({ nome: p?.nome ?? "", municipio: p?.municipio ?? "", uf: p?.uf ?? SEM_UF });
    setTentou(false); salvar.reset(); setEditando(true);
  }
  async function sair() {
    if (!supabase) return toast.add({ type: "info", title: "Prévia sem sessão", description: "Na aplicação, este botão encerra a sessão local." });
    setSaindo(true);
    const { error } = await supabase.auth.signOut({ scope: "local" });
    if (error) { setSaindo(false); toast.add({ type: "error", title: "Não foi possível sair", description: error.message }); }
  }

  const ativos = <T extends { status: string }>(lista?: T[]) => (lista ? lista.filter(i => i.status === "ativo").length : null);
  const resumo = [
    { titulo: "Animais Ativos", valor: ativos(animais.data), descricao: "Gerenciar animais", aba: "animais", tom: "primario" as const, icone: CowHead },
    { titulo: "Coleiras Ativas", valor: ativos(dispositivos.data?.filter(d => d.tipo === "transmissor")), descricao: "Gerenciar dispositivos", aba: "dispositivos", tom: "secundario" as const, icone: Tag },
    { titulo: "Receptores Ativos", valor: ativos(dispositivos.data?.filter(d => d.tipo === "receptor")), descricao: "Gerenciar dispositivos", aba: "dispositivos", tom: "secundario" as const, icone: SatelliteDish },
    { titulo: "Zonas Ativas", valor: zonas.data ? zonas.data.filter(z => z.ativa).length : null, descricao: "Gerenciar zonas", aba: "zonas", tom: "sucesso" as const, icone: House },
  ];
  const p = propriedade.data;

  return (
    <div className="mx-auto w-full max-w-[1786px] min-w-0 pt-8 pb-16 lg:pt-[64px] [&_[data-slot=card]]:ring-foreground/30">
      <div className="mb-6 lg:mb-[54px]"><h1 className="text-2xl leading-tight font-medium lg:text-[30px]">Perfil</h1></div>

      <div className="grid min-w-0 gap-5 xl:grid-cols-2 xl:gap-[27px]">
        <Card className="@container relative gap-0 py-0">
          <div aria-hidden="true" className="absolute top-0 right-0 h-10 w-[30%] rounded-bl-[24px] bg-primary @min-[500px]:h-[52px]" />
          <div className="px-5 pt-5 pb-6 @min-[500px]:px-[30px] @min-[500px]:pt-[27px] @min-[500px]:pb-[30px]">
            <h2 className="flex items-center gap-2.5 pr-[32%] text-xl font-normal @min-[500px]:text-[30px]"><UserRound aria-hidden="true" className="size-5 shrink-0 @min-[500px]:size-[26px]" />Conta</h2>
            <dl className="mt-6 grid gap-5 @min-[500px]:mt-8 @min-[500px]:grid-cols-2">
              <div className="@min-[500px]:col-span-2"><Dado rotulo="E-mail" valor={conta.email ?? "—"} destaque /></div>
              <Dado rotulo="Último acesso" valor={dataHora(conta.ultimoAcesso)} />
              <Dado rotulo="Conta criada em" valor={dataHora(conta.criadaEm)} />
            </dl>
            <Button variant="outline" className="mt-8 h-10 rounded-full border-2 px-5" disabled={saindo} onClick={() => void sair()}>
              <LogOut aria-hidden="true" className="size-4" />{saindo ? "Saindo…" : "Sair da conta"}
            </Button>
          </div>
        </Card>

        <Card className="@container relative gap-0 py-0">
          <div aria-hidden="true" className="absolute top-0 right-0 h-10 w-[30%] rounded-bl-[24px] bg-secondary @min-[500px]:h-[52px]" />
          <div className="px-5 pt-5 pb-6 @min-[500px]:px-[30px] @min-[500px]:pt-[27px] @min-[500px]:pb-[30px]">
            <h2 className="flex items-center gap-2.5 pr-[32%] text-xl font-normal @min-[500px]:text-[30px]"><House aria-hidden="true" className="size-5 shrink-0 @min-[500px]:size-[26px]" />Propriedade</h2>
            {!p ? <EstadoBloco consulta={propriedade} nome="a propriedade" className="mt-6" /> : <>
              <dl className="mt-6 grid gap-5 @min-[500px]:mt-8 @min-[500px]:grid-cols-2">
                <div className="@min-[500px]:col-span-2"><Dado rotulo="Nome" valor={p.nome} destaque /></div>
                <Dado rotulo="Município / UF" valor={[p.municipio, p.uf].filter(Boolean).join(" – ") || "Não informado"} />
                <Dado rotulo="Cadastrada em" valor={dataHora(p.created_at)} />
              </dl>
              <Button className="mt-8 h-10 rounded-full px-5 text-white" onClick={abrirEdicao}><Pencil aria-hidden="true" className="size-4" />Editar propriedade</Button>
            </>}
          </div>
        </Card>
      </div>

      <Secao titulo="Resumo do Cadastro" id="resumo-cadastro" className="mt-12 lg:mt-[79px]">
        <div className="grid min-w-0 grid-cols-2 gap-3 sm:gap-5 xl:grid-cols-4 xl:gap-[27px]">
          {resumo.map(item => (
            <Link key={item.titulo} to={`/configuracoes?aba=${item.aba}`} className="rounded-xl transition-shadow hover:shadow-md focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring">
              <IndicadorResumo titulo={item.titulo} valor={item.valor} descricao={item.descricao} tom={item.tom} icone={item.icone} className="h-full" />
            </Link>
          ))}
        </div>
      </Secao>

      <PainelFormulario
        aberto={editando}
        aoFechar={() => setEditando(false)}
        titulo="Editar propriedade"
        descricao="Os dados da propriedade identificam a fazenda no Argos."
        aoEnviar={() => { setTentou(true); if (!Object.keys(validarPropriedade(form)).length) salvar.mutate(form, { onSuccess: () => setEditando(false) }); }}
        salvando={salvar.isPending}
        erro={salvar.error?.message}
        rotuloEnviar="Salvar alterações"
      >
        <CamposPropriedade valor={form} onChange={setForm} erros={tentou ? validarPropriedade(form) : {}} />
      </PainelFormulario>
    </div>
  );
}
