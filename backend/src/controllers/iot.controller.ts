import type { RequestHandler } from 'express';
import { getAuth } from '../middlewares/auth.js';
import { requirePropriedade } from '../services/propriedade.service.js';
import { coordenadasBody } from '../models/iot.model.js';
import { pagination, uuidParam } from '../lib/validation.js';
import { ApiError } from '../lib/http.js';

export const salvarCoordenadas: RequestHandler = async (req, res) => {
  const auth = getAuth(res);
  const propriedade = await requirePropriedade(auth);
  const body = coordenadasBody(req.body);
  const { data: receptor, error: erroReceptor } = await auth.db.from('dispositivos')
    .select('id').eq('id', body.receptor_id).eq('propriedade_id', propriedade.id)
    .eq('tipo', 'receptor').eq('status', 'ativo').maybeSingle();
  if (erroReceptor) throw erroReceptor;
  if (!receptor) throw new ApiError(404, 'Receptor ativo não encontrado.');
  const { data, error } = await auth.db.from('argos_posicoes_receptores').upsert({
    ...body, propriedade_id: propriedade.id, atualizado_em: new Date().toISOString(),
  }, { onConflict: 'receptor_id' }).select().single();
  if (error) throw error;
  res.json({ data });
};

// Usa cliente do usuário + RLS; não aceita propriedade arbitrária do navegador.
export function listarDadosIoT(table: 'argos_localizacoes' | 'argos_predicoes' | 'argos_posicoes_receptores' | 'argos_previsoes_habitos'): RequestHandler {
  return async (req, res) => {
    const auth = getAuth(res);
    const propriedade = await requirePropriedade(auth);
    const { limit, offset } = pagination(req.query);
    const coordinates = table === 'argos_posicoes_receptores';
    let query = auth.db.from(table).select('*', { count: 'exact' }).eq('propriedade_id', propriedade.id);
    if (!coordinates && req.query.animal_id !== undefined) {
      query = query.eq('animal_id', uuidParam(req.query.animal_id, 'animal_id'));
    }
    query = coordinates ? query.order('receptor_id') : query
      .order('observado_em', { ascending: false, nullsFirst: false }).order('id');
    const { data, count, error } = await query.range(offset, offset + limit - 1);
    if (error) throw error;
    res.json({ data, count, limit, offset, consultado_em: new Date().toISOString() });
  };
}
