import type { DeteccaoHistorico } from "@argos/shared";
import type { FiltroHistorico, FonteMonitoramento } from "@/lib/fonteMonitoramento";

/** Máximo carregado no navegador (20 páginas de 100); a exportação do servidor cobre o restante. */
export const LIMITE_LINHAS = 2_000;
const PAGINAS_SIMULTANEAS = 5;

/**
 * Busca todas as páginas do histórico até o limite. `total` é o `count` do servidor; quando ele
 * passa de `linhas.length`, o conjunto carregado contém apenas as leituras mais recentes.
 */
export async function buscarHistoricoCompleto(fonte: FonteMonitoramento, filtro: FiltroHistorico, signal: AbortSignal) {
  const primeira = await fonte.historico(filtro, 0, signal);
  const paginas = Math.min(Math.ceil(primeira.count / 100), LIMITE_LINHAS / 100);
  const linhas: DeteccaoHistorico[] = [...primeira.data];
  for (let pagina = 1; pagina < paginas; pagina += PAGINAS_SIMULTANEAS) {
    const lote = Array.from({ length: Math.min(PAGINAS_SIMULTANEAS, paginas - pagina) }, (_, i) => fonte.historico(filtro, (pagina + i) * 100, signal));
    for (const resposta of await Promise.all(lote)) linhas.push(...resposta.data);
  }
  // Leituras novas podem deslocar as páginas durante a consulta; remove repetições.
  return { linhas: [...new Map(linhas.map(l => [l.id, l])).values()], total: primeira.count };
}

export function baixarBlob(conteudo: Blob, nome: string) {
  const endereco = URL.createObjectURL(conteudo);
  const link = document.createElement("a");
  link.href = endereco;
  link.download = nome;
  document.body.appendChild(link);
  link.click();
  link.remove();
  window.setTimeout(() => URL.revokeObjectURL(endereco), 1000);
}

/** Lacuna maior que esta, entre leituras consecutivas de um receptor, conta como perda de sinal. */
export const LACUNA_PERDA_MS = 5 * 60_000;

/**
 * Métricas de um receptor calculadas das leituras recebidas por ele. Considera só o trecho coberto
 * pelas leituras carregadas (`parcial` quando o servidor tem mais leituras do que as carregadas).
 */
export function metricasReceptor(leituras: DeteccaoHistorico[], total: number, fim: number) {
  const instantes = leituras
    .map(l => Date.parse(l.instante_referencia ?? ""))
    .filter(Number.isFinite)
    .sort((a, b) => a - b);
  if (instantes.length < 2) return { intervaloMinutos: null, perdasSinal: instantes.length ? 0 : null, parcial: total > leituras.length };
  let perdas = 0;
  for (let i = 1; i < instantes.length; i++) if (instantes[i] - instantes[i - 1] > LACUNA_PERDA_MS) perdas++;
  // Silêncio depois da última leitura até o fim do período (ou agora) também é uma perda.
  if (Math.min(fim, Date.now()) - instantes[instantes.length - 1] > LACUNA_PERDA_MS) perdas++;
  const intervaloMinutos = (instantes[instantes.length - 1] - instantes[0]) / (instantes.length - 1) / 60_000;
  return { intervaloMinutos, perdasSinal: perdas, parcial: total > leituras.length };
}

/** Lê o CSV da exportação do servidor (`;`, campos entre aspas, BOM e CRLF) como objetos pelo cabeçalho. */
export function lerCsv(texto: string): Record<string, string>[] {
  const linhas: string[][] = [];
  let campo = "", linha: string[] = [], aspas = false;
  const conteudo = texto.replace(/^\uFEFF/, "");
  for (let i = 0; i < conteudo.length; i++) {
    const c = conteudo[i];
    if (aspas) {
      if (c === '"' && conteudo[i + 1] === '"') { campo += '"'; i++; }
      else if (c === '"') aspas = false;
      else campo += c;
    } else if (c === '"') aspas = true;
    else if (c === ";") { linha.push(campo); campo = ""; }
    else if (c === "\n" || c === "\r") {
      if (c === "\r" && conteudo[i + 1] === "\n") i++;
      linha.push(campo); campo = "";
      if (linha.some(v => v !== "")) linhas.push(linha);
      linha = [];
    } else campo += c;
  }
  if (campo !== "" || linha.length) { linha.push(campo); if (linha.some(v => v !== "")) linhas.push(linha); }
  const [cabecalho, ...dados] = linhas;
  return cabecalho ? dados.map(valores => Object.fromEntries(cabecalho.map((nome, i) => [nome, valores[i] ?? ""]))) : [];
}

