// Broker EMQX real e worker real. Somente a API de banco é simulada, em localhost.
import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { execFileSync, spawn, type ChildProcess } from 'node:child_process';
import { mkdirSync, writeFileSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { once } from 'node:events';
import { setTimeout as sleep } from 'node:timers/promises';
import { DatabaseSync } from 'node:sqlite';
import { connect, connectAsync, type MqttClient } from 'mqtt';
import { property, receivers, tx, payload, topic } from './helpers.js';
import { TOPIC_FILTER } from '../src/contract.js';

const root = resolve('..');
const testDir = resolve(root, '.build', `integration-${process.pid}`);
const project = `argos-iot-test-${process.pid}`;
mkdirSync(testDir, { recursive: true });
const manifest = resolve(testDir, 'devices.json');
writeFileSync(manifest, JSON.stringify({ receivers: receivers.map(id => ({ id, propertyId: property })) }));
execFileSync(process.execPath, ['--import', 'tsx', 'scripts/provision.ts', '--devices', manifest, '--output', testDir], { stdio: 'pipe' });
const credentials = JSON.parse(readFileSync(resolve(testDir, 'private/credentials.json'), 'utf8')) as {
  receivers: { id: string; username: string; password: string }[]; worker: { username: string; password: string }
};
const override = resolve(testDir, 'compose.override.yml');
writeFileSync(override, 'services:\n  emqx:\n    volumes:\n' + [
  [resolve(testDir, 'private/users.json'), '/opt/emqx/etc/argos-users.json'],
  [resolve(testDir, 'private/acl.conf'), '/opt/emqx/etc/argos-acl.conf'],
].map(([source, target]) => `      - type: bind\n        source: ${JSON.stringify(source)}\n        target: ${target}\n        read_only: true\n`).join(''));
const dockerArgs = ['compose', '-p', project, '--env-file', resolve(testDir, '.env'), '-f', resolve(root, 'broker/docker-compose.yml'), '-f', override];
const dockerEnv = { ...process.env, MQTT_HOST_PORT: '11883', MQTT_DASHBOARD_PORT: '28083', MQTT_BIND_HOST: '127.0.0.1' };
function docker(...args: string[]) { return execFileSync('docker', [...dockerArgs, ...args], { env: dockerEnv, stdio: 'pipe', timeout: 180000 }).toString(); }
async function waitFor(predicate: () => boolean | Promise<boolean>, label: string, timeout = 20000) {
  const start = Date.now();
  while (!(await predicate())) { if (Date.now() - start > timeout) throw new Error(`Timeout: ${label}`); await sleep(100); }
}
const rows = new Map<string, Record<string, unknown>>();
let available = true, insertCalls = 0;
const api = createServer(async (req, res) => {
  res.setHeader('content-type', 'application/json');
  if (!available) { res.writeHead(503); res.end(JSON.stringify({ code: 'OFFLINE', message: 'test outage' })); return; }
  const url = new URL(req.url!, 'http://localhost');
  if (url.pathname.endsWith('/dispositivos')) {
    res.end(JSON.stringify([{ id: tx, propriedade_id: property, tipo: 'transmissor', status: 'ativo' },
      ...receivers.map(id => ({ id, propriedade_id: property, tipo: 'receptor', status: 'ativo' }))])); return;
  }
  if (url.pathname.endsWith('/vinculos')) { res.end('[]'); return; }
  if (url.pathname.endsWith('/deteccoes') && req.method === 'POST') {
    const chunks = []; for await (const chunk of req) chunks.push(chunk);
    const batch = JSON.parse(Buffer.concat(chunks).toString()) as Record<string, unknown>[];
    assert.equal(url.searchParams.get('on_conflict'), 'receptor_id,evento_id');
    assert(String(req.headers.prefer).includes('resolution=ignore-duplicates'));
    for (const row of batch) {
      const key = `${row.receptor_id}:${row.evento_id}`;
      if (!rows.has(key)) rows.set(key, row);
    }
    ++insertCalls; res.writeHead(201); res.end('[]'); return;
  }
  res.writeHead(404); res.end('{}');
});
api.listen(0, '127.0.0.1'); await once(api, 'listening');
const address = api.address(); assert(address && typeof address === 'object');
const apiPort = address.port;
const queuePath = resolve(testDir, 'queue.sqlite');
let child: ChildProcess | undefined;
let subscribed = false;
let childLogs = '';
function startWorker() {
  subscribed = false;
  child = spawn(process.execPath, ['dist/src/index.js'], { cwd: resolve(root, 'worker'), env: {
    ...process.env, MQTT_URL: 'mqtt://127.0.0.1:11883', MQTT_USERNAME: credentials.worker.username,
    MQTT_PASSWORD: credentials.worker.password, MQTT_CLIENT_ID: `argos-integration-${process.pid}`,
    SUPABASE_URL: `http://127.0.0.1:${apiPort}`, SUPABASE_SECRET_KEY: 'sb_secret_integration_only',
    QUEUE_PATH: queuePath, RETRY_BASE_MS: '100', RETRY_MAX_MS: '1000', POLL_INTERVAL_MS: '50', DEVICE_CACHE_MS: '0',
  }, stdio: ['ignore', 'pipe', 'pipe'] });
  child.stdout?.on('data', data => { const line = String(data); childLogs += line; if (line.includes('mqtt_assinado')) subscribed = true; });
  child.stderr?.on('data', data => { childLogs += String(data); });
}
async function stopWorker(crash = false) {
  if (!child || child.exitCode !== null) return;
  const exited = once(child, 'exit'); child.kill(crash ? 'SIGKILL' : 'SIGTERM'); await exited; child = undefined;
}
function queued() {
  try { const db = new DatabaseSync(queuePath, { readOnly: true }); try { return Number(db.prepare("SELECT count(*) AS n FROM events WHERE state='pending'").get()?.n ?? 0); } finally { db.close(); } }
  catch { return 0; }
}
async function rx(index: number) {
  const account = credentials.receivers[index]!;
  return connectAsync('mqtt://127.0.0.1:11883', { ...account, clientId: `test-rx-${index}-${Date.now()}`, protocolVersion: 4, reconnectPeriod: 0, connectTimeout: 4000 });
}
async function rejectCredentials(username?: string, password?: string) {
  const client = connect('mqtt://127.0.0.1:11883', { username, password, reconnectPeriod: 0, connectTimeout: 4000 });
  try {
    await new Promise<void>((resolvePromise, reject) => {
      const timer = setTimeout(() => reject(new Error('Autenticação não respondeu')), 5000);
      client.once('connect', () => { clearTimeout(timer); reject(new Error('Credencial proibida foi aceita')); });
      client.once('error', error => { clearTimeout(timer); assert.match(error.message, /not authorized|bad user name|password/i); resolvePromise(); });
    });
  } finally { await client.endAsync(true); }
}
async function forbiddenPublish(name: string, options: { qos: 0 | 1; retain: boolean }) {
  const client = await rx(0);
  try {
    const closed = new Promise<void>(resolveClose => client.once('close', () => resolveClose()));
    client.publish(name, JSON.stringify(payload(99)), options, () => {});
    await Promise.race([closed, sleep(5000).then(() => { throw new Error('ACL não desconectou publicação proibida'); })]);
  } finally { await client.endAsync(true); }
}
const clients: MqttClient[] = [];
try {
  console.log('Iniciando EMQX isolado nas portas 11883/28083...');
  docker('up', '-d', '--wait', '--wait-timeout', '150');
  await rejectCredentials(); await rejectCredentials(credentials.receivers[0]!.username, 'senha-incorreta');
  console.log('OK autenticação: anônimo e senha incorreta rejeitados');
  startWorker(); await waitFor(() => subscribed, 'worker assinar');
  for (let i = 0; i < 3; ++i) clients.push(await rx(i));
  const observed = new Date(Math.floor(Date.now() / 1000) * 1000 - 1000).toISOString().replace('.000Z', 'Z');
  for (let i = 0; i < 3; ++i) await clients[i]!.publishAsync(topic(receivers[i]), JSON.stringify(payload(1, observed)), { qos: 1 });
  await waitFor(() => rows.size === 3 && queued() === 0, 'três receptores persistidos');
  await clients[0]!.publishAsync(topic(), JSON.stringify(payload(1, observed)), { qos: 1 });
  const before = insertCalls; await waitFor(() => insertCalls > before || queued() > 0, 'reenvio recebido');
  await waitFor(() => queued() === 0, 'reenvio deduplicado'); assert.equal(rows.size, 3);
  assert([...rows.values()].every(row => row.zona_id === null));
  console.log('OK fluxo MQTT → worker → API simulada: três RXs, duplicação e mapeamento');
  await forbiddenPublish(topic(receivers[1]), { qos: 1, retain: false });
  await forbiddenPublish(topic(), { qos: 1, retain: true });
  await forbiddenPublish(topic(), { qos: 0, retain: false });
  assert.equal(rows.size, 3); console.log('OK ACL: outro receptor, retain e QoS 0 bloqueados');

  available = false;
  await clients[0]!.publishAsync(topic(), JSON.stringify(payload(2)), { qos: 1 });
  await waitFor(() => queued() === 1, 'fila durável durante falha do banco');
  await stopWorker(true);
  console.log('Worker interrompido abruptamente; aguardando expiração segura do lock...');
  await sleep(31000);
  available = true; startWorker(); await waitFor(() => subscribed && rows.size === 4 && queued() === 0, 'recuperação do SQLite');
  const recovered = [...rows.values()].find(row => String(row.evento_id).endsWith(':2'))!;
  assert.equal(recovered.detectado_em, null); assert.equal(recovered.vinculo_id, null);
  console.log('OK SQLite: indisponibilidade, encerramento abrupto e recuperação sem inventar horário/vínculo');

  await stopWorker();
  // Em Windows SIGTERM encerra abruptamente; aguardar lock também neste ensaio.
  await clients[0]!.publishAsync(topic(), JSON.stringify(payload(3)), { qos: 1 });
  for (const client of clients) await client.endAsync(true);
  console.log('Reiniciando broker com mensagem destinada à sessão offline do worker...');
  docker('restart', 'emqx'); docker('up', '-d', '--wait', '--wait-timeout', '150');
  await sleep(31000); startWorker();
  await waitFor(() => subscribed && rows.size === 5 && queued() === 0, 'sessão durável após reiniciar EMQX', 30000);
  console.log('OK EMQX: assinatura e mensagem offline sobreviveram ao reinício');
  console.log('INTEGRAÇÃO APROVADA. API Supabase simulada; nenhuma escrita no banco remoto.');
} catch (error) {
  console.error(childLogs.slice(-6000));
  try { console.error(docker('logs', '--tail', '35', 'emqx')); } catch {}
  throw error;
} finally {
  await stopWorker();
  for (const client of clients) await client.endAsync(true);
  api.close();
  // Somente o projeto único criado por este teste; nunca remove volumes do broker operacional.
  if (!project.startsWith('argos-iot-test-')) throw new Error('Projeto de teste inválido');
  docker('down', '--volumes');
}
