import 'dotenv/config';

export type Config = {
  port: number;
  supabaseUrl: string;
  supabasePublishableKey: string;
  corsOrigins: string[];
};

export function loadConfig(env: NodeJS.ProcessEnv = process.env): Config {
  const supabaseUrl = env.SUPABASE_URL?.trim();
  const supabasePublishableKey = env.SUPABASE_PUBLISHABLE_KEY?.trim();
  if (!supabaseUrl || !supabasePublishableKey) {
    throw new Error('Configure SUPABASE_URL e SUPABASE_PUBLISHABLE_KEY no backend/.env.');
  }
  const port = Number(env.PORT ?? '3333');
  if (!Number.isInteger(port) || port < 1 || port > 65535) {
    throw new Error('PORT deve ser uma porta TCP válida.');
  }
  const corsOrigins = (env.CORS_ORIGIN ?? 'http://localhost:5173')
    .split(',').map((origin) => origin.trim()).filter(Boolean);
  return { port, supabaseUrl, supabasePublishableKey, corsOrigins };
}
