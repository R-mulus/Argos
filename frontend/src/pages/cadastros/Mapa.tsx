import { lazy, Suspense, useMemo, useState, type FormEvent } from "react";
import { Link } from "react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import type { CoordenadaReceptorIoT, ReferenciaEspacial } from "@argos/shared";
import { CampoFormulario } from "@/components/custom/CampoFormulario";
import { EstadoBloco } from "@/components/custom/EstadoConsulta";
import { Button, buttonVariants } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { toast } from "@/components/ui/toast";
import { useListasCadastro } from "@/hooks/useCadastros";
import type { FonteCadastros } from "@/lib/cadastros";
import type { CenarioDemonstracao } from "@/lib/demonstracaoMonitoramento";
import { chaveEspacial, type FonteEspacial, type ReferenciaEspacialDados } from "@/lib/espacial";
import { areaPoligono, criarProjecao, type LngLat } from "@/lib/referenciaEspacial";
import { formatarCoordenada, lerCoordenada } from "@/lib/coordenadas";
import type { Ferramenta, ReceptorPosicionavel } from "@/components/custom/PosicionamentoCanvas";
import { LocateFixed, MapPin } from "lucide-react";
import { rotaApp } from "@/lib/rotas";
import { cn } from "@/lib/utils";

/** Número digitado com vírgula ou ponto decimal; `null` se vazio ou inválido. */
function numero(texto: string): number | null {
  const limpo = texto.trim().replace(",", ".");
  if (!limpo || !/^[-+]?\d+(\.\d+)?$/.test(limpo)) return null;
  return Number(limpo);
}
const texto = (v: number | null | undefined) => (v == null ? "" : String(v).replace(".", ","));

function entre(valor: number | null, min: number, max: number, nome: string, maxExclusivo = false) {
  if (valor === null) return `Informe ${nome}.`;
  if (valor < min || (maxExclusivo ? valor >= max : valor > max)) return `${nome[0].toUpperCase()}${nome.slice(1)} deve ficar entre ${min} e ${max}${maxExclusivo ? " (sem incluir)" : ""}.`;
  return null;
}

/**
 * Vértices um por linha, `x; y` ou `x y` (vírgula ou ponto decimal). Devolve os pontos ou o erro
 * da primeira linha inválida. As regras finais são as da API (3 a 200 vértices, área mínima).
 */
export function lerVertices(conteudo: string): { pontos: [number, number][] } | { erro: string } {
  const linhas = conteudo.split(/\r?\n/).map(l => l.trim()).filter(Boolean);
  const pontos: [number, number][] = [];
  for (const [i, linha] of linhas.entries()) {
    const partes = linha.includes(";") ? linha.split(";") : linha.split(/\s+/);
    const [x, y] = partes.map(numero);
    if (partes.length !== 2 || x === null || y === null) return { erro: `Linha ${i + 1}: use "x; y" em metros, como 12,5; 40.` };
    pontos.push([x, y]);
  }
  if (pontos.length < 3) return { erro: "Informe pelo menos 3 vértices." };
  if (pontos.length > 200) return { erro: "Use até 200 vértices." };
  return { pontos };
}

function useMutacaoEspacial<V, R>(origem: string, executar: (v: V) => Promise<R>, sucesso: string) {
  const cliente = useQueryClient();
  return useMutation({
    mutationFn: executar,
    onSuccess: () => toast.add({ type: "success", title: sucesso }),
    onError: erro => toast.add({ type: "error", title: "Não foi possível salvar", description: erro.message }),
    onSettled: () => cliente.invalidateQueries({ queryKey: ["espacial", origem] }),
  });
}

const PosicionamentoCanvas = lazy(() => import("@/components/custom/PosicionamentoCanvas"));

type PropsReferencia = {
  referencia: ReferenciaEspacial | null;
  fonte: FonteEspacial;
  origem: string;
  receptores: ReceptorPosicionavel[];
  coordenadas: Map<string, CoordenadaReceptorIoT>;
  zonas: [number, number][][];
};

