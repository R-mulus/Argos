import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Pencil, Plus, Scale, Search } from "lucide-react";
import { CampoFormulario } from "@/components/custom/CampoFormulario";
import { EstadoBloco } from "@/components/custom/EstadoConsulta";
import { PainelFormulario } from "@/components/custom/PainelFormulario";
import { SeletorPilulas } from "@/components/custom/SeletorPilulas";
import { SeloStatus } from "@/components/custom/SeloStatus";
import { TabelaCadastro } from "@/components/custom/TabelaCadastro";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import { chaveCadastros, opcional, useListasCadastro, useMutacaoCadastro } from "@/hooks/useCadastros";
import type { Animal, FonteCadastros } from "@/lib/cadastros";
import { dataBr, formatarIdade, formatarKg, hojeIso } from "@/lib/formatos";

type Filtro = "ativo" | "inativo" | "todos";
type Sexo = "femea" | "macho" | "nao-informado";
type Formulario = { identificacao: string; sexo: Sexo; raca: string; categoria: string; nascimento: string; lote: string; origem: string; observacoes: string; ativo: boolean };
const formularioVazio: Formulario = { identificacao: "", sexo: "nao-informado", raca: "", categoria: "", nascimento: "", lote: "", origem: "", observacoes: "", ativo: true };
const textoSexo = { femea: "Fêmea", macho: "Macho" } as const;

function validar(f: Formulario) {
  const erros: Partial<Record<keyof Formulario, string>> = {};
  if (!f.identificacao.trim()) erros.identificacao = "Informe a identificação.";
  else if (f.identificacao.trim().length > 80) erros.identificacao = "Use até 80 caracteres.";
  for (const campo of ["raca", "categoria", "lote", "origem"] as const) if (f[campo].trim().length > 160) erros[campo] = "Use até 160 caracteres.";
  if (f.observacoes.trim().length > 2000) erros.observacoes = "Use até 2.000 caracteres.";
  if (f.nascimento && f.nascimento > hojeIso()) erros.nascimento = "A data de nascimento não pode estar no futuro.";
  return erros;
}

/** Converte "420,5" ou "420.5" em número; devolve NaN se inválido. */
const lerPeso = (texto: string) => (/^\d+([.,]\d+)?$/.test(texto.trim()) ? Number(texto.trim().replace(",", ".")) : NaN);

