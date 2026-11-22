import type { RequestHandler } from 'express';
import { getAuth } from '../middlewares/auth.js';
import { requirePropriedade } from '../services/propriedade.service.js';
import { buscarResumoMonitoramento } from '../repositories/monitoramento.repository.js';

export const resumoMonitoramento: RequestHandler = async (_req, res) => {
  const auth = getAuth(res);
  const propriedade = await requirePropriedade(auth);
  res.json({ data: await buscarResumoMonitoramento(auth.db, propriedade.id) });
};
