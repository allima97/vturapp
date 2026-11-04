import { Hono } from 'hono';
import type { ApiEnv } from '../../types';
import { handleEquipeRelacaoPost } from './relacao';

// /api/v1/equipe/* atendido pelo Hono (gerado por migrate_domain.py). Estáticas antes de '/:param'.
export const equipeRoutes = new Hono<ApiEnv>().post('/relacao', (c) =>
  handleEquipeRelacaoPost(c.env.event)
);
