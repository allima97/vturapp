import { Hono } from 'hono';
import type { ApiEnv } from '../../types';
import { withRouteParams } from '../../params';
import {
  handleFinanceiroAjustesVendasGet,
  handleFinanceiroAjustesVendasPost
} from './ajustes-vendas';
import { handleFinanceiroAjustesVendasListGet } from './ajustes-vendas-list';
import { handleFinanceiroAjustesVendasSavePost } from './ajustes-vendas-save';
import { handleFinanceiroCaixaGet, handleFinanceiroCaixaPost } from './caixa';
import { handleFinanceiroComissoesGet } from './comissoes';
import {
  handleFinanceiroComissoesCalcularPost,
  handleFinanceiroComissoesCalcularGet
} from './comissoes-calcular';
import {
  handleFinanceiroComissoesPagamentoPost,
  handleFinanceiroComissoesPagamentoPut,
  handleFinanceiroComissoesPagamentoDelete
} from './comissoes-pagamento';
import {
  handleFinanceiroComissoesRegrasGet,
  handleFinanceiroComissoesRegrasPost,
  handleFinanceiroComissoesRegrasPut,
  handleFinanceiroComissoesRegrasDelete
} from './comissoes-regras';
import {
  handleFinanceiroComissoesVendedoresGet,
  handleFinanceiroComissoesVendedoresPost
} from './comissoes-vendedores';
import {
  handleFinanceiroFormasPagamentoGet,
  handleFinanceiroFormasPagamentoPost,
  handleFinanceiroFormasPagamentoPatch,
  handleFinanceiroFormasPagamentoDelete
} from './formas-pagamento';
import {
  handleFinanceiroComissoesRegrasIdGet,
  handleFinanceiroComissoesRegrasIdPut,
  handleFinanceiroComissoesRegrasIdDelete
} from './comissoes-regras-id';

// /api/v1/financeiro/* atendido pelo Hono (gerado por migrate_domain.py). Estáticas antes de '/:param'.
export const financeiroRoutes = new Hono<ApiEnv>()
  .get('/ajustes-vendas/list', (c) => handleFinanceiroAjustesVendasListGet(c.env.event))
  .post('/ajustes-vendas/save', (c) => handleFinanceiroAjustesVendasSavePost(c.env.event))
  .post('/comissoes/calcular', (c) => handleFinanceiroComissoesCalcularPost(c.env.event))
  .get('/comissoes/calcular', (c) => handleFinanceiroComissoesCalcularGet(c.env.event))
  .post('/comissoes/pagamento', (c) => handleFinanceiroComissoesPagamentoPost(c.env.event))
  .put('/comissoes/pagamento', (c) => handleFinanceiroComissoesPagamentoPut(c.env.event))
  .delete('/comissoes/pagamento', (c) => handleFinanceiroComissoesPagamentoDelete(c.env.event))
  .get('/comissoes/regras', (c) => handleFinanceiroComissoesRegrasGet(c.env.event))
  .post('/comissoes/regras', (c) => handleFinanceiroComissoesRegrasPost(c.env.event))
  .put('/comissoes/regras', (c) => handleFinanceiroComissoesRegrasPut(c.env.event))
  .delete('/comissoes/regras', (c) => handleFinanceiroComissoesRegrasDelete(c.env.event))
  .get('/comissoes/vendedores', (c) => handleFinanceiroComissoesVendedoresGet(c.env.event))
  .post('/comissoes/vendedores', (c) => handleFinanceiroComissoesVendedoresPost(c.env.event))
  .get('/ajustes-vendas', (c) => handleFinanceiroAjustesVendasGet(c.env.event))
  .post('/ajustes-vendas', (c) => handleFinanceiroAjustesVendasPost(c.env.event))
  .get('/caixa', (c) => handleFinanceiroCaixaGet(c.env.event))
  .post('/caixa', (c) => handleFinanceiroCaixaPost(c.env.event))
  .get('/comissoes', (c) => handleFinanceiroComissoesGet(c.env.event))
  .get('/formas-pagamento', (c) => handleFinanceiroFormasPagamentoGet(c.env.event))
  .post('/formas-pagamento', (c) => handleFinanceiroFormasPagamentoPost(c.env.event))
  .patch('/formas-pagamento', (c) => handleFinanceiroFormasPagamentoPatch(c.env.event))
  .delete('/formas-pagamento', (c) => handleFinanceiroFormasPagamentoDelete(c.env.event))
  // rota profunda migrada no lote 3 (antes ficava no SvelteKit: +8 níveis de pasta no Windows)
  .get('/comissoes/regras/:id', (c) =>
    handleFinanceiroComissoesRegrasIdGet(withRouteParams(c.env.event, c.req.param()))
  )
  .put('/comissoes/regras/:id', (c) =>
    handleFinanceiroComissoesRegrasIdPut(withRouteParams(c.env.event, c.req.param()))
  )
  .delete('/comissoes/regras/:id', (c) =>
    handleFinanceiroComissoesRegrasIdDelete(withRouteParams(c.env.event, c.req.param()))
  );
