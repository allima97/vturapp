-- Migration: 0002_f2_schema_dominio
-- F2-01: Schema por domínio — empresas expandida, user+empresa_id,
--        membros_empresa, convites, índices.
--
-- INCREMENTAL sobre:
--   0000_initial_schema (empresas)
--   0001_auth_schema    (user, session, account, verification)
--
-- Convenções: ADR-005 para tabelas de negócio (TEXT ISO 8601, centavos, boolean 0/1)
-- Better Auth exception: datas de auth usam INTEGER timestamp_ms.

-- ─────────────────────────────────────────────────────────────────────────────
-- PASSO 1 — Expandir tabela empresas
-- ─────────────────────────────────────────────────────────────────────────────

ALTER TABLE `empresas` ADD `slug` text(80);
--> statement-breakpoint
ALTER TABLE `empresas` ADD `plano` text(20) DEFAULT 'trial' NOT NULL;
--> statement-breakpoint
ALTER TABLE `empresas` ADD `limite_usuarios` integer DEFAULT 5 NOT NULL;
--> statement-breakpoint

-- Renomear índice de CNPJ (de 0000) para convenção idx_* e criar índice de slug
DROP INDEX IF EXISTS `empresas_cnpj_unique`;
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS `idx_empresas_cnpj` ON `empresas` (`cnpj`);
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS `idx_empresas_slug` ON `empresas` (`slug`);
--> statement-breakpoint

-- ─────────────────────────────────────────────────────────────────────────────
-- PASSO 2 — Adicionar empresa_id na tabela user (Better Auth)
-- ─────────────────────────────────────────────────────────────────────────────
-- Nota: empresas deve existir antes de adicionar a FK.
-- NULL para super-admins do sistema sem empresa vinculada.

ALTER TABLE `user` ADD `empresa_id` integer REFERENCES `empresas`(`id`) ON DELETE SET NULL;
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS `idx_user_empresa_id` ON `user` (`empresa_id`);
--> statement-breakpoint
-- Índice explícito no email (0001 usou UNIQUE inline no DDL)
CREATE UNIQUE INDEX IF NOT EXISTS `idx_user_email` ON `user` (`email`);
--> statement-breakpoint

-- ─────────────────────────────────────────────────────────────────────────────
-- PASSO 3 — Nova tabela: membros_empresa
-- ─────────────────────────────────────────────────────────────────────────────
-- Associação usuário ↔ empresa com papel RBAC.
-- CHECK garante apenas papéis válidos; enforçado também na camada de serviço.

CREATE TABLE IF NOT EXISTS `membros_empresa` (
  `id`            integer PRIMARY KEY AUTOINCREMENT NOT NULL,
  `empresa_id`    integer NOT NULL REFERENCES `empresas`(`id`) ON DELETE CASCADE,
  `user_id`       text(36) NOT NULL REFERENCES `user`(`id`) ON DELETE CASCADE,
  `papel`         text(20) NOT NULL DEFAULT 'visualizador'
                  CHECK(`papel` IN ('admin','operador','visualizador')),
  `ativo`         integer NOT NULL DEFAULT 1,
  `criado_em`     text NOT NULL,
  `atualizado_em` text NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS `idx_membros_user_id`      ON `membros_empresa` (`user_id`);
--> statement-breakpoint
CREATE INDEX        IF NOT EXISTS `idx_membros_empresa_id`   ON `membros_empresa` (`empresa_id`);
--> statement-breakpoint
CREATE INDEX        IF NOT EXISTS `idx_membros_empresa_papel` ON `membros_empresa` (`empresa_id`, `papel`);
--> statement-breakpoint

-- ─────────────────────────────────────────────────────────────────────────────
-- PASSO 4 — Nova tabela: convites
-- ─────────────────────────────────────────────────────────────────────────────
-- Tokens de convite para novos membros. Fluxo completo implementado em F2-02.

CREATE TABLE IF NOT EXISTS `convites` (
  `id`            integer PRIMARY KEY AUTOINCREMENT NOT NULL,
  `empresa_id`    integer NOT NULL REFERENCES `empresas`(`id`) ON DELETE CASCADE,
  `email`         text(320) NOT NULL,
  `papel`         text(20) NOT NULL DEFAULT 'operador'
                  CHECK(`papel` IN ('admin','operador','visualizador')),
  `token`         text(36) NOT NULL,
  `expires_at`    text NOT NULL,
  `aceito_em`     text,
  `convidado_por` text(36) REFERENCES `user`(`id`) ON DELETE SET NULL,
  `criado_em`     text NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS `idx_convites_token`      ON `convites` (`token`);
--> statement-breakpoint
CREATE INDEX        IF NOT EXISTS `idx_convites_empresa_id` ON `convites` (`empresa_id`);
--> statement-breakpoint
CREATE INDEX        IF NOT EXISTS `idx_convites_email`      ON `convites` (`email`);
