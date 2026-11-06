// Migrado para Hono de src/routes/api/v1/relatorios/vendas-por-cliente/+server.ts — corpo IDÊNTICO ao original
// (só nome/assinatura do handler e caminhos de import mudaram). Ver src/lib/server/api/app.ts.
import type { RequestEvent } from '@sveltejs/kit';
import { forwardLegacyReportGET } from '../../../../../routes/api/v1/relatorios/_legacyForward';
import { handleRelatoriosClientesGet as clientesGET } from './clientes';

export async function handleRelatoriosVendasPorClienteGet(event: RequestEvent) {
  return forwardLegacyReportGET(event, clientesGET);
}
