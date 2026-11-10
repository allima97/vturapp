import { Hono } from 'hono';
import type { ApiEnv } from '../../types';
import { withRouteParams } from '../../params';
import { handleViagensGet } from './root';
import { handleViagensIdGet, handleViagensIdPatch, handleViagensIdDelete } from './id';
import { handleViagensCidadesBuscaGet } from './cidades-busca';
import { handleViagensClienteIdGet } from './cliente-id';
import { handleViagensClientesGet } from './clientes';
import { handleViagensCreatePost } from './create';
import { handleViagensDeletePost } from './delete';
import { handleViagensDossieGet } from './dossie';
import { handleViagensDossieBatchPost } from './dossie-batch';

// /api/v1/viagens/* atendido pelo Hono (gerado por migrate_domain.py). Estáticas antes de '/:param'.
export const viagensRoutes = new Hono<ApiEnv>()
  .get('/', (c) => handleViagensGet(c.env.event))
  // apelido: viagens/list/+server.ts reexportava GET de ../+server
  .get('/list', (c) => handleViagensGet(c.env.event))
  .get('/cidades-busca', (c) => handleViagensCidadesBuscaGet(c.env.event))
  .get('/clientes', (c) => handleViagensClientesGet(c.env.event))
  .post('/create', (c) => handleViagensCreatePost(c.env.event))
  .post('/delete', (c) => handleViagensDeletePost(c.env.event))
  .get('/dossie', (c) => handleViagensDossieGet(c.env.event))
  .post('/dossie-batch', (c) => handleViagensDossieBatchPost(c.env.event))
  .get('/cliente/:id', (c) =>
    handleViagensClienteIdGet(withRouteParams(c.env.event, c.req.param()))
  )
  .get('/:id', (c) => handleViagensIdGet(withRouteParams(c.env.event, c.req.param())))
  .patch('/:id', (c) => handleViagensIdPatch(withRouteParams(c.env.event, c.req.param())))
  .delete('/:id', (c) => handleViagensIdDelete(withRouteParams(c.env.event, c.req.param())));
