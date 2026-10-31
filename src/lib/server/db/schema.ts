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

import { index, integer, real, sqliteTable, text, uniqueIndex } from 'drizzle-orm/sqlite-core';

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

// ─────────────────────────────────────────────────────────────────────────────
// DOMÍNIO: VENDAS — M04 / F4-01
//
// Regras portadas do legado (docs/f4/F4-01-vendas-d1.md):
//   - valores em centavos inteiros (ADR-005);
//   - datas civis TEXT YYYY-MM-DD, instantes ISO 8601 UTC;
//   - status DERIVADO na leitura: cancelada → 'cancelada';
//     data_final < hoje → 'concluida'; data_embarque ≥ hoje → 'confirmada'; else 'pendente';
//   - venda é criada em transação atômica: cabeçalho + itens + pagamentos;
//   - idempotência por chave_idempotencia (UUID v4 gerado pelo cliente);
//   - versao para edição concorrente (UPDATE ... WHERE versao = ?);
//   - sem exclusão física (cancelamento lógico);
//   - valor_total = sum(venda_itens.valor_total_centavos);
//   - valor_pago = sum(venda_pagamentos.valor_total_centavos).
// ─────────────────────────────────────────────────────────────────────────────

export const TIPOS_PRODUTO = ['pacote', 'hotel', 'passagem', 'servico', 'seguro'] as const;
export type TipoProduto = (typeof TIPOS_PRODUTO)[number];

/**
 * Catálogo global de produtos/destinos.
 * Não tem empresa_id: produtos são compartilhados entre empresas (como no legado).
 * Referenciado por venda_itens e pelo campo produto_id da venda (produto principal).
 */
export const produtos = sqliteTable(
  'produtos',
  {
    id: integer('id', { mode: 'number' }).primaryKey({ autoIncrement: true }),
    nome: text('nome', { length: 200 }).notNull(),
    /** Categoria funcional do produto. */
    tipo: text('tipo', { length: 20 }).notNull().default('pacote'),
    /** Texto livre — nome do destino/região. */
    destino: text('destino', { length: 200 }),
    /** Moeda base do custo (ISO 4217). */
    moeda: text('moeda', { length: 3 }).notNull().default('BRL'),
    /** Valor de custo (centavos BRL, pós-câmbio). */
    valorNetoCentavos: integer('valor_neto_centavos').notNull().default(0),
    /** Valor sugerido de venda (centavos BRL). */
    valorVendaCentavos: integer('valor_venda_centavos').notNull().default(0),
    pagaComissao: integer('paga_comissao', { mode: 'boolean' }).notNull().default(true),
    permiteDesconto: integer('permite_desconto', { mode: 'boolean' }).notNull().default(true),
    /** Percentual de desconto padrão (2 casas: 1050 = 10,50%). */
    descontoPadraoPct: integer('desconto_padrao_pct'),
    fornecedor: text('fornecedor', { length: 200 }),
    notas: text('notas'),
    ativo: integer('ativo', { mode: 'boolean' }).notNull().default(true),
    criadoEm: text('criado_em').notNull().$defaultFn(() => new Date().toISOString()),
    atualizadoEm: text('atualizado_em').notNull().$defaultFn(() => new Date().toISOString()),
  },
  (t) => ({
    idxNome: index('idx_produtos_nome').on(t.nome),
    idxTipo: index('idx_produtos_tipo').on(t.tipo),
    idxAtivo: index('idx_produtos_ativo').on(t.ativo),
  })
);

export type Produto = typeof produtos.$inferSelect;
export type NovoProduto = typeof produtos.$inferInsert;

/**
 * Formas de pagamento configuradas por empresa.
 * Usadas em venda_pagamentos; o nome é copiado no momento da gravação.
 */
