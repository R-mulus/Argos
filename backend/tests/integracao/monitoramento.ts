import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { once } from 'node:events';
import test from 'node:test';
import { createClient } from '@supabase/supabase-js';
import { createApp } from '../../src/app.js';
import type { ResumoMonitoramento } from '@argos/shared';
import 'dotenv/config';

// Executar explicitamente com credenciais de servidor. Cada conta possui apenas dados do ensaio.
test('resumo reconcilia receptores e isola propriedades', async t => {
  const url = process.env.SUPABASE_URL!;
  const publica = process.env.SUPABASE_PUBLISHABLE_KEY!;
  const opcoes = { auth: { persistSession: false, autoRefreshToken: false } };
  const admin = createClient(url, process.env.SUPABASE_SECRET_KEY!, opcoes);
  const api = createApp({ supabaseUrl: url, supabasePublishableKey: publica, port: 0, corsOrigins: [] })
    .listen(0, '127.0.0.1');
  await once(api, 'listening');
  t.after(() => new Promise<void>(resolve => api.close(() => resolve())));
  const endereco = api.address();
  assert.ok(endereco && typeof endereco !== 'string');
  const endpoint = `http://127.0.0.1:${endereco.port}/api/monitoramento/resumo`;
  async function inserir(tabela: string, campos: Record<string, unknown>) {
    const { data, error } = await admin.from(tabela).insert(campos).select('id').single();
    assert.ifError(error);
    return String(data!.id);
  }
  async function propriedade() {
    const email = `ensaio-${randomUUID()}@example.com`;
    const password = randomUUID() + 'Aa1!';
    const { data, error } = await admin.auth.admin.createUser({ email, password, email_confirm: true });
    assert.ifError(error);
    const usuario = data.user!.id;
    t.after(async () => { assert.ifError((await admin.auth.admin.deleteUser(usuario)).error); });
    const login = await createClient(url, publica, opcoes).auth.signInWithPassword({ email, password });
    assert.ifError(login.error);
    return { id: await inserir('propriedades', { usuario_id: usuario, nome: 'Ensaio Argos' }),
      token: login.data.session!.access_token };
  }
  async function resumo(token: string): Promise<ResumoMonitoramento> {
    const res = await fetch(endpoint, { headers: { Authorization: `Bearer ${token}` } });
    assert.equal(res.status, 200);
    const corpo = await res.json() as { data: ResumoMonitoramento };
    return corpo.data;
  }
  const fazenda = await propriedade();
  const outra = await propriedade();
  const novo = (tabela: string, campos: Record<string, unknown>) =>
    inserir(tabela, { propriedade_id: fazenda.id, ...campos });
  const receptor = (codigo: string) => novo('dispositivos', { codigo, tipo: 'receptor' });
  const r1 = await receptor('R1'), r2 = await receptor('R2');
  const z1 = await novo('zonas', { nome: 'Curral', receptor_id: r1, ativa: true });
  const z2 = await novo('zonas', { nome: 'Bebedouro', receptor_id: r2, ativa: true });
  async function coleira(identificacao: string) {
    const animal_id = await novo('animais', { identificacao });
    const transmissor_id = await novo('dispositivos', { codigo: identificacao, tipo: 'transmissor' });
    const vinculo_id = await novo('vinculos', { animal_id, transmissor_id, inicio_em: '2020-01-01' });
    return { transmissor_id, vinculo_id };
  }
  const agora = Date.now() - 10_000;
  const data = (ms: number) => new Date(agora + ms).toISOString();
  async function ler(vinculo: Awaited<ReturnType<typeof coleira>>, receptor_id: string,
    zona_id: string | null, rssi_dbm: number, tempo: number | null) {
    await novo('deteccoes', { ...vinculo, receptor_id, zona_id, rssi_dbm, evento_id: randomUUID(),
      recebido_no_gateway_em: tempo === null ? null : data(tempo) });
  }
  const a = await coleira('A');
  await ler(a, r1, z1, -80, 0);
  await ler(a, r2, z2, -55, -2000);
  await ler(a, r1, z1, -35, -2001); // replay mais forte, fora da janela
  await ler(await coleira('B'), r1, z1, -44, -360000);
  await ler(await coleira('C'), r1, null, -60, 0);
  await ler(await coleira('D'), r1, z1, -55, null);
  await novo('animais', { identificacao: 'E' });
  await novo('animais', { identificacao: 'Inativo', status: 'inativo' });
  const resultado = await resumo(fazenda.token);
  assert.deepEqual([resultado.total_ativos, resultado.recentes, resultado.recentes_sem_zona,
    resultado.desatualizados, resultado.sem_horario, resultado.nunca_detectados], [5, 2, 1, 1, 1, 1]);
  assert.deepEqual(resultado.zonas.map(z => [z.id, z.quantidade]), [[z2, 1], [z1, 0]]);
  assert.equal(resultado.animais[0].receptor_id, r2);
  assert.equal(Date.parse(resultado.animais[0].ultima_deteccao_em!), agora);
  assert.equal(resultado.animais[1].zona_id, z1);
  assert.equal(resultado.animais[4].estado, 'nunca_detectado');
  const vazio = await resumo(outra.token);
  assert.equal(vazio.total_ativos, 0);
  assert.deepEqual(vazio.zonas, []);
  const db = createClient(url, publica, { ...opcoes, global: { headers: { Authorization: `Bearer ${outra.token}` } } });
  const acesso = await db.rpc('resumo_monitoramento', { p_propriedade: fazenda.id });
  assert.ifError(acesso.error);
  assert.deepEqual(acesso.data.animais, []);
  assert.deepEqual(acesso.data.zonas, []);
});
