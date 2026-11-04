import type { DataClient } from '$lib/server/data';
import {
  fetchVendedorIdsByCompanyIds,
  parseUuidList,
  resolveScopedCompanyIds,
  type UserScope
} from '$lib/server/v1';

export type QuoteCreatorScope = {
  companyIds: string[];
  creatorIds: string[];
  allAccess: boolean;
  userId: string;
};

export async function resolveQuoteCreatorScope(
  client: DataClient,
  scope: UserScope,
  options: {
    companyId?: string | null;
    vendedorRaw?: string | null;
  } = {}
): Promise<QuoteCreatorScope> {
  const companyIds = resolveScopedCompanyIds(scope, options.companyId);
  const requestedCreatorIds = parseUuidList(options.vendedorRaw);

  if (scope.isAdmin) {
    if (requestedCreatorIds.length > 0) {
      return { companyIds, creatorIds: requestedCreatorIds, allAccess: false, userId: scope.userId };
    }
    if (companyIds.length > 0) {
      const companyCreatorIds = await fetchVendedorIdsByCompanyIds(client, companyIds);
      return { companyIds, creatorIds: companyCreatorIds, allAccess: false, userId: scope.userId };
    }
    return { companyIds, creatorIds: [], allAccess: true, userId: scope.userId };
  }

  if (scope.isMaster || scope.isFinanceiro || scope.isGestor) {
    const companyCreatorIds = await fetchVendedorIdsByCompanyIds(client, companyIds);
    const allowedCreatorIds = new Set(companyCreatorIds);
    const ownCompanyAllowed =
      companyIds.length === 0 ||
      !scope.companyId ||
      companyIds.includes(scope.companyId);

    if (ownCompanyAllowed) {
      allowedCreatorIds.add(scope.userId);
    }

    const creatorIds =
      requestedCreatorIds.length > 0
        ? requestedCreatorIds.filter((id) => allowedCreatorIds.has(id))
        : Array.from(allowedCreatorIds);

    return { companyIds, creatorIds, allAccess: false, userId: scope.userId };
  }

  return { companyIds, creatorIds: [scope.userId], allAccess: false, userId: scope.userId };
}

export function isQuoteCreatorAllowed(
  creatorScope: QuoteCreatorScope,
  createdBy?: string | null
) {
  if (creatorScope.allAccess && creatorScope.creatorIds.length === 0) {
    return true;
  }

  const creatorId = String(createdBy || '').trim();
  return Boolean(
    creatorId &&
      (creatorId === creatorScope.userId || creatorScope.creatorIds.includes(creatorId))
  );
}
