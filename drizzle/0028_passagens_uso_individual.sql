CREATE TABLE "passagens_0028" (
  "id" TEXT PRIMARY KEY NOT NULL,
  "company_id" TEXT REFERENCES "legado_companies" ("id") ON DELETE CASCADE,
  "created_by" TEXT NOT NULL REFERENCES "legado_users" ("id"),
  "localizador" TEXT NOT NULL,
  "dados" TEXT NOT NULL,
  "created_at" TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  "updated_at" TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now'))
);
INSERT INTO "passagens_0028"
  ("id", "company_id", "created_by", "localizador", "dados", "created_at", "updated_at")
  SELECT "id", "company_id", "created_by", "localizador", "dados", "created_at", "updated_at"
  FROM "passagens";
DROP TABLE "passagens";
ALTER TABLE "passagens_0028" RENAME TO "passagens";
CREATE INDEX "passagens_company_updated" ON "passagens" ("company_id", "updated_at");
CREATE INDEX "passagens_individual_updated" ON "passagens" ("created_by", "updated_at")
  WHERE "company_id" IS NULL;
