import { Hono } from 'hono';
import type { ApiEnv } from '../../types';
import {
  handleOperacaoCampanhasGet,
  handleOperacaoCampanhasPost,
  handleOperacaoCampanhasDelete
} from './campanhas';
import {
  handleOperacaoDocumentosViagensGet,
  handleOperacaoDocumentosViagensDelete
} from './documentos-viagens';
import {
  handleOperacaoPreferenciasGet,
  handleOperacaoPreferenciasPost,
  handleOperacaoPreferenciasDelete,
  handleOperacaoPreferenciasPatch
} from './preferencias';
import {
  handleOperacaoRecadosGet,
  handleOperacaoRecadosPost,
  handleOperacaoRecadosDelete
} from './recados';
import { handleOperacaoSacGet, handleOperacaoSacPost, handleOperacaoSacDelete } from './sac';

// /api/v1/operacao/* atendido pelo Hono (gerado por migrate_domain.py). Estáticas antes de '/:param'.
export const operacaoRoutes = new Hono<ApiEnv>()
  .get('/campanhas', (c) => handleOperacaoCampanhasGet(c.env.event))
  .post('/campanhas', (c) => handleOperacaoCampanhasPost(c.env.event))
  .delete('/campanhas', (c) => handleOperacaoCampanhasDelete(c.env.event))
  .get('/documentos-viagens', (c) => handleOperacaoDocumentosViagensGet(c.env.event))
  .delete('/documentos-viagens', (c) => handleOperacaoDocumentosViagensDelete(c.env.event))
  .get('/preferencias', (c) => handleOperacaoPreferenciasGet(c.env.event))
  .post('/preferencias', (c) => handleOperacaoPreferenciasPost(c.env.event))
  .delete('/preferencias', (c) => handleOperacaoPreferenciasDelete(c.env.event))
  .patch('/preferencias', (c) => handleOperacaoPreferenciasPatch(c.env.event))
  .get('/recados', (c) => handleOperacaoRecadosGet(c.env.event))
  .post('/recados', (c) => handleOperacaoRecadosPost(c.env.event))
  .delete('/recados', (c) => handleOperacaoRecadosDelete(c.env.event))
  .get('/sac', (c) => handleOperacaoSacGet(c.env.event))
  .post('/sac', (c) => handleOperacaoSacPost(c.env.event))
  .delete('/sac', (c) => handleOperacaoSacDelete(c.env.event));
