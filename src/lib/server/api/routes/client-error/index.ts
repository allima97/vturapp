import { Hono } from 'hono';
import type { ApiEnv } from '../../types';
import { handleClientErrorPost } from './root';

// /api/v1/client-error/* atendido pelo Hono (gerado por migrate_domain.py). Estáticas antes de '/:param'.
export const clientErrorRoutes = new Hono<ApiEnv>().post('/', (c) =>
  handleClientErrorPost(c.env.event)
);
