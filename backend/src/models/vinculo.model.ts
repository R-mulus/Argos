import { ApiError } from '../lib/http.js';
import { objectBody, uuidParam } from '../lib/validation.js';

export type VinculoPayload = {
  animal_id: string;
  transmissor_id: string;
};

export function parseVinculo(body: unknown): VinculoPayload {
  const obj = objectBody(body, ['animal_id', 'transmissor_id']);
  return {
    animal_id: uuidParam(obj.animal_id, 'animal_id'),
    transmissor_id: uuidParam(obj.transmissor_id, 'transmissor_id'),
  };
}

export type FiltrosVinculos = {
  animal_id?: string;
  transmissor_id?: string;
  ativo?: boolean;
};

export function parseFiltrosVinculos(query: Record<string, unknown>): FiltrosVinculos {
  const filtros: FiltrosVinculos = {};
  if (query.animal_id !== undefined) filtros.animal_id = uuidParam(query.animal_id, 'animal_id');
  if (query.transmissor_id !== undefined) {
    filtros.transmissor_id = uuidParam(query.transmissor_id, 'transmissor_id');
  }
  if (query.ativo !== undefined) {
    if (query.ativo !== 'true' && query.ativo !== 'false') {
      throw new ApiError(400, 'ativo deve ser true ou false.');
    }
    filtros.ativo = query.ativo === 'true';
  }
  return filtros;
}

// O banco usa microssegundos; o relógio da API, milissegundos.
// Garante que um vínculo recém-criado possa ser encerrado sem violar fim_em > inicio_em.
export function calcularFimEm(inicioEm: string, agora = Date.now()): string {
  const inicio = Date.parse(inicioEm);
  if (!Number.isFinite(inicio)) throw new ApiError(500, 'Início de vínculo inválido.', 'INVALID_LINK_START');
  return new Date(Math.max(agora, inicio + 1000)).toISOString();
}

export function parseEncerramentoVinculo(body: unknown): void {
  // O fechamento usa relógio do servidor, sem permitir alterar o histórico.
  // JSON vazio é aceito; se não houver corpo, Express fornece undefined.
  if (body === undefined) return;
  const obj = objectBody(body, []);
  if (Object.keys(obj).length > 0) throw new ApiError(400, 'Encerramento não recebe campos.');
}
