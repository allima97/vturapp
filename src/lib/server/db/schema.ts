/**
 * Schema Drizzle para D1 (SQLite) — F2-01: domínios por módulo.
 *
 * Convenções (ADR-005 — dinheiro e datas):
 *   - Dinheiro:     integer({ mode: 'number' })   — centavos (ex.: R$10,50 → 1050)
 *   - Percentual:   integer({ mode: 'number' })   — × 100  (ex.: 12,5% → 1250)
 *   - Data/hora:    text()                         — ISO 8601 (ex.: "2026-10-26T17:00:00Z")
 *   - Data civil:   text()                         — YYYY-MM-DD (ex.: "2026-10-26")
 *   - Booleano:     integer({ mode: 'boolean' })   — 0/1 no SQLite
 *   - ID:           integer({ mode: 'number' })    — PK auto-increment
 *                   ou text({ length: 36 })         — UUID quando distribuído
 *
 * Módulos / domínios:
 *   - identity:    empresas, user (Better Auth + empresa_id), membros_empresa
 *   - invites:     convites
 *   - auth:        session, account, verification (Better Auth — ADR-005 exception)
 */

import { index, integer, sqliteTable, text, uniqueIndex } from 'drizzle-orm/sqlite-core';

// ─────────────────────────────────────────────────────────────────────────────
// DOMÍNIO: IDENTITY — empresas
// ─────────────────────────────────────────────────────────────────────────────

export const empresas = sqliteTable(
  'empresas',
  {
    id: integer('id', { mode: 'number' }).primaryKey({ autoIncrement: true }),
    nome: text('nome', { length: 200 }).notNull(),
    cnpj: text('cnpj', { length: 14 }),
    slug: text('slug', { length: 80 }),
    plano: text('plano', { length: 20 }).notNull().default('trial'),
    limiteUsuarios: integer('limite_usuarios', { mode: 'number' }).notNull().default(5),
    timezone: text('timezone', { length: 64 }).notNull().default('America/Sao_Paulo'),
    ativo: integer('ativo', { mode: 'boolean' }).notNull().default(true),
    criadoEm: text('criado_em').notNull().$defaultFn(() => new Date().toISOString()),
    atualizadoEm: text('atualizado_em').notNull().$defaultFn(() => new Date().toISOString()),
  },
  (t) => ({
    idxCnpj: uniqueIndex('idx_empresas_cnpj').on(t.cnpj),
    idxSlug: uniqueIndex('idx_empresas_slug').on(t.slug),
  })
);

export type Empresa = typeof empresas.$inferSelect;
export type NovaEmpresa = typeof empresas.$inferInsert;

// ─────────────────────────────────────────────────────────────────────────────
// BETTER AUTH — user (definido antes de membrosEmpresa/convites por FK)
// ─────────────────────────────────────────────────────────────────────────────

export const user = sqliteTable(
  'user',
  {
    id: text('id').primaryKey(),
    name: text('name').notNull(),
    email: text('email').notNull(),
    emailVerified: integer('email_verified', { mode: 'boolean' }).notNull().default(false),
    image: text('image'),
    /**
     * FK para empresas.id — define o tenant do usuário.
     * NULL para super-admins do sistema.
     * Adicionado em F2-01 (NULL nos usuários criados em F1-04).
     */
    empresaId: integer('empresa_id', { mode: 'number' }).references(() => empresas.id, {
      onDelete: 'set null',
    }),
    createdAt: integer('created_at', { mode: 'timestamp_ms' }).notNull(),
    updatedAt: integer('updated_at', { mode: 'timestamp_ms' }).notNull(),
  },
  (t) => ({
    idxEmail: uniqueIndex('idx_user_email').on(t.email),
    idxEmpresa: index('idx_user_empresa_id').on(t.empresaId),
  })
);

// ─────────────────────────────────────────────────────────────────────────────
// DOMÍNIO: IDENTITY — membros da empresa
// ─────────────────────────────────────────────────────────────────────────────

export const PAPEIS = ['admin', 'operador', 'visualizador'] as const;
export type Papel = (typeof PAPEIS)[number];

/**
 * Membros de empresa — associação usuário ↔ empresa com papel (RBAC simples).
 *
 * Um usuário pertence a no máximo uma empresa (UNIQUE em user_id).
 * Papéis:
 *   admin        — lê, cria, edita, exclui, convida, configura empresa
 *   operador     — lê, cria, edita (sem excluir, sem configurar empresa)
 *   visualizador — somente leitura
 *
 * A matriz completa de capabilities é definida em F2-03.
 */
