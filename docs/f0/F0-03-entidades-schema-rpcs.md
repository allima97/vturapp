# F0-03 — Entidades, schema e RPCs

**Estado:** CONCLUÍDA  
**Responsável / data:** 2026-10-26  
**Dependência:** F0-01, F0-02  

> **Escopo:** levantamento a partir do código-fonte (inventário de API, migrations SQL e referências no servidor). Não foram feitas consultas ao banco de produção. Schema completo de cada tabela precisará ser extraído do Supabase antes de criar o schema Drizzle — ver F2-01.

## RPCs utilizadas na aplicação

| RPC | Propósito | Quem chama | Destino |
|---|---|---|---|
| `accessible_client_ids` | Resolve IDs de clientes acessíveis por combinação empresa+vendedor | `src/lib/server/v1.ts` | Substituir por query Drizzle parametrizada (lógica já documentada na migration) |
| `company_cliente_ids` | IDs de clientes de uma empresa | `src/lib/server/clientes.ts` | Substituir por query Drizzle |
| `can_access_cliente_by_vendedor_scope` | Verifica acesso a cliente por escopo de vendedor | `src/lib/server/clientes.ts` | Substituir por query Drizzle |
| `check_security_rate_limit` | Rate limit persistente entre instâncias | `src/lib/server/persistentRateLimit.ts` | Substituir por tabela D1 + query Drizzle; avaliar trigger vs aplicação |
| `gestor_equipe_base_id` | Resolve equipe base do gestor | `src/lib/server/api/routes/parametros/escalas.ts` | Substituir por query Drizzle |
| `set_gestor_vendedor_relacao` | Cria/atualiza relação gestor↔vendedor | `src/lib/server/api/routes/equipe/relacao.ts` | Substituir por operação atômica Drizzle |
| `fn_mark_ranking_read_model_dirty` | Marca mês do read model como dirty | `src/lib/server/vendasSave.ts` | Substituir por operação D1 (INSERT/UPDATE condicional) |
| `sync_venda_children` | Sincroniza filhos de venda | `src/lib/server/vendasSave.ts` | Mapear lógica antes de implementar; substituir por operações Drizzle |
| `rpc_dashboard_consultorias` | Dashboard de consultorias | `routes/dashboard/consultorias.ts` | Substituir por query D1 direta |
| `buscar_cidades` | Busca cidades (full-text) | API cidades | Substituir por query D1 com FTS ou LIKE; normalizar acentos |
| `dashboard_vendas_summary_from_read_model` | Read model: resumo de vendas | `reciboContribuicoesReadModel.ts` | Substituir por query D1 (ver F4-04) |
| `dashboard_empresa_comparativo_from_read_model` | Read model: comparativo por empresa | `reciboContribuicoesReadModel.ts` | Ver F4-04 |
| `dashboard_compras_resumo_from_read_model` | Read model: compras resumo | `reciboContribuicoesReadModel.ts` | Ver F4-04 |
| `relatorio_produtos_from_read_model` | Relatório de produtos | `reciboContribuicoesReadModel.ts` | Ver F4-04 |
| `relatorio_destinos_from_read_model` | Relatório de destinos | `reciboContribuicoesReadModel.ts` | Ver F4-04 |
| `relatorio_clientes_from_read_model` | Relatório de clientes | `reciboContribuicoesReadModel.ts` | Ver F4-04 |

> **Importante:** as RPCs de acesso a cliente (`accessible_client_ids`, `company_cliente_ids`, `can_access_cliente_by_vendedor_scope`) encapsulam a lógica de isolamento de empresa/vendedor. As migrations delas estão versionadas com comentários detalhados — são a fonte de verdade para reimplementar como queries Drizzle em F2-03.

## Tabelas por módulo de destino

### M01 — Empresas, usuários, vínculos e permissões

| Tabela | Função | Notas |
|---|---|---|
| `companies` | Empresa (tenant) | Tem `logo_url` |
| `master_empresas` | Visão MASTER de empresas | Pode ser view ou tabela separada |
| `company_billing` | Cobrança por empresa | |
| `plans` | Planos do sistema | |
| `users` | Usuário da plataforma | `company_id`, `uso_individual` |
| `user_types` | Tipos de usuário (papel) | |
| `user_type_default_perms` | Permissões padrão por tipo | |
| `modulo_acesso` | Permissões por módulo/usuário | |
| `user_convites` | Convites pendentes | |
| `gestor_vendedor` | Vínculo gestor↔vendedor | |
| `gestor_equipe_compartilhada` | Equipe compartilhada | |
| `menu_prefs` | Preferências de menu | |
| `system_module_settings` | Configuração de módulos | |
| `admin_system_settings` | Configurações globais de admin | |
| `logs` | Auditoria/telemetria | |
| `security_rate_limits` | Rate limit persistente | Versionada em migration |
| `push_subscriptions` | Assinaturas push | |

