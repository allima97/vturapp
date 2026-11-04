/**
 * Seed F2-01 — dois tenants com papéis sintéticos.
 *
 * Popula:
 *   - 2 empresas (Alfa Viagens, Beta Turismo)
 *   - 6 usuários (3 por empresa, papéis: admin / operador / visualizador)
 *   - 6 membros_empresa (associações)
 *
 * Uso com wrangler (local):
 *   npx wrangler d1 execute vturapp-dev --local --file=src/lib/server/db/seeds/f2-seed.sql
 *
 * Para gerar o SQL a partir deste TypeScript, execute:
 *   npx tsx src/lib/server/db/seeds/f2-seed.ts
 * (requer ts-node/tsx instalado)
 *
 * OU aplique diretamente via wrangler usando f2-seed.sql abaixo.
 */

export const SEED_EMPRESAS = [
  {
    id: 1,
    nome: 'Alfa Viagens Ltda',
    cnpj: '11222333000181',
    slug: 'alfa-viagens',
    plano: 'starter',
    limite_usuarios: 10,
    timezone: 'America/Sao_Paulo',
    ativo: 1,
    criado_em: '2026-01-15T10:00:00.000Z',
    atualizado_em: '2026-01-15T10:00:00.000Z',
  },
  {
    id: 2,
    nome: 'Beta Turismo ME',
    cnpj: '44555666000100',
    slug: 'beta-turismo',
    plano: 'trial',
    limite_usuarios: 5,
    timezone: 'America/Recife',
    ativo: 1,
    criado_em: '2026-02-20T14:00:00.000Z',
    atualizado_em: '2026-02-20T14:00:00.000Z',
  },
] as const;

/**
 * Usuários de teste — senhas são hashadas pelo Better Auth.
 * Em seed SQL puro, inserimos apenas as linhas sem autenticação real.
 * Para testar login, use: POST /api/auth/sign-in/email
 *
 * Nota: empresa_id vincula diretamente o usuário ao tenant.
 */
export const SEED_USERS = [
  // Alfa — admin
  { id: 'usr-alfa-admin-001', name: 'Ana Admin Alfa', email: 'admin@alfa-viagens.test', empresa_id: 1 },
  // Alfa — operador
  { id: 'usr-alfa-oper-001', name: 'Bruno Operador Alfa', email: 'operador@alfa-viagens.test', empresa_id: 1 },
  // Alfa — visualizador
  { id: 'usr-alfa-view-001', name: 'Carla View Alfa', email: 'view@alfa-viagens.test', empresa_id: 1 },
  // Beta — admin
  { id: 'usr-beta-admin-001', name: 'Diego Admin Beta', email: 'admin@beta-turismo.test', empresa_id: 2 },
  // Beta — operador
  { id: 'usr-beta-oper-001', name: 'Elisa Operadora Beta', email: 'operador@beta-turismo.test', empresa_id: 2 },
  // Beta — visualizador
  { id: 'usr-beta-view-001', name: 'Fabio View Beta', email: 'view@beta-turismo.test', empresa_id: 2 },
] as const;

export const SEED_MEMBROS = [
  { empresa_id: 1, user_id: 'usr-alfa-admin-001', papel: 'admin' },
  { empresa_id: 1, user_id: 'usr-alfa-oper-001', papel: 'operador' },
  { empresa_id: 1, user_id: 'usr-alfa-view-001', papel: 'visualizador' },
  { empresa_id: 2, user_id: 'usr-beta-admin-001', papel: 'admin' },
  { empresa_id: 2, user_id: 'usr-beta-oper-001', papel: 'operador' },
  { empresa_id: 2, user_id: 'usr-beta-view-001', papel: 'visualizador' },
] as const;
