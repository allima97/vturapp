ALTER TABLE "legado_quote_item" ADD COLUMN "destino_geografico_id" TEXT;
ALTER TABLE "legado_consultorias_online" ADD COLUMN "destino_geografico_id" TEXT;
ALTER TABLE "legado_viagens" ADD COLUMN "destino_geografico_id" TEXT;
ALTER TABLE "legado_viagens" ADD COLUMN "origem_geografica_id" TEXT;
ALTER TABLE "legado_voucher_dias" ADD COLUMN "destino_geografico_id" TEXT;
ALTER TABLE "legado_voucher_hoteis" ADD COLUMN "destino_geografico_id" TEXT;
ALTER TABLE "legado_minhas_preferencias" ADD COLUMN "destino_geografico_id" TEXT;

CREATE TABLE IF NOT EXISTS "destinos_revisao_geonames" (
  "id" TEXT PRIMARY KEY NOT NULL,
  "destino_personalizado_id" TEXT NOT NULL,
  "referencia_geonames_id" INTEGER NOT NULL,
  "tipo" TEXT NOT NULL CHECK ("tipo" IN ('removida', 'alterada')),
  "resumo" TEXT NOT NULL,
  "detectado_em" TEXT NOT NULL,
  "status" TEXT NOT NULL DEFAULT 'pendente' CHECK ("status" IN ('pendente', 'revisada')),
  UNIQUE ("destino_personalizado_id", "referencia_geonames_id", "tipo", "resumo"),
  FOREIGN KEY ("destino_personalizado_id") REFERENCES "destinos_personalizados" ("id") ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS "destinos_revisao_geonames_status_idx"
  ON "destinos_revisao_geonames" ("status", "tipo", "destino_personalizado_id");
