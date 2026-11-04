import { Hono } from 'hono';
import type { ApiEnv } from '../../types';
import { handleWelcomeEmailPost } from './root';

// /api/v1/welcome-email/* atendido pelo Hono (gerado por migrate_domain.py). Estáticas antes de '/:param'.
export const welcomeEmailRoutes = new Hono<ApiEnv>().post('/', (c) =>
  handleWelcomeEmailPost(c.env.event)
);