function FormReferencia({ referencia, fonte, origem, receptores, coordenadas, zonas }: PropsReferencia) {
  const [modo, setModo] = useState<"geografico" | "planta">(referencia?.modo ?? "geografico");
  const [campos, setCampos] = useState({
    latitude: texto(referencia?.origem_latitude), longitude: texto(referencia?.origem_longitude),
    azimute: texto(referencia?.azimute_eixo_y_graus ?? 0), url: referencia?.planta_url ?? "",
    xMin: texto(referencia?.planta_x_min_m), yMin: texto(referencia?.planta_y_min_m),
    xMax: texto(referencia?.planta_x_max_m), yMax: texto(referencia?.planta_y_max_m),
  });
  const [tentou, setTentou] = useState(false);
  const [movidos, setMovidos] = useState<Map<string, LngLat>>(() => new Map());
  const [ferramenta, setFerramenta] = useState<Ferramenta>({ tipo: "origem" });
  const [busca, setBusca] = useState("");
  const [erroBusca, setErroBusca] = useState<string | null>(null);
  const [destino, setDestino] = useState<{ latitude: number; longitude: number; chave: number } | null>(null);
  const [falhaMapa, setFalhaMapa] = useState<string | null>(null);
  const [localizando, setLocalizando] = useState(false);

  // Salva a referência e, em seguida, as posições dos receptores arrastados (em metros a partir da nova origem).
  const salvar = useMutacaoEspacial(origem, async (d: ReferenciaEspacialDados) => {
    const salva = await fonte.salvarReferencia(d);
    if (d.modo === "geografico") {
      const projecao = criarProjecao(salva);
      for (const [id, [lng, lat]] of movidos) {
        const { x, y } = projecao.paraLocal(lng, lat);
        const atual = coordenadas.get(id);
        await fonte.salvarCoordenada({
          receptor_id: id, x_m: Math.round(x * 100) / 100, y_m: Math.round(y * 100) / 100,
          rssi_1m_dbm: atual?.rssi_1m_dbm ?? -50, expoente_perda: atual?.expoente_perda ?? 2.6,
        });
      }
    }
    return salva;
  }, "Localização salva");
  const alterar = (chave: keyof typeof campos) => (e: { target: { value: string } }) => setCampos({ ...campos, [chave]: e.target.value });

  const azimute = numero(campos.azimute);
  const erros: Partial<Record<keyof typeof campos, string>> = {};
  const marcar = (chave: keyof typeof campos, erro: string | null) => { if (erro) erros[chave] = erro; };
  marcar("azimute", entre(azimute, 0, 360, "o azimute", true));
  if (modo === "geografico") {
    marcar("latitude", entre(numero(campos.latitude), -85, 85, "a latitude"));
    marcar("longitude", entre(numero(campos.longitude), -180, 180, "a longitude"));
  } else {
    if (!/^https:\/\/\S+$/.test(campos.url.trim())) erros.url = "Use um endereço https da imagem (PNG ou JPEG).";
    for (const c of ["xMin", "yMin", "xMax", "yMax"] as const) marcar(c, entre(numero(campos[c]), -1e6, 1e6, "o valor"));
    if (!erros.xMax && numero(campos.xMax)! <= numero(campos.xMin)!) erros.xMax = "x máximo deve ser maior que o mínimo.";
    if (!erros.yMax && numero(campos.yMax)! <= numero(campos.yMin)!) erros.yMax = "y máximo deve ser maior que o mínimo.";
  }
  const mostrar = tentou ? erros : {};
  const latitude = numero(campos.latitude);
  const longitude = numero(campos.longitude);
  const origemMapa = useMemo(
    () => (latitude !== null && longitude !== null && !erros.latitude && !erros.longitude ? { latitude, longitude } : null),
    [latitude, longitude, erros.latitude, erros.longitude],
  );
  const projecaoAtual = useMemo(() => origemMapa ? criarProjecao({
    propriedade_id: "", atualizado_em: "", modo: "geografico", origem_latitude: origemMapa.latitude, origem_longitude: origemMapa.longitude,
    azimute_eixo_y_graus: azimute !== null && !erros.azimute ? azimute : 0,
    planta_url: null, planta_x_min_m: null, planta_y_min_m: null, planta_x_max_m: null, planta_y_max_m: null,
  }) : null, [origemMapa, azimute, erros.azimute]);

  function marcarOrigem(lat: number, lng: number) {
    setCampos(c => ({ ...c, latitude: texto(Number(formatarCoordenada(lat))), longitude: texto(Number(formatarCoordenada(lng))) }));
  }
  function moverReceptor(id: string, lngLat: LngLat) {
    setMovidos(m => new Map(m).set(id, lngLat));
    setFerramenta({ tipo: "origem" });
  }
  function buscar() {
    const lido = lerCoordenada(busca);
    if (!lido) {
      setErroBusca(/goo\.gl|maps\.app/i.test(busca) ? "Links curtos não trazem as coordenadas. No Google Maps, clique com o botão direito no ponto e copie os números." : "Não reconheci coordenadas. Use, por exemplo, -18,5789 -46,5181.");
      return;
    }
    setErroBusca(null);
    setDestino({ ...lido, chave: Date.now() });
  }
  function minhaLocalizacao() {
    if (!navigator.geolocation) { setErroBusca("Este navegador não informa a localização."); return; }
    setLocalizando(true);
    navigator.geolocation.getCurrentPosition(
      pos => { setLocalizando(false); setErroBusca(null); setDestino({ latitude: pos.coords.latitude, longitude: pos.coords.longitude, chave: Date.now() }); },
      () => { setLocalizando(false); setErroBusca("Não foi possível obter a localização (permissão negada ou sem sinal)."); },
      { enableHighAccuracy: true, timeout: 15_000 },
    );
  }

  function enviar(e: FormEvent) {
    e.preventDefault();
    setTentou(true);
    if (Object.keys(erros).length) return;
    salvar.mutate(modo === "geografico"
      ? { modo, origem_latitude: numero(campos.latitude)!, origem_longitude: numero(campos.longitude)!, azimute_eixo_y_graus: azimute! }
      : { modo, azimute_eixo_y_graus: azimute!, planta_url: campos.url.trim(), planta_x_min_m: numero(campos.xMin)!, planta_y_min_m: numero(campos.yMin)!, planta_x_max_m: numero(campos.xMax)!, planta_y_max_m: numero(campos.yMax)! });
  }

  const campo = (chave: keyof typeof campos, rotulo: string, ajuda?: string, modoTeclado: "decimal" | "url" = "decimal") => (
    <CampoFormulario id={`ref-${chave}`} rotulo={rotulo} obrigatorio erro={mostrar[chave]} ajuda={ajuda}>
      <Input id={`ref-${chave}`} inputMode={modoTeclado} value={campos[chave]} aria-invalid={Boolean(mostrar[chave])} onChange={alterar(chave)} />
    </CampoFormulario>
  );

  return (
    <Card className="gap-5 p-5 sm:p-6">
      <div>
        <h2 className="text-xl font-medium">Localização da propriedade</h2>
        <p className="mt-1 text-sm text-muted-foreground">
          {referencia ? `Modo atual: ${referencia.modo === "geografico" ? "mapa de satélite" : "planta em metros"}.` : "Pendente: o mapa mostra só a grade local em metros."}
          {" "}Marque no satélite um ponto de origem (0, 0) e onde cada receptor está instalado; as posições dos animais são calculadas em metros a partir dessa origem.
        </p>
      </div>
      <form noValidate onSubmit={enviar} className="grid gap-5">
        <fieldset className="flex flex-wrap gap-2">
          <legend className="sr-only">Tipo de referência</legend>
          {([["geografico", "Mapa de satélite"], ["planta", "Planta ou imagem aérea própria"]] as const).map(([valor, rotulo]) => (
            <label key={valor} className={cn("flex cursor-pointer items-center gap-2 rounded-full border-2 px-4 py-1.5 text-sm", modo === valor ? "border-primary bg-primary/8" : "border-foreground/20")}>
              <input type="radio" name="modo-referencia" value={valor} checked={modo === valor} onChange={() => setModo(valor)} className="accent-[#EE8A1B]" />
              {rotulo}
            </label>
          ))}
        </fieldset>
        {modo === "geografico" ? (
          <div className="grid gap-4">
            <div className="grid gap-2">
              <label htmlFor="ref-busca" className="text-sm font-medium">Ir para a fazenda</label>
              <div className="flex flex-wrap gap-2">
                <Input
                  id="ref-busca" value={busca} placeholder="-18,5789 -46,5181 ou link do Google Maps" className="min-w-0 flex-1 basis-60"
                  aria-invalid={Boolean(erroBusca)} aria-describedby={erroBusca ? "ref-busca-erro" : undefined}
                  onChange={e => setBusca(e.target.value)}
                  onKeyDown={e => { if (e.key === "Enter") { e.preventDefault(); buscar(); } }}
                />
                <Button type="button" variant="outline" className="rounded-full border-2" onClick={buscar}>Ir</Button>
                <Button type="button" variant="outline" className="rounded-full border-2" onClick={minhaLocalizacao} disabled={localizando}>
                  <LocateFixed aria-hidden="true" className="size-4" />{localizando ? "Localizando…" : "Minha localização"}
                </Button>
              </div>
              {erroBusca && <p id="ref-busca-erro" role="alert" className="text-xs text-destructive">{erroBusca}</p>}
            </div>

            <div role="radiogroup" aria-label="O que o clique no mapa marca" className="flex flex-wrap items-center gap-2 text-sm">
              <span className="text-muted-foreground">O clique marca:</span>
              {[{ chave: "origem", rotulo: "Origem (0, 0)", ativo: ferramenta.tipo === "origem", escolher: () => setFerramenta({ tipo: "origem" }) },
                ...receptores.map(r => ({ chave: r.id, rotulo: r.codigo, ativo: ferramenta.tipo === "receptor" && ferramenta.id === r.id, escolher: () => setFerramenta({ tipo: "receptor", id: r.id }) }))]
                .map(item => (
                  <button key={item.chave} type="button" role="radio" aria-checked={item.ativo} onClick={item.escolher}
                    className={cn("flex items-center gap-1.5 rounded-full border-2 px-3 py-0.5 focus-visible:outline-2 focus-visible:outline-ring", item.ativo ? "border-primary bg-primary/8 font-medium" : "border-foreground/20 hover:bg-muted")}>
                    {item.chave === "origem" && <MapPin aria-hidden="true" className="size-3.5" />}{item.rotulo}
                  </button>
                ))}
            </div>

            <div className="relative isolate aspect-[4/3] w-full overflow-hidden rounded-xl bg-[#3F4A33] ring-1 ring-foreground/30 sm:aspect-[16/9]">
              {falhaMapa ? <p role="alert" className="absolute inset-0 flex items-center justify-center p-6 text-center text-sm text-white">{falhaMapa}</p> : (
                <Suspense fallback={<p role="status" className="absolute inset-0 flex items-center justify-center text-sm text-white">Carregando mapa…</p>}>
                  <PosicionamentoCanvas
                    origem={origemMapa}
                    azimute={azimute !== null && !erros.azimute ? azimute : 0}
                    receptores={receptores}
                    movidos={movidos}
                    zonas={zonas}
                    ferramenta={ferramenta}
                    destino={destino}
                    aoMarcarOrigem={marcarOrigem}
                    aoMoverReceptor={moverReceptor}
                    aoFalhar={setFalhaMapa}
                  />
                </Suspense>
              )}
              <p className="pointer-events-none absolute top-3 left-3 z-10 max-w-[85%] rounded-md bg-card/95 px-2.5 py-1.5 text-xs shadow">
                {ferramenta.tipo === "origem"
                  ? "Clique no ponto escolhido como origem (0, 0). Depois escolha um receptor acima e clique onde ele está instalado, ou arraste os marcadores."
                  : `Clique onde o receptor ${receptores.find(r => r.id === ferramenta.id)?.codigo ?? ""} está instalado.`}
              </p>
            </div>

            {movidos.size > 0 && (
              <div className="rounded-lg bg-muted px-3 py-2 text-xs">
                <p className="font-medium">Receptores reposicionados (salvos junto com a localização):</p>
                <ul className="mt-1 grid gap-0.5">
                  {[...movidos].map(([id, [lng, lat]]) => {
                    const r = receptores.find(item => item.id === id);
                    const local = projecaoAtual?.paraLocal(lng, lat);
                    return (
                      <li key={id} className="tabular-nums">
                        {r?.codigo ?? id}: {local ? `x ${local.x.toLocaleString("pt-BR", { maximumFractionDigits: 1 })} m · y ${local.y.toLocaleString("pt-BR", { maximumFractionDigits: 1 })} m` : "marque a origem primeiro"}
                      </li>
                    );
                  })}
                </ul>
                <button type="button" className="mt-1 underline underline-offset-2" onClick={() => setMovidos(new Map())}>Desfazer reposicionamentos</button>
              </div>
            )}

            <div className="grid gap-4 sm:grid-cols-3">
              {campo("latitude", "Latitude da origem", "Preenchida pelo clique no mapa, ou digite (ex.: -18,5789).")}
              {campo("longitude", "Longitude da origem", "Ex.: -46,5181.")}
              {campo("azimute", "Azimute do eixo y (°)", "Direção do eixo +y a partir do norte, sentido horário. 0 = norte.")}
            </div>
            <p className="text-xs text-muted-foreground">Imagem de satélite: Esri World Imagery, para uso não comercial. A posição exata dos receptores deve ser conferida em campo.</p>
          </div>
        ) : (
          <div className="grid gap-4">
            {campo("url", "Endereço da imagem", "https, com CORS liberado. Não é armazenada pelo Argos.", "url")}
            <div className="grid gap-4 sm:grid-cols-4">
              {campo("xMin", "x mínimo (m)", "Borda esquerda.")}
              {campo("yMin", "y mínimo (m)", "Borda inferior.")}
              {campo("xMax", "x máximo (m)", "Borda direita.")}
              {campo("yMax", "y máximo (m)", "Borda superior.")}
            </div>
            <p className="text-xs text-muted-foreground">No modo planta não há latitude/longitude: o mapa mostra apenas metros sobre a imagem.</p>
          </div>
        )}
        <div className="flex justify-end">
          <Button type="submit" className="h-10 rounded-full px-5 text-white" disabled={salvar.isPending}>{salvar.isPending ? "Salvando…" : modo === "geografico" ? "Salvar localização" : "Salvar referência"}</Button>
        </div>
      </form>
    </Card>
  );
}

