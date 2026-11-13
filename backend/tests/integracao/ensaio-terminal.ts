import assert from 'node:assert/strict';
import { execFileSync, spawn } from 'node:child_process';
import { randomUUID } from 'node:crypto';
import { once } from 'node:events';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { setTimeout as esperar } from 'node:timers/promises';
import test from 'node:test';
import { createClient } from '@supabase/supabase-js';
import { connectAsync } from 'mqtt';
import type { ComunicacaoReceptor, DeteccaoHistorico, ResumoMonitoramento } from '@argos/shared';
import { createApp } from '../../src/app.js';
import 'dotenv/config';

const docker = (...args: string[]) => execFileSync('docker', args, {
  encoding: 'utf8', windowsHide: true, timeout: 120_000,
}).trim();

async function aguardar(descricao: string, pronto: () => boolean | Promise<boolean>) {
  const limite = Date.now() + 60_000;
  do {
    if (await pronto()) return;
    await esperar(500);
  } while (Date.now() < limite);
  throw new Error(`Tempo esgotado: ${descricao}.`);
}

test('ensaio no terminal: duas leituras e uma cabeça na zona do sinal mais forte', async t => {
  const url = process.env.SUPABASE_URL;
  const chave = process.env.SUPABASE_PUBLISHABLE_KEY;
  const segredo = process.env.SUPABASE_SECRET_KEY;
  assert.ok(url && chave && segredo, 'Configure as credenciais do Supabase em backend/.env.');
  const id = randomUUID();
  const broker = 'argos-ensaio-' + id;
  docker('run', '-d', '--rm', '--name', broker, '-p', '127.0.0.1::1883', 'emqx/emqx-enterprise:6.3.2');
  t.after(() => { docker('stop', broker); });
  const porta = Number(docker('port', broker, '1883/tcp').split(':').pop());
  assert.ok(porta > 0);
  const mqttUrl = `mqtt://127.0.0.1:${porta}`;

  const opcoes = { auth: { persistSession: false, autoRefreshToken: false } };
  const admin = createClient(url, segredo, opcoes);
  const email = `ensaio-${id}@example.com`;
  const password = randomUUID() + 'Aa1!';
  const conta = await admin.auth.admin.createUser({ email, password, email_confirm: true });
  assert.ifError(conta.error);
  const usuario = conta.data.user!.id;
  t.after(async () => { assert.ifError((await admin.auth.admin.deleteUser(usuario)).error); });
  const login = await createClient(url, chave, opcoes).auth.signInWithPassword({ email, password });
  assert.ifError(login.error);
  const api = createApp({ supabaseUrl: url, supabasePublishableKey: chave, port: 0, corsOrigins: [] })
    .listen(0, '127.0.0.1');
  await once(api, 'listening');
  t.after(() => new Promise<void>(resolve => api.close(() => resolve())));
  const endereco = api.address();
  assert.ok(endereco && typeof endereco !== 'string');
  const base = `http://127.0.0.1:${endereco.port}/api`;
  async function consultar<T>(rota: string, campos?: Record<string, unknown>): Promise<T> {
    const res = await fetch(`${base}/${rota}`, {
      method: campos ? 'POST' : 'GET', signal: AbortSignal.timeout(15_000),
      headers: { Authorization: `Bearer ${login.data.session!.access_token}`, 'Content-Type': 'application/json' },
      body: campos ? JSON.stringify(campos) : undefined,
    });
    assert.ok(res.ok, `${rota}: HTTP ${res.status}`);
    return ((await res.json()) as { data: T }).data;
  }
  const cadastrar = (rota: string, campos: Record<string, unknown>) => consultar<{ id: string }>(rota, campos);
  const propriedade = await cadastrar('propriedades', { nome: 'Ensaio temporário' });
  const animal = await cadastrar('animais', { identificacao: 'Bovino 01' });
  const tx = await cadastrar('dispositivos', { codigo: 'T01', tipo: 'transmissor' });
  const receptores: { id: string; zona: string; sinal: number }[] = [];
  for (const [codigo, nome, sinal] of [['R01', 'Curral', -80], ['R02', 'Bebedouro', -50]] as const) {
    const rx = await cadastrar('dispositivos', { codigo, tipo: 'receptor' });
    const zona = await cadastrar('zonas', { nome, receptor_id: rx.id, ativa: true });
    receptores.push({ id: rx.id, zona: zona.id, sinal });
  }
  const vinculo = await consultar<{ inicio_em: string }>('vinculos', { animal_id: animal.id, transmissor_id: tx.id });
  await aguardar('vigência dos cadastros no relógio local', () => Date.now() > Date.parse(vinculo.inicio_em));

  const pasta = mkdtempSync(join(tmpdir(), 'argos-ensaio-'));
  const worker = spawn(process.execPath, ['--import', 'tsx', 'src/mqtt/worker.ts'], {
    windowsHide: true, stdio: ['ignore', 'pipe', 'inherit'], env: { ...process.env,
      MQTT_URL: mqttUrl, MQTT_CLIENT_ID: id, MQTT_USERNAME: '', MQTT_PASSWORD: '',
      MQTT_ALLOW_INSECURE_LOCAL: 'true', MQTT_SQLITE_PATH: join(pasta, 'fila.sqlite') },
  });
  const fim = once(worker, 'exit');
  let log = '';
  worker.stdout.on('data', parte => { log = (log + parte).slice(-4000); });
  try {
    await aguardar('assinatura do worker no EMQX', () => {
      assert.equal(worker.exitCode, null, 'Worker encerrou antes de assinar.');
      return log.includes('Assinatura QoS 1 ativa');
    });
    const publicador = await connectAsync(mqttUrl, { reconnectPeriod: 0, connectTimeout: 5000 });
    try {
      const horario = new Date().toISOString();
      for (const rx of receptores) {
        const topico = `argos/v1/propriedades/${propriedade.id}/receptores/${rx.id}/deteccoes`;
        const payload = JSON.stringify({ versao: 1, transmissor_id: tx.id, evento_id: 'ensaio:1',
          detectado_em: horario, rssi_dbm: rx.sinal });
        await publicador.publishAsync(topico, payload, { qos: 1 });
        if (rx.id === receptores[0].id) await publicador.publishAsync(topico, payload, { qos: 1 });
      }
    } finally {
      await publicador.endAsync(true);
    }
    await aguardar('sincronização das duas detecções', () => log.includes('Pendentes: 0, sincronizadas: 2'));
    const historico = await consultar<DeteccaoHistorico[]>('deteccoes');
    const resumo = await consultar<ResumoMonitoramento>('monitoramento/resumo');
    const comunicacao = await consultar<ComunicacaoReceptor[]>('monitoramento/receptores');
    assert.equal(historico.length, 2);
    assert.deepEqual(new Set(historico.map(h => h.receptor_id)), new Set(receptores.map(r => r.id)));
    assert.ok(historico.every(h => h.animal_id === animal.id));
    assert.equal(resumo.total_ativos, 1);
    assert.equal(resumo.recentes, 1);
    assert.equal(resumo.animais[0].zona_id, receptores[1].zona);
    for (const rx of receptores) {
      const quantidadeEsperada = rx.zona === receptores[1].zona ? 1 : 0;
      assert.equal(resumo.zonas.find(z => z.id === rx.zona)?.quantidade, quantidadeEsperada);
      assert.equal(comunicacao.find(r => r.id === rx.id)?.estado_comunicacao, 'recente');
    }
    console.log('Leituras simuladas enviadas por MQTT. Resultado consultado na API Argos:');
    console.table(historico.map(h => ({ Animal: h.animal_identificacao, Receptor: h.receptor_codigo,
      Zona: h.zona_nome, 'RSSI (dBm)': h.rssi_dbm })));
    console.table(resumo.zonas.map(z => ({ Zona: z.nome, Cabeças: z.quantidade })));
    console.table(comunicacao.map(r => ({ Receptor: r.codigo, Comunicação: r.estado_comunicacao })));
  } finally {
    if (worker.exitCode === null && worker.signalCode === null) worker.kill();
    await fim;
    rmSync(pasta, { recursive: true });
  }
});
