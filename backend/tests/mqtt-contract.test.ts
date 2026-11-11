import assert from 'node:assert/strict';
import test from 'node:test';
import { parseDeteccaoMqtt, TOPICO_DETECCOES } from '../src/mqtt/contract.js';
import { loadMqttWorkerConfig } from '../src/mqtt/config.js';

const propriedade = '652fca4e-b911-4638-8ac4-20db0c24c027';
const receptor = '5a61dabf-08c8-4ee1-9de7-1a134751f6bb';
const transmissor = 'aafde201-a4d8-462b-822a-30be5e233230';
const topic = `argos/v1/propriedades/${propriedade}/receptores/${receptor}/deteccoes`;
const now = new Date('2026-11-11T15:00:00Z');
const bytes = (o: unknown) => Buffer.from(JSON.stringify(o), 'utf-8');
const base = { versao: 1, evento_id: 'boot001:42', transmissor_id: transmissor, rssi_dbm: -69 };

test('MQTT v1 extrai propriedade e receptor do tópico e guarda horários distintos', () => {
  assert.equal(TOPICO_DETECCOES, 'argos/v1/propriedades/+/receptores/+/deteccoes');
  assert.deepEqual(parseDeteccaoMqtt(topic, bytes(base), now), {
    propriedadeId: propriedade, receptorId: receptor, transmissorId: transmissor,
    eventoId: 'boot001:42', rssiDbm: -69, bateriaPercentual: null,
    detectadoEm: null, recebidoEm: now.toISOString(),
  });
  assert.equal(parseDeteccaoMqtt(topic, bytes({
    ...base, detectado_em: '2026-11-10T13:00:00-03:00', bateria_percentual: 89,
  }), now).detectadoEm, '2026-11-10T16:00:00.000Z');
});
test('rejeita identificações, RSSI, bateria, JSON ou horários inválidos', () => {
  assert.throws(() => parseDeteccaoMqtt(topic + '/extra', bytes(base), now), /Tópico/);
  assert.throws(() => parseDeteccaoMqtt(topic, bytes({ ...base, versao: 2 }), now), /versao/);
  assert.throws(() => parseDeteccaoMqtt(topic, bytes({ ...base, evento_id: '' }), now), /evento_id/);
  assert.throws(() => parseDeteccaoMqtt(topic, bytes({ ...base, rssi_dbm: 99 }), now), /rssi_dbm/);
  assert.throws(() => parseDeteccaoMqtt(topic, bytes({ ...base, bateria_percentual: 102 }), now), /bateria/);
  assert.throws(() => parseDeteccaoMqtt(topic, bytes({ ...base, detectado_em: '2026-11-11T16:00:01Z' }), now), /futuro/);
  assert.throws(() => parseDeteccaoMqtt(topic, Buffer.from('{', 'utf8'), now), /JSON/);
  assert.throws(() => parseDeteccaoMqtt(topic, Buffer.alloc(4097), now), /4096/);
  assert.throws(() => parseDeteccaoMqtt(topic, bytes({ ...base, propriedade_id: propriedade }), now), /campos/);
});
test('worker exige chave secreta e conexão criptografada fora do localhost', () => {
  const env = {
    SUPABASE_URL: 'https://example.supabase.co', SUPABASE_SECRET_KEY: 'sb_secret_test',
    MQTT_URL: 'mqtts://example.com:8883', MQTT_CLIENT_ID: 'argos-worker-01',
    MQTT_USERNAME: 'worker', MQTT_PASSWORD: 'senha',
  };
  assert.deepEqual(loadMqttWorkerConfig(env).mqttClientId, 'argos-worker-01');
  assert.throws(() => loadMqttWorkerConfig({ ...env, SUPABASE_SECRET_KEY: 'sb_publishable_no' }), /sb_secret_/);
  assert.throws(() => loadMqttWorkerConfig({ ...env, MQTT_URL: 'mqtt://example.com:1883' }), /mqtts/);
  assert.equal(loadMqttWorkerConfig({
    ...env, MQTT_URL: 'mqtt://127.0.0.1:1883', MQTT_ALLOW_INSECURE_LOCAL: 'true',
    MQTT_USERNAME: '', MQTT_PASSWORD: '',
  }).mqttUrl, 'mqtt://127.0.0.1:1883');
});