export const formasPagamento = sqliteTable(
  'formas_pagamento',
  {
    id: integer('id', { mode: 'number' }).primaryKey({ autoIncrement: true }),
    empresaId: integer('empresa_id', { mode: 'number' })
      .notNull()
      .references(() => empresas.id, { onDelete: 'cascade' }),
    nome: text('nome', { length: 100 }).notNull(),
    /** Tipo funcional para agrupamento em relatórios. */
    tipo: text('tipo', { length: 30 }).notNull().default('outro'),
    ativo: integer('ativo', { mode: 'boolean' }).notNull().default(true),
    criadoEm: text('criado_em').notNull().$defaultFn(() => new Date().toISOString()),
  },
  (t) => ({
    idxEmpresaAtivo: index('idx_formas_pgto_empresa_ativo').on(t.empresaId, t.ativo),
    idxEmpresaNome: uniqueIndex('idx_formas_pgto_empresa_nome').on(t.empresaId, t.nome),
  })
);

export type FormaPagamento = typeof formasPagamento.$inferSelect;
export type NovaFormaPagamento = typeof formasPagamento.$inferInsert;

/**
 * Cabeçalho da venda.
 *
 * Status derivado em leitura (não persiste status como enum — roteiro §6):
 *   cancelada=true             → 'cancelada'
 *   data_final < YYYY-MM-DD   → 'concluida'
 *   data_embarque >= hoje      → 'confirmada'
 *   else                       → 'pendente'
 *
 * Valores financeiros em centavos (ADR-005):
 *   valor_total = soma de venda_itens.valor_total_centavos
 *   valor_pago  = soma de venda_pagamentos.valor_total_centavos
 *   valor_taxas = soma de venda_itens.valor_taxas_centavos
 *
 * Idempotência: chave_idempotencia evita duplicação em retry de criação.
 */
export const vendas = sqliteTable(
  'vendas',
  {
    id: integer('id', { mode: 'number' }).primaryKey({ autoIncrement: true }),
    empresaId: integer('empresa_id', { mode: 'number' })
      .notNull()
      .references(() => empresas.id, { onDelete: 'cascade' }),
    /** Número sequencial legível por empresa (VTUR-AAAA-NNNNN). */
    numeroVenda: text('numero_venda', { length: 30 }),
    /** Membro da empresa que registrou a venda. */
    vendedorId: text('vendedor_id', { length: 36 }).references(() => user.id, {
      onDelete: 'set null',
    }),
    /** Cliente principal da venda. */
    clienteId: integer('cliente_id', { mode: 'number' }).references(() => clientes.id, {
      onDelete: 'set null',
    }),
    /** Produto principal (destino) — FK opcional; itens detalham os produtos. */
    produtoId: integer('produto_id', { mode: 'number' }).references(() => produtos.id, {
      onDelete: 'set null',
    }),
    /** Data do evento de venda (ADR-005: TEXT YYYY-MM-DD). */
    dataVenda: text('data_venda', { length: 10 }).notNull(),
    /** Data de lançamento no sistema. */
    dataLancamento: text('data_lancamento', { length: 10 }).notNull(),
    /** Data de embarque/início do serviço. */
    dataEmbarque: text('data_embarque', { length: 10 }),
    /** Data de retorno/fim do serviço. */
    dataFinal: text('data_final', { length: 10 }),
    cancelada: integer('cancelada', { mode: 'boolean' }).notNull().default(false),
    /** Desconto comercial avulso foi concedido. */
    descontoComercialAplicado: integer('desconto_comercial_aplicado', { mode: 'boolean' })
      .notNull()
      .default(false),
    /** Valor do desconto comercial avulso (centavos). */
    descontoComercialCentavos: integer('desconto_comercial_centavos').notNull().default(0),
    /** Soma dos valores brutos dos itens (centavos). */
    valorBrutoCentavos: integer('valor_bruto_centavos').notNull().default(0),
    /** Soma das taxas dos itens (centavos). */
    valorTaxasCentavos: integer('valor_taxas_centavos').notNull().default(0),
    /** Valor final cobrado do cliente (centavos). */
    valorTotalCentavos: integer('valor_total_centavos').notNull().default(0),
    /** Soma dos pagamentos registrados (centavos). */
    valorPagoCentavos: integer('valor_pago_centavos').notNull().default(0),
    /** Parte do total não sujeita a comissão (centavos). */
    valorNaoComissionadoCentavos: integer('valor_nao_comissionado_centavos').notNull().default(0),
    notas: text('notas'),
    /** UUID v4 gerado pelo cliente para idempotência em criações. */
    chaveIdempotencia: text('chave_idempotencia', { length: 36 }),
    /** Controle de edição concorrente (UPDATE ... WHERE versao = ?). */
    versao: integer('versao', { mode: 'number' }).notNull().default(1),
    criadoPor: text('criado_por', { length: 36 }).references(() => user.id, {
      onDelete: 'set null',
    }),
    criadoEm: text('criado_em').notNull().$defaultFn(() => new Date().toISOString()),
    atualizadoEm: text('atualizado_em').notNull().$defaultFn(() => new Date().toISOString()),
  },
  (t) => ({
    idxEmpresaData: index('idx_vendas_empresa_data').on(t.empresaId, t.dataVenda),
    idxEmpresaCliente: index('idx_vendas_empresa_cliente').on(t.empresaId, t.clienteId),
    idxEmpresaVendedor: index('idx_vendas_empresa_vendedor').on(t.empresaId, t.vendedorId),
    idxEmpresaCancelada: index('idx_vendas_empresa_cancelada').on(t.empresaId, t.cancelada),
    /** F4-04: cobre resumoVendas com filtro cancelada + data_venda (dashboard). */
    idxEmpresaCanceladaData: index('idx_vendas_empresa_cancelada_data').on(t.empresaId, t.cancelada, t.dataVenda),
    /** F4-04: cobre listarVendas com keyset cursor (empresa_id + cancelada + id DESC). */
    idxEmpresaCanceladaId: index('idx_vendas_empresa_cancelada_id').on(t.empresaId, t.cancelada, t.id),
    idxChaveIdempotencia: uniqueIndex('idx_vendas_chave_idempotencia').on(t.chaveIdempotencia),
    idxNumeroVenda: uniqueIndex('idx_vendas_numero_venda').on(t.empresaId, t.numeroVenda),
  })
);