### M02 — Clientes

| Tabela | Função |
|---|---|
| `clientes` | Cadastro de clientes |
| `cliente_acompanhantes` | Acompanhantes do cliente |
| `cliente_avisos_historico` | Histórico de avisos ao cliente |
| `cliente_template_dispatches` | Envio de templates CRM ao cliente |

### M03 — Produtos, tarifas, fornecedores

| Tabela | Função |
|---|---|
| `produtos` | Produtos do catálogo |
| `produtos_tarifas` | Tarifas por produto |
| `tipo_produtos` | Tipos de produto |
| `tipo_pacotes` | Tipos de pacote |
| `fornecedores` | Fornecedores |
| `circuitos` | Circuitos turísticos |

### M04 — Vendas, recibos, pagamentos

| Tabela | Função | Notas |
|---|---|---|
| `vendas` | Venda principal | |
| `vendas_recibos` | Recibo de venda | |
| `vendas_recibos_complementares` | Recibos complementares | |
| `vendas_recibos_notas` | Notas de recibo | |
| `vendas_recibos_rateio` | Rateio de recibo | |
| `vendas_pagamentos` | Pagamentos de venda | |
| `formas_pagamento` | Cadastro de formas de pagamento | |

> **Atenção monetária:** banco atual usa `numeric` (PostgreSQL). Na reescrita D1/SQLite, valores serão armazenados como `INTEGER` (centavos). Operações de cálculo precisam garantir arredondamento explícito na conversão. Toda entrada do usuário (campo de formulário) virá em reais com decimais e precisará ser convertida antes de gravar.

### M05 — Comissões e caixa

| Tabela | Função |
|---|---|
| `comissoes` | Registro de comissão |
| `commission_rule` | Regras de comissão |
| `commission_tier` | Faixas de comissão |
| `product_commission_rule` | Regra de comissão por produto |
| `product_commission_rule_pacote` | Regra por pacote |
| `parametros_comissao` | Parâmetros globais de comissão |
| `parametros_pagamentos_nao_comissionaveis` | Pagamentos que não geram comissão |
| `caixa_movimentacoes` | Movimentações de caixa |

> **Atenção X02:** `conciliacao_recibos` é referenciada por `financeiro/ajustes-vendas`. Essa tabela e o módulo de conciliação serão excluídos. Verificar antes de criar o módulo financeiro se `ajustes-vendas` tem dependência real da tabela ou apenas importa tipos.

### M06 — Viagens, vouchers, dossiês

| Tabela | Função |
|---|---|
| `viagens` | Viagem associada a venda |
| `viagem_acompanhantes` | Acompanhantes na viagem |
| `viagem_passageiros` | Passageiros |
| `viagem_documentos` | Documentos da viagem |
| `viagem_servicos` | Serviços contratados |
| `vouchers` | Vouchers emitidos |
| `voucher_dias` | Dias do voucher |
| `voucher_hoteis` | Hotéis do voucher |
| `voucher_assets` | Assets (imagens) de voucher |
| `documentos_viagens` | Documentos gerais de viagem |

### M07 — Orçamentos, roteiros

| Tabela | Função |
|---|---|
| `quote` | Orçamento |
| `quote_item` | Item do orçamento |
| `quote_item_segment` | Segmento de item |
| `quote_print_settings` | Config de impressão |
| `roteiro_personalizado` | Roteiro personalizado |
| `roteiro_dia` | Dia do roteiro |
| `roteiro_hotel` | Hotel no roteiro |
| `roteiro_passeio` | Passeio no roteiro |
| `roteiro_transporte` | Transporte no roteiro |
| `roteiro_investimento` | Investimento do roteiro |
| `roteiro_pagamento` | Pagamento do roteiro |
| `roteiro_sugestoes` | Sugestões de roteiro |

### M08 — Agenda, tarefas, SAC, campanhas

| Tabela | Função |
|---|---|
| `agenda_itens` | Itens da agenda |
| `escala_dia` | Escala de dias |
| `escala_horario_usuario` | Escala de horário por usuário |
| `escala_mes` | Escala mensal |
| `feriados` | Cadastro de feriados |
| `todo_categorias` | Categorias de tarefas |
| `campanhas` | Campanhas comerciais |
| `sac_controle` | Controle de SAC |

### M09 — Recados, mural

| Tabela | Função |
|---|---|
| `mural_recados` | Recados no mural |
| `mural_recados_leituras` | Registro de leitura dos recados |
| `admin_avisos_templates` | Templates de avisos |

### M10 — Destinos, cidades, países

