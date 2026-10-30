-- Seed F2-01 — dois tenants com papéis sintéticos (admin/operador/visualizador)
--
-- Aplique após as migrations 0000+0001+0002:
--   npx wrangler d1 execute vturapp-dev --local --file=src/lib/server/db/seeds/f2-seed.sql
--
-- Senhas estão deliberadamente ausentes — usuários de teste não fazem login
-- por senha neste seed. Para testar autenticação completa, use F2-02 (convites).

-- ─────────────────────────────────────────────────────────────────────────────
-- EMPRESAS
-- ─────────────────────────────────────────────────────────────────────────────
INSERT OR IGNORE INTO empresas (id, nome, cnpj, slug, plano, limite_usuarios, timezone, ativo, criado_em, atualizado_em) VALUES
  (1, 'Alfa Viagens Ltda', '11222333000181', 'alfa-viagens', 'starter', 10, 'America/Sao_Paulo', 1, '2026-01-15T10:00:00.000Z', '2026-01-15T10:00:00.000Z'),
  (2, 'Beta Turismo ME',   '44555666000100', 'beta-turismo',  'trial',   5,  'America/Recife',    1, '2026-02-20T14:00:00.000Z', '2026-02-20T14:00:00.000Z');

-- ─────────────────────────────────────────────────────────────────────────────
-- USERS (Better Auth managed — sem password neste seed)
-- ─────────────────────────────────────────────────────────────────────────────
INSERT OR IGNORE INTO user (id, name, email, email_verified, empresa_id, created_at, updated_at) VALUES
  ('usr-alfa-admin-001', 'Ana Admin Alfa',      'admin@alfa-viagens.test',    1, 1, 1736935200000, 1736935200000),
  ('usr-alfa-oper-001',  'Bruno Operador Alfa', 'operador@alfa-viagens.test', 1, 1, 1736935200000, 1736935200000),
  ('usr-alfa-view-001',  'Carla View Alfa',     'view@alfa-viagens.test',     0, 1, 1736935200000, 1736935200000),
  ('usr-beta-admin-001', 'Diego Admin Beta',    'admin@beta-turismo.test',    1, 2, 1740056400000, 1740056400000),
  ('usr-beta-oper-001',  'Elisa Operadora Beta','operador@beta-turismo.test', 1, 2, 1740056400000, 1740056400000),
  ('usr-beta-view-001',  'Fabio View Beta',     'view@beta-turismo.test',     0, 2, 1740056400000, 1740056400000);

-- ─────────────────────────────────────────────────────────────────────────────
-- MEMBROS_EMPRESA
-- ─────────────────────────────────────────────────────────────────────────────
INSERT OR IGNORE INTO membros_empresa (empresa_id, user_id, papel, ativo, criado_em, atualizado_em) VALUES
  (1, 'usr-alfa-admin-001', 'admin',        1, '2026-01-15T10:00:00.000Z', '2026-01-15T10:00:00.000Z'),
  (1, 'usr-alfa-oper-001',  'operador',     1, '2026-01-15T10:00:00.000Z', '2026-01-15T10:00:00.000Z'),
  (1, 'usr-alfa-view-001',  'visualizador', 1, '2026-01-15T10:00:00.000Z', '2026-01-15T10:00:00.000Z'),
  (2, 'usr-beta-admin-001', 'admin',        1, '2026-02-20T14:00:00.000Z', '2026-02-20T14:00:00.000Z'),
  (2, 'usr-beta-oper-001',  'operador',     1, '2026-02-20T14:00:00.000Z', '2026-02-20T14:00:00.000Z'),
  (2, 'usr-beta-view-001',  'visualizador', 1, '2026-02-20T14:00:00.000Z', '2026-02-20T14:00:00.000Z');
