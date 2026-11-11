-- Índice aditivo para buscar descrições de dias pela identidade da cidade.
-- Não altera, apaga nem reescreve linhas existentes.
CREATE INDEX IF NOT EXISTS legado_roteiro_dia_cidade_id_idx
  ON legado_roteiro_dia (cidade_id)
  WHERE cidade_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS legado_circuito_dias_cidades_cidade_idx
  ON legado_circuito_dias_cidades (cidade_id);
