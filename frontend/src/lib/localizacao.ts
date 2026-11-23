import type { LocalizacaoIoT } from "@argos/shared";

/**
 * Regras de exibição das estimativas RSSI calculadas pelo worker (trilateração com 3+ receptores).
 * O frontend não calcula posição: só decide quais estimativas movem o marcador, sem esconder as
 * demais, que continuam listadas com o motivo.
 */
export const LIMITES_LOCALIZACAO = {
  /** Deslocamento sustentado acima disso é implausível para bovinos a pasto (m/s). */
  velocidadeMaxMs: 4,
  /** Folga para o ruído do RSSI entre estimativas consecutivas (m). */
  folgaRuidoM: 20,
  /** Estimativa mais velha que isso é exibida como desatualizada (mesma recência do resumo). */
  recenciaMs: 5 * 60_000,
  /** Tolerância para relógio adiantado do receptor. */
  toleranciaFuturoMs: 2 * 60_000,
  /** Intervalo sem estimativas que a trilha mostra como trecho sem cobertura. */
  lacunaMs: 10 * 60_000,
  /** Processamento muito depois da observação: estimativa atrasada (chegou tarde). */
  atrasoMs: 2 * 60_000,
} as const;

export type SituacaoEstimativa =
  | "aceita"
  /** Salto além do plausível ainda sem uma estimativa seguinte que o confirme. */
  | "aguardando_confirmacao"
  /** Salto isolado: a estimativa seguinte voltou para perto da posição anterior. */
  | "salto_descartado"
  | "sem_horario"
  | "invalida"
  | "horario_futuro";

export type EstimativaAvaliada<T extends LocalizacaoIoT = LocalizacaoIoT> = {
  estimativa: T;
  situacao: SituacaoEstimativa;
  /** Processada bem depois de observada (conectividade intermitente). */
  atrasada: boolean;
};

export type Trajetoria<T extends LocalizacaoIoT = LocalizacaoIoT> = {
  /** Em ordem de observação; inválidas e sem horário ao final, na ordem recebida. */
  avaliadas: EstimativaAvaliada<T>[];
  /** Última estimativa aceita: posição exibida no marcador. */
  atual: EstimativaAvaliada<T> | null;
  /** Repetições do mesmo evento descartadas (o worker reprocessa com o mesmo `evento_id`). */
  duplicadas: number;
};

const instante = (valor: string | null) => (valor === null ? NaN : Date.parse(valor));

function valida(e: LocalizacaoIoT) {
  return Number.isFinite(e.x_m) && Number.isFinite(e.y_m) && Math.abs(e.x_m) <= 1e6 && Math.abs(e.y_m) <= 1e6
    && Number.isFinite(e.erro_residual_m) && Number.isInteger(e.receptores_utilizados) && e.receptores_utilizados >= 3;
}

function compativeis(a: LocalizacaoIoT, b: LocalizacaoIoT) {
  const segundos = Math.abs(instante(b.observado_em) - instante(a.observado_em)) / 1000;
  const distancia = Math.hypot(b.x_m - a.x_m, b.y_m - a.y_m);
  return distancia <= LIMITES_LOCALIZACAO.velocidadeMaxMs * segundos + LIMITES_LOCALIZACAO.folgaRuidoM;
}

/**
 * Ordena por horário de observação (não de processamento), remove eventos repetidos e decide quais
 * estimativas movem o marcador. Um salto além da velocidade plausível só é aceito quando a
 * estimativa seguinte o confirma; se ela volta para perto da posição anterior, o salto é descartado.
 * Uma estimativa atrasada entra na ordem certa e não puxa o marcador para trás.
 */
