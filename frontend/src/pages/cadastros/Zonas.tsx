import { useState } from "react";
import { Pencil, Plus } from "lucide-react";
import { CampoFormulario } from "@/components/custom/CampoFormulario";
import { EstadoBloco } from "@/components/custom/EstadoConsulta";
import { PainelFormulario } from "@/components/custom/PainelFormulario";
import { SeloStatus } from "@/components/custom/SeloStatus";
import { TabelaCadastro } from "@/components/custom/TabelaCadastro";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { opcional, useListasCadastro, useMutacaoCadastro } from "@/hooks/useCadastros";
import type { FonteCadastros, Zona } from "@/lib/cadastros";

type Formulario = { nome: string; descricao: string; receptorId: string; ativa: boolean };
const SEM_RECEPTOR = "sem-receptor";
const formularioVazio: Formulario = { nome: "", descricao: "", receptorId: SEM_RECEPTOR, ativa: true };

function validar(f: Formulario) {
  const erros: Partial<Record<keyof Formulario, string>> = {};
  if (!f.nome.trim()) erros.nome = "Informe o nome da zona.";
  else if (f.nome.trim().length > 120) erros.nome = "Use até 120 caracteres.";
  if (f.descricao.trim().length > 2000) erros.descricao = "Use até 2.000 caracteres.";
  if (f.ativa && f.receptorId === SEM_RECEPTOR) erros.ativa = "Uma zona ativa precisa de um receptor.";
  return erros;
}

