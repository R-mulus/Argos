import { test } from 'node:test';
import assert from 'node:assert/strict';
import { parseDetection } from '../src/contract.js';
import { readConfig } from '../src/config.js';
import { payload, topic, tx } from './helpers.js';
const now = new Date('2026-11-20T15:00:00Z');
const parse = (body: unknown, name = topic()) => parseDetection(name, Buffer.from(JSON.stringify(body)), now);
test('contrato exato do firmware, nulos e identidade', () => {
  const result = parse(payload()); assert.equal(result.transmitterId, tx);
  assert.equal(result.observedAt, null); assert.equal(result.battery, null);
  assert.equal(result.receivedAt, now.toISOString());
  assert.equal(parse(payload(4294967295, '2026-11-20T14:59:00Z')).observedAt, '2026-11-20T14:59:00.000Z');
});
test('rejeita tópico, bytes inválidos, extras, IDs e evento inconsistente', () => {
  assert.throws(() => parse(payload(), 'argos/outro'));
  assert.throws(() => parseDetection(topic(), Buffer.from([0xff])));
  assert.throws(() => parseDetection(topic(), Buffer.alloc(4097)));
  for (const value of [[], null, { ...payload(), extra: true }, { ...payload(), versao: 2 },
    { ...payload(), evento_id: `outro:0123456789abcdef:1` }, payload(0), payload(4294967296),
    { ...payload(), evento_id: `${tx}:0000000000000000:1` }]) assert.throws(() => parse(value));
});
test('limites de RSSI, bateria e horário sem normalizar datas impossíveis', () => {
  for (const rssi of [-127, 0]) assert.equal(parse({ ...payload(), rssi_dbm: rssi }).rssi, rssi);
  for (const rssi of [-128, 1, 1.5, '-65', null]) assert.throws(() => parse({ ...payload(), rssi_dbm: rssi }));
  for (const battery of [0, 100, null]) parse({ ...payload(), bateria_percentual: battery });
  for (const battery of [-1, 101, 1.5, '50']) assert.throws(() => parse({ ...payload(), bateria_percentual: battery }));
  for (const time of ['2026-02-30T00:00:00Z', '2026-11-20T15:01:01Z', '2026-11-20', '2026-11-20T25:00:00Z'])
    assert.throws(() => parse(payload(1, time)));
});
test('configuração recusa chave pública, TLS inseguro e limites inválidos', () => {
  const base = { MQTT_URL: 'mqtt://127.0.0.1:1883', MQTT_USERNAME: 'worker', MQTT_PASSWORD: 'test',
    SUPABASE_URL: 'https://example.supabase.co', SUPABASE_SECRET_KEY: 'sb_secret_test' };
  assert.equal(readConfig(base).batchSize, 32);
  assert.throws(() => readConfig({ ...base, SUPABASE_SECRET_KEY: 'sb_publishable_test' }));
  assert.throws(() => readConfig({ ...base, MQTT_URL: 'ws://example:8083' }));
  assert.throws(() => readConfig({ ...base, SUPABASE_URL: 'http://example.com' }));
  assert.throws(() => readConfig({ ...base, BATCH_SIZE: '0' }));
});
