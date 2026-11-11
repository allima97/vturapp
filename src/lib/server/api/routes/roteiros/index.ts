import { Hono } from 'hono';
import type { ApiEnv } from '../../types';
import { withRouteParams } from '../../params';
import {
  handleRoteirosGet,
  handleRoteirosPost,
  handleRoteirosDelete,
  handleRoteirosPatch
} from './root';
import { handleRoteirosIdGet } from './id';
import { handleRoteirosDeleteDelete } from './delete';
import { handleRoteirosDiasBuscaGet } from './dias-busca';
import { handleRoteirosGerarOrcamentoPost } from './gerar-orcamento';
import { handleRoteirosListGet } from './list';
import { handleRoteirosSavePost } from './save';
import { handleRoteirosSugestoesBuscaGet } from './sugestoes-busca';
import { handleRoteirosSugestoesRemoverPost } from './sugestoes-remover';
import { handleRoteirosSugestoesSalvarPost } from './sugestoes-salvar';
import { handleRoteirosCidadesBuscaGet } from './cidades-busca';
import { handleRoteirosDescricoesDiaGet } from './descricoes-dia';

// /api/v1/roteiros/* atendido pelo Hono (gerado por migrate_domain.py). Estáticas antes de '/:param'.
export const roteirosRoutes = new Hono<ApiEnv>()
  .get('/', (c) => handleRoteirosGet(c.env.event))
  .post('/', (c) => handleRoteirosPost(c.env.event))
  .delete('/', (c) => handleRoteirosDelete(c.env.event))
  .patch('/', (c) => handleRoteirosPatch(c.env.event))
  .delete('/delete', (c) => handleRoteirosDeleteDelete(c.env.event))
  .get('/cidades-busca', (c) => handleRoteirosCidadesBuscaGet(c.env.event))
  .get('/dias-busca', (c) => handleRoteirosDiasBuscaGet(c.env.event))
  .get('/descricoes-dia', (c) => handleRoteirosDescricoesDiaGet(c.env.event))
  .post('/gerar-orcamento', (c) => handleRoteirosGerarOrcamentoPost(c.env.event))
  .get('/list', (c) => handleRoteirosListGet(c.env.event))
  .post('/save', (c) => handleRoteirosSavePost(c.env.event))
  .get('/sugestoes-busca', (c) => handleRoteirosSugestoesBuscaGet(c.env.event))
  .post('/sugestoes-remover', (c) => handleRoteirosSugestoesRemoverPost(c.env.event))
  .post('/sugestoes-salvar', (c) => handleRoteirosSugestoesSalvarPost(c.env.event))
  .get('/:id', (c) => handleRoteirosIdGet(withRouteParams(c.env.event, c.req.param())));
