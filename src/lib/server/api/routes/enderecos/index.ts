import { Hono } from 'hono';
import type { ApiEnv } from '../../types';
import { handleEnderecosCepGet } from './cep';

// /api/v1/enderecos/* atendido pelo Hono (gerado por migrate_domain.py). Estáticas antes de '/:param'.
export const enderecosRoutes = new Hono<ApiEnv>().get('/cep', (c) =>
  handleEnderecosCepGet(c.env.event)
);
