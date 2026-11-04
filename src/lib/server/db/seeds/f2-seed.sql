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

-- PERFIS D1: os papéis simples de empresa são projetados como OUTRO com
-- permissões v2 explícitas. `ADMIN` fica reservado ao administrador global.
INSERT OR IGNORE INTO user_types (id, name, description, created_at)
VALUES ('vtur-builtin-outro', 'OUTRO', 'Perfil de empresa com capacidades explícitas por módulo.', '2026-01-01T00:00:00.000Z');

INSERT OR IGNORE INTO user_profiles (user_id, user_type_id, uso_individual, ativo, participa_ranking, updated_at)
SELECT id, (SELECT id FROM user_types WHERE name = 'OUTRO'), 0, 1, 0, '2026-01-01T00:00:00.000Z'
FROM user
WHERE email IN (
  'admin@alfa-viagens.test', 'operador@alfa-viagens.test', 'view@alfa-viagens.test',
  'admin@beta-turismo.test', 'operador@beta-turismo.test', 'view@beta-turismo.test'
);

WITH permissions(role, modulo, permissao) AS (VALUES
  ('admin', 'v2:empresa', 'admin'),
  ('admin', 'v2:usuarios', 'admin'),
  ('admin', 'v2:convites', 'admin'),
  ('admin', 'v2:vendas', 'admin'),
  ('admin', 'v2:clientes', 'admin'),
  ('admin', 'v2:financeiro', 'admin'),
  ('admin', 'v2:relatorios', 'admin'),
  ('admin', 'v2:configuracoes', 'admin'),
  ('admin', 'v2:auditoria', 'admin'),
  ('admin', 'v2:agenda', 'admin'),
  ('admin', 'v2:mural', 'admin'),
  ('operador', 'v2:empresa', 'view'),
  ('operador', 'v2:usuarios', 'view'),
  ('operador', 'v2:convites', 'view'),
  ('operador', 'v2:vendas', 'edit'),
  ('operador', 'v2:vendas:exportar', 'view'),
  ('operador', 'v2:clientes', 'edit'),
  ('operador', 'v2:financeiro', 'view'),
  ('operador', 'v2:financeiro:exportar', 'view'),
  ('operador', 'v2:relatorios', 'view'),
  ('operador', 'v2:relatorios:exportar', 'view'),
  ('operador', 'v2:configuracoes', 'view'),
  ('operador', 'v2:agenda', 'admin'),
  ('operador', 'v2:mural', 'admin'),
  ('visualizador', 'v2:empresa', 'view'),
  ('visualizador', 'v2:vendas', 'view'),
  ('visualizador', 'v2:clientes', 'view'),
  ('visualizador', 'v2:relatorios', 'view'),
  ('visualizador', 'v2:agenda', 'view'),
  ('visualizador', 'v2:mural', 'view')
)
INSERT OR IGNORE INTO modulo_acesso (id, usuario_id, modulo, permissao, ativo, created_at, updated_at)
SELECT lower(hex(randomblob(16))), u.id, p.modulo, p.permissao, 1,
       '2026-01-01T00:00:00.000Z', '2026-01-01T00:00:00.000Z'
FROM user AS u
JOIN permissions AS p
  ON p.role = CASE
    WHEN u.email LIKE 'admin@%' THEN 'admin'
    WHEN u.email LIKE 'operador@%' THEN 'operador'
    WHEN u.email LIKE 'view@%' THEN 'visualizador'
  END
WHERE u.email LIKE '%@alfa-viagens.test' OR u.email LIKE '%@beta-turismo.test';