export type Venda = typeof vendas.$inferSelect;
export type NovaVenda = typeof vendas.$inferInsert;
export type VendaStatus = 'pendente' | 'confirmada' | 'concluida' | 'cancelada';

/**
 * Itens (recibos) da venda — cada serviço/produto contratado.
 *
 * Valores em centavos (ADR-005). Câmbio: 4 casas decimais
 * (10000 = R$ 1,0000/BRL; 50150 = R$ 5,0150/USD).
 */
export const vendaItens = sqliteTable(
  'venda_itens',
  {
    id: integer('id', { mode: 'number' }).primaryKey({ autoIncrement: true }),
    empresaId: integer('empresa_id', { mode: 'number' })
      .notNull()
      .references(() => empresas.id, { onDelete: 'cascade' }),
    vendaId: integer('venda_id', { mode: 'number' })
      .notNull()
      .references(() => vendas.id, { onDelete: 'cascade' }),
    produtoId: integer('produto_id', { mode: 'number' }).references(() => produtos.id, {
      onDelete: 'set null',
    }),
    /** Número do recibo / voucher do fornecedor (normalizado). */
    numeroRecibo: text('numero_recibo', { length: 100 }),
    /** Número de reserva no sistema do fornecedor. */
    numeroReserva: text('numero_reserva', { length: 100 }),
    /** Data de início do serviço (YYYY-MM-DD). */
    dataServico: text('data_servico', { length: 10 }),
    /** Data de fim do serviço (YYYY-MM-DD). */
    dataFimServico: text('data_fim_servico', { length: 10 }),
    /** Quantidade de passageiros. */
    pax: integer('pax', { mode: 'number' }).notNull().default(1),
    /** Descrição do serviço (nome copiado para histórico). */
    descricao: text('descricao', { length: 300 }).notNull(),
    tipo: text('tipo', { length: 20 }).notNull().default('pacote'),
    /** Moeda original do fornecedor (ISO 4217). */
    moeda: text('moeda', { length: 3 }).notNull().default('BRL'),
    /** Câmbio aplicado (4 casas: 50150 = R$ 5,0150/USD). */
    cambioCentavos: integer('cambio_centavos').notNull().default(10000),
    /** Custo líquido em BRL (centavos). */
    valorNetoCentavos: integer('valor_neto_centavos').notNull().default(0),
    /** Preço bruto sem desconto (centavos). */
    valorBrutoCentavos: integer('valor_bruto_centavos').notNull().default(0),
    /** Taxas embutidas (DU, RAV etc.) em centavos. */
    valorTaxasCentavos: integer('valor_taxas_centavos').notNull().default(0),
    /** Valor total do item = bruto + taxas (centavos). */
    valorTotalCentavos: integer('valor_total_centavos').notNull().default(0),
    pagaComissao: integer('paga_comissao', { mode: 'boolean' }).notNull().default(true),
    notas: text('notas'),
    criadoEm: text('criado_em').notNull().$defaultFn(() => new Date().toISOString()),
  },
  (t) => ({
    idxVenda: index('idx_venda_itens_venda').on(t.empresaId, t.vendaId),
    idxProduto: index('idx_venda_itens_produto').on(t.produtoId),
  })
);