function LinhaReceptor({ receptor, coordenada, fonte, origem }: {
  receptor: { id: string; codigo: string; nome: string | null };
  coordenada: CoordenadaReceptorIoT | undefined;
  fonte: FonteEspacial;
  origem: string;
}) {
  const [campos, setCampos] = useState({
    x: texto(coordenada?.x_m), y: texto(coordenada?.y_m),
    rssi: texto(coordenada?.rssi_1m_dbm ?? -50), n: texto(coordenada?.expoente_perda ?? 2.6),
  });
  const [tentou, setTentou] = useState(false);
  const salvar = useMutacaoEspacial(origem, (d: Parameters<FonteEspacial["salvarCoordenada"]>[0]) => fonte.salvarCoordenada(d), `Coordenadas de ${receptor.codigo} salvas`);
  const erros = {
    x: entre(numero(campos.x), -1e6, 1e6, "x"),
    y: entre(numero(campos.y), -1e6, 1e6, "y"),
    rssi: entre(numero(campos.rssi), -100, -10, "o RSSI a 1 m"),
    n: entre(numero(campos.n), 1, 6, "o expoente"),
  };
  const id = (c: string) => `coord-${receptor.id}-${c}`;
  const celula = (chave: keyof typeof campos, rotulo: string) => (
    <div className="grid gap-1">
      <label htmlFor={id(chave)} className="text-xs text-muted-foreground">{rotulo}</label>
      <Input
        id={id(chave)} inputMode="decimal" value={campos[chave]} className="h-9 border-foreground/25"
        aria-invalid={tentou && Boolean(erros[chave])}
        aria-describedby={tentou && erros[chave] ? `${id(chave)}-erro` : undefined}
        onChange={e => setCampos({ ...campos, [chave]: e.target.value })}
      />
      {tentou && erros[chave] && <span id={`${id(chave)}-erro`} className="text-[11px] text-destructive">{erros[chave]}</span>}
    </div>
  );
  return (
    <li className="grid items-start gap-3 border-b py-4 last:border-b-0 sm:grid-cols-[minmax(140px,1fr)_repeat(4,minmax(80px,110px))_auto]">
      <div className="min-w-0">
        <p className="font-semibold">{receptor.codigo}</p>
        <p className="truncate text-xs text-muted-foreground">{receptor.nome ?? "Sem nome"}{coordenada ? "" : " · sem coordenadas"}</p>
      </div>
      {celula("x", "x (m)")}
      {celula("y", "y (m)")}
      {celula("rssi", "RSSI a 1 m (dBm)")}
      {celula("n", "Expoente n")}
      <Button
        variant="outline" className="h-9 self-end rounded-full border-2" disabled={salvar.isPending}
        onClick={() => {
          setTentou(true);
          if (Object.values(erros).some(Boolean)) return;
          salvar.mutate({ receptor_id: receptor.id, x_m: numero(campos.x)!, y_m: numero(campos.y)!, rssi_1m_dbm: numero(campos.rssi)!, expoente_perda: numero(campos.n)! });
        }}
      >
        {salvar.isPending ? "Salvando…" : "Salvar"}
      </Button>
    </li>
  );
}

