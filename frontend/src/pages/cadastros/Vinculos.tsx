import { useState } from "react";
import { format } from "date-fns";
import { Link2, Unlink } from "lucide-react";
import { CampoFormulario } from "@/components/custom/CampoFormulario";
import { EstadoBloco } from "@/components/custom/EstadoConsulta";
import { PainelFormulario } from "@/components/custom/PainelFormulario";
import { SeletorPilulas } from "@/components/custom/SeletorPilulas";
import { SeloStatus } from "@/components/custom/SeloStatus";
import { TabelaCadastro } from "@/components/custom/TabelaCadastro";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription,
  AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useListasCadastro, useMutacaoCadastro } from "@/hooks/useCadastros";
import type { FonteCadastros, Vinculo } from "@/lib/cadastros";

type Filtro = "ativos" | "historico";
const dataHora = (valor: string | null) => (valor ? format(new Date(valor), "dd/MM/yyyy HH:mm") : "—");

/** Vínculos entre coleira e animal. Encerrar preserva o histórico; para transferir, encerre e crie outro. */
export function CadastroVinculos({ fonte, origem }: { fonte: FonteCadastros; origem: string }) {
  const { dispositivos, animais, vinculos } = useListasCadastro(fonte, origem);
  const [filtro, setFiltro] = useState<Filtro>("ativos");
  const [novo, setNovo] = useState(false);
  const [animalId, setAnimalId] = useState("");
  const [coleiraId, setColeiraId] = useState("");
  const [tentouEnviar, setTentouEnviar] = useState(false);
  const [encerrando, setEncerrando] = useState<Vinculo | null>(null);

  const criar = useMutacaoCadastro(origem, () => fonte.criarVinculo(animalId, coleiraId), () => "Coleira vinculada ao animal");
  const encerrar = useMutacaoCadastro(origem, (v: Vinculo) => fonte.encerrarVinculo(v.id), () => "Vínculo encerrado");

  if (!vinculos.data) return <EstadoBloco consulta={vinculos} nome="os vínculos" />;
  const animalPorId = new Map((animais.data ?? []).map(a => [a.id, a]));
  const coleiraPorId = new Map((dispositivos.data ?? []).filter(d => d.tipo === "transmissor").map(d => [d.id, d]));
  const ativos = vinculos.data.filter(v => !v.fim_em);
  const ocupados = new Set(ativos.flatMap(v => [v.animal_id, v.transmissor_id]));
  const animaisLivres = (animais.data ?? []).filter(a => a.status === "ativo" && !ocupados.has(a.id)).sort((a, b) => a.identificacao.localeCompare(b.identificacao, "pt-BR", { numeric: true }));
  const coleirasLivres = [...coleiraPorId.values()].filter(c => c.status === "ativo" && !ocupados.has(c.id)).sort((a, b) => a.codigo.localeCompare(b.codigo, "pt-BR", { numeric: true }));
  const lista = (filtro === "ativos" ? ativos : vinculos.data).slice().sort((a, b) => Date.parse(b.inicio_em) - Date.parse(a.inicio_em));
  const erroAnimal = tentouEnviar && !animalId ? "Escolha o animal." : undefined;
  const erroColeira = tentouEnviar && !coleiraId ? "Escolha a coleira." : undefined;

  function abrirNovo() {
    setNovo(true); setAnimalId(""); setColeiraId(""); setTentouEnviar(false); criar.reset();
  }
  function enviar() {
    setTentouEnviar(true);
    if (!animalId || !coleiraId) return;
    criar.mutate(undefined, { onSuccess: () => setNovo(false) });
  }

  return (
    <>
      <TabelaCadastro
        titulo="Vínculos Coleira–Animal"
        acoes={<>
          <SeletorPilulas rotulo="Filtrar vínculos" value={filtro} onChange={setFiltro} opcoes={[
            { value: "ativos", label: "Ativos", contagem: ativos.length },
            { value: "historico", label: "Histórico", contagem: vinculos.data.length },
          ]} />
          <Button className="h-10 rounded-full px-5 text-white" onClick={abrirNovo}><Link2 aria-hidden="true" className="size-4" />Novo vínculo</Button>
        </>}
        itens={lista}
        chave={v => v.id}
        vazio={filtro === "ativos" ? "Nenhuma coleira vinculada. Sem vínculo, as leituras não são associadas a um animal." : "Nenhum vínculo registrado."}
        colunas={[
          { titulo: "Animal", celula: v => <span className="font-semibold">{animalPorId.get(v.animal_id)?.identificacao ?? "—"}</span> },
          { titulo: "Coleira", celula: v => { const c = coleiraPorId.get(v.transmissor_id); return c ? `${c.codigo}${c.nome ? ` · ${c.nome}` : ""}` : "—"; } },
          { titulo: "Início", celula: v => dataHora(v.inicio_em) },
          { titulo: "Fim", celula: v => dataHora(v.fim_em) },
          { titulo: "Situação", celula: v => <SeloStatus tom={v.fim_em ? "inativo" : "ativo"}>{v.fim_em ? "Encerrado" : "Ativo"}</SeloStatus> },
        ]}
        acoesLinha={v => !v.fim_em && (
          <Button variant="outline" size="sm" className="rounded-full border-2" disabled={encerrar.isPending && encerrar.variables?.id === v.id} onClick={() => setEncerrando(v)}>
            <Unlink aria-hidden="true" className="size-4" />Encerrar
          </Button>
        )}
        rodape={<p className="text-xs text-muted-foreground">Para transferir uma coleira, encerre o vínculo atual e crie outro. O histórico de leituras de cada animal é preservado.</p>}
      />

      <PainelFormulario
        aberto={novo}
        aoFechar={() => setNovo(false)}
        titulo="Novo vínculo"
        descricao="A coleira passa a identificar o animal nas próximas leituras."
        aoEnviar={enviar}
        salvando={criar.isPending}
        erro={criar.error?.message}
        rotuloEnviar="Vincular"
      >
        <CampoFormulario id="vinculo-animal" rotulo="Animal" obrigatorio erro={erroAnimal} ajuda={animaisLivres.length ? "Animais ativos sem coleira." : "Todos os animais ativos já têm coleira, ou não há animais cadastrados."}>
          <Select items={Object.fromEntries(animaisLivres.map(a => [a.id, a.identificacao]))} value={animalId || null} onValueChange={v => setAnimalId(v ?? "")}>
            <SelectTrigger id="vinculo-animal" className="w-full" aria-invalid={Boolean(erroAnimal)}><SelectValue placeholder="Escolha o animal" /></SelectTrigger>
            <SelectContent>{animaisLivres.map(a => <SelectItem key={a.id} value={a.id}>{a.identificacao}</SelectItem>)}</SelectContent>
          </Select>
        </CampoFormulario>
        <CampoFormulario id="vinculo-coleira" rotulo="Coleira" obrigatorio erro={erroColeira} ajuda={coleirasLivres.length ? "Coleiras ativas sem animal." : "Nenhuma coleira livre. Cadastre uma na aba Dispositivos."}>
          <Select items={Object.fromEntries(coleirasLivres.map(c => [c.id, `${c.codigo}${c.nome ? ` · ${c.nome}` : ""}`]))} value={coleiraId || null} onValueChange={v => setColeiraId(v ?? "")}>
            <SelectTrigger id="vinculo-coleira" className="w-full" aria-invalid={Boolean(erroColeira)}><SelectValue placeholder="Escolha a coleira" /></SelectTrigger>
            <SelectContent>{coleirasLivres.map(c => <SelectItem key={c.id} value={c.id}>{c.codigo}{c.nome ? ` · ${c.nome}` : ""}</SelectItem>)}</SelectContent>
          </Select>
        </CampoFormulario>
      </PainelFormulario>

      <AlertDialog open={encerrando !== null} onOpenChange={aberto => { if (!aberto) setEncerrando(null); }}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Encerrar vínculo?</AlertDialogTitle>
            <AlertDialogDescription>
              A coleira {encerrando && coleiraPorId.get(encerrando.transmissor_id)?.codigo} deixará de identificar o animal {encerrando && animalPorId.get(encerrando.animal_id)?.identificacao}. O histórico é mantido e não é possível reabrir o vínculo.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction className="text-white" onClick={() => { if (encerrando) encerrar.mutate(encerrando); setEncerrando(null); }}>Encerrar vínculo</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}