export type VendaItem = typeof vendaItens.$inferSelect;
export type NovoVendaItem = typeof vendaItens.$inferInsert;

/**
 * Pagamentos registrados para a venda.
 *
 * Um pagamento pode ter N parcelas (venda_parcelas).
 * O campo forma_nome é copiado do nome atual da forma no momento da gravação
 * para preservar histórico mesmo que a forma seja renomeada.
 */
export const vendaPagamentos = sqliteTable(
  'venda_pagamentos',
  {
    id: integer('id', { mode: 'number' }).primaryKey({ autoIncrement: true }),
    empresaId: integer('empresa_id', { mode: 'number' })
      .notNull()
      .references(() => empresas.id, { onDelete: 'cascade' }),
    vendaId: integer('venda_id', { mode: 'number' })
      .notNull()
      .references(() => vendas.id, { onDelete: 'cascade' }),
    formaId: integer('forma_id', { mode: 'number' }).references(() => formasPagamento.id, {
      onDelete: 'set null',
    }),
    /** Nome copiado para histórico (imutável após gravação). */
    formaNome: text('forma_nome', { length: 100 }).notNull(),
    operacao: text('operacao', { length: 60 }),
    plano: text('plano', { length: 60 }),
    valorBrutoCentavos: integer('valor_bruto_centavos').notNull().default(0),
    descontoCentavos: integer('desconto_centavos').notNull().default(0),
    /** valorBruto − desconto. */
    valorTotalCentavos: integer('valor_total_centavos').notNull().default(0),
    parcelasQtd: integer('parcelas_qtd', { mode: 'number' }).notNull().default(1),
    /** Valor de cada parcela (centavos). */
    parcelasValorCentavos: integer('parcelas_valor_centavos').notNull().default(0),
    pagaComissao: integer('paga_comissao', { mode: 'boolean' }).notNull().default(true),
    criadoEm: text('criado_em').notNull().$defaultFn(() => new Date().toISOString()),
  },
  (t) => ({
    idxVenda: index('idx_venda_pagamentos_venda').on(t.empresaId, t.vendaId),
  })
);

export type VendaPagamento = typeof vendaPagamentos.$inferSelect;
export type NovoVendaPagamento = typeof vendaPagamentos.$inferInsert;

/**
 * Parcelas de um pagamento parcelado.
 * Cada linha representa uma parcela com vencimento e valor individual.
 */
