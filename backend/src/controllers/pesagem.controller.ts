import type { Request, Response, RequestHandler } from 'express';
import { ApiError } from '../lib/http.js';
import { nullableDate, objectBody, pagination, uuidParam } from '../lib/validation.js';
import { getAuth } from '../middlewares/auth.js';
import { findAnimal } from '../repositories/animal.repository.js';
import { requirePropriedade } from '../services/propriedade.service.js';
import type { HistoricoPesagens } from '@argos/shared';

async function contextoAnimal(req: Request, res: Response) {
  const animalId = uuidParam(req.params.id);
  const auth = getAuth(res);
  const propriedade = await requirePropriedade(auth);
  if (!await findAnimal(auth.db, propriedade.id, animalId)) {
    throw new ApiError(404, 'Animal não encontrado.', 'NOT_FOUND');
  }
  return { db: auth.db, propriedadeId: propriedade.id, animalId };
}

export const registrarPesagem: RequestHandler = async (req, res) => {
  const corpo = objectBody(req.body, ['data_pesagem', 'peso_kg']);
  const dia = nullableDate(corpo.data_pesagem, 'data_pesagem');
  if (!dia) throw new ApiError(400, 'Informe a data da pesagem.');
  if (typeof corpo.peso_kg !== 'number' || !Number.isFinite(corpo.peso_kg) || corpo.peso_kg <= 0) {
    throw new ApiError(400, 'Informe um peso positivo em kg.');
  }
  const { db, propriedadeId, animalId } = await contextoAnimal(req, res);
  const { data, error } = await db.from('pesagens').insert({
    propriedade_id: propriedadeId, animal_id: animalId, data_pesagem: dia, peso_kg: corpo.peso_kg,
  }).select('data_pesagem,peso_kg').single();
  if (error?.code === '23505') throw new ApiError(409, 'O animal já tem uma pesagem nesta data.', 'CONFLICT');
  if (error) throw error;
  res.status(201).json({ data });
};

export const listarPesagens: RequestHandler = async (req, res) => {
  const { limit, offset } = pagination(req.query);
  const inicio = nullableDate(req.query.inicio, 'inicio');
  const fim = nullableDate(req.query.fim, 'fim');
  if (inicio && fim && inicio > fim) throw new ApiError(400, 'O início deve ser anterior ou igual ao fim.');
  const { db, animalId } = await contextoAnimal(req, res);
  const { data, error } = await db.rpc('historico_pesagens', {
    p_animal: animalId, p_inicio: inicio ?? null, p_fim: fim ?? null, p_limit: limit, p_offset: offset,
  }).returns<HistoricoPesagens>();
  if (error) throw error;
  res.json(data);
};