/** Cadastro do rebanho e pesagens manuais (uma por animal por dia). Não há exclusão: o animal é desativado. */
export function CadastroAnimais({ fonte, origem }: { fonte: FonteCadastros; origem: string }) {
  const { animais, vinculos, dispositivos } = useListasCadastro(fonte, origem);
  const [filtro, setFiltro] = useState<Filtro>("ativo");
  const [busca, setBusca] = useState("");
  const [edicao, setEdicao] = useState<Animal | "novo" | null>(null);
  const [form, setForm] = useState<Formulario>(formularioVazio);
  const [tentouEnviar, setTentouEnviar] = useState(false);
  const [pesando, setPesando] = useState<Animal | null>(null);
  const [pesagem, setPesagem] = useState({ data: hojeIso(), peso: "" });
  const [tentouPesar, setTentouPesar] = useState(false);

  const historico = useQuery({
    queryKey: chaveCadastros(origem, "pesagens", pesando?.id ?? ""),
    enabled: pesando !== null,
    queryFn: ({ signal }) => fonte.pesagens(pesando!.id, signal),
  });
  const salvar = useMutacaoCadastro(origem,
    async (f: Formulario) => {
      const campos = {
        identificacao: f.identificacao.trim(), sexo: f.sexo === "nao-informado" ? null : f.sexo, raca: opcional(f.raca), categoria: opcional(f.categoria),
        data_nascimento: f.nascimento || null, lote: opcional(f.lote), origem: opcional(f.origem), observacoes: opcional(f.observacoes), status: f.ativo ? "ativo" as const : "inativo" as const,
      };
      return edicao && edicao !== "novo" ? fonte.editarAnimal(edicao.id, campos) : fonte.criarAnimal(campos);
    },
    a => `Animal ${a.identificacao} salvo`);
  const alternar = useMutacaoCadastro(origem,
    (a: Animal) => fonte.editarAnimal(a.id, { status: a.status === "ativo" ? "inativo" : "ativo" }),
    a => `Animal ${a.identificacao} ${a.status === "ativo" ? "reativado" : "desativado"}`);
  const pesar = useMutacaoCadastro(origem,
    (dados: { animal: Animal; data: string; peso: number }) => fonte.registrarPesagem(dados.animal.id, { data_pesagem: dados.data, peso_kg: dados.peso }),
    (p, { animal }) => `Pesagem de ${animal.identificacao} registrada: ${formatarKg(p.peso_kg)}`);

  function abrir(alvo: Animal | "novo") {
    setEdicao(alvo); setTentouEnviar(false); salvar.reset();
    setForm(alvo === "novo" ? formularioVazio : {
      identificacao: alvo.identificacao, sexo: alvo.sexo ?? "nao-informado", raca: alvo.raca ?? "", categoria: alvo.categoria ?? "",
      nascimento: alvo.data_nascimento?.slice(0, 10) ?? "", lote: alvo.lote ?? "", origem: alvo.origem ?? "", observacoes: alvo.observacoes ?? "", ativo: alvo.status === "ativo",
    });
  }
  function enviar() {
    setTentouEnviar(true);
    if (Object.keys(validar(form)).length) return;
    salvar.mutate(form, { onSuccess: () => setEdicao(null) });
  }
  function abrirPesagens(animal: Animal) {
    setPesando(animal); setPesagem({ data: hojeIso(), peso: "" }); setTentouPesar(false); pesar.reset();
  }
  const erroData = tentouPesar && (!pesagem.data ? "Informe a data." : pesagem.data > hojeIso() ? "A pesagem não pode estar no futuro." : undefined);
  const peso = lerPeso(pesagem.peso);
  const erroPeso = tentouPesar && (!(peso > 0) ? "Informe um peso positivo em kg, como 420,5." : peso > 2000 ? "Confira o valor: acima de 2.000 kg." : undefined);
  function enviarPesagem() {
    setTentouPesar(true);
    if (!pesando || !pesagem.data || pesagem.data > hojeIso() || !(peso > 0) || peso > 2000) return;
    pesar.mutate({ animal: pesando, data: pesagem.data, peso }, {
      onSuccess: () => { setPesagem({ data: hojeIso(), peso: "" }); setTentouPesar(false); void historico.refetch(); },
    });
  }

  if (!animais.data) return <EstadoBloco consulta={animais} nome="os animais" />;
  const lista = animais.data;
  const termo = busca.trim().toLocaleLowerCase("pt-BR");
  const visiveis = lista
    .filter(a => (filtro === "todos" || a.status === filtro) && (!termo || [a.identificacao, a.raca, a.lote, a.categoria].some(v => v?.toLocaleLowerCase("pt-BR").includes(termo))))
    .sort((a, b) => a.identificacao.localeCompare(b.identificacao, "pt-BR", { numeric: true }));
  const coleiraPorId = new Map((dispositivos.data ?? []).map(d => [d.id, d.codigo]));
  const coleiraDoAnimal = new Map((vinculos.data ?? []).filter(v => !v.fim_em).map(v => [v.animal_id, coleiraPorId.get(v.transmissor_id) ?? "—"]));
  const erros = tentouEnviar ? validar(form) : {};
  const editando = edicao && edicao !== "novo" ? edicao : null;
  const campo = (chave: keyof Formulario) => (e: { target: { value: string } }) => setForm({ ...form, [chave]: e.target.value });

  return (
    <>
      <TabelaCadastro
        titulo="Animais"
        acoes={<>
          <label className="relative">
            <span className="sr-only">Buscar animal</span>
            <Search aria-hidden="true" className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-muted-foreground" />
            <Input value={busca} onChange={e => setBusca(e.target.value)} placeholder="Identificação, raça ou lote" className="h-10 w-60 rounded-full border-2 border-border pl-9" />
          </label>
          <SeletorPilulas rotulo="Filtrar animais" value={filtro} onChange={setFiltro} opcoes={[
            { value: "ativo", label: "Ativos", contagem: lista.filter(a => a.status === "ativo").length },
            { value: "inativo", label: "Inativos", contagem: lista.filter(a => a.status === "inativo").length },
            { value: "todos", label: "Todos", contagem: lista.length },
          ]} />
          <Button className="h-10 rounded-full px-5 text-white" onClick={() => abrir("novo")}><Plus aria-hidden="true" className="size-4" />Novo animal</Button>
        </>}
        itens={visiveis}
        chave={a => a.id}
        vazio={lista.length ? "Nenhum animal encontrado com esses filtros." : "Nenhum animal cadastrado. Cadastre o rebanho para vincular as coleiras."}
        colunas={[
          { titulo: "Identificação", celula: a => <span className="font-semibold">{a.identificacao}</span> },
          { titulo: "Sexo", celula: a => (a.sexo ? textoSexo[a.sexo] : <span className="text-muted-foreground">—</span>) },
          { titulo: "Raça", celula: a => a.raca ?? "—" },
          { titulo: "Categoria", celula: a => a.categoria ?? "—" },
          { titulo: "Idade", celula: a => formatarIdade(a.data_nascimento) },
          { titulo: "Lote", celula: a => a.lote ?? "—" },
          { titulo: "Coleira", celula: a => coleiraDoAnimal.get(a.id) ?? <span className="text-muted-foreground">Sem coleira</span> },
          { titulo: "Status", celula: a => <SeloStatus tom={a.status === "ativo" ? "ativo" : "inativo"}>{a.status === "ativo" ? "Ativo" : "Inativo"}</SeloStatus> },
        ]}
        acoesLinha={a => <>
          <Button variant="ghost" size="sm" onClick={() => abrirPesagens(a)} aria-label={`Pesagens de ${a.identificacao}`}><Scale aria-hidden="true" className="size-4" />Pesagens</Button>
          <Button variant="ghost" size="sm" onClick={() => abrir(a)} aria-label={`Editar ${a.identificacao}`}><Pencil aria-hidden="true" className="size-4" />Editar</Button>
          <Button variant="outline" size="sm" className="rounded-full border-2" disabled={alternar.isPending && alternar.variables?.id === a.id} onClick={() => alternar.mutate(a)}>
            {a.status === "ativo" ? "Desativar" : "Reativar"}
          </Button>
        </>}
        rodape={<p className="text-xs text-muted-foreground">Animais não são excluídos: desative para retirar da contagem e preservar o histórico.</p>}
      />

      <PainelFormulario
        aberto={edicao !== null}
        aoFechar={() => setEdicao(null)}
        titulo={editando ? `Editar ${editando.identificacao}` : "Novo animal"}
        descricao="Só a identificação é obrigatória; os demais dados aparecem no Animal em Destaque."
        aoEnviar={enviar}
        salvando={salvar.isPending}
        erro={salvar.error?.message}
        rotuloEnviar={editando ? "Salvar alterações" : "Cadastrar"}
      >
        <CampoFormulario id="animal-id" rotulo="Identificação" obrigatorio erro={erros.identificacao} ajuda="Única na propriedade, como o número do brinco.">
          <Input id="animal-id" value={form.identificacao} maxLength={80} aria-invalid={Boolean(erros.identificacao)} onChange={campo("identificacao")} />
        </CampoFormulario>
        <div className="grid gap-1.5">
          <span className="text-sm font-medium">Sexo</span>
          <SeletorPilulas rotulo="Sexo" value={form.sexo} onChange={sexo => setForm({ ...form, sexo })} opcoes={[{ value: "femea", label: "Fêmea" }, { value: "macho", label: "Macho" }, { value: "nao-informado", label: "Não informado" }]} />
        </div>
        <div className="grid gap-5 sm:grid-cols-2">
          <CampoFormulario id="animal-raca" rotulo="Raça" erro={erros.raca}><Input id="animal-raca" value={form.raca} maxLength={160} placeholder="Nelore" onChange={campo("raca")} /></CampoFormulario>
          <CampoFormulario id="animal-categoria" rotulo="Categoria" erro={erros.categoria}><Input id="animal-categoria" value={form.categoria} maxLength={160} placeholder="Vaca, novilha…" onChange={campo("categoria")} /></CampoFormulario>
          <CampoFormulario id="animal-nascimento" rotulo="Nascimento" erro={erros.nascimento}><Input id="animal-nascimento" type="date" max={hojeIso()} value={form.nascimento} onChange={campo("nascimento")} /></CampoFormulario>
          <CampoFormulario id="animal-lote" rotulo="Lote" erro={erros.lote}><Input id="animal-lote" value={form.lote} maxLength={160} onChange={campo("lote")} /></CampoFormulario>
        </div>
        <CampoFormulario id="animal-origem" rotulo="Origem" erro={erros.origem}><Input id="animal-origem" value={form.origem} maxLength={160} placeholder="Nascido na fazenda, compra…" onChange={campo("origem")} /></CampoFormulario>
        <CampoFormulario id="animal-obs" rotulo="Observações" erro={erros.observacoes}>
          <textarea id="animal-obs" rows={3} maxLength={2000} value={form.observacoes} onChange={campo("observacoes")}
            className="w-full rounded-lg border border-foreground/25 bg-card px-3 py-2 text-sm outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50" />
        </CampoFormulario>
        <label className="flex items-center justify-between gap-4 rounded-lg border p-3">
          <span>
            <span className="block text-sm font-medium">Ativo</span>
            <span className="block text-xs text-muted-foreground">Somente animais ativos entram na contagem por zona.</span>
          </span>
          <Switch checked={form.ativo} onCheckedChange={ativo => setForm({ ...form, ativo })} />
        </label>
      </PainelFormulario>

      <PainelFormulario
        aberto={pesando !== null}
        aoFechar={() => setPesando(null)}
        titulo={`Pesagens · ${pesando?.identificacao ?? ""}`}
        descricao="Registro manual, em kg, com uma pesagem por dia."
        aoEnviar={enviarPesagem}
        salvando={pesar.isPending}
        erro={pesar.error?.message}
        rotuloEnviar="Registrar pesagem"
      >
        <div className="grid gap-5 sm:grid-cols-2">
          <CampoFormulario id="pesagem-data" rotulo="Data" obrigatorio erro={erroData || undefined}>
            <Input id="pesagem-data" type="date" max={hojeIso()} value={pesagem.data} aria-invalid={Boolean(erroData)} onChange={e => setPesagem({ ...pesagem, data: e.target.value })} />
          </CampoFormulario>
          <CampoFormulario id="pesagem-peso" rotulo="Peso (kg)" obrigatorio erro={erroPeso || undefined}>
            <Input id="pesagem-peso" inputMode="decimal" placeholder="420,5" value={pesagem.peso} aria-invalid={Boolean(erroPeso)} onChange={e => setPesagem({ ...pesagem, peso: e.target.value })} />
          </CampoFormulario>
        </div>

        <div className="rounded-xl border">
          <div className="flex items-center justify-between gap-3 rounded-t-xl bg-muted px-4 py-3">
            <span className="text-sm font-medium">Histórico</span>
            {historico.data?.ganho_medio_diario_kg != null && (
              <span className="text-sm">
                Ganho médio: <strong className={historico.data.ganho_medio_diario_kg < 0 ? "text-destructive" : undefined}>
                  {historico.data.ganho_medio_diario_kg.toLocaleString("pt-BR", { maximumFractionDigits: 2, signDisplay: "exceptZero" })} kg/dia
                </strong>
              </span>
            )}
          </div>
          {historico.isPending ? <p role="status" className="p-4 text-sm text-muted-foreground">Carregando pesagens…</p>
            : historico.isError ? <p role="alert" className="p-4 text-sm text-destructive">Não foi possível carregar as pesagens: {historico.error.message}</p>
            : historico.data.data.length === 0 ? <p className="p-4 text-sm text-muted-foreground">Nenhuma pesagem registrada.</p>
            : (
              <ol className="divide-y">
                {historico.data.data.map(p => (
                  <li key={p.data_pesagem} className="flex justify-between px-4 py-2.5 text-sm">
                    <span>{dataBr(p.data_pesagem)}</span>
                    <span className="font-semibold tabular-nums">{formatarKg(Number(p.peso_kg))}</span>
                  </li>
                ))}
              </ol>
            )}
        </div>
      </PainelFormulario>
    </>
  );
}
