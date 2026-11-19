import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { randomUUID } from 'node:crypto';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { setTimeout as pause } from 'node:timers/promises';
import test from 'node:test';
import { connectAsync } from 'mqtt';

// Broker descartável do Compose, sem workers de produção. Nunca imprime credenciais.
test('EMQX autentica, entrega QoS1 e nega senha/tópico/assinatura indevidos', async () => {
  const url = process.env.ARGOS_TEST_MQTT_URL;
  assert.match(url ?? '', /^mqtt:\/\/127\.0\.0\.1:\d+$/);
  assert.equal(process.env.ARGOS_TEST_ISOLATED, 'true');
  const rows = readFileSync('../infra/emqx/users.local.csv', 'utf8').trim().split(/\r?\n/)
    .slice(1).map(line => line.split(','));
  const worker = rows.find(r => r[0] === 'argos-worker')!;
  const receiver = rows.find(r => r[0].startsWith('rx:'))!;
  const [, property, rx] = receiver[0].split(':');
  const topic = `argos/v1/propriedades/${property}/receptores/${rx}/deteccoes`;
  const options = (row: string[]) => ({ username: row[0], password: row[1],
    clientId: 'audit-' + randomUUID(), reconnectPeriod: 0, connectTimeout: 4000, protocolVersion: 5 as const });
  await assert.rejects(connectAsync(url!, { ...options(receiver), password: 'invalid-' + randomUUID() }));
  const sub = await connectAsync(url!, options(worker));
  const pub = await connectAsync(url!, options(receiver));
  try {
    await sub.subscribeAsync('argos/v1/propriedades/+/receptores/+/deteccoes', { qos: 1 });
    const received = new Promise<[string, Buffer]>((resolve, reject) => {
      const timer = setTimeout(() => reject(new Error('Entrega MQTT não observada')), 5000);
      sub.once('message', (topic, payload) => { clearTimeout(timer); resolve([topic, payload]); });
    });
    const payload = JSON.stringify({ versao: 1, evento_id: randomUUID(),
      transmissor_id: randomUUID(), rssi_dbm: -65, detectado_em: null });
    await pub.publishAsync(topic, payload, { qos: 1 });
    const [actualTopic, actualPayload] = await received;
    assert.equal(actualTopic, topic); assert.equal(actualPayload.toString(), payload);
    // Negação explícita do EMQX pode responder com erro ou desconectar.
    const denied = await connectAsync(url!, options(receiver));
    try {
      const closed = new Promise<void>((resolve, reject) => {
        const timer = setTimeout(() => reject(new Error('ACL não desconectou publicação indevida')), 5000);
        denied.once('close', () => { clearTimeout(timer); resolve(); });
      });
      void denied.publishAsync(topic.replace(rx, randomUUID()), payload, { qos: 1 }).catch(() => {});
      await closed;
    } finally { await denied.endAsync(true); }
    const wrongSub = await connectAsync(url!, options(receiver));
    try {
      await assert.rejects(wrongSub.subscribeAsync('#'));
    } finally { await wrongSub.endAsync(true); }
  } finally { await pub.endAsync(true); await sub.endAsync(true); }
});

test('cliente retoma conexão após parada do broker descartável', async () => {
  assert.equal(process.env.ARGOS_TEST_ISOLATED, 'true');
  assert.equal(process.env.ARGOS_TEST_MQTT_URL, 'mqtt://127.0.0.1:21883');
  const worker = readFileSync('../infra/emqx/users.local.csv', 'utf8').trim()
    .split(/\r?\n/).slice(1).map(line => line.split(',')).find(row => row[0] === 'argos-worker')!;
  const client = await connectAsync(process.env.ARGOS_TEST_MQTT_URL, {
    username: worker[0], password: worker[1], reconnectPeriod: 500, connectTimeout: 2000,
  });
  client.on('error', () => {});
  let connections = 0;
  client.on('connect', () => { connections++; });
  const docker = promisify(execFile);
  try {
    await docker('docker', ['stop', '-t', '2', 'argos-auditoria-emqx-1'], { windowsHide: true });
    await pause(1000);
    assert.equal(client.connected, false);
    await docker('docker', ['start', 'argos-auditoria-emqx-1'], { windowsHide: true });
    for (let i=0; i<90 && !connections; i++) await pause(500);
    assert.ok(connections > 0, 'Não reconectou ao EMQX');
  } finally { await client.endAsync(true); }
});
