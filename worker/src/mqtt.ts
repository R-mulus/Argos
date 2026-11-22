import { connect, type MqttClient, type IPublishPacket } from 'mqtt';
import { parseDetection, TOPIC_FILTER } from './contract.js';
import type { Config } from './config.js';
import { DurableQueue } from './queue.js';
import { InvalidDetection, type Log } from './types.js';

export function acceptPacket(packet: IPublishPacket, queue: DurableQueue, log: Log): void {
  try {
    if (packet.qos !== 1 || packet.retain) throw new InvalidDetection('qos_ou_retain_invalido');
    const event = parseDetection(packet.topic, typeof packet.payload === 'string' ? Buffer.from(packet.payload) : packet.payload);
    queue.enqueue(event); // synchronous=FULL: somente retorna após commit local.
  } catch (error) {
    if (error instanceof InvalidDetection) {
      log('mensagem_invalida', { reason: error.message }); return; // Não repetir mensagem irrecuperável.
    }
    throw error;
  }
}
export function startMqtt(config: Config, queue: DurableQueue, log: Log, fatal: (error: Error) => void): MqttClient {
  const client = connect(config.mqttUrl, {
    username: config.mqttUsername, password: config.mqttPassword, clientId: config.clientId,
    protocolVersion: 5, clean: false, reconnectPeriod: 5000, reconnectOnConnackError: true,
    connectTimeout: 10000, keepalive: 30, resubscribe: false,
    rejectUnauthorized: true, ca: config.ca,
    properties: { sessionExpiryInterval: config.sessionExpiry, receiveMaximum: 32, maximumPacketSize: 8192 },
  });
  client.handleMessage = (packet, done) => {
    try { acceptPacket(packet, queue, log); done(); }
    catch (error) {
      // Nunca confirmar disco cheio/falha de gravação. O broker conserva o QoS 1 pendente.
      log('fila_indisponivel', { reason: error instanceof Error ? error.message : 'erro' });
      client.stream.destroy();
      done(error instanceof Error ? error : new Error('fila_indisponivel'));
    }
  };
  client.on('connect', () => {
    void client.subscribeAsync(TOPIC_FILTER, { qos: 1, rap: true, rh: 2 }).then(grants => {
      if (grants.length !== 1 || grants[0]?.qos !== 1) throw new Error('Assinatura MQTT recusada ou QoS diferente de 1');
      log('mqtt_assinado', { filter: TOPIC_FILTER });
    }).catch(fatal);
  });
  client.on('reconnect', () => log('mqtt_reconectando'));
  client.on('offline', () => log('mqtt_offline'));
  client.on('error', error => log('mqtt_erro', {
    // Erros do MQTT.js não incluem a senha; não registrar objeto config ou URL autenticada.
    reason: error.message, code: 'code' in error ? error.code : undefined,
  }));
  return client;
}
