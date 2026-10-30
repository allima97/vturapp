-- Migration: 0000_initial_schema
-- Gerada para: F1-03 prova de stack Drizzle + D1
-- Tabelas iniciais: empresas
-- 
-- Convenções (ADR-005):
--   - Dinheiro: INTEGER (centavos)
--   - Datas:    TEXT (ISO 8601)
--   - Boolean:  INTEGER (0/1)

CREATE TABLE IF NOT EXISTS `empresas` (
	`id`           INTEGER PRIMARY KEY AUTOINCREMENT,
	`nome`         TEXT(200) NOT NULL,
	`cnpj`         TEXT(14),
	`timezone`     TEXT(64) NOT NULL DEFAULT 'America/Sao_Paulo',
	`ativo`        INTEGER NOT NULL DEFAULT true,
	`criado_em`    TEXT NOT NULL,
	`atualizado_em` TEXT NOT NULL
);

-- Índice para buscas por CNPJ
CREATE UNIQUE INDEX IF NOT EXISTS `empresas_cnpj_unique` ON `empresas` (`cnpj`);
