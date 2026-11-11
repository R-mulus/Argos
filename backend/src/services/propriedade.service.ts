import { ApiError } from '../lib/http.js';
import type { AuthContext } from '../middlewares/auth.js';
import { findMinhaPropriedade } from '../repositories/propriedade.repository.js';

export async function requirePropriedade({ db, userId }: AuthContext) {
  const propriedade = await findMinhaPropriedade(db, userId);
  if (!propriedade) {
    throw new ApiError(409, 'Cadastre a propriedade antes de gerenciar seus recursos.', 'PROPERTY_REQUIRED');
  }
  return propriedade;
}
