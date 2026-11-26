-- Modelo de IA dos roteiros escolhido pelo admin em /admin/ia (linha única,
-- id = 1). Sem linha: vale a variável ROTEIRO_IA_MODELO do wrangler e, por
-- fim, o padrão do código (Claude Haiku 5.5). provedor = 'anthropic' | 'groq'.
CREATE TABLE "roteiro_ia_config" (
  "id" INTEGER PRIMARY KEY NOT NULL CHECK ("id" = 1),
  "provedor" TEXT NOT NULL,
  "modelo" TEXT NOT NULL,
  "updated_by" TEXT REFERENCES "legado_users" ("id") ON DELETE SET NULL,
  "updated_at" TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now'))
);