| Tabela | Função | Notas |
|---|---|---|
| `cidades` | Cadastro de cidades | Buscada por RPC com FTS; normalização de acentos crítica |
| `paises` | Cadastro de países | |
| `subdivisoes` | Estados/subdivisões | |

> **Ordenação:** M10 deve preceder M06/M07 por ser referenciada em viagens, vouchers e roteiros.

### M11 — Dashboards, relatórios

| Tabela | Função | Notas |
|---|---|---|
| `metas_vendedor` | Metas do vendedor | |
| `metas_vendedor_produto` | Metas por produto | |
| `dashboard_widgets` | Configuração de widgets | |
| Read model tables | `ranking_read_model_status`, `ranking_recibo_contribuicoes` (ver migration) | Reconstruídas por cron/gravação |

### M12 — Auditoria, LGPD

| Tabela | Função |
|---|---|
| `logs` | Auditoria geral |
| `lgpd_atividades_tratamento` | LGPD Art. 37 |
| + outras tabelas LGPD | Ver migration `20261023000000_lgpd_infrastructure.sql` |

### CRM / Comunicação

| Tabela | Função |
|---|---|
| `user_message_templates` | Templates de mensagem |
| `user_message_template_themes` | Temas de template |
| `user_crm_assinaturas` | Assinaturas CRM |
| `crm_template_categories` | Categorias de template |

### Parametros e configuração

| Tabela | Função |
|---|---|
| `parametros_cambios` | Taxas de câmbio |
| `admin_email_settings` | Config de e-mail |
| `minhas_preferencias` | Preferências do usuário |
| `minhas_preferencias_shares` | Compartilhamento de preferências |
| `system_documentation` | Documentação do sistema |
| `system_documentation_sections` | Seções de documentação |
| `consultorias_online` | Consultorias online |

### X02 — EXCLUSÃO PLANEJADA (conciliação)

| Tabela | Status |
|---|---|
| `conciliacao_recibos` | EXCLUIR — exceto referências indiretas de ajustes-vendas |
| `conciliacao_execucoes` | EXCLUIR |
| `conciliacao_dias_sem_movimento` | EXCLUIR |
| `conciliacao_recibo_changes` | EXCLUIR |

## Convenções de tipos para Drizzle/SQLite (D1)

Banco atual usa PostgreSQL com tipos nativos. No D1/SQLite, aplicar estas convenções:

| Tipo de dado | PostgreSQL atual | D1/SQLite (Drizzle) | Observação |
|---|---|---|---|
| Booleano | `boolean` | `INTEGER` (0/1) | `integer('col', { mode: 'boolean' })` no Drizzle |
| Data sem hora | `date` | `TEXT` ISO 8601 (YYYY-MM-DD) | `text('col')` — não converter para timestamp |
| Timestamp | `timestamptz` | `TEXT` ISO 8601 UTC | `text('col')` — sempre UTC no banco, timezone no display |
| UUID | `uuid` | `TEXT` | `text('col').$type<string>()` — sem tipo nativo no SQLite |
| Valor monetário | `numeric` | `INTEGER` (centavos) | **Mudança de modelo:** atual usa `numeric` com float; novo usa centavos inteiros |
| Percentual | `numeric` | `INTEGER` ou `REAL` | Definir precisão (ex: 1000 = 10.00%); sem `float` para cálculo |
| JSON/JSONB | `jsonb` | `TEXT` | `text('col', { mode: 'json' })` no Drizzle |
| Array | `uuid[]`, `text[]` | Tabela filho ou JSON | SQLite não tem arrays nativos |

> **Conversão monetária:** o banco atual (PostgreSQL `numeric`) armazena valores como `123.45` (BRL). No D1, todos os valores serão `12345` (centavos inteiros). Toda query, seed, export e import precisará converter. Percentuais e câmbio: definir convenção (ex: `1000` = 10.00%, escala de 2 decimais) antes de criar o schema.

## Observações sobre valores monetários

O código atual usa `Math.round(value * 100) / 100` para arredondar, indicando que opera sobre `float`. Migrar para centavos inteiros elimina erros de ponto flutuante. Pontos críticos a validar em F1-03 e F4-01:
- Soma de comissões (múltiplas parcelas)
- Percentuais de comissão e câmbio (precisão de 4 casas)
- Cálculo de rateio de recibo

## Aceite verificado

- [x] Todas as RPCs únicas catalogadas (14 identificadas)
- [x] Destino de cada RPC definido (query Drizzle ou lógica de aplicação)
- [x] 95 tabelas agrupadas por módulo de destino
- [x] X02 claramente separado
- [x] Convenções de tipos Drizzle/SQLite documentadas
- [x] Mudança crítica de modelo monetário (numeric → centavos inteiros) registrada
- [x] Nenhum dado de produção acessado
