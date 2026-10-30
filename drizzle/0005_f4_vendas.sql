-- F4-01: domínio de vendas (produtos, formas_pagamento, vendas, venda_itens, venda_pagamentos, venda_parcelas)
-- ADR-005: valores em centavos (INTEGER); datas civis TEXT YYYY-MM-DD; instantes ISO 8601 UTC.

-- ─── produtos (catálogo global) ───────────────────────────────────────────────
CREATE TABLE `produtos` (
  `id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
  `nome` text(200) NOT NULL,
  `tipo` text(20) NOT NULL DEFAULT 'pacote',
  `destino` text(200),
  `moeda` text(3) NOT NULL DEFAULT 'BRL',
  `valor_neto_centavos` integer NOT NULL DEFAULT 0,
  `valor_venda_centavos` integer NOT NULL DEFAULT 0,
  `paga_comissao` integer NOT NULL DEFAULT 1,
  `permite_desconto` integer NOT NULL DEFAULT 1,
  `desconto_padrao_pct` integer,
  `fornecedor` text(200),
  `notas` text,
  `ativo` integer NOT NULL DEFAULT 1,
  `criado_em` text NOT NULL,
  `atualizado_em` text NOT NULL
);
CREATE INDEX `idx_produtos_nome` ON `produtos` (`nome`);
CREATE INDEX `idx_produtos_tipo` ON `produtos` (`tipo`);
CREATE INDEX `idx_produtos_ativo` ON `produtos` (`ativo`);

-- ─── formas_pagamento (por empresa) ──────────────────────────────────────────
CREATE TABLE `formas_pagamento` (
  `id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
  `empresa_id` integer NOT NULL REFERENCES `empresas`(`id`) ON DELETE CASCADE,
  `nome` text(100) NOT NULL,
  `tipo` text(30) NOT NULL DEFAULT 'outro',
  `ativo` integer NOT NULL DEFAULT 1,
  `criado_em` text NOT NULL
);
CREATE INDEX `idx_formas_pgto_empresa_ativo` ON `formas_pagamento` (`empresa_id`, `ativo`);
CREATE UNIQUE INDEX `idx_formas_pgto_empresa_nome` ON `formas_pagamento` (`empresa_id`, `nome`);

