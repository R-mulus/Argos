import type { RequestHandler } from 'express';
import { ApiError } from '../lib/http.js';
import { pagination, uuidParam } from '../lib/validation.js';
import { getAuth } from '../middlewares/auth.js';
import { parseDispositivo, parseFiltrosDispositivos } from '../models/dispositivo.model.js';
import { requirePropriedade } from '../services/propriedade.service.js';
import { createDispositivo, findDispositivo, listDispositivos, updateDispositivo } from '../repositories/dispositivo.repository.js';

export const listarDispositivos: RequestHandler = async (req, res) => {
  const auth = getAuth(res);
  const propriedade = await requirePropriedade(auth);
  const { limit, offset } = pagination(req.query);
  res.json(await listDispositivos(
    auth.db, propriedade.id, limit, offset, parseFiltrosDispositivos(req.query),
  ));
};

export const buscarDispositivo: RequestHandler = async (req, res) => {
  const auth = getAuth(res);
  const propriedade = await requirePropriedade(auth);
  const id = uuidParam(req.params.id);
  const dispositivo = await findDispositivo(auth.db, propriedade.id, id);
  if (!dispositivo) throw new ApiError(404, 'Dispositivo não encontrado.', 'NOT_FOUND');
  res.json({ data: dispositivo });
};

export const cadastrarDispositivo: RequestHandler = async (req, res) => {
  const auth = getAuth(res);
  const propriedade = await requirePropriedade(auth);
  const payload = parseDispositivo(req.body);
  const dispositivo = await createDispositivo(auth.db, propriedade.id, payload);
  res.status(201).json({ data: dispositivo });
};

export const atualizarDispositivo: RequestHandler = async (req, res) => {
  const auth = getAuth(res);
  const propriedade = await requirePropriedade(auth);
  const id = uuidParam(req.params.id);
  const payload = parseDispositivo(req.body, true);
  const dispositivo = await updateDispositivo(auth.db, propriedade.id, id, payload);
  res.json({ data: dispositivo });
};
