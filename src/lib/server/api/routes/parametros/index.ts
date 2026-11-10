import { Hono } from 'hono';
import type { ApiEnv } from '../../types';
import {
  handleParametrosCambiosGet,
  handleParametrosCambiosPost,
  handleParametrosCambiosDelete
} from './cambios';
import {
  handleParametrosCommissionRulesGet,
  handleParametrosCommissionRulesPost,
  handleParametrosCommissionRulesPatch,
  handleParametrosCommissionRulesDelete
} from './commission-rules';
import { handleParametrosEmpresaGet, handleParametrosEmpresaPatch } from './empresa';
import { handleParametrosEquipeGet, handleParametrosEquipePost } from './equipe';
import { handleParametrosEscalasGet, handleParametrosEscalasPost } from './escalas';
import {
  handleParametrosMetasGet,
  handleParametrosMetasPost,
  handleParametrosMetasDelete
} from './metas';
import {
  handleParametrosNaoComissionaveisGet,
  handleParametrosNaoComissionaveisPost,
  handleParametrosNaoComissionaveisDelete
} from './nao-comissionaveis';
import {
  handleParametrosOrcamentosPdfGet,
  handleParametrosOrcamentosPdfPost
} from './orcamentos-pdf';
import {
  handleParametrosRegrasProdutoGet,
  handleParametrosRegrasProdutoPost,
  handleParametrosRegrasProdutoDelete
} from './regras-produto';
import {
  handleParametrosRegrasProdutoPacoteGet,
  handleParametrosRegrasProdutoPacotePost,
  handleParametrosRegrasProdutoPacoteDelete
} from './regras-produto-pacote';
import { handleParametrosSistemaGet, handleParametrosSistemaPost } from './sistema';
import {
  handleParametrosTipoPacotesGet,
  handleParametrosTipoPacotesPost,
  handleParametrosTipoPacotesDelete
} from './tipo-pacotes';

// /api/v1/parametros/* atendido pelo Hono (gerado por migrate_domain.py). Estáticas antes de '/:param'.
export const parametrosRoutes = new Hono<ApiEnv>()
  .get('/cambios', (c) => handleParametrosCambiosGet(c.env.event))
  .post('/cambios', (c) => handleParametrosCambiosPost(c.env.event))
  .delete('/cambios', (c) => handleParametrosCambiosDelete(c.env.event))
  .get('/commission-rules', (c) => handleParametrosCommissionRulesGet(c.env.event))
  .post('/commission-rules', (c) => handleParametrosCommissionRulesPost(c.env.event))
  .patch('/commission-rules', (c) => handleParametrosCommissionRulesPatch(c.env.event))
  .delete('/commission-rules', (c) => handleParametrosCommissionRulesDelete(c.env.event))
  .get('/empresa', (c) => handleParametrosEmpresaGet(c.env.event))
  .patch('/empresa', (c) => handleParametrosEmpresaPatch(c.env.event))
  .get('/equipe', (c) => handleParametrosEquipeGet(c.env.event))
  .post('/equipe', (c) => handleParametrosEquipePost(c.env.event))
  .get('/escalas', (c) => handleParametrosEscalasGet(c.env.event))
  .post('/escalas', (c) => handleParametrosEscalasPost(c.env.event))
  .get('/metas', (c) => handleParametrosMetasGet(c.env.event))
  .post('/metas', (c) => handleParametrosMetasPost(c.env.event))
  .delete('/metas', (c) => handleParametrosMetasDelete(c.env.event))
  .get('/nao-comissionaveis', (c) => handleParametrosNaoComissionaveisGet(c.env.event))
  .post('/nao-comissionaveis', (c) => handleParametrosNaoComissionaveisPost(c.env.event))
  .delete('/nao-comissionaveis', (c) => handleParametrosNaoComissionaveisDelete(c.env.event))
  .get('/orcamentos-pdf', (c) => handleParametrosOrcamentosPdfGet(c.env.event))
  .post('/orcamentos-pdf', (c) => handleParametrosOrcamentosPdfPost(c.env.event))
  .get('/regras-produto', (c) => handleParametrosRegrasProdutoGet(c.env.event))
  .post('/regras-produto', (c) => handleParametrosRegrasProdutoPost(c.env.event))
  .delete('/regras-produto', (c) => handleParametrosRegrasProdutoDelete(c.env.event))
  .get('/regras-produto-pacote', (c) => handleParametrosRegrasProdutoPacoteGet(c.env.event))
  .post('/regras-produto-pacote', (c) => handleParametrosRegrasProdutoPacotePost(c.env.event))
  .delete('/regras-produto-pacote', (c) => handleParametrosRegrasProdutoPacoteDelete(c.env.event))
  .get('/sistema', (c) => handleParametrosSistemaGet(c.env.event))
  .post('/sistema', (c) => handleParametrosSistemaPost(c.env.event))
  .get('/tipo-pacotes', (c) => handleParametrosTipoPacotesGet(c.env.event))
  .post('/tipo-pacotes', (c) => handleParametrosTipoPacotesPost(c.env.event))
  .delete('/tipo-pacotes', (c) => handleParametrosTipoPacotesDelete(c.env.event));
