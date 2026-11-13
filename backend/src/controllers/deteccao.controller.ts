import type { RequestHandler } from 'express';
import type { DeteccaoHistorico } from '@argos/shared';
import { ApiError } from '../lib/http.js';
import { deteccoesCsv } from '../lib/csv.js';
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

export const exportarDeteccoes: RequestHandler = async (req, res) => {
  if (req.query.limit !== undefined || req.query.offset !== undefined) {
    throw new ApiError(400, 'A exportação usa todo o período. Remova limit e offset.');
  }
  const filtros = filtrosDeteccoes(req.query);
  const auth = getAuth(res);
  const propriedade = await requirePropriedade(auth);
  const { data, error } = await auth.db.rpc('exportar_deteccoes', {
    p_propriedade: propriedade.id, p_animal: filtros.animalId ?? null,
    p_zona: filtros.zonaId ?? null, p_inicio: filtros.inicio ?? null, p_fim: filtros.fim ?? null,
  }).returns<unknown>();
  if (error) throw error;
  if (!Array.isArray(data)) throw new ApiError(500, 'Resposta inválida na exportação.', 'INTERNAL_ERROR');
  res.set('Cache-Control', 'no-store');
  res.attachment('deteccoes.csv').type('text/csv').send(deteccoesCsv(data as DeteccaoHistorico[]));
};
