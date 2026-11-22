import { existsSync, readFileSync, writeFileSync } from 'node:fs';
// Executado uma vez após provisionar. Nunca sobrescreve uma configuração existente.
if (!existsSync('.env')) {
  const initial = readFileSync('../broker/private/worker.env', 'utf8');
  const url = process.argv[2] || '';
  if (url && new URL(url).protocol !== 'https:') throw new Error('Informe URL HTTPS do Supabase');
  writeFileSync('.env', initial.replace('SUPABASE_URL=\n', `SUPABASE_URL=${url}\n`), { flag: 'wx', mode: 0o600 });
  console.log('worker/.env criado. Falta preencher SUPABASE_SECRET_KEY localmente.');
} else console.log('worker/.env já existe; preservado.');
