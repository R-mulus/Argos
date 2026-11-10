import { Router } from 'express';
import { atualizarAnimal, buscarAnimal, cadastrarAnimal, listarAnimais } from '../controllers/animal.controller.js';

export const animalRoutes = Router();
animalRoutes.get('/', listarAnimais);
animalRoutes.get('/:id', buscarAnimal);
animalRoutes.post('/', cadastrarAnimal);
animalRoutes.patch('/:id', atualizarAnimal);
