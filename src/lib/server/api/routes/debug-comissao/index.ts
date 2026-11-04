import { Hono } from 'hono';
import type { ApiEnv } from '../../types';
import { handleDebugComissaoGet } from './root';

// /api/v1/debug-comissao/* atendido pelo Hono (gerado por migrate_domain.py). Estáticas antes de '/:param'.
export const debugComissaoRoutes = new Hono<ApiEnv>().get('/', (c) =>
  handleDebugComissaoGet(c.env.event)
);
