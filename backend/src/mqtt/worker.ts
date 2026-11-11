import { createClient } from '@supabase/supabase-js';
import { connect } from 'mqtt';
import { loadMqttWorkerConfig } from './config.js';
import { MensagemInvalida, TOPICO_DETECCOES, parseDeteccaoMqtt } from './contract.js';
import { processarDeteccao } from './processor.js';
import { SupabaseRepositorioDeteccoes } from './supabase-repository.js';

// Processo separado da API Express. Nunca importar este módulo em app.ts/server.ts.
const config = loadMqttWorkerConfig();
const supabase = createClient(config.supabaseUrl, config.supabaseSecretKey, {
  auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
});
const repositorio = new SupabaseRepositorioDeteccoes(supabase);

const client = connect(config.mqttUrl, {
  clientId: config.mqttClientId,
  protocolVersion: 4, // MQTT 3.1.1
  clean: false, // sessão persistente + QoS 1; exige clientId estável
  reconnectPeriod: 3000,
  connectTimeout: 30000,
  rejectUnauthorized: true,
  username: config.mqttUsername,
  password: config.mqttPassword,
});

// Em MQTT.js, o handler de mensagens pode reter o PUBACK até o callback.
// 'on(message)' sozinho reconheceria mensagens antes de terminar a escrita.
client.handleMessage = (packet, done) => {
  if (packet.retain || packet.qos !== 1) {
    console.warn('Ignorando MQTT retained ou sem QoS 1.');
    done();
    return;
  }
  void (async () => {
    const evento = parseDeteccaoMqtt(packet.topic,
      typeof packet.payload === 'string' ? Buffer.from(packet.payload, 'utf8') : packet.payload);
    const resultado = await processarDeteccao(repositorio, evento);
    if (resultado === 'duplicada') {
      console.info('Detecção MQTT já processada:', evento.eventoId);
    }
  })().then(
    () => done(),
    (error: unknown) => {
      if (error instanceof MensagemInvalida) {
        // Pacote inválido nunca vai ser corrigido por uma retransmissão.
        console.warn('Detecção rejeitada:', error.message);
        done();
        return;
      }
      // Falhas transitórias de Postgres/rede NÃO devem receber PUBACK.
      // Força reconexão para o broker retransmitir a mensagem QoS 1.
      console.error('Falha na persistência MQTT. Reconectando para replay:', error);
      done(error instanceof Error ? error : new Error('Falha de persistência MQTT'));
      client.reconnect();
    },
  );
};

client.on('connect', () => {
  console.info('Conectado ao broker MQTT; solicitando assinatura de detecções.');
  client.subscribe(TOPICO_DETECCOES, { qos: 1 }, (error, granted) => {
    if (error || !granted?.some((g) => g.topic === TOPICO_DETECCOES && g.qos === 1)) {
      console.error('Broker não concedeu assinatura QoS 1.', error ?? granted);
      client.reconnect();
    }
  });
});
client.on('error', (error) => console.error('Erro na conexão MQTT:', error.message));
client.on('offline', () => console.warn('Worker MQTT desconectado; tentando reconectar.'));

for (const signal of ['SIGINT', 'SIGTERM'] as const) {
  process.on(signal, () => {
    void client.endAsync(false).finally(() => process.exit(0));
  });
}
