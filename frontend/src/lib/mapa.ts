import type { ComunicacaoReceptor, CoordenadaReceptorIoT, GeometriaZona, LocalizacaoIoT, LocalizacaoRecenteIoT, ResumoMonitoramento } from "@argos/shared";
import type { ZonaCadastro } from "@/lib/fonteMonitoramento";
import { atualidade, avaliarTrajetoria, trechosTrilha, type EstimativaAvaliada, type TrechoTrilha } from "@/lib/localizacao";
import { centroDoPoligono } from "@/lib/referenciaEspacial";

export type ReceptorMapa = {
  id: string;
  codigo: string;
  nome: string | null;
  x: number;
  y: number;
  /** `null` quando o receptor não aparece na consulta de comunicação. */
  estado: ComunicacaoReceptor["estado_comunicacao"] | null;
  inativo: boolean;
  ultimaComunicacaoEm: string | null;
  zonaNome: string | null;
  rssi1mDbm: number;
  expoentePerda: number;
};

export type ZonaMapa = {
  id: string;
  nome: string;
  pontos: [number, number][] | null;
  /** Onde a contagem é desenhada: borda superior do contorno ou, sem contorno, o receptor da zona. */
  ancora: [number, number] | null;
  ancoraNoReceptor: boolean;
  /** Animais com detecção recente na zona (resumo reconciliado). */
  quantidade: number;
  /** Desses, quantos não têm posição individual exibida. */
  semPosicao: number;
};

export type AnimalMapa = {
  id: string;
  identificacao: string;
  x: number;
  y: number;
  eventoId: string;
  observadoEm: string;
  recebidoEm: string | null;
  calculadoEm: string;
  receptoresUtilizados: number;
  erroResidualM: number;
  atualidade: "recente" | "desatualizada";
  atrasada: boolean;
  /** Há uma estimativa mais nova fora do deslocamento plausível, ainda sem confirmação. */
  aguardandoConfirmacao: boolean;
  /** Estimativas recentes não usadas (salto isolado, inválida, sem horário ou no futuro). */
  naoUsadas: number;
  zonaId: string | null;
  zonaNome: string | null;
};

export type DadosMapa = {
  receptores: ReceptorMapa[];
  /** Receptores ativos sem coordenadas cadastradas: não aparecem no mapa. */
  receptoresSemCoordenada: { id: string; codigo: string; nome: string | null }[];
  zonas: ZonaMapa[];
  animais: AnimalMapa[];
  /** Animais com detecção recente sem posição individual (contados por zona). */
  semPosicao: number;
};

type Entradas = {
  resumo: ResumoMonitoramento | undefined;
  comunicacao: ComunicacaoReceptor[] | undefined;
  zonasCadastro: ZonaCadastro[] | undefined;
  coordenadas: CoordenadaReceptorIoT[] | undefined;
  geometrias: GeometriaZona[] | undefined;
  recentes: LocalizacaoRecenteIoT[] | undefined;
  agora: number;
};

/**
 * Junta as consultas no que o mapa desenha. Um animal tem marcador próprio quando a última
 * estimativa aceita é recente, ou quando não há detecção mais nova por zona (então o marcador fica
 * como desatualizado). Os demais animais detectados aparecem só na contagem da zona, nunca num
 * ponto inventado.
 */
