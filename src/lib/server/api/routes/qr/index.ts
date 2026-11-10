import { Hono } from 'hono';
import type { ApiEnv } from '../../types';
import { handleQrGet } from './root';

// /api/v1/qr/* atendido pelo Hono (gerado por migrate_domain.py). Estáticas antes de '/:param'.
export const qrRoutes = new Hono<ApiEnv>().get('/', (c) => handleQrGet(c.env.event));
