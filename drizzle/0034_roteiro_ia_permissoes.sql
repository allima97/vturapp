-- Permite ao admin liberar (ou não) a geração de roteiro por IA para cada
-- usuário, e limitar quantos roteiros por IA esse usuário pode gerar por dia
-- (janela de 24h) e por mês (janela de 30 dias). Sem linha para o usuário =
-- não liberado. limite_dia/limite_mes NULL = sem limite configurado (usa o
-- padrão de segurança no código, hoje 30 por dia).
CREATE TABLE "roteiro_ia_permissoes" (
  "user_id" TEXT PRIMARY KEY NOT NULL REFERENCES "legado_users" ("id") ON DELETE CASCADE,
  "liberado" INTEGER NOT NULL DEFAULT 0,
  "limite_dia" INTEGER,
  "limite_mes" INTEGER,
  "updated_by" TEXT REFERENCES "legado_users" ("id") ON DELETE SET NULL,
  "updated_at" TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now'))
);
