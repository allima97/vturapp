-- Paridade com Supabase: opcionais era jsonb NOT NULL DEFAULT '[]'::jsonb
-- (supabase/migrations/20261014170000_roteiro_opcionais.sql). O DEFAULT se
-- perdeu na conversão para D1 e inserts que omitem a coluna falhavam com
-- NOT NULL constraint failed. SQLite não altera coluna: recria a tabela
-- seguindo o mesmo padrão de 0015_legado_fks.sql.
PRAGMA foreign_keys = OFF;

CREATE TABLE "legado_bak_roteiro_personalizado" AS SELECT * FROM "legado_roteiro_personalizado";
DROP TABLE "legado_roteiro_personalizado";

CREATE TABLE "legado_roteiro_personalizado" (
  "id" TEXT PRIMARY KEY,
  "created_by" TEXT NOT NULL,
  "company_id" TEXT,
  "nome" TEXT NOT NULL,
  "duracao" INTEGER,
  "inicio_cidade" TEXT,
  "fim_cidade" TEXT,
  "created_at" TEXT,
  "updated_at" TEXT,
  "inclui_texto" TEXT,
  "nao_inclui_texto" TEXT,
  "informacoes_importantes" TEXT,
  "mostrar_pagamento_pdf" INTEGER NOT NULL DEFAULT 0,
  "mostrar_informacoes_pdf" INTEGER NOT NULL DEFAULT 0,
  "mostrar_rodape_pdf" INTEGER NOT NULL DEFAULT 0,
  "opcionais" TEXT NOT NULL DEFAULT '[]',
  CONSTRAINT "roteiro_personalizado_company_id_fkey" FOREIGN KEY ("company_id") REFERENCES "legado_companies" ("id") ON DELETE CASCADE
);

INSERT INTO "legado_roteiro_personalizado" ("id", "created_by", "company_id", "nome", "duracao", "inicio_cidade", "fim_cidade", "created_at", "updated_at", "inclui_texto", "nao_inclui_texto", "informacoes_importantes", "mostrar_pagamento_pdf", "mostrar_informacoes_pdf", "mostrar_rodape_pdf", "opcionais") SELECT "id", "created_by", "company_id", "nome", "duracao", "inicio_cidade", "fim_cidade", "created_at", "updated_at", "inclui_texto", "nao_inclui_texto", "informacoes_importantes", "mostrar_pagamento_pdf", "mostrar_informacoes_pdf", "mostrar_rodape_pdf", COALESCE("opcionais", '[]') FROM "legado_bak_roteiro_personalizado";
DROP TABLE "legado_bak_roteiro_personalizado";

PRAGMA foreign_keys = ON;
