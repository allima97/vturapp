-- F4-04: Índices compostos para consultas/dashboards/relatórios
--
-- Decisão: live queries com índices adequados são suficientes para a escala
-- de uma agência (<10 K vendas). Sem tabela pré-agregada nem rebuild por cron.
-- Ver docs/adr/ADR-007-read-model.md.

-- Cobre resumoVendas + listarVendas com filtro combinado cancelada + data_venda.
CREATE INDEX IF NOT EXISTS idx_vendas_empresa_cancelada_data
  ON vendas (empresa_id, cancelada, data_venda);

-- Cobre listarVendas keyset cursor (empresa_id + cancelada + id DESC).
CREATE INDEX IF NOT EXISTS idx_vendas_empresa_cancelada_id
  ON vendas (empresa_id, cancelada, id);

-- Cobre listarParcelas com filtro por vencimento.
CREATE INDEX IF NOT EXISTS idx_venda_parcelas_vencimento
  ON venda_parcelas (empresa_id, vencimento);
