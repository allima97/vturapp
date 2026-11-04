# Matriz de paridade Supabase para D1

Cada objeto do inventário de 31/10/2026 está nesta tabela. O corpo SQL foi lido no dump do schema (sem dados). O status é `coberto`, `migrado` ou `excluído`. Excluído inclui a decisão ADR-009/F4-06 e código morto confirmado no dump (sem chamada e sem gatilho de negócio).

- Objetos: 907
- Índices btree criados na 0014: 236
- Contagem por status: coberto 645, migrado 140, excluído 122

O D1 não executa RLS. O browser não recebe chave de banco. Empresa, papel e equipe são resolvidos em `src/lib/server/auth/legacy-scope.ts` e o guard está em `src/hooks.server.ts`. O teste de isolamento é `src/lib/server/data/paridade.workers.test.ts`.

Chaves estrangeiras do Postgres não foram recriadas com `ALTER`: o SQLite não adiciona constraint depois do `CREATE`. As escritas ativas validam o vínculo no serviço. PK, UNIQUE e defaults estão na `0013`.

| objeto | tipo | destino | status | teste/evidência |
| --- | --- | --- | --- | --- |
| admin_avisos_templates | tabela | legado_admin_avisos_templates | coberto | drizzle/0013_legado_catalogo.sql (PK, UNIQUE, defaults) e drizzle/0014_legado_indices.sql |
| admin_avisos_templates_admin_all | policy | src/hooks.server.ts e src/lib/server/auth/legacy-scope.ts | coberto | RLS ALL em admin_avisos_templates substituída pela sessão do Worker; isolamento em paridade.workers.test.ts |
| trg_normalize_admin_avisos_templates_nome | trigger | src/lib/server/data/legado-rules.ts | migrado | regra do gatilho aplicada na escrita; legado-rules.test.ts |
| admin_email_settings | tabela | legado_admin_email_settings | coberto | drizzle/0013_legado_catalogo.sql (PK, UNIQUE, defaults) e drizzle/0014_legado_indices.sql |
| admin_email_settings_admin_all | policy | src/hooks.server.ts e src/lib/server/auth/legacy-scope.ts | coberto | RLS ALL em admin_email_settings substituída pela sessão do Worker; isolamento em paridade.workers.test.ts |
| admin_system_settings | tabela | legado_admin_system_settings | coberto | drizzle/0013_legado_catalogo.sql (PK, UNIQUE, defaults) e drizzle/0014_legado_indices.sql |
| admin_system_settings_admin_all | policy | src/hooks.server.ts e src/lib/server/auth/legacy-scope.ts | coberto | RLS ALL em admin_system_settings substituída pela sessão do Worker; isolamento em paridade.workers.test.ts |
| admin_system_settings_select_admin | policy | src/hooks.server.ts e src/lib/server/auth/legacy-scope.ts | coberto | RLS SELECT em admin_system_settings substituída pela sessão do Worker; isolamento em paridade.workers.test.ts |
| trg_admin_system_settings_updated_at | trigger | src/lib/server/data/query.ts | migrado | updated_at gravado na escrita |
| agenda_itens | tabela | legado_agenda_itens | coberto | drizzle/0013_legado_catalogo.sql (PK, UNIQUE, defaults) e drizzle/0014_legado_indices.sql |
| agenda_itens_delete | policy | src/hooks.server.ts e src/lib/server/auth/legacy-scope.ts | coberto | RLS DELETE em agenda_itens substituída pela sessão do Worker; isolamento em paridade.workers.test.ts |
| agenda_itens_insert | policy | src/hooks.server.ts e src/lib/server/auth/legacy-scope.ts | coberto | RLS INSERT em agenda_itens substituída pela sessão do Worker; isolamento em paridade.workers.test.ts |
| agenda_itens_select | policy | src/hooks.server.ts e src/lib/server/auth/legacy-scope.ts | coberto | RLS SELECT em agenda_itens substituída pela sessão do Worker; isolamento em paridade.workers.test.ts |
| agenda_itens_update | policy | src/hooks.server.ts e src/lib/server/auth/legacy-scope.ts | coberto | RLS UPDATE em agenda_itens substituída pela sessão do Worker; isolamento em paridade.workers.test.ts |
| trg_agenda_itens_defaults | trigger | dump public.sql | coberto | gatilho agenda_itens_set_defaults lido no dump; efeito de apoio sem regra nova além do serviço |
| trg_agenda_itens_updated_at | trigger | src/lib/server/data/query.ts | migrado | updated_at gravado na escrita |
| airline_iata_aliases | tabela | legado_airline_iata_aliases | coberto | drizzle/0013_legado_catalogo.sql (PK, UNIQUE, defaults) e drizzle/0014_legado_indices.sql |
| airline_iata_aliases_select | policy | src/hooks.server.ts e src/lib/server/auth/legacy-scope.ts | coberto | RLS SELECT em airline_iata_aliases substituída pela sessão do Worker; isolamento em paridade.workers.test.ts |
| airline_iata_codes | tabela | legado_airline_iata_codes | coberto | drizzle/0013_legado_catalogo.sql (PK, UNIQUE, defaults) e drizzle/0014_legado_indices.sql |
| airline_iata_codes_select | policy | src/hooks.server.ts e src/lib/server/auth/legacy-scope.ts | coberto | RLS SELECT em airline_iata_codes substituída pela sessão do Worker; isolamento em paridade.workers.test.ts |
| auth_passkey_challenges | tabela | legado_auth_passkey_challenges | coberto | drizzle/0013_legado_catalogo.sql (PK, UNIQUE, defaults) e drizzle/0014_legado_indices.sql |
| auth_passkeys | tabela | legado_auth_passkeys | coberto | drizzle/0013_legado_catalogo.sql (PK, UNIQUE, defaults) e drizzle/0014_legado_indices.sql |
| auth_passkeys_delete_own | policy | src/hooks.server.ts e src/lib/server/auth/legacy-scope.ts | coberto | RLS DELETE em auth_passkeys substituída pela sessão do Worker; isolamento em paridade.workers.test.ts |
| auth_passkeys_select_own | policy | src/hooks.server.ts e src/lib/server/auth/legacy-scope.ts | coberto | RLS SELECT em auth_passkeys substituída pela sessão do Worker; isolamento em paridade.workers.test.ts |
| set_auth_passkeys_updated_at | trigger | src/lib/server/data/query.ts | migrado | updated_at gravado na escrita |
| auth_signup_debug | tabela | legado_auth_signup_debug | coberto | drizzle/0013_legado_catalogo.sql (PK, UNIQUE, defaults) e drizzle/0014_legado_indices.sql |
| auth_signup_debug_admin_all | policy | src/hooks.server.ts e src/lib/server/auth/legacy-scope.ts | coberto | RLS ALL em auth_signup_debug substituída pela sessão do Worker; isolamento em paridade.workers.test.ts |
| campanhas | tabela | legado_campanhas | coberto | drizzle/0013_legado_catalogo.sql (PK, UNIQUE, defaults) e drizzle/0014_legado_indices.sql |
| campanhas_delete | policy | src/hooks.server.ts e src/lib/server/auth/legacy-scope.ts | coberto | RLS DELETE em campanhas substituída pela sessão do Worker; isolamento em paridade.workers.test.ts |
| campanhas_insert | policy | src/hooks.server.ts e src/lib/server/auth/legacy-scope.ts | coberto | RLS INSERT em campanhas substituída pela sessão do Worker; isolamento em paridade.workers.test.ts |
| campanhas_select | policy | src/hooks.server.ts e src/lib/server/auth/legacy-scope.ts | coberto | RLS SELECT em campanhas substituída pela sessão do Worker; isolamento em paridade.workers.test.ts |
| campanhas_update | policy | src/hooks.server.ts e src/lib/server/auth/legacy-scope.ts | coberto | RLS UPDATE em campanhas substituída pela sessão do Worker; isolamento em paridade.workers.test.ts |
| trg_campanhas_updated_at | trigger | src/lib/server/data/query.ts | migrado | updated_at gravado na escrita |
| cidades | tabela | legado_cidades | coberto | drizzle/0013_legado_catalogo.sql (PK, UNIQUE, defaults) e drizzle/0014_legado_indices.sql |
| Public read | policy | src/hooks.server.ts e src/lib/server/auth/legacy-scope.ts | coberto | RLS SELECT em cidades substituída pela sessão do Worker; isolamento em paridade.workers.test.ts |
| admin_full_access_cidades | policy | src/hooks.server.ts e src/lib/server/auth/legacy-scope.ts | coberto | RLS ALL em cidades substituída pela sessão do Worker; isolamento em paridade.workers.test.ts |
| cidades_read | policy | src/hooks.server.ts e src/lib/server/auth/legacy-scope.ts | coberto | RLS SELECT em cidades substituída pela sessão do Worker; isolamento em paridade.workers.test.ts |
| cidades_select | policy | src/hooks.server.ts e src/lib/server/auth/legacy-scope.ts | coberto | RLS SELECT em cidades substituída pela sessão do Worker; isolamento em paridade.workers.test.ts |
| cidades_select_public | policy | src/hooks.server.ts e src/lib/server/auth/legacy-scope.ts | coberto | RLS SELECT em cidades substituída pela sessão do Worker; isolamento em paridade.workers.test.ts |
| cidades_view | policy | src/hooks.server.ts e src/lib/server/auth/legacy-scope.ts | coberto | RLS SELECT em cidades substituída pela sessão do Worker; isolamento em paridade.workers.test.ts |
| cidades_write | policy | src/hooks.server.ts e src/lib/server/auth/legacy-scope.ts | coberto | RLS ALL em cidades substituída pela sessão do Worker; isolamento em paridade.workers.test.ts |
| select_cidades | policy | src/hooks.server.ts e src/lib/server/auth/legacy-scope.ts | coberto | RLS SELECT em cidades substituída pela sessão do Worker; isolamento em paridade.workers.test.ts |
| cidades_import_staging | tabela | legado_cidades_import_staging | coberto | drizzle/0013_legado_catalogo.sql (PK, UNIQUE, defaults) e drizzle/0014_legado_indices.sql |
| cidades_import_staging_admin_all | policy | src/hooks.server.ts e src/lib/server/auth/legacy-scope.ts | coberto | RLS ALL em cidades_import_staging substituída pela sessão do Worker; isolamento em paridade.workers.test.ts |
| cidades_import_targets | tabela | legado_cidades_import_targets | coberto | drizzle/0013_legado_catalogo.sql (PK, UNIQUE, defaults) e drizzle/0014_legado_indices.sql |
| cidades_import_targets_admin_all | policy | src/hooks.server.ts e src/lib/server/auth/legacy-scope.ts | coberto | RLS ALL em cidades_import_targets substituída pela sessão do Worker; isolamento em paridade.workers.test.ts |
| cidades_import_targets_norm | tabela | legado_cidades_import_targets_norm | coberto | drizzle/0013_legado_catalogo.sql (PK, UNIQUE, defaults) e drizzle/0014_legado_indices.sql |
| cidades_import_targets_norm_admin_all | policy | src/hooks.server.ts e src/lib/server/auth/legacy-scope.ts | coberto | RLS ALL em cidades_import_targets_norm substituída pela sessão do Worker; isolamento em paridade.workers.test.ts |
| cidades_norm_cache | tabela | legado_cidades_norm_cache | coberto | drizzle/0013_legado_catalogo.sql (PK, UNIQUE, defaults) e drizzle/0014_legado_indices.sql |
| cidades_norm_cache_admin_all | policy | src/hooks.server.ts e src/lib/server/auth/legacy-scope.ts | coberto | RLS ALL em cidades_norm_cache substituída pela sessão do Worker; isolamento em paridade.workers.test.ts |
| circuito_datas | tabela | legado_circuito_datas | coberto | drizzle/0013_legado_catalogo.sql (PK, UNIQUE, defaults) e drizzle/0014_legado_indices.sql |
| circuito_datas_admin_all | policy | src/hooks.server.ts e src/lib/server/auth/legacy-scope.ts | coberto | RLS ALL em circuito_datas substituída pela sessão do Worker; isolamento em paridade.workers.test.ts |
| circuito_dias | tabela | legado_circuito_dias | coberto | drizzle/0013_legado_catalogo.sql (PK, UNIQUE, defaults) e drizzle/0014_legado_indices.sql |
| circuito_dias_admin_all | policy | src/hooks.server.ts e src/lib/server/auth/legacy-scope.ts | coberto | RLS ALL em circuito_dias substituída pela sessão do Worker; isolamento em paridade.workers.test.ts |
| circuito_dias_cidades | tabela | legado_circuito_dias_cidades | coberto | drizzle/0013_legado_catalogo.sql (PK, UNIQUE, defaults) e drizzle/0014_legado_indices.sql |
| circuito_dias_cidades_admin_all | policy | src/hooks.server.ts e src/lib/server/auth/legacy-scope.ts | coberto | RLS ALL em circuito_dias_cidades substituída pela sessão do Worker; isolamento em paridade.workers.test.ts |
| circuitos | tabela | legado_circuitos | coberto | drizzle/0013_legado_catalogo.sql (PK, UNIQUE, defaults) e drizzle/0014_legado_indices.sql |
| circuitos_admin_all | policy | src/hooks.server.ts e src/lib/server/auth/legacy-scope.ts | coberto | RLS ALL em circuitos substituída pela sessão do Worker; isolamento em paridade.workers.test.ts |
| trg_normalize_circuitos_nome | trigger | src/lib/server/data/legado-rules.ts | migrado | regra do gatilho aplicada na escrita; legado-rules.test.ts |
| cliente_acompanhantes | tabela | legado_cliente_acompanhantes | coberto | drizzle/0013_legado_catalogo.sql (PK, UNIQUE, defaults) e drizzle/0014_legado_indices.sql |
| admin_full_access_cliente_acompanhantes | policy | src/hooks.server.ts e src/lib/server/auth/legacy-scope.ts | coberto | RLS ALL em cliente_acompanhantes substituída pela sessão do Worker; isolamento em paridade.workers.test.ts |
| cliente_acompanhantes_select | policy | src/hooks.server.ts e src/lib/server/auth/legacy-scope.ts | coberto | RLS SELECT em cliente_acompanhantes substituída pela sessão do Worker; isolamento em paridade.workers.test.ts |
| cliente_acompanhantes_view | policy | src/hooks.server.ts e src/lib/server/auth/legacy-scope.ts | coberto | RLS SELECT em cliente_acompanhantes substituída pela sessão do Worker; isolamento em paridade.workers.test.ts |
| cliente_acompanhantes_write | policy | src/hooks.server.ts e src/lib/server/auth/legacy-scope.ts | coberto | RLS ALL em cliente_acompanhantes substituída pela sessão do Worker; isolamento em paridade.workers.test.ts |
| trg_normalize_cliente_acomp_nome | trigger | src/lib/server/data/legado-rules.ts | migrado | regra do gatilho aplicada na escrita; legado-rules.test.ts |
| cliente_template_dispatches | tabela | legado_cliente_template_dispatches | coberto | drizzle/0013_legado_catalogo.sql (PK, UNIQUE, defaults) e drizzle/0014_legado_indices.sql |
| cliente_template_dispatches_insert | policy | src/hooks.server.ts e src/lib/server/auth/legacy-scope.ts | coberto | RLS INSERT em cliente_template_dispatches substituída pela sessão do Worker; isolamento em paridade.workers.test.ts |
| cliente_template_dispatches_select | policy | src/hooks.server.ts e src/lib/server/auth/legacy-scope.ts | coberto | RLS SELECT em cliente_template_dispatches substituída pela sessão do Worker; isolamento em paridade.workers.test.ts |
| cliente_template_dispatches_update | policy | src/hooks.server.ts e src/lib/server/auth/legacy-scope.ts | coberto | RLS UPDATE em cliente_template_dispatches substituída pela sessão do Worker; isolamento em paridade.workers.test.ts |
| trg_cliente_template_dispatches_updated_at | trigger | src/lib/server/data/query.ts | migrado | updated_at gravado na escrita |
| clientes | tabela | legado_clientes | coberto | drizzle/0013_legado_catalogo.sql (PK, UNIQUE, defaults) e drizzle/0014_legado_indices.sql |
| clientes_delete_admin | policy | src/hooks.server.ts e src/lib/server/auth/legacy-scope.ts | coberto | RLS DELETE em clientes substituída pela sessão do Worker; isolamento em paridade.workers.test.ts |
| clientes_insert | policy | src/hooks.server.ts e src/lib/server/auth/legacy-scope.ts | coberto | RLS INSERT em clientes substituída pela sessão do Worker; isolamento em paridade.workers.test.ts |
| clientes_select | policy | src/hooks.server.ts e src/lib/server/auth/legacy-scope.ts | coberto | RLS SELECT em clientes substituída pela sessão do Worker; isolamento em paridade.workers.test.ts |
| clientes_update | policy | src/hooks.server.ts e src/lib/server/auth/legacy-scope.ts | coberto | RLS UPDATE em clientes substituída pela sessão do Worker; isolamento em paridade.workers.test.ts |
| before_format_clientes_cpf_cnpj | trigger | src/lib/server/data/legado-rules.ts | migrado | regra do gatilho aplicada na escrita; legado-rules.test.ts |
| normalize_cpf_trigger | trigger | src/lib/server/data/legado-rules.ts | migrado | regra do gatilho aplicada na escrita; legado-rules.test.ts |
| trg_clientes_link_company | trigger | src/lib/server/auth/legacy-scope.ts; src/hooks.server.ts | coberto | helper de RLS/auth; o Worker não expõe SQL ao browser |
| trg_clientes_set_created_by | trigger | dump public.sql | coberto | gatilho clientes_set_created_by_trigger lido no dump; efeito de apoio sem regra nova além do serviço |
| trg_normalize_clientes_nome | trigger | src/lib/server/data/legado-rules.ts | migrado | regra do gatilho aplicada na escrita; legado-rules.test.ts |
| clientes_company | tabela | legado_clientes_company | coberto | drizzle/0013_legado_catalogo.sql (PK, UNIQUE, defaults) e drizzle/0014_legado_indices.sql |
| clientes_company_insert | policy | src/hooks.server.ts e src/lib/server/auth/legacy-scope.ts | coberto | RLS INSERT em clientes_company substituída pela sessão do Worker; isolamento em paridade.workers.test.ts |
| clientes_company_select | policy | src/hooks.server.ts e src/lib/server/auth/legacy-scope.ts | coberto | RLS SELECT em clientes_company substituída pela sessão do Worker; isolamento em paridade.workers.test.ts |
| trg_clientes_company_normalize_created_by | trigger | src/lib/server/data/legado-rules.ts | migrado | regra do gatilho aplicada na escrita; legado-rules.test.ts |
| trg_clientes_company_updated_at | trigger | src/lib/server/data/query.ts | migrado | updated_at gravado na escrita |
| comissionamento_geral | tabela | legado_comissionamento_geral | coberto | drizzle/0013_legado_catalogo.sql (PK, UNIQUE, defaults) e drizzle/0014_legado_indices.sql |
| Enable read access for all users | policy | src/hooks.server.ts e src/lib/server/auth/legacy-scope.ts | coberto | RLS SELECT em comissionamento_geral substituída pela sessão do Worker; isolamento em paridade.workers.test.ts |
| admin_full_access_comissionamento_geral | policy | src/hooks.server.ts e src/lib/server/auth/legacy-scope.ts | coberto | RLS ALL em comissionamento_geral substituída pela sessão do Worker; isolamento em paridade.workers.test.ts |
| trg_update_comissionamento_updated_at | trigger | src/lib/server/data/query.ts | migrado | updated_at gravado na escrita |
| trg_validate_comissionamento_regra | trigger | src/lib/server/data/legado-rules.ts | migrado | regra do gatilho aplicada na escrita; legado-rules.test.ts |
| comissoes | tabela | legado_comissoes | coberto | drizzle/0013_legado_catalogo.sql (PK, UNIQUE, defaults) e drizzle/0014_legado_indices.sql |
| comissoes_all | policy | src/hooks.server.ts e src/lib/server/auth/legacy-scope.ts | coberto | RLS ALL em comissoes substituída pela sessão do Worker; isolamento em paridade.workers.test.ts |
| comissoes_select | policy | src/hooks.server.ts e src/lib/server/auth/legacy-scope.ts | coberto | RLS SELECT em comissoes substituída pela sessão do Worker; isolamento em paridade.workers.test.ts |
| trg_comissoes_updated_at | trigger | src/lib/server/data/query.ts | migrado | updated_at gravado na escrita |
| commission_rule | tabela | legado_commission_rule | coberto | drizzle/0013_legado_catalogo.sql (PK, UNIQUE, defaults) e drizzle/0014_legado_indices.sql |
| admin_full_access_commission_rule | policy | src/hooks.server.ts e src/lib/server/auth/legacy-scope.ts | coberto | RLS ALL em commission_rule substituída pela sessão do Worker; isolamento em paridade.workers.test.ts |
| commission_rule_read | policy | src/hooks.server.ts e src/lib/server/auth/legacy-scope.ts | coberto | RLS SELECT em commission_rule substituída pela sessão do Worker; isolamento em paridade.workers.test.ts |
| commission_rule_view | policy | src/hooks.server.ts e src/lib/server/auth/legacy-scope.ts | coberto | RLS SELECT em commission_rule substituída pela sessão do Worker; isolamento em paridade.workers.test.ts |
| trg_normalize_commission_rule_nome | trigger | src/lib/server/data/legado-rules.ts | migrado | regra do gatilho aplicada na escrita; legado-rules.test.ts |
| commission_tier | tabela | legado_commission_tier | coberto | drizzle/0013_legado_catalogo.sql (PK, UNIQUE, defaults) e drizzle/0014_legado_indices.sql |
| admin_full_access_commission_tier | policy | src/hooks.server.ts e src/lib/server/auth/legacy-scope.ts | coberto | RLS ALL em commission_tier substituída pela sessão do Worker; isolamento em paridade.workers.test.ts |
| commission_tier_read | policy | src/hooks.server.ts e src/lib/server/auth/legacy-scope.ts | coberto | RLS SELECT em commission_tier substituída pela sessão do Worker; isolamento em paridade.workers.test.ts |
| commission_tier_view | policy | src/hooks.server.ts e src/lib/server/auth/legacy-scope.ts | coberto | RLS SELECT em commission_tier substituída pela sessão do Worker; isolamento em paridade.workers.test.ts |
| companies | tabela | legado_companies | coberto | drizzle/0013_legado_catalogo.sql (PK, UNIQUE, defaults) e drizzle/0014_legado_indices.sql |
| companies_delete_admin_only | policy | src/hooks.server.ts e src/lib/server/auth/legacy-scope.ts | coberto | RLS DELETE em companies substituída pela sessão do Worker; isolamento em paridade.workers.test.ts |
| companies_insert_admin_only | policy | src/hooks.server.ts e src/lib/server/auth/legacy-scope.ts | coberto | RLS INSERT em companies substituída pela sessão do Worker; isolamento em paridade.workers.test.ts |
| companies_select_scoped | policy | src/hooks.server.ts e src/lib/server/auth/legacy-scope.ts | coberto | RLS SELECT em companies substituída pela sessão do Worker; isolamento em paridade.workers.test.ts |
| companies_update_admin_only | policy | src/hooks.server.ts e src/lib/server/auth/legacy-scope.ts | coberto | RLS UPDATE em companies substituída pela sessão do Worker; isolamento em paridade.workers.test.ts |
| trg_companies_normalize_cnpj | trigger | src/lib/server/data/legado-rules.ts | migrado | regra do gatilho aplicada na escrita; legado-rules.test.ts |
| trg_company_billing_on_company | trigger | src/lib/server/data/legado-rules.ts | migrado | regra do gatilho aplicada na escrita; legado-rules.test.ts |
| update_companies_updated_at | trigger | src/lib/server/data/query.ts | migrado | updated_at gravado na escrita |
| company_billing | tabela | legado_company_billing | coberto | drizzle/0013_legado_catalogo.sql (PK, UNIQUE, defaults) e drizzle/0014_legado_indices.sql |
| company_billing_admin_all | policy | src/hooks.server.ts e src/lib/server/auth/legacy-scope.ts | coberto | RLS ALL em company_billing substituída pela sessão do Worker; isolamento em paridade.workers.test.ts |
| company_billing_events | tabela | legado_company_billing_events | coberto | drizzle/0013_legado_catalogo.sql (PK, UNIQUE, defaults) e drizzle/0014_legado_indices.sql |
| company_billing_events_admin_all | policy | src/hooks.server.ts e src/lib/server/auth/legacy-scope.ts | coberto | RLS ALL em company_billing_events substituída pela sessão do Worker; isolamento em paridade.workers.test.ts |
| conciliacao_dias_sem_movimento | tabela | legado_conciliacao_dias_sem_movimento | excluído | drizzle/0013_legado_catalogo.sql guarda a tabela; a regra é ADR-009 / F4-06 |
| conciliacao_execucoes | tabela | legado_conciliacao_execucoes | excluído | drizzle/0013_legado_catalogo.sql guarda a tabela; a regra é ADR-009 / F4-06 |
| conciliacao_execucoes_insert | policy | ADR-009 | excluído | RLS de conciliacao_execucoes; módulo excluído |
| conciliacao_execucoes_select | policy | ADR-009 | excluído | RLS de conciliacao_execucoes; módulo excluído |
| conciliacao_recibo_changes | tabela | legado_conciliacao_recibo_changes | excluído | drizzle/0013_legado_catalogo.sql guarda a tabela; a regra é ADR-009 / F4-06 |
| conciliacao_changes_insert | policy | ADR-009 | excluído | RLS de conciliacao_recibo_changes; módulo excluído |
| conciliacao_changes_select | policy | ADR-009 | excluído | RLS de conciliacao_recibo_changes; módulo excluído |
| conciliacao_changes_update | policy | ADR-009 | excluído | RLS de conciliacao_recibo_changes; módulo excluído |
| conciliacao_recibos | tabela | legado_conciliacao_recibos | excluído | drizzle/0013_legado_catalogo.sql guarda a tabela; a regra é ADR-009 / F4-06 |
| conciliacao_recibos_insert | policy | ADR-009 | excluído | RLS de conciliacao_recibos; módulo excluído |
| conciliacao_recibos_select | policy | ADR-009 | excluído | RLS de conciliacao_recibos; módulo excluído |
| conciliacao_recibos_update | policy | ADR-009 | excluído | RLS de conciliacao_recibos; módulo excluído |
| trg_conciliacao_recibos_sync_legacy_columns | trigger | docs/adr/ADR-009-modulos-adiados.md | excluído | conciliação ou importação fora do produto |
| trg_conciliacao_recibos_updated_at | trigger | docs/adr/ADR-009-modulos-adiados.md | excluído | conciliação ou importação fora do produto |
| trg_rm_v4_conciliacao_recibos | trigger | docs/adr/ADR-009-modulos-adiados.md | excluído | conciliação ou importação fora do produto |
| consultorias_online | tabela | legado_consultorias_online | coberto | drizzle/0013_legado_catalogo.sql (PK, UNIQUE, defaults) e drizzle/0014_legado_indices.sql |
| consultorias_online_admin | policy | src/hooks.server.ts e src/lib/server/auth/legacy-scope.ts | coberto | RLS ALL em consultorias_online substituída pela sessão do Worker; isolamento em paridade.workers.test.ts |
| trg_consultoria_online_updated_at | trigger | src/lib/server/data/query.ts | migrado | updated_at gravado na escrita |
| trg_consultorias_link_cliente_company | trigger | dump public.sql | coberto | gatilho trg_consultorias_link_cliente_company lido no dump; efeito de apoio sem regra nova além do serviço |
| trg_normalize_consultorias_cliente_nome | trigger | src/lib/server/data/legado-rules.ts | migrado | regra do gatilho aplicada na escrita; legado-rules.test.ts |
| crm_message_templates | tabela | legado_crm_message_templates | coberto | drizzle/0013_legado_catalogo.sql (PK, UNIQUE, defaults) e drizzle/0014_legado_indices.sql |
| crm_message_templates_admin_all | policy | src/hooks.server.ts e src/lib/server/auth/legacy-scope.ts | coberto | RLS ALL em crm_message_templates substituída pela sessão do Worker; isolamento em paridade.workers.test.ts |
| crm_template_categories | tabela | legado_crm_template_categories | coberto | drizzle/0013_legado_catalogo.sql (PK, UNIQUE, defaults) e drizzle/0014_legado_indices.sql |
| crm_categories_admin | policy | src/hooks.server.ts e src/lib/server/auth/legacy-scope.ts | coberto | RLS ALL em crm_template_categories substituída pela sessão do Worker; isolamento em paridade.workers.test.ts |
| crm_categories_select | policy | src/hooks.server.ts e src/lib/server/auth/legacy-scope.ts | coberto | RLS SELECT em crm_template_categories substituída pela sessão do Worker; isolamento em paridade.workers.test.ts |
| trg_normalize_crm_template_categories_nome | trigger | src/lib/server/data/legado-rules.ts | migrado | regra do gatilho aplicada na escrita; legado-rules.test.ts |
| dashboard_widgets | tabela | legado_dashboard_widgets | coberto | drizzle/0013_legado_catalogo.sql (PK, UNIQUE, defaults) e drizzle/0014_legado_indices.sql |
| admin_full_access_dashboard_widgets | policy | src/hooks.server.ts e src/lib/server/auth/legacy-scope.ts | coberto | RLS ALL em dashboard_widgets substituída pela sessão do Worker; isolamento em paridade.workers.test.ts |
| dashboard_widgets_delete | policy | src/hooks.server.ts e src/lib/server/auth/legacy-scope.ts | coberto | RLS DELETE em dashboard_widgets substituída pela sessão do Worker; isolamento em paridade.workers.test.ts |
| dashboard_widgets_insert | policy | src/hooks.server.ts e src/lib/server/auth/legacy-scope.ts | coberto | RLS INSERT em dashboard_widgets substituída pela sessão do Worker; isolamento em paridade.workers.test.ts |
| dashboard_widgets_owner_full | policy | src/hooks.server.ts e src/lib/server/auth/legacy-scope.ts | coberto | RLS ALL em dashboard_widgets substituída pela sessão do Worker; isolamento em paridade.workers.test.ts |
| dashboard_widgets_select | policy | src/hooks.server.ts e src/lib/server/auth/legacy-scope.ts | coberto | RLS SELECT em dashboard_widgets substituída pela sessão do Worker; isolamento em paridade.workers.test.ts |
| dashboard_widgets_update | policy | src/hooks.server.ts e src/lib/server/auth/legacy-scope.ts | coberto | RLS UPDATE em dashboard_widgets substituída pela sessão do Worker; isolamento em paridade.workers.test.ts |
| dashboard_widgets_write | policy | src/hooks.server.ts e src/lib/server/auth/legacy-scope.ts | coberto | RLS ALL em dashboard_widgets substituída pela sessão do Worker; isolamento em paridade.workers.test.ts |
| documentos_viagens | tabela | legado_documentos_viagens | coberto | drizzle/0013_legado_catalogo.sql (PK, UNIQUE, defaults) e drizzle/0014_legado_indices.sql |
| documentos_viagens_delete | policy | src/hooks.server.ts e src/lib/server/auth/legacy-scope.ts | coberto | RLS DELETE em documentos_viagens substituída pela sessão do Worker; isolamento em paridade.workers.test.ts |
| documentos_viagens_insert | policy | src/hooks.server.ts e src/lib/server/auth/legacy-scope.ts | coberto | RLS INSERT em documentos_viagens substituída pela sessão do Worker; isolamento em paridade.workers.test.ts |
| documentos_viagens_select | policy | src/hooks.server.ts e src/lib/server/auth/legacy-scope.ts | coberto | RLS SELECT em documentos_viagens substituída pela sessão do Worker; isolamento em paridade.workers.test.ts |
| documentos_viagens_update | policy | src/hooks.server.ts e src/lib/server/auth/legacy-scope.ts | coberto | RLS UPDATE em documentos_viagens substituída pela sessão do Worker; isolamento em paridade.workers.test.ts |
| escala_dia | tabela | legado_escala_dia | coberto | drizzle/0013_legado_catalogo.sql (PK, UNIQUE, defaults) e drizzle/0014_legado_indices.sql |
| escala_dia_select | policy | src/hooks.server.ts e src/lib/server/auth/legacy-scope.ts | coberto | RLS SELECT em escala_dia substituída pela sessão do Worker; isolamento em paridade.workers.test.ts |
| escala_dia_write | policy | src/hooks.server.ts e src/lib/server/auth/legacy-scope.ts | coberto | RLS ALL em escala_dia substituída pela sessão do Worker; isolamento em paridade.workers.test.ts |
| escala_horario_usuario | tabela | legado_escala_horario_usuario | coberto | drizzle/0013_legado_catalogo.sql (PK, UNIQUE, defaults) e drizzle/0014_legado_indices.sql |
| escala_horario_usuario_select | policy | src/hooks.server.ts e src/lib/server/auth/legacy-scope.ts | coberto | RLS SELECT em escala_horario_usuario substituída pela sessão do Worker; isolamento em paridade.workers.test.ts |
| escala_horario_usuario_write | policy | src/hooks.server.ts e src/lib/server/auth/legacy-scope.ts | coberto | RLS ALL em escala_horario_usuario substituída pela sessão do Worker; isolamento em paridade.workers.test.ts |
| escala_mes | tabela | legado_escala_mes | coberto | drizzle/0013_legado_catalogo.sql (PK, UNIQUE, defaults) e drizzle/0014_legado_indices.sql |
| escala_mes_select | policy | src/hooks.server.ts e src/lib/server/auth/legacy-scope.ts | coberto | RLS SELECT em escala_mes substituída pela sessão do Worker; isolamento em paridade.workers.test.ts |
| escala_mes_write | policy | src/hooks.server.ts e src/lib/server/auth/legacy-scope.ts | coberto | RLS ALL em escala_mes substituída pela sessão do Worker; isolamento em paridade.workers.test.ts |
| estados | tabela | legado_estados | coberto | drizzle/0013_legado_catalogo.sql (PK, UNIQUE, defaults) e drizzle/0014_legado_indices.sql |
| admin_full_access_estados | policy | src/hooks.server.ts e src/lib/server/auth/legacy-scope.ts | coberto | RLS ALL em estados substituída pela sessão do Worker; isolamento em paridade.workers.test.ts |
| estados_read | policy | src/hooks.server.ts e src/lib/server/auth/legacy-scope.ts | coberto | RLS SELECT em estados substituída pela sessão do Worker; isolamento em paridade.workers.test.ts |
| estados_view | policy | src/hooks.server.ts e src/lib/server/auth/legacy-scope.ts | coberto | RLS SELECT em estados substituída pela sessão do Worker; isolamento em paridade.workers.test.ts |
| feriados | tabela | legado_feriados | coberto | drizzle/0013_legado_catalogo.sql (PK, UNIQUE, defaults) e drizzle/0014_legado_indices.sql |
| feriados_select | policy | src/hooks.server.ts e src/lib/server/auth/legacy-scope.ts | coberto | RLS SELECT em feriados substituída pela sessão do Worker; isolamento em paridade.workers.test.ts |
| feriados_write | policy | src/hooks.server.ts e src/lib/server/auth/legacy-scope.ts | coberto | RLS ALL em feriados substituída pela sessão do Worker; isolamento em paridade.workers.test.ts |
| trg_normalize_feriados_nome | trigger | src/lib/server/data/legado-rules.ts | migrado | regra do gatilho aplicada na escrita; legado-rules.test.ts |
| financeiro_empresas | tabela | legado_financeiro_empresas | coberto | drizzle/0013_legado_catalogo.sql (PK, UNIQUE, defaults) e drizzle/0014_legado_indices.sql |
| financeiro_empresas_delete | policy | src/hooks.server.ts e src/lib/server/auth/legacy-scope.ts | coberto | RLS DELETE em financeiro_empresas substituída pela sessão do Worker; isolamento em paridade.workers.test.ts |
| financeiro_empresas_insert | policy | src/hooks.server.ts e src/lib/server/auth/legacy-scope.ts | coberto | RLS INSERT em financeiro_empresas substituída pela sessão do Worker; isolamento em paridade.workers.test.ts |
| financeiro_empresas_select | policy | src/hooks.server.ts e src/lib/server/auth/legacy-scope.ts | coberto | RLS SELECT em financeiro_empresas substituída pela sessão do Worker; isolamento em paridade.workers.test.ts |
| financeiro_empresas_update | policy | src/hooks.server.ts e src/lib/server/auth/legacy-scope.ts | coberto | RLS UPDATE em financeiro_empresas substituída pela sessão do Worker; isolamento em paridade.workers.test.ts |
| formas_pagamento | tabela | legado_formas_pagamento | coberto | drizzle/0013_legado_catalogo.sql (PK, UNIQUE, defaults) e drizzle/0014_legado_indices.sql |
| formas_pagamento_select | policy | src/hooks.server.ts e src/lib/server/auth/legacy-scope.ts | coberto | RLS SELECT em formas_pagamento substituída pela sessão do Worker; isolamento em paridade.workers.test.ts |
| formas_pagamento_write | policy | src/hooks.server.ts e src/lib/server/auth/legacy-scope.ts | coberto | RLS ALL em formas_pagamento substituída pela sessão do Worker; isolamento em paridade.workers.test.ts |
| trg_normalize_formas_pagamento_nome | trigger | src/lib/server/data/legado-rules.ts | migrado | regra do gatilho aplicada na escrita; legado-rules.test.ts |
| fornecedores | tabela | legado_fornecedores | coberto | drizzle/0013_legado_catalogo.sql (PK, UNIQUE, defaults) e drizzle/0014_legado_indices.sql |
| admin_full_access_fornecedores | policy | src/hooks.server.ts e src/lib/server/auth/legacy-scope.ts | coberto | RLS ALL em fornecedores substituída pela sessão do Worker; isolamento em paridade.workers.test.ts |
| fornecedores_read | policy | src/hooks.server.ts e src/lib/server/auth/legacy-scope.ts | coberto | RLS SELECT em fornecedores substituída pela sessão do Worker; isolamento em paridade.workers.test.ts |
| fornecedores_select | policy | src/hooks.server.ts e src/lib/server/auth/legacy-scope.ts | coberto | RLS SELECT em fornecedores substituída pela sessão do Worker; isolamento em paridade.workers.test.ts |
| fornecedores_view | policy | src/hooks.server.ts e src/lib/server/auth/legacy-scope.ts | coberto | RLS SELECT em fornecedores substituída pela sessão do Worker; isolamento em paridade.workers.test.ts |
| fornecedores_write | policy | src/hooks.server.ts e src/lib/server/auth/legacy-scope.ts | coberto | RLS ALL em fornecedores substituída pela sessão do Worker; isolamento em paridade.workers.test.ts |
| trg_normalize_fornecedores_nome_completo | trigger | src/lib/server/data/legado-rules.ts | migrado | regra do gatilho aplicada na escrita; legado-rules.test.ts |
| gestor_equipe_compartilhada | tabela | legado_gestor_equipe_compartilhada | coberto | drizzle/0013_legado_catalogo.sql (PK, UNIQUE, defaults) e drizzle/0014_legado_indices.sql |
| gestor_equipe_compartilhada_select | policy | src/hooks.server.ts e src/lib/server/auth/legacy-scope.ts | coberto | RLS SELECT em gestor_equipe_compartilhada substituída pela sessão do Worker; isolamento em paridade.workers.test.ts |
| gestor_equipe_compartilhada_write | policy | src/hooks.server.ts e src/lib/server/auth/legacy-scope.ts | coberto | RLS ALL em gestor_equipe_compartilhada substituída pela sessão do Worker; isolamento em paridade.workers.test.ts |
| gestor_vendedor | tabela | legado_gestor_vendedor | coberto | drizzle/0013_legado_catalogo.sql (PK, UNIQUE, defaults) e drizzle/0014_legado_indices.sql |
| Administradores podem ver todos os relacionamentos | policy | src/hooks.server.ts e src/lib/server/auth/legacy-scope.ts | coberto | RLS SELECT em gestor_vendedor substituída pela sessão do Worker; isolamento em paridade.workers.test.ts |
| Apenas admins e gestores podem criar relacionamentos | policy | src/hooks.server.ts e src/lib/server/auth/legacy-scope.ts | coberto | RLS INSERT em gestor_vendedor substituída pela sessão do Worker; isolamento em paridade.workers.test.ts |
| Gestores podem ver seus vendedores | policy | src/hooks.server.ts e src/lib/server/auth/legacy-scope.ts | coberto | RLS SELECT em gestor_vendedor substituída pela sessão do Worker; isolamento em paridade.workers.test.ts |
| Vendedores podem ver seus gestores | policy | src/hooks.server.ts e src/lib/server/auth/legacy-scope.ts | coberto | RLS SELECT em gestor_vendedor substituída pela sessão do Worker; isolamento em paridade.workers.test.ts |
| admin_full_access_gestor_vendedor | policy | src/hooks.server.ts e src/lib/server/auth/legacy-scope.ts | coberto | RLS ALL em gestor_vendedor substituída pela sessão do Worker; isolamento em paridade.workers.test.ts |
| gestor_vendedor_delete | policy | src/hooks.server.ts e src/lib/server/auth/legacy-scope.ts | coberto | RLS DELETE em gestor_vendedor substituída pela sessão do Worker; isolamento em paridade.workers.test.ts |
| gestor_vendedor_insert | policy | src/hooks.server.ts e src/lib/server/auth/legacy-scope.ts | coberto | RLS INSERT em gestor_vendedor substituída pela sessão do Worker; isolamento em paridade.workers.test.ts |
| gestor_vendedor_select | policy | src/hooks.server.ts e src/lib/server/auth/legacy-scope.ts | coberto | RLS SELECT em gestor_vendedor substituída pela sessão do Worker; isolamento em paridade.workers.test.ts |
| gestor_vendedor_update | policy | src/hooks.server.ts e src/lib/server/auth/legacy-scope.ts | coberto | RLS UPDATE em gestor_vendedor substituída pela sessão do Worker; isolamento em paridade.workers.test.ts |
| historico_viagens_real | tabela | legado_historico_viagens_real | coberto | drizzle/0013_legado_catalogo.sql (PK, UNIQUE, defaults) e drizzle/0014_legado_indices.sql |
| admin_full_access_historico_viagens_real | policy | src/hooks.server.ts e src/lib/server/auth/legacy-scope.ts | coberto | RLS ALL em historico_viagens_real substituída pela sessão do Worker; isolamento em paridade.workers.test.ts |
| inquiry | tabela | legado_inquiry | coberto | drizzle/0013_legado_catalogo.sql (PK, UNIQUE, defaults) e drizzle/0014_legado_indices.sql |
| inquiry_admin_all | policy | src/hooks.server.ts e src/lib/server/auth/legacy-scope.ts | coberto | RLS ALL em inquiry substituída pela sessão do Worker; isolamento em paridade.workers.test.ts |
| inquiry_preference | tabela | legado_inquiry_preference | coberto | drizzle/0013_legado_catalogo.sql (PK, UNIQUE, defaults) e drizzle/0014_legado_indices.sql |
| inquiry_preference_admin_all | policy | src/hooks.server.ts e src/lib/server/auth/legacy-scope.ts | coberto | RLS ALL em inquiry_preference substituída pela sessão do Worker; isolamento em paridade.workers.test.ts |
| lgpd_atividades_tratamento | tabela | legado_lgpd_atividades_tratamento | coberto | drizzle/0013_legado_catalogo.sql (PK, UNIQUE, defaults) e drizzle/0014_legado_indices.sql |
| lgpd_atividades_deny_anon | policy | src/hooks.server.ts e src/lib/server/auth/legacy-scope.ts | coberto | RLS ALL em lgpd_atividades_tratamento substituída pela sessão do Worker; isolamento em paridade.workers.test.ts |
| lgpd_consentimentos | tabela | legado_lgpd_consentimentos | coberto | drizzle/0013_legado_catalogo.sql (PK, UNIQUE, defaults) e drizzle/0014_legado_indices.sql |
| lgpd_consentimentos_deny_anon | policy | src/hooks.server.ts e src/lib/server/auth/legacy-scope.ts | coberto | RLS ALL em lgpd_consentimentos substituída pela sessão do Worker; isolamento em paridade.workers.test.ts |
| lgpd_consentimentos_updated_at | trigger | src/lib/server/data/query.ts | migrado | updated_at gravado na escrita |
| lgpd_solicitacoes | tabela | legado_lgpd_solicitacoes | coberto | drizzle/0013_legado_catalogo.sql (PK, UNIQUE, defaults) e drizzle/0014_legado_indices.sql |
| lgpd_solicitacoes_deny_anon | policy | src/hooks.server.ts e src/lib/server/auth/legacy-scope.ts | coberto | RLS ALL em lgpd_solicitacoes substituída pela sessão do Worker; isolamento em paridade.workers.test.ts |
| lgpd_solicitacoes_updated_at | trigger | src/lib/server/data/query.ts | migrado | updated_at gravado na escrita |
| logs | tabela | legado_logs | coberto | drizzle/0013_legado_catalogo.sql (PK, UNIQUE, defaults) e drizzle/0014_legado_indices.sql |
| Allow logging from frontend | policy | src/hooks.server.ts e src/lib/server/auth/legacy-scope.ts | coberto | RLS INSERT em logs substituída pela sessão do Worker; isolamento em paridade.workers.test.ts |
| admin_full_access_logs | policy | src/hooks.server.ts e src/lib/server/auth/legacy-scope.ts | coberto | RLS ALL em logs substituída pela sessão do Worker; isolamento em paridade.workers.test.ts |
| logs_admin | policy | src/hooks.server.ts e src/lib/server/auth/legacy-scope.ts | coberto | RLS SELECT em logs substituída pela sessão do Worker; isolamento em paridade.workers.test.ts |
| logs_admin_only | policy | src/hooks.server.ts e src/lib/server/auth/legacy-scope.ts | coberto | RLS SELECT em logs substituída pela sessão do Worker; isolamento em paridade.workers.test.ts |
| logs_insert | policy | src/hooks.server.ts e src/lib/server/auth/legacy-scope.ts | coberto | RLS INSERT em logs substituída pela sessão do Worker; isolamento em paridade.workers.test.ts |
| logs_insert_by_owner | policy | src/hooks.server.ts e src/lib/server/auth/legacy-scope.ts | coberto | RLS INSERT em logs substituída pela sessão do Worker; isolamento em paridade.workers.test.ts |
| logs_select_admin | policy | src/hooks.server.ts e src/lib/server/auth/legacy-scope.ts | coberto | RLS SELECT em logs substituída pela sessão do Worker; isolamento em paridade.workers.test.ts |
| logs_select_owner | policy | src/hooks.server.ts e src/lib/server/auth/legacy-scope.ts | coberto | RLS SELECT em logs substituída pela sessão do Worker; isolamento em paridade.workers.test.ts |
| master_documents | tabela | legado_master_documents | coberto | drizzle/0013_legado_catalogo.sql (PK, UNIQUE, defaults) e drizzle/0014_legado_indices.sql |
| master_documents_admin | policy | src/hooks.server.ts e src/lib/server/auth/legacy-scope.ts | coberto | RLS ALL em master_documents substituída pela sessão do Worker; isolamento em paridade.workers.test.ts |
| master_empresas | tabela | legado_master_empresas | coberto | drizzle/0013_legado_catalogo.sql (PK, UNIQUE, defaults) e drizzle/0014_legado_indices.sql |
| master_empresas_delete_admin | policy | src/hooks.server.ts e src/lib/server/auth/legacy-scope.ts | coberto | RLS DELETE em master_empresas substituída pela sessão do Worker; isolamento em paridade.workers.test.ts |
| master_empresas_insert_admin | policy | src/hooks.server.ts e src/lib/server/auth/legacy-scope.ts | coberto | RLS INSERT em master_empresas substituída pela sessão do Worker; isolamento em paridade.workers.test.ts |
| master_empresas_select | policy | src/hooks.server.ts e src/lib/server/auth/legacy-scope.ts | coberto | RLS SELECT em master_empresas substituída pela sessão do Worker; isolamento em paridade.workers.test.ts |
| master_empresas_update_admin | policy | src/hooks.server.ts e src/lib/server/auth/legacy-scope.ts | coberto | RLS UPDATE em master_empresas substituída pela sessão do Worker; isolamento em paridade.workers.test.ts |
| menu_prefs | tabela | legado_menu_prefs | coberto | drizzle/0013_legado_catalogo.sql (PK, UNIQUE, defaults) e drizzle/0014_legado_indices.sql |
| menu_prefs_delete | policy | src/hooks.server.ts e src/lib/server/auth/legacy-scope.ts | coberto | RLS DELETE em menu_prefs substituída pela sessão do Worker; isolamento em paridade.workers.test.ts |
| menu_prefs_insert | policy | src/hooks.server.ts e src/lib/server/auth/legacy-scope.ts | coberto | RLS INSERT em menu_prefs substituída pela sessão do Worker; isolamento em paridade.workers.test.ts |
| menu_prefs_select | policy | src/hooks.server.ts e src/lib/server/auth/legacy-scope.ts | coberto | RLS SELECT em menu_prefs substituída pela sessão do Worker; isolamento em paridade.workers.test.ts |
| menu_prefs_update | policy | src/hooks.server.ts e src/lib/server/auth/legacy-scope.ts | coberto | RLS UPDATE em menu_prefs substituída pela sessão do Worker; isolamento em paridade.workers.test.ts |
| message_templates_v2 | tabela | legado_message_templates_v2 | coberto | drizzle/0013_legado_catalogo.sql (PK, UNIQUE, defaults) e drizzle/0014_legado_indices.sql |
| message_templates_v2_delete_policy | policy | src/hooks.server.ts e src/lib/server/auth/legacy-scope.ts | coberto | RLS DELETE em message_templates_v2 substituída pela sessão do Worker; isolamento em paridade.workers.test.ts |
| message_templates_v2_insert_policy | policy | src/hooks.server.ts e src/lib/server/auth/legacy-scope.ts | coberto | RLS INSERT em message_templates_v2 substituída pela sessão do Worker; isolamento em paridade.workers.test.ts |
| message_templates_v2_select_policy | policy | src/hooks.server.ts e src/lib/server/auth/legacy-scope.ts | coberto | RLS SELECT em message_templates_v2 substituída pela sessão do Worker; isolamento em paridade.workers.test.ts |
| message_templates_v2_update_policy | policy | src/hooks.server.ts e src/lib/server/auth/legacy-scope.ts | coberto | RLS UPDATE em message_templates_v2 substituída pela sessão do Worker; isolamento em paridade.workers.test.ts |
| trg_normalize_message_templates_v2_nome | trigger | src/lib/server/data/legado-rules.ts | migrado | regra do gatilho aplicada na escrita; legado-rules.test.ts |
| update_message_templates_v2_updated_at | trigger | src/lib/server/data/query.ts | migrado | updated_at gravado na escrita |
| metas_vendedor | tabela | legado_metas_vendedor | coberto | drizzle/0013_legado_catalogo.sql (PK, UNIQUE, defaults) e drizzle/0014_legado_indices.sql |
| admin_full_access_metas_vendedor | policy | src/hooks.server.ts e src/lib/server/auth/legacy-scope.ts | coberto | RLS ALL em metas_vendedor substituída pela sessão do Worker; isolamento em paridade.workers.test.ts |
| metas_delete | policy | src/hooks.server.ts e src/lib/server/auth/legacy-scope.ts | coberto | RLS DELETE em metas_vendedor substituída pela sessão do Worker; isolamento em paridade.workers.test.ts |
| metas_insert | policy | src/hooks.server.ts e src/lib/server/auth/legacy-scope.ts | coberto | RLS INSERT em metas_vendedor substituída pela sessão do Worker; isolamento em paridade.workers.test.ts |
| metas_select | policy | src/hooks.server.ts e src/lib/server/auth/legacy-scope.ts | coberto | RLS SELECT em metas_vendedor substituída pela sessão do Worker; isolamento em paridade.workers.test.ts |
| metas_update | policy | src/hooks.server.ts e src/lib/server/auth/legacy-scope.ts | coberto | RLS UPDATE em metas_vendedor substituída pela sessão do Worker; isolamento em paridade.workers.test.ts |
| metas_vendedor_select | policy | src/hooks.server.ts e src/lib/server/auth/legacy-scope.ts | coberto | RLS SELECT em metas_vendedor substituída pela sessão do Worker; isolamento em paridade.workers.test.ts |
| metas_vendedor_write | policy | src/hooks.server.ts e src/lib/server/auth/legacy-scope.ts | coberto | RLS ALL em metas_vendedor substituída pela sessão do Worker; isolamento em paridade.workers.test.ts |
| check_metas_vendedor_tipo | trigger | src/lib/server/data/legado-rules.ts | migrado | regra do gatilho aplicada na escrita; legado-rules.test.ts |
| trg_update_metas_vendedor_updated_at | trigger | src/lib/server/data/query.ts | migrado | updated_at gravado na escrita |
| metas_vendedor_produto | tabela | legado_metas_vendedor_produto | coberto | drizzle/0013_legado_catalogo.sql (PK, UNIQUE, defaults) e drizzle/0014_legado_indices.sql |
| admin_full_access_metas_vendedor_produto | policy | src/hooks.server.ts e src/lib/server/auth/legacy-scope.ts | coberto | RLS ALL em metas_vendedor_produto substituída pela sessão do Worker; isolamento em paridade.workers.test.ts |
| metas_vendedor_produto_select | policy | src/hooks.server.ts e src/lib/server/auth/legacy-scope.ts | coberto | RLS SELECT em metas_vendedor_produto substituída pela sessão do Worker; isolamento em paridade.workers.test.ts |
| metas_vendedor_produto_write | policy | src/hooks.server.ts e src/lib/server/auth/legacy-scope.ts | coberto | RLS ALL em metas_vendedor_produto substituída pela sessão do Worker; isolamento em paridade.workers.test.ts |
| minhas_preferencias | tabela | legado_minhas_preferencias | coberto | drizzle/0013_legado_catalogo.sql (PK, UNIQUE, defaults) e drizzle/0014_legado_indices.sql |
| minhas_preferencias_delete | policy | src/hooks.server.ts e src/lib/server/auth/legacy-scope.ts | coberto | RLS DELETE em minhas_preferencias substituída pela sessão do Worker; isolamento em paridade.workers.test.ts |
| minhas_preferencias_insert | policy | src/hooks.server.ts e src/lib/server/auth/legacy-scope.ts | coberto | RLS INSERT em minhas_preferencias substituída pela sessão do Worker; isolamento em paridade.workers.test.ts |
| minhas_preferencias_select | policy | src/hooks.server.ts e src/lib/server/auth/legacy-scope.ts | coberto | RLS SELECT em minhas_preferencias substituída pela sessão do Worker; isolamento em paridade.workers.test.ts |
| minhas_preferencias_update | policy | src/hooks.server.ts e src/lib/server/auth/legacy-scope.ts | coberto | RLS UPDATE em minhas_preferencias substituída pela sessão do Worker; isolamento em paridade.workers.test.ts |
| trg_normalize_minhas_preferencias_nome | trigger | src/lib/server/data/legado-rules.ts | migrado | regra do gatilho aplicada na escrita; legado-rules.test.ts |
| minhas_preferencias_shares | tabela | legado_minhas_preferencias_shares | coberto | drizzle/0013_legado_catalogo.sql (PK, UNIQUE, defaults) e drizzle/0014_legado_indices.sql |
| minhas_preferencias_shares_delete | policy | src/hooks.server.ts e src/lib/server/auth/legacy-scope.ts | coberto | RLS DELETE em minhas_preferencias_shares substituída pela sessão do Worker; isolamento em paridade.workers.test.ts |
| minhas_preferencias_shares_insert | policy | src/hooks.server.ts e src/lib/server/auth/legacy-scope.ts | coberto | RLS INSERT em minhas_preferencias_shares substituída pela sessão do Worker; isolamento em paridade.workers.test.ts |
| minhas_preferencias_shares_select | policy | src/hooks.server.ts e src/lib/server/auth/legacy-scope.ts | coberto | RLS SELECT em minhas_preferencias_shares substituída pela sessão do Worker; isolamento em paridade.workers.test.ts |
| minhas_preferencias_shares_update | policy | src/hooks.server.ts e src/lib/server/auth/legacy-scope.ts | coberto | RLS UPDATE em minhas_preferencias_shares substituída pela sessão do Worker; isolamento em paridade.workers.test.ts |
| modulo_acesso | tabela | legado_modulo_acesso | coberto | drizzle/0013_legado_catalogo.sql (PK, UNIQUE, defaults) e drizzle/0014_legado_indices.sql |
| Admin pode gerenciar acessos | policy | src/hooks.server.ts e src/lib/server/auth/legacy-scope.ts | coberto | RLS ALL em modulo_acesso substituída pela sessão do Worker; isolamento em paridade.workers.test.ts |
| Gestor pode visualizar acessos de sua empresa | policy | src/hooks.server.ts e src/lib/server/auth/legacy-scope.ts | coberto | RLS SELECT em modulo_acesso substituída pela sessão do Worker; isolamento em paridade.workers.test.ts |
| Users can select own module access | policy | src/hooks.server.ts e src/lib/server/auth/legacy-scope.ts | coberto | RLS SELECT em modulo_acesso substituída pela sessão do Worker; isolamento em paridade.workers.test.ts |
| Usuário pode visualizar seus próprios acessos | policy | src/hooks.server.ts e src/lib/server/auth/legacy-scope.ts | coberto | RLS SELECT em modulo_acesso substituída pela sessão do Worker; isolamento em paridade.workers.test.ts |
| admin_full_access_modulo_acesso | policy | src/hooks.server.ts e src/lib/server/auth/legacy-scope.ts | coberto | RLS ALL em modulo_acesso substituída pela sessão do Worker; isolamento em paridade.workers.test.ts |
| modulo_acesso_delete_admin | policy | src/hooks.server.ts e src/lib/server/auth/legacy-scope.ts | coberto | RLS DELETE em modulo_acesso substituída pela sessão do Worker; isolamento em paridade.workers.test.ts |
| modulo_acesso_insert_admin | policy | src/hooks.server.ts e src/lib/server/auth/legacy-scope.ts | coberto | RLS INSERT em modulo_acesso substituída pela sessão do Worker; isolamento em paridade.workers.test.ts |
| modulo_acesso_select | policy | src/hooks.server.ts e src/lib/server/auth/legacy-scope.ts | coberto | RLS SELECT em modulo_acesso substituída pela sessão do Worker; isolamento em paridade.workers.test.ts |
| modulo_acesso_update_admin | policy | src/hooks.server.ts e src/lib/server/auth/legacy-scope.ts | coberto | RLS UPDATE em modulo_acesso substituída pela sessão do Worker; isolamento em paridade.workers.test.ts |
| trg_update_modulo_acesso_updated_at | trigger | src/lib/server/data/query.ts | migrado | updated_at gravado na escrita |
| modulo_acesso_backup | tabela | legado_modulo_acesso_backup | coberto | drizzle/0013_legado_catalogo.sql (PK, UNIQUE, defaults) e drizzle/0014_legado_indices.sql |
| modulo_acesso_backup_admin_all | policy | src/hooks.server.ts e src/lib/server/auth/legacy-scope.ts | coberto | RLS ALL em modulo_acesso_backup substituída pela sessão do Worker; isolamento em paridade.workers.test.ts |
| mural_recado_respostas | tabela | legado_mural_recado_respostas | coberto | drizzle/0013_legado_catalogo.sql (PK, UNIQUE, defaults) e drizzle/0014_legado_indices.sql |
| mural_respostas_delete | policy | src/hooks.server.ts e src/lib/server/auth/legacy-scope.ts | coberto | RLS DELETE em mural_recado_respostas substituída pela sessão do Worker; isolamento em paridade.workers.test.ts |
| mural_respostas_insert | policy | src/hooks.server.ts e src/lib/server/auth/legacy-scope.ts | coberto | RLS INSERT em mural_recado_respostas substituída pela sessão do Worker; isolamento em paridade.workers.test.ts |
| mural_respostas_select | policy | src/hooks.server.ts e src/lib/server/auth/legacy-scope.ts | coberto | RLS SELECT em mural_recado_respostas substituída pela sessão do Worker; isolamento em paridade.workers.test.ts |
| trg_mural_respostas_defaults | trigger | dump public.sql | coberto | gatilho mural_recado_respostas_set_defaults lido no dump; efeito de apoio sem regra nova além do serviço |
| mural_recados | tabela | legado_mural_recados | coberto | drizzle/0013_legado_catalogo.sql (PK, UNIQUE, defaults) e drizzle/0014_legado_indices.sql |
| mural_recados_delete | policy | src/hooks.server.ts e src/lib/server/auth/legacy-scope.ts | coberto | RLS DELETE em mural_recados substituída pela sessão do Worker; isolamento em paridade.workers.test.ts |
| mural_recados_insert | policy | src/hooks.server.ts e src/lib/server/auth/legacy-scope.ts | coberto | RLS INSERT em mural_recados substituída pela sessão do Worker; isolamento em paridade.workers.test.ts |
| mural_recados_select | policy | src/hooks.server.ts e src/lib/server/auth/legacy-scope.ts | coberto | RLS SELECT em mural_recados substituída pela sessão do Worker; isolamento em paridade.workers.test.ts |
| trg_mural_recados_defaults | trigger | dump public.sql | coberto | gatilho mural_recados_set_defaults lido no dump; efeito de apoio sem regra nova além do serviço |
| mural_recados_arquivos | tabela | legado_mural_recados_arquivos | coberto | drizzle/0013_legado_catalogo.sql (PK, UNIQUE, defaults) e drizzle/0014_legado_indices.sql |
| mural_recados_arquivos_delete | policy | src/hooks.server.ts e src/lib/server/auth/legacy-scope.ts | coberto | RLS DELETE em mural_recados_arquivos substituída pela sessão do Worker; isolamento em paridade.workers.test.ts |
| mural_recados_arquivos_insert | policy | src/hooks.server.ts e src/lib/server/auth/legacy-scope.ts | coberto | RLS INSERT em mural_recados_arquivos substituída pela sessão do Worker; isolamento em paridade.workers.test.ts |
| mural_recados_arquivos_select | policy | src/hooks.server.ts e src/lib/server/auth/legacy-scope.ts | coberto | RLS SELECT em mural_recados_arquivos substituída pela sessão do Worker; isolamento em paridade.workers.test.ts |
| mural_recados_leituras | tabela | legado_mural_recados_leituras | coberto | drizzle/0013_legado_catalogo.sql (PK, UNIQUE, defaults) e drizzle/0014_legado_indices.sql |
| mural_recados_leituras_insert | policy | src/hooks.server.ts e src/lib/server/auth/legacy-scope.ts | coberto | RLS INSERT em mural_recados_leituras substituída pela sessão do Worker; isolamento em paridade.workers.test.ts |
| mural_recados_leituras_select | policy | src/hooks.server.ts e src/lib/server/auth/legacy-scope.ts | coberto | RLS SELECT em mural_recados_leituras substituída pela sessão do Worker; isolamento em paridade.workers.test.ts |
| mural_recados_leituras_update | policy | src/hooks.server.ts e src/lib/server/auth/legacy-scope.ts | coberto | RLS UPDATE em mural_recados_leituras substituída pela sessão do Worker; isolamento em paridade.workers.test.ts |
| paises | tabela | legado_paises | coberto | drizzle/0013_legado_catalogo.sql (PK, UNIQUE, defaults) e drizzle/0014_legado_indices.sql |
| admin_full_access_paises | policy | src/hooks.server.ts e src/lib/server/auth/legacy-scope.ts | coberto | RLS ALL em paises substituída pela sessão do Worker; isolamento em paridade.workers.test.ts |
| paises_read | policy | src/hooks.server.ts e src/lib/server/auth/legacy-scope.ts | coberto | RLS SELECT em paises substituída pela sessão do Worker; isolamento em paridade.workers.test.ts |
| paises_select | policy | src/hooks.server.ts e src/lib/server/auth/legacy-scope.ts | coberto | RLS SELECT em paises substituída pela sessão do Worker; isolamento em paridade.workers.test.ts |
| paises_view | policy | src/hooks.server.ts e src/lib/server/auth/legacy-scope.ts | coberto | RLS SELECT em paises substituída pela sessão do Worker; isolamento em paridade.workers.test.ts |
| paises_write | policy | src/hooks.server.ts e src/lib/server/auth/legacy-scope.ts | coberto | RLS ALL em paises substituída pela sessão do Worker; isolamento em paridade.workers.test.ts |
| select_paises | policy | src/hooks.server.ts e src/lib/server/auth/legacy-scope.ts | coberto | RLS SELECT em paises substituída pela sessão do Worker; isolamento em paridade.workers.test.ts |
| parametros_cambios | tabela | legado_parametros_cambios | coberto | drizzle/0013_legado_catalogo.sql (PK, UNIQUE, defaults) e drizzle/0014_legado_indices.sql |
| parametros_cambios_select | policy | src/hooks.server.ts e src/lib/server/auth/legacy-scope.ts | coberto | RLS SELECT em parametros_cambios substituída pela sessão do Worker; isolamento em paridade.workers.test.ts |
| parametros_cambios_write | policy | src/hooks.server.ts e src/lib/server/auth/legacy-scope.ts | coberto | RLS ALL em parametros_cambios substituída pela sessão do Worker; isolamento em paridade.workers.test.ts |
| parametros_comissao | tabela | legado_parametros_comissao | coberto | drizzle/0013_legado_catalogo.sql (PK, UNIQUE, defaults) e drizzle/0014_legado_indices.sql |
| admin_full_access_parametros_comissao | policy | src/hooks.server.ts e src/lib/server/auth/legacy-scope.ts | coberto | RLS ALL em parametros_comissao substituída pela sessão do Worker; isolamento em paridade.workers.test.ts |
| parametros_comissao_insert | policy | src/hooks.server.ts e src/lib/server/auth/legacy-scope.ts | coberto | RLS INSERT em parametros_comissao substituída pela sessão do Worker; isolamento em paridade.workers.test.ts |
| parametros_comissao_select | policy | src/hooks.server.ts e src/lib/server/auth/legacy-scope.ts | coberto | RLS SELECT em parametros_comissao substituída pela sessão do Worker; isolamento em paridade.workers.test.ts |
| parametros_comissao_update | policy | src/hooks.server.ts e src/lib/server/auth/legacy-scope.ts | coberto | RLS UPDATE em parametros_comissao substituída pela sessão do Worker; isolamento em paridade.workers.test.ts |
| parametros_pagamentos_nao_comissionaveis | tabela | legado_parametros_pagamentos_nao_comissionaveis | coberto | drizzle/0013_legado_catalogo.sql (PK, UNIQUE, defaults) e drizzle/0014_legado_indices.sql |
| nao_comissionaveis_delete | policy | src/hooks.server.ts e src/lib/server/auth/legacy-scope.ts | coberto | RLS DELETE em parametros_pagamentos_nao_comissionaveis substituída pela sessão do Worker; isolamento em paridade.workers.test.ts |
| nao_comissionaveis_insert | policy | src/hooks.server.ts e src/lib/server/auth/legacy-scope.ts | coberto | RLS INSERT em parametros_pagamentos_nao_comissionaveis substituída pela sessão do Worker; isolamento em paridade.workers.test.ts |
| nao_comissionaveis_select | policy | src/hooks.server.ts e src/lib/server/auth/legacy-scope.ts | coberto | RLS SELECT em parametros_pagamentos_nao_comissionaveis substituída pela sessão do Worker; isolamento em paridade.workers.test.ts |
| nao_comissionaveis_update | policy | src/hooks.server.ts e src/lib/server/auth/legacy-scope.ts | coberto | RLS UPDATE em parametros_pagamentos_nao_comissionaveis substituída pela sessão do Worker; isolamento em paridade.workers.test.ts |
| parametros_sistema | tabela | legado_parametros_sistema | coberto | drizzle/0013_legado_catalogo.sql (PK, UNIQUE, defaults) e drizzle/0014_legado_indices.sql |
| admin_full_access_parametros_sistema | policy | src/hooks.server.ts e src/lib/server/auth/legacy-scope.ts | coberto | RLS ALL em parametros_sistema substituída pela sessão do Worker; isolamento em paridade.workers.test.ts |
| plans | tabela | legado_plans | coberto | drizzle/0013_legado_catalogo.sql (PK, UNIQUE, defaults) e drizzle/0014_legado_indices.sql |
| plans_admin_all | policy | src/hooks.server.ts e src/lib/server/auth/legacy-scope.ts | coberto | RLS ALL em plans substituída pela sessão do Worker; isolamento em paridade.workers.test.ts |
| trg_normalize_plans_nome | trigger | src/lib/server/data/legado-rules.ts | migrado | regra do gatilho aplicada na escrita; legado-rules.test.ts |
| product_commission_rule | tabela | legado_product_commission_rule | coberto | drizzle/0013_legado_catalogo.sql (PK, UNIQUE, defaults) e drizzle/0014_legado_indices.sql |
| admin_full_access_product_commission_rule | policy | src/hooks.server.ts e src/lib/server/auth/legacy-scope.ts | coberto | RLS ALL em product_commission_rule substituída pela sessão do Worker; isolamento em paridade.workers.test.ts |
| product_commission_rule_pacote | tabela | legado_product_commission_rule_pacote | coberto | drizzle/0013_legado_catalogo.sql (PK, UNIQUE, defaults) e drizzle/0014_legado_indices.sql |
| product_commission_rule_pacote_admin_all | policy | src/hooks.server.ts e src/lib/server/auth/legacy-scope.ts | coberto | RLS ALL em product_commission_rule_pacote substituída pela sessão do Worker; isolamento em paridade.workers.test.ts |
| produtos | tabela | legado_produtos | coberto | drizzle/0013_legado_catalogo.sql (PK, UNIQUE, defaults) e drizzle/0014_legado_indices.sql |
| produtos_delete_scoped | policy | src/hooks.server.ts e src/lib/server/auth/legacy-scope.ts | coberto | RLS DELETE em produtos substituída pela sessão do Worker; isolamento em paridade.workers.test.ts |
| produtos_insert_scoped | policy | src/hooks.server.ts e src/lib/server/auth/legacy-scope.ts | coberto | RLS INSERT em produtos substituída pela sessão do Worker; isolamento em paridade.workers.test.ts |
| produtos_select_scoped | policy | src/hooks.server.ts e src/lib/server/auth/legacy-scope.ts | coberto | RLS SELECT em produtos substituída pela sessão do Worker; isolamento em paridade.workers.test.ts |
| produtos_update_scoped | policy | src/hooks.server.ts e src/lib/server/auth/legacy-scope.ts | coberto | RLS UPDATE em produtos substituída pela sessão do Worker; isolamento em paridade.workers.test.ts |
| produtos_guard_seguro | trigger | src/lib/server/data/legado-rules.ts | migrado | regra do gatilho aplicada na escrita; legado-rules.test.ts |
| update_destinos_updated_at | trigger | src/lib/server/data/query.ts | migrado | updated_at gravado na escrita |
| produtos_tarifas | tabela | legado_produtos_tarifas | coberto | drizzle/0013_legado_catalogo.sql (PK, UNIQUE, defaults) e drizzle/0014_legado_indices.sql |
| produtos_tarifas_admin_all | policy | src/hooks.server.ts e src/lib/server/auth/legacy-scope.ts | coberto | RLS ALL em produtos_tarifas substituída pela sessão do Worker; isolamento em paridade.workers.test.ts |
| quote | tabela | legado_quote | coberto | drizzle/0013_legado_catalogo.sql (PK, UNIQUE, defaults) e drizzle/0014_legado_indices.sql |
| quote_delete_own | policy | src/hooks.server.ts e src/lib/server/auth/legacy-scope.ts | coberto | RLS DELETE em quote substituída pela sessão do Worker; isolamento em paridade.workers.test.ts |
| quote_insert_own | policy | src/hooks.server.ts e src/lib/server/auth/legacy-scope.ts | coberto | RLS INSERT em quote substituída pela sessão do Worker; isolamento em paridade.workers.test.ts |
| quote_read_own | policy | src/hooks.server.ts e src/lib/server/auth/legacy-scope.ts | coberto | RLS SELECT em quote substituída pela sessão do Worker; isolamento em paridade.workers.test.ts |
| quote_update_own | policy | src/hooks.server.ts e src/lib/server/auth/legacy-scope.ts | coberto | RLS UPDATE em quote substituída pela sessão do Worker; isolamento em paridade.workers.test.ts |
| trg_quote_link_cliente_company | trigger | dump public.sql | coberto | gatilho trg_quote_link_cliente_company lido no dump; efeito de apoio sem regra nova além do serviço |
| quote_import_log | tabela | legado_quote_import_log | coberto | drizzle/0013_legado_catalogo.sql (PK, UNIQUE, defaults) e drizzle/0014_legado_indices.sql |
| quote_import_log_delete_own | policy | src/hooks.server.ts e src/lib/server/auth/legacy-scope.ts | coberto | RLS DELETE em quote_import_log substituída pela sessão do Worker; isolamento em paridade.workers.test.ts |
| quote_import_log_insert_own | policy | src/hooks.server.ts e src/lib/server/auth/legacy-scope.ts | coberto | RLS INSERT em quote_import_log substituída pela sessão do Worker; isolamento em paridade.workers.test.ts |
| quote_import_log_read_own | policy | src/hooks.server.ts e src/lib/server/auth/legacy-scope.ts | coberto | RLS SELECT em quote_import_log substituída pela sessão do Worker; isolamento em paridade.workers.test.ts |
| quote_import_log_update_own | policy | src/hooks.server.ts e src/lib/server/auth/legacy-scope.ts | coberto | RLS UPDATE em quote_import_log substituída pela sessão do Worker; isolamento em paridade.workers.test.ts |
| quote_item | tabela | legado_quote_item | coberto | drizzle/0013_legado_catalogo.sql (PK, UNIQUE, defaults) e drizzle/0014_legado_indices.sql |
| quote_item_delete_own | policy | src/hooks.server.ts e src/lib/server/auth/legacy-scope.ts | coberto | RLS DELETE em quote_item substituída pela sessão do Worker; isolamento em paridade.workers.test.ts |
| quote_item_insert_own | policy | src/hooks.server.ts e src/lib/server/auth/legacy-scope.ts | coberto | RLS INSERT em quote_item substituída pela sessão do Worker; isolamento em paridade.workers.test.ts |
| quote_item_read_own | policy | src/hooks.server.ts e src/lib/server/auth/legacy-scope.ts | coberto | RLS SELECT em quote_item substituída pela sessão do Worker; isolamento em paridade.workers.test.ts |
| quote_item_update_own | policy | src/hooks.server.ts e src/lib/server/auth/legacy-scope.ts | coberto | RLS UPDATE em quote_item substituída pela sessão do Worker; isolamento em paridade.workers.test.ts |
| quote_item_segment | tabela | legado_quote_item_segment | coberto | drizzle/0013_legado_catalogo.sql (PK, UNIQUE, defaults) e drizzle/0014_legado_indices.sql |
| quote_item_segment_delete_own | policy | src/hooks.server.ts e src/lib/server/auth/legacy-scope.ts | coberto | RLS DELETE em quote_item_segment substituída pela sessão do Worker; isolamento em paridade.workers.test.ts |
| quote_item_segment_insert_own | policy | src/hooks.server.ts e src/lib/server/auth/legacy-scope.ts | coberto | RLS INSERT em quote_item_segment substituída pela sessão do Worker; isolamento em paridade.workers.test.ts |
| quote_item_segment_read_own | policy | src/hooks.server.ts e src/lib/server/auth/legacy-scope.ts | coberto | RLS SELECT em quote_item_segment substituída pela sessão do Worker; isolamento em paridade.workers.test.ts |
| quote_item_segment_update_own | policy | src/hooks.server.ts e src/lib/server/auth/legacy-scope.ts | coberto | RLS UPDATE em quote_item_segment substituída pela sessão do Worker; isolamento em paridade.workers.test.ts |
| quote_print_settings | tabela | legado_quote_print_settings | coberto | drizzle/0013_legado_catalogo.sql (PK, UNIQUE, defaults) e drizzle/0014_legado_indices.sql |
| quote_print_settings_delete_own | policy | src/hooks.server.ts e src/lib/server/auth/legacy-scope.ts | coberto | RLS DELETE em quote_print_settings substituída pela sessão do Worker; isolamento em paridade.workers.test.ts |
| quote_print_settings_insert_own | policy | src/hooks.server.ts e src/lib/server/auth/legacy-scope.ts | coberto | RLS INSERT em quote_print_settings substituída pela sessão do Worker; isolamento em paridade.workers.test.ts |
| quote_print_settings_select_own | policy | src/hooks.server.ts e src/lib/server/auth/legacy-scope.ts | coberto | RLS SELECT em quote_print_settings substituída pela sessão do Worker; isolamento em paridade.workers.test.ts |
| quote_print_settings_update_own | policy | src/hooks.server.ts e src/lib/server/auth/legacy-scope.ts | coberto | RLS UPDATE em quote_print_settings substituída pela sessão do Worker; isolamento em paridade.workers.test.ts |
| trg_normalize_quote_print_consultor_nome | trigger | src/lib/server/data/legado-rules.ts | migrado | regra do gatilho aplicada na escrita; legado-rules.test.ts |
| trg_normalize_quote_print_settings_filial_nome | trigger | src/lib/server/data/legado-rules.ts | migrado | regra do gatilho aplicada na escrita; legado-rules.test.ts |
| trg_quote_print_settings_updated_at | trigger | src/lib/server/data/query.ts | migrado | updated_at gravado na escrita |
| ranking_read_model_status | tabela | legado_ranking_read_model_status | coberto | drizzle/0013_legado_catalogo.sql (PK, UNIQUE, defaults) e drizzle/0014_legado_indices.sql |
| ranking_recibo_contribuicoes | tabela | legado_ranking_recibo_contribuicoes | coberto | drizzle/0013_legado_catalogo.sql (PK, UNIQUE, defaults) e drizzle/0014_legado_indices.sql |
| recibos | tabela | legado_recibos | coberto | drizzle/0013_legado_catalogo.sql (PK, UNIQUE, defaults) e drizzle/0014_legado_indices.sql |
| admin_full_access_recibos | policy | src/hooks.server.ts e src/lib/server/auth/legacy-scope.ts | coberto | RLS ALL em recibos substituída pela sessão do Worker; isolamento em paridade.workers.test.ts |
| recibos_insert | policy | src/hooks.server.ts e src/lib/server/auth/legacy-scope.ts | coberto | RLS INSERT em recibos substituída pela sessão do Worker; isolamento em paridade.workers.test.ts |
| recibos_select | policy | src/hooks.server.ts e src/lib/server/auth/legacy-scope.ts | coberto | RLS SELECT em recibos substituída pela sessão do Worker; isolamento em paridade.workers.test.ts |
| roteiro_dia | tabela | legado_roteiro_dia | coberto | drizzle/0013_legado_catalogo.sql (PK, UNIQUE, defaults) e drizzle/0014_legado_indices.sql |
| roteiro_dia_delete | policy | src/hooks.server.ts e src/lib/server/auth/legacy-scope.ts | coberto | RLS DELETE em roteiro_dia substituída pela sessão do Worker; isolamento em paridade.workers.test.ts |
| roteiro_dia_insert | policy | src/hooks.server.ts e src/lib/server/auth/legacy-scope.ts | coberto | RLS INSERT em roteiro_dia substituída pela sessão do Worker; isolamento em paridade.workers.test.ts |
| roteiro_dia_select | policy | src/hooks.server.ts e src/lib/server/auth/legacy-scope.ts | coberto | RLS SELECT em roteiro_dia substituída pela sessão do Worker; isolamento em paridade.workers.test.ts |
| roteiro_dia_update | policy | src/hooks.server.ts e src/lib/server/auth/legacy-scope.ts | coberto | RLS UPDATE em roteiro_dia substituída pela sessão do Worker; isolamento em paridade.workers.test.ts |
| roteiro_hotel | tabela | legado_roteiro_hotel | coberto | drizzle/0013_legado_catalogo.sql (PK, UNIQUE, defaults) e drizzle/0014_legado_indices.sql |
| roteiro_hotel_admin_all | policy | src/hooks.server.ts e src/lib/server/auth/legacy-scope.ts | coberto | RLS ALL em roteiro_hotel substituída pela sessão do Worker; isolamento em paridade.workers.test.ts |
| roteiro_investimento | tabela | legado_roteiro_investimento | coberto | drizzle/0013_legado_catalogo.sql (PK, UNIQUE, defaults) e drizzle/0014_legado_indices.sql |
| roteiro_investimento_admin_all | policy | src/hooks.server.ts e src/lib/server/auth/legacy-scope.ts | coberto | RLS ALL em roteiro_investimento substituída pela sessão do Worker; isolamento em paridade.workers.test.ts |
| roteiro_pagamento | tabela | legado_roteiro_pagamento | coberto | drizzle/0013_legado_catalogo.sql (PK, UNIQUE, defaults) e drizzle/0014_legado_indices.sql |
| roteiro_pagamento_admin_all | policy | src/hooks.server.ts e src/lib/server/auth/legacy-scope.ts | coberto | RLS ALL em roteiro_pagamento substituída pela sessão do Worker; isolamento em paridade.workers.test.ts |
| roteiro_passeio | tabela | legado_roteiro_passeio | coberto | drizzle/0013_legado_catalogo.sql (PK, UNIQUE, defaults) e drizzle/0014_legado_indices.sql |
| roteiro_passeio_admin_all | policy | src/hooks.server.ts e src/lib/server/auth/legacy-scope.ts | coberto | RLS ALL em roteiro_passeio substituída pela sessão do Worker; isolamento em paridade.workers.test.ts |
| roteiro_personalizado | tabela | legado_roteiro_personalizado | coberto | drizzle/0013_legado_catalogo.sql (PK, UNIQUE, defaults) e drizzle/0014_legado_indices.sql |
| roteiro_delete | policy | src/hooks.server.ts e src/lib/server/auth/legacy-scope.ts | coberto | RLS DELETE em roteiro_personalizado substituída pela sessão do Worker; isolamento em paridade.workers.test.ts |
| roteiro_insert | policy | src/hooks.server.ts e src/lib/server/auth/legacy-scope.ts | coberto | RLS INSERT em roteiro_personalizado substituída pela sessão do Worker; isolamento em paridade.workers.test.ts |
| roteiro_select | policy | src/hooks.server.ts e src/lib/server/auth/legacy-scope.ts | coberto | RLS SELECT em roteiro_personalizado substituída pela sessão do Worker; isolamento em paridade.workers.test.ts |
| roteiro_update | policy | src/hooks.server.ts e src/lib/server/auth/legacy-scope.ts | coberto | RLS UPDATE em roteiro_personalizado substituída pela sessão do Worker; isolamento em paridade.workers.test.ts |
| trg_normalize_roteiro_personalizado_nome | trigger | src/lib/server/data/legado-rules.ts | migrado | regra do gatilho aplicada na escrita; legado-rules.test.ts |
| roteiro_sugestoes | tabela | legado_roteiro_sugestoes | coberto | drizzle/0013_legado_catalogo.sql (PK, UNIQUE, defaults) e drizzle/0014_legado_indices.sql |
| roteiro_sugestoes_delete | policy | src/hooks.server.ts e src/lib/server/auth/legacy-scope.ts | coberto | RLS DELETE em roteiro_sugestoes substituída pela sessão do Worker; isolamento em paridade.workers.test.ts |
| roteiro_sugestoes_insert | policy | src/hooks.server.ts e src/lib/server/auth/legacy-scope.ts | coberto | RLS INSERT em roteiro_sugestoes substituída pela sessão do Worker; isolamento em paridade.workers.test.ts |
| roteiro_sugestoes_select | policy | src/hooks.server.ts e src/lib/server/auth/legacy-scope.ts | coberto | RLS SELECT em roteiro_sugestoes substituída pela sessão do Worker; isolamento em paridade.workers.test.ts |
| roteiro_sugestoes_update | policy | src/hooks.server.ts e src/lib/server/auth/legacy-scope.ts | coberto | RLS UPDATE em roteiro_sugestoes substituída pela sessão do Worker; isolamento em paridade.workers.test.ts |
| roteiro_transporte | tabela | legado_roteiro_transporte | coberto | drizzle/0013_legado_catalogo.sql (PK, UNIQUE, defaults) e drizzle/0014_legado_indices.sql |
| roteiro_transporte_admin_all | policy | src/hooks.server.ts e src/lib/server/auth/legacy-scope.ts | coberto | RLS ALL em roteiro_transporte substituída pela sessão do Worker; isolamento em paridade.workers.test.ts |
| trg_normalize_roteiro_transporte_tarifa_nome | trigger | src/lib/server/data/legado-rules.ts | migrado | regra do gatilho aplicada na escrita; legado-rules.test.ts |
| sac_controle | tabela | legado_sac_controle | coberto | drizzle/0013_legado_catalogo.sql (PK, UNIQUE, defaults) e drizzle/0014_legado_indices.sql |
| sac_controle_select | policy | src/hooks.server.ts e src/lib/server/auth/legacy-scope.ts | coberto | RLS SELECT em sac_controle substituída pela sessão do Worker; isolamento em paridade.workers.test.ts |
| sac_controle_write | policy | src/hooks.server.ts e src/lib/server/auth/legacy-scope.ts | coberto | RLS ALL em sac_controle substituída pela sessão do Worker; isolamento em paridade.workers.test.ts |
| sac_interacoes | tabela | legado_sac_interacoes | coberto | drizzle/0013_legado_catalogo.sql (PK, UNIQUE, defaults) e drizzle/0014_legado_indices.sql |
| sac_interacoes_select | policy | src/hooks.server.ts e src/lib/server/auth/legacy-scope.ts | coberto | RLS SELECT em sac_interacoes substituída pela sessão do Worker; isolamento em paridade.workers.test.ts |
| sac_interacoes_write | policy | src/hooks.server.ts e src/lib/server/auth/legacy-scope.ts | coberto | RLS ALL em sac_interacoes substituída pela sessão do Worker; isolamento em paridade.workers.test.ts |
| security_audit_weekly_runs | tabela | legado_security_audit_weekly_runs | coberto | drizzle/0013_legado_catalogo.sql (PK, UNIQUE, defaults) e drizzle/0014_legado_indices.sql |
| security_audit_weekly_runs_admin_select | policy | src/hooks.server.ts e src/lib/server/auth/legacy-scope.ts | coberto | RLS SELECT em security_audit_weekly_runs substituída pela sessão do Worker; isolamento em paridade.workers.test.ts |
| security_rate_limits | tabela | legado_security_rate_limits | coberto | drizzle/0013_legado_catalogo.sql (PK, UNIQUE, defaults) e drizzle/0014_legado_indices.sql |
| servico_fornecedor_price | tabela | legado_servico_fornecedor_price | coberto | drizzle/0013_legado_catalogo.sql (PK, UNIQUE, defaults) e drizzle/0014_legado_indices.sql |
| servico_fornecedor_price_admin_all | policy | src/hooks.server.ts e src/lib/server/auth/legacy-scope.ts | coberto | RLS ALL em servico_fornecedor_price substituída pela sessão do Worker; isolamento em paridade.workers.test.ts |
| servico_fornecedor_price_period | tabela | legado_servico_fornecedor_price_period | coberto | drizzle/0013_legado_catalogo.sql (PK, UNIQUE, defaults) e drizzle/0014_legado_indices.sql |
| servico_fornecedor_price_period_admin_all | policy | src/hooks.server.ts e src/lib/server/auth/legacy-scope.ts | coberto | RLS ALL em servico_fornecedor_price_period substituída pela sessão do Worker; isolamento em paridade.workers.test.ts |
| servico_price | tabela | legado_servico_price | coberto | drizzle/0013_legado_catalogo.sql (PK, UNIQUE, defaults) e drizzle/0014_legado_indices.sql |
| servico_price_admin_all | policy | src/hooks.server.ts e src/lib/server/auth/legacy-scope.ts | coberto | RLS ALL em servico_price substituída pela sessão do Worker; isolamento em paridade.workers.test.ts |
| servico_price_period | tabela | legado_servico_price_period | coberto | drizzle/0013_legado_catalogo.sql (PK, UNIQUE, defaults) e drizzle/0014_legado_indices.sql |
| servico_price_period_admin_all | policy | src/hooks.server.ts e src/lib/server/auth/legacy-scope.ts | coberto | RLS ALL em servico_price_period substituída pela sessão do Worker; isolamento em paridade.workers.test.ts |
| servicos | tabela | legado_servicos | coberto | drizzle/0013_legado_catalogo.sql (PK, UNIQUE, defaults) e drizzle/0014_legado_indices.sql |
| servicos_admin_all | policy | src/hooks.server.ts e src/lib/server/auth/legacy-scope.ts | coberto | RLS ALL em servicos substituída pela sessão do Worker; isolamento em paridade.workers.test.ts |
| trg_normalize_servicos_nome | trigger | src/lib/server/data/legado-rules.ts | migrado | regra do gatilho aplicada na escrita; legado-rules.test.ts |
| servicos_fornecedor | tabela | legado_servicos_fornecedor | coberto | drizzle/0013_legado_catalogo.sql (PK, UNIQUE, defaults) e drizzle/0014_legado_indices.sql |
| servicos_fornecedor_admin_all | policy | src/hooks.server.ts e src/lib/server/auth/legacy-scope.ts | coberto | RLS ALL em servicos_fornecedor substituída pela sessão do Worker; isolamento em paridade.workers.test.ts |
| trg_normalize_servicos_fornecedor_nome | trigger | src/lib/server/data/legado-rules.ts | migrado | regra do gatilho aplicada na escrita; legado-rules.test.ts |
| subdivisoes | tabela | legado_subdivisoes | coberto | drizzle/0013_legado_catalogo.sql (PK, UNIQUE, defaults) e drizzle/0014_legado_indices.sql |
| admin_full_access_subdivisoes | policy | src/hooks.server.ts e src/lib/server/auth/legacy-scope.ts | coberto | RLS ALL em subdivisoes substituída pela sessão do Worker; isolamento em paridade.workers.test.ts |
| select_subdivisoes | policy | src/hooks.server.ts e src/lib/server/auth/legacy-scope.ts | coberto | RLS SELECT em subdivisoes substituída pela sessão do Worker; isolamento em paridade.workers.test.ts |
| subdivisoes_read | policy | src/hooks.server.ts e src/lib/server/auth/legacy-scope.ts | coberto | RLS SELECT em subdivisoes substituída pela sessão do Worker; isolamento em paridade.workers.test.ts |
| subdivisoes_select | policy | src/hooks.server.ts e src/lib/server/auth/legacy-scope.ts | coberto | RLS SELECT em subdivisoes substituída pela sessão do Worker; isolamento em paridade.workers.test.ts |
| subdivisoes_view | policy | src/hooks.server.ts e src/lib/server/auth/legacy-scope.ts | coberto | RLS SELECT em subdivisoes substituída pela sessão do Worker; isolamento em paridade.workers.test.ts |
| subdivisoes_write | policy | src/hooks.server.ts e src/lib/server/auth/legacy-scope.ts | coberto | RLS ALL em subdivisoes substituída pela sessão do Worker; isolamento em paridade.workers.test.ts |
| trg_normalize_subdivisoes_nome | trigger | src/lib/server/data/legado-rules.ts | migrado | regra do gatilho aplicada na escrita; legado-rules.test.ts |
| system_documentation | tabela | legado_system_documentation | coberto | drizzle/0013_legado_catalogo.sql (PK, UNIQUE, defaults) e drizzle/0014_legado_indices.sql |
| docs_delete | policy | src/hooks.server.ts e src/lib/server/auth/legacy-scope.ts | coberto | RLS DELETE em system_documentation substituída pela sessão do Worker; isolamento em paridade.workers.test.ts |
| docs_insert | policy | src/hooks.server.ts e src/lib/server/auth/legacy-scope.ts | coberto | RLS INSERT em system_documentation substituída pela sessão do Worker; isolamento em paridade.workers.test.ts |
| docs_select | policy | src/hooks.server.ts e src/lib/server/auth/legacy-scope.ts | coberto | RLS SELECT em system_documentation substituída pela sessão do Worker; isolamento em paridade.workers.test.ts |
| docs_update | policy | src/hooks.server.ts e src/lib/server/auth/legacy-scope.ts | coberto | RLS UPDATE em system_documentation substituída pela sessão do Worker; isolamento em paridade.workers.test.ts |
| trg_system_documentation_log | trigger | dump public.sql | coberto | gatilho log_system_documentation_change lido no dump; efeito de apoio sem regra nova além do serviço |
| system_documentation_section_versions | tabela | legado_system_documentation_section_versions | coberto | drizzle/0013_legado_catalogo.sql (PK, UNIQUE, defaults) e drizzle/0014_legado_indices.sql |
| docs_section_versions_insert | policy | src/hooks.server.ts e src/lib/server/auth/legacy-scope.ts | coberto | RLS INSERT em system_documentation_section_versions substituída pela sessão do Worker; isolamento em paridade.workers.test.ts |
| docs_section_versions_select | policy | src/hooks.server.ts e src/lib/server/auth/legacy-scope.ts | coberto | RLS SELECT em system_documentation_section_versions substituída pela sessão do Worker; isolamento em paridade.workers.test.ts |
| system_documentation_sections | tabela | legado_system_documentation_sections | coberto | drizzle/0013_legado_catalogo.sql (PK, UNIQUE, defaults) e drizzle/0014_legado_indices.sql |
| docs_sections_delete | policy | src/hooks.server.ts e src/lib/server/auth/legacy-scope.ts | coberto | RLS DELETE em system_documentation_sections substituída pela sessão do Worker; isolamento em paridade.workers.test.ts |
| docs_sections_insert | policy | src/hooks.server.ts e src/lib/server/auth/legacy-scope.ts | coberto | RLS INSERT em system_documentation_sections substituída pela sessão do Worker; isolamento em paridade.workers.test.ts |
| docs_sections_select | policy | src/hooks.server.ts e src/lib/server/auth/legacy-scope.ts | coberto | RLS SELECT em system_documentation_sections substituída pela sessão do Worker; isolamento em paridade.workers.test.ts |
| docs_sections_update | policy | src/hooks.server.ts e src/lib/server/auth/legacy-scope.ts | coberto | RLS UPDATE em system_documentation_sections substituída pela sessão do Worker; isolamento em paridade.workers.test.ts |
| trg_system_documentation_section_log | trigger | dump public.sql | coberto | gatilho log_system_documentation_section_change lido no dump; efeito de apoio sem regra nova além do serviço |
| system_documentation_versions | tabela | legado_system_documentation_versions | coberto | drizzle/0013_legado_catalogo.sql (PK, UNIQUE, defaults) e drizzle/0014_legado_indices.sql |
| docs_versions_insert | policy | src/hooks.server.ts e src/lib/server/auth/legacy-scope.ts | coberto | RLS INSERT em system_documentation_versions substituída pela sessão do Worker; isolamento em paridade.workers.test.ts |
| docs_versions_select | policy | src/hooks.server.ts e src/lib/server/auth/legacy-scope.ts | coberto | RLS SELECT em system_documentation_versions substituída pela sessão do Worker; isolamento em paridade.workers.test.ts |
| system_module_settings | tabela | legado_system_module_settings | coberto | drizzle/0013_legado_catalogo.sql (PK, UNIQUE, defaults) e drizzle/0014_legado_indices.sql |
| system_module_settings_delete | policy | src/hooks.server.ts e src/lib/server/auth/legacy-scope.ts | coberto | RLS DELETE em system_module_settings substituída pela sessão do Worker; isolamento em paridade.workers.test.ts |
| system_module_settings_insert | policy | src/hooks.server.ts e src/lib/server/auth/legacy-scope.ts | coberto | RLS INSERT em system_module_settings substituída pela sessão do Worker; isolamento em paridade.workers.test.ts |
| system_module_settings_select | policy | src/hooks.server.ts e src/lib/server/auth/legacy-scope.ts | coberto | RLS SELECT em system_module_settings substituída pela sessão do Worker; isolamento em paridade.workers.test.ts |
| system_module_settings_select_authenticated | policy | src/hooks.server.ts e src/lib/server/auth/legacy-scope.ts | coberto | RLS SELECT em system_module_settings substituída pela sessão do Worker; isolamento em paridade.workers.test.ts |
| system_module_settings_update | policy | src/hooks.server.ts e src/lib/server/auth/legacy-scope.ts | coberto | RLS UPDATE em system_module_settings substituída pela sessão do Worker; isolamento em paridade.workers.test.ts |
| system_module_settings_write_admin | policy | src/hooks.server.ts e src/lib/server/auth/legacy-scope.ts | coberto | RLS ALL em system_module_settings substituída pela sessão do Worker; isolamento em paridade.workers.test.ts |
| trg_system_module_settings_updated_at | trigger | src/lib/server/data/query.ts | migrado | updated_at gravado na escrita |
| tipo_pacotes | tabela | legado_tipo_pacotes | coberto | drizzle/0013_legado_catalogo.sql (PK, UNIQUE, defaults) e drizzle/0014_legado_indices.sql |
| tipo_pacotes_admin_all | policy | src/hooks.server.ts e src/lib/server/auth/legacy-scope.ts | coberto | RLS ALL em tipo_pacotes substituída pela sessão do Worker; isolamento em paridade.workers.test.ts |
| trg_normalize_tipo_pacotes_nome | trigger | src/lib/server/data/legado-rules.ts | migrado | regra do gatilho aplicada na escrita; legado-rules.test.ts |
| tipo_produtos | tabela | legado_tipo_produtos | coberto | drizzle/0013_legado_catalogo.sql (PK, UNIQUE, defaults) e drizzle/0014_legado_indices.sql |
| Public read | policy | src/hooks.server.ts e src/lib/server/auth/legacy-scope.ts | coberto | RLS SELECT em tipo_produtos substituída pela sessão do Worker; isolamento em paridade.workers.test.ts |
| admin_full_access_tipo_produtos | policy | src/hooks.server.ts e src/lib/server/auth/legacy-scope.ts | coberto | RLS ALL em tipo_produtos substituída pela sessão do Worker; isolamento em paridade.workers.test.ts |
| produtos_delete | policy | src/hooks.server.ts e src/lib/server/auth/legacy-scope.ts | coberto | RLS DELETE em tipo_produtos substituída pela sessão do Worker; isolamento em paridade.workers.test.ts |
| produtos_insert | policy | src/hooks.server.ts e src/lib/server/auth/legacy-scope.ts | coberto | RLS INSERT em tipo_produtos substituída pela sessão do Worker; isolamento em paridade.workers.test.ts |
| produtos_select | policy | src/hooks.server.ts e src/lib/server/auth/legacy-scope.ts | coberto | RLS SELECT em tipo_produtos substituída pela sessão do Worker; isolamento em paridade.workers.test.ts |
| produtos_update | policy | src/hooks.server.ts e src/lib/server/auth/legacy-scope.ts | coberto | RLS UPDATE em tipo_produtos substituída pela sessão do Worker; isolamento em paridade.workers.test.ts |
| tipo_produtos_admin_select | policy | src/hooks.server.ts e src/lib/server/auth/legacy-scope.ts | coberto | RLS SELECT em tipo_produtos substituída pela sessão do Worker; isolamento em paridade.workers.test.ts |
| tipo_produtos_dashboard_select | policy | src/hooks.server.ts e src/lib/server/auth/legacy-scope.ts | coberto | RLS SELECT em tipo_produtos substituída pela sessão do Worker; isolamento em paridade.workers.test.ts |
| tipo_produtos_read | policy | src/hooks.server.ts e src/lib/server/auth/legacy-scope.ts | coberto | RLS SELECT em tipo_produtos substituída pela sessão do Worker; isolamento em paridade.workers.test.ts |
| tipo_produtos_view | policy | src/hooks.server.ts e src/lib/server/auth/legacy-scope.ts | coberto | RLS SELECT em tipo_produtos substituída pela sessão do Worker; isolamento em paridade.workers.test.ts |
| trg_normalize_tipo_produtos_nome | trigger | src/lib/server/data/legado-rules.ts | migrado | regra do gatilho aplicada na escrita; legado-rules.test.ts |
| trg_produtos_updated | trigger | src/lib/server/data/query.ts | migrado | updated_at gravado na escrita |
| trg_update_produtos_updated_at | trigger | src/lib/server/data/query.ts | migrado | updated_at gravado na escrita |
| todo_categorias | tabela | legado_todo_categorias | coberto | drizzle/0013_legado_catalogo.sql (PK, UNIQUE, defaults) e drizzle/0014_legado_indices.sql |
| todo_categorias_delete | policy | src/hooks.server.ts e src/lib/server/auth/legacy-scope.ts | coberto | RLS DELETE em todo_categorias substituída pela sessão do Worker; isolamento em paridade.workers.test.ts |
| todo_categorias_insert | policy | src/hooks.server.ts e src/lib/server/auth/legacy-scope.ts | coberto | RLS INSERT em todo_categorias substituída pela sessão do Worker; isolamento em paridade.workers.test.ts |
| todo_categorias_select | policy | src/hooks.server.ts e src/lib/server/auth/legacy-scope.ts | coberto | RLS SELECT em todo_categorias substituída pela sessão do Worker; isolamento em paridade.workers.test.ts |
| todo_categorias_update | policy | src/hooks.server.ts e src/lib/server/auth/legacy-scope.ts | coberto | RLS UPDATE em todo_categorias substituída pela sessão do Worker; isolamento em paridade.workers.test.ts |
| trg_normalize_todo_categorias_nome | trigger | src/lib/server/data/legado-rules.ts | migrado | regra do gatilho aplicada na escrita; legado-rules.test.ts |
| trg_todo_categorias_defaults | trigger | dump public.sql | coberto | gatilho todo_categorias_set_defaults lido no dump; efeito de apoio sem regra nova além do serviço |
| trg_todo_categorias_updated_at | trigger | src/lib/server/data/query.ts | migrado | updated_at gravado na escrita |
| user_convites | tabela | legado_user_convites | coberto | drizzle/0013_legado_catalogo.sql (PK, UNIQUE, defaults) e drizzle/0014_legado_indices.sql |
| user_convites_insert | policy | src/hooks.server.ts e src/lib/server/auth/legacy-scope.ts | coberto | RLS INSERT em user_convites substituída pela sessão do Worker; isolamento em paridade.workers.test.ts |
| user_convites_select | policy | src/hooks.server.ts e src/lib/server/auth/legacy-scope.ts | coberto | RLS SELECT em user_convites substituída pela sessão do Worker; isolamento em paridade.workers.test.ts |
| user_convites_update | policy | src/hooks.server.ts e src/lib/server/auth/legacy-scope.ts | coberto | RLS UPDATE em user_convites substituída pela sessão do Worker; isolamento em paridade.workers.test.ts |
| user_crm_assinaturas | tabela | legado_user_crm_assinaturas | coberto | drizzle/0013_legado_catalogo.sql (PK, UNIQUE, defaults) e drizzle/0014_legado_indices.sql |
| crm_assinaturas_own | policy | src/hooks.server.ts e src/lib/server/auth/legacy-scope.ts | coberto | RLS ALL em user_crm_assinaturas substituída pela sessão do Worker; isolamento em paridade.workers.test.ts |
| trg_normalize_user_crm_assinaturas_nome | trigger | src/lib/server/data/legado-rules.ts | migrado | regra do gatilho aplicada na escrita; legado-rules.test.ts |
| user_message_template_themes | tabela | legado_user_message_template_themes | coberto | drizzle/0013_legado_catalogo.sql (PK, UNIQUE, defaults) e drizzle/0014_legado_indices.sql |
| user_message_template_themes_delete | policy | src/hooks.server.ts e src/lib/server/auth/legacy-scope.ts | coberto | RLS DELETE em user_message_template_themes substituída pela sessão do Worker; isolamento em paridade.workers.test.ts |
| user_message_template_themes_insert | policy | src/hooks.server.ts e src/lib/server/auth/legacy-scope.ts | coberto | RLS INSERT em user_message_template_themes substituída pela sessão do Worker; isolamento em paridade.workers.test.ts |
| user_message_template_themes_select | policy | src/hooks.server.ts e src/lib/server/auth/legacy-scope.ts | coberto | RLS SELECT em user_message_template_themes substituída pela sessão do Worker; isolamento em paridade.workers.test.ts |
| user_message_template_themes_update | policy | src/hooks.server.ts e src/lib/server/auth/legacy-scope.ts | coberto | RLS UPDATE em user_message_template_themes substituída pela sessão do Worker; isolamento em paridade.workers.test.ts |
| trg_normalize_user_message_template_themes_nome | trigger | src/lib/server/data/legado-rules.ts | migrado | regra do gatilho aplicada na escrita; legado-rules.test.ts |
| trg_user_message_template_themes_updated_at | trigger | src/lib/server/data/query.ts | migrado | updated_at gravado na escrita |
| user_message_templates | tabela | legado_user_message_templates | coberto | drizzle/0013_legado_catalogo.sql (PK, UNIQUE, defaults) e drizzle/0014_legado_indices.sql |
| user_message_templates_delete | policy | src/hooks.server.ts e src/lib/server/auth/legacy-scope.ts | coberto | RLS DELETE em user_message_templates substituída pela sessão do Worker; isolamento em paridade.workers.test.ts |
| user_message_templates_insert | policy | src/hooks.server.ts e src/lib/server/auth/legacy-scope.ts | coberto | RLS INSERT em user_message_templates substituída pela sessão do Worker; isolamento em paridade.workers.test.ts |
| user_message_templates_select | policy | src/hooks.server.ts e src/lib/server/auth/legacy-scope.ts | coberto | RLS SELECT em user_message_templates substituída pela sessão do Worker; isolamento em paridade.workers.test.ts |
| user_message_templates_update | policy | src/hooks.server.ts e src/lib/server/auth/legacy-scope.ts | coberto | RLS UPDATE em user_message_templates substituída pela sessão do Worker; isolamento em paridade.workers.test.ts |
| trg_normalize_user_message_templates_nome | trigger | src/lib/server/data/legado-rules.ts | migrado | regra do gatilho aplicada na escrita; legado-rules.test.ts |
| trg_user_message_templates_updated_at | trigger | src/lib/server/data/query.ts | migrado | updated_at gravado na escrita |
| user_type_default_perms | tabela | legado_user_type_default_perms | coberto | drizzle/0013_legado_catalogo.sql (PK, UNIQUE, defaults) e drizzle/0014_legado_indices.sql |
| user_type_default_perms_delete | policy | src/hooks.server.ts e src/lib/server/auth/legacy-scope.ts | coberto | RLS DELETE em user_type_default_perms substituída pela sessão do Worker; isolamento em paridade.workers.test.ts |
| user_type_default_perms_insert | policy | src/hooks.server.ts e src/lib/server/auth/legacy-scope.ts | coberto | RLS INSERT em user_type_default_perms substituída pela sessão do Worker; isolamento em paridade.workers.test.ts |
| user_type_default_perms_select | policy | src/hooks.server.ts e src/lib/server/auth/legacy-scope.ts | coberto | RLS SELECT em user_type_default_perms substituída pela sessão do Worker; isolamento em paridade.workers.test.ts |
| user_type_default_perms_update | policy | src/hooks.server.ts e src/lib/server/auth/legacy-scope.ts | coberto | RLS UPDATE em user_type_default_perms substituída pela sessão do Worker; isolamento em paridade.workers.test.ts |
| trg_user_type_default_perms_updated_at | trigger | src/lib/server/data/query.ts | migrado | updated_at gravado na escrita |
| user_types | tabela | legado_user_types | coberto | drizzle/0013_legado_catalogo.sql (PK, UNIQUE, defaults) e drizzle/0014_legado_indices.sql |
| admin_full_access_user_types | policy | src/hooks.server.ts e src/lib/server/auth/legacy-scope.ts | coberto | RLS ALL em user_types substituída pela sessão do Worker; isolamento em paridade.workers.test.ts |
| user_types_delete | policy | src/hooks.server.ts e src/lib/server/auth/legacy-scope.ts | coberto | RLS DELETE em user_types substituída pela sessão do Worker; isolamento em paridade.workers.test.ts |
| user_types_insert | policy | src/hooks.server.ts e src/lib/server/auth/legacy-scope.ts | coberto | RLS INSERT em user_types substituída pela sessão do Worker; isolamento em paridade.workers.test.ts |
| user_types_read | policy | src/hooks.server.ts e src/lib/server/auth/legacy-scope.ts | coberto | RLS SELECT em user_types substituída pela sessão do Worker; isolamento em paridade.workers.test.ts |
| user_types_select | policy | src/hooks.server.ts e src/lib/server/auth/legacy-scope.ts | coberto | RLS SELECT em user_types substituída pela sessão do Worker; isolamento em paridade.workers.test.ts |
| user_types_update | policy | src/hooks.server.ts e src/lib/server/auth/legacy-scope.ts | coberto | RLS UPDATE em user_types substituída pela sessão do Worker; isolamento em paridade.workers.test.ts |
| user_types_view | policy | src/hooks.server.ts e src/lib/server/auth/legacy-scope.ts | coberto | RLS SELECT em user_types substituída pela sessão do Worker; isolamento em paridade.workers.test.ts |
| users | tabela | legado_users | coberto | drizzle/0013_legado_catalogo.sql (PK, UNIQUE, defaults) e drizzle/0014_legado_indices.sql |
| Users can select own row | policy | src/hooks.server.ts e src/lib/server/auth/legacy-scope.ts | coberto | RLS SELECT em users substituída pela sessão do Worker; isolamento em paridade.workers.test.ts |
| Usuários podem atualizar seu próprio perfil | policy | src/hooks.server.ts e src/lib/server/auth/legacy-scope.ts | coberto | RLS UPDATE em users substituída pela sessão do Worker; isolamento em paridade.workers.test.ts |
| Usuários podem ver seu próprio perfil | policy | src/hooks.server.ts e src/lib/server/auth/legacy-scope.ts | coberto | RLS SELECT em users substituída pela sessão do Worker; isolamento em paridade.workers.test.ts |
| admin_full_access_users | policy | src/hooks.server.ts e src/lib/server/auth/legacy-scope.ts | coberto | RLS ALL em users substituída pela sessão do Worker; isolamento em paridade.workers.test.ts |
| anon update own user row | policy | src/hooks.server.ts e src/lib/server/auth/legacy-scope.ts | coberto | RLS UPDATE em users substituída pela sessão do Worker; isolamento em paridade.workers.test.ts |
| users_delete_admin | policy | src/hooks.server.ts e src/lib/server/auth/legacy-scope.ts | coberto | RLS DELETE em users substituída pela sessão do Worker; isolamento em paridade.workers.test.ts |
| users_insert_self | policy | src/hooks.server.ts e src/lib/server/auth/legacy-scope.ts | coberto | RLS INSERT em users substituída pela sessão do Worker; isolamento em paridade.workers.test.ts |
| users_insert_self_or_admin | policy | src/hooks.server.ts e src/lib/server/auth/legacy-scope.ts | coberto | RLS INSERT em users substituída pela sessão do Worker; isolamento em paridade.workers.test.ts |
| users_insert_service_only | policy | src/hooks.server.ts e src/lib/server/auth/legacy-scope.ts | coberto | RLS INSERT em users substituída pela sessão do Worker; isolamento em paridade.workers.test.ts |
| users_select_admin | policy | src/hooks.server.ts e src/lib/server/auth/legacy-scope.ts | coberto | RLS SELECT em users substituída pela sessão do Worker; isolamento em paridade.workers.test.ts |
| users_select_self | policy | src/hooks.server.ts e src/lib/server/auth/legacy-scope.ts | coberto | RLS SELECT em users substituída pela sessão do Worker; isolamento em paridade.workers.test.ts |
| users_select_self_or_admin | policy | src/hooks.server.ts e src/lib/server/auth/legacy-scope.ts | coberto | RLS SELECT em users substituída pela sessão do Worker; isolamento em paridade.workers.test.ts |
| users_update_admin | policy | src/hooks.server.ts e src/lib/server/auth/legacy-scope.ts | coberto | RLS UPDATE em users substituída pela sessão do Worker; isolamento em paridade.workers.test.ts |
| users_update_same_company | policy | src/hooks.server.ts e src/lib/server/auth/legacy-scope.ts | coberto | RLS UPDATE em users substituída pela sessão do Worker; isolamento em paridade.workers.test.ts |
| users_update_same_company_direct | policy | src/hooks.server.ts e src/lib/server/auth/legacy-scope.ts | coberto | RLS UPDATE em users substituída pela sessão do Worker; isolamento em paridade.workers.test.ts |
| users_update_self | policy | src/hooks.server.ts e src/lib/server/auth/legacy-scope.ts | coberto | RLS UPDATE em users substituída pela sessão do Worker; isolamento em paridade.workers.test.ts |
| users_update_self_or_admin | policy | src/hooks.server.ts e src/lib/server/auth/legacy-scope.ts | coberto | RLS UPDATE em users substituída pela sessão do Worker; isolamento em paridade.workers.test.ts |
| trg_default_perms_user_type | trigger | src/lib/server/auth/legacy-scope.ts; src/hooks.server.ts | coberto | helper de RLS/auth; o Worker não expõe SQL ao browser |
| trg_normalize_users_nome_completo | trigger | src/lib/server/data/legado-rules.ts | migrado | regra do gatilho aplicada na escrita; legado-rules.test.ts |
| trg_sync_user_convites_status | trigger | dump public.sql | coberto | gatilho sync_user_convites_status lido no dump; efeito de apoio sem regra nova além do serviço |
| trg_users_modulo_default | trigger | dump public.sql | coberto | gatilho trg_apply_modulo_defaults lido no dump; efeito de apoio sem regra nova além do serviço |
| update_users_updated_at | trigger | src/lib/server/data/query.ts | migrado | updated_at gravado na escrita |
| v_gestor_vendedor_details | view | legado_v_gestor_vendedor_details | coberto | viraram tabelas de compatibilidade na 0013; o app lê as tabelas base |
| v_users_complete | view | legado_v_users_complete | coberto | viraram tabelas de compatibilidade na 0013; o app lê as tabelas base |
| vendas | tabela | legado_vendas | coberto | drizzle/0013_legado_catalogo.sql (PK, UNIQUE, defaults) e drizzle/0014_legado_indices.sql |
| admin_full_access_vendas | policy | src/hooks.server.ts e src/lib/server/auth/legacy-scope.ts | coberto | RLS ALL em vendas substituída pela sessão do Worker; isolamento em paridade.workers.test.ts |
| vendas_admin_select | policy | src/hooks.server.ts e src/lib/server/auth/legacy-scope.ts | coberto | RLS SELECT em vendas substituída pela sessão do Worker; isolamento em paridade.workers.test.ts |
| vendas_create | policy | src/hooks.server.ts e src/lib/server/auth/legacy-scope.ts | coberto | RLS INSERT em vendas substituída pela sessão do Worker; isolamento em paridade.workers.test.ts |
| vendas_dashboard_select | policy | src/hooks.server.ts e src/lib/server/auth/legacy-scope.ts | coberto | RLS SELECT em vendas substituída pela sessão do Worker; isolamento em paridade.workers.test.ts |
| vendas_delete | policy | src/hooks.server.ts e src/lib/server/auth/legacy-scope.ts | coberto | RLS DELETE em vendas substituída pela sessão do Worker; isolamento em paridade.workers.test.ts |
| vendas_edit | policy | src/hooks.server.ts e src/lib/server/auth/legacy-scope.ts | coberto | RLS UPDATE em vendas substituída pela sessão do Worker; isolamento em paridade.workers.test.ts |
| vendas_insert | policy | src/hooks.server.ts e src/lib/server/auth/legacy-scope.ts | coberto | RLS INSERT em vendas substituída pela sessão do Worker; isolamento em paridade.workers.test.ts |
| vendas_select | policy | src/hooks.server.ts e src/lib/server/auth/legacy-scope.ts | coberto | RLS SELECT em vendas substituída pela sessão do Worker; isolamento em paridade.workers.test.ts |
| vendas_update | policy | src/hooks.server.ts e src/lib/server/auth/legacy-scope.ts | coberto | RLS UPDATE em vendas substituída pela sessão do Worker; isolamento em paridade.workers.test.ts |
| vendas_view | policy | src/hooks.server.ts e src/lib/server/auth/legacy-scope.ts | coberto | RLS SELECT em vendas substituída pela sessão do Worker; isolamento em paridade.workers.test.ts |
| vendas_write | policy | src/hooks.server.ts e src/lib/server/auth/legacy-scope.ts | coberto | RLS ALL em vendas substituída pela sessão do Worker; isolamento em paridade.workers.test.ts |
| trg_rm_v4_vendas_aiu | trigger | dump public.sql | coberto | gatilho trg_rm_v4_vendas lido no dump; efeito de apoio sem regra nova além do serviço |
| trg_rm_v4_vendas_bd | trigger | dump public.sql | coberto | gatilho trg_rm_v4_vendas lido no dump; efeito de apoio sem regra nova além do serviço |
| trg_vendas_link_cliente_company | trigger | dump public.sql | coberto | gatilho trg_vendas_link_cliente_company lido no dump; efeito de apoio sem regra nova além do serviço |
| trg_vendas_updated | trigger | src/lib/server/data/query.ts | migrado | updated_at gravado na escrita |
| vendas_pagamentos | tabela | legado_vendas_pagamentos | coberto | drizzle/0013_legado_catalogo.sql (PK, UNIQUE, defaults) e drizzle/0014_legado_indices.sql |
| vendas_pagamentos_select | policy | src/hooks.server.ts e src/lib/server/auth/legacy-scope.ts | coberto | RLS SELECT em vendas_pagamentos substituída pela sessão do Worker; isolamento em paridade.workers.test.ts |
| vendas_pagamentos_write | policy | src/hooks.server.ts e src/lib/server/auth/legacy-scope.ts | coberto | RLS ALL em vendas_pagamentos substituída pela sessão do Worker; isolamento em paridade.workers.test.ts |
| trg_normalize_vendas_pagamentos_forma_nome | trigger | src/lib/server/data/legado-rules.ts | migrado | regra do gatilho aplicada na escrita; legado-rules.test.ts |
| vendas_recibos | tabela | legado_vendas_recibos | coberto | drizzle/0013_legado_catalogo.sql (PK, UNIQUE, defaults) e drizzle/0014_legado_indices.sql |
| admin_full_access_vendas_recibos | policy | src/hooks.server.ts e src/lib/server/auth/legacy-scope.ts | coberto | RLS ALL em vendas_recibos substituída pela sessão do Worker; isolamento em paridade.workers.test.ts |
| vendas_recibos_insert | policy | src/hooks.server.ts e src/lib/server/auth/legacy-scope.ts | coberto | RLS INSERT em vendas_recibos substituída pela sessão do Worker; isolamento em paridade.workers.test.ts |
| vendas_recibos_select | policy | src/hooks.server.ts e src/lib/server/auth/legacy-scope.ts | coberto | RLS SELECT em vendas_recibos substituída pela sessão do Worker; isolamento em paridade.workers.test.ts |
| vendas_recibos_write | policy | src/hooks.server.ts e src/lib/server/auth/legacy-scope.ts | coberto | RLS ALL em vendas_recibos substituída pela sessão do Worker; isolamento em paridade.workers.test.ts |
| trg_rm_v4_vendas_recibos | trigger | dump public.sql | coberto | gatilho trg_rm_v4_vendas_recibos lido no dump; efeito de apoio sem regra nova além do serviço |
| trg_vendas_recibos_normalize_numero | trigger | src/lib/server/data/legado-rules.ts | migrado | regra do gatilho aplicada na escrita; legado-rules.test.ts |
| trg_vendas_recibos_set_data_venda_default | trigger | src/lib/server/data/legado-rules.ts | migrado | regra do gatilho aplicada na escrita; legado-rules.test.ts |
| trg_vendas_recibos_updated | trigger | src/lib/server/data/query.ts | migrado | updated_at gravado na escrita |
| vendas_recibos_guard_seguro | trigger | src/lib/server/data/legado-rules.ts | migrado | regra do gatilho aplicada na escrita; legado-rules.test.ts |
| vendas_recibos_complementares | tabela | legado_vendas_recibos_complementares | coberto | drizzle/0013_legado_catalogo.sql (PK, UNIQUE, defaults) e drizzle/0014_legado_indices.sql |
| vendas_recibos_complementares_select | policy | src/hooks.server.ts e src/lib/server/auth/legacy-scope.ts | coberto | RLS SELECT em vendas_recibos_complementares substituída pela sessão do Worker; isolamento em paridade.workers.test.ts |
| vendas_recibos_complementares_write | policy | src/hooks.server.ts e src/lib/server/auth/legacy-scope.ts | coberto | RLS ALL em vendas_recibos_complementares substituída pela sessão do Worker; isolamento em paridade.workers.test.ts |
| trg_rm_v4_vendas_recibos_complementares | trigger | dump public.sql | coberto | gatilho trg_rm_v4_vendas_recibos_complementares lido no dump; efeito de apoio sem regra nova além do serviço |
| vendas_recibos_notas | tabela | legado_vendas_recibos_notas | coberto | drizzle/0013_legado_catalogo.sql (PK, UNIQUE, defaults) e drizzle/0014_legado_indices.sql |
| vendas_recibos_notas_select | policy | src/hooks.server.ts e src/lib/server/auth/legacy-scope.ts | coberto | RLS SELECT em vendas_recibos_notas substituída pela sessão do Worker; isolamento em paridade.workers.test.ts |
| vendas_recibos_notas_write | policy | src/hooks.server.ts e src/lib/server/auth/legacy-scope.ts | coberto | RLS ALL em vendas_recibos_notas substituída pela sessão do Worker; isolamento em paridade.workers.test.ts |
| vendas_recibos_rateio | tabela | legado_vendas_recibos_rateio | coberto | drizzle/0013_legado_catalogo.sql (PK, UNIQUE, defaults) e drizzle/0014_legado_indices.sql |
| vendas_recibos_rateio_delete_company | policy | src/hooks.server.ts e src/lib/server/auth/legacy-scope.ts | coberto | RLS DELETE em vendas_recibos_rateio substituída pela sessão do Worker; isolamento em paridade.workers.test.ts |
| vendas_recibos_rateio_insert_company | policy | src/hooks.server.ts e src/lib/server/auth/legacy-scope.ts | coberto | RLS INSERT em vendas_recibos_rateio substituída pela sessão do Worker; isolamento em paridade.workers.test.ts |
| vendas_recibos_rateio_select_company | policy | src/hooks.server.ts e src/lib/server/auth/legacy-scope.ts | coberto | RLS SELECT em vendas_recibos_rateio substituída pela sessão do Worker; isolamento em paridade.workers.test.ts |
| vendas_recibos_rateio_update_company | policy | src/hooks.server.ts e src/lib/server/auth/legacy-scope.ts | coberto | RLS UPDATE em vendas_recibos_rateio substituída pela sessão do Worker; isolamento em paridade.workers.test.ts |
| trg_rm_v4_vendas_recibos_rateio | trigger | dump public.sql | coberto | gatilho trg_rm_v4_vendas_recibos_rateio lido no dump; efeito de apoio sem regra nova além do serviço |
| trg_touch_vendas_recibos_rateio_updated_at | trigger | src/lib/server/data/query.ts | migrado | updated_at gravado na escrita |
| viagem_acompanhantes | tabela | legado_viagem_acompanhantes | coberto | drizzle/0013_legado_catalogo.sql (PK, UNIQUE, defaults) e drizzle/0014_legado_indices.sql |
| admin_full_access_viagem_acompanhantes | policy | src/hooks.server.ts e src/lib/server/auth/legacy-scope.ts | coberto | RLS ALL em viagem_acompanhantes substituída pela sessão do Worker; isolamento em paridade.workers.test.ts |
| viagem_acompanhantes_select | policy | src/hooks.server.ts e src/lib/server/auth/legacy-scope.ts | coberto | RLS SELECT em viagem_acompanhantes substituída pela sessão do Worker; isolamento em paridade.workers.test.ts |
| viagem_acompanhantes_write | policy | src/hooks.server.ts e src/lib/server/auth/legacy-scope.ts | coberto | RLS ALL em viagem_acompanhantes substituída pela sessão do Worker; isolamento em paridade.workers.test.ts |
| viagem_documentos | tabela | legado_viagem_documentos | coberto | drizzle/0013_legado_catalogo.sql (PK, UNIQUE, defaults) e drizzle/0014_legado_indices.sql |
| admin_full_access_viagem_documentos | policy | src/hooks.server.ts e src/lib/server/auth/legacy-scope.ts | coberto | RLS ALL em viagem_documentos substituída pela sessão do Worker; isolamento em paridade.workers.test.ts |
| viagem_documentos_select | policy | src/hooks.server.ts e src/lib/server/auth/legacy-scope.ts | coberto | RLS SELECT em viagem_documentos substituída pela sessão do Worker; isolamento em paridade.workers.test.ts |
| viagem_documentos_write | policy | src/hooks.server.ts e src/lib/server/auth/legacy-scope.ts | coberto | RLS ALL em viagem_documentos substituída pela sessão do Worker; isolamento em paridade.workers.test.ts |
| viagem_passageiros | tabela | legado_viagem_passageiros | coberto | drizzle/0013_legado_catalogo.sql (PK, UNIQUE, defaults) e drizzle/0014_legado_indices.sql |
| admin_full_access_viagem_passageiros | policy | src/hooks.server.ts e src/lib/server/auth/legacy-scope.ts | coberto | RLS ALL em viagem_passageiros substituída pela sessão do Worker; isolamento em paridade.workers.test.ts |
| viagem_passageiros_select | policy | src/hooks.server.ts e src/lib/server/auth/legacy-scope.ts | coberto | RLS SELECT em viagem_passageiros substituída pela sessão do Worker; isolamento em paridade.workers.test.ts |
| viagem_passageiros_write | policy | src/hooks.server.ts e src/lib/server/auth/legacy-scope.ts | coberto | RLS ALL em viagem_passageiros substituída pela sessão do Worker; isolamento em paridade.workers.test.ts |
| viagem_servicos | tabela | legado_viagem_servicos | coberto | drizzle/0013_legado_catalogo.sql (PK, UNIQUE, defaults) e drizzle/0014_legado_indices.sql |
| admin_full_access_viagem_servicos | policy | src/hooks.server.ts e src/lib/server/auth/legacy-scope.ts | coberto | RLS ALL em viagem_servicos substituída pela sessão do Worker; isolamento em paridade.workers.test.ts |
| viagem_servicos_select | policy | src/hooks.server.ts e src/lib/server/auth/legacy-scope.ts | coberto | RLS SELECT em viagem_servicos substituída pela sessão do Worker; isolamento em paridade.workers.test.ts |
| viagem_servicos_write | policy | src/hooks.server.ts e src/lib/server/auth/legacy-scope.ts | coberto | RLS ALL em viagem_servicos substituída pela sessão do Worker; isolamento em paridade.workers.test.ts |
| viagens | tabela | legado_viagens | coberto | drizzle/0013_legado_catalogo.sql (PK, UNIQUE, defaults) e drizzle/0014_legado_indices.sql |
| admin_full_access_viagens | policy | src/hooks.server.ts e src/lib/server/auth/legacy-scope.ts | coberto | RLS ALL em viagens substituída pela sessão do Worker; isolamento em paridade.workers.test.ts |
| viagens_select | policy | src/hooks.server.ts e src/lib/server/auth/legacy-scope.ts | coberto | RLS SELECT em viagens substituída pela sessão do Worker; isolamento em paridade.workers.test.ts |
| viagens_write | policy | src/hooks.server.ts e src/lib/server/auth/legacy-scope.ts | coberto | RLS ALL em viagens substituída pela sessão do Worker; isolamento em paridade.workers.test.ts |
| trg_viagens_link_cliente_company | trigger | dump public.sql | coberto | gatilho trg_viagens_link_cliente_company lido no dump; efeito de apoio sem regra nova além do serviço |
| voucher_assets | tabela | legado_voucher_assets | coberto | drizzle/0013_legado_catalogo.sql (PK, UNIQUE, defaults) e drizzle/0014_legado_indices.sql |
| voucher_assets_delete | policy | src/hooks.server.ts e src/lib/server/auth/legacy-scope.ts | coberto | RLS DELETE em voucher_assets substituída pela sessão do Worker; isolamento em paridade.workers.test.ts |
| voucher_assets_insert | policy | src/hooks.server.ts e src/lib/server/auth/legacy-scope.ts | coberto | RLS INSERT em voucher_assets substituída pela sessão do Worker; isolamento em paridade.workers.test.ts |
| voucher_assets_select | policy | src/hooks.server.ts e src/lib/server/auth/legacy-scope.ts | coberto | RLS SELECT em voucher_assets substituída pela sessão do Worker; isolamento em paridade.workers.test.ts |
| voucher_assets_update | policy | src/hooks.server.ts e src/lib/server/auth/legacy-scope.ts | coberto | RLS UPDATE em voucher_assets substituída pela sessão do Worker; isolamento em paridade.workers.test.ts |
| voucher_dias | tabela | legado_voucher_dias | coberto | drizzle/0013_legado_catalogo.sql (PK, UNIQUE, defaults) e drizzle/0014_legado_indices.sql |
| voucher_dias_delete | policy | src/hooks.server.ts e src/lib/server/auth/legacy-scope.ts | coberto | RLS DELETE em voucher_dias substituída pela sessão do Worker; isolamento em paridade.workers.test.ts |
| voucher_dias_insert | policy | src/hooks.server.ts e src/lib/server/auth/legacy-scope.ts | coberto | RLS INSERT em voucher_dias substituída pela sessão do Worker; isolamento em paridade.workers.test.ts |
| voucher_dias_select | policy | src/hooks.server.ts e src/lib/server/auth/legacy-scope.ts | coberto | RLS SELECT em voucher_dias substituída pela sessão do Worker; isolamento em paridade.workers.test.ts |
| voucher_dias_update | policy | src/hooks.server.ts e src/lib/server/auth/legacy-scope.ts | coberto | RLS UPDATE em voucher_dias substituída pela sessão do Worker; isolamento em paridade.workers.test.ts |
| voucher_hoteis | tabela | legado_voucher_hoteis | coberto | drizzle/0013_legado_catalogo.sql (PK, UNIQUE, defaults) e drizzle/0014_legado_indices.sql |
| voucher_hoteis_delete | policy | src/hooks.server.ts e src/lib/server/auth/legacy-scope.ts | coberto | RLS DELETE em voucher_hoteis substituída pela sessão do Worker; isolamento em paridade.workers.test.ts |
| voucher_hoteis_insert | policy | src/hooks.server.ts e src/lib/server/auth/legacy-scope.ts | coberto | RLS INSERT em voucher_hoteis substituída pela sessão do Worker; isolamento em paridade.workers.test.ts |
| voucher_hoteis_select | policy | src/hooks.server.ts e src/lib/server/auth/legacy-scope.ts | coberto | RLS SELECT em voucher_hoteis substituída pela sessão do Worker; isolamento em paridade.workers.test.ts |
| voucher_hoteis_update | policy | src/hooks.server.ts e src/lib/server/auth/legacy-scope.ts | coberto | RLS UPDATE em voucher_hoteis substituída pela sessão do Worker; isolamento em paridade.workers.test.ts |
| vouchers | tabela | legado_vouchers | coberto | drizzle/0013_legado_catalogo.sql (PK, UNIQUE, defaults) e drizzle/0014_legado_indices.sql |
| vouchers_delete | policy | src/hooks.server.ts e src/lib/server/auth/legacy-scope.ts | coberto | RLS DELETE em vouchers substituída pela sessão do Worker; isolamento em paridade.workers.test.ts |
| vouchers_insert | policy | src/hooks.server.ts e src/lib/server/auth/legacy-scope.ts | coberto | RLS INSERT em vouchers substituída pela sessão do Worker; isolamento em paridade.workers.test.ts |
| vouchers_select | policy | src/hooks.server.ts e src/lib/server/auth/legacy-scope.ts | coberto | RLS SELECT em vouchers substituída pela sessão do Worker; isolamento em paridade.workers.test.ts |
| vouchers_update | policy | src/hooks.server.ts e src/lib/server/auth/legacy-scope.ts | coberto | RLS UPDATE em vouchers substituída pela sessão do Worker; isolamento em paridade.workers.test.ts |
| trg_normalize_vouchers_nome | trigger | src/lib/server/data/legado-rules.ts | migrado | regra do gatilho aplicada na escrita; legado-rules.test.ts |
| vw_cidades_localizacao | view | legado_vw_cidades_localizacao | coberto | viraram tabelas de compatibilidade na 0013; o app lê as tabelas base |
| vw_cidades_localizacao_busca | view | legado_vw_cidades_localizacao_busca | coberto | viraram tabelas de compatibilidade na 0013; o app lê as tabelas base |
| vw_produtos_comissionamento | view | legado_vw_produtos_comissionamento | coberto | viraram tabelas de compatibilidade na 0013; o app lê as tabelas base |
| vw_soma_meta_placeholder | view | legado_vw_soma_meta_placeholder | coberto | viraram tabelas de compatibilidade na 0013; o app lê as tabelas base |
| accessible_client_ids | rpc | src/lib/server/data/rpc.ts | coberto | rotina com consumidor reimplementada |
| aceitar_quote | rpc | dump public.sql | excluído | funções do modelo sale/quote em inglês ou de cotação sem tabela ativa no fluxo |
| adicionar_hotel_ao_quote | rpc | dump public.sql | excluído | funções do modelo sale/quote em inglês ou de cotação sem tabela ativa no fluxo |
| adicionar_quote_item | rpc | dump public.sql | excluído | funções do modelo sale/quote em inglês ou de cotação sem tabela ativa no fluxo |
| adicionar_servico_ao_quote | rpc | dump public.sql | excluído | funções do modelo sale/quote em inglês ou de cotação sem tabela ativa no fluxo |
| adicionar_servico_fornecedor_ao_quote | rpc | dump public.sql | excluído | funções do modelo sale/quote em inglês ou de cotação sem tabela ativa no fluxo |
| admin_system_settings_set_updated_at | rpc | src/lib/server/data/query.ts | migrado | updated_at gravado na escrita |
| agenda_itens_set_defaults | rpc | dump public.sql | excluído | código morto: sem trigger, sem chamada em src/ e sem papel de RLS |
| agenda_itens_set_updated_at | rpc | src/lib/server/data/query.ts | migrado | updated_at gravado na escrita |
| aplicar_precificacao_quote_item | rpc | dump public.sql | excluído | funções do modelo sale/quote em inglês ou de cotação sem tabela ativa no fluxo |
| apply_cidades_import_cleanup | rpc | dump public.sql | excluído | seed, auditoria interna do Supabase ou helper sem consumidor |
| aprovar_comissao | rpc | dump public.sql | excluído | funções do modelo sale/quote em inglês ou de cotação sem tabela ativa no fluxo |
| assumir_inquiry | rpc | dump public.sql | excluído | funções do modelo sale/quote em inglês ou de cotação sem tabela ativa no fluxo |
| atualizar_comissao_por_pagamento | rpc | dump public.sql | excluído | funções do modelo sale/quote em inglês ou de cotação sem tabela ativa no fluxo |
| buscar_cidades | rpc | dump public.sql | excluído | código morto: sem trigger, sem chamada em src/ e sem papel de RLS |
| buscar_pricing_rule | rpc | dump public.sql | excluído | funções do modelo sale/quote em inglês ou de cotação sem tabela ativa no fluxo |
| calcular_noites | rpc | dump public.sql | excluído | seed, auditoria interna do Supabase ou helper sem consumidor |
| calcular_penalidade_hotel | rpc | dump public.sql | excluído | funções do modelo sale/quote em inglês ou de cotação sem tabela ativa no fluxo |
| calcular_tarifa_hotel | rpc | dump public.sql | excluído | funções do modelo sale/quote em inglês ou de cotação sem tabela ativa no fluxo |
| calcular_tarifa_hotel_completa | rpc | dump public.sql | excluído | funções do modelo sale/quote em inglês ou de cotação sem tabela ativa no fluxo |
| can_access_cliente_by_vendedor_scope | rpc | src/lib/server/data/rpc.ts | coberto | rotina com consumidor reimplementada |
| can_user_select_meta | rpc | src/lib/server/auth/legacy-scope.ts; src/hooks.server.ts | coberto | helper de RLS/auth; o Worker não expõe SQL ao browser |
| can_user_update_meta | rpc | src/lib/server/auth/legacy-scope.ts; src/hooks.server.ts | coberto | helper de RLS/auth; o Worker não expõe SQL ao browser |
| cancelar_venda | rpc | ocorrência em src/ no cálculo em TypeScript | coberto | o dump confirma o corpo; o app já cobre o efeito |
| cancelar_venda | rpc | ocorrência em src/ no cálculo em TypeScript | coberto | o dump confirma o corpo; o app já cobre o efeito |
| check_metas_vendedor_tipo | rpc | src/lib/server/data/legado-rules.ts | migrado | regra do gatilho aplicada na escrita; legado-rules.test.ts |
| check_security_rate_limit | rpc | ocorrência em src/ no cálculo em TypeScript | coberto | o dump confirma o corpo; o app já cobre o efeito |
| clientes_link_by_cpf | rpc | src/lib/server/data/legado-rules.ts | migrado | regra do gatilho aplicada na escrita; legado-rules.test.ts |
| clientes_normalize_cpf_trigger | rpc | src/lib/server/data/legado-rules.ts | migrado | regra do gatilho aplicada na escrita; legado-rules.test.ts |
| clientes_normalize_created_by_on_company_link | rpc | src/lib/server/data/legado-rules.ts | migrado | regra do gatilho aplicada na escrita; legado-rules.test.ts |
| clientes_resolve_import | rpc | dump public.sql | excluído | código morto: sem trigger, sem chamada em src/ e sem papel de RLS |
| clientes_set_created_by_trigger | rpc | dump public.sql | excluído | código morto: sem trigger, sem chamada em src/ e sem papel de RLS |
| company_cliente_ids | rpc | src/lib/server/data/rpc.ts | coberto | rotina com consumidor reimplementada |
| conciliacao_recibos_set_updated_at | rpc | docs/adr/ADR-009-modulos-adiados.md | excluído | conciliação ou importação fora do produto |
| conciliacao_recibos_sync_legacy_columns | rpc | docs/adr/ADR-009-modulos-adiados.md | excluído | conciliação ou importação fora do produto |
| criar_quote_from_inquiry | rpc | dump public.sql | excluído | funções do modelo sale/quote em inglês ou de cotação sem tabela ativa no fluxo |
| criar_venda_from_quote | rpc | dump public.sql | excluído | funções do modelo sale/quote em inglês ou de cotação sem tabela ativa no fluxo |
| current_company_id | rpc | src/lib/server/auth/legacy-scope.ts; src/hooks.server.ts | coberto | helper de RLS/auth; o Worker não expõe SQL ao browser |
| current_created_by_gestor | rpc | src/lib/server/auth/legacy-scope.ts; src/hooks.server.ts | coberto | helper de RLS/auth; o Worker não expõe SQL ao browser |
| current_user_type_id | rpc | src/lib/server/auth/legacy-scope.ts; src/hooks.server.ts | coberto | helper de RLS/auth; o Worker não expõe SQL ao browser |
| current_uso_individual | rpc | src/lib/server/auth/legacy-scope.ts; src/hooks.server.ts | coberto | helper de RLS/auth; o Worker não expõe SQL ao browser |
| dashboard_compras_resumo_from_read_model | rpc | src/lib/server/reciboContribuicoesReadModel.ts | coberto | sem a função SQL o cálculo ao vivo é o resultado |
| dashboard_empresa_comparativo_from_read_model | rpc | src/lib/server/reciboContribuicoesReadModel.ts | coberto | sem a função SQL o cálculo ao vivo é o resultado |
| dashboard_metas_summary | rpc | ocorrência em src/ no cálculo em TypeScript | coberto | o dump confirma o corpo; o app já cobre o efeito |
| dashboard_vendas_summary_from_read_model | rpc | src/lib/server/reciboContribuicoesReadModel.ts | coberto | sem a função SQL o cálculo ao vivo é o resultado |
| ensure_cliente_company_link | rpc | dump public.sql | excluído | código morto: sem trigger, sem chamada em src/ e sem papel de RLS |
| ensure_companies_cnpj_digits | rpc | src/lib/server/data/legado-rules.ts | migrado | regra do gatilho aplicada na escrita; legado-rules.test.ts |
| ensure_company_billing | rpc | src/lib/server/data/legado-rules.ts | migrado | regra do gatilho aplicada na escrita; legado-rules.test.ts |
| ensure_default_perms_user_type | rpc | src/lib/server/auth/legacy-scope.ts; src/hooks.server.ts | coberto | helper de RLS/auth; o Worker não expõe SQL ao browser |
| ensure_default_perms_vendedor | rpc | dump public.sql | excluído | código morto: sem trigger, sem chamada em src/ e sem papel de RLS |
| ensure_user_profile | rpc | src/lib/server/auth/legacy-scope.ts; src/hooks.server.ts | coberto | helper de RLS/auth; o Worker não expõe SQL ao browser |
| expirar_quotes_vencidos | rpc | dump public.sql | excluído | funções do modelo sale/quote em inglês ou de cotação sem tabela ativa no fluxo |
| fn_calcular_comissao | rpc | dump public.sql | excluído | funções do modelo sale/quote em inglês ou de cotação sem tabela ativa no fluxo |
| fn_mark_ranking_read_model_dirty | rpc | src/lib/server/reciboContribuicoesReadModel.ts | coberto | sem a função SQL o cálculo ao vivo é o resultado |
| fn_percentual_produto | rpc | dump public.sql | excluído | código morto: sem trigger, sem chamada em src/ e sem papel de RLS |
| fn_rm_v4_mark_dirty | rpc | src/lib/server/reciboContribuicoesReadModel.ts | coberto | sem a função SQL o cálculo ao vivo é o resultado |
| fn_rm_v4_mark_recibo | rpc | src/lib/server/reciboContribuicoesReadModel.ts | coberto | sem a função SQL o cálculo ao vivo é o resultado |
| fn_rm_v4_mark_venda | rpc | src/lib/server/reciboContribuicoesReadModel.ts | coberto | sem a função SQL o cálculo ao vivo é o resultado |
| fn_texto_parece_seguro | rpc | dump public.sql | excluído | código morto: sem trigger, sem chamada em src/ e sem papel de RLS |
| fn_tipo_por_nome_produto | rpc | dump public.sql | excluído | código morto: sem trigger, sem chamada em src/ e sem papel de RLS |
| fn_tipo_produto_id | rpc | dump public.sql | excluído | código morto: sem trigger, sem chamada em src/ e sem papel de RLS |
| fn_user_permissoes | rpc | src/lib/server/auth/legacy-scope.ts; src/hooks.server.ts | coberto | helper de RLS/auth; o Worker não expõe SQL ao browser |
| fn_vendas_recibos_normalize_numero | rpc | src/lib/server/data/legado-rules.ts | migrado | regra do gatilho aplicada na escrita; legado-rules.test.ts |
| gerar_comissoes_da_venda | rpc | dump public.sql | excluído | funções do modelo sale/quote em inglês ou de cotação sem tabela ativa no fluxo |
| gerar_venda_from_quote | rpc | dump public.sql | excluído | funções do modelo sale/quote em inglês ou de cotação sem tabela ativa no fluxo |
| gestor_can_assign_company_sale | rpc | src/lib/server/auth/legacy-scope.ts; src/hooks.server.ts | coberto | helper de RLS/auth; o Worker não expõe SQL ao browser |
| gestor_equipe_base_id | rpc | src/lib/server/auth/legacy-scope.ts; src/hooks.server.ts | coberto | helper de RLS/auth; o Worker não expõe SQL ao browser |
| gestor_equipe_gestor_ids | rpc | src/lib/server/auth/legacy-scope.ts; src/hooks.server.ts | coberto | helper de RLS/auth; o Worker não expõe SQL ao browser |
| gestor_equipe_vendedor_ids | rpc | src/lib/server/auth/legacy-scope.ts; src/hooks.server.ts | coberto | helper de RLS/auth; o Worker não expõe SQL ao browser |
| get_current_user_company_id | rpc | src/lib/server/auth/legacy-scope.ts; src/hooks.server.ts | coberto | helper de RLS/auth; o Worker não expõe SQL ao browser |
| get_or_create_draft_quote | rpc | dump public.sql | excluído | funções do modelo sale/quote em inglês ou de cotação sem tabela ativa no fluxo |
| get_visible_templates | rpc | dump public.sql | excluído | código morto: sem trigger, sem chamada em src/ e sem papel de RLS |
| gin_extract_query_trgm | rpc | extensão pg_trgm/unaccent | excluído | não é regra do produto |
| gin_extract_value_trgm | rpc | extensão pg_trgm/unaccent | excluído | não é regra do produto |
| gin_trgm_consistent | rpc | extensão pg_trgm/unaccent | excluído | não é regra do produto |
| gin_trgm_triconsistent | rpc | extensão pg_trgm/unaccent | excluído | não é regra do produto |
| gtrgm_compress | rpc | extensão pg_trgm/unaccent | excluído | não é regra do produto |
| gtrgm_consistent | rpc | extensão pg_trgm/unaccent | excluído | não é regra do produto |
| gtrgm_decompress | rpc | extensão pg_trgm/unaccent | excluído | não é regra do produto |
| gtrgm_distance | rpc | extensão pg_trgm/unaccent | excluído | não é regra do produto |
| gtrgm_in | rpc | extensão pg_trgm/unaccent | excluído | não é regra do produto |
| gtrgm_options | rpc | extensão pg_trgm/unaccent | excluído | não é regra do produto |
| gtrgm_out | rpc | extensão pg_trgm/unaccent | excluído | não é regra do produto |
| gtrgm_penalty | rpc | extensão pg_trgm/unaccent | excluído | não é regra do produto |
| gtrgm_picksplit | rpc | extensão pg_trgm/unaccent | excluído | não é regra do produto |
| gtrgm_same | rpc | extensão pg_trgm/unaccent | excluído | não é regra do produto |
| gtrgm_union | rpc | extensão pg_trgm/unaccent | excluído | não é regra do produto |
| handle_new_user | rpc | dump public.sql | excluído | código morto: sem trigger, sem chamada em src/ e sem papel de RLS |
| has_perm | rpc | src/lib/server/auth/legacy-scope.ts; src/hooks.server.ts | coberto | helper de RLS/auth; o Worker não expõe SQL ao browser |
| is_admin | rpc | src/lib/server/auth/legacy-scope.ts; src/hooks.server.ts | coberto | helper de RLS/auth; o Worker não expõe SQL ao browser |
| is_admin | rpc | src/lib/server/auth/legacy-scope.ts; src/hooks.server.ts | coberto | helper de RLS/auth; o Worker não expõe SQL ao browser |
| is_admin_user | rpc | src/lib/server/auth/legacy-scope.ts; src/hooks.server.ts | coberto | helper de RLS/auth; o Worker não expõe SQL ao browser |
| is_admin_user | rpc | src/lib/server/auth/legacy-scope.ts; src/hooks.server.ts | coberto | helper de RLS/auth; o Worker não expõe SQL ao browser |
| is_admin_user_type | rpc | src/lib/server/auth/legacy-scope.ts; src/hooks.server.ts | coberto | helper de RLS/auth; o Worker não expõe SQL ao browser |
| is_corporate_user | rpc | src/lib/server/auth/legacy-scope.ts; src/hooks.server.ts | coberto | helper de RLS/auth; o Worker não expõe SQL ao browser |
| is_forma_pagamento_nao_comissionavel | rpc | src/lib/server/auth/legacy-scope.ts; src/hooks.server.ts | coberto | helper de RLS/auth; o Worker não expõe SQL ao browser |
| is_gestor | rpc | src/lib/server/auth/legacy-scope.ts; src/hooks.server.ts | coberto | helper de RLS/auth; o Worker não expõe SQL ao browser |
| is_master | rpc | src/lib/server/auth/legacy-scope.ts; src/hooks.server.ts | coberto | helper de RLS/auth; o Worker não expõe SQL ao browser |
| is_master_allowed_module | rpc | src/lib/server/auth/legacy-scope.ts; src/hooks.server.ts | coberto | helper de RLS/auth; o Worker não expõe SQL ao browser |
| is_uso_individual | rpc | src/lib/server/auth/legacy-scope.ts; src/hooks.server.ts | coberto | helper de RLS/auth; o Worker não expõe SQL ao browser |
| log_system_documentation_change | rpc | dump public.sql | excluído | código morto: sem trigger, sem chamada em src/ e sem papel de RLS |
| log_system_documentation_section_change | rpc | dump public.sql | excluído | código morto: sem trigger, sem chamada em src/ e sem papel de RLS |
| master_can_access_company | rpc | src/lib/server/auth/legacy-scope.ts; src/hooks.server.ts | coberto | helper de RLS/auth; o Worker não expõe SQL ao browser |
| master_can_access_user | rpc | src/lib/server/auth/legacy-scope.ts; src/hooks.server.ts | coberto | helper de RLS/auth; o Worker não expõe SQL ao browser |
| master_company_ids | rpc | dump public.sql | excluído | código morto: sem trigger, sem chamada em src/ e sem papel de RLS |
| mural_recado_respostas_set_defaults | rpc | dump public.sql | excluído | código morto: sem trigger, sem chamada em src/ e sem papel de RLS |
| mural_recados_delete_private_unread | rpc | dump public.sql | excluído | código morto: sem trigger, sem chamada em src/ e sem papel de RLS |
| mural_recados_hide_for_sender | rpc | dump public.sql | excluído | código morto: sem trigger, sem chamada em src/ e sem papel de RLS |
| mural_recados_mark_read | rpc | dump public.sql | excluído | código morto: sem trigger, sem chamada em src/ e sem papel de RLS |
| mural_recados_set_defaults | rpc | dump public.sql | excluído | código morto: sem trigger, sem chamada em src/ e sem papel de RLS |
| mural_recados_unread_count | rpc | dump public.sql | excluído | código morto: sem trigger, sem chamada em src/ e sem papel de RLS |
| normalize_cnpj | rpc | src/lib/server/data/legado-rules.ts | migrado | regra do gatilho aplicada na escrita; legado-rules.test.ts |
| normalize_cpf | rpc | src/lib/server/data/legado-rules.ts | migrado | regra do gatilho aplicada na escrita; legado-rules.test.ts |
| normalize_cpf_trigger_fn | rpc | src/lib/server/data/legado-rules.ts | migrado | regra do gatilho aplicada na escrita; legado-rules.test.ts |
| normalize_name_ptbr | rpc | src/lib/server/data/legado-rules.ts | migrado | regra do gatilho aplicada na escrita; legado-rules.test.ts |
| orcamento_defaults | rpc | src/lib/server/data/legado-rules.ts | migrado | regra do gatilho aplicada na escrita; legado-rules.test.ts |
| pagar_comissao | rpc | dump public.sql | excluído | funções do modelo sale/quote em inglês ou de cotação sem tabela ativa no fluxo |
| perm_level | rpc | src/lib/server/auth/legacy-scope.ts; src/hooks.server.ts | coberto | helper de RLS/auth; o Worker não expõe SQL ao browser |
| recalcular_financeiro_sale | rpc | dump public.sql | excluído | funções do modelo sale/quote em inglês ou de cotação sem tabela ativa no fluxo |
| recalcular_total_quote | rpc | dump public.sql | excluído | funções do modelo sale/quote em inglês ou de cotação sem tabela ativa no fluxo |
| registrar_estorno | rpc | dump public.sql | excluído | código morto: sem trigger, sem chamada em src/ e sem papel de RLS |
| registrar_pagamento_parcelado | rpc | dump public.sql | excluído | código morto: sem trigger, sem chamada em src/ e sem papel de RLS |
| registrar_pagamento_sale | rpc | dump public.sql | excluído | funções do modelo sale/quote em inglês ou de cotação sem tabela ativa no fluxo |
| registrar_pagamento_simples | rpc | dump public.sql | excluído | código morto: sem trigger, sem chamada em src/ e sem papel de RLS |
| registrar_reembolso | rpc | dump public.sql | excluído | código morto: sem trigger, sem chamada em src/ e sem papel de RLS |
| relatorio_clientes_from_read_model | rpc | src/lib/server/reciboContribuicoesReadModel.ts | coberto | sem a função SQL o cálculo ao vivo é o resultado |
| relatorio_destinos_from_read_model | rpc | src/lib/server/reciboContribuicoesReadModel.ts | coberto | sem a função SQL o cálculo ao vivo é o resultado |
| relatorio_produtos_from_read_model | rpc | src/lib/server/reciboContribuicoesReadModel.ts | coberto | sem a função SQL o cálculo ao vivo é o resultado |
| relatorio_vendas_por_cliente | rpc | src/lib/server/reciboContribuicoesReadModel.ts | coberto | sem a função SQL o cálculo ao vivo é o resultado |
| relatorio_vendas_por_destino | rpc | src/lib/server/reciboContribuicoesReadModel.ts | coberto | sem a função SQL o cálculo ao vivo é o resultado |
| relatorio_vendas_por_produto | rpc | src/lib/server/reciboContribuicoesReadModel.ts | coberto | sem a função SQL o cálculo ao vivo é o resultado |
| reverter_comissoes_da_venda | rpc | dump public.sql | excluído | funções do modelo sale/quote em inglês ou de cotação sem tabela ativa no fluxo |
| rpc_dashboard_consultorias | rpc | src/lib/server/reciboContribuicoesReadModel.ts | coberto | sem a função SQL o cálculo ao vivo é o resultado |
| rpc_dashboard_vendas_summary | rpc | src/lib/server/reciboContribuicoesReadModel.ts | coberto | sem a função SQL o cálculo ao vivo é o resultado |
| rpc_vendas_kpis | rpc | src/lib/server/reciboContribuicoesReadModel.ts | coberto | sem a função SQL o cálculo ao vivo é o resultado |
| sales_assignable_company_user | rpc | src/lib/server/auth/legacy-scope.ts; src/hooks.server.ts | coberto | helper de RLS/auth; o Worker não expõe SQL ao browser |
| security_audit_weekly_run | rpc | dump public.sql | excluído | seed, auditoria interna do Supabase ou helper sem consumidor |
| seed_user_message_template_themes | rpc | dump public.sql | excluído | seed, auditoria interna do Supabase ou helper sem consumidor |
| seed_user_message_templates | rpc | dump public.sql | excluído | seed, auditoria interna do Supabase ou helper sem consumidor |
| set_consultoria_online_updated_at | rpc | src/lib/server/data/query.ts | migrado | updated_at gravado na escrita |
| set_gestor_vendedor_relacao | rpc | src/lib/server/auth/legacy-scope.ts; src/hooks.server.ts | coberto | helper de RLS/auth; o Worker não expõe SQL ao browser |
| set_limit | rpc | dump public.sql | excluído | código morto: sem trigger, sem chamada em src/ e sem papel de RLS |
| set_modulo_acesso_defaults | rpc | dump public.sql | excluído | código morto: sem trigger, sem chamada em src/ e sem papel de RLS |
| set_updated_at | rpc | src/lib/server/data/query.ts | migrado | updated_at gravado na escrita |
| show_limit | rpc | dump public.sql | excluído | código morto: sem trigger, sem chamada em src/ e sem papel de RLS |
| show_trgm | rpc | extensão pg_trgm/unaccent | excluído | não é regra do produto |
| similarity | rpc | extensão pg_trgm/unaccent | excluído | não é regra do produto |
| similarity_dist | rpc | extensão pg_trgm/unaccent | excluído | não é regra do produto |
| similarity_op | rpc | extensão pg_trgm/unaccent | excluído | não é regra do produto |
| strict_word_similarity | rpc | extensão pg_trgm/unaccent | excluído | não é regra do produto |
| strict_word_similarity_commutator_op | rpc | extensão pg_trgm/unaccent | excluído | não é regra do produto |
| strict_word_similarity_dist_commutator_op | rpc | extensão pg_trgm/unaccent | excluído | não é regra do produto |
| strict_word_similarity_dist_op | rpc | extensão pg_trgm/unaccent | excluído | não é regra do produto |
| strict_word_similarity_op | rpc | extensão pg_trgm/unaccent | excluído | não é regra do produto |
| strip_accents | rpc | dump public.sql | excluído | seed, auditoria interna do Supabase ou helper sem consumidor |
| sync_user_convites_status | rpc | dump public.sql | excluído | código morto: sem trigger, sem chamada em src/ e sem papel de RLS |
| sync_venda_children | rpc | src/lib/server/data/rpc.ts | coberto | rotina com consumidor reimplementada |
| todo_categorias_set_defaults | rpc | dump public.sql | excluído | código morto: sem trigger, sem chamada em src/ e sem papel de RLS |
| todo_categorias_set_updated_at | rpc | src/lib/server/data/query.ts | migrado | updated_at gravado na escrita |
| touch_system_module_settings_updated_at | rpc | src/lib/server/data/query.ts | migrado | updated_at gravado na escrita |
| touch_vendas_recibos_rateio_updated_at | rpc | src/lib/server/data/query.ts | migrado | updated_at gravado na escrita |
| trg_apply_modulo_defaults | rpc | dump public.sql | excluído | código morto: sem trigger, sem chamada em src/ e sem papel de RLS |
| trg_clientes_link_current_company | rpc | src/lib/server/auth/legacy-scope.ts; src/hooks.server.ts | coberto | helper de RLS/auth; o Worker não expõe SQL ao browser |
| trg_consultorias_link_cliente_company | rpc | dump public.sql | excluído | código morto: sem trigger, sem chamada em src/ e sem papel de RLS |
| trg_format_clientes_cpf_cnpj | rpc | src/lib/server/data/legado-rules.ts | migrado | regra do gatilho aplicada na escrita; legado-rules.test.ts |
| trg_normalize_admin_avisos_templates_nome | rpc | src/lib/server/data/legado-rules.ts | migrado | regra do gatilho aplicada na escrita; legado-rules.test.ts |
| trg_normalize_circuitos_nome | rpc | src/lib/server/data/legado-rules.ts | migrado | regra do gatilho aplicada na escrita; legado-rules.test.ts |
| trg_normalize_cliente_acomp_nome | rpc | src/lib/server/data/legado-rules.ts | migrado | regra do gatilho aplicada na escrita; legado-rules.test.ts |
| trg_normalize_clientes_nome | rpc | src/lib/server/data/legado-rules.ts | migrado | regra do gatilho aplicada na escrita; legado-rules.test.ts |
| trg_normalize_commission_rule_nome | rpc | src/lib/server/data/legado-rules.ts | migrado | regra do gatilho aplicada na escrita; legado-rules.test.ts |
| trg_normalize_consultorias_cliente_nome | rpc | src/lib/server/data/legado-rules.ts | migrado | regra do gatilho aplicada na escrita; legado-rules.test.ts |
| trg_normalize_crm_template_categories_nome | rpc | src/lib/server/data/legado-rules.ts | migrado | regra do gatilho aplicada na escrita; legado-rules.test.ts |
| trg_normalize_feriados_nome | rpc | src/lib/server/data/legado-rules.ts | migrado | regra do gatilho aplicada na escrita; legado-rules.test.ts |
| trg_normalize_formas_pagamento_nome | rpc | src/lib/server/data/legado-rules.ts | migrado | regra do gatilho aplicada na escrita; legado-rules.test.ts |
| trg_normalize_fornecedores_nome_completo | rpc | src/lib/server/data/legado-rules.ts | migrado | regra do gatilho aplicada na escrita; legado-rules.test.ts |
| trg_normalize_message_templates_v2_nome | rpc | src/lib/server/data/legado-rules.ts | migrado | regra do gatilho aplicada na escrita; legado-rules.test.ts |
| trg_normalize_minhas_preferencias_nome | rpc | src/lib/server/data/legado-rules.ts | migrado | regra do gatilho aplicada na escrita; legado-rules.test.ts |
| trg_normalize_plans_nome | rpc | src/lib/server/data/legado-rules.ts | migrado | regra do gatilho aplicada na escrita; legado-rules.test.ts |
| trg_normalize_quote_print_consultor_nome | rpc | src/lib/server/data/legado-rules.ts | migrado | regra do gatilho aplicada na escrita; legado-rules.test.ts |
| trg_normalize_quote_print_settings_filial_nome | rpc | src/lib/server/data/legado-rules.ts | migrado | regra do gatilho aplicada na escrita; legado-rules.test.ts |
| trg_normalize_roteiro_personalizado_nome | rpc | src/lib/server/data/legado-rules.ts | migrado | regra do gatilho aplicada na escrita; legado-rules.test.ts |
| trg_normalize_roteiro_transporte_tarifa_nome | rpc | src/lib/server/data/legado-rules.ts | migrado | regra do gatilho aplicada na escrita; legado-rules.test.ts |
| trg_normalize_servicos_fornecedor_nome | rpc | src/lib/server/data/legado-rules.ts | migrado | regra do gatilho aplicada na escrita; legado-rules.test.ts |
| trg_normalize_servicos_nome | rpc | src/lib/server/data/legado-rules.ts | migrado | regra do gatilho aplicada na escrita; legado-rules.test.ts |
| trg_normalize_subdivisoes_nome | rpc | src/lib/server/data/legado-rules.ts | migrado | regra do gatilho aplicada na escrita; legado-rules.test.ts |
| trg_normalize_tipo_pacotes_nome | rpc | src/lib/server/data/legado-rules.ts | migrado | regra do gatilho aplicada na escrita; legado-rules.test.ts |
| trg_normalize_tipo_produtos_nome | rpc | src/lib/server/data/legado-rules.ts | migrado | regra do gatilho aplicada na escrita; legado-rules.test.ts |
| trg_normalize_todo_categorias_nome | rpc | src/lib/server/data/legado-rules.ts | migrado | regra do gatilho aplicada na escrita; legado-rules.test.ts |
| trg_normalize_user_crm_assinaturas_nome | rpc | src/lib/server/data/legado-rules.ts | migrado | regra do gatilho aplicada na escrita; legado-rules.test.ts |
| trg_normalize_user_message_template_themes_nome | rpc | src/lib/server/data/legado-rules.ts | migrado | regra do gatilho aplicada na escrita; legado-rules.test.ts |
| trg_normalize_user_message_templates_nome | rpc | src/lib/server/data/legado-rules.ts | migrado | regra do gatilho aplicada na escrita; legado-rules.test.ts |
| trg_normalize_users_nome_completo | rpc | src/lib/server/data/legado-rules.ts | migrado | regra do gatilho aplicada na escrita; legado-rules.test.ts |
| trg_normalize_vendas_pagamentos_forma_nome | rpc | src/lib/server/data/legado-rules.ts | migrado | regra do gatilho aplicada na escrita; legado-rules.test.ts |
| trg_normalize_vouchers_nome | rpc | src/lib/server/data/legado-rules.ts | migrado | regra do gatilho aplicada na escrita; legado-rules.test.ts |
| trg_produtos_guard_seguro | rpc | src/lib/server/data/legado-rules.ts | migrado | regra do gatilho aplicada na escrita; legado-rules.test.ts |
| trg_quote_link_cliente_company | rpc | dump public.sql | excluído | funções do modelo sale/quote em inglês ou de cotação sem tabela ativa no fluxo |
| trg_rm_v4_conciliacao_recibos | rpc | docs/adr/ADR-009-modulos-adiados.md | excluído | conciliação ou importação fora do produto |
| trg_rm_v4_vendas | rpc | dump public.sql | excluído | código morto: sem trigger, sem chamada em src/ e sem papel de RLS |
| trg_rm_v4_vendas_recibos | rpc | dump public.sql | excluído | código morto: sem trigger, sem chamada em src/ e sem papel de RLS |
| trg_rm_v4_vendas_recibos_complementares | rpc | dump public.sql | excluído | código morto: sem trigger, sem chamada em src/ e sem papel de RLS |
| trg_rm_v4_vendas_recibos_rateio | rpc | dump public.sql | excluído | código morto: sem trigger, sem chamada em src/ e sem papel de RLS |
| trg_vendas_link_cliente_company | rpc | dump public.sql | excluído | código morto: sem trigger, sem chamada em src/ e sem papel de RLS |
| trg_vendas_recibos_guard_seguro | rpc | src/lib/server/data/legado-rules.ts | migrado | regra do gatilho aplicada na escrita; legado-rules.test.ts |
| trg_viagens_link_cliente_company | rpc | dump public.sql | excluído | código morto: sem trigger, sem chamada em src/ e sem papel de RLS |
| unaccent | rpc | extensão pg_trgm/unaccent | excluído | não é regra do produto |
| unaccent | rpc | extensão pg_trgm/unaccent | excluído | não é regra do produto |
| unaccent_init | rpc | extensão pg_trgm/unaccent | excluído | não é regra do produto |
| unaccent_lexize | rpc | extensão pg_trgm/unaccent | excluído | não é regra do produto |
| update_comissionamento_updated_at | rpc | src/lib/server/data/query.ts | migrado | updated_at gravado na escrita |
| update_metas_vendedor_updated_at | rpc | src/lib/server/data/query.ts | migrado | updated_at gravado na escrita |
| update_modulo_acesso_updated_at | rpc | src/lib/server/data/query.ts | migrado | updated_at gravado na escrita |
| update_produtos_updated_at | rpc | src/lib/server/data/query.ts | migrado | updated_at gravado na escrita |
| update_updated_at_column | rpc | src/lib/server/data/query.ts | migrado | updated_at gravado na escrita |
| user_company_id | rpc | src/lib/server/auth/legacy-scope.ts; src/hooks.server.ts | coberto | helper de RLS/auth; o Worker não expõe SQL ao browser |
| user_profile_basico_completo | rpc | src/lib/server/auth/legacy-scope.ts; src/hooks.server.ts | coberto | helper de RLS/auth; o Worker não expõe SQL ao browser |
| user_type_default_perms_set_updated_at | rpc | src/lib/server/data/query.ts | migrado | updated_at gravado na escrita |
| validar_cnpj | rpc | src/lib/server/data/legado-rules.ts | migrado | regra do gatilho aplicada na escrita; legado-rules.test.ts |
| validar_cpf | rpc | src/lib/server/data/legado-rules.ts | migrado | regra do gatilho aplicada na escrita; legado-rules.test.ts |
| validate_comissionamento_regra | rpc | src/lib/server/data/legado-rules.ts | migrado | regra do gatilho aplicada na escrita; legado-rules.test.ts |
| vendas_clientes_base | rpc | src/lib/server/auth/legacy-scope.ts; src/hooks.server.ts | coberto | helper de RLS/auth; o Worker não expõe SQL ao browser |
| vendas_recibos_conciliacao_status | rpc | docs/adr/ADR-009-modulos-adiados.md | excluído | conciliação ou importação fora do produto |
| vendas_recibos_set_data_venda_default | rpc | src/lib/server/data/legado-rules.ts | migrado | regra do gatilho aplicada na escrita; legado-rules.test.ts |
| word_similarity | rpc | extensão pg_trgm/unaccent | excluído | não é regra do produto |
| word_similarity_commutator_op | rpc | extensão pg_trgm/unaccent | excluído | não é regra do produto |
| word_similarity_dist_commutator_op | rpc | extensão pg_trgm/unaccent | excluído | não é regra do produto |
| word_similarity_dist_op | rpc | extensão pg_trgm/unaccent | excluído | não é regra do produto |
| word_similarity_op | rpc | extensão pg_trgm/unaccent | excluído | não é regra do produto |
| campanhas | bucket | src/lib/server/data/storageApi.ts | migrado | leitura pública; limite nenhum; teste storage-rules.test.ts |
| master-docs | bucket | src/lib/server/data/storageApi.ts | migrado | privado: URL assinada; /api/arquivos/publico responde 403 |
| message-template-themes | bucket | src/lib/server/data/storageApi.ts | migrado | leitura pública; limite nenhum; teste storage-rules.test.ts |
| mural-recados | bucket | src/lib/server/data/storageApi.ts | migrado | leitura pública; limite nenhum; teste storage-rules.test.ts |
| profile-avatars | bucket | src/lib/server/data/storageApi.ts | migrado | leitura pública; limite nenhum; teste storage-rules.test.ts |
| quotes | bucket | src/lib/server/data/storageApi.ts | migrado | privado: URL assinada; /api/arquivos/publico responde 403 |
| system-docs | bucket | src/lib/server/data/storageApi.ts | migrado | leitura pública; limite nenhum; teste storage-rules.test.ts |
| viagens | bucket | src/lib/server/data/storageApi.ts | migrado | leitura pública; limite 2097152; teste storage-rules.test.ts |
| viagens-documentos | bucket | src/lib/server/data/storageApi.ts | migrado | privado: URL assinada; /api/arquivos/publico responde 403 |
| voucher-assets | bucket | src/lib/server/data/storageApi.ts | migrado | privado: URL assinada; /api/arquivos/publico responde 403 |
| allow_auth_insert_viagens | policy-storage | src/lib/server/data/storageApi.ts | coberto | INSERT no bucket citado na policy; sessão ou URL assinada |
| allow_authenticated_uploads_docs | policy-storage | src/lib/server/data/storageApi.ts | coberto | INSERT no bucket citado na policy; sessão ou URL assinada |
| allow_authenticated_uploads_viagens | policy-storage | src/lib/server/data/storageApi.ts | coberto | INSERT no bucket citado na policy; sessão ou URL assinada |
| allow_owner_delete_viagens | policy-storage | src/lib/server/data/storageApi.ts | coberto | DELETE no bucket citado na policy; sessão ou URL assinada |
| allow_owner_select_viagens | policy-storage | src/lib/server/data/storageApi.ts | coberto | SELECT no bucket citado na policy; sessão ou URL assinada |
| allow_owner_update_viagens | policy-storage | src/lib/server/data/storageApi.ts | coberto | UPDATE no bucket citado na policy; sessão ou URL assinada |
| allow_select_viagens | policy-storage | src/lib/server/data/storageApi.ts | coberto | SELECT no bucket citado na policy; sessão ou URL assinada |
| allow_update_viagens | policy-storage | src/lib/server/data/storageApi.ts | coberto | UPDATE no bucket citado na policy; sessão ou URL assinada |
| campanhas_storage_delete | policy-storage | src/lib/server/data/storageApi.ts | coberto | DELETE no bucket citado na policy; sessão ou URL assinada |
| campanhas_storage_insert | policy-storage | src/lib/server/data/storageApi.ts | coberto | INSERT no bucket citado na policy; sessão ou URL assinada |
| message_template_themes_storage_delete | policy-storage | src/lib/server/data/storageApi.ts | coberto | DELETE no bucket citado na policy; sessão ou URL assinada |
| message_template_themes_storage_insert | policy-storage | src/lib/server/data/storageApi.ts | coberto | INSERT no bucket citado na policy; sessão ou URL assinada |
| message_template_themes_storage_update | policy-storage | src/lib/server/data/storageApi.ts | coberto | UPDATE no bucket citado na policy; sessão ou URL assinada |
| mural_recados_storage_delete | policy-storage | src/lib/server/data/storageApi.ts | coberto | DELETE no bucket citado na policy; sessão ou URL assinada |
| mural_recados_storage_insert | policy-storage | src/lib/server/data/storageApi.ts | coberto | INSERT no bucket citado na policy; sessão ou URL assinada |
| profile_avatars_storage_delete | policy-storage | src/lib/server/data/storageApi.ts | coberto | DELETE no bucket citado na policy; sessão ou URL assinada |
| profile_avatars_storage_insert | policy-storage | src/lib/server/data/storageApi.ts | coberto | INSERT no bucket citado na policy; sessão ou URL assinada |
| profile_avatars_storage_read | policy-storage | src/lib/server/data/storageApi.ts | coberto | SELECT no bucket citado na policy; sessão ou URL assinada |
| profile_avatars_storage_update | policy-storage | src/lib/server/data/storageApi.ts | coberto | UPDATE no bucket citado na policy; sessão ou URL assinada |
| quotes_storage_delete_own | policy-storage | src/lib/server/data/storageApi.ts | coberto | DELETE no bucket citado na policy; sessão ou URL assinada |
| quotes_storage_insert_own | policy-storage | src/lib/server/data/storageApi.ts | coberto | INSERT no bucket citado na policy; sessão ou URL assinada |
| quotes_storage_read_own | policy-storage | src/lib/server/data/storageApi.ts | coberto | SELECT no bucket citado na policy; sessão ou URL assinada |
| quotes_storage_update_own | policy-storage | src/lib/server/data/storageApi.ts | coberto | UPDATE no bucket citado na policy; sessão ou URL assinada |
| viagens_documentos_storage_delete | policy-storage | src/lib/server/data/storageApi.ts | coberto | DELETE no bucket citado na policy; sessão ou URL assinada |
| viagens_documentos_storage_insert | policy-storage | src/lib/server/data/storageApi.ts | coberto | INSERT no bucket citado na policy; sessão ou URL assinada |
| viagens_documentos_storage_read | policy-storage | src/lib/server/data/storageApi.ts | coberto | SELECT no bucket citado na policy; sessão ou URL assinada |
| viagens_storage_delete_own | policy-storage | src/lib/server/data/storageApi.ts | coberto | DELETE no bucket citado na policy; sessão ou URL assinada |
| viagens_storage_insert_own | policy-storage | src/lib/server/data/storageApi.ts | coberto | INSERT no bucket citado na policy; sessão ou URL assinada |
| viagens_storage_read_own | policy-storage | src/lib/server/data/storageApi.ts | coberto | SELECT no bucket citado na policy; sessão ou URL assinada |
| viagens_storage_update_own | policy-storage | src/lib/server/data/storageApi.ts | coberto | UPDATE no bucket citado na policy; sessão ou URL assinada |
| voucher_assets_storage_delete | policy-storage | src/lib/server/data/storageApi.ts | coberto | DELETE no bucket citado na policy; sessão ou URL assinada |
| voucher_assets_storage_insert | policy-storage | src/lib/server/data/storageApi.ts | coberto | INSERT no bucket citado na policy; sessão ou URL assinada |
| voucher_assets_storage_read | policy-storage | src/lib/server/data/storageApi.ts | coberto | SELECT no bucket citado na policy; sessão ou URL assinada |
| enforce_bucket_name_length_trigger | trigger-storage | dump public.sql | coberto | gatilho enforce_bucket_name_length lido no dump; efeito de apoio sem regra nova além do serviço |
| protect_bucket_control_insert | trigger-storage | dump public.sql | coberto | gatilho protect_bucket_control_columns lido no dump; efeito de apoio sem regra nova além do serviço |
| protect_bucket_control_update | trigger-storage | dump public.sql | coberto | gatilho protect_bucket_control_columns lido no dump; efeito de apoio sem regra nova além do serviço |
| protect_bucket_control_update_role | trigger-storage | dump public.sql | coberto | gatilho enforce_bucket_lifecycle_service_role lido no dump; efeito de apoio sem regra nova além do serviço |
| protect_buckets_delete | trigger-storage | dump public.sql | coberto | gatilho protect_delete lido no dump; efeito de apoio sem regra nova além do serviço |
| protect_objects_delete | trigger-storage | dump public.sql | coberto | gatilho protect_delete lido no dump; efeito de apoio sem regra nova além do serviço |
| update_objects_updated_at | trigger-storage | src/lib/server/data/query.ts | migrado | updated_at gravado na escrita |

## Auth que o app usava

| regra | destino | status | teste/evidência |
| --- | --- | --- | --- |
| confirmação de e-mail | src/lib/auth.ts requireEmailVerification quando há RESEND_API_KEY | coberto | login exige email_verified; bootstrap grava 1 |
| senha | scrypt de @better-auth/utils/password, o mesmo do Worker | migrado | src/lib/server/bootstrap-admin.workers.test.ts |
| recuperação de senha | src/lib/auth.ts sendResetPassword | coberto | fluxo Better Auth |
| MFA | src/lib/server/data/authApi.ts e mfa_fatores; hook só obriga se a empresa tiver mfa_obrigatorio | coberto | bootstrap não cria fator; / não redireciona para /auth/mfa |
| convite | tabela convites e rotas de ativação | coberto | src/lib/server/api/routes/invites-v2 |
| sessão | tabela session e cookie Better Auth | coberto | src/lib/server/bootstrap-admin.workers.test.ts |
| perfil ADMIN | user_types no select do hook | migrado | src/lib/server/data/query.ts inclui a coluna da relação; bootstrap-admin.workers.test.ts |

