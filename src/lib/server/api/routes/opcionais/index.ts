import { Hono } from 'hono';
import type { ApiEnv } from '../../types';
import { handleOpcionaisDelete, handleOpcionaisGet, handleOpcionaisPost } from './root';
import { handleOpcionaisCidadesGet } from './cidades';
import { handleOpcionaisImportarPost } from './importar';

export const opcionaisRoutes = new Hono<ApiEnv>()
  .get('/', (c) => handleOpcionaisGet(c.env.event))
  .post('/', (c) => handleOpcionaisPost(c.env.event))
  .delete('/', (c) => handleOpcionaisDelete(c.env.event))
  .get('/cidades', (c) => handleOpcionaisCidadesGet(c.env.event))
  .post('/importar', (c) => handleOpcionaisImportarPost(c.env.event));