export const vendaParcelas = sqliteTable(
  'venda_parcelas',
  {
    id: integer('id', { mode: 'number' }).primaryKey({ autoIncrement: true }),
    empresaId: integer('empresa_id', { mode: 'number' })
      .notNull()
      .references(() => empresas.id, { onDelete: 'cascade' }),
    pagamentoId: integer('pagamento_id', { mode: 'number' })
      .notNull()
      .references(() => vendaPagamentos.id, { onDelete: 'cascade' }),
    numero: integer('numero', { mode: 'number' }).notNull(),
    valorCentavos: integer('valor_centavos').notNull().default(0),
    /** Data de vencimento (YYYY-MM-DD). */
    vencimento: text('vencimento', { length: 10 }),
    criadoEm: text('criado_em').notNull().$defaultFn(() => new Date().toISOString()),
  },
  (t) => ({
    idxPagamento: index('idx_venda_parcelas_pagamento').on(t.empresaId, t.pagamentoId),
    /** F4-04: cobre listarParcelas com filtro por vencimento. */
    idxVencimento: index('idx_venda_parcelas_vencimento').on(t.empresaId, t.vencimento),
  })
);

export type VendaParcela = typeof vendaParcelas.$inferSelect;
export type NovoVendaParcela = typeof vendaParcelas.$inferInsert;

// ─────────────────────────────────────────────────────────────────────────────
// M10 — Destinos (catálogo global de destinos turísticos)
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Catálogo global de destinos turísticos.
 * Sem empresa_id: compartilhado entre todas as empresas.
 * Referenciado opcionalmente por pacotes/roteiros.
 */
export const destinos = sqliteTable(
  'destinos',
  {
    id: integer('id', { mode: 'number' }).primaryKey({ autoIncrement: true }),
    nome: text('nome', { length: 200 }).notNull(),
    /** Nome da cidade principal do destino. */
    cidade: text('cidade', { length: 120 }),
    /** Estado / região administrativa (nome por extenso). */
    estado: text('estado', { length: 100 }),
    /** Código curto do estado (ex: "SP", "RJ"). */
    estadoCod: text('estado_cod', { length: 10 }),
    /** Nome do país. */
    pais: text('pais', { length: 100 }),
    /** ISO 3166-1 alpha-2 (ex: "BR", "FR"). */
    paisCod: text('pais_cod', { length: 2 }),
    /** Continente (ex: "América do Sul", "Europa"). */
    continente: text('continente', { length: 50 }),
    /** Latitude (geocoding opcional). */
    lat: real('lat'),
    /** Longitude (geocoding opcional). */
    lng: real('lng'),
    notas: text('notas'),
    ativo: integer('ativo', { mode: 'boolean' }).notNull().default(true),
    criadoEm: text('criado_em').notNull().$defaultFn(() => new Date().toISOString()),
    atualizadoEm: text('atualizado_em').notNull().$defaultFn(() => new Date().toISOString()),
  },
  (t) => ({
    idxNome: index('idx_destinos_nome').on(t.nome),
    idxPais: index('idx_destinos_pais').on(t.paisCod),
    idxAtivo: index('idx_destinos_ativo').on(t.ativo),
  })
);

export type Destino = typeof destinos.$inferSelect;
export type NovoDestino = typeof destinos.$inferInsert;

