import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { once } from 'node:events';
import test from 'node:test';
import { createClient } from '@supabase/supabase-js';
import { createApp } from '../../src/app.js';
import type { ComunicacaoReceptor, HistoricoPesagens, ResumoMonitoramento } from '@argos/shared';
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
  const antigo = new Date(Date.now() - 360_000).toISOString();
  const recente = new Date(Date.now() - 10_000).toISOString();
  const r3 = await novo('dispositivos', { codigo: 'R3', tipo: 'receptor', status: 'inativo',
    ultima_comunicacao_em: antigo });
  assert.ifError((await admin.from('dispositivos').update({ ultima_comunicacao_em: recente }).eq('id', r2)).error);
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

  async function receptores(token: string, parametros = '') {
    const rota = new URL('/api/monitoramento/receptores' + parametros, endpoint);
    const resposta = await fetch(rota, { headers: { Authorization: `Bearer ${token}` } });
    assert.equal(resposta.status, 200);
    return await resposta.json() as { data: ComunicacaoReceptor[]; count: number };
  }
  const lista = await receptores(fazenda.token);
  assert.equal(lista.count, 3);
  const porId = new Map(lista.data.map(item => [item.id, item]));
  assert.equal(porId.get(r1)?.estado_comunicacao, 'aguardando_primeira_leitura');
  assert.equal(porId.get(r2)?.estado_comunicacao, 'recente');
  assert.equal(porId.get(r3)?.estado_comunicacao, 'sem_leitura_recente');
  assert.equal(porId.get(r3)?.status, 'inativo');
  assert.equal(Date.parse(porId.get(r3)!.ultima_comunicacao_em!), Date.parse(antigo));
  const pagina = await receptores(fazenda.token, '?limit=1&offset=1');
  assert.equal(pagina.count, 3);
  assert.deepEqual(pagina.data, lista.data.slice(1, 2));
  assert.equal((await receptores(outra.token)).count, 0);

  const rotaPeso = new URL('/api/animais/' + resultado.animais[0].animal_id + '/pesagens', endpoint);
  async function pesar(dia: string, kg: number, token = fazenda.token) {
    return fetch(rotaPeso, { method: 'POST',
      headers: { Authorization: 'Bearer ' + token, 'Content-Type': 'application/json' },
      body: JSON.stringify({ data_pesagem: dia, peso_kg: kg }) });
  }
  async function historicoPeso(query: string) {
    const resposta = await fetch(rotaPeso.href + query, { headers: { Authorization: 'Bearer ' + fazenda.token } });
    assert.equal(resposta.status, 200);
    return await resposta.json() as HistoricoPesagens;
  }
  assert.equal((await pesar('2026-10-01', 400)).status, 201);
  assert.equal((await pesar('2026-10-01', 450)).status, 409);
  assert.equal((await historicoPeso('')).ganho_medio_diario_kg, null);
  assert.equal((await pesar('2026-10-11', 390)).status, 201);
  assert.equal((await pesar('2026-10-21', 420)).status, 201);
  const periodo = await historicoPeso('?inicio=2026-10-01&fim=2026-10-11&limit=1');
  assert.equal(periodo.count, 2);
  assert.equal(periodo.ganho_medio_diario_kg, -1);
  assert.deepEqual(periodo.data, [{ data_pesagem: '2026-10-11', peso_kg: 390 }]);
  assert.equal((await historicoPeso('')).ganho_medio_diario_kg, 1);
  assert.equal((await pesar('2026-10-31', 401, outra.token)).status, 404);
  const externo = await db.rpc('historico_pesagens', { p_animal: resultado.animais[0].animal_id,
    p_inicio: null, p_fim: null, p_limit: 20, p_offset: 0 });
  assert.ifError(externo.error);
  assert.equal(externo.data.count, 0);

  // Supera o limite padrão de mil linhas da API de dados.
  const extras = Array.from({ length: 1001 }, (_, i) => ({
    propriedade_id: fazenda.id, ...a, receptor_id: r1, zona_id: z1,
    evento_id: 'exportacao:' + i, rssi_dbm: -75, recebido_no_gateway_em: data(-60000),
  }));
  assert.ifError((await admin.from('deteccoes').insert(extras)).error);
  const rotaCsv = new URL('/api/deteccoes/exportar', endpoint);
  rotaCsv.searchParams.set('animal_id', resultado.animais[0].animal_id);
  rotaCsv.searchParams.set('zona_id', z1);
  const csv = await fetch(rotaCsv, { headers: { Authorization: 'Bearer ' + fazenda.token } });
  assert.equal(csv.status, 200);
  assert.match(csv.headers.get('content-disposition')!, /deteccoes.csv/);
  assert.equal((await csv.text()).trimEnd().split('\r\n').length, 1004);
  const alheio = await fetch(rotaCsv, { headers: { Authorization: 'Bearer ' + outra.token } });
  assert.equal((await alheio.text()).trimEnd().split('\r\n').length, 1);
  rotaCsv.searchParams.set('inicio', data(0));
  const periodoCsv = await fetch(rotaCsv, { headers: { Authorization: 'Bearer ' + fazenda.token } });
  assert.equal((await periodoCsv.text()).trimEnd().split('\r\n').length, 2);
});
