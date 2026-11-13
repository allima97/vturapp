CREATE TABLE "legado_bak_voucher_dias_0029" AS SELECT * FROM "legado_voucher_dias";
CREATE TABLE "legado_bak_voucher_hoteis_0029" AS SELECT * FROM "legado_voucher_hoteis";
CREATE TABLE "legado_vouchers_0029" (
  "id" TEXT PRIMARY KEY,
  "company_id" TEXT,
  "created_by" TEXT,
  "updated_by" TEXT,
  "provider" TEXT NOT NULL,
  "nome" TEXT NOT NULL,
  "codigo_sistema" TEXT,
  "codigo_fornecedor" TEXT,
  "reserva_online" TEXT,
  "operador" TEXT,
  "resumo" TEXT,
  "data_inicio" TEXT,
  "data_fim" TEXT,
  "ativo" INTEGER NOT NULL DEFAULT 0,
  "created_at" TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  "updated_at" TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  "passageiros" TEXT,
  "tipo_acomodacao" TEXT,
  "extra_data" TEXT NOT NULL,
  "viagem_id" TEXT,
  CONSTRAINT "vouchers_company_id_fkey" FOREIGN KEY ("company_id") REFERENCES "legado_companies" ("id") ON DELETE CASCADE,
  CONSTRAINT "vouchers_created_by_fkey" FOREIGN KEY ("created_by") REFERENCES "legado_users" ("id") ON DELETE SET NULL,
  CONSTRAINT "vouchers_updated_by_fkey" FOREIGN KEY ("updated_by") REFERENCES "legado_users" ("id") ON DELETE SET NULL,
  CONSTRAINT "vouchers_viagem_id_fkey" FOREIGN KEY ("viagem_id") REFERENCES "legado_viagens" ("id") ON DELETE SET NULL
);
INSERT INTO "legado_vouchers_0029" SELECT * FROM "legado_vouchers";
DROP TABLE "legado_vouchers";
ALTER TABLE "legado_vouchers_0029" RENAME TO "legado_vouchers";
INSERT OR IGNORE INTO "legado_voucher_dias" SELECT * FROM "legado_bak_voucher_dias_0029";
INSERT OR IGNORE INTO "legado_voucher_hoteis" SELECT * FROM "legado_bak_voucher_hoteis_0029";
DROP TABLE "legado_bak_voucher_dias_0029";
DROP TABLE "legado_bak_voucher_hoteis_0029";
CREATE INDEX "legado_idx_vouchers_company_provider" ON "legado_vouchers" ("company_id", "provider", "updated_at");
CREATE INDEX "legado_idx_vouchers_individual" ON "legado_vouchers" ("created_by", "updated_at") WHERE "company_id" IS NULL;
