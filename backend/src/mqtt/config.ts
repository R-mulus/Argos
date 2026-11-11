import 'dotenv/config';

export interface MqttWorkerConfig {
  supabaseUrl: string;
  supabaseSecretKey: string;
  mqttUrl: string;
  mqttClientId: string;
  mqttUsername?: string;
  mqttPassword?: string;
}

export function loadMqttWorkerConfig(env: NodeJS.ProcessEnv = process.env): MqttWorkerConfig {
  const supabaseUrl = env.SUPABASE_URL?.trim();
  const supabaseSecretKey = env.SUPABASE_SECRET_KEY?.trim();
  const mqttUrl = env.MQTT_URL?.trim();
  const mqttClientId = env.MQTT_CLIENT_ID?.trim();
  if (!supabaseUrl || !supabaseSecretKey || !mqttUrl || !mqttClientId) {
    throw new Error('Worker requer SUPABASE_URL, SUPABASE_SECRET_KEY, MQTT_URL e MQTT_CLIENT_ID.');
  }
  if (!supabaseSecretKey.startsWith('sb_secret_')) {
    throw new Error('Use uma chave sb_secret_ dedicada ao worker, nunca a chave publishable.');
  }
  if (!/^[-_a-zA-Z0-9]{1,80}$/.test(mqttClientId)) {
    throw new Error('MQTT_CLIENT_ID precisa ser identificador estável de 1 a 80 caracteres.');
  }
  let url: URL;
  try { url = new URL(mqttUrl); } catch { throw new Error('MQTT_URL inválida.'); }
  const encrypted = ['mqtts:', 'wss:'].includes(url.protocol);
  const local = ['localhost', '127.0.0.1', '[::1]'].includes(url.hostname);
  if (!encrypted && !(url.protocol === 'mqtt:' &&
    env.MQTT_ALLOW_INSECURE_LOCAL === 'true' && local)) {
    throw new Error('Use mqtts:// ou wss://; mqtt:// só é permitido no loopback local.');
  }
  if (url.username || url.password) {
    throw new Error('Não coloque usuário/senha na MQTT_URL; use MQTT_USERNAME e MQTT_PASSWORD.');
  }
  const mqttUsername = env.MQTT_USERNAME?.trim() || undefined;
  const mqttPassword = env.MQTT_PASSWORD || undefined;
  if ((!mqttUsername || !mqttPassword) && !(local && env.MQTT_ALLOW_INSECURE_LOCAL === 'true')) {
    throw new Error('MQTT_USERNAME e MQTT_PASSWORD são obrigatórios fora do ambiente local.');
  }
  return { supabaseUrl, supabaseSecretKey, mqttUrl, mqttClientId, mqttUsername, mqttPassword };
}
