-- M08: agenda_itens (eventos e tarefas) sobre D1
CREATE TABLE `agenda_itens` (
  `id`          INTEGER PRIMARY KEY AUTOINCREMENT,
  `empresa_id`  INTEGER NOT NULL REFERENCES `empresas`(`id`) ON DELETE CASCADE,
  `user_id`     TEXT(36) NOT NULL REFERENCES `user`(`id`) ON DELETE CASCADE,
  `tipo`        TEXT(10) NOT NULL DEFAULT 'evento',   -- 'evento' | 'tarefa'
  `titulo`      TEXT(200) NOT NULL,
  `descricao`   TEXT,
  -- campos de evento
  `start_date`  TEXT(10),   -- YYYY-MM-DD
  `end_date`    TEXT(10),   -- YYYY-MM-DD
  `start_at`    TEXT(5),    -- HH:MM
  `end_at`      TEXT(5),    -- HH:MM
  `all_day`     INTEGER NOT NULL DEFAULT 1,
  -- campos de tarefa
  `vencimento`  TEXT(10),   -- YYYY-MM-DD
  `status`      TEXT(20) NOT NULL DEFAULT 'pendente', -- pendente | em_andamento | concluida | cancelada
  `prioridade`  TEXT(10) NOT NULL DEFAULT 'normal',   -- baixa | normal | alta | urgente
  `done`        INTEGER NOT NULL DEFAULT 0,
  -- metadados
  `criado_por`  TEXT(36) REFERENCES `user`(`id`) ON DELETE SET NULL,
  `criado_em`   TEXT NOT NULL,
  `atualizado_em` TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS `idx_agenda_empresa_user`  ON `agenda_itens` (`empresa_id`, `user_id`);
CREATE INDEX IF NOT EXISTS `idx_agenda_empresa_tipo`  ON `agenda_itens` (`empresa_id`, `tipo`);
CREATE INDEX IF NOT EXISTS `idx_agenda_start_date`    ON `agenda_itens` (`start_date`);
CREATE INDEX IF NOT EXISTS `idx_agenda_status`        ON `agenda_itens` (`status`);
