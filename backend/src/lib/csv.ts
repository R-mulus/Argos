import type { DeteccaoHistorico } from '@argos/shared';

function celula(valor: string | number | null): string {
  if (valor === null) return '""';
  let texto = String(valor);
  // Campos de cadastro podem começar com fórmulas de planilha.
  if (typeof valor === 'string' && /^[\s]*[=+@-]/.test(texto)) texto = "'" + texto;
  return '"' + texto.replaceAll('"', '""') + '"';
}

export function deteccoesCsv(dados: DeteccaoHistorico[]): string {
  const colunas = ['id', 'evento_id', 'animal_id', 'animal_identificacao', 'receptor_codigo',
    'zona_nome', 'rssi_dbm', 'bateria_percentual', 'detectado_em',
    'recebido_no_gateway_em', 'recebido_em', 'instante_referencia'] as const;
  const linhas = dados.map(item => colunas.map(coluna => celula(item[coluna])).join(';'));
  return '\uFEFF' + [colunas.join(';'), ...linhas].join('\r\n') + '\r\n';
}
