import { objectBody, nullableText, requiredText, type JsonObject } from '../lib/validation.js';
import { ApiError } from '../lib/http.js';

const columns = ['nome', 'municipio', 'uf'] as const;
export type PropriedadePayload = { nome?: string; municipio?: string | null; uf?: string | null };

export function parsePropriedade(body: unknown, partial = false): PropriedadePayload {
  const obj = objectBody(body, columns);
  if (!partial && obj.nome === undefined) throw new ApiError(400, 'nome é obrigatório.');
  if (partial && !Object.keys(obj).length) throw new ApiError(400, 'Informe ao menos um campo.');
  const result: PropriedadePayload = {};
  if (obj.nome !== undefined) result.nome = requiredText(obj.nome, 'nome', 160);
  if (obj.municipio !== undefined) result.municipio = nullableText(obj.municipio, 'municipio', 160);
  if (obj.uf !== undefined) {
    if (obj.uf !== null && (typeof obj.uf !== 'string' || !/^[A-Z]{2}$/.test(obj.uf))) {
      throw new ApiError(400, 'uf deve conter exatamente duas letras maiúsculas.');
    }
    result.uf = obj.uf as string | null;
  }
  return result;
}
