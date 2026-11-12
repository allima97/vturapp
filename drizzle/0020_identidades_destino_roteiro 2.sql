ALTER TABLE "legado_roteiro_dia" ADD COLUMN "cidade_id" TEXT;
ALTER TABLE "legado_roteiro_hotel" ADD COLUMN "cidade_id" TEXT;
ALTER TABLE "legado_roteiro_passeio" ADD COLUMN "cidade_id" TEXT;
ALTER TABLE "catalogo_opcionais" ADD COLUMN "cidade_id" TEXT;

CREATE INDEX "catalogo_opcionais_cidade_id_idx"
  ON "catalogo_opcionais" ("cidade_id", "nome", "id")
  WHERE "cidade_id" IS NOT NULL;
