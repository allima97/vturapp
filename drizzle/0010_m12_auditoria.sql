-- M12: Trilha de auditoria v2 (D1 — sem Supabase)
--
-- Substitui a gravação em Supabase `logs` para os eventos do Workers runtime.
-- Preserva mesmos nomes de módulo/ação usados no sistema legado para que
-- consultas históricas continuem funcionando.
CREATE TABLE `audit_logs` (
  `id`          INTEGER  PRIMARY KEY AUTOINCREMENT,
  `empresa_id`  INTEGER  NOT NULL REFERENCES `empresas`(`id`) ON DELETE CASCADE,
  `user_id`     TEXT(36)          REFERENCES `user`(`id`) ON DELETE SET NULL,
  `modulo`      TEXT(30)  NOT NULL,
  `acao`        TEXT(60)  NOT NULL,
  -- JSON serializado; campos sensíveis já sanitizados antes de gravar (LGPD Art. 46)
  `detalhes`    TEXT,
  `ip`          TEXT(45),
  `user_agent`  TEXT(300),
  `criado_em`   TEXT      NOT NULL
);

-- Consultas por empresa + data (dashboard de auditoria)
CREATE INDEX `idx_audit_empresa_data` ON `audit_logs`(`empresa_id`, `criado_em`);
-- Consultas por usuário (solicitação LGPD: exportar dados de um titular)
CREATE INDEX `idx_audit_user`         ON `audit_logs`(`user_id`, `criado_em`);
-- Filtro por módulo (admin filtra por tipo de operação)
CREATE INDEX `idx_audit_modulo`       ON `audit_logs`(`empresa_id`, `modulo`, `criado_em`);
