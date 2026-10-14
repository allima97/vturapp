-- Conteúdo editorial pertencente ao roteiro: herda suas permissões e exclusão.
-- Aplicar antes de publicar a versão que lê e grava opcionais.
ALTER TABLE public.roteiro_personalizado
  ADD COLUMN IF NOT EXISTS opcionais jsonb NOT NULL DEFAULT '[]'::jsonb
  CHECK (jsonb_typeof(opcionais) = 'array');
COMMENT ON COLUMN public.roteiro_personalizado.opcionais IS
  'Cidades com passeios opcionais sem data: [{cidade, passeios: [{nome, descricao}]}]. Ordem definida pelos arrays.';
NOTIFY pgrst, 'reload schema';
