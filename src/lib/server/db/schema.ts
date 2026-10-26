/**
 * Schema Drizzle para D1 (SQLite).
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
 * Módulos:
 *   - empresas:  tabela de prova de stack F1-03
 *   - (outras tabelas serão adicionadas nas fases F2–F3)
 *   - auth:      tabela de usuários/sessões adicionada em F1-04 pelo Better Auth
 */

import { integer, sqliteTable, text } from 'drizzle-orm/sqlite-core';

// ─────────────────────────────────────────────────────────────────────────────
// EMPRESAS — prova de stack F1-03
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Tabela de empresas (agências de viagem).
 *
 * Usada como prova de stack F1-03 para validar:
 *   - Migrations D1 via wrangler
 *   - CRUD com Drizzle ORM
 *   - Tipos TypeScript corretos (ADR-005)
 *   - Transações D1
 *
 * Em F2-01 esta tabela será expandida com os campos completos do módulo CRM.
 */
export const empresas = sqliteTable('empresas', {
  /** PK auto-increment */
  id: integer('id', { mode: 'number' }).primaryKey({ autoIncrement: true }),

  /** Nome fantasia da agência */
  nome: text('nome', { length: 200 }).notNull(),

  /** CNPJ sem formatação — 14 dígitos */
  cnpj: text('cnpj', { length: 14 }),

  /** Timezone da empresa (ex.: "America/Sao_Paulo") */
  timezone: text('timezone', { length: 64 }).notNull().default('America/Sao_Paulo'),

  /** Ativo — integer 0/1 no SQLite (ADR-005) */
  ativo: integer('ativo', { mode: 'boolean' }).notNull().default(true),

  /**
   * Data/hora de criação — ISO 8601 UTC (ADR-005).
   * Ex.: "2026-10-26T17:00:00.000Z"
   */
  criadoEm: text('criado_em')
    .notNull()
    .$defaultFn(() => new Date().toISOString()),

  /**
   * Data/hora de atualização — ISO 8601 UTC (ADR-005).
   * Atualizado manualmente nos updates.
   */
  atualizadoEm: text('atualizado_em')
    .notNull()
    .$defaultFn(() => new Date().toISOString()),
});

export type Empresa = typeof empresas.$inferSelect;
export type NovaEmpresa = typeof empresas.$inferInsert;

// ─────────────────────────────────────────────────────────────────────────────
// BETTER AUTH — tabelas de autenticação (F1-04)
// ─────────────────────────────────────────────────────────────────────────────
// Estas tabelas são gerenciadas pelo Better Auth e não seguem as convenções
// ADR-005 (dinheiro/datas). Better Auth usa integer(mode:'timestamp_ms') para
// datas, que é o padrão do Drizzle adapter para SQLite.
// Em F2-02 o campo empresa_id será adicionado à tabela user para vincular
// usuários às empresas.
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Tabela de usuários — gerenciada pelo Better Auth.
 * F2-02: adicionar campo empresa_id FK para empresas.id
 */
export const user = sqliteTable('user', {
  id: text('id').primaryKey(),
  name: text('name').notNull(),
  email: text('email').notNull().unique(),
  emailVerified: integer('email_verified', { mode: 'boolean' }).notNull().default(false),
  image: text('image'),
  createdAt: integer('created_at', { mode: 'timestamp_ms' }).notNull(),
  updatedAt: integer('updated_at', { mode: 'timestamp_ms' }).notNull(),
});

/**
 * Tabela de sessões — gerenciada pelo Better Auth.
 */
export const session = sqliteTable('session', {
  id: text('id').primaryKey(),
  userId: text('user_id')
    .notNull()
    .references(() => user.id, { onDelete: 'cascade' }),
  token: text('token').notNull().unique(),
  expiresAt: integer('expires_at', { mode: 'timestamp_ms' }).notNull(),
  ipAddress: text('ip_address'),
  userAgent: text('user_agent'),
  createdAt: integer('created_at', { mode: 'timestamp_ms' }).notNull(),
  updatedAt: integer('updated_at', { mode: 'timestamp_ms' }).notNull(),
});

/**
 * Tabela de contas OAuth — gerenciada pelo Better Auth.
 * Usada para vincular providers OAuth (GitHub, Google, etc.) aos usuários.
 */
export const account = sqliteTable('account', {
  id: text('id').primaryKey(),
  userId: text('user_id')
    .notNull()
    .references(() => user.id, { onDelete: 'cascade' }),
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

/**
 * Tabela de verificações — gerenciada pelo Better Auth.
 * Usada para e-mail verification tokens, password reset, etc.
 */
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
