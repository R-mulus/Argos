import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import type { Config } from '../config/env.js';

// Nunca usar secret/service_role neste cliente de requests: o JWT do usuário
// é encaminhado ao PostgREST, permitindo que as políticas RLS sejam aplicadas.
export function createAuthClient(config: Config): SupabaseClient {
  return createClient(config.supabaseUrl, config.supabasePublishableKey, {
    auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
  });
}

export function createUserClient(config: Config, token: string): SupabaseClient {
  return createClient(config.supabaseUrl, config.supabasePublishableKey, {
    global: { headers: { Authorization: `Bearer ${token}` } },
    auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
  });
}
