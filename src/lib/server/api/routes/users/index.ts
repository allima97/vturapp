import { Hono } from 'hono';
import type { ApiEnv } from '../../types';
import { handleUsersAniversariantesGet } from './aniversariantes';

// /api/v1/users/* atendido pelo Hono (gerado por migrate_domain.py). Estáticas antes de '/:param'.
export const usersRoutes = new Hono<ApiEnv>().get('/aniversariantes', (c) =>
  handleUsersAniversariantesGet(c.env.event)
);
