import type { DataClient } from '$lib/server/data';
import type { UserScope } from '$lib/server/v1';
import { isUuid } from '$lib/server/v1';
import { cleanStringSet } from '$lib/utils/array';

export type ScopedSaleRow = {
  id: string;
  company_id: string | null;
  vendedor_id: string | null;
  [key: string]: unknown;
};

type SaleScopeParams = {
  scope: UserScope;
  companyIds?: string[] | null;
  vendedorIds?: string[] | null;
  applySellerScope?: boolean;
};

type FetchSaleForScopeParams = SaleScopeParams & {
  client: DataClient;
  saleId: string;
  extraSelect?: string;
};

const BASE_SALE_SCOPE_COLUMNS = ['id', 'company_id', 'vendedor_id'] as const;

function normalizedIdSet(ids?: string[] | null) {
  return cleanStringSet(ids);
}

function buildSaleSelect(extraSelect?: string) {
  const columns = new Set<string>(BASE_SALE_SCOPE_COLUMNS);
  for (const rawColumn of String(extraSelect || '').split(',')) {
    const column = rawColumn.trim();
    if (column) columns.add(column);
  }

  return Array.from(columns).join(', ');
}

export function shouldApplySellerScope(scope: UserScope) {
  return !scope.isGestor && !scope.isMaster && !scope.isFinanceiro;
}

export function isSaleInScope(sale: unknown, params: SaleScopeParams) {
  if (!sale || typeof sale !== 'object') return false;

  const row = sale as ScopedSaleRow;
  const companySet = normalizedIdSet(params.companyIds);
  const vendedorSet = normalizedIdSet(params.vendedorIds);
  const saleCompanyId = String(row.company_id || '').trim();
  const saleVendedorId = String(row.vendedor_id || '').trim();
  const applySellerScopeValue = params.applySellerScope ?? shouldApplySellerScope(params.scope);

  if (companySet.size > 0 && !companySet.has(saleCompanyId)) return false;
  if (applySellerScopeValue && vendedorSet.size > 0 && !vendedorSet.has(saleVendedorId))
    return false;

  return true;
}

export async function fetchSaleForScope(params: FetchSaleForScopeParams) {
  const saleId = String(params.saleId || '').trim();
  if (!isUuid(saleId)) return null;

  const { data, error } = await params.client
    .from('vendas')
    .select(buildSaleSelect(params.extraSelect))
    .eq('id', saleId)
    .maybeSingle();

  if (error) throw error;
  if (!isSaleInScope(data, params)) return null;

  return data as unknown as ScopedSaleRow;
}
