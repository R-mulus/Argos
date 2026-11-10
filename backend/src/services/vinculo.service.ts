import type { AuthContext } from '../middlewares/auth.js';
import { ApiError } from '../lib/http.js';
import { calcularFimEm, type VinculoPayload } from '../models/vinculo.model.js';
import { findAnimal } from '../repositories/animal.repository.js';
import { findDispositivo } from '../repositories/dispositivo.repository.js';
import { createVinculo, encerrarVinculo, findVinculo } from '../repositories/vinculo.repository.js';

export async function cadastrarVinculo(
  auth: AuthContext, propriedadeId: string, payload: VinculoPayload,
) {
  const [animal, transmissor] = await Promise.all([
    findAnimal(auth.db, propriedadeId, payload.animal_id),
    findDispositivo(auth.db, propriedadeId, payload.transmissor_id),
  ]);
  if (!animal) throw new ApiError(404, 'Animal não encontrado na propriedade.', 'NOT_FOUND');
  if (!transmissor) throw new ApiError(404, 'Dispositivo não encontrado na propriedade.', 'NOT_FOUND');
  if (transmissor.tipo !== 'transmissor') {
    throw new ApiError(422, 'O dispositivo informado não é um transmissor.', 'INVALID_DATA');
  }
  if (animal.status !== 'ativo' || transmissor.status !== 'ativo') {
    throw new ApiError(409, 'Animal e transmissor devem estar ativos.', 'CONFLICT');
  }

  // Restricoes EXCLUDE no PostgreSQL impedem duplicidade e sobreposicao
  // mesmo que duas requisicoes concorrentes cheguem simultaneamente.
  return createVinculo(auth.db, propriedadeId, payload);
}

export async function finalizarVinculo(auth: AuthContext, propriedadeId: string, id: string) {
  const vinculo = await findVinculo(auth.db, propriedadeId, id);
  if (!vinculo) throw new ApiError(404, 'Vínculo não encontrado.', 'NOT_FOUND');
  if (vinculo.fim_em !== null) throw new ApiError(409, 'Vínculo já encerrado.', 'CONFLICT');

  return encerrarVinculo(auth.db, propriedadeId, id, calcularFimEm(vinculo.inicio_em));
}
