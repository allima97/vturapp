CREATE TABLE "passagens" (
  "id" TEXT PRIMARY KEY NOT NULL,
  "company_id" TEXT NOT NULL REFERENCES "legado_companies" ("id") ON DELETE CASCADE,
  "created_by" TEXT NOT NULL REFERENCES "legado_users" ("id"),
  "localizador" TEXT NOT NULL,
  "dados" TEXT NOT NULL,
  "created_at" TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  "updated_at" TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now'))
);
CREATE INDEX "passagens_company_updated" ON "passagens" ("company_id", "updated_at");
