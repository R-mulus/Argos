import { ApiError } from './http.js';

export type JsonObject = Record<string, unknown>;

export function objectBody(value: unknown, allowed: readonly string[]): JsonObject {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    throw new ApiError(400, 'O corpo deve ser um objeto JSON.');
  }
  const body = value as JsonObject;
  const unexpected = Object.keys(body).filter((key) => !allowed.includes(key));
  if (unexpected.length) throw new ApiError(400, `Campos não permitidos: ${unexpected.join(', ')}.`);
  return body;
}

export function requiredText(value: unknown, name: string, max = 160): string {
  if (typeof value !== 'string' || value.trim().length < 1 || value.trim().length > max) {
    throw new ApiError(400, `${name} deve conter de 1 a ${max} caracteres.`);
  }
  return value.trim();
}

export function nullableText(value: unknown, name: string, max = 160): string | null | undefined {
  if (value === undefined) return undefined;
  if (value === null || value === '') return null;
  return requiredText(value, name, max);
}

export function nullableEnum<T extends string>(
  value: unknown, name: string, values: readonly T[],
): T | null | undefined {
  if (value === undefined) return undefined;
  if (value === null) return null;
  if (typeof value !== 'string' || !values.includes(value as T)) {
    throw new ApiError(400, `${name}: valor inválido. Opções: ${values.join(', ')}.`);
  }
  return value as T;
}

export function nullableDate(value: unknown, name: string): string | null | undefined {
  if (value === undefined) return undefined;
  if (value === null) return null;
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(value)) {
    throw new ApiError(400, `${name} deve estar no formato YYYY-MM-DD.`);
  }
  const date = new Date(`${value}T00:00:00Z`);
  if (Number.isNaN(date.getTime()) || date.toISOString().slice(0, 10) !== value) {
    throw new ApiError(400, `${name} é uma data inválida.`);
  }
  return value;
}

export function uuidParam(value: unknown, name = 'id'): string {
  if (typeof value !== 'string' ||
      !/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value)) {
    throw new ApiError(400, `${name} deve ser um UUID válido.`);
  }
  return value;
}

export function nullableUuid(value: unknown, name: string): string | null | undefined {
  if (value === undefined) return undefined;
  if (value === null) return null;
  return uuidParam(value, name);
}

export function pagination(query: Record<string, unknown>): { limit: number; offset: number } {
  const parse = (value: unknown, fallback: number, name: string) => {
    if (value === undefined) return fallback;
    if (typeof value !== 'string' || !/^\d+$/.test(value)) throw new ApiError(400, `${name} inválido.`);
    return Number(value);
  };
  const limit = parse(query.limit, 20, 'limit');
  const offset = parse(query.offset, 0, 'offset');
  if (!Number.isSafeInteger(limit) || limit < 1 || limit > 100 ||
      !Number.isSafeInteger(offset) || offset < 0) {
    throw new ApiError(400, 'limit deve estar entre 1 e 100; offset não pode ser negativo.');
  }
  return { limit, offset };
}
