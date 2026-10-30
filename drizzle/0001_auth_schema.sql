-- Migration: 0001_auth_schema
-- Gerada para: F1-04 prova de stack Better Auth + D1
-- Tabelas: user, session, account, verification
--
-- Nota: estas tabelas são gerenciadas pelo Better Auth.
-- Datas usam INTEGER (timestamp em ms) — padrão do Better Auth para SQLite.
-- Exceção intencional ao ADR-005 (que se aplica a tabelas de negócio).

CREATE TABLE IF NOT EXISTS `user` (
	`id`              TEXT PRIMARY KEY,
	`name`            TEXT NOT NULL,
	`email`           TEXT NOT NULL UNIQUE,
	`email_verified`  INTEGER NOT NULL DEFAULT false,
	`image`           TEXT,
	`created_at`      INTEGER NOT NULL,
	`updated_at`      INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS `session` (
	`id`          TEXT PRIMARY KEY,
	`user_id`     TEXT NOT NULL REFERENCES `user`(`id`) ON DELETE CASCADE,
	`token`       TEXT NOT NULL UNIQUE,
	`expires_at`  INTEGER NOT NULL,
	`ip_address`  TEXT,
	`user_agent`  TEXT,
	`created_at`  INTEGER NOT NULL,
	`updated_at`  INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS `account` (
	`id`                        TEXT PRIMARY KEY,
	`user_id`                   TEXT NOT NULL REFERENCES `user`(`id`) ON DELETE CASCADE,
	`account_id`                TEXT NOT NULL,
	`provider_id`               TEXT NOT NULL,
	`access_token`              TEXT,
	`refresh_token`             TEXT,
	`access_token_expires_at`   INTEGER,
	`refresh_token_expires_at`  INTEGER,
	`scope`                     TEXT,
	`id_token`                  TEXT,
	`password`                  TEXT,
	`created_at`                INTEGER NOT NULL,
	`updated_at`                INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS `verification` (
	`id`          TEXT PRIMARY KEY,
	`identifier`  TEXT NOT NULL,
	`value`       TEXT NOT NULL,
	`expires_at`  INTEGER NOT NULL,
	`created_at`  INTEGER NOT NULL,
	`updated_at`  INTEGER NOT NULL
);

-- Índices de performance para sessões e contas
CREATE INDEX IF NOT EXISTS `session_user_id_idx` ON `session` (`user_id`);
CREATE INDEX IF NOT EXISTS `account_user_id_idx` ON `account` (`user_id`);
CREATE INDEX IF NOT EXISTS `account_provider_idx` ON `account` (`provider_id`, `account_id`);
