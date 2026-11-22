import type { RequestHandler } from 'express';
import { ApiError } from '../lib/http.js';
import { pagination, uuidParam } from '../lib/validation.js';
import { getAuth } from '../middlewares/auth.js';
import { parseEncerramentoVinculo, parseFiltrosVinculos, parseVinculo } from '../models/vinculo.model.js';
import { requirePropriedade } from '../services/propriedade.service.js';
import { cadastrarVinculo, finalizarVinculo } from '../services/vinculo.service.js';
import { findVinculo, listVinculos } from '../repositories/vinculo.repository.js';

export const listarVinculos: RequestHandler = async (req, res) => {
  const auth = getAuth(res);
  const propriedade = await requirePropriedade(auth);
  const { limit, offset } = pagination(req.query);
  res.json(await listVinculos(
    auth.db, propriedade.id, limit, offset, parseFiltrosVinculos(req.query),
  ));
};

export const buscarVinculo: RequestHandler = async (req, res) => {
  const auth = getAuth(res);
  const propriedade = await requirePropriedade(auth);
  const vinculo = await findVinculo(auth.db, propriedade.id, uuidParam(req.params.id));
  if (!vinculo) throw new ApiError(404, 'Vínculo não encontrado.', 'NOT_FOUND');
  res.json({ data: vinculo });
};

export const criarVinculo: RequestHandler = async (req, res) => {
  const auth = getAuth(res);
  const propriedade = await requirePropriedade(auth);
  const vinculo = await cadastrarVinculo(auth, propriedade.id, parseVinculo(req.body));
  res.status(201).json({ data: vinculo });
};

export const encerrarVinculoAtivo: RequestHandler = async (req, res) => {
  const auth = getAuth(res);
  const propriedade = await requirePropriedade(auth);
  const id = uuidParam(req.params.id);
  parseEncerramentoVinculo(req.body);
  const vinculo = await finalizarVinculo(auth, propriedade.id, id);
  res.json({ data: vinculo });
};
