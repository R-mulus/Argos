import { useState } from "react";
import { Pencil, Plus } from "lucide-react";
import { CampoFormulario } from "@/components/custom/CampoFormulario";
import { EstadoBloco } from "@/components/custom/EstadoConsulta";
import { PainelFormulario } from "@/components/custom/PainelFormulario";
import { SeletorPilulas } from "@/components/custom/SeletorPilulas";
import { SeloStatus } from "@/components/custom/SeloStatus";
import { TabelaCadastro } from "@/components/custom/TabelaCadastro";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import { opcional, useListasCadastro, useMutacaoCadastro } from "@/hooks/useCadastros";
import type { Dispositivo, FonteCadastros } from "@/lib/cadastros";

type Filtro = "todos" | Dispositivo["tipo"];
type Formulario = { tipo: Dispositivo["tipo"]; codigo: string; nome: string; hardware: string; firmware: string; ativo: boolean };
const formularioVazio: Formulario = { tipo: "transmissor", codigo: "", nome: "", hardware: "", firmware: "", ativo: true };
const nomeTipo = { transmissor: "Coleira", receptor: "Receptor" } as const;

function validar(f: Formulario) {
  const erros: Partial<Record<keyof Formulario, string>> = {};
  if (!f.codigo.trim()) erros.codigo = "Informe o código.";
  else if (f.codigo.trim().length > 80) erros.codigo = "Use até 80 caracteres.";
  if (f.nome.trim().length > 160) erros.nome = "Use até 160 caracteres.";
  if (f.hardware.trim().length > 160) erros.hardware = "Use até 160 caracteres.";
  if (f.firmware.trim().length > 80) erros.firmware = "Use até 80 caracteres.";
  return erros;
}

