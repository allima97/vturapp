CREATE TABLE IF NOT EXISTS "legado_cliente_avisos_historico" (
  "id" TEXT PRIMARY KEY NOT NULL,
  "cliente_id" TEXT NOT NULL REFERENCES "legado_clientes" ("id") ON DELETE CASCADE,
  "template_id" TEXT,
  "canal" TEXT NOT NULL,
  "assunto" TEXT,
  "mensagem" TEXT,
  "status" TEXT,
  "provider" TEXT,
  "provider_id" TEXT,
  "destinatario" TEXT,
  "enviado_por" TEXT,
  "created_at" TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
);

CREATE INDEX IF NOT EXISTS "cliente_avisos_historico_cliente_data_idx"
  ON "legado_cliente_avisos_historico" ("cliente_id", "created_at" DESC);
