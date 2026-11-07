import { Router } from 'express';
import { atualizarPropriedade, cadastrarPropriedade, minhaPropriedade } from '../controllers/propriedade.controller.js';

export const propriedadeRoutes = Router();
propriedadeRoutes.get('/minha', minhaPropriedade);
propriedadeRoutes.post('/', cadastrarPropriedade);
propriedadeRoutes.patch('/minha', atualizarPropriedade);
