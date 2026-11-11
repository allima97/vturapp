-- Clientes individuais podem ter acompanhantes sem empresa.
-- Preserva os vínculos de viagens durante a recriação das tabelas com FKs ativas.
CREATE TABLE "legado_bak_viagem_acompanhantes_0026" AS
  SELECT * FROM "legado_viagem_acompanhantes";
DROP TABLE "legado_viagem_acompanhantes";

CREATE TABLE "legado_bak_cliente_acompanhantes_0026" AS
  SELECT * FROM "legado_cliente_acompanhantes";
DROP TABLE "legado_cliente_acompanhantes";

CREATE TABLE "legado_cliente_acompanhantes" (
  "id" TEXT PRIMARY KEY,
  "cliente_id" TEXT NOT NULL,
  "company_id" TEXT,
  "nome_completo" TEXT NOT NULL,
  "cpf" TEXT,
  "rg" TEXT,
  "telefone" TEXT,
  "grau_parentesco" TEXT,
  "data_nascimento" TEXT,
  "observacoes" TEXT,
  "ativo" INTEGER NOT NULL DEFAULT 0,
  "created_by" TEXT,
  "created_at" TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  "updated_at" TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  CONSTRAINT "cliente_acompanhantes_cliente_id_fkey" FOREIGN KEY ("cliente_id") REFERENCES "legado_clientes" ("id") ON DELETE CASCADE,
  CONSTRAINT "cliente_acompanhantes_company_id_fkey" FOREIGN KEY ("company_id") REFERENCES "legado_companies" ("id") ON DELETE NO ACTION,
  CONSTRAINT "cliente_acompanhantes_created_by_fkey" FOREIGN KEY ("created_by") REFERENCES "legado_users" ("id") ON DELETE NO ACTION
);
INSERT INTO "legado_cliente_acompanhantes"
  SELECT * FROM "legado_bak_cliente_acompanhantes_0026";
DROP TABLE "legado_bak_cliente_acompanhantes_0026";

CREATE TABLE "legado_viagem_acompanhantes" (
  "id" TEXT PRIMARY KEY,
  "viagem_id" TEXT NOT NULL,
  "acompanhante_id" TEXT NOT NULL,
  "company_id" TEXT NOT NULL,
  "papel" TEXT,
  "documento_url" TEXT,
  "observacoes" TEXT,
  "created_by" TEXT,
  "created_at" TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  "updated_at" TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  CONSTRAINT "viagem_acompanhantes_acompanhante_id_fkey" FOREIGN KEY ("acompanhante_id") REFERENCES "legado_cliente_acompanhantes" ("id") ON DELETE CASCADE,
  CONSTRAINT "viagem_acompanhantes_company_id_fkey" FOREIGN KEY ("company_id") REFERENCES "legado_companies" ("id") ON DELETE NO ACTION,
  CONSTRAINT "viagem_acompanhantes_created_by_fkey" FOREIGN KEY ("created_by") REFERENCES "legado_users" ("id") ON DELETE NO ACTION,
  CONSTRAINT "viagem_acompanhantes_viagem_id_fkey" FOREIGN KEY ("viagem_id") REFERENCES "legado_viagens" ("id") ON DELETE CASCADE
);
INSERT INTO "legado_viagem_acompanhantes"
  SELECT * FROM "legado_bak_viagem_acompanhantes_0026";
DROP TABLE "legado_bak_viagem_acompanhantes_0026";

CREATE INDEX "legado_idx_viagem_acompanhantes_viagem"
  ON "legado_viagem_acompanhantes" ("viagem_id");
