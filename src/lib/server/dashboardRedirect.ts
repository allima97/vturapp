export function resolveDashboardPathByUserType(
  userTypeRaw?: string | null,
  fallbackPath = '/dashboard/vendedor'
): string {
  const tipo = String(userTypeRaw || '')
    .trim()
    .toUpperCase();

  if (tipo.includes('ADMIN')) return '/dashboard/admin';
  if (tipo.includes('MASTER')) return '/dashboard/master';
  if (tipo.includes('FINANCEIRO')) return '/dashboard/financeiro';
  if (tipo.includes('GESTOR')) return '/dashboard/gestor';

  return fallbackPath;
}