// ─────────────────────────────────────────────────────────────────────────────
// M08 — Agenda: eventos e tarefas
// ─────────────────────────────────────────────────────────────────────────────
export const agendaItens = sqliteTable(
  'agenda_itens',
  {
    id: integer('id').primaryKey({ autoIncrement: true }),
    empresaId: integer('empresa_id').notNull(),
    /** Usuário dono do item (criador ou responsável). */
    userId: text('user_id', { length: 36 }).notNull(),
    /** 'evento' | 'tarefa' */
    tipo: text('tipo', { length: 10 }).notNull().default('evento'),
    titulo: text('titulo', { length: 200 }).notNull(),
    descricao: text('descricao'),
    // Campos de evento
    startDate: text('start_date', { length: 10 }),
    endDate: text('end_date', { length: 10 }),
    startAt: text('start_at', { length: 5 }),
    endAt: text('end_at', { length: 5 }),
    allDay: integer('all_day', { mode: 'boolean' }).notNull().default(true),
    // Campos de tarefa
    vencimento: text('vencimento', { length: 10 }),
    status: text('status', { length: 20 }).notNull().default('pendente'),
    prioridade: text('prioridade', { length: 10 }).notNull().default('normal'),
    done: integer('done', { mode: 'boolean' }).notNull().default(false),
    // Metadados
    criadoPor: text('criado_por', { length: 36 }),
    criadoEm: text('criado_em').notNull().$defaultFn(() => new Date().toISOString()),
    atualizadoEm: text('atualizado_em').notNull().$defaultFn(() => new Date().toISOString()),
  },
  (t) => ({
    idxEmpresaUser: index('idx_agenda_empresa_user').on(t.empresaId, t.userId),
    idxEmpresaTipo: index('idx_agenda_empresa_tipo').on(t.empresaId, t.tipo),
    idxStartDate: index('idx_agenda_start_date').on(t.startDate),
    idxStatus: index('idx_agenda_status').on(t.status),
  })
);

export type AgendaItem = typeof agendaItens.$inferSelect;
export type NovoAgendaItem = typeof agendaItens.$inferInsert;

// ─── M09: Mural de recados ────────────────────────────────────────────────────

export const muralRecados = sqliteTable(
  'mural_recados',
  {
    id:             integer('id').primaryKey({ autoIncrement: true }),
    empresaId:      integer('empresa_id').notNull(),
    remetenteId:    text('remetente_id', { length: 36 }).notNull(),
    destinatarioId: text('destinatario_id', { length: 36 }),  // null = toda empresa
    assunto:        text('assunto', { length: 200 }).notNull().default(''),
    conteudo:       text('conteudo').notNull(),
    criadoEm:       text('criado_em').notNull(),
    atualizadoEm:   text('atualizado_em').notNull(),
  },
  (t) => ({
    idxEmpresaData:  index('idx_mural_empresa_data').on(t.empresaId, t.criadoEm),
    idxDestinatario: index('idx_mural_destinatario').on(t.destinatarioId, t.criadoEm),
    idxRemetente:    index('idx_mural_remetente').on(t.remetenteId, t.criadoEm),
  })
);

export type MuralRecado    = typeof muralRecados.$inferSelect;
export type NovoMuralRecado = typeof muralRecados.$inferInsert;


// ─── M12: Trilha de auditoria v2 ─────────────────────────────────────────────

export const AUDIT_MODULOS = [
  'Vendas', 'Clientes', 'Cadastros', 'Parametros',
  'Escalas', 'Admin', 'perfil', 'LGPD', 'Equipe',
] as const;
export type AuditModuloV2 = (typeof AUDIT_MODULOS)[number];

export const auditLogs = sqliteTable(
  'audit_logs',
  {
    id:         integer('id').primaryKey({ autoIncrement: true }),
    empresaId:  integer('empresa_id').notNull(),
    userId:     text('user_id', { length: 36 }),
    modulo:     text('modulo', { length: 30 }).notNull(),
    acao:       text('acao', { length: 60 }).notNull(),
    detalhes:   text('detalhes'), // JSON serializado
    ip:         text('ip', { length: 45 }),
    userAgent:  text('user_agent', { length: 300 }),
    criadoEm:   text('criado_em').notNull().$defaultFn(() => new Date().toISOString()),
  },
  (t) => ({
    idxEmpresaData: index('idx_audit_empresa_data').on(t.empresaId, t.criadoEm),
    idxUser:        index('idx_audit_user').on(t.userId, t.criadoEm),
    idxModulo:      index('idx_audit_modulo').on(t.empresaId, t.modulo, t.criadoEm),
  })
);

export type AuditLog    = typeof auditLogs.$inferSelect;
export type NovoAuditLog = typeof auditLogs.$inferInsert;
