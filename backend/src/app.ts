import express from 'express';
import { listarAlertas, atualizarAlerta } from './controllers/alerta.controller.js';
import cors from 'cors';
import type { Config } from './config/env.js';
import { ApiError, errorHandler, notFound } from './lib/http.js';
import { requireAuth } from './middlewares/auth.js';
import { propriedadeRoutes } from './routes/propriedade.routes.js';
import { animalRoutes } from './routes/animal.routes.js';
import { dispositivoRoutes } from './routes/dispositivo.routes.js';
import { zonaRoutes } from './routes/zona.routes.js';
import { vinculoRoutes } from './routes/vinculo.routes.js';
import { listarDeteccoes, exportarDeteccoes } from './controllers/deteccao.controller.js';
import { resumoMonitoramento } from './controllers/monitoramento.controller.js';
import { listarComunicacaoReceptores } from './controllers/dispositivo.controller.js';

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
  app.use('/api/dispositivos', dispositivoRoutes);
  app.use('/api/zonas', zonaRoutes);
  app.use('/api/vinculos', vinculoRoutes);
  app.get('/api/deteccoes', listarDeteccoes);
  app.get('/api/alertas', listarAlertas);
  app.patch('/api/alertas/:id', atualizarAlerta);
  app.get('/api/deteccoes/exportar', exportarDeteccoes);
  app.get('/api/monitoramento/resumo', resumoMonitoramento);
  app.get('/api/monitoramento/receptores', listarComunicacaoReceptores);

  app.use(notFound);
  app.use(errorHandler);
  return app;
}
