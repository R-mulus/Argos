import type { RequestHandler } from 'express';
import { getAuth } from '../middlewares/auth.js';
import { requirePropriedade } from '../services/propriedade.service.js';
import { parseGeometriaZona, parseReferenciaEspacial } from '../models/espacial.model.js';
import { uuidParam } from '../lib/validation.js';
import { ApiError } from '../lib/http.js';

// Todas as consultas usam o cliente do usuário (RLS) e filtram pela propriedade da sessão.

/** Máximo de linhas por resposta do PostgREST no projeto: 5 estimativas por animal → 200 animais. */
const LIMITE_RECENTES = 1000;

export const obterReferenciaEspacial: RequestHandler = async (_req, res) => {
  const auth = getAuth(res);
  const propriedade = await requirePropriedade(auth);
  const { data, error } = await auth.db.from('argos_referencias_espaciais')
    .select('*').eq('propriedade_id', propriedade.id).maybeSingle();
  if (error) throw error;
  res.json({ data });
};

export const salvarReferenciaEspacial: RequestHandler = async (req, res) => {
  const auth = getAuth(res);
  const propriedade = await requirePropriedade(auth);
  const corpo = parseReferenciaEspacial(req.body);
  const { data, error } = await auth.db.from('argos_referencias_espaciais').upsert({
    ...corpo, propriedade_id: propriedade.id, atualizado_em: new Date().toISOString(),
  }, { onConflict: 'propriedade_id' }).select().single();
  if (error) throw error;
  res.json({ data });
};

export const listarGeometriasZonas: RequestHandler = async (_req, res) => {
  const auth = getAuth(res);
  const propriedade = await requirePropriedade(auth);
  const { data, error } = await auth.db.from('argos_geometrias_zonas')
    .select('zona_id, pontos, atualizado_em').eq('propriedade_id', propriedade.id).order('zona_id');
  if (error) throw error;
  res.json({ data, consultado_em: new Date().toISOString() });
};

async function exigirZona(auth: ReturnType<typeof getAuth>, propriedadeId: string, zonaId: string) {
  const { data, error } = await auth.db.from('zonas').select('id')
    .eq('id', zonaId).eq('propriedade_id', propriedadeId).maybeSingle();
  if (error) throw error;
  if (!data) throw new ApiError(404, 'Zona não encontrada.', 'NOT_FOUND');
}

export const salvarGeometriaZona: RequestHandler = async (req, res) => {
  const auth = getAuth(res);
  const propriedade = await requirePropriedade(auth);
  const zonaId = uuidParam(req.params.id);
  const { pontos } = parseGeometriaZona(req.body);
  await exigirZona(auth, propriedade.id, zonaId);
  const { data, error } = await auth.db.from('argos_geometrias_zonas').upsert({
    zona_id: zonaId, propriedade_id: propriedade.id, pontos, atualizado_em: new Date().toISOString(),
  }, { onConflict: 'zona_id' }).select('zona_id, pontos, atualizado_em').single();
  if (error) throw error;
  res.json({ data });
};

export const removerGeometriaZona: RequestHandler = async (req, res) => {
  const auth = getAuth(res);
  const propriedade = await requirePropriedade(auth);
  const zonaId = uuidParam(req.params.id);
  await exigirZona(auth, propriedade.id, zonaId);
  const { error } = await auth.db.from('argos_geometrias_zonas').delete()
    .eq('zona_id', zonaId).eq('propriedade_id', propriedade.id);
  if (error) throw error;
  res.status(204).end();
};

/**
 * Últimas cinco estimativas RSSI de cada animal (view argos_localizacoes_recentes), com o horário
 * de observação, de chegada ao banco e de processamento. O cliente decide a posição exibida.
 */
export const listarLocalizacoesRecentes: RequestHandler = async (_req, res) => {
  const auth = getAuth(res);
  const propriedade = await requirePropriedade(auth);
  const { data, count, error } = await auth.db.from('argos_localizacoes_recentes')
    .select('*', { count: 'exact' }).eq('propriedade_id', propriedade.id)
    .order('animal_id').order('observado_em', { ascending: false }).order('id')
    .range(0, LIMITE_RECENTES - 1);
  if (error) throw error;
  res.json({ data, count, limit: LIMITE_RECENTES, offset: 0, consultado_em: new Date().toISOString() });
};
