import { Router } from 'express';
import {
  atualizarDispositivo, buscarDispositivo, cadastrarDispositivo, listarDispositivos,
} from '../controllers/dispositivo.controller.js';

export const dispositivoRoutes = Router();
dispositivoRoutes.get('/', listarDispositivos);
dispositivoRoutes.get('/:id', buscarDispositivo);
dispositivoRoutes.post('/', cadastrarDispositivo);
dispositivoRoutes.patch('/:id', atualizarDispositivo);