function LinhaZona({ zona, pontos, fonte, origem }: { zona: { id: string; nome: string }; pontos: [number, number][] | undefined; fonte: FonteEspacial; origem: string }) {
  const [conteudo, setConteudo] = useState(pontos ? pontos.map(([x, y]) => `${texto(x)}; ${texto(y)}`).join("\n") : "");
  const [erro, setErro] = useState<string | null>(null);
  const salvar = useMutacaoEspacial(origem, (p: [number, number][]) => fonte.salvarGeometria(zona.id, p), `Contorno de ${zona.nome} salvo`);
  const remover = useMutacaoEspacial(origem, () => fonte.removerGeometria(zona.id), `Contorno de ${zona.nome} removido`);
  const id = `geometria-${zona.id}`;
  return (
    <li className="grid gap-2 border-b py-4 last:border-b-0">
      <label htmlFor={id} className="font-semibold">{zona.nome} <span className="text-xs font-normal text-muted-foreground">{pontos ? `${pontos.length} vértices` : "sem contorno"}</span></label>
      <textarea
        id={id} rows={4} value={conteudo} placeholder={"0; 0\n90; 0\n90; 70\n0; 70"}
        aria-invalid={Boolean(erro)} aria-describedby={erro ? `${id}-erro` : `${id}-ajuda`}
        onChange={e => { setConteudo(e.target.value); setErro(null); }}
        className="w-full rounded-lg border border-foreground/25 bg-card px-3 py-2 font-mono text-sm outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50"
      />
      {erro ? <p id={`${id}-erro`} role="alert" className="text-xs text-destructive">{erro}</p>
        : <p id={`${id}-ajuda`} className="text-xs text-muted-foreground">Um vértice por linha, em metros: x; y. Não repita o primeiro no final.</p>}
      <div className="flex flex-wrap justify-end gap-2">
        {pontos && <Button variant="ghost" disabled={remover.isPending} onClick={() => remover.mutate(undefined, { onSuccess: () => setConteudo("") })}>Remover contorno</Button>}
        <Button
          variant="outline" className="rounded-full border-2" disabled={salvar.isPending}
          onClick={() => {
            const lido = lerVertices(conteudo);
            if ("erro" in lido) { setErro(lido.erro); return; }
            salvar.mutate(lido.pontos);
          }}
        >
          {salvar.isPending ? "Salvando…" : "Salvar contorno"}
        </Button>
      </div>
    </li>
  );
}

