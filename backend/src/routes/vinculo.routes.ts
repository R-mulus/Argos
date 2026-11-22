import { Router } from 'express';
import {
  buscarVinculo, criarVinculo, encerrarVinculoAtivo, listarVinculos,
} from '../controllers/vinculo.controller.js';

export const vinculoRoutes = Router();
vinculoRoutes.get('/', listarVinculos);
vinculoRoutes.get('/:id', buscarVinculo);
vinculoRoutes.post('/', criarVinculo);
vinculoRoutes.patch('/:id/encerrar', encerrarVinculoAtivo);
