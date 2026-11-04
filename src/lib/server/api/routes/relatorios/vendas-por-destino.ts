// Migrado para Hono de src/routes/api/v1/relatorios/vendas-por-destino/+server.ts — corpo IDÊNTICO ao original
// (só nome/assinatura do handler e caminhos de import mudaram). Ver src/lib/server/api/app.ts.
import type { RequestEvent } from '@sveltejs/kit';
import { forwardLegacyReportGET } from '../../../../../routes/api/v1/relatorios/_legacyForward';
import { handleRelatoriosDestinosGet as destinosGET } from './destinos';

export async function handleRelatoriosVendasPorDestinoGet(event: RequestEvent) {
  return forwardLegacyReportGET(event, destinosGET);
}
