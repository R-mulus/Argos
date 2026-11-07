import type { RequestHandler } from 'express';
import { ApiError } from '../lib/http.js';
import { pagination, uuidParam } from '../lib/validation.js';
import { parseAnimal } from '../models/animal.model.js';
import { getAuth } from '../middlewares/auth.js';
import { requirePropriedade } from '../services/propriedade.service.js';
import { createAnimal, findAnimal, listAnimais, updateAnimal } from '../repositories/animal.repository.js';

export const listarAnimais: RequestHandler = async (req, res) => {
  const auth = getAuth(res);
  const propriedade = await requirePropriedade(auth);
  const { limit, offset } = pagination(req.query);
  res.json(await listAnimais(auth.db, propriedade.id, limit, offset));
};

export const buscarAnimal: RequestHandler = async (req, res) => {
  const auth = getAuth(res);
  const propriedade = await requirePropriedade(auth);
  const id = uuidParam(req.params.id);
  const animal = await findAnimal(auth.db, propriedade.id, id);
  if (!animal) throw new ApiError(404, 'Animal não encontrado.', 'NOT_FOUND');
  res.json({ data: animal });
};

export const cadastrarAnimal: RequestHandler = async (req, res) => {
  const auth = getAuth(res);
  const propriedade = await requirePropriedade(auth);
  const payload = parseAnimal(req.body);
  const animal = await createAnimal(auth.db, propriedade.id, payload);
  res.status(201).json({ data: animal });
};

export const atualizarAnimal: RequestHandler = async (req, res) => {
  const auth = getAuth(res);
  const propriedade = await requirePropriedade(auth);
  const id = uuidParam(req.params.id);
  const payload = parseAnimal(req.body, true);
  const animal = await updateAnimal(auth.db, propriedade.id, id, payload);
  res.json({ data: animal });
};
