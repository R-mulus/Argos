import type { RequestHandler } from 'express';
import type { Alerta } from '@argos/shared';
import { ApiError } from '../lib/http.js';
import { nullableEnum, objectBody, pagination, uuidParam } from '../lib/validation.js';
import { getAuth } from '../middlewares/auth.js';
import { requirePropriedade } from '../services/propriedade.service.js';

export const listarAlertas: RequestHandler = async (req, res) => {
  const { limit, offset } = pagination(req.query);
  const estado = nullableEnum(req.query.estado, 'estado', ['novo', 'lido', 'resolvido']);
  const auth = getAuth(res);
  const propriedade = await requirePropriedade(auth);
  let query = auth.db.from('alertas').select('*', { count: 'exact' })
    .eq('propriedade_id', propriedade.id);
  if (estado) query = query.eq('estado', estado);
  const { data, count, error } = await query.order('criado_em', { ascending: false })
    .order('id', { ascending: true }).range(offset, offset + limit - 1).returns<Alerta[]>();
  if (error) throw error;
  res.json({ data: data ?? [], count: count ?? 0, limit, offset });
};

export const atualizarAlerta: RequestHandler = async (req, res) => {
  const id = uuidParam(req.params.id);
  const body = objectBody(req.body, ['estado']);
  const estado = nullableEnum(body.estado, 'estado', ['lido', 'resolvido']);
  if (!estado) throw new ApiError(400, 'Informe lido ou resolvido.');
  const auth = getAuth(res);
  const propriedade = await requirePropriedade(auth);
  const { data, error } = await auth.db.rpc('atualizar_estado_alerta', {
    p_propriedade: propriedade.id, p_alerta: id, p_estado: estado,
  }).maybeSingle<Alerta>();
  if (error) throw error;
  if (!data) throw new ApiError(404, 'Aviso não encontrado.', 'NOT_FOUND');
  res.json({ data });
};
