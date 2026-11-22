import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { once } from 'node:events';
import { mkdtempSync, rmSync } from 'node:fs';
import { createServer } from 'node:http';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { randomUUID } from 'node:crypto';
import { setTimeout as esperar } from 'node:timers/promises';
import test from 'node:test';
import { connectAsync } from 'mqtt';

// Executar apenas com broker de testes isolado, sem outros assinantes Argos.
test('worker coleta no EMQX offline, reinicia e envia as três leituras', async (t) => {
  const mqttUrl = process.env.ARGOS_TEST_MQTT_URL;
  assert.ok(mqttUrl && /^mqtt:\/\/127\.0\.0\.1:\d+$/.test(mqttUrl), 'Informe o broker local isolado.');
  const pasta = mkdtempSync(join(tmpdir(), 'argos-emqx-'));

  const propriedade = randomUUID(), receptor = randomUUID(), transmissor = randomUUID();
  const topico = `argos/v1/propriedades/${propriedade}/receptores/${receptor}/deteccoes`;
  let online = false;
  let falhas = 0;
  const insercoes: string[] = [];
  const api = createServer(async (req, res) => {
    res.setHeader('Content-Type', 'application/json');
    if (!online) {
      falhas++;
      res.writeHead(503).end('{}');
      return;
    }
    const url = new URL(req.url!, 'http://localhost');
    if (url.pathname.endsWith('/dispositivos') && req.method === 'GET') {
      const id = url.searchParams.get('id')?.slice(3);
      res.end(JSON.stringify([{ id, tipo: id === receptor ? 'receptor' : 'transmissor', status: 'ativo' }]));
    } else if (url.pathname.endsWith('/deteccoes') && req.method === 'POST') {
      let body = '';
      for await (const parte of req) body += parte;
      insercoes.push(JSON.parse(body).evento_id);
      res.end(JSON.stringify({ id: randomUUID() }));
    } else {
      res.end('[]');
    }
  });
  api.listen(0, '127.0.0.1');
  await once(api, 'listening');

  const endereco = api.address();
  assert.ok(endereco && typeof endereco === 'object');
  const env = { ...process.env, MQTT_URL: mqttUrl, MQTT_CLIENT_ID: randomUUID(),
    MQTT_USERNAME: '', MQTT_PASSWORD: '', MQTT_ALLOW_INSECURE_LOCAL: 'true',
    SUPABASE_URL: `http://127.0.0.1:${endereco.port}`, SUPABASE_SECRET_KEY: 'sb_secret_teste',
    MQTT_SQLITE_PATH: join(pasta, 'ensaio.sqlite') };
  let log = '';
  function iniciar() {
    log = '';
    const filho = spawn(process.execPath, ['--import', 'tsx', 'src/mqtt/worker.ts'], { env, windowsHide: true });
    filho.stdout.on('data', parte => { log += parte; });
    filho.stderr.on('data', parte => { log += parte; });
    return filho;
  }
  let worker = iniciar();
  async function parar() {
    if (worker.exitCode !== null || worker.signalCode !== null) return;
    const fim = once(worker, 'exit');
    worker.kill('SIGKILL');
    await fim;
  }
  t.after(async () => {
    await parar();
    api.closeAllConnections();
    api.close();
    rmSync(pasta, { recursive: true });
  });
  async function aguardar(condicao: () => boolean) {
    for (let i = 0; i < 200; i++) {
      if (condicao()) return;
      if (worker.exitCode !== null) break;
      await esperar(100);
    }
    assert.fail(log);
  }
  await aguardar(() => log.includes('Assinatura QoS 1 ativa'));
  const publicador = await connectAsync(mqttUrl, { connectTimeout: 5000, reconnectPeriod: 0 });
  t.after(() => publicador.endAsync(true));
  for (const id of ['1', '2', '3', '1']) {
    await publicador.publishAsync(topico, JSON.stringify({
      versao: 1, evento_id: id, transmissor_id: transmissor, rssi_dbm: -64,
    }), { qos: 1 });
  }
  await aguardar(() => log.includes('Evento repetido. Pendentes: 3') && falhas > 0);
  await parar();
  worker = iniciar();
  await aguardar(() => log.includes('Pendentes: 3'));
  online = true;
  await aguardar(() => log.includes('Pendentes: 0, sincronizadas: 3'));
  assert.deepEqual(insercoes, ['1', '2', '3']);
});
