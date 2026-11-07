import type { RequestHandler, Response } from 'express';
import type { SupabaseClient } from '@supabase/supabase-js';
import type { Config } from '../config/env.js';
import { ApiError } from '../lib/http.js';
import { createAuthClient, createUserClient } from '../lib/supabase.js';

export type AuthContext = { userId: string; db: SupabaseClient };

export function getAuth(res: Response): AuthContext {
  const auth = res.locals.auth as AuthContext | undefined;
  if (!auth) throw new ApiError(500, 'Contexto de autenticação indisponível.', 'AUTH_CONTEXT_MISSING');
  return auth;
}

export function requireAuth(config: Config): RequestHandler {
  const authClient = createAuthClient(config);
  return async (req, res, next) => {
    try {
      const match = /^Bearer\s+(.+)$/i.exec(req.get('authorization') ?? '');
      const token = match?.[1]?.trim();
      if (!token) throw new ApiError(401, 'Token de acesso obrigatório.', 'UNAUTHORIZED');

      // getUser(token) valida o token no servidor Supabase Auth.
      // Decodificar um JWT localmente sem validar sua assinatura não é suficiente.
      const { data, error } = await authClient.auth.getUser(token);
      if (error || !data.user || data.user.is_anonymous) {
        throw new ApiError(401, 'Sessão inválida ou expirada.', 'UNAUTHORIZED');
      }
      res.locals.auth = {
        userId: data.user.id,
        db: createUserClient(config, token),
      } satisfies AuthContext;
      next();
    } catch (error) {
      next(error);
    }
  };
}
