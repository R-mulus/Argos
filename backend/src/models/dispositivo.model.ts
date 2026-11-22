import { ApiError } from '../lib/http.js';
import { nullableEnum, nullableText, objectBody, requiredText } from '../lib/validation.js';

const createFields = ['codigo', 'tipo', 'identificador_hardware', 'nome', 'status', 'versao_firmware'];
const updateFields = ['codigo', 'identificador_hardware', 'nome', 'status', 'versao_firmware'];

export type DispositivoPayload = {
  codigo?: string;
  tipo?: 'transmissor' | 'receptor';
  identificador_hardware?: string | null;
  nome?: string | null;
  status?: 'ativo' | 'inativo';
  versao_firmware?: string | null;
};

export function parseDispositivo(body: unknown, partial = false): DispositivoPayload {
  const obj = objectBody(body, partial ? updateFields : createFields);
  if (partial && Object.keys(obj).length === 0) throw new ApiError(400, 'Informe ao menos um campo.');

  const result: DispositivoPayload = {};
  if (partial || obj.codigo !== undefined) {
    if (obj.codigo !== undefined) result.codigo = requiredText(obj.codigo, 'codigo', 80);
  } else {
    throw new ApiError(400, 'codigo é obrigatório.');
  }

  if (!partial) {
    const tipo = nullableEnum(obj.tipo, 'tipo', ['transmissor', 'receptor']);
    if (!tipo) throw new ApiError(400, 'tipo é obrigatório.');
    result.tipo = tipo;
  }
  if (obj.identificador_hardware !== undefined) {
    result.identificador_hardware = nullableText(obj.identificador_hardware, 'identificador_hardware', 160);
  }
  if (obj.nome !== undefined) result.nome = nullableText(obj.nome, 'nome', 160);
  if (obj.versao_firmware !== undefined) {
    result.versao_firmware = nullableText(obj.versao_firmware, 'versao_firmware', 80);
  }
  if (obj.status !== undefined) {
    const status = nullableEnum(obj.status, 'status', ['ativo', 'inativo']);
    if (!status) throw new ApiError(400, 'status não pode ser nulo.');
    result.status = status;
  }
  return result;
}

export function parseFiltrosDispositivos(query: Record<string, unknown>): {
  tipo?: 'transmissor' | 'receptor';
  status?: 'ativo' | 'inativo';
} {
  const filtros: { tipo?: 'transmissor' | 'receptor'; status?: 'ativo' | 'inativo' } = {};
  if (query.tipo !== undefined) {
    const tipo = nullableEnum(query.tipo, 'tipo', ['transmissor', 'receptor']);
    if (!tipo) throw new ApiError(400, 'tipo inválido.');
    filtros.tipo = tipo;
  }
  if (query.status !== undefined) {
    const status = nullableEnum(query.status, 'status', ['ativo', 'inativo']);
    if (!status) throw new ApiError(400, 'status inválido.');
    filtros.status = status;
  }
  return filtros;
}
