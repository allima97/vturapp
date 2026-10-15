import { Hono } from 'hono';
import type { ApiEnv } from '../../types';
import { handleConciliacaoGet } from './root';
import { handleConciliacaoAssignPost } from './assign';
import { handleConciliacaoChangesGet } from './changes';
import { handleConciliacaoDeleteDelete } from './delete';
import { handleConciliacaoExecutionsGet } from './executions';
import { handleConciliacaoExistingPost } from './existing';
import { handleConciliacaoFixVinculosPost } from './fix-vinculos';
import { handleConciliacaoImportPost } from './import';
import { handleConciliacaoListGet } from './list';
import { handleConciliacaoLookupPost } from './lookup';
import { handleConciliacaoOptionsGet } from './options';
import { handleConciliacaoRateioInfoGet } from './rateio-info';
import { handleConciliacaoRevertPost } from './revert';
import { handleConciliacaoRunPost } from './run';
import { handleConciliacaoSemMovimentoGet, handleConciliacaoSemMovimentoPost, handleConciliacaoSemMovimentoDelete } from './sem-movimento';
import { handleConciliacaoStatusCronologicoGet } from './status-cronologico';
import { handleConciliacaoSummaryGet } from './summary';
import { handleConciliacaoUpdateValoresPost } from './update-valores';

// /api/v1/conciliacao/* — TODAS as rotas de conciliação atendidas pelo Hono (Fase 2.2).
// Não há rotas com parâmetro; os helpers _legacy.ts/_types.ts continuam em src/routes/api/v1/conciliacao/.
export const conciliacaoRoutes = new Hono<ApiEnv>()
  .get('/', (c) => handleConciliacaoGet(c.env.event))
  .post('/assign', (c) => handleConciliacaoAssignPost(c.env.event))
  .get('/changes', (c) => handleConciliacaoChangesGet(c.env.event))
  .delete('/delete', (c) => handleConciliacaoDeleteDelete(c.env.event))
  .get('/executions', (c) => handleConciliacaoExecutionsGet(c.env.event))
  .post('/existing', (c) => handleConciliacaoExistingPost(c.env.event))
  .post('/fix-vinculos', (c) => handleConciliacaoFixVinculosPost(c.env.event))
  .post('/import', (c) => handleConciliacaoImportPost(c.env.event))
  .get('/list', (c) => handleConciliacaoListGet(c.env.event))
  .post('/lookup', (c) => handleConciliacaoLookupPost(c.env.event))
  .get('/options', (c) => handleConciliacaoOptionsGet(c.env.event))
  .get('/rateio-info', (c) => handleConciliacaoRateioInfoGet(c.env.event))
  .post('/revert', (c) => handleConciliacaoRevertPost(c.env.event))
  .post('/run', (c) => handleConciliacaoRunPost(c.env.event))
  .get('/sem-movimento', (c) => handleConciliacaoSemMovimentoGet(c.env.event))
  .post('/sem-movimento', (c) => handleConciliacaoSemMovimentoPost(c.env.event))
  .delete('/sem-movimento', (c) => handleConciliacaoSemMovimentoDelete(c.env.event))
  .get('/status-cronologico', (c) => handleConciliacaoStatusCronologicoGet(c.env.event))
  .get('/summary', (c) => handleConciliacaoSummaryGet(c.env.event))
  .post('/update-valores', (c) => handleConciliacaoUpdateValoresPost(c.env.event));
