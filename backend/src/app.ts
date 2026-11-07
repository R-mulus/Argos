import express from 'express';
import cors from 'cors';
import type { Config } from './config/env.js';
import { ApiError, errorHandler, notFound } from './lib/http.js';
import { requireAuth } from './middlewares/auth.js';
import { propriedadeRoutes } from './routes/propriedade.routes.js';
import { animalRoutes } from './routes/animal.routes.js';

export function createApp(config: Config) {
  const app = express();
  app.disable('x-powered-by');
  app.use(cors({ origin: config.corsOrigins }));
  app.use(express.json({ limit: '128kb' }));

  // Health check sem autenticação: não revela informações de infraestrutura.
  app.get('/', (_req, res) => res.json({ message: 'API do Argos está rodando!' }));
  app.get('/api/health', (_req, res) => res.json({ status: 'ok' }));

  app.use('/api', requireAuth(config));
  app.use('/api/propriedades', propriedadeRoutes);
  app.use('/api/animais', animalRoutes);

  app.use(notFound);
  app.use(errorHandler);
  return app;
}
