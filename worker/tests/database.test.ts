import { test } from 'node:test';
import assert from 'node:assert/strict';
import { SupabaseRepository } from '../src/database.js';
import { event, property, tx, receivers } from './helpers.js';
test('Supabase usa intervalo [inicio,fim), conflito certo e recebimento original', async () => {
  const queries: URL[] = []; let inserted: unknown; let preference = '';
  const fetcher: typeof fetch = async (input, init) => {
    const url = new URL(String(input)); queries.push(url);
    if (url.pathname.endsWith('dispositivos')) return Response.json([
      { id: tx, propriedade_id: property, tipo: 'transmissor', status: 'ativo' },
      { id: receivers[0], propriedade_id: property, tipo: 'receptor', status: 'ativo' },
    ]);
    if (url.pathname.endsWith('vinculos')) return Response.json([{ id: 'historico', inicio_em: '2026-01-01T00:00:00Z', fim_em: null }]);
    inserted = JSON.parse(String(init?.body)); preference = new Headers(init?.headers).get('prefer') ?? '';
    return new Response(null, { status: 201 });
  };
  const repository = new SupabaseRepository('https://example.supabase.co', 'sb_secret_test', 1000, 10000, fetcher);
  const e = { ...event(), observedAt: '2026-11-20T14:59:00.000Z' };
  const row = await repository.prepare(e); assert.equal(row.vinculo_id, 'historico');
  await repository.insert([row]);
  const link = queries.find(u => u.pathname.endsWith('vinculos'))!;
  assert.equal(link.searchParams.get('inicio_em'), `lte.${e.observedAt}`);
  assert(link.searchParams.get('or')?.includes(`fim_em.gt.${e.observedAt}`));
  assert.equal(queries.find(u => u.pathname.endsWith('deteccoes'))?.searchParams.get('on_conflict'), 'receptor_id,evento_id');
  assert(preference.includes('resolution=ignore-duplicates')); assert.deepEqual(inserted, [row]);
  const before = queries.length; await repository.prepare(e); assert.equal(queries.length, before);
  const noClock = await repository.prepare(event()); assert.equal(noClock.vinculo_id, null);
  assert(queries.some(u => u.searchParams.get('or')?.includes('ultima_comunicacao_em.lt.')));
});
test('falha HTTP de configuração não é tratada como dado descartável', async () => {
  const repository = new SupabaseRepository('https://example.supabase.co', 'sb_secret_test', 1000, 0,
    async () => Response.json({ code: 'PGRST301', message: 'jwt invalid' }, { status: 401 }));
  await assert.rejects(repository.prepare(event()), /supabase:PGRST301/);
});
