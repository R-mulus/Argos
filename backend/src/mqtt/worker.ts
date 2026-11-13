import { fileURLToPath } from 'node:url';
import { FilaDeteccoes } from './fila.js';
import { sincronizarLote } from './sincronizacao.js';
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

const fila = new FilaDeteccoes(process.env.MQTT_SQLITE_PATH ||
  fileURLToPath(new URL('../../data/deteccoes.sqlite', import.meta.url)));
console.info(fila.resumo());
let encerrando = false;
let timer: NodeJS.Timeout;
async function sincronizar() {
  try {
    const total = await sincronizarLote(fila,
      evento => processarDeteccao(repositorio, evento),
      (evento, motivo) => repositorio.registrarRejeicao(evento, motivo),
      lote => repositorio.registrarSincronizacao(lote));
    if (total) console.info(fila.resumo());
  } catch {
    console.warn('Sincronização interrompida. Confira a rede e o acesso ao Supabase.', fila.resumo());
  }
  if (!encerrando) timer = setTimeout(sincronizar, 3000);
}
void sincronizar();

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
  try {
    const evento = parseDeteccaoMqtt(packet.topic,
      typeof packet.payload === 'string' ? Buffer.from(packet.payload, 'utf8') : packet.payload);
    const nova = fila.guardar(evento);
    console.info(nova ? 'Detecção recebida.' : 'Evento repetido.', fila.resumo());
  } catch (erro) {
    if (erro instanceof MensagemInvalida) {
      console.warn('Detecção rejeitada:', erro.message);
      done();
      return;
    }
    console.error('Falha na fila SQLite. A entrega será repetida pelo broker.');
    done(new Error('Falha na fila SQLite'));
    client.stream.destroy();
    return;
  }
  done();
};

client.on('connect', () => {
  console.info('Conectado ao broker MQTT; solicitando assinatura de detecções.');
  client.subscribe(TOPICO_DETECCOES, { qos: 1 }, (error, granted) => {
    if (error || !granted?.some((g) => g.topic === TOPICO_DETECCOES && g.qos === 1)) {
      console.error('Broker não concedeu assinatura QoS 1.', error ?? granted);
      client.reconnect();
      return;
    }
    console.info('Assinatura QoS 1 ativa.');
  });
});
client.on('error', (error) => console.error('Erro na conexão MQTT:', error.message));
client.on('offline', () => console.warn('Worker MQTT desconectado; tentando reconectar.'));

for (const signal of ['SIGINT', 'SIGTERM'] as const) {
  process.on(signal, () => {
    if (encerrando) return;
    encerrando = true;
    clearTimeout(timer);
    void client.endAsync(false).finally(() => {
      fila.fechar();
      process.exit(0);
    });
  });
}
