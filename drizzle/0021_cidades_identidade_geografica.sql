ALTER TABLE "legado_cidades" ADD COLUMN "destino_geografico_id" TEXT;

CREATE UNIQUE INDEX "legado_cidades_destino_geografico_id_idx"
  ON "legado_cidades" ("destino_geografico_id")
  WHERE "destino_geografico_id" IS NOT NULL;
