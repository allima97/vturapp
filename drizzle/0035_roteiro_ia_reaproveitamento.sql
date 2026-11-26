-- Reaproveitamento da IA de roteiros (economia de tokens).
--
-- roteiro_ia_cache: resultado já gerado para um pedido idêntico (mesmos
-- destinos, origem, duração, viajantes, perfil, observações, catálogo da
-- agência, modelo e versão do prompt). As datas NÃO entram na chave: a IA
-- trabalha com "dia 1..N" e o servidor aplica as datas do pedido. Um acerto
-- devolve o roteiro sem chamar a IA (custo zero). Guarda só o texto gerado
-- (sem dados de cliente) e o consumo da geração original.
CREATE TABLE "roteiro_ia_cache" (
  "chave" TEXT PRIMARY KEY NOT NULL,
  "modelo" TEXT NOT NULL,
  "saida" TEXT NOT NULL,
  "uso" TEXT NOT NULL DEFAULT '{}',
  "acertos" INTEGER NOT NULL DEFAULT 0,
  "created_at" TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  "ultimo_uso" TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now'))
);
CREATE INDEX "roteiro_ia_cache_ultimo_uso_idx" ON "roteiro_ia_cache" ("ultimo_uso");

-- roteiro_ia_opcionais: passeios opcionais que a IA já escreveu para uma
-- cidade sem catálogo da agência. Nas próximas gerações para a mesma cidade
-- eles vão como lista de referência (só o nome): a IA escolhe por código em
-- vez de reescrever nome e descrição, e o servidor completa o texto.
CREATE TABLE "roteiro_ia_opcionais" (
  "id" TEXT PRIMARY KEY NOT NULL,
  "cidade_chave" TEXT NOT NULL,
  "cidade" TEXT NOT NULL,
  "nome" TEXT NOT NULL,
  "nome_chave" TEXT NOT NULL,
  "descricao" TEXT NOT NULL DEFAULT '',
  "usos" INTEGER NOT NULL DEFAULT 1,
  "created_at" TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  "updated_at" TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now'))
);
CREATE UNIQUE INDEX "roteiro_ia_opcionais_cidade_nome_idx"
  ON "roteiro_ia_opcionais" ("cidade_chave", "nome_chave");
