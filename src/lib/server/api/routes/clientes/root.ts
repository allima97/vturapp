// Migrado para Hono de src/routes/api/v1/clientes/+server.ts — corpo IDÊNTICO ao original
// (só nome/assinatura do handler e caminhos de import mudaram). Ver src/lib/server/api/app.ts.
import type { RequestEvent } from '@sveltejs/kit';
import { json } from '@sveltejs/kit';
import {
  getAdminClient,
  requireAuthenticatedUser,
  resolveAccessibleClientIds,
  resolveScopedCompanyIds,
  resolveScopedVendedorIds,
  resolveUserScope,
  sanitizePostgrestSearchTerm,
  toErrorResponse
} from '$lib/server/v1';
import { DYNAMIC_READ_HEADERS } from '$lib/server/httpCache';
import {
  canUseCompanyClienteScope,
  ensureClienteModuloAccess,
  resolveCompanyClienteIds
} from '$lib/server/clientes';
import { chunkArray, QUERY_IN_BATCH_SIZE } from '$lib/utils/array';

type ClienteLookupRow = {
  id: string;
  nome: string | null;
  cpf: string | null;
  telefone: string | null;
  email: string | null;
  whatsapp: string | null;
  company_id: string | null;
};

const PT_BR_COLLATOR = new Intl.Collator('pt-BR');

function dedupeClientes(rows: ClienteLookupRow[]) {
  const map = new Map<string, ClienteLookupRow>();
  for (const row of rows) {
    const id = String(row?.id || '').trim();
    if (id && !map.has(id)) map.set(id, row);
  }
  return Array.from(map.values()).sort((left, right) =>
    PT_BR_COLLATOR.compare(String(left.nome || ''), String(right.nome || ''))
  );
}

export async function handleClientesGet(event: RequestEvent) {
  try {
    const client = getAdminClient();
    const user = await requireAuthenticatedUser(event);
    const scope = await resolveUserScope(client, user.id);

    if (!scope.isAdmin) {
      ensureClienteModuloAccess(scope, 1, 'Sem acesso a Clientes.');
    }

    const rawSearch = sanitizePostgrestSearchTerm(
      event.url.searchParams.get('search')
    ).toLowerCase();
    const search = rawSearch.length >= 2 ? rawSearch : '';
    const companyIds = resolveScopedCompanyIds(scope, event.url.searchParams.get('empresa_id'));
    const requestedVendedorRaw = event.url.searchParams.get('vendedor_id');
    const vendedorIds = await resolveScopedVendedorIds(client, scope, requestedVendedorRaw);
    const canUseCompanyScope = canUseCompanyClienteScope(scope, requestedVendedorRaw);
    const companyClientIds =
      canUseCompanyScope && companyIds.length > 0
        ? await resolveCompanyClienteIds(client, companyIds)
        : null;
    const accessibleClientIds = canUseCompanyScope
      ? null
      : await resolveAccessibleClientIds(client, { companyIds, vendedorIds });
    const scopedClientIds = companyClientIds || accessibleClientIds;

    if (scopedClientIds && scopedClientIds.length === 0) {
      return json({ items: [], total: 0 }, { headers: DYNAMIC_READ_HEADERS });
    }

    const buildQuery = (clientIds?: string[], companyIdsFilter = companyIds) => {
      let query = client
        .from('clientes')
        .select('id, nome, cpf, telefone, email, whatsapp, company_id')
        .order('nome', { ascending: true })
        .limit(search ? 50 : 300);

      if (clientIds) {
        query = query.in('id', clientIds);
      } else if (companyIdsFilter.length > 0) {
        query = query.in('company_id', companyIdsFilter);
      }

      if (search) {
        query = query.or(
          `nome.ilike.%${search}%,email.ilike.%${search}%,cpf.ilike.%${search}%,telefone.ilike.%${search}%`
        );
      }

      return query;
    };

    const fetchClientes = async () => {
      if (scopedClientIds) {
        if (scopedClientIds.length <= QUERY_IN_BATCH_SIZE) {
          return buildQuery(scopedClientIds);
        }

        const rows: ClienteLookupRow[] = [];
        for (const batch of chunkArray(scopedClientIds)) {
          const result = await buildQuery(batch);
          if (result.error) {
            return { data: null, error: result.error } as typeof result;
          }
          rows.push(...((result.data || []) as unknown as ClienteLookupRow[]));
        }

        return { data: dedupeClientes(rows).slice(0, search ? 50 : 300), error: null };
      }

      if (companyIds.length > QUERY_IN_BATCH_SIZE) {
        const rows: ClienteLookupRow[] = [];
        for (const batch of chunkArray(companyIds)) {
          const result = await buildQuery(undefined, batch);
          if (result.error) {
            return { data: null, error: result.error } as typeof result;
          }
          rows.push(...((result.data || []) as unknown as ClienteLookupRow[]));
          if (dedupeClientes(rows).length >= (search ? 50 : 300)) break;
        }

        return { data: dedupeClientes(rows).slice(0, search ? 50 : 300), error: null };
      }

      return buildQuery();
    };

    const { data, error } = await fetchClientes();
    if (error) throw error;

    return json({ items: data || [], total: data?.length || 0 }, { headers: DYNAMIC_READ_HEADERS });
  } catch (err) {
    return toErrorResponse(err, 'Erro ao carregar clientes.');
  }
}