export function montarDadosMapa({ resumo, comunicacao, zonasCadastro, coordenadas, geometrias, recentes, agora }: Entradas): DadosMapa {
  const comunicacaoPorId = new Map((comunicacao ?? []).map(r => [r.id, r]));
  const zonaPorReceptor = new Map((zonasCadastro ?? []).filter(z => z.receptor_id).map(z => [z.receptor_id!, z]));
  const coordenadaPorReceptor = new Map((coordenadas ?? []).map(c => [c.receptor_id, c]));

  const receptores: ReceptorMapa[] = (coordenadas ?? []).flatMap(c => {
    if (!Number.isFinite(c.x_m) || !Number.isFinite(c.y_m)) return [];
    const r = comunicacaoPorId.get(c.receptor_id);
    return [{
      id: c.receptor_id, codigo: r?.codigo ?? "Receptor", nome: r?.nome ?? null, x: c.x_m, y: c.y_m,
      estado: r?.estado_comunicacao ?? null, inativo: r?.status === "inativo", ultimaComunicacaoEm: r?.ultima_comunicacao_em ?? null,
      zonaNome: zonaPorReceptor.get(c.receptor_id)?.nome ?? null, rssi1mDbm: c.rssi_1m_dbm, expoentePerda: c.expoente_perda,
    }];
  });
  const receptoresSemCoordenada = (comunicacao ?? [])
    .filter(r => r.status === "ativo" && !coordenadaPorReceptor.has(r.id))
    .map(r => ({ id: r.id, codigo: r.codigo, nome: r.nome }));

  const posicaoResumo = new Map((resumo?.animais ?? []).map(a => [a.animal_id, a]));
  const porAnimal = new Map<string, LocalizacaoRecenteIoT[]>();
  for (const e of recentes ?? []) {
    if (!e.animal_id) continue;
    porAnimal.set(e.animal_id, [...(porAnimal.get(e.animal_id) ?? []), e]);
  }

  const animais: AnimalMapa[] = [];
  for (const [animalId, lista] of porAnimal) {
    const cadastro = posicaoResumo.get(animalId);
    if (!cadastro) continue; // Animal inativo ou de fora do resumo da propriedade.
    const { avaliadas, atual } = avaliarTrajetoria(lista, agora);
    if (!atual || !atual.estimativa.observado_em) continue;
    const situacao = atualidade(atual.estimativa.observado_em, agora);
    if (situacao === "desatualizada" && cadastro.estado === "recente") continue; // A zona é mais nova.
    const e = atual.estimativa;
    animais.push({
      id: animalId, identificacao: cadastro.identificacao, x: e.x_m, y: e.y_m, eventoId: e.evento_id,
      observadoEm: e.observado_em!, recebidoEm: e.recebido_em, calculadoEm: e.calculado_em,
      receptoresUtilizados: e.receptores_utilizados, erroResidualM: e.erro_residual_m, atualidade: situacao,
      atrasada: atual.atrasada,
      aguardandoConfirmacao: avaliadas.some(a => a.situacao === "aguardando_confirmacao"),
      naoUsadas: avaliadas.filter(a => a.situacao !== "aceita").length,
      zonaId: cadastro.zona_id, zonaNome: cadastro.zona_nome,
    });
  }
  animais.sort((a, b) => a.identificacao.localeCompare(b.identificacao, "pt-BR", { numeric: true }));

  const comMarcador = new Set(animais.map(a => a.id));
  const geometriaPorZona = new Map((geometrias ?? []).map(g => [g.zona_id, g.pontos]));
  const cadastroPorZona = new Map((zonasCadastro ?? []).map(z => [z.id, z]));
  const zonas: ZonaMapa[] = (resumo?.zonas ?? []).map(z => {
    const pontos = geometriaPorZona.get(z.id) ?? null;
    const receptor = cadastroPorZona.get(z.id)?.receptor_id;
    const coordenada = receptor ? coordenadaPorReceptor.get(receptor) : undefined;
    // A contagem fica na borda superior do contorno, longe do miolo onde estão os marcadores.
    const ancora: [number, number] | null = pontos ? [centroDoPoligono(pontos)[0], Math.max(...pontos.map(p => p[1]))] : coordenada ? [coordenada.x_m, coordenada.y_m] : null;
    const detectados = (resumo?.animais ?? []).filter(a => a.zona_id === z.id && a.estado === "recente");
    return {
      id: z.id, nome: z.nome, pontos, ancora, ancoraNoReceptor: !pontos && Boolean(coordenada),
      quantidade: z.quantidade, semPosicao: detectados.filter(a => !comMarcador.has(a.animal_id)).length,
    };
  });
  const semPosicao = (resumo?.animais ?? []).filter(a => a.estado === "recente" && !comMarcador.has(a.animal_id)).length;

  return { receptores, receptoresSemCoordenada, zonas, animais, semPosicao };
}

export type TrilhaMapa = {
  trechos: TrechoTrilha[];
  aceitas: LocalizacaoIoT[];
  /** Estimativas com horário que não entraram na trilha (exibidas como pontos vazados). */
  naoUsadas: EstimativaAvaliada[];
};

export function montarTrilha(estimativas: readonly LocalizacaoIoT[] | undefined, agora: number): TrilhaMapa | null {
  if (!estimativas?.length) return null;
  const { avaliadas } = avaliarTrajetoria(estimativas, agora);
  const aceitas = avaliadas.filter(a => a.situacao === "aceita").map(a => a.estimativa);
  return {
    trechos: trechosTrilha(aceitas),
    aceitas,
    naoUsadas: avaliadas.filter(a => a.situacao === "salto_descartado" || a.situacao === "aguardando_confirmacao"),
  };
}

/**
 * Último zoom com imagem pedida à Esri; acima dele o MapLibre amplia o último nível. Em área rural a
 * Esri costuma ter foto só até o 17: no 18 e no 19 devolve um quadro "Map data not yet available"
 * (HTTP 200), e o mapa mostraria esse aviso. Ajustável por VITE_MAPA_SATELITE_ZOOM_MAX (1 a 19).
 */
export function zoomMaximoSatelite(valor: string | undefined): number {
  const numero = Number(valor);
  return Number.isInteger(numero) && numero >= 1 && numero <= 19 ? numero : 17;
}
