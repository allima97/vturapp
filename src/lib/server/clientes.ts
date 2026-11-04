import type { DataClient } from '$lib/server/data';
import { error } from '@sveltejs/kit';
import {
  buildReadModelCacheKey,
  READ_MODEL_TAGS,
  scopeCacheTags
} from '$lib/server/readModelCache';
import { getCachedReadModelWithKv } from '$lib/server/kvInvalidation';
import {
  ensureModuloAccess,
  normalizeText,
  resolveAccessibleClientIds,
  resolveScopedCompanyIds,
  resolveScopedVendedorIds,
  type UserScope
} from '$lib/server/v1';
import { diffDaysISODate, parseISODateParts, todayISODateLocal } from '$lib/date';
import { chunkArray, uniqueCleanStrings } from '$lib/utils/array';

export type ClienteScopedFilters = {
  companyIds: string[];
  vendedorIds: string[];
  accessibleClientIds: string[] | null;
};

export function canUseCompanyClienteScope(scope: UserScope, vendedorParam?: string | null) {
  const tipoNome = String(scope.tipoNome || '').toUpperCase();

  if (scope.isAdmin || scope.isMaster) return true;
  if (scope.usoIndividual) return false;
  if ((scope.companyIds || []).length > 0 || scope.companyId) return true;

  return (
    tipoNome.includes('MASTER') || tipoNome.includes('FINANCEIRO') || tipoNome.includes('GESTOR')
  );
}

export async function resolveCompanyClienteIds(client: DataClient, companyIds: string[]) {
  const scopedCompanyIds = uniqueCleanStrings(companyIds || []).sort();
  if (scopedCompanyIds.length === 0) return [];

  // getCachedReadModelWithKv: além do cache local (por instância), reaproveita
  // o valor entre instâncias via KV (cache L2) -- ver kvInvalidation.ts. O
  // kvTtlSeconds usa o mesmo teto de 120s já aceito abaixo para o cache local
  // (ttlMs), não introduz uma nova janela de desatualização.
  return getCachedReadModelWithKv({
    key: buildReadModelCacheKey('clientes:company-client-ids', { companyIds: scopedCompanyIds }),
    tags: [
      READ_MODEL_TAGS.clients,
      READ_MODEL_TAGS.sales,
      READ_MODEL_TAGS.users,
      ...scopeCacheTags({ companyIds: scopedCompanyIds })
    ],
    ttlMs: 120_000,
    staleTtlMs: 900_000,
    kvTtlSeconds: 120,
    loader: async () => {
      // Substitui o cruzamento de lotes em JS (4 rodadas sequenciais) por
      // uma única chamada RPC (função company_cliente_ids, ver
      // dados/migrations) que reproduz a mesma lógica de OR.
      const { data, error: rpcError } = await client.rpc('company_cliente_ids', {
        p_company_ids: scopedCompanyIds
      });

      if (rpcError) throw rpcError;

      const clienteIds = new Set<string>();
      for (const row of (data || []) as Array<{ cliente_id?: string | null }>) {
        const id = String(row?.cliente_id || '').trim();
        if (id) clienteIds.add(id);
      }

      return Array.from(clienteIds);
    }
  });
}

export function diffDays(fromDateIso: string, toDate = new Date()) {
  const diff = diffDaysISODate(fromDateIso, todayISODateLocal(toDate));
  return diff ?? Number.POSITIVE_INFINITY;
}

export function deriveClienteStatus(
  row: { active?: boolean | null; ativo?: boolean | null },
  ultimaCompra: string | null
) {
  if (row.active === false || row.ativo === false) {
    return 'inativo' as const;
  }

  if (!ultimaCompra) {
    return 'prospect' as const;
  }

  return diffDays(ultimaCompra) <= 365 ? ('ativo' as const) : ('inativo' as const);
}

export function extractBirthMonthDay(value?: string | null) {
  const raw = String(value || '').trim();
  if (!raw) return null;

  const isoMatch = raw.match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (isoMatch) {
    return {
      month: Number(isoMatch[2]),
      day: Number(isoMatch[3])
    };
  }

  const brMatch = raw.match(/^(\d{2})[/-](\d{2})[/-](\d{4})$/);
  if (brMatch) {
    return {
      month: Number(brMatch[2]),
      day: Number(brMatch[1])
    };
  }

  return null;
}

export function isBirthdayToday(value?: string | null, today = new Date()) {
  const parts = extractBirthMonthDay(value);
  if (!parts) return false;
  const todayParts = parseISODateParts(todayISODateLocal(today));
  if (!todayParts) return false;
  return parts.day === todayParts.day && parts.month === todayParts.month;
}

export function formatDocumentoDisplay(value?: string | null) {
  const digits = String(value || '').replace(/\D/g, '');
  if (!digits) return '-';
  if (digits.length === 11) {
    return `${digits.slice(0, 3)}.${digits.slice(3, 6)}.${digits.slice(6, 9)}-${digits.slice(9)}`;
  }
  if (digits.length === 14) {
    return `${digits.slice(0, 2)}.${digits.slice(2, 5)}.${digits.slice(5, 8)}/${digits.slice(8, 12)}-${digits.slice(12)}`;
  }
  return value || digits;
}

