import { objectBody, requiredText, nullableText, nullableEnum, nullableDate } from '../lib/validation.js';
import { ApiError } from '../lib/http.js';

const columns = [
  'identificacao', 'sexo', 'categoria', 'raca', 'data_nascimento',
  'origem', 'lote', 'observacoes', 'status',
] as const;

export type AnimalPayload = {
  identificacao?: string;
  sexo?: 'macho' | 'femea' | null;
  categoria?: string | null;
  raca?: string | null;
  data_nascimento?: string | null;
  origem?: string | null;
  lote?: string | null;
  observacoes?: string | null;
  status?: 'ativo' | 'inativo';
};

export function parseAnimal(body: unknown, partial = false): AnimalPayload {
  const obj = objectBody(body, columns);
  if (!partial && obj.identificacao === undefined) throw new ApiError(400, 'identificacao é obrigatória.');
  if (partial && !Object.keys(obj).length) throw new ApiError(400, 'Informe ao menos um campo.');
  const out: AnimalPayload = {};
  if (obj.identificacao !== undefined) out.identificacao = requiredText(obj.identificacao, 'identificacao', 80);
  if (obj.sexo !== undefined) out.sexo = nullableEnum(obj.sexo, 'sexo', ['macho', 'femea']);
  for (const key of ['categoria', 'raca', 'origem', 'lote', 'observacoes'] as const) {
    if (obj[key] !== undefined) out[key] = nullableText(obj[key], key, key === 'observacoes' ? 2000 : 160);
  }
  if (obj.data_nascimento !== undefined) out.data_nascimento = nullableDate(obj.data_nascimento, 'data_nascimento');
  if (obj.status !== undefined) {
    const value = nullableEnum(obj.status, 'status', ['ativo', 'inativo']);
    if (value == null) throw new ApiError(400, 'status não pode ser nulo.');
    out.status = value;
  }
  return out;
}
