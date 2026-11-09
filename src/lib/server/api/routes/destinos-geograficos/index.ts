import { Hono } from 'hono';
import type { ApiEnv } from '../../types';
import {
  handleDestinoGet,
  handleDestinosBuscaGet,
  handleDestinosExatosGet,
  handleDestinoReferenciaPost,
  handleDestinoPost
} from './root';

export const destinosGeograficosRoutes = new Hono<ApiEnv>()
  .get('/busca', (c) => handleDestinosBuscaGet(c.env.event))
  .get('/exata', (c) => handleDestinosExatosGet(c.env.event))
  .get('/detalhes', (c) => handleDestinoGet(c.env.event))
  .post('/referencia', (c) => handleDestinoReferenciaPost(c.env.event))
  .post('/', (c) => handleDestinoPost(c.env.event));
