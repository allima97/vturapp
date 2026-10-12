import { Hono } from 'hono';
import type { ApiEnv } from '../../types';
import { withRouteParams } from '../../params';
import { handlePagamentosGet, handlePagamentosPost } from './root';
import { handlePagamentosIdGet, handlePagamentosIdPatch, handlePagamentosIdDelete } from './id';
import { handlePagamentosUploadPost } from './upload';

// /api/v1/pagamentos/* atendido pelo Hono (gerado por migrate_domain.py). Estáticas antes de '/:param'.
export const pagamentosRoutes = new Hono<ApiEnv>()
  .get('/', (c) => handlePagamentosGet(c.env.event))
  .post('/', (c) => handlePagamentosPost(c.env.event))
  .post('/upload', (c) => handlePagamentosUploadPost(c.env.event))
  .get('/:id', (c) => handlePagamentosIdGet(withRouteParams(c.env.event, c.req.param())))
  .patch('/:id', (c) => handlePagamentosIdPatch(withRouteParams(c.env.event, c.req.param())))
  .delete('/:id', (c) => handlePagamentosIdDelete(withRouteParams(c.env.event, c.req.param())));
