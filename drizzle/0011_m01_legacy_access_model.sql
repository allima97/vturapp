-- M01/F2: estruturas necessárias para preservar o modelo de acesso legado.
-- A migration é aditiva; rotas existentes continuam no RBAC simples até a
-- substituição dos guards e dos filtros multiempresa por domínio.

CREATE TABLE `user_types` (
  `id` TEXT PRIMARY KEY NOT NULL,
  `name` TEXT NOT NULL,
  `description` TEXT,
  `created_at` TEXT NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `idx_user_types_name` ON `user_types` (`name`);
--> statement-breakpoint

CREATE TABLE `user_profiles` (
  `user_id` TEXT PRIMARY KEY NOT NULL REFERENCES `user`(`id`) ON DELETE CASCADE,
  `user_type_id` TEXT REFERENCES `user_types`(`id`) ON DELETE SET NULL,
  `uso_individual` INTEGER NOT NULL DEFAULT 1 CHECK (`uso_individual` IN (0, 1)),
  `ativo` INTEGER NOT NULL DEFAULT 1 CHECK (`ativo` IN (0, 1)),
  `participa_ranking` INTEGER NOT NULL DEFAULT 0 CHECK (`participa_ranking` IN (0, 1)),
  `updated_at` TEXT NOT NULL
);
--> statement-breakpoint

CREATE TABLE `user_type_default_perms` (
  `id` TEXT PRIMARY KEY NOT NULL,
  `user_type_id` TEXT NOT NULL REFERENCES `user_types`(`id`) ON DELETE CASCADE,
  `modulo` TEXT NOT NULL CHECK (length(trim(`modulo`)) > 0),
  `permissao` TEXT NOT NULL DEFAULT 'none'
    CHECK (`permissao` IN ('none', 'view', 'create', 'edit', 'delete', 'admin')),
  `ativo` INTEGER NOT NULL DEFAULT 1 CHECK (`ativo` IN (0, 1)),
  `created_at` TEXT NOT NULL,
  `updated_at` TEXT NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `idx_user_type_default_perms_type_module` ON `user_type_default_perms` (`user_type_id`, `modulo`);
--> statement-breakpoint
CREATE INDEX `idx_user_type_default_perms_type` ON `user_type_default_perms` (`user_type_id`, `ativo`);
--> statement-breakpoint

CREATE TABLE `modulo_acesso` (
  `id` TEXT PRIMARY KEY NOT NULL,
  `usuario_id` TEXT NOT NULL REFERENCES `user`(`id`) ON DELETE CASCADE,
  `modulo` TEXT NOT NULL CHECK (length(trim(`modulo`)) > 0),
  `permissao` TEXT NOT NULL DEFAULT 'none'
    CHECK (`permissao` IN ('none', 'view', 'create', 'edit', 'delete', 'admin')),
  `ativo` INTEGER NOT NULL DEFAULT 1 CHECK (`ativo` IN (0, 1)),
  `created_at` TEXT NOT NULL,
  `updated_at` TEXT NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `idx_modulo_acesso_user_module` ON `modulo_acesso` (`usuario_id`, `modulo`);
--> statement-breakpoint
CREATE INDEX `idx_modulo_acesso_user_active` ON `modulo_acesso` (`usuario_id`, `ativo`);
--> statement-breakpoint

CREATE TABLE `master_empresas` (
  `id` TEXT PRIMARY KEY NOT NULL,
  `master_id` TEXT NOT NULL REFERENCES `user`(`id`) ON DELETE CASCADE,
  `company_id` INTEGER NOT NULL REFERENCES `empresas`(`id`) ON DELETE CASCADE,
  `status` TEXT NOT NULL DEFAULT 'pending' CHECK (`status` IN ('pending', 'approved', 'rejected')),
  `created_at` TEXT NOT NULL,
  `approved_at` TEXT,
  `approved_by` TEXT REFERENCES `user`(`id`) ON DELETE SET NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `idx_master_empresas_pair` ON `master_empresas` (`master_id`, `company_id`);
--> statement-breakpoint
CREATE INDEX `idx_master_empresas_company_status` ON `master_empresas` (`company_id`, `status`);
--> statement-breakpoint

CREATE TABLE `financeiro_empresas` (
  `id` TEXT PRIMARY KEY NOT NULL,
  `financeiro_id` TEXT NOT NULL REFERENCES `user`(`id`) ON DELETE CASCADE,
  `company_id` INTEGER NOT NULL REFERENCES `empresas`(`id`) ON DELETE CASCADE,
  `status` TEXT NOT NULL DEFAULT 'approved' CHECK (`status` IN ('pending', 'approved', 'rejected')),
  `created_at` TEXT NOT NULL,
  `approved_at` TEXT,
  `created_by` TEXT REFERENCES `user`(`id`) ON DELETE SET NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `idx_financeiro_empresas_pair` ON `financeiro_empresas` (`financeiro_id`, `company_id`);
--> statement-breakpoint
CREATE INDEX `idx_financeiro_empresas_company_status` ON `financeiro_empresas` (`company_id`, `status`);
--> statement-breakpoint

CREATE TABLE `gestor_vendedor` (
  `id` TEXT PRIMARY KEY NOT NULL,
  `gestor_id` TEXT NOT NULL REFERENCES `user`(`id`) ON DELETE CASCADE,
  `vendedor_id` TEXT NOT NULL REFERENCES `user`(`id`) ON DELETE CASCADE,
  `company_id` INTEGER NOT NULL REFERENCES `empresas`(`id`) ON DELETE CASCADE,
  `pode_modificar` INTEGER NOT NULL DEFAULT 0 CHECK (`pode_modificar` IN (0, 1)),
  `created_at` TEXT NOT NULL,
  `ativo` INTEGER NOT NULL DEFAULT 1 CHECK (`ativo` IN (0, 1)),
  CHECK (`gestor_id` <> `vendedor_id`)
);
--> statement-breakpoint
CREATE UNIQUE INDEX `idx_gestor_vendedor_pair` ON `gestor_vendedor` (`gestor_id`, `vendedor_id`, `company_id`);
--> statement-breakpoint
CREATE INDEX `idx_gestor_vendedor_team` ON `gestor_vendedor` (`gestor_id`, `company_id`, `ativo`);
--> statement-breakpoint
CREATE INDEX `idx_gestor_vendedor_member` ON `gestor_vendedor` (`vendedor_id`, `company_id`, `ativo`);
--> statement-breakpoint

CREATE TABLE `gestor_equipe_compartilhada` (
  `gestor_id` TEXT PRIMARY KEY NOT NULL REFERENCES `user`(`id`) ON DELETE CASCADE,
  `gestor_base_id` TEXT NOT NULL REFERENCES `user`(`id`) ON DELETE CASCADE,
  `created_at` TEXT NOT NULL,
  `created_by` TEXT REFERENCES `user`(`id`) ON DELETE SET NULL,
  CHECK (`gestor_id` <> `gestor_base_id`)
);
--> statement-breakpoint

CREATE TABLE `system_module_settings` (
  `module_key` TEXT PRIMARY KEY NOT NULL,
  `enabled` INTEGER NOT NULL DEFAULT 1 CHECK (`enabled` IN (0, 1)),
  `reason` TEXT,
  `updated_at` TEXT NOT NULL,
  `updated_by` TEXT REFERENCES `user`(`id`) ON DELETE SET NULL
);
