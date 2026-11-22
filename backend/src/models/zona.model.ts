import { ApiError } from '../lib/http.js';
import { nullableText, nullableUuid, objectBody, requiredText } from '../lib/validation.js';

export type ZonaPayload = {
  nome?: string;
  descricao?: string | null;
  receptor_id?: string | null;
  ativa?: boolean;
};

export function parseZona(body: unknown, partial = false): ZonaPayload {
  const obj = objectBody(body, ['nome', 'descricao', 'receptor_id', 'ativa']);
  if (!partial && obj.nome === undefined) throw new ApiError(400, 'nome é obrigatório.');
  if (partial && Object.keys(obj).length === 0) throw new ApiError(400, 'Informe ao menos um campo.');

  const result: ZonaPayload = {};
  if (obj.nome !== undefined) result.nome = requiredText(obj.nome, 'nome', 120);
  if (obj.descricao !== undefined) result.descricao = nullableText(obj.descricao, 'descricao', 2000);
  if (obj.receptor_id !== undefined) result.receptor_id = nullableUuid(obj.receptor_id, 'receptor_id');
  if (obj.ativa !== undefined) {
    if (typeof obj.ativa !== 'boolean') throw new ApiError(400, 'ativa deve ser true ou false.');
    result.ativa = obj.ativa;
  }
  if (result.ativa === true && result.receptor_id === null) {
    throw new ApiError(400, 'Uma zona ativa precisa de receptor_id.');
  }
  if (!partial && result.ativa === true && !result.receptor_id) {
    throw new ApiError(400, 'Uma zona ativa precisa de receptor_id.');
  }
  return result;
}

export function parseFiltroZona(query: Record<string, unknown>): boolean | undefined {
  if (query.ativa === undefined) return undefined;
  if (query.ativa === 'true') return true;
  if (query.ativa === 'false') return false;
  throw new ApiError(400, 'ativa deve ser true ou false.');
}
