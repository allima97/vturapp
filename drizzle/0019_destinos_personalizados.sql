CREATE TABLE "destinos_personalizados" (
  "id" TEXT PRIMARY KEY NOT NULL,
  "nome" TEXT NOT NULL,
  "nome_normalizado" TEXT NOT NULL,
  "referencia_geonames_id" INTEGER NOT NULL CHECK ("referencia_geonames_id" > 0),
  "created_at" TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  UNIQUE ("nome_normalizado", "referencia_geonames_id")
);
CREATE INDEX "destinos_personalizados_nome_idx"
  ON "destinos_personalizados" ("nome_normalizado", "id");
