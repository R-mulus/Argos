import type { RequestHandler } from 'express';
import { getAuth } from '../middlewares/auth.js';
import { filtrosDeteccoes } from '../models/deteccao.model.js';
import { listDeteccoes } from '../repositories/deteccao.repository.js';
import { requirePropriedade } from '../services/propriedade.service.js';

export const listarDeteccoes: RequestHandler = async (req, res) => {
  const filtros = filtrosDeteccoes(req.query);
  const auth = getAuth(res);
  const propriedade = await requirePropriedade(auth);
  res.json(await listDeteccoes(auth.db, propriedade.id, filtros));
};
