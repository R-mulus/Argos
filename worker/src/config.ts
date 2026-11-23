import { readFileSync } from 'node:fs';

export function readConfig(env: NodeJS.ProcessEnv = process.env) {
  const required = (name: string) => { const value = env[name]?.trim(); if (!value) throw new Error(`Configure ${name}`); return value; };
  const integer = (name: string, fallback: number, min: number, max: number) => {
    const n = Number(env[name] ?? fallback);
    if (!Number.isSafeInteger(n) || n < min || n > max) throw new Error(`${name} fora de ${min}..${max}`);
    return n;
  };
  const mqttUrl = required('MQTT_URL');
  const mqtt = new URL(mqttUrl);
  if (!['mqtt:', 'mqtts:'].includes(mqtt.protocol) || mqtt.username || mqtt.password || mqtt.pathname || mqtt.search)
    throw new Error('MQTT_URL deve usar mqtt:// ou mqtts:// sem credenciais/caminho');
  const supabaseUrl = required('SUPABASE_URL');
  const db = new URL(supabaseUrl);
  if (db.protocol !== 'https:' && !(db.protocol === 'http:' && ['127.0.0.1', 'localhost'].includes(db.hostname)))
    throw new Error('Supabase remoto exige HTTPS');
  const key = required('SUPABASE_SECRET_KEY');
  if (!key.startsWith('sb_secret_')) {
    try {
      const claims = JSON.parse(Buffer.from(key.split('.')[1] ?? '', 'base64url').toString()) as { role?: string };
      if (claims.role !== 'service_role') throw new Error();
    } catch { throw new Error('SUPABASE_SECRET_KEY deve ser secret key ou service_role; não usar chave pública'); }
  }
  const base = integer('RETRY_BASE_MS', 1000, 100, 60000), max = integer('RETRY_MAX_MS', 60000, 1000, 3600000);
  if (base > max) throw new Error('RETRY_BASE_MS maior que RETRY_MAX_MS');
  return {
    mqttUrl, mqttUsername: required('MQTT_USERNAME'), mqttPassword: required('MQTT_PASSWORD'),
    clientId: env.MQTT_CLIENT_ID || 'argos-ingestion-v1',
    ca: env.MQTT_CA_FILE ? readFileSync(env.MQTT_CA_FILE) : undefined,
    sessionExpiry: integer('MQTT_SESSION_EXPIRY_SECONDS', 604800, 3600, 2592000),
    supabaseUrl, supabaseKey: key, queuePath: env.QUEUE_PATH || './data/ingestion.sqlite',
    maxItems: integer('QUEUE_MAX_ITEMS', 100000, 1, 10000000), deadMax: integer('DEAD_MAX_ITEMS', 10000, 1, 1000000),
    batchSize: integer('BATCH_SIZE', 32, 1, 100), pollMs: integer('POLL_INTERVAL_MS', 250, 20, 10000),
    requestTimeout: integer('REQUEST_TIMEOUT_MS', 10000, 100, 60000),
    cacheMs: integer('DEVICE_CACHE_MS', 10000, 0, 60000), retryBase: base, retryMax: max,
  };
}
export type Config = ReturnType<typeof readConfig>;
