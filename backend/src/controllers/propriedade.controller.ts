import type { RequestHandler } from 'express';
import { ApiError } from '../lib/http.js';
import { parsePropriedade } from '../models/propriedade.model.js';
import { getAuth } from '../middlewares/auth.js';
import { createPropriedade, findMinhaPropriedade, updatePropriedade } from '../repositories/propriedade.repository.js';

export const minhaPropriedade: RequestHandler = async (_req, res) => {
  const { db, userId } = getAuth(res);
  const propriedade = await findMinhaPropriedade(db, userId);
  if (!propriedade) throw new ApiError(404, 'Propriedade não cadastrada.', 'NOT_FOUND');
  res.json({ data: propriedade });
};

export const cadastrarPropriedade: RequestHandler = async (req, res) => {
  const { db, userId } = getAuth(res);
  const payload = parsePropriedade(req.body);
  if (await findMinhaPropriedade(db, userId)) {
    throw new ApiError(409, 'O usuário já possui uma propriedade.', 'CONFLICT');
  }
  const propriedade = await createPropriedade(db, userId, payload);
  res.status(201).json({ data: propriedade });
};

export const atualizarPropriedade: RequestHandler = async (req, res) => {
  const { db, userId } = getAuth(res);
  const payload = parsePropriedade(req.body, true);
  const propriedade = await updatePropriedade(db, userId, payload);
  res.json({ data: propriedade });
};
