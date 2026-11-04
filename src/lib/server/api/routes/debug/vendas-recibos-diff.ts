// Migrado para Hono de src/routes/api/v1/debug/vendas-recibos-diff/+server.ts — corpo IDÊNTICO ao original
// (só nome/assinatura do handler e caminhos de import mudaram). Ver src/lib/server/api/app.ts.
import type { RequestEvent } from '@sveltejs/kit';
import { json } from '@sveltejs/kit';
import {
  ensureModuloAccess,
  getAdminClient,
  isDebugEndpointEnabled,
  NO_MATCH_COMPANY_ID,
  requireAuthenticatedUser,
  resolveAccessibleClientIds,
  resolveScopedCompanyIds,
  resolveScopedVendedorIds,
  resolveUserScope,
  toErrorResponse,
  parseIntSafe
} from '$lib/server/v1';
import { fetchVendasKpiReciboContributions } from '$lib/server/vendas-kpis';
import { NO_STORE_HEADERS } from '$lib/server/httpCache';

const DEBUG_HEADERS = NO_STORE_HEADERS;
const MAX_DEBUG_ITEMS = 500;
const ISO_DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/;

function debugJson(body: unknown, init?: ResponseInit) {
  const headers = new Headers(init?.headers);
  for (const [key, value] of Object.entries(DEBUG_HEADERS)) headers.set(key, value);
  return json(body, { ...init, headers });
}

function isISODate(value: string) {
  return ISO_DATE_PATTERN.test(String(value || '').trim());
}

export async function handleDebugVendasRecibosDiffGet(event: RequestEvent) {
  try {
    if (!isDebugEndpointEnabled(event)) {
      return debugJson({ error: 'Not found' }, { status: 404 });
    }

    const client = getAdminClient();
    const user = await requireAuthenticatedUser(event);
    const scope = await resolveUserScope(client, user.id);

    if (!scope.isAdmin && !scope.isMaster) {
      return debugJson({ error: 'Sem acesso ao diagnóstico de vendas.' }, { status: 403 });
    }
    if (!scope.isAdmin) {
      ensureModuloAccess(scope, ['vendas_consulta', 'vendas'], 1, 'Sem acesso a Vendas.');
    }

    const { searchParams } = event.url;
    const inicio = String(searchParams.get('inicio') || '').trim();
    const fim = String(searchParams.get('fim') || '').trim();
    if (!isISODate(inicio) || !isISODate(fim) || inicio > fim) {
      return debugJson({ error: 'Informe um período válido em inicio/fim.' }, { status: 400 });
    }

    const companyIds = resolveScopedCompanyIds(
      scope,
      searchParams.get('empresa_id') || searchParams.get('company_id')
    );
    const requestedVendedorRaw =
      searchParams.get('vendedor_ids') || searchParams.get('vendedor_id');
    const hasRequestedVendedorFilter = String(requestedVendedorRaw || '').trim().length > 0;
    const scopedVendedorIds = await resolveScopedVendedorIds(client, scope, requestedVendedorRaw);
    const vendedorIds =
      hasRequestedVendedorFilter && scopedVendedorIds.length === 0
        ? [NO_MATCH_COMPANY_ID]
        : scopedVendedorIds;
    const accessibleClientIds = !scope.isAdmin
      ? await resolveAccessibleClientIds(client, { companyIds, vendedorIds })
      : [];

    const requestedLimit = parseIntSafe(searchParams.get('limit'), MAX_DEBUG_ITEMS);
    const maxItems = Math.max(1, Math.min(requestedLimit, MAX_DEBUG_ITEMS));

    const payload = await fetchVendasKpiReciboContributions(client, {
      dataInicio: inicio,
      dataFim: fim,
      companyIds,
      vendedorIds,
      accessibleClientIds
    });

    const sorted = [...payload.contributions].sort((a, b) => b.bruto - a.bruto);

    return debugJson({
      periodo: { inicio, fim },
      agg: payload.agg,
      totalContribuicoes: payload.contributions.length,
      contribuicoesTruncadas: payload.contributions.length > maxItems,
      contribuicoes: sorted.slice(0, maxItems)
    });
  } catch (err) {
    const response = toErrorResponse(err, 'Erro ao gerar diff de recibos de vendas.');
    for (const [key, value] of Object.entries(DEBUG_HEADERS)) response.headers.set(key, value);
    return response;
  }
}
