import { Hono } from 'hono';
import type { ApiEnv } from '../../types';
import { withRouteParams } from '../../params';
import { handleVendasKpis } from './kpis';
import { handleVendasStatusPatch } from './status';
import { handleVendasGet } from './root';
import { handleVendasCadastroBaseGet } from './cadastro-base';
import { handleVendasCadastroSavePost } from './cadastro-save';
import { handleVendasCancelPost } from './cancel';
import { handleVendasCidadesBuscaGet } from './cidades-busca';
import { handleVendasComplementaresGet } from './complementares';
import { handleVendasCreatePost } from './create';
import { handleVendasGestorEquipeGet } from './gestor-equipe';
import { handleVendasListGet } from './list';
import { handleVendasMergePost } from './merge';
import { handleVendasMergeCandidatesGet } from './merge-candidates';
import { handleVendasReciboComplementarLinkPost } from './recibo-complementar-link';
import { handleVendasReciboComplementarRemovePost } from './recibo-complementar-remove';
import { handleVendasReciboDeletePost } from './recibo-delete';
import { handleVendasReciboEditPatch } from './recibo-edit';
import { handleVendasReciboNotasGet } from './recibo-notas';
import { handleVendasReciboPrincipalPost } from './recibo-principal';
import { handleVendasIdRankingRecibosGet } from './id-ranking-recibos';
import { handleVendasIdGet, handleVendasIdPatch, handleVendasIdDelete } from './id';

// /api/v1/vendas/* — TODAS as rotas de vendas atendidas pelo Hono.
// Ordem importa: rotas estáticas antes de '/:id'.
export const vendasRoutes = new Hono<ApiEnv>()
  .get('/kpis', (c) => handleVendasKpis(c.env.event))
  .patch('/status', (c) => handleVendasStatusPatch(c.env.event))
  .get('/', (c) => handleVendasGet(c.env.event))
  .get('/cadastro-base', (c) => handleVendasCadastroBaseGet(c.env.event))
  .post('/cadastro-save', (c) => handleVendasCadastroSavePost(c.env.event))
  .post('/cancel', (c) => handleVendasCancelPost(c.env.event))
  .get('/cidades-busca', (c) => handleVendasCidadesBuscaGet(c.env.event))
  .get('/complementares', (c) => handleVendasComplementaresGet(c.env.event))
  .post('/create', (c) => handleVendasCreatePost(c.env.event))
  .get('/gestor-equipe', (c) => handleVendasGestorEquipeGet(c.env.event))
  .get('/list', (c) => handleVendasListGet(c.env.event))
  .post('/merge', (c) => handleVendasMergePost(c.env.event))
  .get('/merge-candidates', (c) => handleVendasMergeCandidatesGet(c.env.event))
  .post('/recibo-complementar-link', (c) => handleVendasReciboComplementarLinkPost(c.env.event))
  .post('/recibo-complementar-remove', (c) => handleVendasReciboComplementarRemovePost(c.env.event))
  .post('/recibo-delete', (c) => handleVendasReciboDeletePost(c.env.event))
  .patch('/recibo-edit', (c) => handleVendasReciboEditPatch(c.env.event))
  .get('/recibo-notas', (c) => handleVendasReciboNotasGet(c.env.event))
  .post('/recibo-principal', (c) => handleVendasReciboPrincipalPost(c.env.event))
  .get('/:id/ranking-recibos', (c) => handleVendasIdRankingRecibosGet(withRouteParams(c.env.event, c.req.param())))
  .get('/:id', (c) => handleVendasIdGet(withRouteParams(c.env.event, c.req.param())))
  .patch('/:id', (c) => handleVendasIdPatch(withRouteParams(c.env.event, c.req.param())))
  .delete('/:id', (c) => handleVendasIdDelete(withRouteParams(c.env.event, c.req.param())));
