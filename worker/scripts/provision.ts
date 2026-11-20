import { readFileSync, writeFileSync, existsSync, mkdirSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { randomBytes } from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { UUID, TOPIC_FILTER } from '../src/contract.js';

interface Receiver { id: string; propertyId: string; username?: string; password?: string }
interface Credentials { receivers: Required<Receiver>[]; worker: { username: string; password: string } }
const root = resolve(dirname(fileURLToPath(import.meta.url)), '../..');
const args = process.argv.slice(2);
const outIndex = args.indexOf('--output');
const target = outIndex >= 0 ? resolve(args[outIndex + 1]!) : resolve(root, 'broker');
mkdirSync(resolve(target, 'private'), { recursive: true });
const privatePath = resolve(target, 'private/credentials.json');
const previous = existsSync(privatePath) ? JSON.parse(readFileSync(privatePath, 'utf8')) as Credentials : undefined;
const secret = () => randomBytes(32).toString('base64url');
function define(file: string, key: string): string {
  const text = readFileSync(file, 'utf8');
  const literal = text.match(new RegExp(`^#define\\s+${key}\\s+("(?:[^"\\\\]|\\\\.)*")`, 'm'))?.[1];
  return literal ? JSON.parse(literal) as string : '';
}
let receivers: Receiver[];
if (args.includes('--from-firmware')) {
  const device = resolve(root, 'firmware/ArgosReceptor/ArgosDevice.local.h');
  const secrets = resolve(root, 'firmware/ArgosReceptor/ArgosSecrets.h');
  receivers = [{ id: define(device, 'ARGOS_DEVICE_ID'), propertyId: define(device, 'ARGOS_PROPERTY_ID'),
    username: define(secrets, 'ARGOS_MQTT_USER'), password: define(secrets, 'ARGOS_MQTT_PASS') }];
} else {
  const index = args.indexOf('--devices');
  const input = index >= 0 ? resolve(args[index + 1]!) : resolve(target, 'private/devices.json');
  receivers = (JSON.parse(readFileSync(input, 'utf8')) as { receivers: Receiver[] }).receivers;
}
if (!Array.isArray(receivers) || !receivers.length) throw new Error('Informe ao menos um receptor');
const credentials: Credentials = { receivers: [], worker: previous?.worker ?? { username: 'argos-worker', password: secret() } };
const users = new Set([credentials.worker.username]);
const ids = new Set<string>();
for (const rx of receivers) {
  if (!UUID.test(rx.id) || !UUID.test(rx.propertyId) || ids.has(rx.id)) throw new Error('UUID inválido ou receptor repetido');
  ids.add(rx.id);
  const old = previous?.receivers.find(item => item.id === rx.id);
  const username = rx.username || old?.username || `rx-${rx.id}`;
  const password = rx.password || old?.password || secret();
  if (!/^[a-zA-Z0-9._:-]{1,100}$/.test(username) || users.has(username)) throw new Error('Usuário inválido/repetido');
  if (password.length < 8 || /[\r\n]/.test(password)) throw new Error('Senha MQTT deve ter >=8 caracteres e não conter quebras de linha');
  users.add(username); credentials.receivers.push({ ...rx, username, password });
}
// Sem trocar senhas silenciosamente ao repetir; dados existentes do EMQX também não são sobrescritos pelo bootstrap.
const accounts = [...credentials.receivers, credentials.worker];
writeFileSync(privatePath, JSON.stringify(credentials, null, 2) + '\n', { mode: 0o600 });
writeFileSync(resolve(target, 'private/users.json'), JSON.stringify(accounts.map(a => ({ user_id: a.username, password: a.password, is_superuser: false })), null, 2) + '\n', { mode: 0o600 });
const rules = credentials.receivers.map(rx => `{allow, {username, "${rx.username}"}, {publish, [{qos, 1}, {retain, false}]}, [{eq, "argos/v1/propriedades/${rx.propertyId}/receptores/${rx.id}/deteccoes"}]}.`);
rules.push(`{allow, {username, "${credentials.worker.username}"}, {subscribe, [{qos, 1}]}, [{eq, "${TOPIC_FILTER}"}]}.`, '{deny, all}.');
writeFileSync(resolve(target, 'private/acl.conf'), rules.join('\n') + '\n');
const env = resolve(target, '.env');
if (!existsSync(env)) writeFileSync(env, `MQTT_BIND_HOST=127.0.0.1\nMQTT_HOST_PORT=1883\nMQTT_DASHBOARD_PORT=18083\nEMQX_NODE_COOKIE=${secret()}\nEMQX_DASHBOARD_PASSWORD=${secret()}\n`, { mode: 0o600 });
const workerEnv = resolve(target, 'private/worker.env');
writeFileSync(workerEnv, `MQTT_URL=mqtt://127.0.0.1:1883\nMQTT_USERNAME=${credentials.worker.username}\nMQTT_PASSWORD=${credentials.worker.password}\nMQTT_CLIENT_ID=argos-ingestion-v1\nSUPABASE_URL=\nSUPABASE_SECRET_KEY=\nQUEUE_PATH=./data/ingestion.sqlite\n`, { mode: 0o600 });
console.log(`Provisionados ${receivers.length} receptor(es). Segredos gravados em ${resolve(target, 'private')} (não exibidos).`);
console.log('Bootstrap é inicial: usuários existentes exigem gestão explícita pelo dashboard/API para adicionar/rotacionar depois.');
