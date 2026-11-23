import { lazy, Suspense, useState } from "react";
import { formatDistanceToNowStrict } from "date-fns";
import { ptBR } from "date-fns/locale";
import { Icon } from "lucide-react";
import { SatelliteDish } from "lucide-react";
import { cowHead } from "@lucide/lab";
import { cn } from "cn";
import type { ComunicacaoReceptor, ResumoMonitoramento } from "@argos/shared";
import { AvisoEstado } from "@/components/custom/AvisoEstado";
import { SeloSimulado } from "@/components/custom/SeloSimulado";
import { useMapaMonitoramento } from "@/hooks/useMapaMonitoramento";
import type { CenarioDemonstracao } from "@/lib/demonstracaoMonitoramento";
import type { FonteEspacial } from "@/lib/espacial";
import type { ZonaCadastro } from "@/lib/fonteMonitoramento";
import { rotaApp } from "@/lib/rotas";

// MapLibre (~1 MB) só é baixado quando o mapa aparece na tela.
const MapaCanvas = lazy(() => import("@/components/custom/MapaCanvas"));

type Props = {
  fonte: FonteEspacial;
  origem: string;
  demonstracao?: CenarioDemonstracao;
  resumo: ResumoMonitoramento | undefined;
  comunicacao: ComunicacaoReceptor[] | undefined;
  zonasCadastro: ZonaCadastro[] | undefined;
  zonaFocoId: string | null;
  foco: "animais" | "receptores";
  agora: number;
  /** Seleção de receptor controlada pela tela (Receptores relaciona com os cards). */
  receptorSelecionado?: string | null;
  aoSelecionarReceptor?: (id: string | null) => void;
  className?: string;
};

const MODO: Record<"geografico" | "planta" | "local", string> = {
  geografico: "Mapa geográfico",
  planta: "Planta da propriedade (metros)",
  local: "Grade local (metros), sem mapa-base",
};

const relativo = (valor: string) => (Date.now() - Date.parse(valor) < 15_000 ? "agora" : formatDistanceToNowStrict(new Date(valor), { locale: ptBR, addSuffix: true }));

/**
 * Mapa das telas Animais e Receptores. Mostra receptores nas coordenadas cadastradas, contornos das
 * zonas, posições estimadas pela trilateração RSSI (3+ receptores, calculadas no worker) e, para os
 * demais animais detectados, apenas a contagem por zona.
 */
