CREATE TABLE "legado_voucher_assets_0030" (
  "id" TEXT PRIMARY KEY,
  "company_id" TEXT,
  "created_by" TEXT,
  "updated_by" TEXT,
  "provider" TEXT NOT NULL,
  "asset_kind" TEXT NOT NULL,
  "label" TEXT,
  "storage_bucket" TEXT NOT NULL,
  "storage_path" TEXT NOT NULL,
  "mime_type" TEXT,
  "size_bytes" INTEGER,
  "ativo" INTEGER NOT NULL DEFAULT 0,
  "ordem" INTEGER NOT NULL DEFAULT 0,
  "created_at" TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  "updated_at" TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  CONSTRAINT "voucher_assets_company_id_fkey" FOREIGN KEY ("company_id") REFERENCES "legado_companies" ("id") ON DELETE CASCADE,
  CONSTRAINT "voucher_assets_created_by_fkey" FOREIGN KEY ("created_by") REFERENCES "legado_users" ("id") ON DELETE SET NULL,
  CONSTRAINT "voucher_assets_updated_by_fkey" FOREIGN KEY ("updated_by") REFERENCES "legado_users" ("id") ON DELETE SET NULL
);
INSERT INTO "legado_voucher_assets_0030" SELECT * FROM "legado_voucher_assets";
DROP TABLE "legado_voucher_assets";
ALTER TABLE "legado_voucher_assets_0030" RENAME TO "legado_voucher_assets";
CREATE INDEX "legado_idx_voucher_assets_company_provider" ON "legado_voucher_assets" ("company_id", "provider", "asset_kind", "ordem", "created_at");
CREATE INDEX "legado_idx_voucher_assets_individual" ON "legado_voucher_assets" ("created_by", "provider", "asset_kind", "ordem") WHERE "company_id" IS NULL;

CREATE TABLE "voucher_visual_settings" (
  "user_id" TEXT PRIMARY KEY REFERENCES "legado_users" ("id") ON DELETE CASCADE,
  "logo_esquerdo" TEXT NOT NULL DEFAULT 'vtur' CHECK ("logo_esquerdo" IN ('vtur', 'empresa', 'operadora'))
);