const EditorZonaCanvas = lazy(() => import("@/components/custom/EditorZonaCanvas"));

type EditorZonasProps = {
  zonas: { id: string; nome: string }[];
  geometrias: Map<string, [number, number][]>;
  receptores: { id: string; codigo: string; x: number; y: number }[];
  referencia: ReferenciaEspacial | null;
  fonte: FonteEspacial;
  origem: string;
};

/** Desenho do contorno da zona sobre o mapa (Terra Draw). A lista de vértices abaixo é a alternativa sem mouse. */
function EditorZonas({ zonas, geometrias, receptores, referencia, fonte, origem }: EditorZonasProps) {
  const [zonaId, setZonaId] = useState(zonas[0]?.id ?? "");
  const [desenhando, setDesenhando] = useState(false);
  const [pontos, setPontos] = useState<[number, number][] | null>(null);
  const [falha, setFalha] = useState<string | null>(null);
  const projecao = useMemo(() => criarProjecao(referencia), [referencia]);
  const zona = zonas.find(z => z.id === zonaId) ?? null;
  const salvo = zona ? geometrias.get(zona.id) ?? null : null;
  const outras = useMemo(
    () => zonas.filter(z => z.id !== zonaId && geometrias.has(z.id)).map(z => ({ id: z.id, nome: z.nome, pontos: geometrias.get(z.id)! })),
    [zonas, zonaId, geometrias],
  );
  const salvar = useMutacaoEspacial(origem, (p: [number, number][]) => fonte.salvarGeometria(zonaId, p), `Contorno de ${zona?.nome ?? "zona"} salvo`);
  const remover = useMutacaoEspacial(origem, () => fonte.removerGeometria(zonaId), `Contorno de ${zona?.nome ?? "zona"} removido`);

  const area = pontos && pontos.length >= 3 ? areaPoligono(pontos) : 0;
  const alterado = JSON.stringify(pontos) !== JSON.stringify(salvo);
  const problema = !pontos ? null : pontos.length < 3 ? "Use pelo menos 3 vértices." : pontos.length > 200 ? "Use até 200 vértices." : area < 1 ? "A área precisa ter pelo menos 1 m²." : null;
  if (!zona) return <p className="text-sm text-muted-foreground">Nenhuma zona cadastrada.</p>;

  return (
    <div className="grid gap-3">
      <div role="radiogroup" aria-label="Zona a desenhar" className="flex flex-wrap gap-2">
        {zonas.map(z => (
          <button
            key={z.id} type="button" role="radio" aria-checked={z.id === zonaId}
            onClick={() => { setZonaId(z.id); setDesenhando(false); setPontos(null); }}
            className={cn("rounded-full border-2 px-3.5 py-1 text-sm focus-visible:outline-2 focus-visible:outline-ring", z.id === zonaId ? "border-primary bg-primary/8 font-medium" : "border-foreground/20 hover:bg-muted")}
          >
            {z.nome}{geometrias.has(z.id) && <span className="ml-1.5 text-xs text-muted-foreground">· com contorno</span>}
          </button>
        ))}
      </div>

      <div className="relative isolate aspect-[4/3] w-full overflow-hidden rounded-xl bg-[#EFEBDD] ring-1 ring-foreground/30 sm:aspect-[16/9]">
        {falha ? <p role="alert" className="absolute inset-0 flex items-center justify-center p-6 text-center text-sm">{falha}</p> : (
          <Suspense fallback={<p role="status" className="absolute inset-0 flex items-center justify-center text-sm text-muted-foreground">Carregando mapa…</p>}>
            <EditorZonaCanvas
              key={zonaId}
              projecao={projecao}
              referencia={referencia}
              pontosIniciais={salvo}
              outrasZonas={outras}
              receptores={receptores}
              desenhando={desenhando}
              aoAlterar={setPontos}
              aoTerminarDesenho={() => setDesenhando(false)}
              aoFalhar={setFalha}
            />
          </Suspense>
        )}
        {desenhando && (
          <p role="status" className="pointer-events-none absolute top-3 left-3 z-10 max-w-[80%] rounded-md bg-card/95 px-2.5 py-1.5 text-xs shadow">
            Clique para marcar os vértices de {zona.nome}. Feche clicando no primeiro ponto ou com Enter; Esc cancela.
          </p>
        )}
      </div>

      <div className="flex flex-wrap items-center justify-between gap-3">
        <p className="text-xs text-muted-foreground" aria-live="polite">
          {pontos ? `${pontos.length} vértices · ${area.toLocaleString("pt-BR", { maximumFractionDigits: 0 })} m²` : salvo ? "Contorno salvo carregado." : "Sem contorno."}
          {problema && <span className="ml-2 text-destructive">{problema}</span>}
          {!desenhando && pontos && " Arraste os vértices para ajustar; clique no meio de um lado para criar um vértice; botão direito apaga um vértice."}
        </p>
        <div className="flex flex-wrap gap-2">
          {salvo && !desenhando && (
            <Button variant="ghost" disabled={remover.isPending} onClick={() => remover.mutate(undefined, { onSuccess: () => setPontos(null) })}>Remover contorno</Button>
          )}
          <Button variant="outline" className="rounded-full border-2" onClick={() => setDesenhando(d => !d)}>
            {desenhando ? "Cancelar desenho" : salvo || pontos ? "Desenhar de novo" : "Desenhar contorno"}
          </Button>
          <Button
            className="rounded-full px-5 text-white"
            disabled={!pontos || Boolean(problema) || !alterado || desenhando || salvar.isPending}
            onClick={() => pontos && salvar.mutate(pontos)}
          >
            {salvar.isPending ? "Salvando…" : "Salvar contorno"}
          </Button>
        </div>
      </div>
    </div>
  );
}

