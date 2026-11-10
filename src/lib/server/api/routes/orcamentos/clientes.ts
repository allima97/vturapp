// Migrado para Hono de src/routes/api/v1/orcamentos/clientes/+server.ts — corpo IDÊNTICO ao original
// (só nome/assinatura do handler e caminhos de import mudaram). Ver src/lib/server/api/app.ts.
import { json, type RequestEvent } from '@sveltejs/kit';
import {
  ensureModuloAccess,
  getAdminClient,
  requireAuthenticatedUser,
  resolveAccessibleClientIds,
  resolveScopedCompanyIds,
  resolveScopedVendedorIds,
  resolveUserScope,
  toErrorResponse
} from '$lib/server/v1';
import { DYNAMIC_READ_HEADERS } from '$lib/server/httpCache';
import { canUseCompanyClienteScope, resolveCompanyClienteIds } from '$lib/server/clientes';
import {
  buildReadModelCacheKey,
  getCachedReadModel,
  READ_MODEL_TAGS,
  scopeCacheTags
} from '$lib/server/readModelCache';
import { chunkArray, QUERY_IN_BATCH_SIZE } from '$lib/utils/array';

type OrcamentoClienteRow = {
  id: string;
  nome: string | null;
  cpf: string | null;
  whatsapp: string | null;
  email: string | null;
};

const PT_BR_COLLATOR = new Intl.Collator('pt-BR');

function dedupeClientes(rows: OrcamentoClienteRow[]) {
  const map = new Map<string, OrcamentoClienteRow>();
  for (const row of rows) {
    const id = String(row?.id || '').trim();
    if (id && !map.has(id)) map.set(id, row);
  }
  return Array.from(map.values()).sort((left, right) =>
    PT_BR_COLLATOR.compare(String(left.nome || ''), String(right.nome || ''))
  );
}

export async function handleOrcamentosClientesGet(event: RequestEvent) {
  try {
    const client = getAdminClient();
    const user = await requireAuthenticatedUser(event);
    const scope = await resolveUserScope(client, user.id);

    if (!scope.isAdmin) {
      ensureModuloAccess(scope, ['orcamentos', 'vendas'], 1, 'Sem acesso a Orcamentos.');
    }

    const searchParams = event.url.searchParams;
    const companyIds = resolveScopedCompanyIds(scope, searchParams.get('company_id'));
    const vendedorIds = await resolveScopedVendedorIds(
      client,
      scope,
      searchParams.get('vendedor_id')
    );
    const useCompanyScope = canUseCompanyClienteScope(scope, searchParams.get('vendedor_id'));
    const companyClientIds =
      useCompanyScope && companyIds.length > 0
        ? await resolveCompanyClienteIds(client, companyIds)
        : null;
    const accessibleClientIds = !useCompanyScope
      ? await resolveAccessibleClientIds(client, { companyIds, vendedorIds })
      : null;
    const scopedClientIds = companyClientIds || accessibleClientIds;

    if (scopedClientIds && scopedClientIds.length === 0) {
      return json([], { headers: DYNAMIC_READ_HEADERS });
    }

    const cacheKey = buildReadModelCacheKey('orcamentos:clientes', {
      companyIds,
      vendedorIds,
      useCompanyScope,
      isAdmin: scope.isAdmin,
      userId: useCompanyScope ? null : user.id
    });
    const payload = await getCachedReadModel({
      key: cacheKey,
      tags: [
        READ_MODEL_TAGS.clients,
        READ_MODEL_TAGS.sales,
        READ_MODEL_TAGS.quote,
        ...scopeCacheTags({
          companyIds,
          vendedorIds,
          userId: useCompanyScope ? undefined : user.id
        })
      ],
      ttlMs: 120_000,
      staleTtlMs: 600_000,
      loader: async () => {
        const buildQuery = (clientIds?: string[], companyIdsFilter = companyIds) => {
          let query = client
            .from('clientes')
            .select('id, nome, cpf, whatsapp, email')
            .order('nome', { ascending: true })
            .limit(500);

          if (clientIds) {
            query = query.in('id', clientIds);
          } else if (companyIdsFilter.length > 0) {
            query = query.in('company_id', companyIdsFilter);
          }

          return query;
        };

        if (scopedClientIds && scopedClientIds.length > QUERY_IN_BATCH_SIZE) {
          const rows: OrcamentoClienteRow[] = [];
          for (const batch of chunkArray(scopedClientIds)) {
            const { data, error } = await buildQuery(batch);
            if (error) throw error;
            rows.push(...((data || []) as OrcamentoClienteRow[]));
            if (dedupeClientes(rows).length >= 500) break;
          }

          return dedupeClientes(rows).slice(0, 500);
        }

        if (!scopedClientIds && companyIds.length > QUERY_IN_BATCH_SIZE) {
          const rows: OrcamentoClienteRow[] = [];
          for (const batch of chunkArray(companyIds)) {
            const { data, error } = await buildQuery(undefined, batch);
            if (error) throw error;
            rows.push(...((data || []) as OrcamentoClienteRow[]));
            if (dedupeClientes(rows).length >= 500) break;
          }

          return dedupeClientes(rows).slice(0, 500);
        }

        const { data, error } = await buildQuery(scopedClientIds || undefined);
        if (error) throw error;
        return data || [];
      }
    });

    return json(payload, { headers: DYNAMIC_READ_HEADERS });
  } catch (err) {
    return toErrorResponse(err, 'Erro ao carregar clientes.');
  }
}
