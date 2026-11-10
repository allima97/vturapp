import { Hono } from 'hono';
import type { ApiEnv } from '../../types';
import { withRouteParams } from '../../params';
import { handleProdutosGet } from './root';
import { handleProdutosIdGet, handleProdutosIdPatch, handleProdutosIdDelete } from './id';
import { handleProdutosBaseGet } from './base';
import { handleProdutosCreatePost } from './create';
import { handleProdutosTarifasGet, handleProdutosTarifasPost } from './tarifas';
import { handleProdutosCidadesGeograficasGet } from '../vendas/cidades-geograficas';

// /api/v1/produtos/* atendido pelo Hono (gerado por migrate_domain.py). Estáticas antes de '/:param'.
export const produtosRoutes = new Hono<ApiEnv>()
  .get('/', (c) => handleProdutosGet(c.env.event))
  .get('/base', (c) => handleProdutosBaseGet(c.env.event))
  .get('/cidades-geograficas', (c) => handleProdutosCidadesGeograficasGet(c.env.event))
  .post('/create', (c) => handleProdutosCreatePost(c.env.event))
  .get('/tarifas', (c) => handleProdutosTarifasGet(c.env.event))
  .post('/tarifas', (c) => handleProdutosTarifasPost(c.env.event))
  .get('/:id', (c) => handleProdutosIdGet(withRouteParams(c.env.event, c.req.param())))
  .patch('/:id', (c) => handleProdutosIdPatch(withRouteParams(c.env.event, c.req.param())))
  .delete('/:id', (c) => handleProdutosIdDelete(withRouteParams(c.env.event, c.req.param())));
