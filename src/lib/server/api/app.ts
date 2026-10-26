/**
 * App Hono da API /api/v1 (Fase 2 — migração incremental).
 *
 * Como funciona a convivência com as rotas SvelteKit atuais:
 *  - Rotas AINDA NÃO migradas continuam nos seus +server.ts de sempre.
 *  - Rota migrada: o handler vai para src/lib/server/api/routes/** e o
 *    +server.ts dela passa a só repassar para este app (apiHandler).
 *  - src/routes/api/v1/[...path]/+server.ts também repassa para cá; como o
 *    SvelteKit sempre prefere a rota mais específica, ele só é usado quando o
 *    +server.ts específico não existe (ex.: depois de apagado).
 *
 * Regra de ouro: rota migrada mantém URL, métodos, status, corpo JSON e
 * headers de cache exatamente iguais (ver docs/api-inventory.json e os testes
 * em src/lib/server/api/routes/**\/*.test.ts).
 */
import { Hono } from 'hono';
import { handleApiError, handleNotFound, requestContext } from './middleware';
import type { ApiEnv } from './types';
import { healthRoutes } from './routes/health';
import { vendasRoutes } from './routes/vendas';

import { dashboardRoutes } from './routes/dashboard';
import { relatoriosRoutes } from './routes/relatorios';
import { clientesRoutes } from './routes/clientes';
import { financeiroRoutes } from './routes/financeiro';
import { adminRoutes } from './routes/admin';
import { orcamentosRoutes } from './routes/orcamentos';
import { parametrosRoutes } from './routes/parametros';
import { roteirosRoutes } from './routes/roteiros';
import { viagensRoutes } from './routes/viagens';
import { preferenciasRoutes } from './routes/preferencias';
import { agendaRoutes } from './routes/agenda';
import { documentosViagensRoutes } from './routes/documentos-viagens';
import { operacaoRoutes } from './routes/operacao';
import { produtosRoutes } from './routes/produtos';
import { cardsRoutes } from './routes/cards';
import { muralRoutes } from './routes/mural';
import { todoRoutes } from './routes/todo';
import { vouchersRoutes } from './routes/vouchers';
import { fornecedoresRoutes } from './routes/fornecedores';
import { pagamentosRoutes } from './routes/pagamentos';
import { tarefasRoutes } from './routes/tarefas';
import { cidadesRoutes } from './routes/cidades';
import { circuitosRoutes } from './routes/circuitos';
import { consultoriasRoutes } from './routes/consultorias';
import { convitesRoutes } from './routes/convites';
import { crmRoutes } from './routes/crm';
import { cronRoutes } from './routes/cron';
import { debugRoutes } from './routes/debug';
import { pushRoutes } from './routes/push';
import { userRoutes } from './routes/user';
import { clientErrorRoutes } from './routes/client-error';
import { debugComissaoRoutes } from './routes/debug-comissao';
import { documentacaoRoutes } from './routes/documentacao';
import { enderecosRoutes } from './routes/enderecos';
import { equipeRoutes } from './routes/equipe';
import { menuRoutes } from './routes/menu';
import { paisesRoutes } from './routes/paises';
import { profileRoutes } from './routes/profile';
import { qrRoutes } from './routes/qr';
import { readModelRoutes } from './routes/read-model';
import { subdivisoesRoutes } from './routes/subdivisoes';
import { tipoProdutosRoutes } from './routes/tipo-produtos';
import { usersRoutes } from './routes/users';
import { voucherAssetsRoutes } from './routes/voucher-assets';
import { welcomeEmailRoutes } from './routes/welcome-email';
import { lgpdRoutes } from './routes/lgpd';
import { r2ProofRoutes } from './routes/r2-proof';
import { emailProofRoutes } from './routes/email-proof';

export function createApiApp() {
  const app = new Hono<ApiEnv>().basePath('/api/v1');

  app.use('*', requestContext);
  app.onError((err, c) => {
    const res = handleApiError(err, c.get('requestId'));
    return res;
  });
  app.notFound(() => handleNotFound());

  app.route('/health', healthRoutes);
  app.route('/vendas', vendasRoutes);
  app.route('/dashboard', dashboardRoutes);
  app.route('/relatorios', relatoriosRoutes);
  app.route('/clientes', clientesRoutes);
  app.route('/financeiro', financeiroRoutes);
  app.route('/admin', adminRoutes);
  app.route('/orcamentos', orcamentosRoutes);
  app.route('/parametros', parametrosRoutes);
  app.route('/roteiros', roteirosRoutes);
  app.route('/viagens', viagensRoutes);
  app.route('/preferencias', preferenciasRoutes);
  app.route('/agenda', agendaRoutes);
  app.route('/documentos-viagens', documentosViagensRoutes);
  app.route('/operacao', operacaoRoutes);
  app.route('/produtos', produtosRoutes);
  app.route('/cards', cardsRoutes);
  app.route('/mural', muralRoutes);
  app.route('/todo', todoRoutes);
  app.route('/vouchers', vouchersRoutes);
  app.route('/fornecedores', fornecedoresRoutes);
  app.route('/pagamentos', pagamentosRoutes);
  app.route('/tarefas', tarefasRoutes);
  app.route('/cidades', cidadesRoutes);
  app.route('/circuitos', circuitosRoutes);
  app.route('/consultorias', consultoriasRoutes);
  app.route('/convites', convitesRoutes);
  app.route('/crm', crmRoutes);
  app.route('/cron', cronRoutes);
  app.route('/debug', debugRoutes);
  app.route('/push', pushRoutes);
  app.route('/user', userRoutes);
  app.route('/client-error', clientErrorRoutes);
  app.route('/debug-comissao', debugComissaoRoutes);
  app.route('/documentacao', documentacaoRoutes);
  app.route('/enderecos', enderecosRoutes);
  app.route('/equipe', equipeRoutes);
  app.route('/menu', menuRoutes);
  app.route('/paises', paisesRoutes);
  app.route('/profile', profileRoutes);
  app.route('/qr', qrRoutes);
  app.route('/read-model', readModelRoutes);
  app.route('/subdivisoes', subdivisoesRoutes);
  app.route('/tipo-produtos', tipoProdutosRoutes);
  app.route('/users', usersRoutes);
  app.route('/voucher-assets', voucherAssetsRoutes);
  app.route('/welcome-email', welcomeEmailRoutes);
  app.route('/lgpd', lgpdRoutes);
  app.route('/r2-proof', r2ProofRoutes); // F1-05 — remover em produção após F2-03
  app.route('/email-proof', emailProofRoutes); // F1-07 — remover em produção após F2-03

  return app;
}

export const apiApp = createApiApp();
