import { ApiError } from '../lib/http.js';

export function prazoRetencao(query: Record<string, unknown>): number {
  if (Object.keys(query).some(campo => campo !== 'dias') ||
      typeof query.dias !== 'string' || !/^\d+$/.test(query.dias)) {
    throw new ApiError(400, 'Informe apenas dias, como inteiro entre 1 e 3650.');
  }
  const dias = Number(query.dias);
  if (!Number.isSafeInteger(dias) || dias < 1 || dias > 3650) {
    throw new ApiError(400, 'O prazo deve estar entre 1 e 3650 dias.');
  }
  return dias;
}
