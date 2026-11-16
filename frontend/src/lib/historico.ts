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
