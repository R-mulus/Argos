import { Router } from 'express';
import { listarPesagens, registrarPesagem } from '../controllers/pesagem.controller.js';
import { atualizarAnimal, buscarAnimal, cadastrarAnimal, listarAnimais } from '../controllers/animal.controller.js';

export const animalRoutes = Router();
animalRoutes.get('/:id/pesagens', listarPesagens);
animalRoutes.post('/:id/pesagens', registrarPesagem);
animalRoutes.get('/', listarAnimais);
animalRoutes.get('/:id', buscarAnimal);
animalRoutes.post('/', cadastrarAnimal);
animalRoutes.patch('/:id', atualizarAnimal);
