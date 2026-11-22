import type { AuthContext } from '../middlewares/auth.js';
import { ApiError } from '../lib/http.js';
import type { ZonaPayload } from '../models/zona.model.js';
import { findDispositivo } from '../repositories/dispositivo.repository.js';

export async function verificarReceptor(
  auth: AuthContext, propriedadeId: string, payload: ZonaPayload,
): Promise<void> {
  if (!payload.receptor_id) return;
  const receptor = await findDispositivo(auth.db, propriedadeId, payload.receptor_id);
  if (!receptor || receptor.tipo !== 'receptor') {
    throw new ApiError(422, 'receptor_id deve identificar um receptor da própria propriedade.', 'INVALID_DATA');
  }
  // O banco valida a unicidade do receptor, a integridade entre propriedades
  // e a exigencia de receptor em zonas ativas.
}