/** Zonas de detecção: cada zona usa no máximo um receptor, e um receptor atende uma zona por vez. */
export function CadastroZonas({ fonte, origem }: { fonte: FonteCadastros; origem: string }) {
  const { dispositivos, zonas } = useListasCadastro(fonte, origem);
  const [edicao, setEdicao] = useState<Zona | "novo" | null>(null);
  const [form, setForm] = useState<Formulario>(formularioVazio);
  const [tentouEnviar, setTentouEnviar] = useState(false);

  const salvar = useMutacaoCadastro(origem,
    async (f: Formulario) => {
      const campos = { nome: f.nome.trim(), descricao: opcional(f.descricao), receptor_id: f.receptorId === SEM_RECEPTOR ? null : f.receptorId, ativa: f.ativa };
      return edicao && edicao !== "novo" ? fonte.editarZona(edicao.id, campos) : fonte.criarZona(campos);
    },
    z => `Zona ${z.nome} salva`);
  const alternar = useMutacaoCadastro(origem,
    (z: Zona) => fonte.editarZona(z.id, { ativa: !z.ativa }),
    z => `Zona ${z.nome} ${z.ativa ? "ativada" : "desativada"}`);

  function abrir(alvo: Zona | "novo") {
    setEdicao(alvo);
    setTentouEnviar(false);
    salvar.reset();
    setForm(alvo === "novo" ? formularioVazio : { nome: alvo.nome, descricao: alvo.descricao ?? "", receptorId: alvo.receptor_id ?? SEM_RECEPTOR, ativa: alvo.ativa });
  }
  function enviar() {
    setTentouEnviar(true);
    if (Object.keys(validar(form)).length) return;
    salvar.mutate(form, { onSuccess: () => setEdicao(null) });
  }

  if (!zonas.data) return <EstadoBloco consulta={zonas} nome="as zonas" />;
  const receptores = (dispositivos.data ?? []).filter(d => d.tipo === "receptor");
  const receptorPorId = new Map(receptores.map(r => [r.id, r]));
  const editando = edicao && edicao !== "novo" ? edicao : null;
  const zonaDoReceptor = new Map(zonas.data.filter(z => z.receptor_id && z.id !== editando?.id).map(z => [z.receptor_id!, z.nome]));
  const opcoesReceptor: Record<string, string> = {
    [SEM_RECEPTOR]: "Sem receptor",
    ...Object.fromEntries(receptores.map(r => [r.id, `${r.codigo}${r.nome ? ` · ${r.nome}` : ""}${zonaDoReceptor.has(r.id) ? ` (em ${zonaDoReceptor.get(r.id)})` : ""}`])),
  };
  const erros = tentouEnviar ? validar(form) : {};
  const lista = [...zonas.data].sort((a, b) => Number(b.ativa) - Number(a.ativa) || a.nome.localeCompare(b.nome, "pt-BR"));

  return (
    <>
      <TabelaCadastro
        titulo="Zonas de Detecção"
        acoes={<Button className="h-10 rounded-full px-5 text-white" onClick={() => abrir("novo")}><Plus aria-hidden="true" className="size-4" />Nova zona</Button>}
        itens={lista}
        chave={z => z.id}
        vazio="Nenhuma zona cadastrada. Crie uma zona e atribua um receptor para começar a contar os animais."
        colunas={[
          { titulo: "Nome", celula: z => <span className="font-semibold">{z.nome}</span> },
          { titulo: "Receptor", celula: z => {
            const r = z.receptor_id ? receptorPorId.get(z.receptor_id) : null;
            return r ? <span>{r.codigo}{r.status === "inativo" && <span className="text-destructive"> (inativo)</span>}</span> : <span className="text-muted-foreground">Sem receptor</span>;
          } },
          { titulo: "Descrição", className: "max-w-[420px]", celula: z => <span className="line-clamp-2">{z.descricao ?? "—"}</span> },
          { titulo: "Situação", celula: z => <SeloStatus tom={z.ativa ? "ativo" : "inativo"}>{z.ativa ? "Ativa" : "Inativa"}</SeloStatus> },
        ]}
        acoesLinha={z => <>
          <Button variant="ghost" size="sm" onClick={() => abrir(z)} aria-label={`Editar ${z.nome}`}><Pencil aria-hidden="true" className="size-4" />Editar</Button>
          <Button
            variant="outline" size="sm" className="rounded-full border-2"
            disabled={alternar.isPending && alternar.variables?.id === z.id}
            title={!z.ativa && !z.receptor_id ? "Atribua um receptor para ativar" : undefined}
            onClick={() => (!z.ativa && !z.receptor_id ? abrir(z) : alternar.mutate(z))}
          >
            {z.ativa ? "Desativar" : "Ativar"}
          </Button>
        </>}
      />

      <PainelFormulario
        aberto={edicao !== null}
        aoFechar={() => setEdicao(null)}
        titulo={editando ? `Editar ${editando.nome}` : "Nova zona"}
        descricao="A zona é a área coberta por um receptor. Os animais são contados na zona do receptor de maior RSSI."
        aoEnviar={enviar}
        salvando={salvar.isPending}
        erro={salvar.error?.message}
        rotuloEnviar={editando ? "Salvar alterações" : "Cadastrar"}
      >
        <CampoFormulario id="zona-nome" rotulo="Nome" obrigatorio erro={erros.nome} ajuda="Único na propriedade, como Curral 03 ou Bebedouro.">
          <Input id="zona-nome" value={form.nome} maxLength={120} aria-invalid={Boolean(erros.nome)} onChange={e => setForm({ ...form, nome: e.target.value })} />
        </CampoFormulario>
        <CampoFormulario id="zona-receptor" rotulo="Receptor" ajuda={receptores.length ? "Um receptor atende uma zona por vez." : "Cadastre um receptor na aba Dispositivos."}>
          <Select items={opcoesReceptor} value={form.receptorId} onValueChange={valor => setForm({ ...form, receptorId: valor ?? SEM_RECEPTOR, ativa: valor === SEM_RECEPTOR ? false : form.ativa })}>
            <SelectTrigger id="zona-receptor" className="w-full"><SelectValue /></SelectTrigger>
            <SelectContent>
              {Object.entries(opcoesReceptor).map(([valor, rotulo]) => (
                <SelectItem key={valor} value={valor} disabled={zonaDoReceptor.has(valor)}>{rotulo}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </CampoFormulario>
        <CampoFormulario id="zona-descricao" rotulo="Descrição" erro={erros.descricao}>
          <textarea
            id="zona-descricao" rows={3} maxLength={2000} value={form.descricao}
            onChange={e => setForm({ ...form, descricao: e.target.value })}
            className="w-full rounded-lg border border-foreground/25 bg-card px-3 py-2 text-sm outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50"
          />
        </CampoFormulario>
        <div className="grid gap-1.5">
          <label className="flex items-center justify-between gap-4 rounded-lg border p-3">
            <span>
              <span className="block text-sm font-medium">Zona ativa</span>
              <span className="block text-xs text-muted-foreground">Somente zonas ativas recebem leituras e entram na contagem.</span>
            </span>
            <Switch checked={form.ativa} disabled={form.receptorId === SEM_RECEPTOR} onCheckedChange={ativa => setForm({ ...form, ativa })} />
          </label>
          {erros.ativa && <p role="alert" className="text-xs text-destructive">{erros.ativa}</p>}
        </div>
        {editando?.ativa && (
          <p className="rounded-lg bg-muted p-3 text-xs text-muted-foreground">
            Alterar uma zona ativa, inclusive o nome, faz com que leituras atrasadas anteriores à alteração fiquem sem zona.
          </p>
        )}
      </PainelFormulario>
    </>
  );
}
