-- M09: Mural de recados (polling com cursor — ADR-008)
CREATE TABLE `mural_recados` (
  `id`               INTEGER  PRIMARY KEY AUTOINCREMENT,
  `empresa_id`       INTEGER  NOT NULL REFERENCES `empresas`(`id`) ON DELETE CASCADE,
  `remetente_id`     TEXT(36) NOT NULL REFERENCES `user`(`id`) ON DELETE CASCADE,
  `destinatario_id`  TEXT(36)          REFERENCES `user`(`id`) ON DELETE SET NULL,
  -- NULL = mensagem para toda a empresa
  `assunto`          TEXT(200) NOT NULL DEFAULT '',
  `conteudo`         TEXT      NOT NULL,
  `criado_em`        TEXT      NOT NULL,
  `atualizado_em`    TEXT      NOT NULL
);

CREATE INDEX `idx_mural_empresa_data` ON `mural_recados`(`empresa_id`, `criado_em`);
CREATE INDEX `idx_mural_destinatario`  ON `mural_recados`(`destinatario_id`, `criado_em`);
CREATE INDEX `idx_mural_remetente`     ON `mural_recados`(`remetente_id`, `criado_em`);