/** Aba Mapa da tela Cadastrar: referência espacial, calibração dos receptores e contornos das zonas. */
export function CadastroMapa({ fonte, fonteEspacial, origem, demonstracao }: { fonte: FonteCadastros; fonteEspacial: FonteEspacial; origem: string; demonstracao?: CenarioDemonstracao }) {
  const { dispositivos, zonas } = useListasCadastro(fonte, origem);
  const referencia = useQuery({ queryKey: chaveEspacial(origem, "referencia"), queryFn: ({ signal }) => fonteEspacial.referencia(signal) });
  const coordenadas = useQuery({ queryKey: chaveEspacial(origem, "coordenadas"), queryFn: ({ signal }) => fonteEspacial.coordenadas(signal) });
  const geometrias = useQuery({ queryKey: chaveEspacial(origem, "geometrias"), queryFn: ({ signal }) => fonteEspacial.geometrias(signal) });
  // Memorizados para o editor não refazer rótulos e camadas a cada renderização.
  const geometriaPor = useMemo(() => new Map((geometrias.data ?? []).map(g => [g.zona_id, g.pontos])), [geometrias.data]);
  const receptoresPosicionaveis = useMemo(() => {
    const porId = new Map((coordenadas.data ?? []).map(c => [c.receptor_id, c]));
    return (dispositivos.data ?? []).filter(d => d.tipo === "receptor" && d.status === "ativo")
      .map(r => ({ id: r.id, codigo: r.codigo, nome: r.nome, x: porId.get(r.id)?.x_m ?? null, y: porId.get(r.id)?.y_m ?? null }));
  }, [coordenadas.data, dispositivos.data]);
  const contornos = useMemo(() => (geometrias.data ?? []).map(g => g.pontos), [geometrias.data]);
  const receptoresNoMapa = useMemo(() => {
    const coordenadas_ = new Map((coordenadas.data ?? []).map(c => [c.receptor_id, c]));
    return (dispositivos.data ?? []).filter(d => d.tipo === "receptor" && d.status === "ativo").flatMap(r => {
      const c = coordenadas_.get(r.id);
      return c ? [{ id: r.id, codigo: r.codigo, x: c.x_m, y: c.y_m }] : [];
    });
  }, [coordenadas.data, dispositivos.data]);

  if (referencia.data === undefined || !coordenadas.data || !geometrias.data || !dispositivos.data || !zonas.data) {
    const pendente = [referencia, coordenadas, geometrias, dispositivos, zonas].find(c => c.isError) ?? referencia;
    return <EstadoBloco consulta={pendente} nome="a configuração do mapa" />;
  }
  const receptores = dispositivos.data.filter(d => d.tipo === "receptor" && d.status === "ativo");
  const coordenadaPor = new Map(coordenadas.data.map(c => [c.receptor_id, c]));

  return (
    <div className="grid gap-6 lg:gap-8">
      <FormReferencia
        key={referencia.data?.atualizado_em ?? "nova"}
        referencia={referencia.data}
        fonte={fonteEspacial}
        origem={origem}
        receptores={receptoresPosicionaveis}
        coordenadas={coordenadaPor}
        zonas={contornos}
      />

      <Card className="gap-3 p-5 sm:p-6">
        <div>
          <h2 className="text-xl font-medium">Receptores: posição e calibração</h2>
          <p className="mt-1 text-sm text-muted-foreground">
            Meça a posição de cada receptor a partir da origem, em metros (x para a direita, y para cima, no sentido do azimute).
            RSSI a 1 m e expoente n vêm da calibração em campo; a trilateração usa só receptores com coordenadas e exige três ou mais.
          </p>
        </div>
        {receptores.length === 0 ? <p className="text-sm text-muted-foreground">Nenhum receptor ativo. Cadastre na aba Dispositivos.</p> : (
          <ul>
            {receptores.map(r => (
              <LinhaReceptor key={`${r.id}:${coordenadaPor.get(r.id)?.atualizado_em ?? ""}`} receptor={r} coordenada={coordenadaPor.get(r.id)} fonte={fonteEspacial} origem={origem} />
            ))}
          </ul>
        )}
      </Card>

      <Card className="gap-3 p-5 sm:p-6">
        <div>
          <h2 className="text-xl font-medium">Contorno das zonas</h2>
          <p className="mt-1 text-sm text-muted-foreground">
            Opcional. Desenhe sobre o mapa: os vértices são salvos em metros a partir da origem. Sem contorno, a contagem da zona aparece junto do receptor dela.
            {!referencia.data && " Sem referência espacial o desenho fica sobre a grade local, posicionado pelos receptores."}
          </p>
        </div>
        {zonas.data.length === 0 ? <p className="text-sm text-muted-foreground">Nenhuma zona cadastrada.</p> : (
          <>
            <EditorZonas
              zonas={zonas.data}
              geometrias={geometriaPor}
              receptores={receptoresNoMapa}
              referencia={referencia.data}
              fonte={fonteEspacial}
              origem={origem}
            />
            <details className="group mt-2 rounded-lg border px-4 py-2">
              <summary className="cursor-pointer py-1 text-sm font-medium">Digitar vértices (alternativa sem mouse)</summary>
              <ul>
                {zonas.data.map(z => (
                  <LinhaZona key={`${z.id}:${geometrias.dataUpdatedAt}`} zona={z} pontos={geometriaPor.get(z.id)} fonte={fonteEspacial} origem={origem} />
                ))}
              </ul>
            </details>
          </>
        )}
        <div className="flex justify-end">
          <Link to={rotaApp("/animals", demonstracao)} className={cn(buttonVariants({ variant: "default" }), "rounded-full px-5 text-white")}>Ver no mapa</Link>
        </div>
      </Card>
    </div>
  );
}
