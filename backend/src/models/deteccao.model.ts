import { ApiError } from '../lib/http.js';
import { nullableDate, pagination, uuidParam } from '../lib/validation.js';

function instante(valor: unknown, nome: string) {
  if (valor === undefined) return undefined;
  if (typeof valor !== 'string' ||
      !/^\d{4}-\d{2}-\d{2}T(?:[01]\d|2[0-3]):[0-5]\d:[0-5]\d(?:\.\d{1,3})?(?:Z|[+-](?:[01]\d|2[0-3]):[0-5]\d)$/.test(valor)) {
    throw new ApiError(400, `${nome} deve ser um instante ISO 8601 com fuso horário.`);
  }
  nullableDate(valor.slice(0, 10), nome);
  return new Date(valor).toISOString();
}

export function filtrosDeteccoes(query: Record<string, unknown>) {
  const permitidos = ['limit', 'offset', 'animal_id', 'zona_id', 'inicio', 'fim'];
  if (Object.keys(query).some(campo => !permitidos.includes(campo))) {
    throw new ApiError(400, 'Filtro de histórico desconhecido.');
  }
  const inicio = instante(query.inicio, 'inicio');
  const fim = instante(query.fim, 'fim');
  if (inicio && fim && Date.parse(inicio) >= Date.parse(fim)) {
    throw new ApiError(400, 'O fim deve ser posterior ao início.');
  }
  return {
    ...pagination(query), inicio, fim,
    animalId: query.animal_id === undefined ? undefined : uuidParam(query.animal_id, 'animal_id'),
    zonaId: query.zona_id === undefined ? undefined : uuidParam(query.zona_id, 'zona_id'),
  };
}
