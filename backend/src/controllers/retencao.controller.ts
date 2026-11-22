import type { RequestHandler } from 'express';
import type { PreviaRetencao } from '@argos/shared';
import { getAuth } from '../middlewares/auth.js';
import { prazoRetencao } from '../models/retencao.model.js';
import { requirePropriedade } from '../services/propriedade.service.js';

export const consultarPreviaRetencao: RequestHandler = async (req, res) => {
  const dias = prazoRetencao(req.query);
  const auth = getAuth(res);
  const propriedade = await requirePropriedade(auth);
  const { data, error } = await auth.db.rpc('previa_retencao', {
    p_propriedade: propriedade.id, p_dias: dias,
  }).returns<PreviaRetencao>();
  if (error) throw error;
  res.set('Cache-Control', 'no-store').json({ data });
};
