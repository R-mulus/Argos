import { Router } from 'express';
import { atualizarZona, buscarZona, cadastrarZona, listarZonas } from '../controllers/zona.controller.js';

export const zonaRoutes = Router();
zonaRoutes.get('/', listarZonas);
zonaRoutes.get('/:id', buscarZona);
zonaRoutes.post('/', cadastrarZona);
zonaRoutes.patch('/:id', atualizarZona);
