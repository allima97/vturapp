-- Preferencias pessoais tambem pertencem a usuarios individuais sem empresa.
-- Recria as duas tabelas para preservar compartilhamentos com FKs ativas no D1.
CREATE TABLE "legado_bak_minhas_preferencias_shares_0017" AS
  SELECT * FROM "legado_minhas_preferencias_shares";
DROP TABLE "legado_minhas_preferencias_shares";

CREATE TABLE "legado_bak_minhas_preferencias_0017" AS
  SELECT * FROM "legado_minhas_preferencias";
DROP TABLE "legado_minhas_preferencias";

CREATE TABLE "legado_minhas_preferencias" (
  "id" TEXT PRIMARY KEY,
  "company_id" TEXT,
  "created_by" TEXT NOT NULL,
  "tipo_produto_id" TEXT,
  "cidade_id" TEXT,
  "nome" TEXT NOT NULL,
  "localizacao" TEXT,
  "classificacao" TEXT,
  "observacao" TEXT,
  "created_at" TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  "updated_at" TEXT,
  "updated_by" TEXT,
  CONSTRAINT "minhas_preferencias_cidade_id_fkey" FOREIGN KEY ("cidade_id") REFERENCES "legado_cidades" ("id") ON DELETE SET NULL,
  CONSTRAINT "minhas_preferencias_company_id_fkey" FOREIGN KEY ("company_id") REFERENCES "legado_companies" ("id") ON DELETE CASCADE,
  CONSTRAINT "minhas_preferencias_created_by_fkey" FOREIGN KEY ("created_by") REFERENCES "legado_users" ("id") ON DELETE CASCADE,
  CONSTRAINT "minhas_preferencias_tipo_produto_id_fkey" FOREIGN KEY ("tipo_produto_id") REFERENCES "legado_tipo_produtos" ("id") ON DELETE SET NULL,
  CONSTRAINT "minhas_preferencias_updated_by_fkey" FOREIGN KEY ("updated_by") REFERENCES "legado_users" ("id") ON DELETE SET NULL
);
INSERT INTO "legado_minhas_preferencias"
  SELECT * FROM "legado_bak_minhas_preferencias_0017";
DROP TABLE "legado_bak_minhas_preferencias_0017";

CREATE TABLE "legado_minhas_preferencias_shares" (
  "id" TEXT PRIMARY KEY,
  "company_id" TEXT NOT NULL,
  "preferencia_id" TEXT NOT NULL,
  "shared_by" TEXT NOT NULL,
  "shared_with" TEXT NOT NULL,
  "status" TEXT NOT NULL,
  "created_at" TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  "accepted_at" TEXT,
  "revoked_at" TEXT,
  CONSTRAINT "minhas_preferencias_shares_company_id_fkey" FOREIGN KEY ("company_id") REFERENCES "legado_companies" ("id") ON DELETE CASCADE,
  CONSTRAINT "minhas_preferencias_shares_preferencia_id_fkey" FOREIGN KEY ("preferencia_id") REFERENCES "legado_minhas_preferencias" ("id") ON DELETE CASCADE,
  CONSTRAINT "minhas_preferencias_shares_shared_by_fkey" FOREIGN KEY ("shared_by") REFERENCES "legado_users" ("id") ON DELETE CASCADE,
  CONSTRAINT "minhas_preferencias_shares_shared_with_fkey" FOREIGN KEY ("shared_with") REFERENCES "legado_users" ("id") ON DELETE CASCADE
);
INSERT INTO "legado_minhas_preferencias_shares"
  SELECT * FROM "legado_bak_minhas_preferencias_shares_0017";
DROP TABLE "legado_bak_minhas_preferencias_shares_0017";

CREATE INDEX "legado_idx_minhas_preferencias_cidade" ON "legado_minhas_preferencias" ("cidade_id");
CREATE INDEX "legado_idx_minhas_preferencias_company_created" ON "legado_minhas_preferencias" ("company_id", "created_at");
CREATE INDEX "legado_idx_minhas_preferencias_owner" ON "legado_minhas_preferencias" ("created_by", "created_at");
CREATE INDEX "legado_idx_minhas_preferencias_tipo" ON "legado_minhas_preferencias" ("tipo_produto_id");
CREATE INDEX "legado_idx_minhas_preferencias_shares_by" ON "legado_minhas_preferencias_shares" ("shared_by", "created_at");
CREATE INDEX "legado_idx_minhas_preferencias_shares_company" ON "legado_minhas_preferencias_shares" ("company_id", "created_at");
CREATE INDEX "legado_idx_minhas_preferencias_shares_with" ON "legado_minhas_preferencias_shares" ("shared_with", "created_at");
