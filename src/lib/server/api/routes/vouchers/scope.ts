import { resolveScopedCompanyIds, type UserScope } from '$lib/server/v1';

export function isIndividualVoucherScope(scope: UserScope) {
  return !scope.isAdmin && scope.isVendedor && scope.usoIndividual;
}

export function canAccessVoucher(
  scope: UserScope,
  voucher: { company_id: string | null; created_by: string | null }
) {
  if (scope.isAdmin) return true;
  if (isIndividualVoucherScope(scope)) {
    return voucher.company_id === null && voucher.created_by === scope.userId;
  }
  return !!voucher.company_id && resolveScopedCompanyIds(scope).includes(voucher.company_id);
}
