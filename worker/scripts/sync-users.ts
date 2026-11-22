import { readFileSync } from 'node:fs';
import { parseEnv } from 'node:util';
const env = parseEnv(readFileSync('../broker/.env', 'utf8'));
const port = Number(env.MQTT_DASHBOARD_PORT || 18083);
if (!Number.isInteger(port) || port < 1 || port > 65535) throw new Error('Porta de dashboard inválida');
const base = `http://127.0.0.1:${port}/api/v5`;
const login = await fetch(`${base}/login`, { method: 'POST', headers: { 'content-type': 'application/json' },
  body: JSON.stringify({ username: 'admin', password: env.EMQX_DASHBOARD_PASSWORD }), signal: AbortSignal.timeout(5000) });
if (!login.ok) throw new Error(`Dashboard login HTTP ${login.status}; confira senha administrativa local`);
const { token } = await login.json() as { token: string };
const users = JSON.parse(readFileSync('../broker/private/users.json', 'utf8')) as { user_id: string; password: string; is_superuser: false }[];
let added = 0, unchanged = 0, rotated = 0;
for (const user of users) {
  const endpoint = `${base}/authentication/password_based:built_in_database/users`;
  const headers = { authorization: `Bearer ${token}`, 'content-type': 'application/json' };
  const existing = await fetch(`${endpoint}/${encodeURIComponent(user.user_id)}`, { headers, signal: AbortSignal.timeout(5000) });
  if (existing.ok && !process.argv.includes('--rotate')) {
    const data = await existing.json() as { is_superuser?: boolean };
    if (data.is_superuser) throw new Error('Conta existente é superusuário; corrija antes de usar credencial de dispositivo');
    ++unchanged; continue;
  }
  if (!existing.ok && existing.status !== 404) throw new Error(`Consultar usuário HTTP ${existing.status}`);
  const response = await fetch(existing.ok ? `${endpoint}/${encodeURIComponent(user.user_id)}` : endpoint, {
    method: existing.ok ? 'PUT' : 'POST', headers,
    body: JSON.stringify(existing.ok ? { password: user.password, is_superuser: false } : user), signal: AbortSignal.timeout(5000),
  });
  if (!response.ok) throw new Error(`Provisionar usuário HTTP ${response.status}`);
  if (existing.ok) ++rotated; else ++added;
}
console.log({ added, unchanged, rotated });
