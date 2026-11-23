import { connect } from 'mqtt';
import { readFileSync } from 'node:fs';
import { TOPIC_FILTER } from '../src/contract.js';
const url = process.env.MQTT_URL;
if (!url || !process.env.MQTT_USERNAME || !process.env.MQTT_PASSWORD) throw new Error('Configure MQTT_URL, MQTT_USERNAME e MQTT_PASSWORD em .env');
const endpoint = new URL(url);
if (!['mqtt:', 'mqtts:'].includes(endpoint.protocol) || endpoint.username || endpoint.password) throw new Error('URL MQTT inválida');
const client = connect(url, { username: process.env.MQTT_USERNAME, password: process.env.MQTT_PASSWORD,
  clientId: `argos-diagnostic-${process.pid}`, clean: true, protocolVersion: 5, reconnectPeriod: 0,
  connectTimeout: 5000, rejectUnauthorized: true,
  ca: process.env.MQTT_CA_FILE ? readFileSync(process.env.MQTT_CA_FILE) : undefined });
const timer = setTimeout(() => { console.error('Timeout de rede/handshake'); void client.endAsync(true); process.exitCode = 1; }, 8000);
client.once('error', error => {
  console.error(`Falha MQTT: ${error.message}. ECONNREFUSED/timeout: host, porta, bind/firewall. Certificado: CA/hostname/hora. Not authorized: usuário/senha/ACL.`);
  clearTimeout(timer); void client.endAsync(true); process.exitCode = 1;
});
client.once('connect', async () => {
  try {
    const grants = await client.subscribeAsync(TOPIC_FILTER, { qos: 1, rh: 2 });
    if (grants[0]?.qos !== 1) throw new Error('Assinatura não autorizada com QoS 1');
    console.log('TCP/TLS, autenticação e assinatura QoS 1 aprovados. Não comprova acesso pela placa ESP32.');
  } catch (error) { console.error(error instanceof Error ? error.message : 'Falha'); process.exitCode = 1; }
  finally { clearTimeout(timer); await client.endAsync(true); }
});
