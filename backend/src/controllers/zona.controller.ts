import type { RequestHandler } from 'express';
import { ApiError } from '../lib/http.js';
import { pagination, uuidParam } from '../lib/validation.js';
import { getAuth } from '../middlewares/auth.js';
import { parseFiltroZona, parseZona } from '../models/zona.model.js';
import { requirePropriedade } from '../services/propriedade.service.js';
import { verificarReceptor } from '../services/zona.service.js';
import { createZona, findZona, listZonas, updateZona } from '../repositories/zona.repository.js';

export const listarZonas: RequestHandler = async (req, res) => {
  const auth = getAuth(res);
  const propriedade = await requirePropriedade(auth);
  const { limit, offset } = pagination(req.query);
  res.json(await listZonas(auth.db, propriedade.id, limit, offset, parseFiltroZona(req.query)));
};

export const buscarZona: RequestHandler = async (req, res) => {
  const auth = getAuth(res);
  const propriedade = await requirePropriedade(auth);
  const zona = await findZona(auth.db, propriedade.id, uuidParam(req.params.id));
  if (!zona) throw new ApiError(404, 'Zona não encontrada.', 'NOT_FOUND');
  res.json({ data: zona });
};

export const cadastrarZona: RequestHandler = async (req, res) => {
  const auth = getAuth(res);
  const propriedade = await requirePropriedade(auth);
  const payload = parseZona(req.body);
  await verificarReceptor(auth, propriedade.id, payload);
  const zona = await createZona(auth.db, propriedade.id, payload);
  res.status(201).json({ data: zona });
};

export const atualizarZona: RequestHandler = async (req, res) => {
  const auth = getAuth(res);
  const propriedade = await requirePropriedade(auth);
  const id = uuidParam(req.params.id);
  const payload = parseZona(req.body, true);
  await verificarReceptor(auth, propriedade.id, payload);
  const zona = await updateZona(auth.db, propriedade.id, id, payload);
  res.json({ data: zona });
};
