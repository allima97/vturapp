CREATE TABLE "catalogo_opcionais" (
  "id" TEXT PRIMARY KEY NOT NULL,
  "cidade" TEXT NOT NULL,
  "cidade_chave" TEXT NOT NULL,
  "nome" TEXT NOT NULL,
  "descricao" TEXT NOT NULL DEFAULT '',
  "created_by" TEXT REFERENCES "legado_users" ("id") ON DELETE SET NULL,
  "updated_by" TEXT REFERENCES "legado_users" ("id") ON DELETE SET NULL,
  "created_at" TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  "updated_at" TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now'))
);
CREATE INDEX "catalogo_opcionais_cidade_idx" ON "catalogo_opcionais" ("cidade_chave", "nome", "id");