export const membrosEmpresa = sqliteTable(
  'membros_empresa',
  {
    id: integer('id', { mode: 'number' }).primaryKey({ autoIncrement: true }),
    empresaId: integer('empresa_id', { mode: 'number' })
      .notNull()
      .references(() => empresas.id, { onDelete: 'cascade' }),
    userId: text('user_id', { length: 36 })
      .notNull()
      .references(() => user.id, { onDelete: 'cascade' }),
    /** Valores: 'admin' | 'operador' | 'visualizador'. CHECK na migration SQL. */
    papel: text('papel', { length: 20 }).notNull().default('visualizador'),
    ativo: integer('ativo', { mode: 'boolean' }).notNull().default(true),
    criadoEm: text('criado_em').notNull().$defaultFn(() => new Date().toISOString()),
    atualizadoEm: text('atualizado_em').notNull().$defaultFn(() => new Date().toISOString()),
  },
  (t) => ({
    idxUserUnique: uniqueIndex('idx_membros_user_id').on(t.userId),
    idxEmpresa: index('idx_membros_empresa_id').on(t.empresaId),
    idxEmpresaPapel: index('idx_membros_empresa_papel').on(t.empresaId, t.papel),
  })
);

export type MembroEmpresa = typeof membrosEmpresa.$inferSelect;
export type NovoMembroEmpresa = typeof membrosEmpresa.$inferInsert;

// ─────────────────────────────────────────────────────────────────────────────
// DOMÍNIO: INVITES — convites pendentes
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Convites — tokens para novos membros.
 *
 * Fluxo (implementado em F2-02):
 *   1. Admin cria convite → token gerado, e-mail enviado.
 *   2. Convidado clica no link → conta criada (ou vinculada) +
 *      membros_empresa inserido com o papel do convite.
 *   3. aceito_em preenchido; token não pode ser reutilizado.
 */
export const convites = sqliteTable(
  'convites',
  {
    id: integer('id', { mode: 'number' }).primaryKey({ autoIncrement: true }),
    empresaId: integer('empresa_id', { mode: 'number' })
      .notNull()
      .references(() => empresas.id, { onDelete: 'cascade' }),
    email: text('email', { length: 320 }).notNull(),
    papel: text('papel', { length: 20 }).notNull().default('operador'),
    token: text('token', { length: 36 }).notNull(),
    expiresAt: text('expires_at').notNull(),
    aceitadoEm: text('aceito_em'),
    convidadoPor: text('convidado_por', { length: 36 }).references(() => user.id, {
      onDelete: 'set null',
    }),
    criadoEm: text('criado_em').notNull().$defaultFn(() => new Date().toISOString()),
  },
  (t) => ({
    idxToken: uniqueIndex('idx_convites_token').on(t.token),
    idxEmpresa: index('idx_convites_empresa_id').on(t.empresaId),
    idxEmail: index('idx_convites_email').on(t.email),
  })
);

export type Convite = typeof convites.$inferSelect;
export type NovoConvite = typeof convites.$inferInsert;

// ─────────────────────────────────────────────────────────────────────────────
// BETTER AUTH — session, account, verification
// ─────────────────────────────────────────────────────────────────────────────
// ADR-005 exception: Better Auth usa integer(mode:'timestamp_ms') para datas.
// ─────────────────────────────────────────────────────────────────────────────

export const session = sqliteTable('session', {
  id: text('id').primaryKey(),
  userId: text('user_id').notNull().references(() => user.id, { onDelete: 'cascade' }),
  token: text('token').notNull().unique(),
  expiresAt: integer('expires_at', { mode: 'timestamp_ms' }).notNull(),
  ipAddress: text('ip_address'),
  userAgent: text('user_agent'),
  createdAt: integer('created_at', { mode: 'timestamp_ms' }).notNull(),
  updatedAt: integer('updated_at', { mode: 'timestamp_ms' }).notNull(),
});

export const account = sqliteTable('account', {
  id: text('id').primaryKey(),
  userId: text('user_id').notNull().references(() => user.id, { onDelete: 'cascade' }),
  accountId: text('account_id').notNull(),
  providerId: text('provider_id').notNull(),
  accessToken: text('access_token'),
  refreshToken: text('refresh_token'),
  accessTokenExpiresAt: integer('access_token_expires_at', { mode: 'timestamp_ms' }),
  refreshTokenExpiresAt: integer('refresh_token_expires_at', { mode: 'timestamp_ms' }),
  scope: text('scope'),
  idToken: text('id_token'),
  password: text('password'),
  createdAt: integer('created_at', { mode: 'timestamp_ms' }).notNull(),
  updatedAt: integer('updated_at', { mode: 'timestamp_ms' }).notNull(),
});

export const verification = sqliteTable('verification', {
  id: text('id').primaryKey(),
  identifier: text('identifier').notNull(),
  value: text('value').notNull(),
  expiresAt: integer('expires_at', { mode: 'timestamp_ms' }).notNull(),
  createdAt: integer('created_at', { mode: 'timestamp_ms' }).notNull(),
  updatedAt: integer('updated_at', { mode: 'timestamp_ms' }).notNull(),
});

export type User = typeof user.$inferSelect;
export type Session = typeof session.$inferSelect;
export type Account = typeof account.$inferSelect;
export type Verification = typeof verification.$inferSelect;
