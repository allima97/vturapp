-- Biblioteca de dias por cidade (economia de tokens na IA de roteiros).
--
-- Cada linha é um "bloco" de dias de passeio já escritos pela IA para uma
-- cidade: N dias seguidos na mesma cidade, sem deslocamento, para um perfil
-- de viajante (casal, família, terceira idade, geral). Em gerações seguintes
-- que passem pela cidade, a IA recebe a lista de blocos e, se um combinar com
-- o pedido, devolve só o código do bloco em vez de reescrever os dias — o
-- servidor completa o texto. Os dias de chegada, troca de cidade e retorno
-- continuam sempre escritos pela IA.
CREATE TABLE "roteiro_ia_dias_cidade" (
  "id" TEXT PRIMARY KEY NOT NULL,
  "cidade_chave" TEXT NOT NULL,
  "cidade" TEXT NOT NULL,
  "perfil" TEXT NOT NULL,
  "dias" INTEGER NOT NULL,
  "descricoes" TEXT NOT NULL,
  "usos" INTEGER NOT NULL DEFAULT 0,
  "created_at" TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  "updated_at" TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now'))
);
CREATE UNIQUE INDEX "roteiro_ia_dias_cidade_bloco_idx"
  ON "roteiro_ia_dias_cidade" ("cidade_chave", "perfil", "dias");
