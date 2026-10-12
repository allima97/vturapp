import { Hono } from 'hono';
import type { ApiEnv } from '../../types';
import { withRouteParams } from '../../params';
import { handleOrcamentosIdGet, handleOrcamentosIdPatch, handleOrcamentosIdDelete } from './id';
import { handleOrcamentosIdResumoVendaGet } from './id-resumo-venda';
import { handleOrcamentosCidadesBuscaGet } from './cidades-busca';
import { handleOrcamentosClienteCreatePost } from './cliente-create';
import { handleOrcamentosClientesGet } from './clientes';
import { handleOrcamentosCreatePost } from './create';
import { handleOrcamentosDeletePost } from './delete';
import { handleOrcamentosInteracaoPost, handleOrcamentosInteracaoGet } from './interacao';
import { handleOrcamentosListGet } from './list';
import { handleOrcamentosProdutosGet } from './produtos';
import { handleOrcamentosSavePost } from './save';
import { handleOrcamentosStatusPatch } from './status';
import { handleOrcamentosTiposGet } from './tipos';

// /api/v1/orcamentos/* atendido pelo Hono (gerado por migrate_domain.py). Estáticas antes de '/:param'.
export const orcamentosRoutes = new Hono<ApiEnv>()
  .get('/cidades-busca', (c) => handleOrcamentosCidadesBuscaGet(c.env.event))
  .post('/cliente-create', (c) => handleOrcamentosClienteCreatePost(c.env.event))
  .get('/clientes', (c) => handleOrcamentosClientesGet(c.env.event))
  .post('/create', (c) => handleOrcamentosCreatePost(c.env.event))
  .post('/delete', (c) => handleOrcamentosDeletePost(c.env.event))
  .post('/interacao', (c) => handleOrcamentosInteracaoPost(c.env.event))
  .get('/interacao', (c) => handleOrcamentosInteracaoGet(c.env.event))
  // apelido: orcamentos/interaction/+server.ts reexportava GET e POST de ../interacao
  .post('/interaction', (c) => handleOrcamentosInteracaoPost(c.env.event))
  .get('/interaction', (c) => handleOrcamentosInteracaoGet(c.env.event))
  .get('/list', (c) => handleOrcamentosListGet(c.env.event))
  .get('/produtos', (c) => handleOrcamentosProdutosGet(c.env.event))
  .post('/save', (c) => handleOrcamentosSavePost(c.env.event))
  .patch('/status', (c) => handleOrcamentosStatusPatch(c.env.event))
  .get('/tipos', (c) => handleOrcamentosTiposGet(c.env.event))
  .get('/:id/resumo-venda', (c) => handleOrcamentosIdResumoVendaGet(withRouteParams(c.env.event, c.req.param())))
  .get('/:id', (c) => handleOrcamentosIdGet(withRouteParams(c.env.event, c.req.param())))
  .patch('/:id', (c) => handleOrcamentosIdPatch(withRouteParams(c.env.event, c.req.param())))
  .delete('/:id', (c) => handleOrcamentosIdDelete(withRouteParams(c.env.event, c.req.param())));