/** Leitura reduzida ao que a contagem de cabeças precisa. */
export type LeituraAnimal = { animalId: string; instante: string };

/**
 * Animais distintos detectados em cada mês, do primeiro mês com leitura até o mês de `fim`.
 * `inicio` deve ser o primeiro dia de um mês. Meses sem leitura no meio do intervalo contam zero.
 */
export function cabecasPorMes(leituras: LeituraAnimal[], inicio: Date, fim: Date) {
  const meses: { inicio: Date; animais: Set<string> }[] = [];
  for (let m = new Date(inicio); m < fim; m = new Date(m.getFullYear(), m.getMonth() + 1, 1)) meses.push({ inicio: m, animais: new Set() });
  for (const { animalId, instante } of leituras) {
    const t = new Date(instante);
    if (!animalId || Number.isNaN(t.getTime())) continue;
    const indice = (t.getFullYear() - inicio.getFullYear()) * 12 + t.getMonth() - inicio.getMonth();
    meses[indice]?.animais.add(animalId);
  }
  const primeiro = meses.findIndex(m => m.animais.size > 0);
  return (primeiro < 0 ? [] : meses.slice(primeiro)).map(m => ({ inicio: m.inicio, quantidade: m.animais.size }));
}

/** Resultado de `buscarHistoricoCompleto`: leituras carregadas e total no servidor. */
export type HistoricoCarregado = { linhas: DeteccaoHistorico[]; total: number };

/** Ponto da série de animais sem detecção: percentual por intervalo, no período atual e no anterior. */
export type PontoSemDeteccao = { horario: string; anterior: number | null; atual: number | null };

/**
 * Para cada intervalo (faixas de 2 h quando o período tem até um dia; dias, nos demais), o percentual
 * dos animais detectados na zona durante o período que não foram detectados nela naquele intervalo.
 * O período anterior tem a mesma duração e termina em `inicio`. Intervalos futuros ficam vazios, assim
 * como os anteriores à leitura mais antiga carregada quando o histórico foi cortado no limite.
 */
export function serieSemDeteccao(atual: HistoricoCarregado, anterior: HistoricoCarregado, inicio: number, fim: number, agora = Date.now()): PontoSemDeteccao[] {
  const duracao = fim - inicio;
  if (duracao <= 0) return [];
  const passo = duracao <= 86_400_000 ? 2 * 3_600_000 : 86_400_000;
  const quantidade = Math.ceil(duracao / passo);
  const percentuais = ({ linhas: leituras, total }: HistoricoCarregado, base: number) => {
    // Cortado no limite: só os intervalos que começam depois da leitura mais antiga carregada são completos.
    const instantes = leituras.map(l => Date.parse(l.instante_referencia ?? "")).filter(Number.isFinite);
    const cobertoDesde = total > leituras.length && instantes.length ? Math.min(...instantes) : -Infinity;
    const todos = new Set<string>();
    const porIntervalo = Array.from({ length: quantidade }, () => new Set<string>());
    for (const l of leituras) {
      const t = Date.parse(l.instante_referencia ?? "");
      if (!l.animal_id || !Number.isFinite(t) || t < base || t >= base + duracao) continue;
      todos.add(l.animal_id);
      porIntervalo[Math.floor((t - base) / passo)].add(l.animal_id);
    }
    return porIntervalo.map((detectados, i) => (todos.size && base + i * passo >= cobertoDesde ? Math.round((100 * (todos.size - detectados.size)) / todos.size) : null));
  };
  const doAtual = percentuais(atual, inicio);
  const doAnterior = percentuais(anterior, inicio - duracao);
  return doAtual.map((valor, i) => {
    const comeco = new Date(inicio + i * passo);
    const horario = passo < 86_400_000
      ? `${String(comeco.getHours()).padStart(2, "0")}:00`
      : `${String(comeco.getDate()).padStart(2, "0")}/${String(comeco.getMonth() + 1).padStart(2, "0")}`;
    return { horario, anterior: doAnterior[i], atual: comeco.getTime() > agora ? null : valor };
  });
}
