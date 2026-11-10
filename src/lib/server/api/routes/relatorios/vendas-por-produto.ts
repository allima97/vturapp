// Migrado para Hono de src/routes/api/v1/relatorios/vendas-por-produto/+server.ts — corpo IDÊNTICO ao original
// (só nome/assinatura do handler e caminhos de import mudaram). Ver src/lib/server/api/app.ts.
import type { RequestEvent } from '@sveltejs/kit';
import { forwardLegacyReportGET } from '../../../../../routes/api/v1/relatorios/_legacyForward';
import { handleRelatoriosProdutosGet as produtosGET } from './produtos';

export async function handleRelatoriosVendasPorProdutoGet(event: RequestEvent) {
  return forwardLegacyReportGET(event, produtosGET);
}