-- ─── vendas (cabeçalho) ───────────────────────────────────────────────────────
CREATE TABLE `vendas` (
  `id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
  `empresa_id` integer NOT NULL REFERENCES `empresas`(`id`) ON DELETE CASCADE,
  `numero_venda` text(30),
  `vendedor_id` text(36) REFERENCES `user`(`id`) ON DELETE SET NULL,
  `cliente_id` integer REFERENCES `clientes`(`id`) ON DELETE SET NULL,
  `produto_id` integer REFERENCES `produtos`(`id`) ON DELETE SET NULL,
  `data_venda` text(10) NOT NULL,
  `data_lancamento` text(10) NOT NULL,
  `data_embarque` text(10),
  `data_final` text(10),
  `cancelada` integer NOT NULL DEFAULT 0,
  `desconto_comercial_aplicado` integer NOT NULL DEFAULT 0,
  `desconto_comercial_centavos` integer NOT NULL DEFAULT 0,
  `valor_bruto_centavos` integer NOT NULL DEFAULT 0,
  `valor_taxas_centavos` integer NOT NULL DEFAULT 0,
  `valor_total_centavos` integer NOT NULL DEFAULT 0,
  `valor_pago_centavos` integer NOT NULL DEFAULT 0,
  `valor_nao_comissionado_centavos` integer NOT NULL DEFAULT 0,
  `notas` text,
  `chave_idempotencia` text(36),
  `versao` integer NOT NULL DEFAULT 1,
  `criado_por` text(36) REFERENCES `user`(`id`) ON DELETE SET NULL,
  `criado_em` text NOT NULL,
  `atualizado_em` text NOT NULL
);
CREATE INDEX `idx_vendas_empresa_data` ON `vendas` (`empresa_id`, `data_venda`);
CREATE INDEX `idx_vendas_empresa_cliente` ON `vendas` (`empresa_id`, `cliente_id`);
CREATE INDEX `idx_vendas_empresa_vendedor` ON `vendas` (`empresa_id`, `vendedor_id`);
CREATE INDEX `idx_vendas_empresa_cancelada` ON `vendas` (`empresa_id`, `cancelada`);
CREATE UNIQUE INDEX `idx_vendas_chave_idempotencia` ON `vendas` (`chave_idempotencia`);
CREATE UNIQUE INDEX `idx_vendas_numero_venda` ON `vendas` (`empresa_id`, `numero_venda`);

-- ─── venda_itens (recibos / serviços) ────────────────────────────────────────
CREATE TABLE `venda_itens` (
  `id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
  `empresa_id` integer NOT NULL REFERENCES `empresas`(`id`) ON DELETE CASCADE,
  `venda_id` integer NOT NULL REFERENCES `vendas`(`id`) ON DELETE CASCADE,
  `produto_id` integer REFERENCES `produtos`(`id`) ON DELETE SET NULL,
  `numero_recibo` text(100),
  `numero_reserva` text(100),
  `data_servico` text(10),
  `data_fim_servico` text(10),
  `pax` integer NOT NULL DEFAULT 1,
  `descricao` text(300) NOT NULL,
  `tipo` text(20) NOT NULL DEFAULT 'pacote',
  `moeda` text(3) NOT NULL DEFAULT 'BRL',
  `cambio_centavos` integer NOT NULL DEFAULT 10000,
  `valor_neto_centavos` integer NOT NULL DEFAULT 0,
  `valor_bruto_centavos` integer NOT NULL DEFAULT 0,
  `valor_taxas_centavos` integer NOT NULL DEFAULT 0,
  `valor_total_centavos` integer NOT NULL DEFAULT 0,
  `paga_comissao` integer NOT NULL DEFAULT 1,
  `notas` text,
  `criado_em` text NOT NULL
);
CREATE INDEX `idx_venda_itens_venda` ON `venda_itens` (`empresa_id`, `venda_id`);
CREATE INDEX `idx_venda_itens_produto` ON `venda_itens` (`produto_id`);

-- ─── venda_pagamentos ─────────────────────────────────────────────────────────
CREATE TABLE `venda_pagamentos` (
  `id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
  `empresa_id` integer NOT NULL REFERENCES `empresas`(`id`) ON DELETE CASCADE,
  `venda_id` integer NOT NULL REFERENCES `vendas`(`id`) ON DELETE CASCADE,
  `forma_id` integer REFERENCES `formas_pagamento`(`id`) ON DELETE SET NULL,
  `forma_nome` text(100) NOT NULL,
  `operacao` text(60),
  `plano` text(60),
  `valor_bruto_centavos` integer NOT NULL DEFAULT 0,
  `desconto_centavos` integer NOT NULL DEFAULT 0,
  `valor_total_centavos` integer NOT NULL DEFAULT 0,
  `parcelas_qtd` integer NOT NULL DEFAULT 1,
  `parcelas_valor_centavos` integer NOT NULL DEFAULT 0,
  `paga_comissao` integer NOT NULL DEFAULT 1,
  `criado_em` text NOT NULL
);
CREATE INDEX `idx_venda_pagamentos_venda` ON `venda_pagamentos` (`empresa_id`, `venda_id`);

-- ─── venda_parcelas ───────────────────────────────────────────────────────────
CREATE TABLE `venda_parcelas` (
  `id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
  `empresa_id` integer NOT NULL REFERENCES `empresas`(`id`) ON DELETE CASCADE,
  `pagamento_id` integer NOT NULL REFERENCES `venda_pagamentos`(`id`) ON DELETE CASCADE,
  `numero` integer NOT NULL,
  `valor_centavos` integer NOT NULL DEFAULT 0,
  `vencimento` text(10),
  `criado_em` text NOT NULL
);
CREATE INDEX `idx_venda_parcelas_pagamento` ON `venda_parcelas` (`empresa_id`, `pagamento_id`);
