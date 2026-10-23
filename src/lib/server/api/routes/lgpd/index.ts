import { Hono } from 'hono';
import type { ApiEnv } from '../../types';
import { handleLgpdSolicitarPost } from './solicitar';
import { handleLgpdMeusDadosGet } from './meus-dados';
import { handleLgpdSolicitacoesGet, handleLgpdSolicitacaoAtualizar } from './admin-solicitacoes';
import { handleLgpdAtividadesGet } from './atividades';
import { handleLgpdAnonimizarPost } from './anonimizar';

// /api/v1/lgpd/* — endpoints de conformidade LGPD (Lei 13.709/2018)
export const lgpdRoutes = new Hono<ApiEnv>()
  // Titulares: exercício de direitos (Art. 18)
  .post('/solicitar', (c) => handleLgpdSolicitarPost(c.env.event))
  .get('/meus-dados', (c) => handleLgpdMeusDadosGet(c.env.event))
  // Admin: gestão de solicitações
  .get('/admin/solicitacoes', (c) => handleLgpdSolicitacoesGet(c.env.event))
  .patch('/admin/solicitacoes/:id', (c) => handleLgpdSolicitacaoAtualizar(c.env.event, c.req.param('id')))
  // Admin: ROPA - Registro de Atividades de Tratamento (Art. 37)
  .get('/admin/atividades', (c) => handleLgpdAtividadesGet(c.env.event))
  // Admin: Anonimização de titular (Art. 18, IV/VI)
  .post('/admin/anonimizar', (c) => handleLgpdAnonimizarPost(c.env.event));
