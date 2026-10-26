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
