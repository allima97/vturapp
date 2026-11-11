import { Hono } from 'hono';
import type { ApiEnv } from '../../types';
import { handlePassagensDelete, handlePassagensGet, handlePassagensPost } from './root';

export const passagensRoutes = new Hono<ApiEnv>()
  .get('/', (c) => handlePassagensGet(c.env.event))
  .post('/', (c) => handlePassagensPost(c.env.event))
  .delete('/', (c) => handlePassagensDelete(c.env.event));