export function MapaMonitoramento({
  fonte, origem, demonstracao, resumo, comunicacao, zonasCadastro, zonaFocoId, foco, agora,
  receptorSelecionado: receptorControlado, aoSelecionarReceptor, className,
}: Props) {
  const [animalSelecionado, setAnimalSelecionado] = useState<string | null>(null);
  const [receptorLocal, setReceptorLocal] = useState<string | null>(null);
  const [falha, setFalha] = useState<string | null>(null);
  const receptorSelecionado = receptorControlado !== undefined ? receptorControlado : receptorLocal;
  const selecionarReceptor = (id: string | null) => {
    if (id) setAnimalSelecionado(null);
    if (aoSelecionarReceptor) aoSelecionarReceptor(id); else setReceptorLocal(id);
  };
  const selecionarAnimal = (id: string | null) => {
    if (id) selecionarReceptor(null);
    setAnimalSelecionado(id);
  };

  const mapa = useMapaMonitoramento({ fonte, origem, resumo, comunicacao, zonasCadastro, animalSelecionado, agora });
  const { dados, projecao, referencia, recentes } = mapa;
  const configurar = rotaApp("/configuracoes?aba=mapa", demonstracao);
  const zonaFoco = dados.zonas.find(z => z.id === zonaFocoId) ?? null;
  const animaisZona = (resumo?.animais ?? []).filter(a => a.zona_id === zonaFocoId && a.estado === "recente");
  const comPosicao = new Map(dados.animais.map(a => [a.id, a]));
  const desatualizadosVisiveis = dados.animais.filter(a => a.atualidade === "desatualizada");

  return (
    <div className={cn("grid min-w-0 gap-4", className)}>
      {mapa.falhas.length > 0 && (
        <AvisoEstado tom="erro" titulo={`Não foi possível carregar ${mapa.falhas.map(f => f.nome).join(", ")}.`} acao={{ rotulo: "Tentar novamente", aoClicar: () => void mapa.atualizar() }}>
          {mapa.falhas[0].mensagem} O mapa mostra o restante.
        </AvisoEstado>
      )}
      {!mapa.carregando && referencia.isSuccess && !referencia.data && (
        <AvisoEstado tom="atencao" titulo="Referência espacial da propriedade pendente." acao={{ rotulo: "Configurar mapa", destino: configurar }}>
          Sem georreferenciamento nem planta calibrada, o mapa mostra só a grade local em metros, sem imagem de fundo. Posições e zonas continuam corretas em relação aos receptores.
        </AvisoEstado>
      )}
      {!mapa.carregando && mapa.coordenadas.isSuccess && dados.receptores.length === 0 && (
        <AvisoEstado tom="informacao" titulo="Nenhum receptor com coordenadas cadastradas." acao={{ rotulo: "Cadastrar coordenadas", destino: configurar }}>
          Sem coordenadas não há posição individual: os animais aparecem apenas na contagem por zona.
        </AvisoEstado>
      )}
      {recentes.isError && (
        <AvisoEstado tom="erro" titulo={recentes.data ? "Posições sem atualização." : "Não foi possível consultar as posições estimadas."} acao={{ rotulo: "Tentar novamente", aoClicar: () => void recentes.refetch() }}>
          {recentes.data ? `O mapa mostra as posições consultadas ${relativo(recentes.data.consultado_em)}.` : "Receptores e zonas continuam no mapa."}
        </AvisoEstado>
      )}

      <div className="relative isolate aspect-[4/3] w-full min-w-0 overflow-hidden rounded-xl bg-[#EFEBDD] ring-1 ring-foreground/30 sm:aspect-[2/1] [&_.maplibregl-ctrl-group]:overflow-hidden [&_.maplibregl-ctrl-group]:rounded-full! [&_.maplibregl-ctrl-group]:shadow-[0_1px_4px_rgba(0,0,0,0.35)]! [&_.maplibregl-ctrl-group_button]:size-[36px] [&_.argos-popup_.maplibregl-popup-content]:rounded-lg [&_.argos-popup_.maplibregl-popup-content]:p-3">
        {falha ? (
          <div role="alert" className="absolute inset-0 flex items-center justify-center p-6 text-center text-sm">{falha}</div>
        ) : mapa.carregando ? (
          <div role="status" className="absolute inset-0 flex animate-pulse items-center justify-center text-sm text-muted-foreground">Carregando mapa…</div>
        ) : (
          <Suspense fallback={<div role="status" className="absolute inset-0 flex items-center justify-center text-sm text-muted-foreground">Carregando mapa…</div>}>
            <MapaCanvas
              projecao={projecao}
              referencia={referencia.data ?? null}
              dados={dados}
              trilha={mapa.trilhaMapa}
              foco={foco}
              zonaFocoId={zonaFocoId}
              animalSelecionado={animalSelecionado}
              receptorSelecionado={receptorSelecionado}
              aoSelecionarAnimal={selecionarAnimal}
              aoSelecionarReceptor={selecionarReceptor}
              rotulo={`Mapa de monitoramento: ${dados.receptores.length} receptores, ${dados.animais.length} animais com posição estimada${zonaFoco ? `, zona ${zonaFoco.nome} em foco` : ""}. Use a lista abaixo do mapa para selecionar.`}
              aoFalhar={setFalha}
            />
          </Suspense>
        )}
        <div className="pointer-events-none absolute top-3 left-3 z-10 flex flex-wrap items-center gap-2">
          {projecao.modo !== "geografico" && <span className="rounded-full bg-card/95 px-2.5 py-0.5 text-[11px] font-medium shadow-sm">{MODO[projecao.modo]}</span>}
          {demonstracao && <SeloSimulado className="bg-card" descricao="Prévia: receptores, zonas e posições do mapa são simulados." />}
        </div>
      </div>

      <ul aria-label="Legenda do mapa" className="flex flex-wrap gap-x-5 gap-y-2 text-xs text-muted-foreground">
        <li className="flex items-center gap-1.5"><span className="flex size-5 items-center justify-center rounded-full bg-white text-secondary shadow-[0_1px_3px_rgba(0,0,0,0.35)]"><Icon iconNode={cowHead} aria-hidden="true" className="size-3" /></span>Posição estimada (RSSI)</li>
        <li className="flex items-center gap-1.5"><span className="flex size-5 items-center justify-center rounded-full border border-dashed border-zinc-400 bg-zinc-100 text-zinc-500"><Icon iconNode={cowHead} aria-hidden="true" className="size-3" /></span>Última posição, desatualizada</li>
        <li className="flex items-center gap-1.5"><span className="flex size-5 items-center justify-center rounded-full bg-secondary text-[10px] font-semibold text-white">3</span>Animais próximos agrupados</li>
        <li className="flex items-center gap-1.5"><span className="flex h-5 items-center rounded-full border-2 border-dashed border-secondary/60 bg-card px-1.5 font-semibold text-secondary">5</span>Detectados na zona, sem posição individual</li>
        <li className="flex items-center gap-1.5"><span className="relative flex size-5 items-center justify-center rounded-full bg-white text-secondary shadow-[0_1px_3px_rgba(0,0,0,0.35)]"><SatelliteDish aria-hidden="true" className="size-3" /><span className="absolute -right-0.5 -bottom-0.5 size-2 rounded-full border border-white bg-[#0AA146]" /></span>Receptor (ponto verde: comunicação recente)</li>
        <li className="flex items-center gap-1.5"><span aria-hidden="true" className="h-3 w-5 rounded-sm border-2 border-primary" />Zona</li>
        <li className="flex items-center gap-1.5"><span aria-hidden="true" className="w-6 border-t-2 border-dashed border-secondary" />Trilha sem cobertura</li>
      </ul>

      <p className="text-xs leading-relaxed text-muted-foreground">
        Posições estimadas por trilateração RSSI no servidor, somente com três ou mais receptores calibrados. Não são GPS:
        o resíduo do ajuste não é margem de erro. Com um ou dois receptores o animal aparece apenas na contagem da zona.
        {recentes.data && ` Consultado ${relativo(recentes.data.consultado_em)}.`}
        {recentes.data && recentes.data.count > recentes.data.data.length && ` Exibindo ${recentes.data.data.length} de ${recentes.data.count} estimativas recentes.`}
      </p>

      {foco === "animais" && zonaFoco && (
        <section aria-label={`Animais detectados em ${zonaFoco.nome}`} className="min-w-0">
          <h3 className="mb-2 text-sm font-medium">
            {zonaFoco.nome}: {zonaFoco.quantidade} {zonaFoco.quantidade === 1 ? "animal detectado" : "animais detectados"} · {zonaFoco.quantidade - zonaFoco.semPosicao} com posição estimada
          </h3>
          {animaisZona.length === 0 ? <p className="text-sm text-muted-foreground">Nenhum animal com detecção recente nesta zona.</p> : (
            <ul className="grid max-h-60 grid-cols-[repeat(auto-fill,minmax(150px,1fr))] gap-2 overflow-y-auto pr-1">
              {animaisZona.map(a => {
                const posicao = comPosicao.get(a.animal_id);
                return (
                  <li key={a.animal_id}>
                    <button
                      type="button"
                      disabled={!posicao}
                      aria-pressed={animalSelecionado === a.animal_id}
                      onClick={() => selecionarAnimal(a.animal_id)}
                      className={cn(
                        "w-full rounded-lg border px-2.5 py-1.5 text-left text-xs transition-colors enabled:hover:bg-muted disabled:cursor-default focus-visible:outline-2 focus-visible:outline-ring",
                        animalSelecionado === a.animal_id && "border-primary bg-primary/8",
                      )}
                    >
                      <span className="block font-semibold">{a.identificacao}</span>
                      <span className="block text-muted-foreground">
                        {posicao ? `Posição ${relativo(posicao.observadoEm)}` : "Somente zona"}
                        {a.ultima_deteccao_em && ` · detecção ${relativo(a.ultima_deteccao_em)}`}
                      </span>
                    </button>
                  </li>
                );
              })}
            </ul>
          )}
        </section>
      )}

      {foco === "animais" && desatualizadosVisiveis.length > 0 && (
        <p className="text-xs text-muted-foreground">
          Sem detecção recente, com última posição no mapa: {desatualizadosVisiveis.map(a => (
            <button key={a.id} type="button" onClick={() => selecionarAnimal(a.id)} className="mr-2 font-medium text-foreground underline underline-offset-2">{a.identificacao}</button>
          ))}
        </p>
      )}

      {dados.zonas.some(z => !z.ancora && z.quantidade > 0) && (
        <p className="text-xs text-muted-foreground">
          Zonas sem contorno nem receptor com coordenadas (só na contagem): {dados.zonas.filter(z => !z.ancora && z.quantidade > 0).map(z => `${z.nome} (${z.quantidade})`).join(", ")}.
        </p>
      )}

      {(foco === "receptores" || dados.receptoresSemCoordenada.length > 0) && (
        <section aria-label="Receptores no mapa" className="min-w-0">
          {foco === "receptores" && dados.receptores.length > 0 && (
            <ul className="flex flex-wrap gap-2">
              {dados.receptores.map(r => (
                <li key={r.id}>
                  <button
                    type="button"
                    aria-pressed={receptorSelecionado === r.id}
                    onClick={() => selecionarReceptor(receptorSelecionado === r.id ? null : r.id)}
                    className={cn("flex items-center gap-1.5 rounded-full border px-3 py-1 text-xs hover:bg-muted focus-visible:outline-2 focus-visible:outline-ring", receptorSelecionado === r.id && "border-primary bg-primary/8")}
                  >
                    <span aria-hidden="true" className={cn("size-2 rounded-full", r.estado === "recente" && !r.inativo ? "bg-[#0AA146]" : "bg-zinc-400")} />
                    {r.nome ?? r.codigo}
                  </button>
                </li>
              ))}
            </ul>
          )}
          {dados.receptoresSemCoordenada.length > 0 && (
            <p className="mt-2 text-xs text-muted-foreground">
              Sem coordenadas (fora do mapa e da trilateração): {dados.receptoresSemCoordenada.map(r => r.nome ?? r.codigo).join(", ")}.
            </p>
          )}
        </section>
      )}
    </div>
  );
}