export function avaliarTrajetoria<T extends LocalizacaoIoT>(estimativas: readonly T[], agora: number): Trajetoria<T> {
  const porEvento = new Map<string, T>();
  for (const e of estimativas) {
    const anterior = porEvento.get(e.evento_id);
    if (!anterior || Date.parse(e.calculado_em) > Date.parse(anterior.calculado_em)) porEvento.set(e.evento_id, e);
  }
  const duplicadas = estimativas.length - porEvento.size;

  const fora: EstimativaAvaliada<T>[] = [];
  const ordenaveis: T[] = [];
  for (const e of porEvento.values()) {
    const t = instante(e.observado_em);
    const atrasada = Number.isFinite(t) && Date.parse(e.calculado_em) - t > LIMITES_LOCALIZACAO.atrasoMs;
    if (!valida(e)) fora.push({ estimativa: e, situacao: "invalida", atrasada });
    else if (!Number.isFinite(t)) fora.push({ estimativa: e, situacao: "sem_horario", atrasada: false });
    else if (t > agora + LIMITES_LOCALIZACAO.toleranciaFuturoMs) fora.push({ estimativa: e, situacao: "horario_futuro", atrasada });
    else ordenaveis.push(e);
  }
  ordenaveis.sort((a, b) => instante(a.observado_em) - instante(b.observado_em) || a.evento_id.localeCompare(b.evento_id));

  const avaliadas: EstimativaAvaliada<T>[] = [];
  let ultima: T | null = null;
  ordenaveis.forEach((e, i) => {
    const atrasada = Date.parse(e.calculado_em) - instante(e.observado_em) > LIMITES_LOCALIZACAO.atrasoMs;
    let situacao: SituacaoEstimativa;
    if (!ultima || compativeis(ultima, e)) situacao = "aceita";
    else {
      const seguinte = ordenaveis[i + 1];
      if (!seguinte) situacao = "aguardando_confirmacao";
      else situacao = compativeis(e, seguinte) && !compativeis(ultima, seguinte) ? "aceita" : "salto_descartado";
    }
    if (situacao === "aceita") ultima = e;
    avaliadas.push({ estimativa: e, situacao, atrasada });
  });

  const atual = [...avaliadas].reverse().find(a => a.situacao === "aceita") ?? null;
  return { avaliadas: [...avaliadas, ...fora], atual, duplicadas };
}

/** `recente` quando a última estimativa aceita foi observada dentro da janela de recência. */
export function atualidade(observadoEm: string, agora: number): "recente" | "desatualizada" {
  return agora - Date.parse(observadoEm) <= LIMITES_LOCALIZACAO.recenciaMs ? "recente" : "desatualizada";
}

export type TrechoTrilha = { pontos: [number, number][]; lacuna: boolean };

/**
 * Trechos da trilha a partir das estimativas aceitas em ordem de observação. Intervalos maiores que
 * `lacunaMs` viram trechos de lacuna (desenhados tracejados), sem pontos inventados no meio.
 */
export function trechosTrilha(aceitas: readonly LocalizacaoIoT[]): TrechoTrilha[] {
  const trechos: TrechoTrilha[] = [];
  let atual: [number, number][] = [];
  aceitas.forEach((e, i) => {
    const ponto: [number, number] = [e.x_m, e.y_m];
    const anterior = aceitas[i - 1];
    if (anterior && instante(e.observado_em) - instante(anterior.observado_em) > LIMITES_LOCALIZACAO.lacunaMs) {
      if (atual.length > 1) trechos.push({ pontos: atual, lacuna: false });
      trechos.push({ pontos: [[anterior.x_m, anterior.y_m], ponto], lacuna: true });
      atual = [ponto];
    } else atual.push(ponto);
  });
  if (atual.length > 1) trechos.push({ pontos: atual, lacuna: false });
  return trechos;
}

export const ROTULO_SITUACAO: Record<SituacaoEstimativa, string> = {
  aceita: "Usada na posição",
  aguardando_confirmacao: "Aguardando confirmação",
  salto_descartado: "Salto isolado (não usada)",
  sem_horario: "Sem horário de observação",
  invalida: "Valores inválidos",
  horario_futuro: "Horário no futuro",
};
