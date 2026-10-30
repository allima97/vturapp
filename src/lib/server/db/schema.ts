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
    twoFactorEnabled: integer('two_factor_enabled', { mode: 'boolean' }).notNull().default(false),
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

export const twoFactor = sqliteTable(
  'two_factor',
  {
    id: text('id').primaryKey(),
    secret: text('secret').notNull(),
    backupCodes: text('backup_codes').notNull(),
    userId: text('user_id').notNull().references(() => user.id, { onDelete: 'cascade' }),
    verified: integer('verified', { mode: 'boolean' }).notNull().default(true),
    failedVerificationCount: integer('failed_verification_count', { mode: 'number' })
      .notNull()
      .default(0),
    lockedUntil: integer('locked_until', { mode: 'timestamp_ms' }),
  },
  (t) => ({
    idxSecret: index('two_factor_secret_idx').on(t.secret),
    idxUser: index('two_factor_user_id_idx').on(t.userId),
  })
);

export type User = typeof user.$inferSelect;
export type Session = typeof session.$inferSelect;
export type Account = typeof account.$inferSelect;
export type Verification = typeof verification.$inferSelect;

// ─────────────────────────────────────────────────────────────────────────────
// DOMÍNIO: CLIENTES — M02 / F3-01
// ─────────────────────────────────────────────────────────────────────────────

export const TIPOS_PESSOA = ['PF', 'PJ'] as const;
export type TipoPessoa = (typeof TIPOS_PESSOA)[number];

/**
 * Clientes da empresa (tenant).
 *
 * Regras (portadas do sistema legado, ver docs/f0/F0-03/F0-04):
 *   - nome, documento (CPF 11 dígitos ou CNPJ 14 válido) e telefone obrigatórios;
 *   - documento guardado só com dígitos; único por empresa (índice UNIQUE);
 *   - nascimento é data civil (TEXT YYYY-MM-DD), nunca timestamp;
 *   - tags como JSON TEXT (array de strings);
 *   - versao: controle de edição concorrente (UPDATE ... WHERE versao = ?);
 *   - sem exclusão física: ativo=false preserva histórico (vendas futuras
 *     referenciam o cliente — F4).
 */
export const clientes = sqliteTable(
  'clientes',
  {
    id: integer('id', { mode: 'number' }).primaryKey({ autoIncrement: true }),
    empresaId: integer('empresa_id', { mode: 'number' })
      .notNull()
      .references(() => empresas.id, { onDelete: 'cascade' }),
    nome: text('nome', { length: 200 }).notNull(),
    tipoPessoa: text('tipo_pessoa', { length: 2 }).notNull().default('PF'),
    /** CPF (11) ou CNPJ (14), somente dígitos. */
    documento: text('documento', { length: 14 }).notNull(),
    /** Data civil YYYY-MM-DD (ADR-005). */
    nascimento: text('nascimento', { length: 10 }),
    telefone: text('telefone', { length: 20 }).notNull(),
    whatsapp: text('whatsapp', { length: 20 }),
    email: text('email', { length: 320 }),
    classificacao: text('classificacao', { length: 1 }),
    endereco: text('endereco', { length: 200 }),
    numero: text('numero', { length: 20 }),
    complemento: text('complemento', { length: 100 }),
    cidade: text('cidade', { length: 120 }),
    estado: text('estado', { length: 2 }),
    cep: text('cep', { length: 8 }),
    rg: text('rg', { length: 20 }),
    genero: text('genero', { length: 20 }),
    nacionalidade: text('nacionalidade', { length: 60 }),
    /** JSON TEXT: array de strings. */
    tags: text('tags').notNull().default('[]'),
    tipoCliente: text('tipo_cliente', { length: 30 }).notNull().default('passageiro'),
    notas: text('notas'),
    ativo: integer('ativo', { mode: 'boolean' }).notNull().default(true),
    /** Concorrência otimista: incrementado a cada UPDATE. */
    versao: integer('versao', { mode: 'number' }).notNull().default(1),
    criadoPor: text('criado_por', { length: 36 }).references(() => user.id, {
      onDelete: 'set null',
    }),
    criadoEm: text('criado_em').notNull().$defaultFn(() => new Date().toISOString()),
    atualizadoEm: text('atualizado_em').notNull().$defaultFn(() => new Date().toISOString()),
  },
  (t) => ({
    idxEmpresaDocumento: uniqueIndex('idx_clientes_empresa_documento').on(t.empresaId, t.documento),
    idxEmpresaNome: index('idx_clientes_empresa_nome').on(t.empresaId, t.nome),
    idxEmpresaAtivo: index('idx_clientes_empresa_ativo').on(t.empresaId, t.ativo),
  })
);

export type Cliente = typeof clientes.$inferSelect;
export type NovoCliente = typeof clientes.$inferInsert;

/**
 * Anexos privados do cliente (metadados no D1; objeto no R2 — F1-05).
 *
 * Escrita D1 + objeto R2 não são uma transação conjunta (roteiro §5):
 * o fluxo é upload R2 → INSERT metadado; falha no INSERT gera compensação
 * (delete do objeto) no service. Download é mediado: a chave nunca vai ao
 * navegador; o Worker valida tenant + dono antes de servir o bytes.
 */
export const clienteAnexos = sqliteTable(
  'cliente_anexos',
  {
    id: integer('id', { mode: 'number' }).primaryKey({ autoIncrement: true }),
    empresaId: integer('empresa_id', { mode: 'number' })
      .notNull()
      .references(() => empresas.id, { onDelete: 'cascade' }),
    clienteId: integer('cliente_id', { mode: 'number' })
      .notNull()
      .references(() => clientes.id, { onDelete: 'cascade' }),
    /** Chave imprevisível: empresa/{id}/clientes/{clienteId}/{uuid}-{nome}. */
    chaveR2: text('chave_r2', { length: 512 }).notNull(),
    nomeOriginal: text('nome_original', { length: 255 }).notNull(),
    contentType: text('content_type', { length: 100 }).notNull(),
    tamanhoBytes: integer('tamanho_bytes', { mode: 'number' }).notNull(),
    enviadoPor: text('enviado_por', { length: 36 }).references(() => user.id, {
      onDelete: 'set null',
    }),
    criadoEm: text('criado_em').notNull().$defaultFn(() => new Date().toISOString()),
  },
  (t) => ({
    idxChave: uniqueIndex('idx_cliente_anexos_chave').on(t.chaveR2),
    idxCliente: index('idx_cliente_anexos_cliente').on(t.empresaId, t.clienteId),
  })
);

export type ClienteAnexo = typeof clienteAnexos.$inferSelect;
export type NovoClienteAnexo = typeof clienteAnexos.$inferInsert;
