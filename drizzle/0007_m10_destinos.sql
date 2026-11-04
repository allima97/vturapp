-- M10: Catálogo global de destinos (cidades/regiões turísticas).
-- Sem empresa_id: destinos são compartilhados entre todas as empresas.

CREATE TABLE `destinos` (
  `id`          INTEGER PRIMARY KEY AUTOINCREMENT,
  `nome`        TEXT(200) NOT NULL,
  `cidade`      TEXT(120),
  `estado`      TEXT(100),
  `estado_cod`  TEXT(10),
  `pais`        TEXT(100),
  `pais_cod`    TEXT(2),
  `continente`  TEXT(50),
  `lat`         REAL,
  `lng`         REAL,
  `notas`       TEXT,
  `ativo`       INTEGER NOT NULL DEFAULT 1,
  `criado_em`   TEXT NOT NULL,
  `atualizado_em` TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS `idx_destinos_nome`   ON `destinos` (`nome`);
CREATE INDEX IF NOT EXISTS `idx_destinos_pais`   ON `destinos` (`pais_cod`);
CREATE INDEX IF NOT EXISTS `idx_destinos_ativo`  ON `destinos` (`ativo`);