/** Cadastro de coleiras (transmissores) e receptores. O tipo não pode ser alterado depois. */
export function CadastroDispositivos({ fonte, origem }: { fonte: FonteCadastros; origem: string }) {
  const { dispositivos, zonas, animais, vinculos } = useListasCadastro(fonte, origem);
  const [filtro, setFiltro] = useState<Filtro>("todos");
  const [edicao, setEdicao] = useState<Dispositivo | "novo" | null>(null);
  const [form, setForm] = useState<Formulario>(formularioVazio);
  const [tentouEnviar, setTentouEnviar] = useState(false);

  const salvar = useMutacaoCadastro(origem,
    async (f: Formulario) => {
      const campos = { codigo: f.codigo.trim(), nome: opcional(f.nome), identificador_hardware: opcional(f.hardware), versao_firmware: opcional(f.firmware), status: f.ativo ? "ativo" as const : "inativo" as const };
      return edicao && edicao !== "novo" ? fonte.editarDispositivo(edicao.id, campos) : fonte.criarDispositivo({ ...campos, tipo: f.tipo });
    },
    d => `${nomeTipo[d.tipo]} ${d.codigo} salvo`);
  const alternar = useMutacaoCadastro(origem,
    (d: Dispositivo) => fonte.editarDispositivo(d.id, { status: d.status === "ativo" ? "inativo" : "ativo" }),
    d => `${nomeTipo[d.tipo]} ${d.codigo} ${d.status === "ativo" ? "ativado" : "desativado"}`);

  function abrir(alvo: Dispositivo | "novo") {
    setEdicao(alvo);
    setTentouEnviar(false);
    salvar.reset();
    setForm(alvo === "novo"
      ? { ...formularioVazio, tipo: filtro === "receptor" ? "receptor" : "transmissor" }
      : { tipo: alvo.tipo, codigo: alvo.codigo, nome: alvo.nome ?? "", hardware: alvo.identificador_hardware ?? "", firmware: alvo.versao_firmware ?? "", ativo: alvo.status === "ativo" });
  }
  function enviar() {
    setTentouEnviar(true);
    if (Object.keys(validar(form)).length) return;
    salvar.mutate(form, { onSuccess: () => setEdicao(null) });
  }

  if (!dispositivos.data) return <EstadoBloco consulta={dispositivos} nome="os dispositivos" />;
  const lista = dispositivos.data;
  const visiveis = lista.filter(d => filtro === "todos" || d.tipo === filtro).sort((a, b) => a.tipo.localeCompare(b.tipo) || a.codigo.localeCompare(b.codigo, "pt-BR", { numeric: true }));
  const zonaDoReceptor = new Map((zonas.data ?? []).filter(z => z.receptor_id).map(z => [z.receptor_id!, z]));
  const animalPorId = new Map((animais.data ?? []).map(a => [a.id, a.identificacao]));
  const vinculoAtivo = new Map((vinculos.data ?? []).filter(v => !v.fim_em).map(v => [v.transmissor_id, v.animal_id]));
  const erros = tentouEnviar ? validar(form) : {};
  const editando = edicao && edicao !== "novo" ? edicao : null;

  function situacao(d: Dispositivo) {
    if (d.tipo === "receptor") {
      const zona = zonaDoReceptor.get(d.id);
      return zona ? <span>{zona.nome}{!zona.ativa && <span className="text-muted-foreground"> (zona inativa)</span>}</span> : <span className="text-muted-foreground">Sem zona</span>;
    }
    const animal = vinculoAtivo.get(d.id);
    return animal ? <span>No animal {animalPorId.get(animal) ?? "—"}</span> : <span className="text-muted-foreground">Livre</span>;
  }

  return (
    <>
      <TabelaCadastro
        titulo="Dispositivos"
        acoes={<>
          <SeletorPilulas rotulo="Filtrar por tipo" value={filtro} onChange={setFiltro} opcoes={[
            { value: "todos", label: "Todos", contagem: lista.length },
            { value: "transmissor", label: "Coleiras", contagem: lista.filter(d => d.tipo === "transmissor").length },
            { value: "receptor", label: "Receptores", contagem: lista.filter(d => d.tipo === "receptor").length },
          ]} />
          <Button className="h-10 rounded-full px-5 text-white" onClick={() => abrir("novo")}><Plus aria-hidden="true" className="size-4" />Novo dispositivo</Button>
        </>}
        itens={visiveis}
        chave={d => d.id}
        vazio={lista.length ? "Nenhum dispositivo deste tipo." : "Nenhum dispositivo cadastrado. Cadastre os receptores e as coleiras antes de criar zonas e vínculos."}
        colunas={[
          { titulo: "Código", celula: d => <span className="font-semibold">{d.codigo}</span> },
          { titulo: "Nome", celula: d => d.nome ?? <span className="text-muted-foreground">—</span> },
          { titulo: "Tipo", celula: d => nomeTipo[d.tipo] },
          { titulo: "Uso atual", celula: situacao },
          { titulo: "Hardware", celula: d => d.identificador_hardware ?? <span className="text-muted-foreground">Não provisionado</span> },
          { titulo: "Firmware", celula: d => d.versao_firmware ?? "—" },
          { titulo: "Status", celula: d => <SeloStatus tom={d.status === "ativo" ? "ativo" : "inativo"}>{d.status === "ativo" ? "Ativo" : "Inativo"}</SeloStatus> },
        ]}
        acoesLinha={d => <>
          <Button variant="ghost" size="sm" onClick={() => abrir(d)} aria-label={`Editar ${d.codigo}`}><Pencil aria-hidden="true" className="size-4" />Editar</Button>
          <Button variant="outline" size="sm" className="rounded-full border-2" disabled={alternar.isPending && alternar.variables?.id === d.id} onClick={() => alternar.mutate(d)}>
            {d.status === "ativo" ? "Desativar" : "Ativar"}
          </Button>
        </>}
      />

      <PainelFormulario
        aberto={edicao !== null}
        aoFechar={() => setEdicao(null)}
        titulo={editando ? `Editar ${nomeTipo[editando.tipo].toLowerCase()} ${editando.codigo}` : "Novo dispositivo"}
        descricao={editando ? "O tipo não pode ser alterado depois do cadastro." : "Coleiras vão nos animais; receptores ficam nas zonas."}
        aoEnviar={enviar}
        salvando={salvar.isPending}
        erro={salvar.error?.message}
        rotuloEnviar={editando ? "Salvar alterações" : "Cadastrar"}
      >
        {!editando && (
          <div className="grid gap-1.5">
            <span className="text-sm font-medium">Tipo</span>
            <SeletorPilulas rotulo="Tipo do dispositivo" value={form.tipo} onChange={tipo => setForm({ ...form, tipo })} opcoes={[{ value: "transmissor", label: "Coleira" }, { value: "receptor", label: "Receptor" }]} />
          </div>
        )}
        <CampoFormulario id="disp-codigo" rotulo="Código" obrigatorio erro={erros.codigo} ajuda="Único por tipo na propriedade, como T01 ou R01.">
          <Input id="disp-codigo" value={form.codigo} maxLength={80} aria-invalid={Boolean(erros.codigo)} onChange={e => setForm({ ...form, codigo: e.target.value })} />
        </CampoFormulario>
        <CampoFormulario id="disp-nome" rotulo="Nome" erro={erros.nome}>
          <Input id="disp-nome" value={form.nome} maxLength={160} placeholder={form.tipo === "receptor" ? "Receptor do Curral" : "Coleira 01"} onChange={e => setForm({ ...form, nome: e.target.value })} />
        </CampoFormulario>
        <CampoFormulario id="disp-hardware" rotulo="Identificador de hardware" erro={erros.hardware} ajuda="Opcional até o provisionamento do ESP32.">
          <Input id="disp-hardware" value={form.hardware} maxLength={160} onChange={e => setForm({ ...form, hardware: e.target.value })} />
        </CampoFormulario>
        <CampoFormulario id="disp-firmware" rotulo="Versão do firmware" erro={erros.firmware}>
          <Input id="disp-firmware" value={form.firmware} maxLength={80} onChange={e => setForm({ ...form, firmware: e.target.value })} />
        </CampoFormulario>
        <label className="flex items-center justify-between gap-4 rounded-lg border p-3">
          <span>
            <span className="block text-sm font-medium">Ativo</span>
            <span className="block text-xs text-muted-foreground">Leituras de dispositivos inativos são rejeitadas.</span>
          </span>
          <Switch checked={form.ativo} onCheckedChange={ativo => setForm({ ...form, ativo })} />
        </label>
      </PainelFormulario>
    </>
  );
}