export function matchesClienteBusca(
  item: Record<string, unknown>,
  busca: string,
  extraValues: Array<string | null | undefined> = []
) {
  if (!busca) return true;

  const query = normalizeText(busca);
  const digits = busca.replace(/\D/g, '');
  const haystack = [
    item.nome,
    item.email,
    item.telefone,
    item.whatsapp,
    item.cidade,
    item.estado,
    item.status,
    item.cpf,
    item.classificacao,
    item.tipo_cliente,
    item.tipo_pessoa,
    item.tags_text,
    ...extraValues
  ]
    .map((value) => normalizeText(String(value || '')))
    .join(' ');

  if (haystack.includes(query)) {
    return true;
  }

  if (!digits) return false;

  const documentoDigits = String(item.cpf || '').replace(/\D/g, '');
  const phoneDigits = `${String(item.telefone || '')} ${String(item.whatsapp || '')}`.replace(
    /\D/g,
    ''
  );
  return documentoDigits.includes(digits) || phoneDigits.includes(digits);
}

export async function resolveClienteScopedFilters(
  client: DataClient,
  scope: UserScope,
  companyParam?: string | null,
  vendedorParam?: string | null
): Promise<ClienteScopedFilters> {
  const companyIds = resolveScopedCompanyIds(scope, companyParam);
  const vendedorIds = await resolveScopedVendedorIds(client, scope, vendedorParam);
  const canUseCompanyScope = canUseCompanyClienteScope(scope, vendedorParam);

  if (canUseCompanyScope) {
    return {
      companyIds,
      vendedorIds,
      accessibleClientIds: null
    };
  }

  const accessibleClientIds = await resolveAccessibleClientIds(client, {
    companyIds,
    vendedorIds
  });

  return {
    companyIds,
    vendedorIds,
    accessibleClientIds
  };
}

export function ensureClienteModuloAccess(
  scope: UserScope,
  minLevel = 1,
  message = 'Sem acesso a Clientes.'
) {
  const modulos = scope.isFinanceiro
    ? ['clientes', 'clientes_consulta']
    : ['clientes', 'clientes_consulta', 'vendas'];

  ensureModuloAccess(scope, modulos, minLevel, message);
}

export async function ensureClienteAccess(
  client: DataClient,
  scope: UserScope,
  clienteId: string,
  companyParam?: string | null,
  vendedorParam?: string | null,
  minLevel = 1
) {
  if (!scope.isAdmin) {
    ensureClienteModuloAccess(scope, minLevel);
  }

  const companyIds = resolveScopedCompanyIds(scope, companyParam);
  const vendedorIds = await resolveScopedVendedorIds(client, scope, vendedorParam);
  const normalizedClienteId = String(clienteId || '').trim();

  const filters: ClienteScopedFilters = {
    companyIds,
    vendedorIds,
    accessibleClientIds: null
  };

  if (!normalizedClienteId) {
    throw error(400, 'Cliente invalido.');
  }

  if (scope.isAdmin && companyIds.length === 0 && vendedorIds.length === 0) {
    return filters;
  }

  const canUseCompanyScope = canUseCompanyClienteScope(scope, vendedorParam);

  if (canUseCompanyScope) {
    if (companyIds.length > 0) {
      const companyClienteIds = await resolveCompanyClienteIds(client, companyIds);
      if (companyClienteIds.includes(normalizedClienteId)) return filters;
      throw error(403, 'Sem permissao para acessar este cliente.');
    }

    let foundCliente = false;
    const companyBatches = companyIds.length > 0 ? chunkArray(companyIds) : [null];
    for (const companyBatch of companyBatches) {
      let clienteQuery = client
        .from('clientes')
        .select('id')
        .eq('id', normalizedClienteId)
        .limit(1);

      if (companyBatch) {
        clienteQuery = clienteQuery.in('company_id', companyBatch);
      }

      const { data, error: clienteError } = await clienteQuery;
      if (!clienteError && data?.[0]?.id) {
        foundCliente = true;
        break;
      }
    }
    if (!foundCliente) {
      throw error(403, 'Sem permissao para acessar este cliente.');
    }

    return filters;
  }

  const scopedVendedorIds = vendedorIds.length > 0 ? vendedorIds : [scope.userId].filter(Boolean);
  filters.accessibleClientIds = [normalizedClienteId];

  // Substitui as 3 rodadas de duplo loop empresa x vendedor (cliente
  // criado/atribuido, venda do cliente, cliente como passageiro de viagem)
  // por uma única chamada RPC (função can_access_cliente_by_vendedor_scope,
  // ver dados/migrations) que reproduz a mesma lógica de OR.
  const { data: canAccess, error: canAccessError } = await client.rpc(
    'can_access_cliente_by_vendedor_scope',
    {
      p_cliente_id: normalizedClienteId,
      p_company_ids: companyIds,
      p_vendedor_ids: scopedVendedorIds
    }
  );

  if (canAccessError) throw canAccessError;
  if (canAccess) return filters;

  throw error(403, 'Sem permissao para acessar este cliente.');
}
