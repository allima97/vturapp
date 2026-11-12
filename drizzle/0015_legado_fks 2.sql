-- Recria o catalogo legado com FKs e CHECKs equivalentes ao Postgres.
-- Copia as linhas existentes, recria as tabelas e restaura.
-- FKs em ciclo ou auto-referencia ficam DEFERRABLE.
PRAGMA foreign_keys = OFF;

CREATE TABLE IF NOT EXISTS "legado_bak_admin_avisos_templates" AS SELECT * FROM "legado_admin_avisos_templates";
DROP TABLE "legado_admin_avisos_templates";
CREATE TABLE IF NOT EXISTS "legado_bak_admin_email_settings" AS SELECT * FROM "legado_admin_email_settings";
DROP TABLE "legado_admin_email_settings";
CREATE TABLE IF NOT EXISTS "legado_bak_admin_system_settings" AS SELECT * FROM "legado_admin_system_settings";
DROP TABLE "legado_admin_system_settings";
CREATE TABLE IF NOT EXISTS "legado_bak_agenda_itens" AS SELECT * FROM "legado_agenda_itens";
DROP TABLE "legado_agenda_itens";
CREATE TABLE IF NOT EXISTS "legado_bak_airline_iata_aliases" AS SELECT * FROM "legado_airline_iata_aliases";
DROP TABLE "legado_airline_iata_aliases";
CREATE TABLE IF NOT EXISTS "legado_bak_airline_iata_codes" AS SELECT * FROM "legado_airline_iata_codes";
DROP TABLE "legado_airline_iata_codes";
CREATE TABLE IF NOT EXISTS "legado_bak_auth_passkey_challenges" AS SELECT * FROM "legado_auth_passkey_challenges";
DROP TABLE "legado_auth_passkey_challenges";
CREATE TABLE IF NOT EXISTS "legado_bak_auth_passkeys" AS SELECT * FROM "legado_auth_passkeys";
DROP TABLE "legado_auth_passkeys";
CREATE TABLE IF NOT EXISTS "legado_bak_auth_signup_debug" AS SELECT * FROM "legado_auth_signup_debug";
DROP TABLE "legado_auth_signup_debug";
CREATE TABLE IF NOT EXISTS "legado_bak_campanhas" AS SELECT * FROM "legado_campanhas";
DROP TABLE "legado_campanhas";
CREATE TABLE IF NOT EXISTS "legado_bak_cidades" AS SELECT * FROM "legado_cidades";
DROP TABLE "legado_cidades";
CREATE TABLE IF NOT EXISTS "legado_bak_cidades_import_staging" AS SELECT * FROM "legado_cidades_import_staging";
DROP TABLE "legado_cidades_import_staging";
CREATE TABLE IF NOT EXISTS "legado_bak_cidades_import_targets" AS SELECT * FROM "legado_cidades_import_targets";
DROP TABLE "legado_cidades_import_targets";
CREATE TABLE IF NOT EXISTS "legado_bak_cidades_import_targets_norm" AS SELECT * FROM "legado_cidades_import_targets_norm";
DROP TABLE "legado_cidades_import_targets_norm";
CREATE TABLE IF NOT EXISTS "legado_bak_cidades_norm_cache" AS SELECT * FROM "legado_cidades_norm_cache";
DROP TABLE "legado_cidades_norm_cache";
CREATE TABLE IF NOT EXISTS "legado_bak_circuito_datas" AS SELECT * FROM "legado_circuito_datas";
DROP TABLE "legado_circuito_datas";
CREATE TABLE IF NOT EXISTS "legado_bak_circuito_dias" AS SELECT * FROM "legado_circuito_dias";
DROP TABLE "legado_circuito_dias";
CREATE TABLE IF NOT EXISTS "legado_bak_circuito_dias_cidades" AS SELECT * FROM "legado_circuito_dias_cidades";
DROP TABLE "legado_circuito_dias_cidades";
CREATE TABLE IF NOT EXISTS "legado_bak_circuitos" AS SELECT * FROM "legado_circuitos";
DROP TABLE "legado_circuitos";
CREATE TABLE IF NOT EXISTS "legado_bak_cliente_acompanhantes" AS SELECT * FROM "legado_cliente_acompanhantes";
DROP TABLE "legado_cliente_acompanhantes";
CREATE TABLE IF NOT EXISTS "legado_bak_cliente_template_dispatches" AS SELECT * FROM "legado_cliente_template_dispatches";
DROP TABLE "legado_cliente_template_dispatches";
CREATE TABLE IF NOT EXISTS "legado_bak_clientes" AS SELECT * FROM "legado_clientes";
DROP TABLE "legado_clientes";
CREATE TABLE IF NOT EXISTS "legado_bak_clientes_company" AS SELECT * FROM "legado_clientes_company";
DROP TABLE "legado_clientes_company";
CREATE TABLE IF NOT EXISTS "legado_bak_comissionamento_geral" AS SELECT * FROM "legado_comissionamento_geral";
DROP TABLE "legado_comissionamento_geral";
CREATE TABLE IF NOT EXISTS "legado_bak_comissoes" AS SELECT * FROM "legado_comissoes";
DROP TABLE "legado_comissoes";
CREATE TABLE IF NOT EXISTS "legado_bak_commission_rule" AS SELECT * FROM "legado_commission_rule";
DROP TABLE "legado_commission_rule";
CREATE TABLE IF NOT EXISTS "legado_bak_commission_tier" AS SELECT * FROM "legado_commission_tier";
DROP TABLE "legado_commission_tier";
CREATE TABLE IF NOT EXISTS "legado_bak_companies" AS SELECT * FROM "legado_companies";
DROP TABLE "legado_companies";
CREATE TABLE IF NOT EXISTS "legado_bak_company_billing" AS SELECT * FROM "legado_company_billing";
DROP TABLE "legado_company_billing";
CREATE TABLE IF NOT EXISTS "legado_bak_company_billing_events" AS SELECT * FROM "legado_company_billing_events";
DROP TABLE "legado_company_billing_events";
CREATE TABLE IF NOT EXISTS "legado_bak_conciliacao_dias_sem_movimento" AS SELECT * FROM "legado_conciliacao_dias_sem_movimento";
DROP TABLE "legado_conciliacao_dias_sem_movimento";
CREATE TABLE IF NOT EXISTS "legado_bak_conciliacao_execucoes" AS SELECT * FROM "legado_conciliacao_execucoes";
DROP TABLE "legado_conciliacao_execucoes";
CREATE TABLE IF NOT EXISTS "legado_bak_conciliacao_recibo_changes" AS SELECT * FROM "legado_conciliacao_recibo_changes";
DROP TABLE "legado_conciliacao_recibo_changes";
CREATE TABLE IF NOT EXISTS "legado_bak_conciliacao_recibos" AS SELECT * FROM "legado_conciliacao_recibos";
DROP TABLE "legado_conciliacao_recibos";
CREATE TABLE IF NOT EXISTS "legado_bak_consultorias_online" AS SELECT * FROM "legado_consultorias_online";
DROP TABLE "legado_consultorias_online";
CREATE TABLE IF NOT EXISTS "legado_bak_crm_message_templates" AS SELECT * FROM "legado_crm_message_templates";
DROP TABLE "legado_crm_message_templates";
CREATE TABLE IF NOT EXISTS "legado_bak_crm_template_categories" AS SELECT * FROM "legado_crm_template_categories";
DROP TABLE "legado_crm_template_categories";
CREATE TABLE IF NOT EXISTS "legado_bak_dashboard_widgets" AS SELECT * FROM "legado_dashboard_widgets";
DROP TABLE "legado_dashboard_widgets";
CREATE TABLE IF NOT EXISTS "legado_bak_documentos_viagens" AS SELECT * FROM "legado_documentos_viagens";
DROP TABLE "legado_documentos_viagens";
CREATE TABLE IF NOT EXISTS "legado_bak_escala_dia" AS SELECT * FROM "legado_escala_dia";
DROP TABLE "legado_escala_dia";
CREATE TABLE IF NOT EXISTS "legado_bak_escala_horario_usuario" AS SELECT * FROM "legado_escala_horario_usuario";
DROP TABLE "legado_escala_horario_usuario";
CREATE TABLE IF NOT EXISTS "legado_bak_escala_mes" AS SELECT * FROM "legado_escala_mes";
DROP TABLE "legado_escala_mes";
CREATE TABLE IF NOT EXISTS "legado_bak_estados" AS SELECT * FROM "legado_estados";
DROP TABLE "legado_estados";
CREATE TABLE IF NOT EXISTS "legado_bak_feriados" AS SELECT * FROM "legado_feriados";
DROP TABLE "legado_feriados";
CREATE TABLE IF NOT EXISTS "legado_bak_financeiro_empresas" AS SELECT * FROM "legado_financeiro_empresas";
DROP TABLE "legado_financeiro_empresas";
CREATE TABLE IF NOT EXISTS "legado_bak_formas_pagamento" AS SELECT * FROM "legado_formas_pagamento";
DROP TABLE "legado_formas_pagamento";
CREATE TABLE IF NOT EXISTS "legado_bak_fornecedores" AS SELECT * FROM "legado_fornecedores";
DROP TABLE "legado_fornecedores";
CREATE TABLE IF NOT EXISTS "legado_bak_gestor_equipe_compartilhada" AS SELECT * FROM "legado_gestor_equipe_compartilhada";
DROP TABLE "legado_gestor_equipe_compartilhada";
CREATE TABLE IF NOT EXISTS "legado_bak_gestor_vendedor" AS SELECT * FROM "legado_gestor_vendedor";
DROP TABLE "legado_gestor_vendedor";
CREATE TABLE IF NOT EXISTS "legado_bak_historico_viagens_real" AS SELECT * FROM "legado_historico_viagens_real";
DROP TABLE "legado_historico_viagens_real";
CREATE TABLE IF NOT EXISTS "legado_bak_inquiry" AS SELECT * FROM "legado_inquiry";
DROP TABLE "legado_inquiry";
CREATE TABLE IF NOT EXISTS "legado_bak_inquiry_preference" AS SELECT * FROM "legado_inquiry_preference";
DROP TABLE "legado_inquiry_preference";
CREATE TABLE IF NOT EXISTS "legado_bak_lgpd_atividades_tratamento" AS SELECT * FROM "legado_lgpd_atividades_tratamento";
DROP TABLE "legado_lgpd_atividades_tratamento";
CREATE TABLE IF NOT EXISTS "legado_bak_lgpd_consentimentos" AS SELECT * FROM "legado_lgpd_consentimentos";
DROP TABLE "legado_lgpd_consentimentos";
CREATE TABLE IF NOT EXISTS "legado_bak_lgpd_solicitacoes" AS SELECT * FROM "legado_lgpd_solicitacoes";
DROP TABLE "legado_lgpd_solicitacoes";
CREATE TABLE IF NOT EXISTS "legado_bak_logs" AS SELECT * FROM "legado_logs";
DROP TABLE "legado_logs";
CREATE TABLE IF NOT EXISTS "legado_bak_master_documents" AS SELECT * FROM "legado_master_documents";
DROP TABLE "legado_master_documents";
CREATE TABLE IF NOT EXISTS "legado_bak_master_empresas" AS SELECT * FROM "legado_master_empresas";
DROP TABLE "legado_master_empresas";
CREATE TABLE IF NOT EXISTS "legado_bak_menu_prefs" AS SELECT * FROM "legado_menu_prefs";
DROP TABLE "legado_menu_prefs";
CREATE TABLE IF NOT EXISTS "legado_bak_message_templates_v2" AS SELECT * FROM "legado_message_templates_v2";
DROP TABLE "legado_message_templates_v2";
CREATE TABLE IF NOT EXISTS "legado_bak_metas_vendedor" AS SELECT * FROM "legado_metas_vendedor";
DROP TABLE "legado_metas_vendedor";
CREATE TABLE IF NOT EXISTS "legado_bak_metas_vendedor_produto" AS SELECT * FROM "legado_metas_vendedor_produto";
DROP TABLE "legado_metas_vendedor_produto";
CREATE TABLE IF NOT EXISTS "legado_bak_minhas_preferencias" AS SELECT * FROM "legado_minhas_preferencias";
DROP TABLE "legado_minhas_preferencias";
CREATE TABLE IF NOT EXISTS "legado_bak_minhas_preferencias_shares" AS SELECT * FROM "legado_minhas_preferencias_shares";
DROP TABLE "legado_minhas_preferencias_shares";
CREATE TABLE IF NOT EXISTS "legado_bak_modulo_acesso" AS SELECT * FROM "legado_modulo_acesso";
DROP TABLE "legado_modulo_acesso";
CREATE TABLE IF NOT EXISTS "legado_bak_modulo_acesso_backup" AS SELECT * FROM "legado_modulo_acesso_backup";
DROP TABLE "legado_modulo_acesso_backup";
CREATE TABLE IF NOT EXISTS "legado_bak_mural_recado_respostas" AS SELECT * FROM "legado_mural_recado_respostas";
DROP TABLE "legado_mural_recado_respostas";
CREATE TABLE IF NOT EXISTS "legado_bak_mural_recados" AS SELECT * FROM "legado_mural_recados";
DROP TABLE "legado_mural_recados";
CREATE TABLE IF NOT EXISTS "legado_bak_mural_recados_arquivos" AS SELECT * FROM "legado_mural_recados_arquivos";
DROP TABLE "legado_mural_recados_arquivos";
CREATE TABLE IF NOT EXISTS "legado_bak_mural_recados_leituras" AS SELECT * FROM "legado_mural_recados_leituras";
DROP TABLE "legado_mural_recados_leituras";
CREATE TABLE IF NOT EXISTS "legado_bak_paises" AS SELECT * FROM "legado_paises";
DROP TABLE "legado_paises";
CREATE TABLE IF NOT EXISTS "legado_bak_parametros_cambios" AS SELECT * FROM "legado_parametros_cambios";
DROP TABLE "legado_parametros_cambios";
CREATE TABLE IF NOT EXISTS "legado_bak_parametros_comissao" AS SELECT * FROM "legado_parametros_comissao";
DROP TABLE "legado_parametros_comissao";
CREATE TABLE IF NOT EXISTS "legado_bak_parametros_pagamentos_nao_comissionaveis" AS SELECT * FROM "legado_parametros_pagamentos_nao_comissionaveis";
DROP TABLE "legado_parametros_pagamentos_nao_comissionaveis";
CREATE TABLE IF NOT EXISTS "legado_bak_parametros_sistema" AS SELECT * FROM "legado_parametros_sistema";
DROP TABLE "legado_parametros_sistema";
CREATE TABLE IF NOT EXISTS "legado_bak_plans" AS SELECT * FROM "legado_plans";
DROP TABLE "legado_plans";
CREATE TABLE IF NOT EXISTS "legado_bak_product_commission_rule" AS SELECT * FROM "legado_product_commission_rule";
DROP TABLE "legado_product_commission_rule";
CREATE TABLE IF NOT EXISTS "legado_bak_product_commission_rule_pacote" AS SELECT * FROM "legado_product_commission_rule_pacote";
DROP TABLE "legado_product_commission_rule_pacote";
CREATE TABLE IF NOT EXISTS "legado_bak_produtos" AS SELECT * FROM "legado_produtos";
DROP TABLE "legado_produtos";
CREATE TABLE IF NOT EXISTS "legado_bak_produtos_tarifas" AS SELECT * FROM "legado_produtos_tarifas";
DROP TABLE "legado_produtos_tarifas";
CREATE TABLE IF NOT EXISTS "legado_bak_quote" AS SELECT * FROM "legado_quote";
DROP TABLE "legado_quote";
CREATE TABLE IF NOT EXISTS "legado_bak_quote_import_log" AS SELECT * FROM "legado_quote_import_log";
DROP TABLE "legado_quote_import_log";
CREATE TABLE IF NOT EXISTS "legado_bak_quote_item" AS SELECT * FROM "legado_quote_item";
DROP TABLE "legado_quote_item";
CREATE TABLE IF NOT EXISTS "legado_bak_quote_item_segment" AS SELECT * FROM "legado_quote_item_segment";
DROP TABLE "legado_quote_item_segment";
CREATE TABLE IF NOT EXISTS "legado_bak_quote_print_settings" AS SELECT * FROM "legado_quote_print_settings";
DROP TABLE "legado_quote_print_settings";
CREATE TABLE IF NOT EXISTS "legado_bak_ranking_read_model_status" AS SELECT * FROM "legado_ranking_read_model_status";
DROP TABLE "legado_ranking_read_model_status";
CREATE TABLE IF NOT EXISTS "legado_bak_ranking_recibo_contribuicoes" AS SELECT * FROM "legado_ranking_recibo_contribuicoes";
DROP TABLE "legado_ranking_recibo_contribuicoes";
CREATE TABLE IF NOT EXISTS "legado_bak_recibos" AS SELECT * FROM "legado_recibos";
DROP TABLE "legado_recibos";
CREATE TABLE IF NOT EXISTS "legado_bak_roteiro_dia" AS SELECT * FROM "legado_roteiro_dia";
DROP TABLE "legado_roteiro_dia";
CREATE TABLE IF NOT EXISTS "legado_bak_roteiro_hotel" AS SELECT * FROM "legado_roteiro_hotel";
DROP TABLE "legado_roteiro_hotel";
CREATE TABLE IF NOT EXISTS "legado_bak_roteiro_investimento" AS SELECT * FROM "legado_roteiro_investimento";
DROP TABLE "legado_roteiro_investimento";
CREATE TABLE IF NOT EXISTS "legado_bak_roteiro_pagamento" AS SELECT * FROM "legado_roteiro_pagamento";
DROP TABLE "legado_roteiro_pagamento";
CREATE TABLE IF NOT EXISTS "legado_bak_roteiro_passeio" AS SELECT * FROM "legado_roteiro_passeio";
DROP TABLE "legado_roteiro_passeio";
CREATE TABLE IF NOT EXISTS "legado_bak_roteiro_personalizado" AS SELECT * FROM "legado_roteiro_personalizado";
DROP TABLE "legado_roteiro_personalizado";
CREATE TABLE IF NOT EXISTS "legado_bak_roteiro_sugestoes" AS SELECT * FROM "legado_roteiro_sugestoes";
DROP TABLE "legado_roteiro_sugestoes";
CREATE TABLE IF NOT EXISTS "legado_bak_roteiro_transporte" AS SELECT * FROM "legado_roteiro_transporte";
DROP TABLE "legado_roteiro_transporte";
CREATE TABLE IF NOT EXISTS "legado_bak_sac_controle" AS SELECT * FROM "legado_sac_controle";
DROP TABLE "legado_sac_controle";
CREATE TABLE IF NOT EXISTS "legado_bak_sac_interacoes" AS SELECT * FROM "legado_sac_interacoes";
DROP TABLE "legado_sac_interacoes";
CREATE TABLE IF NOT EXISTS "legado_bak_security_audit_weekly_runs" AS SELECT * FROM "legado_security_audit_weekly_runs";
DROP TABLE "legado_security_audit_weekly_runs";
CREATE TABLE IF NOT EXISTS "legado_bak_security_rate_limits" AS SELECT * FROM "legado_security_rate_limits";
DROP TABLE "legado_security_rate_limits";
CREATE TABLE IF NOT EXISTS "legado_bak_servico_fornecedor_price" AS SELECT * FROM "legado_servico_fornecedor_price";
DROP TABLE "legado_servico_fornecedor_price";
CREATE TABLE IF NOT EXISTS "legado_bak_servico_fornecedor_price_period" AS SELECT * FROM "legado_servico_fornecedor_price_period";
DROP TABLE "legado_servico_fornecedor_price_period";
CREATE TABLE IF NOT EXISTS "legado_bak_servico_price" AS SELECT * FROM "legado_servico_price";
DROP TABLE "legado_servico_price";
CREATE TABLE IF NOT EXISTS "legado_bak_servico_price_period" AS SELECT * FROM "legado_servico_price_period";
DROP TABLE "legado_servico_price_period";
CREATE TABLE IF NOT EXISTS "legado_bak_servicos" AS SELECT * FROM "legado_servicos";
DROP TABLE "legado_servicos";
CREATE TABLE IF NOT EXISTS "legado_bak_servicos_fornecedor" AS SELECT * FROM "legado_servicos_fornecedor";
DROP TABLE "legado_servicos_fornecedor";
CREATE TABLE IF NOT EXISTS "legado_bak_subdivisoes" AS SELECT * FROM "legado_subdivisoes";
DROP TABLE "legado_subdivisoes";
CREATE TABLE IF NOT EXISTS "legado_bak_system_documentation" AS SELECT * FROM "legado_system_documentation";
DROP TABLE "legado_system_documentation";
CREATE TABLE IF NOT EXISTS "legado_bak_system_documentation_section_versions" AS SELECT * FROM "legado_system_documentation_section_versions";
DROP TABLE "legado_system_documentation_section_versions";
CREATE TABLE IF NOT EXISTS "legado_bak_system_documentation_sections" AS SELECT * FROM "legado_system_documentation_sections";
DROP TABLE "legado_system_documentation_sections";
CREATE TABLE IF NOT EXISTS "legado_bak_system_documentation_versions" AS SELECT * FROM "legado_system_documentation_versions";
DROP TABLE "legado_system_documentation_versions";
CREATE TABLE IF NOT EXISTS "legado_bak_system_module_settings" AS SELECT * FROM "legado_system_module_settings";
DROP TABLE "legado_system_module_settings";
CREATE TABLE IF NOT EXISTS "legado_bak_tipo_pacotes" AS SELECT * FROM "legado_tipo_pacotes";
DROP TABLE "legado_tipo_pacotes";
CREATE TABLE IF NOT EXISTS "legado_bak_tipo_produtos" AS SELECT * FROM "legado_tipo_produtos";
DROP TABLE "legado_tipo_produtos";
CREATE TABLE IF NOT EXISTS "legado_bak_todo_categorias" AS SELECT * FROM "legado_todo_categorias";
DROP TABLE "legado_todo_categorias";
CREATE TABLE IF NOT EXISTS "legado_bak_user_convites" AS SELECT * FROM "legado_user_convites";
DROP TABLE "legado_user_convites";
CREATE TABLE IF NOT EXISTS "legado_bak_user_crm_assinaturas" AS SELECT * FROM "legado_user_crm_assinaturas";
DROP TABLE "legado_user_crm_assinaturas";
CREATE TABLE IF NOT EXISTS "legado_bak_user_message_template_themes" AS SELECT * FROM "legado_user_message_template_themes";
DROP TABLE "legado_user_message_template_themes";
CREATE TABLE IF NOT EXISTS "legado_bak_user_message_templates" AS SELECT * FROM "legado_user_message_templates";
DROP TABLE "legado_user_message_templates";
CREATE TABLE IF NOT EXISTS "legado_bak_user_type_default_perms" AS SELECT * FROM "legado_user_type_default_perms";
DROP TABLE "legado_user_type_default_perms";
CREATE TABLE IF NOT EXISTS "legado_bak_user_types" AS SELECT * FROM "legado_user_types";
DROP TABLE "legado_user_types";
CREATE TABLE IF NOT EXISTS "legado_bak_users" AS SELECT * FROM "legado_users";
DROP TABLE "legado_users";
CREATE TABLE IF NOT EXISTS "legado_bak_v_gestor_vendedor_details" AS SELECT * FROM "legado_v_gestor_vendedor_details";
DROP TABLE "legado_v_gestor_vendedor_details";
CREATE TABLE IF NOT EXISTS "legado_bak_v_users_complete" AS SELECT * FROM "legado_v_users_complete";
DROP TABLE "legado_v_users_complete";
CREATE TABLE IF NOT EXISTS "legado_bak_vendas" AS SELECT * FROM "legado_vendas";
DROP TABLE "legado_vendas";
CREATE TABLE IF NOT EXISTS "legado_bak_vendas_pagamentos" AS SELECT * FROM "legado_vendas_pagamentos";
DROP TABLE "legado_vendas_pagamentos";
CREATE TABLE IF NOT EXISTS "legado_bak_vendas_recibos" AS SELECT * FROM "legado_vendas_recibos";
DROP TABLE "legado_vendas_recibos";
CREATE TABLE IF NOT EXISTS "legado_bak_vendas_recibos_complementares" AS SELECT * FROM "legado_vendas_recibos_complementares";
DROP TABLE "legado_vendas_recibos_complementares";
CREATE TABLE IF NOT EXISTS "legado_bak_vendas_recibos_notas" AS SELECT * FROM "legado_vendas_recibos_notas";
DROP TABLE "legado_vendas_recibos_notas";
CREATE TABLE IF NOT EXISTS "legado_bak_vendas_recibos_rateio" AS SELECT * FROM "legado_vendas_recibos_rateio";
DROP TABLE "legado_vendas_recibos_rateio";
CREATE TABLE IF NOT EXISTS "legado_bak_viagem_acompanhantes" AS SELECT * FROM "legado_viagem_acompanhantes";
DROP TABLE "legado_viagem_acompanhantes";
CREATE TABLE IF NOT EXISTS "legado_bak_viagem_documentos" AS SELECT * FROM "legado_viagem_documentos";
DROP TABLE "legado_viagem_documentos";
CREATE TABLE IF NOT EXISTS "legado_bak_viagem_passageiros" AS SELECT * FROM "legado_viagem_passageiros";
DROP TABLE "legado_viagem_passageiros";
CREATE TABLE IF NOT EXISTS "legado_bak_viagem_servicos" AS SELECT * FROM "legado_viagem_servicos";
DROP TABLE "legado_viagem_servicos";
CREATE TABLE IF NOT EXISTS "legado_bak_viagens" AS SELECT * FROM "legado_viagens";
DROP TABLE "legado_viagens";
CREATE TABLE IF NOT EXISTS "legado_bak_voucher_assets" AS SELECT * FROM "legado_voucher_assets";
DROP TABLE "legado_voucher_assets";
CREATE TABLE IF NOT EXISTS "legado_bak_voucher_dias" AS SELECT * FROM "legado_voucher_dias";
DROP TABLE "legado_voucher_dias";
CREATE TABLE IF NOT EXISTS "legado_bak_voucher_hoteis" AS SELECT * FROM "legado_voucher_hoteis";
DROP TABLE "legado_voucher_hoteis";
CREATE TABLE IF NOT EXISTS "legado_bak_vouchers" AS SELECT * FROM "legado_vouchers";
DROP TABLE "legado_vouchers";
CREATE TABLE IF NOT EXISTS "legado_bak_vw_cidades_localizacao" AS SELECT * FROM "legado_vw_cidades_localizacao";
DROP TABLE "legado_vw_cidades_localizacao";
CREATE TABLE IF NOT EXISTS "legado_bak_vw_cidades_localizacao_busca" AS SELECT * FROM "legado_vw_cidades_localizacao_busca";
DROP TABLE "legado_vw_cidades_localizacao_busca";
CREATE TABLE IF NOT EXISTS "legado_bak_vw_produtos_comissionamento" AS SELECT * FROM "legado_vw_produtos_comissionamento";
DROP TABLE "legado_vw_produtos_comissionamento";
CREATE TABLE IF NOT EXISTS "legado_bak_vw_soma_meta_placeholder" AS SELECT * FROM "legado_vw_soma_meta_placeholder";
DROP TABLE "legado_vw_soma_meta_placeholder";

CREATE TABLE "legado_admin_avisos_templates" (
  "id" TEXT PRIMARY KEY,
  "nome" TEXT NOT NULL,
  "assunto" TEXT NOT NULL,
  "mensagem" TEXT NOT NULL,
  "ativo" INTEGER NOT NULL DEFAULT 0,
  "created_at" TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  "updated_at" TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  "sender_key" TEXT NOT NULL
);
INSERT INTO "legado_admin_avisos_templates" ("id", "nome", "assunto", "mensagem", "ativo", "created_at", "updated_at", "sender_key") SELECT "id", "nome", "assunto", "mensagem", "ativo", "created_at", "updated_at", "sender_key" FROM "legado_bak_admin_avisos_templates";
DROP TABLE "legado_bak_admin_avisos_templates";

CREATE TABLE "legado_admin_email_settings" (
  "id" TEXT PRIMARY KEY,
  "singleton" INTEGER NOT NULL DEFAULT 0,
  "smtp_host" TEXT,
  "smtp_port" INTEGER,
  "smtp_secure" INTEGER NOT NULL DEFAULT 0,
  "smtp_user" TEXT,
  "smtp_pass" TEXT,
  "alerta_from_email" TEXT,
  "created_at" TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  "updated_at" TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  "admin_from_email" TEXT,
  "avisos_from_email" TEXT,
  "financeiro_from_email" TEXT,
  "suporte_from_email" TEXT,
  "resend_api_key" TEXT
);
INSERT INTO "legado_admin_email_settings" ("id", "singleton", "smtp_host", "smtp_port", "smtp_secure", "smtp_user", "smtp_pass", "alerta_from_email", "created_at", "updated_at", "admin_from_email", "avisos_from_email", "financeiro_from_email", "suporte_from_email", "resend_api_key") SELECT "id", "singleton", "smtp_host", "smtp_port", "smtp_secure", "smtp_user", "smtp_pass", "alerta_from_email", "created_at", "updated_at", "admin_from_email", "avisos_from_email", "financeiro_from_email", "suporte_from_email", "resend_api_key" FROM "legado_bak_admin_email_settings";
DROP TABLE "legado_bak_admin_email_settings";

CREATE TABLE "legado_airline_iata_codes" (
  "id" TEXT PRIMARY KEY,
  "iata_code" TEXT NOT NULL,
  "airline_name" TEXT NOT NULL,
  "active" INTEGER NOT NULL DEFAULT 0,
  "created_at" TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  "updated_at" TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  UNIQUE ("iata_code")
);
INSERT INTO "legado_airline_iata_codes" ("id", "iata_code", "airline_name", "active", "created_at", "updated_at") SELECT "id", "iata_code", "airline_name", "active", "created_at", "updated_at" FROM "legado_bak_airline_iata_codes";
DROP TABLE "legado_bak_airline_iata_codes";

CREATE TABLE "legado_auth_passkey_challenges" (
  "id" TEXT PRIMARY KEY,
  "user_id" TEXT,
  "type" TEXT NOT NULL,
  "challenge" TEXT NOT NULL,
  "expires_at" TEXT NOT NULL,
  "used_at" TEXT,
  "created_at" TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now'))
);
INSERT INTO "legado_auth_passkey_challenges" ("id", "user_id", "type", "challenge", "expires_at", "used_at", "created_at") SELECT "id", "user_id", "type", "challenge", "expires_at", "used_at", "created_at" FROM "legado_bak_auth_passkey_challenges";
DROP TABLE "legado_bak_auth_passkey_challenges";

CREATE TABLE "legado_auth_passkeys" (
  "id" TEXT PRIMARY KEY,
  "user_id" TEXT NOT NULL,
  "user_email" TEXT NOT NULL,
  "name" TEXT NOT NULL,
  "credential_id" TEXT NOT NULL,
  "public_key" TEXT NOT NULL,
  "counter" INTEGER NOT NULL DEFAULT 0,
  "transports" TEXT NOT NULL,
  "device_type" TEXT,
  "backed_up" INTEGER NOT NULL DEFAULT 0,
  "aaguid" TEXT,
  "origin" TEXT,
  "rp_id" TEXT,
  "last_used_at" TEXT,
  "created_at" TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  "updated_at" TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  UNIQUE ("credential_id")
);
INSERT INTO "legado_auth_passkeys" ("id", "user_id", "user_email", "name", "credential_id", "public_key", "counter", "transports", "device_type", "backed_up", "aaguid", "origin", "rp_id", "last_used_at", "created_at", "updated_at") SELECT "id", "user_id", "user_email", "name", "credential_id", "public_key", "counter", "transports", "device_type", "backed_up", "aaguid", "origin", "rp_id", "last_used_at", "created_at", "updated_at" FROM "legado_bak_auth_passkeys";
DROP TABLE "legado_bak_auth_passkeys";

CREATE TABLE "legado_auth_signup_debug" (
  "id" INTEGER PRIMARY KEY,
  "created_at" TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  "auth_user_id" TEXT,
  "auth_email" TEXT,
  "err" TEXT,
  "detail" TEXT,
  "hint" TEXT,
  "context" TEXT
);
INSERT INTO "legado_auth_signup_debug" ("id", "created_at", "auth_user_id", "auth_email", "err", "detail", "hint", "context") SELECT "id", "created_at", "auth_user_id", "auth_email", "err", "detail", "hint", "context" FROM "legado_bak_auth_signup_debug";
DROP TABLE "legado_bak_auth_signup_debug";

CREATE TABLE "legado_cidades_import_staging" (
  "id" INTEGER PRIMARY KEY,
  "cidade" TEXT NOT NULL,
  "pais" TEXT NOT NULL,
  "created_at" TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now'))
);
INSERT INTO "legado_cidades_import_staging" ("id", "cidade", "pais", "created_at") SELECT "id", "cidade", "pais", "created_at" FROM "legado_bak_cidades_import_staging";
DROP TABLE "legado_bak_cidades_import_staging";

CREATE TABLE "legado_cidades_import_targets" (
  "cidade_key" TEXT,
  "pais_id" TEXT
);
INSERT INTO "legado_cidades_import_targets" ("cidade_key", "pais_id") SELECT "cidade_key", "pais_id" FROM "legado_bak_cidades_import_targets";
DROP TABLE "legado_bak_cidades_import_targets";

CREATE TABLE "legado_cidades_import_targets_norm" (
  "pais_id" TEXT,
  "cidade_key" TEXT
);
INSERT INTO "legado_cidades_import_targets_norm" ("pais_id", "cidade_key") SELECT "pais_id", "cidade_key" FROM "legado_bak_cidades_import_targets_norm";
DROP TABLE "legado_bak_cidades_import_targets_norm";

CREATE TABLE "legado_cidades_norm_cache" (
  "id" TEXT,
  "subdivisao_id" TEXT,
  "pais_id" TEXT,
  "nome_key" TEXT,
  "nome_pt_key" TEXT
);
INSERT INTO "legado_cidades_norm_cache" ("id", "subdivisao_id", "pais_id", "nome_key", "nome_pt_key") SELECT "id", "subdivisao_id", "pais_id", "nome_key", "nome_pt_key" FROM "legado_bak_cidades_norm_cache";
DROP TABLE "legado_bak_cidades_norm_cache";

CREATE TABLE "legado_circuitos" (
  "id" TEXT PRIMARY KEY,
  "nome" TEXT NOT NULL,
  "codigo" TEXT,
  "operador" TEXT,
  "resumo" TEXT,
  "ativo" INTEGER NOT NULL DEFAULT 0,
  "created_at" TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now'))
);
INSERT INTO "legado_circuitos" ("id", "nome", "codigo", "operador", "resumo", "ativo", "created_at") SELECT "id", "nome", "codigo", "operador", "resumo", "ativo", "created_at" FROM "legado_bak_circuitos";
DROP TABLE "legado_bak_circuitos";

CREATE TABLE "legado_comissionamento_geral" (
  "id" TEXT PRIMARY KEY,
  "produto_id" TEXT NOT NULL,
  "meta_nao_atingida" REAL,
  "meta_atingida" REAL,
  "super_meta" REAL,
  "diferenciado" REAL,
  "ativo" INTEGER NOT NULL DEFAULT 0,
  "created_at" TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  "updated_at" TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  UNIQUE ("produto_id")
);
INSERT INTO "legado_comissionamento_geral" ("id", "produto_id", "meta_nao_atingida", "meta_atingida", "super_meta", "diferenciado", "ativo", "created_at", "updated_at") SELECT "id", "produto_id", "meta_nao_atingida", "meta_atingida", "super_meta", "diferenciado", "ativo", "created_at", "updated_at" FROM "legado_bak_comissionamento_geral";
DROP TABLE "legado_bak_comissionamento_geral";

CREATE TABLE "legado_companies" (
  "id" TEXT PRIMARY KEY,
  "nome_empresa" TEXT NOT NULL,
  "nome_fantasia" TEXT NOT NULL,
  "cnpj" TEXT NOT NULL,
  "endereco" TEXT,
  "telefone" TEXT,
  "created_at" TEXT,
  "updated_at" TEXT,
  "cidade" TEXT,
  "estado" TEXT,
  "owner_user_id" TEXT,
  "active" INTEGER NOT NULL DEFAULT 0,
  "logo_url" TEXT,
  UNIQUE ("cnpj")
);
INSERT INTO "legado_companies" ("id", "nome_empresa", "nome_fantasia", "cnpj", "endereco", "telefone", "created_at", "updated_at", "cidade", "estado", "owner_user_id", "active", "logo_url") SELECT "id", "nome_empresa", "nome_fantasia", "cnpj", "endereco", "telefone", "created_at", "updated_at", "cidade", "estado", "owner_user_id", "active", "logo_url" FROM "legado_bak_companies";
DROP TABLE "legado_bak_companies";

CREATE TABLE "legado_crm_message_templates" (
  "id" TEXT PRIMARY KEY,
  "slug" TEXT NOT NULL,
  "title" TEXT NOT NULL,
  "category" TEXT NOT NULL,
  "description" TEXT,
  "subject_type" TEXT NOT NULL,
  "message_template" TEXT NOT NULL,
  "theme_key" TEXT NOT NULL,
  "layout_key" TEXT NOT NULL,
  "logo_position" TEXT NOT NULL,
  "is_active" INTEGER NOT NULL DEFAULT 0,
  "sort_order" INTEGER NOT NULL DEFAULT 0,
  "created_at" TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  "updated_at" TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  UNIQUE ("slug")
);
INSERT INTO "legado_crm_message_templates" ("id", "slug", "title", "category", "description", "subject_type", "message_template", "theme_key", "layout_key", "logo_position", "is_active", "sort_order", "created_at", "updated_at") SELECT "id", "slug", "title", "category", "description", "subject_type", "message_template", "theme_key", "layout_key", "logo_position", "is_active", "sort_order", "created_at", "updated_at" FROM "legado_bak_crm_message_templates";
DROP TABLE "legado_bak_crm_message_templates";

CREATE TABLE "legado_crm_template_categories" (
  "id" TEXT PRIMARY KEY,
  "nome" TEXT NOT NULL,
  "descricao" TEXT,
  "icone" TEXT NOT NULL,
  "sort_order" INTEGER NOT NULL DEFAULT 0,
  "ativo" INTEGER NOT NULL DEFAULT 0,
  "created_at" TEXT,
  "updated_at" TEXT
);
INSERT INTO "legado_crm_template_categories" ("id", "nome", "descricao", "icone", "sort_order", "ativo", "created_at", "updated_at") SELECT "id", "nome", "descricao", "icone", "sort_order", "ativo", "created_at", "updated_at" FROM "legado_bak_crm_template_categories";
DROP TABLE "legado_bak_crm_template_categories";

CREATE TABLE "legado_estados" (
  "id" TEXT PRIMARY KEY,
  "nome" TEXT NOT NULL,
  "pais_id" TEXT NOT NULL,
  "created_at" TEXT,
  "updated_at" TEXT
);
INSERT INTO "legado_estados" ("id", "nome", "pais_id", "created_at", "updated_at") SELECT "id", "nome", "pais_id", "created_at", "updated_at" FROM "legado_bak_estados";
DROP TABLE "legado_bak_estados";

CREATE TABLE "legado_feriados" (
  "id" TEXT PRIMARY KEY,
  "company_id" TEXT NOT NULL,
  "data" TEXT NOT NULL,
  "nome" TEXT NOT NULL,
  "tipo" TEXT NOT NULL,
  "estado" TEXT,
  "cidade" TEXT,
  "created_at" TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  "updated_at" TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  UNIQUE ("company_id", "data", "nome"),
  CONSTRAINT "feriados_company_id_fkey" FOREIGN KEY ("company_id") REFERENCES "legado_companies" ("id") ON DELETE CASCADE
);
INSERT INTO "legado_feriados" ("id", "company_id", "data", "nome", "tipo", "estado", "cidade", "created_at", "updated_at") SELECT "id", "company_id", "data", "nome", "tipo", "estado", "cidade", "created_at", "updated_at" FROM "legado_bak_feriados";
DROP TABLE "legado_bak_feriados";

CREATE TABLE "legado_formas_pagamento" (
  "id" TEXT PRIMARY KEY,
  "company_id" TEXT NOT NULL,
  "nome" TEXT NOT NULL,
  "descricao" TEXT,
  "paga_comissao" INTEGER NOT NULL DEFAULT 0,
  "permite_desconto" INTEGER NOT NULL DEFAULT 0,
  "desconto_padrao_pct" REAL,
  "ativo" INTEGER NOT NULL DEFAULT 0,
  "created_at" TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  "updated_at" TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  CONSTRAINT "formas_pagamento_company_id_fkey" FOREIGN KEY ("company_id") REFERENCES "legado_companies" ("id") ON DELETE NO ACTION
);
INSERT INTO "legado_formas_pagamento" ("id", "company_id", "nome", "descricao", "paga_comissao", "permite_desconto", "desconto_padrao_pct", "ativo", "created_at", "updated_at") SELECT "id", "company_id", "nome", "descricao", "paga_comissao", "permite_desconto", "desconto_padrao_pct", "ativo", "created_at", "updated_at" FROM "legado_bak_formas_pagamento";
DROP TABLE "legado_bak_formas_pagamento";

CREATE TABLE "legado_fornecedores" (
  "id" TEXT PRIMARY KEY,
  "company_id" TEXT NOT NULL,
  "localizacao" TEXT NOT NULL,
  "nome_completo" TEXT NOT NULL,
  "nome_fantasia" TEXT,
  "cnpj" TEXT,
  "cep" TEXT,
  "cidade" TEXT,
  "estado" TEXT,
  "telefone" TEXT,
  "whatsapp" TEXT,
  "telefone_emergencia" TEXT,
  "responsavel" TEXT,
  "tipo_faturamento" TEXT NOT NULL,
  "principais_servicos" TEXT,
  "created_at" TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  "updated_at" TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  CONSTRAINT "fornecedores_company_id_fkey" FOREIGN KEY ("company_id") REFERENCES "legado_companies" ("id") ON DELETE NO ACTION
);
INSERT INTO "legado_fornecedores" ("id", "company_id", "localizacao", "nome_completo", "nome_fantasia", "cnpj", "cep", "cidade", "estado", "telefone", "whatsapp", "telefone_emergencia", "responsavel", "tipo_faturamento", "principais_servicos", "created_at", "updated_at") SELECT "id", "company_id", "localizacao", "nome_completo", "nome_fantasia", "cnpj", "cep", "cidade", "estado", "telefone", "whatsapp", "telefone_emergencia", "responsavel", "tipo_faturamento", "principais_servicos", "created_at", "updated_at" FROM "legado_bak_fornecedores";
DROP TABLE "legado_bak_fornecedores";

CREATE TABLE "legado_inquiry" (
  "id" TEXT PRIMARY KEY,
  "origin" TEXT NOT NULL,
  "client_id" TEXT,
  "assigned_seller_id" TEXT,
  "country_id" TEXT,
  "city_id" TEXT,
  "destination_id" TEXT,
  "checkin" TEXT,
  "checkout" TEXT,
  "adults" INTEGER NOT NULL DEFAULT 0,
  "children" INTEGER NOT NULL DEFAULT 0,
  "currency_preference" TEXT NOT NULL,
  "status" TEXT NOT NULL,
  "notes" TEXT,
  "assigned_at" TEXT,
  "created_at" TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  "updated_at" TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now'))
);
INSERT INTO "legado_inquiry" ("id", "origin", "client_id", "assigned_seller_id", "country_id", "city_id", "destination_id", "checkin", "checkout", "adults", "children", "currency_preference", "status", "notes", "assigned_at", "created_at", "updated_at") SELECT "id", "origin", "client_id", "assigned_seller_id", "country_id", "city_id", "destination_id", "checkin", "checkout", "adults", "children", "currency_preference", "status", "notes", "assigned_at", "created_at", "updated_at" FROM "legado_bak_inquiry";
DROP TABLE "legado_bak_inquiry";

CREATE TABLE "legado_inquiry_preference" (
  "id" TEXT PRIMARY KEY,
  "inquiry_id" TEXT NOT NULL,
  "preference_key" TEXT NOT NULL,
  "preference_value" TEXT NOT NULL,
  CONSTRAINT "inquiry_preference_inquiry_id_fkey" FOREIGN KEY ("inquiry_id") REFERENCES "legado_inquiry" ("id") ON DELETE CASCADE
);
INSERT INTO "legado_inquiry_preference" ("id", "inquiry_id", "preference_key", "preference_value") SELECT "id", "inquiry_id", "preference_key", "preference_value" FROM "legado_bak_inquiry_preference";
DROP TABLE "legado_bak_inquiry_preference";

CREATE TABLE "legado_lgpd_atividades_tratamento" (
  "id" TEXT PRIMARY KEY,
  "nome" TEXT NOT NULL,
  "finalidade" TEXT NOT NULL,
  "base_legal" TEXT NOT NULL,
  "dados_tratados" TEXT NOT NULL,
  "titulares" TEXT NOT NULL,
  "compartilhamento" TEXT,
  "retencao_meses" INTEGER,
  "medidas_seguranca" TEXT,
  "ativo" INTEGER NOT NULL DEFAULT 0,
  "created_at" TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  "updated_at" TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now'))
);
INSERT INTO "legado_lgpd_atividades_tratamento" ("id", "nome", "finalidade", "base_legal", "dados_tratados", "titulares", "compartilhamento", "retencao_meses", "medidas_seguranca", "ativo", "created_at", "updated_at") SELECT "id", "nome", "finalidade", "base_legal", "dados_tratados", "titulares", "compartilhamento", "retencao_meses", "medidas_seguranca", "ativo", "created_at", "updated_at" FROM "legado_bak_lgpd_atividades_tratamento";
DROP TABLE "legado_bak_lgpd_atividades_tratamento";

CREATE TABLE "legado_lgpd_consentimentos" (
  "id" TEXT PRIMARY KEY,
  "cliente_id" TEXT,
  "titular_email" TEXT,
  "titular_cpf" TEXT,
  "finalidade" TEXT NOT NULL,
  "consentido" INTEGER NOT NULL DEFAULT 0,
  "origem" TEXT NOT NULL,
  "ip_origem" TEXT,
  "user_agent" TEXT,
  "versao_politica" TEXT,
  "revogado_em" TEXT,
  "revogado_motivo" TEXT,
  "created_at" TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  "updated_at" TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now'))
);
INSERT INTO "legado_lgpd_consentimentos" ("id", "cliente_id", "titular_email", "titular_cpf", "finalidade", "consentido", "origem", "ip_origem", "user_agent", "versao_politica", "revogado_em", "revogado_motivo", "created_at", "updated_at") SELECT "id", "cliente_id", "titular_email", "titular_cpf", "finalidade", "consentido", "origem", "ip_origem", "user_agent", "versao_politica", "revogado_em", "revogado_motivo", "created_at", "updated_at" FROM "legado_bak_lgpd_consentimentos";
DROP TABLE "legado_bak_lgpd_consentimentos";

CREATE TABLE "legado_lgpd_solicitacoes" (
  "id" TEXT PRIMARY KEY,
  "tipo" TEXT NOT NULL,
  "titular_nome" TEXT NOT NULL,
  "titular_email" TEXT NOT NULL,
  "titular_cpf" TEXT,
  "company_id" TEXT,
  "cliente_id" TEXT,
  "user_id" TEXT,
  "descricao" TEXT NOT NULL,
  "status" TEXT NOT NULL,
  "resposta" TEXT,
  "respondido_por" TEXT,
  "respondido_em" TEXT,
  "prazo_legal" TEXT NOT NULL,
  "ip_origem" TEXT,
  "user_agent" TEXT,
  "created_at" TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  "updated_at" TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now'))
);
INSERT INTO "legado_lgpd_solicitacoes" ("id", "tipo", "titular_nome", "titular_email", "titular_cpf", "company_id", "cliente_id", "user_id", "descricao", "status", "resposta", "respondido_por", "respondido_em", "prazo_legal", "ip_origem", "user_agent", "created_at", "updated_at") SELECT "id", "tipo", "titular_nome", "titular_email", "titular_cpf", "company_id", "cliente_id", "user_id", "descricao", "status", "resposta", "respondido_por", "respondido_em", "prazo_legal", "ip_origem", "user_agent", "created_at", "updated_at" FROM "legado_bak_lgpd_solicitacoes";
DROP TABLE "legado_bak_lgpd_solicitacoes";

CREATE TABLE "legado_metas_vendedor" (
  "id" TEXT PRIMARY KEY,
  "vendedor_id" TEXT NOT NULL,
  "periodo" TEXT NOT NULL,
  "meta_geral" REAL NOT NULL DEFAULT 0,
  "meta_diferenciada" REAL NOT NULL DEFAULT 0,
  "ativo" INTEGER NOT NULL DEFAULT 0,
  "created_at" TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  "updated_at" TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  "template_id" TEXT,
  "scope" TEXT NOT NULL,
  UNIQUE ("vendedor_id", "periodo", "scope")
);
INSERT INTO "legado_metas_vendedor" ("id", "vendedor_id", "periodo", "meta_geral", "meta_diferenciada", "ativo", "created_at", "updated_at", "template_id", "scope") SELECT "id", "vendedor_id", "periodo", "meta_geral", "meta_diferenciada", "ativo", "created_at", "updated_at", "template_id", "scope" FROM "legado_bak_metas_vendedor";
DROP TABLE "legado_bak_metas_vendedor";

CREATE TABLE "legado_modulo_acesso_backup" (
  "id" TEXT,
  "usuario_id" TEXT,
  "modulo" TEXT,
  "permissao" TEXT,
  "ativo" INTEGER,
  "created_at" TEXT,
  "updated_at" TEXT
);
INSERT INTO "legado_modulo_acesso_backup" ("id", "usuario_id", "modulo", "permissao", "ativo", "created_at", "updated_at") SELECT "id", "usuario_id", "modulo", "permissao", "ativo", "created_at", "updated_at" FROM "legado_bak_modulo_acesso_backup";
DROP TABLE "legado_bak_modulo_acesso_backup";

CREATE TABLE "legado_paises" (
  "id" TEXT PRIMARY KEY,
  "nome" TEXT NOT NULL,
  "codigo_iso" TEXT NOT NULL,
  "continente" TEXT,
  "created_at" TEXT,
  UNIQUE ("codigo_iso")
);
INSERT INTO "legado_paises" ("id", "nome", "codigo_iso", "continente", "created_at") SELECT "id", "nome", "codigo_iso", "continente", "created_at" FROM "legado_bak_paises";
DROP TABLE "legado_bak_paises";

CREATE TABLE "legado_parametros_sistema" (
  "id" TEXT PRIMARY KEY,
  "company_id" TEXT,
  "usar_taxas_na_meta" INTEGER NOT NULL DEFAULT 0,
  "foco_valor" TEXT NOT NULL,
  "modo_corporativo" INTEGER NOT NULL DEFAULT 0,
  "politica_cancelamento" TEXT NOT NULL,
  "created_at" TEXT,
  "updated_at" TEXT,
  UNIQUE ("company_id"),
  CONSTRAINT "parametros_sistema_company_id_fkey" FOREIGN KEY ("company_id") REFERENCES "legado_companies" ("id") ON DELETE NO ACTION
);
INSERT INTO "legado_parametros_sistema" ("id", "company_id", "usar_taxas_na_meta", "foco_valor", "modo_corporativo", "politica_cancelamento", "created_at", "updated_at") SELECT "id", "company_id", "usar_taxas_na_meta", "foco_valor", "modo_corporativo", "politica_cancelamento", "created_at", "updated_at" FROM "legado_bak_parametros_sistema";
DROP TABLE "legado_bak_parametros_sistema";

CREATE TABLE "legado_plans" (
  "id" TEXT PRIMARY KEY,
  "nome" TEXT NOT NULL,
  "descricao" TEXT,
  "valor_mensal" REAL NOT NULL DEFAULT 0,
  "moeda" TEXT NOT NULL,
  "ativo" INTEGER NOT NULL DEFAULT 0,
  "created_at" TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  "updated_at" TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now'))
);
INSERT INTO "legado_plans" ("id", "nome", "descricao", "valor_mensal", "moeda", "ativo", "created_at", "updated_at") SELECT "id", "nome", "descricao", "valor_mensal", "moeda", "ativo", "created_at", "updated_at" FROM "legado_bak_plans";
DROP TABLE "legado_bak_plans";

CREATE TABLE "legado_ranking_read_model_status" (
  "id" TEXT PRIMARY KEY,
  "modelo" TEXT NOT NULL,
  "company_id" TEXT NOT NULL,
  "mes" TEXT NOT NULL,
  "status" TEXT NOT NULL,
  "dirty_at" TEXT,
  "rebuilt_at" TEXT,
  "last_error" TEXT,
  "created_at" TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  "updated_at" TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  UNIQUE ("modelo", "company_id", "mes"),
  CONSTRAINT "ranking_read_model_status_company_id_fkey" FOREIGN KEY ("company_id") REFERENCES "legado_companies" ("id") ON DELETE CASCADE
);
INSERT INTO "legado_ranking_read_model_status" ("id", "modelo", "company_id", "mes", "status", "dirty_at", "rebuilt_at", "last_error", "created_at", "updated_at") SELECT "id", "modelo", "company_id", "mes", "status", "dirty_at", "rebuilt_at", "last_error", "created_at", "updated_at" FROM "legado_bak_ranking_read_model_status";
DROP TABLE "legado_bak_ranking_read_model_status";

CREATE TABLE "legado_roteiro_personalizado" (
  "id" TEXT PRIMARY KEY,
  "created_by" TEXT NOT NULL,
  "company_id" TEXT,
  "nome" TEXT NOT NULL,
  "duracao" INTEGER,
  "inicio_cidade" TEXT,
  "fim_cidade" TEXT,
  "created_at" TEXT,
  "updated_at" TEXT,
  "inclui_texto" TEXT,
  "nao_inclui_texto" TEXT,
  "informacoes_importantes" TEXT,
  "mostrar_pagamento_pdf" INTEGER NOT NULL DEFAULT 0,
  "mostrar_informacoes_pdf" INTEGER NOT NULL DEFAULT 0,
  "mostrar_rodape_pdf" INTEGER NOT NULL DEFAULT 0,
  "opcionais" TEXT NOT NULL,
  CONSTRAINT "roteiro_personalizado_company_id_fkey" FOREIGN KEY ("company_id") REFERENCES "legado_companies" ("id") ON DELETE CASCADE
);
INSERT INTO "legado_roteiro_personalizado" ("id", "created_by", "company_id", "nome", "duracao", "inicio_cidade", "fim_cidade", "created_at", "updated_at", "inclui_texto", "nao_inclui_texto", "informacoes_importantes", "mostrar_pagamento_pdf", "mostrar_informacoes_pdf", "mostrar_rodape_pdf", "opcionais") SELECT "id", "created_by", "company_id", "nome", "duracao", "inicio_cidade", "fim_cidade", "created_at", "updated_at", "inclui_texto", "nao_inclui_texto", "informacoes_importantes", "mostrar_pagamento_pdf", "mostrar_informacoes_pdf", "mostrar_rodape_pdf", "opcionais" FROM "legado_bak_roteiro_personalizado";
DROP TABLE "legado_bak_roteiro_personalizado";

CREATE TABLE "legado_roteiro_sugestoes" (
  "id" TEXT PRIMARY KEY,
  "company_id" TEXT,
  "tipo" TEXT NOT NULL,
  "valor" TEXT NOT NULL,
  "uso_count" INTEGER,
  "created_at" TEXT,
  "updated_at" TEXT,
  UNIQUE ("company_id", "tipo", "valor"),
  CONSTRAINT "roteiro_sugestoes_company_id_fkey" FOREIGN KEY ("company_id") REFERENCES "legado_companies" ("id") ON DELETE CASCADE
);
INSERT INTO "legado_roteiro_sugestoes" ("id", "company_id", "tipo", "valor", "uso_count", "created_at", "updated_at") SELECT "id", "company_id", "tipo", "valor", "uso_count", "created_at", "updated_at" FROM "legado_bak_roteiro_sugestoes";
DROP TABLE "legado_bak_roteiro_sugestoes";

CREATE TABLE "legado_roteiro_transporte" (
  "id" TEXT PRIMARY KEY,
  "roteiro_id" TEXT NOT NULL,
  "tipo" TEXT,
  "fornecedor" TEXT,
  "descricao" TEXT,
  "data_inicio" TEXT,
  "data_fim" TEXT,
  "categoria" TEXT,
  "observacao" TEXT,
  "ordem" INTEGER,
  "trecho" TEXT,
  "cia_aerea" TEXT,
  "data_voo" TEXT,
  "classe_reserva" TEXT,
  "hora_saida" TEXT,
  "aeroporto_saida" TEXT,
  "duracao_voo" TEXT,
  "tipo_voo" TEXT,
  "hora_chegada" TEXT,
  "aeroporto_chegada" TEXT,
  "tarifa_nome" TEXT,
  "reembolso_tipo" TEXT,
  "qtd_adultos" INTEGER,
  "qtd_criancas" INTEGER,
  "valor_total" REAL,
  "taxas" REAL,
  CONSTRAINT "roteiro_transporte_roteiro_id_fkey" FOREIGN KEY ("roteiro_id") REFERENCES "legado_roteiro_personalizado" ("id") ON DELETE CASCADE
);
INSERT INTO "legado_roteiro_transporte" ("id", "roteiro_id", "tipo", "fornecedor", "descricao", "data_inicio", "data_fim", "categoria", "observacao", "ordem", "trecho", "cia_aerea", "data_voo", "classe_reserva", "hora_saida", "aeroporto_saida", "duracao_voo", "tipo_voo", "hora_chegada", "aeroporto_chegada", "tarifa_nome", "reembolso_tipo", "qtd_adultos", "qtd_criancas", "valor_total", "taxas") SELECT "id", "roteiro_id", "tipo", "fornecedor", "descricao", "data_inicio", "data_fim", "categoria", "observacao", "ordem", "trecho", "cia_aerea", "data_voo", "classe_reserva", "hora_saida", "aeroporto_saida", "duracao_voo", "tipo_voo", "hora_chegada", "aeroporto_chegada", "tarifa_nome", "reembolso_tipo", "qtd_adultos", "qtd_criancas", "valor_total", "taxas" FROM "legado_bak_roteiro_transporte";
DROP TABLE "legado_bak_roteiro_transporte";

CREATE TABLE "legado_security_audit_weekly_runs" (
  "id" TEXT PRIMARY KEY,
  "ran_at" TEXT NOT NULL,
  "status" TEXT NOT NULL,
  "missing_policy_count" INTEGER NOT NULL DEFAULT 0,
  "broad_policy_count" INTEGER NOT NULL DEFAULT 0,
  "overlapping_table_count" INTEGER NOT NULL DEFAULT 0,
  "unforced_critical_count" INTEGER NOT NULL DEFAULT 0,
  "pagamentos_company_mismatch" INTEGER NOT NULL DEFAULT 0,
  "bucket_public" INTEGER NOT NULL DEFAULT 0,
  "details" TEXT NOT NULL
);
INSERT INTO "legado_security_audit_weekly_runs" ("id", "ran_at", "status", "missing_policy_count", "broad_policy_count", "overlapping_table_count", "unforced_critical_count", "pagamentos_company_mismatch", "bucket_public", "details") SELECT "id", "ran_at", "status", "missing_policy_count", "broad_policy_count", "overlapping_table_count", "unforced_critical_count", "pagamentos_company_mismatch", "bucket_public", "details" FROM "legado_bak_security_audit_weekly_runs";
DROP TABLE "legado_bak_security_audit_weekly_runs";

CREATE TABLE "legado_security_rate_limits" (
  "scope" TEXT NOT NULL,
  "key_hash" TEXT NOT NULL,
  "window_start" TEXT NOT NULL,
  "expires_at" TEXT NOT NULL,
  "hits" INTEGER NOT NULL DEFAULT 0,
  PRIMARY KEY ("scope", "key_hash")
);
INSERT INTO "legado_security_rate_limits" ("scope", "key_hash", "window_start", "expires_at", "hits") SELECT "scope", "key_hash", "window_start", "expires_at", "hits" FROM "legado_bak_security_rate_limits";
DROP TABLE "legado_bak_security_rate_limits";

CREATE TABLE "legado_servicos" (
  "id" TEXT PRIMARY KEY,
  "nome" TEXT NOT NULL,
  "tipo" TEXT NOT NULL,
  "descricao" TEXT,
  "ativo" INTEGER NOT NULL DEFAULT 0,
  "created_at" TEXT,
  "updated_at" TEXT
);
INSERT INTO "legado_servicos" ("id", "nome", "tipo", "descricao", "ativo", "created_at", "updated_at") SELECT "id", "nome", "tipo", "descricao", "ativo", "created_at", "updated_at" FROM "legado_bak_servicos";
DROP TABLE "legado_bak_servicos";

CREATE TABLE "legado_servicos_fornecedor" (
  "id" TEXT PRIMARY KEY,
  "fornecedor_id" TEXT NOT NULL,
  "nome" TEXT NOT NULL,
  "tipo" TEXT NOT NULL,
  "descricao" TEXT,
  "ativo" INTEGER NOT NULL DEFAULT 0,
  "created_at" TEXT,
  "updated_at" TEXT,
  CONSTRAINT "servicos_fornecedor_fornecedor_id_fkey" FOREIGN KEY ("fornecedor_id") REFERENCES "legado_fornecedores" ("id") ON DELETE NO ACTION
);
INSERT INTO "legado_servicos_fornecedor" ("id", "fornecedor_id", "nome", "tipo", "descricao", "ativo", "created_at", "updated_at") SELECT "id", "fornecedor_id", "nome", "tipo", "descricao", "ativo", "created_at", "updated_at" FROM "legado_bak_servicos_fornecedor";
DROP TABLE "legado_bak_servicos_fornecedor";

CREATE TABLE "legado_subdivisoes" (
  "id" TEXT PRIMARY KEY,
  "pais_id" TEXT NOT NULL,
  "codigo_admin1" TEXT NOT NULL,
  "nome" TEXT NOT NULL,
  "tipo" TEXT,
  "created_at" TEXT,
  UNIQUE ("pais_id", "codigo_admin1"),
  CONSTRAINT "subdivisoes_pais_id_fkey" FOREIGN KEY ("pais_id") REFERENCES "legado_paises" ("id") ON DELETE CASCADE
);
INSERT INTO "legado_subdivisoes" ("id", "pais_id", "codigo_admin1", "nome", "tipo", "created_at") SELECT "id", "pais_id", "codigo_admin1", "nome", "tipo", "created_at" FROM "legado_bak_subdivisoes";
DROP TABLE "legado_bak_subdivisoes";

CREATE TABLE "legado_tipo_produtos" (
  "id" TEXT PRIMARY KEY,
  "tipo" TEXT NOT NULL,
  "regra_comissionamento" TEXT NOT NULL,
  "soma_na_meta" INTEGER NOT NULL DEFAULT 0,
  "ativo" INTEGER NOT NULL DEFAULT 0,
  "created_at" TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  "updated_at" TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  "nome" TEXT,
  "usa_meta_produto" INTEGER NOT NULL DEFAULT 0,
  "meta_produto_valor" REAL,
  "comissao_produto_meta_pct" REAL,
  "descontar_meta_geral" INTEGER NOT NULL DEFAULT 0,
  "exibe_kpi_comissao" INTEGER NOT NULL DEFAULT 0
);
INSERT INTO "legado_tipo_produtos" ("id", "tipo", "regra_comissionamento", "soma_na_meta", "ativo", "created_at", "updated_at", "nome", "usa_meta_produto", "meta_produto_valor", "comissao_produto_meta_pct", "descontar_meta_geral", "exibe_kpi_comissao") SELECT "id", "tipo", "regra_comissionamento", "soma_na_meta", "ativo", "created_at", "updated_at", "nome", "usa_meta_produto", "meta_produto_valor", "comissao_produto_meta_pct", "descontar_meta_geral", "exibe_kpi_comissao" FROM "legado_bak_tipo_produtos";
DROP TABLE "legado_bak_tipo_produtos";

CREATE TABLE "legado_todo_categorias" (
  "id" TEXT PRIMARY KEY,
  "company_id" TEXT,
  "user_id" TEXT,
  "nome" TEXT NOT NULL,
  "cor" TEXT NOT NULL,
  "created_at" TEXT,
  "updated_at" TEXT
);
INSERT INTO "legado_todo_categorias" ("id", "company_id", "user_id", "nome", "cor", "created_at", "updated_at") SELECT "id", "company_id", "user_id", "nome", "cor", "created_at", "updated_at" FROM "legado_bak_todo_categorias";
DROP TABLE "legado_bak_todo_categorias";

CREATE TABLE "legado_user_crm_assinaturas" (
  "id" TEXT PRIMARY KEY,
  "user_id" TEXT NOT NULL,
  "company_id" TEXT,
  "nome" TEXT NOT NULL,
  "linha1" TEXT,
  "linha1_font_size" INTEGER NOT NULL DEFAULT 0,
  "linha1_italic" INTEGER NOT NULL DEFAULT 0,
  "linha2" TEXT,
  "linha2_font_size" INTEGER NOT NULL DEFAULT 0,
  "linha2_italic" INTEGER NOT NULL DEFAULT 0,
  "linha3" TEXT,
  "linha3_font_size" INTEGER NOT NULL DEFAULT 0,
  "linha3_italic" INTEGER NOT NULL DEFAULT 0,
  "is_default" INTEGER NOT NULL DEFAULT 0,
  "created_at" TEXT,
  "updated_at" TEXT,
  CONSTRAINT "user_crm_assinaturas_company_id_fkey" FOREIGN KEY ("company_id") REFERENCES "legado_companies" ("id") ON DELETE NO ACTION
);
INSERT INTO "legado_user_crm_assinaturas" ("id", "user_id", "company_id", "nome", "linha1", "linha1_font_size", "linha1_italic", "linha2", "linha2_font_size", "linha2_italic", "linha3", "linha3_font_size", "linha3_italic", "is_default", "created_at", "updated_at") SELECT "id", "user_id", "company_id", "nome", "linha1", "linha1_font_size", "linha1_italic", "linha2", "linha2_font_size", "linha2_italic", "linha3", "linha3_font_size", "linha3_italic", "is_default", "created_at", "updated_at" FROM "legado_bak_user_crm_assinaturas";
DROP TABLE "legado_bak_user_crm_assinaturas";

CREATE TABLE "legado_user_types" (
  "id" TEXT PRIMARY KEY,
  "name" TEXT NOT NULL,
  "description" TEXT,
  "created_at" TEXT,
  UNIQUE ("name")
);
INSERT INTO "legado_user_types" ("id", "name", "description", "created_at") SELECT "id", "name", "description", "created_at" FROM "legado_bak_user_types";
DROP TABLE "legado_bak_user_types";

CREATE TABLE "legado_users" (
  "id" TEXT PRIMARY KEY,
  "nome_completo" TEXT,
  "cpf" TEXT,
  "data_nascimento" TEXT,
  "telefone" TEXT,
  "cidade" TEXT,
  "estado" TEXT,
  "user_type_id" TEXT,
  "uso_individual" INTEGER,
  "company_id" TEXT,
  "created_at" TEXT,
  "updated_at" TEXT,
  "active" INTEGER NOT NULL DEFAULT 0,
  "email" TEXT,
  "rg" TEXT,
  "whatsapp" TEXT,
  "cep" TEXT,
  "endereco" TEXT,
  "numero" TEXT,
  "complemento" TEXT,
  "created_by_gestor" INTEGER NOT NULL DEFAULT 0,
  "welcome_email_sent" INTEGER NOT NULL DEFAULT 0,
  "participa_ranking" INTEGER NOT NULL DEFAULT 0,
  "must_change_password" INTEGER NOT NULL DEFAULT 0,
  "password_changed_at" TEXT,
  "avatar_url" TEXT,
  UNIQUE ("cpf"),
  UNIQUE ("email"),
  CONSTRAINT "users_company_id_fkey" FOREIGN KEY ("company_id") REFERENCES "legado_companies" ("id") ON DELETE SET NULL,
  CONSTRAINT "users_user_type_id_fkey" FOREIGN KEY ("user_type_id") REFERENCES "legado_user_types" ("id") ON DELETE NO ACTION
);
INSERT INTO "legado_users" ("id", "nome_completo", "cpf", "data_nascimento", "telefone", "cidade", "estado", "user_type_id", "uso_individual", "company_id", "created_at", "updated_at", "active", "email", "rg", "whatsapp", "cep", "endereco", "numero", "complemento", "created_by_gestor", "welcome_email_sent", "participa_ranking", "must_change_password", "password_changed_at", "avatar_url") SELECT "id", "nome_completo", "cpf", "data_nascimento", "telefone", "cidade", "estado", "user_type_id", "uso_individual", "company_id", "created_at", "updated_at", "active", "email", "rg", "whatsapp", "cep", "endereco", "numero", "complemento", "created_by_gestor", "welcome_email_sent", "participa_ranking", "must_change_password", "password_changed_at", "avatar_url" FROM "legado_bak_users";
DROP TABLE "legado_bak_users";

CREATE TABLE "legado_v_gestor_vendedor_details" (
  "id" TEXT,
  "gestor_nome" TEXT,
  "gestor_cpf" TEXT,
  "vendedor_nome" TEXT,
  "vendedor_cpf" TEXT,
  "company_name" TEXT,
  "pode_modificar" INTEGER,
  "created_at" TEXT
);
INSERT INTO "legado_v_gestor_vendedor_details" ("id", "gestor_nome", "gestor_cpf", "vendedor_nome", "vendedor_cpf", "company_name", "pode_modificar", "created_at") SELECT "id", "gestor_nome", "gestor_cpf", "vendedor_nome", "vendedor_cpf", "company_name", "pode_modificar", "created_at" FROM "legado_bak_v_gestor_vendedor_details";
DROP TABLE "legado_bak_v_gestor_vendedor_details";

CREATE TABLE "legado_v_users_complete" (
  "id" TEXT,
  "nome_completo" TEXT,
  "cpf" TEXT,
  "data_nascimento" TEXT,
  "telefone" TEXT,
  "cidade" TEXT,
  "estado" TEXT,
  "user_type" TEXT,
  "user_type_description" TEXT,
  "uso_individual" INTEGER,
  "company_name" TEXT,
  "company_cnpj" TEXT,
  "created_at" TEXT,
  "updated_at" TEXT
);
INSERT INTO "legado_v_users_complete" ("id", "nome_completo", "cpf", "data_nascimento", "telefone", "cidade", "estado", "user_type", "user_type_description", "uso_individual", "company_name", "company_cnpj", "created_at", "updated_at") SELECT "id", "nome_completo", "cpf", "data_nascimento", "telefone", "cidade", "estado", "user_type", "user_type_description", "uso_individual", "company_name", "company_cnpj", "created_at", "updated_at" FROM "legado_bak_v_users_complete";
DROP TABLE "legado_bak_v_users_complete";

CREATE TABLE "legado_voucher_assets" (
  "id" TEXT PRIMARY KEY,
  "company_id" TEXT NOT NULL,
  "created_by" TEXT,
  "updated_by" TEXT,
  "provider" TEXT NOT NULL,
  "asset_kind" TEXT NOT NULL,
  "label" TEXT,
  "storage_bucket" TEXT NOT NULL,
  "storage_path" TEXT NOT NULL,
  "mime_type" TEXT,
  "size_bytes" INTEGER,
  "ativo" INTEGER NOT NULL DEFAULT 0,
  "ordem" INTEGER NOT NULL DEFAULT 0,
  "created_at" TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  "updated_at" TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  CONSTRAINT "voucher_assets_company_id_fkey" FOREIGN KEY ("company_id") REFERENCES "legado_companies" ("id") ON DELETE CASCADE,
  CONSTRAINT "voucher_assets_created_by_fkey" FOREIGN KEY ("created_by") REFERENCES "legado_users" ("id") ON DELETE SET NULL,
  CONSTRAINT "voucher_assets_updated_by_fkey" FOREIGN KEY ("updated_by") REFERENCES "legado_users" ("id") ON DELETE SET NULL
);
INSERT INTO "legado_voucher_assets" ("id", "company_id", "created_by", "updated_by", "provider", "asset_kind", "label", "storage_bucket", "storage_path", "mime_type", "size_bytes", "ativo", "ordem", "created_at", "updated_at") SELECT "id", "company_id", "created_by", "updated_by", "provider", "asset_kind", "label", "storage_bucket", "storage_path", "mime_type", "size_bytes", "ativo", "ordem", "created_at", "updated_at" FROM "legado_bak_voucher_assets";
DROP TABLE "legado_bak_voucher_assets";

CREATE TABLE "legado_vw_cidades_localizacao" (
  "cidade_id" TEXT,
  "cidade_nome" TEXT,
  "subdivisao_id" TEXT,
  "subdivisao_nome" TEXT,
  "subdivisao_codigo" TEXT,
  "subdivisao_tipo" TEXT,
  "pais_id" TEXT,
  "pais_nome" TEXT,
  "pais_codigo_iso" TEXT,
  "continente" TEXT,
  "latitude" REAL,
  "longitude" REAL,
  "populacao" INTEGER,
  "descricao" TEXT,
  "created_at" TEXT
);
INSERT INTO "legado_vw_cidades_localizacao" ("cidade_id", "cidade_nome", "subdivisao_id", "subdivisao_nome", "subdivisao_codigo", "subdivisao_tipo", "pais_id", "pais_nome", "pais_codigo_iso", "continente", "latitude", "longitude", "populacao", "descricao", "created_at") SELECT "cidade_id", "cidade_nome", "subdivisao_id", "subdivisao_nome", "subdivisao_codigo", "subdivisao_tipo", "pais_id", "pais_nome", "pais_codigo_iso", "continente", "latitude", "longitude", "populacao", "descricao", "created_at" FROM "legado_bak_vw_cidades_localizacao";
DROP TABLE "legado_bak_vw_cidades_localizacao";

CREATE TABLE "legado_vw_cidades_localizacao_busca" (
  "cidade_id" TEXT,
  "cidade_nome" TEXT,
  "subdivisao_id" TEXT,
  "subdivisao_nome" TEXT,
  "subdivisao_codigo" TEXT,
  "subdivisao_tipo" TEXT,
  "pais_id" TEXT,
  "pais_nome" TEXT,
  "pais_codigo_iso" TEXT,
  "continente" TEXT,
  "latitude" REAL,
  "longitude" REAL,
  "populacao" INTEGER,
  "descricao" TEXT,
  "created_at" TEXT,
  "label" TEXT,
  "search_text" TEXT
);
INSERT INTO "legado_vw_cidades_localizacao_busca" ("cidade_id", "cidade_nome", "subdivisao_id", "subdivisao_nome", "subdivisao_codigo", "subdivisao_tipo", "pais_id", "pais_nome", "pais_codigo_iso", "continente", "latitude", "longitude", "populacao", "descricao", "created_at", "label", "search_text") SELECT "cidade_id", "cidade_nome", "subdivisao_id", "subdivisao_nome", "subdivisao_codigo", "subdivisao_tipo", "pais_id", "pais_nome", "pais_codigo_iso", "continente", "latitude", "longitude", "populacao", "descricao", "created_at", "label", "search_text" FROM "legado_bak_vw_cidades_localizacao_busca";
DROP TABLE "legado_bak_vw_cidades_localizacao_busca";

CREATE TABLE "legado_vw_produtos_comissionamento" (
  "produto_id" TEXT,
  "tipo" TEXT,
  "regra_comissionamento" TEXT,
  "soma_na_meta" INTEGER,
  "meta_nao_atingida" REAL,
  "meta_atingida" REAL,
  "super_meta" REAL,
  "diferenciado" REAL,
  "comissionamento_ativo" INTEGER
);
INSERT INTO "legado_vw_produtos_comissionamento" ("produto_id", "tipo", "regra_comissionamento", "soma_na_meta", "meta_nao_atingida", "meta_atingida", "super_meta", "diferenciado", "comissionamento_ativo") SELECT "produto_id", "tipo", "regra_comissionamento", "soma_na_meta", "meta_nao_atingida", "meta_atingida", "super_meta", "diferenciado", "comissionamento_ativo" FROM "legado_bak_vw_produtos_comissionamento";
DROP TABLE "legado_bak_vw_produtos_comissionamento";

CREATE TABLE "legado_vw_soma_meta_placeholder" (
  "produto_id" TEXT,
  "tipo" TEXT,
  "soma_na_meta" INTEGER,
  "regra_comissionamento" TEXT
);
INSERT INTO "legado_vw_soma_meta_placeholder" ("produto_id", "tipo", "soma_na_meta", "regra_comissionamento") SELECT "produto_id", "tipo", "soma_na_meta", "regra_comissionamento" FROM "legado_bak_vw_soma_meta_placeholder";
DROP TABLE "legado_bak_vw_soma_meta_placeholder";

CREATE TABLE "legado_admin_system_settings" (
  "id" TEXT PRIMARY KEY,
  "singleton" INTEGER NOT NULL DEFAULT 0,
  "maintenance_enabled" INTEGER NOT NULL DEFAULT 0,
  "maintenance_message" TEXT,
  "updated_by" TEXT,
  "updated_at" TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  "created_at" TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  CONSTRAINT "admin_system_settings_updated_by_fkey" FOREIGN KEY ("updated_by") REFERENCES "legado_users" ("id") ON DELETE SET NULL
);
INSERT INTO "legado_admin_system_settings" ("id", "singleton", "maintenance_enabled", "maintenance_message", "updated_by", "updated_at", "created_at") SELECT "id", "singleton", "maintenance_enabled", "maintenance_message", "updated_by", "updated_at", "created_at" FROM "legado_bak_admin_system_settings";
DROP TABLE "legado_bak_admin_system_settings";

CREATE TABLE "legado_agenda_itens" (
  "id" TEXT PRIMARY KEY,
  "company_id" TEXT,
  "user_id" TEXT,
  "tipo" TEXT NOT NULL,
  "titulo" TEXT NOT NULL,
  "descricao" TEXT,
  "start_date" TEXT,
  "end_date" TEXT,
  "all_day" INTEGER,
  "status" TEXT,
  "done" INTEGER,
  "created_at" TEXT,
  "updated_at" TEXT,
  "start_at" TEXT,
  "end_at" TEXT,
  "categoria_id" TEXT,
  "prioridade" TEXT,
  "arquivo" TEXT,
  CONSTRAINT "agenda_itens_categoria_id_fkey" FOREIGN KEY ("categoria_id") REFERENCES "legado_todo_categorias" ("id") ON DELETE SET NULL
);
INSERT INTO "legado_agenda_itens" ("id", "company_id", "user_id", "tipo", "titulo", "descricao", "start_date", "end_date", "all_day", "status", "done", "created_at", "updated_at", "start_at", "end_at", "categoria_id", "prioridade", "arquivo") SELECT "id", "company_id", "user_id", "tipo", "titulo", "descricao", "start_date", "end_date", "all_day", "status", "done", "created_at", "updated_at", "start_at", "end_at", "categoria_id", "prioridade", "arquivo" FROM "legado_bak_agenda_itens";
DROP TABLE "legado_bak_agenda_itens";

CREATE TABLE "legado_airline_iata_aliases" (
  "id" TEXT PRIMARY KEY,
  "airline_code_id" TEXT NOT NULL,
  "alias" TEXT NOT NULL,
  "created_at" TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  "updated_at" TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  UNIQUE ("airline_code_id", "alias"),
  CONSTRAINT "airline_iata_aliases_airline_code_id_fkey" FOREIGN KEY ("airline_code_id") REFERENCES "legado_airline_iata_codes" ("id") ON DELETE CASCADE
);
INSERT INTO "legado_airline_iata_aliases" ("id", "airline_code_id", "alias", "created_at", "updated_at") SELECT "id", "airline_code_id", "alias", "created_at", "updated_at" FROM "legado_bak_airline_iata_aliases";
DROP TABLE "legado_bak_airline_iata_aliases";

CREATE TABLE "legado_campanhas" (
  "id" TEXT PRIMARY KEY,
  "company_id" TEXT NOT NULL,
  "titulo" TEXT NOT NULL,
  "imagem_url" TEXT,
  "imagem_path" TEXT,
  "link_url" TEXT,
  "link_instagram" TEXT,
  "link_facebook" TEXT,
  "data_campanha" TEXT NOT NULL,
  "validade_ate" TEXT,
  "regras" TEXT,
  "status" TEXT NOT NULL,
  "created_by" TEXT,
  "created_at" TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  "updated_at" TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  "arquivada_em" TEXT,
  CONSTRAINT "campanhas_company_id_fkey" FOREIGN KEY ("company_id") REFERENCES "legado_companies" ("id") ON DELETE CASCADE,
  CONSTRAINT "campanhas_created_by_fkey" FOREIGN KEY ("created_by") REFERENCES "legado_users" ("id") ON DELETE SET NULL
);
INSERT INTO "legado_campanhas" ("id", "company_id", "titulo", "imagem_url", "imagem_path", "link_url", "link_instagram", "link_facebook", "data_campanha", "validade_ate", "regras", "status", "created_by", "created_at", "updated_at", "arquivada_em") SELECT "id", "company_id", "titulo", "imagem_url", "imagem_path", "link_url", "link_instagram", "link_facebook", "data_campanha", "validade_ate", "regras", "status", "created_by", "created_at", "updated_at", "arquivada_em" FROM "legado_bak_campanhas";
DROP TABLE "legado_bak_campanhas";

CREATE TABLE "legado_cidades" (
  "id" TEXT PRIMARY KEY,
  "subdivisao_id" TEXT,
  "nome" TEXT NOT NULL,
  "latitude" REAL,
  "longitude" REAL,
  "populacao" INTEGER,
  "created_at" TEXT,
  "descricao" TEXT,
  "grau_importancia" INTEGER,
  "nome_ptBR" TEXT,
  "estado_nome" TEXT,
  "pais_nome" TEXT,
  CONSTRAINT "cidades_subdivisao_id_fkey" FOREIGN KEY ("subdivisao_id") REFERENCES "legado_subdivisoes" ("id") ON DELETE CASCADE
);
INSERT INTO "legado_cidades" ("id", "subdivisao_id", "nome", "latitude", "longitude", "populacao", "created_at", "descricao", "grau_importancia", "nome_ptBR", "estado_nome", "pais_nome") SELECT "id", "subdivisao_id", "nome", "latitude", "longitude", "populacao", "created_at", "descricao", "grau_importancia", "nome_ptBR", "estado_nome", "pais_nome" FROM "legado_bak_cidades";
DROP TABLE "legado_bak_cidades";

CREATE TABLE "legado_circuito_datas" (
  "id" TEXT PRIMARY KEY,
  "circuito_id" TEXT NOT NULL,
  "data_inicio" TEXT NOT NULL,
  "cidade_inicio_id" TEXT,
  "dias_extra_antes" INTEGER NOT NULL DEFAULT 0,
  "dias_extra_depois" INTEGER NOT NULL DEFAULT 0,
  "created_at" TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  CONSTRAINT "circuito_datas_cidade_inicio_id_fkey" FOREIGN KEY ("cidade_inicio_id") REFERENCES "legado_cidades" ("id") ON DELETE SET NULL,
  CONSTRAINT "circuito_datas_circuito_id_fkey" FOREIGN KEY ("circuito_id") REFERENCES "legado_circuitos" ("id") ON DELETE CASCADE
);
INSERT INTO "legado_circuito_datas" ("id", "circuito_id", "data_inicio", "cidade_inicio_id", "dias_extra_antes", "dias_extra_depois", "created_at") SELECT "id", "circuito_id", "data_inicio", "cidade_inicio_id", "dias_extra_antes", "dias_extra_depois", "created_at" FROM "legado_bak_circuito_datas";
DROP TABLE "legado_bak_circuito_datas";

CREATE TABLE "legado_circuito_dias" (
  "id" TEXT PRIMARY KEY,
  "circuito_id" TEXT NOT NULL,
  "dia_numero" INTEGER NOT NULL DEFAULT 0,
  "titulo" TEXT,
  "descricao" TEXT NOT NULL,
  "created_at" TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  CONSTRAINT "circuito_dias_circuito_id_fkey" FOREIGN KEY ("circuito_id") REFERENCES "legado_circuitos" ("id") ON DELETE CASCADE
);
INSERT INTO "legado_circuito_dias" ("id", "circuito_id", "dia_numero", "titulo", "descricao", "created_at") SELECT "id", "circuito_id", "dia_numero", "titulo", "descricao", "created_at" FROM "legado_bak_circuito_dias";
DROP TABLE "legado_bak_circuito_dias";

CREATE TABLE "legado_circuito_dias_cidades" (
  "id" TEXT PRIMARY KEY,
  "circuito_dia_id" TEXT NOT NULL,
  "cidade_id" TEXT NOT NULL,
  "ordem" INTEGER NOT NULL DEFAULT 0,
  CONSTRAINT "circuito_dias_cidades_cidade_id_fkey" FOREIGN KEY ("cidade_id") REFERENCES "legado_cidades" ("id") ON DELETE RESTRICT,
  CONSTRAINT "circuito_dias_cidades_circuito_dia_id_fkey" FOREIGN KEY ("circuito_dia_id") REFERENCES "legado_circuito_dias" ("id") ON DELETE CASCADE
);
INSERT INTO "legado_circuito_dias_cidades" ("id", "circuito_dia_id", "cidade_id", "ordem") SELECT "id", "circuito_dia_id", "cidade_id", "ordem" FROM "legado_bak_circuito_dias_cidades";
DROP TABLE "legado_bak_circuito_dias_cidades";

CREATE TABLE "legado_clientes" (
  "id" TEXT PRIMARY KEY,
  "nome" TEXT NOT NULL,
  "nascimento" TEXT,
  "cpf" TEXT,
  "telefone" TEXT,
  "email" TEXT,
  "endereco" TEXT,
  "complemento" TEXT,
  "cidade" TEXT,
  "estado" TEXT,
  "notas" TEXT,
  "created_at" TEXT,
  "updated_at" TEXT,
  "whatsapp" TEXT,
  "rg" TEXT,
  "genero" TEXT,
  "nacionalidade" TEXT,
  "tipo_cliente" TEXT,
  "tags" TEXT,
  "ativo" INTEGER NOT NULL DEFAULT 0,
  "company_id" TEXT,
  "cep" TEXT,
  "numero" TEXT,
  "active" INTEGER,
  "classificacao" TEXT,
  "created_by" TEXT,
  "tipo_pessoa" TEXT,
  "lgpd_anonimizado" INTEGER NOT NULL DEFAULT 0,
  "lgpd_anonimizado_em" TEXT,
  CONSTRAINT "clientes_company_id_fkey" FOREIGN KEY ("company_id") REFERENCES "legado_companies" ("id") ON DELETE NO ACTION,
  CONSTRAINT "clientes_created_by_fkey" FOREIGN KEY ("created_by") REFERENCES "legado_users" ("id") ON DELETE NO ACTION
);
INSERT INTO "legado_clientes" ("id", "nome", "nascimento", "cpf", "telefone", "email", "endereco", "complemento", "cidade", "estado", "notas", "created_at", "updated_at", "whatsapp", "rg", "genero", "nacionalidade", "tipo_cliente", "tags", "ativo", "company_id", "cep", "numero", "active", "classificacao", "created_by", "tipo_pessoa", "lgpd_anonimizado", "lgpd_anonimizado_em") SELECT "id", "nome", "nascimento", "cpf", "telefone", "email", "endereco", "complemento", "cidade", "estado", "notas", "created_at", "updated_at", "whatsapp", "rg", "genero", "nacionalidade", "tipo_cliente", "tags", "ativo", "company_id", "cep", "numero", "active", "classificacao", "created_by", "tipo_pessoa", "lgpd_anonimizado", "lgpd_anonimizado_em" FROM "legado_bak_clientes";
DROP TABLE "legado_bak_clientes";

CREATE TABLE "legado_clientes_company" (
  "company_id" TEXT NOT NULL,
  "cliente_id" TEXT NOT NULL,
  "created_at" TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  "updated_at" TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  PRIMARY KEY ("company_id", "cliente_id"),
  CONSTRAINT "clientes_company_cliente_id_fkey" FOREIGN KEY ("cliente_id") REFERENCES "legado_clientes" ("id") ON DELETE CASCADE,
  CONSTRAINT "clientes_company_company_id_fkey" FOREIGN KEY ("company_id") REFERENCES "legado_companies" ("id") ON DELETE CASCADE
);
INSERT INTO "legado_clientes_company" ("company_id", "cliente_id", "created_at", "updated_at") SELECT "company_id", "cliente_id", "created_at", "updated_at" FROM "legado_bak_clientes_company";
DROP TABLE "legado_bak_clientes_company";

CREATE TABLE "legado_commission_rule" (
  "id" TEXT PRIMARY KEY,
  "nome" TEXT NOT NULL,
  "descricao" TEXT,
  "tipo" TEXT NOT NULL,
  "meta_nao_atingida" REAL,
  "meta_atingida" REAL,
  "super_meta" REAL,
  "ativo" INTEGER NOT NULL DEFAULT 0,
  "created_at" TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  "updated_at" TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  "company_id" TEXT,
  "created_by" TEXT,
  CONSTRAINT "commission_rule_company_id_fkey" FOREIGN KEY ("company_id") REFERENCES "legado_companies" ("id") ON DELETE CASCADE,
  CONSTRAINT "commission_rule_created_by_fkey" FOREIGN KEY ("created_by") REFERENCES "legado_users" ("id") ON DELETE SET NULL
);
INSERT INTO "legado_commission_rule" ("id", "nome", "descricao", "tipo", "meta_nao_atingida", "meta_atingida", "super_meta", "ativo", "created_at", "updated_at", "company_id", "created_by") SELECT "id", "nome", "descricao", "tipo", "meta_nao_atingida", "meta_atingida", "super_meta", "ativo", "created_at", "updated_at", "company_id", "created_by" FROM "legado_bak_commission_rule";
DROP TABLE "legado_bak_commission_rule";

CREATE TABLE "legado_commission_tier" (
  "id" TEXT PRIMARY KEY,
  "rule_id" TEXT NOT NULL,
  "faixa" TEXT NOT NULL,
  "de_pct" REAL NOT NULL DEFAULT 0,
  "ate_pct" REAL NOT NULL DEFAULT 0,
  "inc_pct_meta" REAL NOT NULL DEFAULT 0,
  "inc_pct_comissao" REAL NOT NULL DEFAULT 0,
  "ativo" INTEGER NOT NULL DEFAULT 0,
  "created_at" TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  "updated_at" TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  CONSTRAINT "commission_tier_rule_id_fkey" FOREIGN KEY ("rule_id") REFERENCES "legado_commission_rule" ("id") ON DELETE CASCADE
);
INSERT INTO "legado_commission_tier" ("id", "rule_id", "faixa", "de_pct", "ate_pct", "inc_pct_meta", "inc_pct_comissao", "ativo", "created_at", "updated_at") SELECT "id", "rule_id", "faixa", "de_pct", "ate_pct", "inc_pct_meta", "inc_pct_comissao", "ativo", "created_at", "updated_at" FROM "legado_bak_commission_tier";
DROP TABLE "legado_bak_commission_tier";

CREATE TABLE "legado_company_billing" (
  "id" TEXT PRIMARY KEY,
  "company_id" TEXT NOT NULL,
  "plan_id" TEXT,
  "status" TEXT NOT NULL,
  "valor_mensal" REAL,
  "ultimo_pagamento" TEXT,
  "proximo_vencimento" TEXT,
  "inicio_cobranca" TEXT,
  "trial_ends_at" TEXT,
  "created_at" TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  "updated_at" TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  CONSTRAINT "company_billing_company_id_fkey" FOREIGN KEY ("company_id") REFERENCES "legado_companies" ("id") ON DELETE CASCADE,
  CONSTRAINT "company_billing_plan_id_fkey" FOREIGN KEY ("plan_id") REFERENCES "legado_plans" ("id") ON DELETE SET NULL
);
INSERT INTO "legado_company_billing" ("id", "company_id", "plan_id", "status", "valor_mensal", "ultimo_pagamento", "proximo_vencimento", "inicio_cobranca", "trial_ends_at", "created_at", "updated_at") SELECT "id", "company_id", "plan_id", "status", "valor_mensal", "ultimo_pagamento", "proximo_vencimento", "inicio_cobranca", "trial_ends_at", "created_at", "updated_at" FROM "legado_bak_company_billing";
DROP TABLE "legado_bak_company_billing";

CREATE TABLE "legado_company_billing_events" (
  "id" TEXT PRIMARY KEY,
  "company_id" TEXT NOT NULL,
  "billing_id" TEXT,
  "tipo" TEXT NOT NULL,
  "status" TEXT NOT NULL,
  "valor" REAL,
  "moeda" TEXT NOT NULL,
  "referencia" TEXT,
  "vencimento" TEXT,
  "pago_em" TEXT,
  "created_at" TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  CONSTRAINT "company_billing_events_billing_id_fkey" FOREIGN KEY ("billing_id") REFERENCES "legado_company_billing" ("id") ON DELETE SET NULL,
  CONSTRAINT "company_billing_events_company_id_fkey" FOREIGN KEY ("company_id") REFERENCES "legado_companies" ("id") ON DELETE CASCADE
);
INSERT INTO "legado_company_billing_events" ("id", "company_id", "billing_id", "tipo", "status", "valor", "moeda", "referencia", "vencimento", "pago_em", "created_at") SELECT "id", "company_id", "billing_id", "tipo", "status", "valor", "moeda", "referencia", "vencimento", "pago_em", "created_at" FROM "legado_bak_company_billing_events";
DROP TABLE "legado_bak_company_billing_events";

CREATE TABLE "legado_conciliacao_dias_sem_movimento" (
  "id" TEXT PRIMARY KEY,
  "company_id" TEXT NOT NULL,
  "data" TEXT NOT NULL,
  "marcado_por" TEXT,
  "marcado_em" TEXT NOT NULL,
  "observacao" TEXT,
  UNIQUE ("company_id", "data"),
  CONSTRAINT "conciliacao_dias_sem_movimento_company_id_fkey" FOREIGN KEY ("company_id") REFERENCES "legado_companies" ("id") ON DELETE CASCADE,
  CONSTRAINT "conciliacao_dias_sem_movimento_marcado_por_fkey" FOREIGN KEY ("marcado_por") REFERENCES "legado_users" ("id") ON DELETE SET NULL
);
INSERT INTO "legado_conciliacao_dias_sem_movimento" ("id", "company_id", "data", "marcado_por", "marcado_em", "observacao") SELECT "id", "company_id", "data", "marcado_por", "marcado_em", "observacao" FROM "legado_bak_conciliacao_dias_sem_movimento";
DROP TABLE "legado_bak_conciliacao_dias_sem_movimento";

CREATE TABLE "legado_conciliacao_execucoes" (
  "id" TEXT PRIMARY KEY,
  "company_id" TEXT NOT NULL,
  "actor" TEXT NOT NULL,
  "actor_user_id" TEXT,
  "checked" INTEGER NOT NULL DEFAULT 0,
  "reconciled" INTEGER NOT NULL DEFAULT 0,
  "updated_taxes" INTEGER NOT NULL DEFAULT 0,
  "still_pending" INTEGER NOT NULL DEFAULT 0,
  "status" TEXT NOT NULL,
  "error_message" TEXT,
  "created_at" TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  CONSTRAINT "conciliacao_execucoes_actor_user_id_fkey" FOREIGN KEY ("actor_user_id") REFERENCES "legado_users" ("id") ON DELETE SET NULL,
  CONSTRAINT "conciliacao_execucoes_company_id_fkey" FOREIGN KEY ("company_id") REFERENCES "legado_companies" ("id") ON DELETE CASCADE
);
INSERT INTO "legado_conciliacao_execucoes" ("id", "company_id", "actor", "actor_user_id", "checked", "reconciled", "updated_taxes", "still_pending", "status", "error_message", "created_at") SELECT "id", "company_id", "actor", "actor_user_id", "checked", "reconciled", "updated_taxes", "still_pending", "status", "error_message", "created_at" FROM "legado_bak_conciliacao_execucoes";
DROP TABLE "legado_bak_conciliacao_execucoes";

CREATE TABLE "legado_consultorias_online" (
  "id" TEXT PRIMARY KEY,
  "cliente_id" TEXT,
  "cliente_nome" TEXT NOT NULL,
  "data_hora" TEXT NOT NULL,
  "lembrete" TEXT NOT NULL,
  "destino" TEXT,
  "quantidade_pessoas" INTEGER NOT NULL DEFAULT 0,
  "orcamento_id" TEXT,
  "taxa_consultoria" REAL NOT NULL DEFAULT 0,
  "notas" TEXT,
  "created_by" TEXT NOT NULL,
  "created_at" TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  "updated_at" TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  "lembrete_enviado_em" TEXT,
  "lembrete_envios" TEXT NOT NULL,
  "fechada" INTEGER NOT NULL DEFAULT 0,
  "fechada_em" TEXT,
  CONSTRAINT "consultorias_online_cliente_id_fkey" FOREIGN KEY ("cliente_id") REFERENCES "legado_clientes" ("id") ON DELETE SET NULL,
  CONSTRAINT "consultorias_online_created_by_fkey" FOREIGN KEY ("created_by") REFERENCES "legado_users" ("id") ON DELETE NO ACTION
);
INSERT INTO "legado_consultorias_online" ("id", "cliente_id", "cliente_nome", "data_hora", "lembrete", "destino", "quantidade_pessoas", "orcamento_id", "taxa_consultoria", "notas", "created_by", "created_at", "updated_at", "lembrete_enviado_em", "lembrete_envios", "fechada", "fechada_em") SELECT "id", "cliente_id", "cliente_nome", "data_hora", "lembrete", "destino", "quantidade_pessoas", "orcamento_id", "taxa_consultoria", "notas", "created_by", "created_at", "updated_at", "lembrete_enviado_em", "lembrete_envios", "fechada", "fechada_em" FROM "legado_bak_consultorias_online";
DROP TABLE "legado_bak_consultorias_online";

CREATE TABLE "legado_dashboard_widgets" (
  "id" TEXT PRIMARY KEY,
  "usuario_id" TEXT NOT NULL,
  "widget" TEXT NOT NULL,
  "ordem" INTEGER NOT NULL DEFAULT 0,
  "visivel" INTEGER NOT NULL DEFAULT 0,
  "created_at" TEXT,
  "updated_at" TEXT,
  "settings" TEXT,
  CONSTRAINT "dashboard_widgets_usuario_id_fkey" FOREIGN KEY ("usuario_id") REFERENCES "legado_users" ("id") ON DELETE CASCADE
);
INSERT INTO "legado_dashboard_widgets" ("id", "usuario_id", "widget", "ordem", "visivel", "created_at", "updated_at", "settings") SELECT "id", "usuario_id", "widget", "ordem", "visivel", "created_at", "updated_at", "settings" FROM "legado_bak_dashboard_widgets";
DROP TABLE "legado_bak_dashboard_widgets";

CREATE TABLE "legado_documentos_viagens" (
  "id" TEXT PRIMARY KEY,
  "company_id" TEXT NOT NULL,
  "uploaded_by" TEXT,
  "file_name" TEXT NOT NULL,
  "display_name" TEXT,
  "storage_bucket" TEXT NOT NULL,
  "storage_path" TEXT NOT NULL,
  "mime_type" TEXT,
  "size_bytes" INTEGER,
  "created_at" TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  "updated_at" TEXT,
  "updated_by" TEXT,
  "title" TEXT,
  "template_text" TEXT,
  "template_fields" TEXT,
  CONSTRAINT "documentos_viagens_company_id_fkey" FOREIGN KEY ("company_id") REFERENCES "legado_companies" ("id") ON DELETE CASCADE,
  CONSTRAINT "documentos_viagens_updated_by_fkey" FOREIGN KEY ("updated_by") REFERENCES "legado_users" ("id") ON DELETE SET NULL,
  CONSTRAINT "documentos_viagens_uploaded_by_fkey" FOREIGN KEY ("uploaded_by") REFERENCES "legado_users" ("id") ON DELETE SET NULL
);
INSERT INTO "legado_documentos_viagens" ("id", "company_id", "uploaded_by", "file_name", "display_name", "storage_bucket", "storage_path", "mime_type", "size_bytes", "created_at", "updated_at", "updated_by", "title", "template_text", "template_fields") SELECT "id", "company_id", "uploaded_by", "file_name", "display_name", "storage_bucket", "storage_path", "mime_type", "size_bytes", "created_at", "updated_at", "updated_by", "title", "template_text", "template_fields" FROM "legado_bak_documentos_viagens";
DROP TABLE "legado_bak_documentos_viagens";

CREATE TABLE "legado_escala_horario_usuario" (
  "id" TEXT PRIMARY KEY,
  "company_id" TEXT NOT NULL,
  "usuario_id" TEXT NOT NULL,
  "seg_inicio" TEXT,
  "seg_fim" TEXT,
  "ter_inicio" TEXT,
  "ter_fim" TEXT,
  "qua_inicio" TEXT,
  "qua_fim" TEXT,
  "qui_inicio" TEXT,
  "qui_fim" TEXT,
  "sex_inicio" TEXT,
  "sex_fim" TEXT,
  "sab_inicio" TEXT,
  "sab_fim" TEXT,
  "dom_inicio" TEXT,
  "dom_fim" TEXT,
  "feriado_inicio" TEXT,
  "feriado_fim" TEXT,
  "auto_aplicar" INTEGER NOT NULL DEFAULT 0,
  "created_at" TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  "updated_at" TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  UNIQUE ("usuario_id"),
  CONSTRAINT "escala_horario_usuario_company_id_fkey" FOREIGN KEY ("company_id") REFERENCES "legado_companies" ("id") ON DELETE CASCADE,
  CONSTRAINT "escala_horario_usuario_usuario_id_fkey" FOREIGN KEY ("usuario_id") REFERENCES "legado_users" ("id") ON DELETE CASCADE
);
INSERT INTO "legado_escala_horario_usuario" ("id", "company_id", "usuario_id", "seg_inicio", "seg_fim", "ter_inicio", "ter_fim", "qua_inicio", "qua_fim", "qui_inicio", "qui_fim", "sex_inicio", "sex_fim", "sab_inicio", "sab_fim", "dom_inicio", "dom_fim", "feriado_inicio", "feriado_fim", "auto_aplicar", "created_at", "updated_at") SELECT "id", "company_id", "usuario_id", "seg_inicio", "seg_fim", "ter_inicio", "ter_fim", "qua_inicio", "qua_fim", "qui_inicio", "qui_fim", "sex_inicio", "sex_fim", "sab_inicio", "sab_fim", "dom_inicio", "dom_fim", "feriado_inicio", "feriado_fim", "auto_aplicar", "created_at", "updated_at" FROM "legado_bak_escala_horario_usuario";
DROP TABLE "legado_bak_escala_horario_usuario";

CREATE TABLE "legado_escala_mes" (
  "id" TEXT PRIMARY KEY,
  "company_id" TEXT NOT NULL,
  "gestor_id" TEXT NOT NULL,
  "periodo" TEXT NOT NULL,
  "status" TEXT NOT NULL,
  "observacoes" TEXT,
  "created_at" TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  "updated_at" TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  CONSTRAINT "escala_mes_company_id_fkey" FOREIGN KEY ("company_id") REFERENCES "legado_companies" ("id") ON DELETE CASCADE,
  CONSTRAINT "escala_mes_gestor_id_fkey" FOREIGN KEY ("gestor_id") REFERENCES "legado_users" ("id") ON DELETE CASCADE
);
INSERT INTO "legado_escala_mes" ("id", "company_id", "gestor_id", "periodo", "status", "observacoes", "created_at", "updated_at") SELECT "id", "company_id", "gestor_id", "periodo", "status", "observacoes", "created_at", "updated_at" FROM "legado_bak_escala_mes";
DROP TABLE "legado_bak_escala_mes";

CREATE TABLE "legado_financeiro_empresas" (
  "id" TEXT PRIMARY KEY,
  "financeiro_id" TEXT NOT NULL,
  "company_id" TEXT NOT NULL,
  "status" TEXT NOT NULL,
  "created_at" TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  "approved_at" TEXT,
  "created_by" TEXT,
  UNIQUE ("financeiro_id", "company_id"),
  CONSTRAINT "financeiro_empresas_company_id_fkey" FOREIGN KEY ("company_id") REFERENCES "legado_companies" ("id") ON DELETE CASCADE,
  CONSTRAINT "financeiro_empresas_created_by_fkey" FOREIGN KEY ("created_by") REFERENCES "legado_users" ("id") ON DELETE NO ACTION,
  CONSTRAINT "financeiro_empresas_financeiro_id_fkey" FOREIGN KEY ("financeiro_id") REFERENCES "legado_users" ("id") ON DELETE CASCADE
);
INSERT INTO "legado_financeiro_empresas" ("id", "financeiro_id", "company_id", "status", "created_at", "approved_at", "created_by") SELECT "id", "financeiro_id", "company_id", "status", "created_at", "approved_at", "created_by" FROM "legado_bak_financeiro_empresas";
DROP TABLE "legado_bak_financeiro_empresas";

CREATE TABLE "legado_gestor_equipe_compartilhada" (
  "gestor_id" TEXT PRIMARY KEY,
  "gestor_base_id" TEXT NOT NULL,
  "created_at" TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  "created_by" TEXT,
  CONSTRAINT "gestor_equipe_compartilhada_created_by_fkey" FOREIGN KEY ("created_by") REFERENCES "legado_users" ("id") ON DELETE SET NULL,
  CONSTRAINT "gestor_equipe_compartilhada_gestor_base_id_fkey" FOREIGN KEY ("gestor_base_id") REFERENCES "legado_users" ("id") ON DELETE CASCADE,
  CONSTRAINT "gestor_equipe_compartilhada_gestor_id_fkey" FOREIGN KEY ("gestor_id") REFERENCES "legado_users" ("id") ON DELETE CASCADE
);
INSERT INTO "legado_gestor_equipe_compartilhada" ("gestor_id", "gestor_base_id", "created_at", "created_by") SELECT "gestor_id", "gestor_base_id", "created_at", "created_by" FROM "legado_bak_gestor_equipe_compartilhada";
DROP TABLE "legado_bak_gestor_equipe_compartilhada";

CREATE TABLE "legado_gestor_vendedor" (
  "id" TEXT PRIMARY KEY,
  "gestor_id" TEXT,
  "vendedor_id" TEXT,
  "company_id" TEXT,
  "pode_modificar" INTEGER,
  "created_at" TEXT,
  "ativo" INTEGER NOT NULL DEFAULT 0,
  UNIQUE ("gestor_id", "vendedor_id", "company_id"),
  CONSTRAINT "gestor_vendedor_company_id_fkey" FOREIGN KEY ("company_id") REFERENCES "legado_companies" ("id") ON DELETE CASCADE,
  CONSTRAINT "gestor_vendedor_gestor_id_fkey" FOREIGN KEY ("gestor_id") REFERENCES "legado_users" ("id") ON DELETE CASCADE,
  CONSTRAINT "gestor_vendedor_vendedor_id_fkey" FOREIGN KEY ("vendedor_id") REFERENCES "legado_users" ("id") ON DELETE CASCADE
);
INSERT INTO "legado_gestor_vendedor" ("id", "gestor_id", "vendedor_id", "company_id", "pode_modificar", "created_at", "ativo") SELECT "id", "gestor_id", "vendedor_id", "company_id", "pode_modificar", "created_at", "ativo" FROM "legado_bak_gestor_vendedor";
DROP TABLE "legado_bak_gestor_vendedor";

CREATE TABLE "legado_logs" (
  "id" TEXT PRIMARY KEY,
  "user_id" TEXT,
  "modulo" TEXT NOT NULL,
  "acao" TEXT NOT NULL,
  "detalhes" TEXT,
  "ip" TEXT,
  "user_agent" TEXT,
  "created_at" TEXT,
  CONSTRAINT "logs_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "legado_users" ("id") ON DELETE SET NULL
);
INSERT INTO "legado_logs" ("id", "user_id", "modulo", "acao", "detalhes", "ip", "user_agent", "created_at") SELECT "id", "user_id", "modulo", "acao", "detalhes", "ip", "user_agent", "created_at" FROM "legado_bak_logs";
DROP TABLE "legado_bak_logs";

CREATE TABLE "legado_master_documents" (
  "id" TEXT PRIMARY KEY,
  "master_id" TEXT NOT NULL,
  "uploaded_by" TEXT NOT NULL,
  "doc_type" TEXT NOT NULL,
  "file_name" TEXT NOT NULL,
  "storage_bucket" TEXT NOT NULL,
  "storage_path" TEXT NOT NULL,
  "mime_type" TEXT,
  "size_bytes" INTEGER,
  "created_at" TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  CONSTRAINT "master_documents_master_id_fkey" FOREIGN KEY ("master_id") REFERENCES "legado_users" ("id") ON DELETE CASCADE,
  CONSTRAINT "master_documents_uploaded_by_fkey" FOREIGN KEY ("uploaded_by") REFERENCES "legado_users" ("id") ON DELETE NO ACTION
);
INSERT INTO "legado_master_documents" ("id", "master_id", "uploaded_by", "doc_type", "file_name", "storage_bucket", "storage_path", "mime_type", "size_bytes", "created_at") SELECT "id", "master_id", "uploaded_by", "doc_type", "file_name", "storage_bucket", "storage_path", "mime_type", "size_bytes", "created_at" FROM "legado_bak_master_documents";
DROP TABLE "legado_bak_master_documents";

CREATE TABLE "legado_master_empresas" (
  "id" TEXT PRIMARY KEY,
  "master_id" TEXT NOT NULL,
  "company_id" TEXT NOT NULL,
  "status" TEXT NOT NULL,
  "created_at" TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  "approved_at" TEXT,
  "approved_by" TEXT,
  UNIQUE ("master_id", "company_id"),
  CONSTRAINT "master_empresas_approved_by_fkey" FOREIGN KEY ("approved_by") REFERENCES "legado_users" ("id") ON DELETE NO ACTION,
  CONSTRAINT "master_empresas_company_id_fkey" FOREIGN KEY ("company_id") REFERENCES "legado_companies" ("id") ON DELETE CASCADE,
  CONSTRAINT "master_empresas_master_id_fkey" FOREIGN KEY ("master_id") REFERENCES "legado_users" ("id") ON DELETE CASCADE
);
INSERT INTO "legado_master_empresas" ("id", "master_id", "company_id", "status", "created_at", "approved_at", "approved_by") SELECT "id", "master_id", "company_id", "status", "created_at", "approved_at", "approved_by" FROM "legado_bak_master_empresas";
DROP TABLE "legado_bak_master_empresas";

CREATE TABLE "legado_menu_prefs" (
  "user_id" TEXT PRIMARY KEY,
  "prefs" TEXT NOT NULL,
  "updated_at" TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  CONSTRAINT "menu_prefs_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "legado_users" ("id") ON DELETE CASCADE
);
INSERT INTO "legado_menu_prefs" ("user_id", "prefs", "updated_at") SELECT "user_id", "prefs", "updated_at" FROM "legado_bak_menu_prefs";
DROP TABLE "legado_bak_menu_prefs";

CREATE TABLE "legado_message_templates_v2" (
  "id" TEXT PRIMARY KEY,
  "created_at" TEXT,
  "updated_at" TEXT,
  "created_by" TEXT,
  "scope" TEXT NOT NULL,
  "company_id" TEXT,
  "gestor_id" TEXT,
  "nome" TEXT NOT NULL,
  "slug" TEXT NOT NULL,
  "categoria" TEXT NOT NULL,
  "ocasiao" TEXT,
  "description" TEXT,
  "tags" TEXT,
  "theme_id" TEXT,
  "assunto" TEXT,
  "titulo" TEXT NOT NULL,
  "corpo" TEXT NOT NULL,
  "assinatura_padrao" TEXT,
  "required_vars" TEXT,
  "optional_vars" TEXT,
  "title_style_override" TEXT,
  "greeting_style_override" TEXT,
  "body_style_override" TEXT,
  "signature_style_override" TEXT,
  "ativo" INTEGER,
  "is_default" INTEGER,
  "is_favorite" INTEGER,
  "usage_count" INTEGER,
  "last_used_at" TEXT,
  "metadata" TEXT,
  "version" INTEGER,
  CONSTRAINT "message_templates_v2_company_id_fkey" FOREIGN KEY ("company_id") REFERENCES "legado_companies" ("id") ON DELETE CASCADE,
  CONSTRAINT "message_templates_v2_gestor_id_fkey" FOREIGN KEY ("gestor_id") REFERENCES "legado_users" ("id") ON DELETE CASCADE
);
INSERT INTO "legado_message_templates_v2" ("id", "created_at", "updated_at", "created_by", "scope", "company_id", "gestor_id", "nome", "slug", "categoria", "ocasiao", "description", "tags", "theme_id", "assunto", "titulo", "corpo", "assinatura_padrao", "required_vars", "optional_vars", "title_style_override", "greeting_style_override", "body_style_override", "signature_style_override", "ativo", "is_default", "is_favorite", "usage_count", "last_used_at", "metadata", "version") SELECT "id", "created_at", "updated_at", "created_by", "scope", "company_id", "gestor_id", "nome", "slug", "categoria", "ocasiao", "description", "tags", "theme_id", "assunto", "titulo", "corpo", "assinatura_padrao", "required_vars", "optional_vars", "title_style_override", "greeting_style_override", "body_style_override", "signature_style_override", "ativo", "is_default", "is_favorite", "usage_count", "last_used_at", "metadata", "version" FROM "legado_bak_message_templates_v2";
DROP TABLE "legado_bak_message_templates_v2";

CREATE TABLE "legado_metas_vendedor_produto" (
  "id" TEXT PRIMARY KEY,
  "meta_vendedor_id" TEXT NOT NULL,
  "produto_id" TEXT NOT NULL,
  "valor" REAL NOT NULL DEFAULT 0,
  "created_at" TEXT,
  "updated_at" TEXT,
  CONSTRAINT "metas_vendedor_produto_meta_vendedor_id_fkey" FOREIGN KEY ("meta_vendedor_id") REFERENCES "legado_metas_vendedor" ("id") ON DELETE CASCADE,
  CONSTRAINT "metas_vendedor_produto_produto_id_fkey" FOREIGN KEY ("produto_id") REFERENCES "legado_tipo_produtos" ("id") ON DELETE NO ACTION
);
INSERT INTO "legado_metas_vendedor_produto" ("id", "meta_vendedor_id", "produto_id", "valor", "created_at", "updated_at") SELECT "id", "meta_vendedor_id", "produto_id", "valor", "created_at", "updated_at" FROM "legado_bak_metas_vendedor_produto";
DROP TABLE "legado_bak_metas_vendedor_produto";

CREATE TABLE "legado_minhas_preferencias" (
  "id" TEXT PRIMARY KEY,
  "company_id" TEXT NOT NULL,
  "created_by" TEXT NOT NULL,
  "tipo_produto_id" TEXT,
  "cidade_id" TEXT,
  "nome" TEXT NOT NULL,
  "localizacao" TEXT,
  "classificacao" TEXT,
  "observacao" TEXT,
  "created_at" TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  "updated_at" TEXT,
  "updated_by" TEXT,
  CONSTRAINT "minhas_preferencias_cidade_id_fkey" FOREIGN KEY ("cidade_id") REFERENCES "legado_cidades" ("id") ON DELETE SET NULL,
  CONSTRAINT "minhas_preferencias_company_id_fkey" FOREIGN KEY ("company_id") REFERENCES "legado_companies" ("id") ON DELETE CASCADE,
  CONSTRAINT "minhas_preferencias_created_by_fkey" FOREIGN KEY ("created_by") REFERENCES "legado_users" ("id") ON DELETE CASCADE,
  CONSTRAINT "minhas_preferencias_tipo_produto_id_fkey" FOREIGN KEY ("tipo_produto_id") REFERENCES "legado_tipo_produtos" ("id") ON DELETE SET NULL,
  CONSTRAINT "minhas_preferencias_updated_by_fkey" FOREIGN KEY ("updated_by") REFERENCES "legado_users" ("id") ON DELETE SET NULL
);
INSERT INTO "legado_minhas_preferencias" ("id", "company_id", "created_by", "tipo_produto_id", "cidade_id", "nome", "localizacao", "classificacao", "observacao", "created_at", "updated_at", "updated_by") SELECT "id", "company_id", "created_by", "tipo_produto_id", "cidade_id", "nome", "localizacao", "classificacao", "observacao", "created_at", "updated_at", "updated_by" FROM "legado_bak_minhas_preferencias";
DROP TABLE "legado_bak_minhas_preferencias";

CREATE TABLE "legado_minhas_preferencias_shares" (
  "id" TEXT PRIMARY KEY,
  "company_id" TEXT NOT NULL,
  "preferencia_id" TEXT NOT NULL,
  "shared_by" TEXT NOT NULL,
  "shared_with" TEXT NOT NULL,
  "status" TEXT NOT NULL,
  "created_at" TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  "accepted_at" TEXT,
  "revoked_at" TEXT,
  CONSTRAINT "minhas_preferencias_shares_company_id_fkey" FOREIGN KEY ("company_id") REFERENCES "legado_companies" ("id") ON DELETE CASCADE,
  CONSTRAINT "minhas_preferencias_shares_preferencia_id_fkey" FOREIGN KEY ("preferencia_id") REFERENCES "legado_minhas_preferencias" ("id") ON DELETE CASCADE,
  CONSTRAINT "minhas_preferencias_shares_shared_by_fkey" FOREIGN KEY ("shared_by") REFERENCES "legado_users" ("id") ON DELETE CASCADE,
  CONSTRAINT "minhas_preferencias_shares_shared_with_fkey" FOREIGN KEY ("shared_with") REFERENCES "legado_users" ("id") ON DELETE CASCADE
);
INSERT INTO "legado_minhas_preferencias_shares" ("id", "company_id", "preferencia_id", "shared_by", "shared_with", "status", "created_at", "accepted_at", "revoked_at") SELECT "id", "company_id", "preferencia_id", "shared_by", "shared_with", "status", "created_at", "accepted_at", "revoked_at" FROM "legado_bak_minhas_preferencias_shares";
DROP TABLE "legado_bak_minhas_preferencias_shares";

CREATE TABLE "legado_modulo_acesso" (
  "id" TEXT PRIMARY KEY,
  "usuario_id" TEXT NOT NULL,
  "modulo" TEXT NOT NULL,
  "permissao" TEXT NOT NULL,
  "ativo" INTEGER NOT NULL DEFAULT 0,
  "created_at" TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  "updated_at" TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  UNIQUE ("usuario_id", "modulo"),
  CONSTRAINT "modulo_acesso_usuario_id_fkey" FOREIGN KEY ("usuario_id") REFERENCES "legado_users" ("id") ON DELETE CASCADE
);
INSERT INTO "legado_modulo_acesso" ("id", "usuario_id", "modulo", "permissao", "ativo", "created_at", "updated_at") SELECT "id", "usuario_id", "modulo", "permissao", "ativo", "created_at", "updated_at" FROM "legado_bak_modulo_acesso";
DROP TABLE "legado_bak_modulo_acesso";

CREATE TABLE "legado_mural_recados" (
  "id" TEXT PRIMARY KEY,
  "company_id" TEXT NOT NULL,
  "sender_id" TEXT NOT NULL,
  "receiver_id" TEXT,
  "assunto" TEXT,
  "conteudo" TEXT NOT NULL,
  "created_at" TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  "sender_deleted" INTEGER NOT NULL DEFAULT 0,
  "receiver_deleted" INTEGER NOT NULL DEFAULT 0,
  CONSTRAINT "mural_recados_company_id_fkey" FOREIGN KEY ("company_id") REFERENCES "legado_companies" ("id") ON DELETE CASCADE,
  CONSTRAINT "mural_recados_receiver_id_fkey" FOREIGN KEY ("receiver_id") REFERENCES "legado_users" ("id") ON DELETE CASCADE,
  CONSTRAINT "mural_recados_sender_id_fkey" FOREIGN KEY ("sender_id") REFERENCES "legado_users" ("id") ON DELETE CASCADE
);
INSERT INTO "legado_mural_recados" ("id", "company_id", "sender_id", "receiver_id", "assunto", "conteudo", "created_at", "sender_deleted", "receiver_deleted") SELECT "id", "company_id", "sender_id", "receiver_id", "assunto", "conteudo", "created_at", "sender_deleted", "receiver_deleted" FROM "legado_bak_mural_recados";
DROP TABLE "legado_bak_mural_recados";

CREATE TABLE "legado_mural_recados_arquivos" (
  "id" TEXT PRIMARY KEY,
  "company_id" TEXT NOT NULL,
  "recado_id" TEXT NOT NULL,
  "uploaded_by" TEXT,
  "file_name" TEXT NOT NULL,
  "storage_bucket" TEXT NOT NULL,
  "storage_path" TEXT NOT NULL,
  "mime_type" TEXT,
  "size_bytes" INTEGER,
  "created_at" TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  CONSTRAINT "mural_recados_arquivos_company_id_fkey" FOREIGN KEY ("company_id") REFERENCES "legado_companies" ("id") ON DELETE CASCADE,
  CONSTRAINT "mural_recados_arquivos_recado_id_fkey" FOREIGN KEY ("recado_id") REFERENCES "legado_mural_recados" ("id") ON DELETE CASCADE,
  CONSTRAINT "mural_recados_arquivos_uploaded_by_fkey" FOREIGN KEY ("uploaded_by") REFERENCES "legado_users" ("id") ON DELETE SET NULL
);
INSERT INTO "legado_mural_recados_arquivos" ("id", "company_id", "recado_id", "uploaded_by", "file_name", "storage_bucket", "storage_path", "mime_type", "size_bytes", "created_at") SELECT "id", "company_id", "recado_id", "uploaded_by", "file_name", "storage_bucket", "storage_path", "mime_type", "size_bytes", "created_at" FROM "legado_bak_mural_recados_arquivos";
DROP TABLE "legado_bak_mural_recados_arquivos";

CREATE TABLE "legado_mural_recados_leituras" (
  "id" TEXT PRIMARY KEY,
  "company_id" TEXT NOT NULL,
  "recado_id" TEXT NOT NULL,
  "user_id" TEXT NOT NULL,
  "read_at" TEXT NOT NULL,
  "created_at" TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  CONSTRAINT "mural_recados_leituras_company_id_fkey" FOREIGN KEY ("company_id") REFERENCES "legado_companies" ("id") ON DELETE CASCADE,
  CONSTRAINT "mural_recados_leituras_recado_id_fkey" FOREIGN KEY ("recado_id") REFERENCES "legado_mural_recados" ("id") ON DELETE CASCADE,
  CONSTRAINT "mural_recados_leituras_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "legado_users" ("id") ON DELETE CASCADE
);
INSERT INTO "legado_mural_recados_leituras" ("id", "company_id", "recado_id", "user_id", "read_at", "created_at") SELECT "id", "company_id", "recado_id", "user_id", "read_at", "created_at" FROM "legado_bak_mural_recados_leituras";
DROP TABLE "legado_bak_mural_recados_leituras";

CREATE TABLE "legado_parametros_cambios" (
  "id" TEXT PRIMARY KEY,
  "company_id" TEXT NOT NULL,
  "owner_user_id" TEXT,
  "moeda" TEXT NOT NULL,
  "data" TEXT NOT NULL,
  "valor" REAL NOT NULL DEFAULT 0,
  "observacoes" TEXT,
  "created_at" TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  "updated_at" TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  CONSTRAINT "parametros_cambios_company_id_fkey" FOREIGN KEY ("company_id") REFERENCES "legado_companies" ("id") ON DELETE NO ACTION,
  CONSTRAINT "parametros_cambios_owner_user_id_fkey" FOREIGN KEY ("owner_user_id") REFERENCES "legado_users" ("id") ON DELETE NO ACTION
);
INSERT INTO "legado_parametros_cambios" ("id", "company_id", "owner_user_id", "moeda", "data", "valor", "observacoes", "created_at", "updated_at") SELECT "id", "company_id", "owner_user_id", "moeda", "data", "valor", "observacoes", "created_at", "updated_at" FROM "legado_bak_parametros_cambios";
DROP TABLE "legado_bak_parametros_cambios";

CREATE TABLE "legado_parametros_comissao" (
  "id" TEXT PRIMARY KEY,
  "company_id" TEXT,
  "owner_user_id" TEXT,
  "usar_taxas_na_meta" INTEGER NOT NULL DEFAULT 0,
  "created_at" TEXT,
  "updated_at" TEXT,
  "foco_valor" TEXT NOT NULL,
  "modo_corporativo" INTEGER NOT NULL DEFAULT 0,
  "politica_cancelamento" TEXT NOT NULL,
  "foco_faturamento" TEXT,
  "exportacao_pdf" INTEGER,
  "exportacao_excel" INTEGER,
  "conciliacao_sobrepoe_vendas" INTEGER NOT NULL DEFAULT 0,
  "mfa_obrigatorio" INTEGER NOT NULL DEFAULT 0,
  "conciliacao_regra_ativa" INTEGER NOT NULL DEFAULT 0,
  "conciliacao_meta_nao_atingida" REAL,
  "conciliacao_meta_atingida" REAL,
  "conciliacao_super_meta" REAL,
  "conciliacao_tipo" TEXT NOT NULL,
  "conciliacao_tiers" TEXT NOT NULL,
  "conciliacao_faixas_loja" TEXT NOT NULL,
  UNIQUE ("company_id"),
  CONSTRAINT "parametros_comissao_company_id_fkey" FOREIGN KEY ("company_id") REFERENCES "legado_companies" ("id") ON DELETE NO ACTION,
  CONSTRAINT "parametros_comissao_owner_user_id_fkey" FOREIGN KEY ("owner_user_id") REFERENCES "legado_users" ("id") ON DELETE NO ACTION
);
INSERT INTO "legado_parametros_comissao" ("id", "company_id", "owner_user_id", "usar_taxas_na_meta", "created_at", "updated_at", "foco_valor", "modo_corporativo", "politica_cancelamento", "foco_faturamento", "exportacao_pdf", "exportacao_excel", "conciliacao_sobrepoe_vendas", "mfa_obrigatorio", "conciliacao_regra_ativa", "conciliacao_meta_nao_atingida", "conciliacao_meta_atingida", "conciliacao_super_meta", "conciliacao_tipo", "conciliacao_tiers", "conciliacao_faixas_loja") SELECT "id", "company_id", "owner_user_id", "usar_taxas_na_meta", "created_at", "updated_at", "foco_valor", "modo_corporativo", "politica_cancelamento", "foco_faturamento", "exportacao_pdf", "exportacao_excel", "conciliacao_sobrepoe_vendas", "mfa_obrigatorio", "conciliacao_regra_ativa", "conciliacao_meta_nao_atingida", "conciliacao_meta_atingida", "conciliacao_super_meta", "conciliacao_tipo", "conciliacao_tiers", "conciliacao_faixas_loja" FROM "legado_bak_parametros_comissao";
DROP TABLE "legado_bak_parametros_comissao";

CREATE TABLE "legado_parametros_pagamentos_nao_comissionaveis" (
  "id" TEXT PRIMARY KEY,
  "termo" TEXT NOT NULL,
  "termo_normalizado" TEXT NOT NULL,
  "ativo" INTEGER NOT NULL DEFAULT 0,
  "created_at" TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  "created_by" TEXT,
  "updated_at" TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  "updated_by" TEXT,
  CONSTRAINT "parametros_pagamentos_nao_comissionaveis_created_by_fkey" FOREIGN KEY ("created_by") REFERENCES "legado_users" ("id") ON DELETE NO ACTION,
  CONSTRAINT "parametros_pagamentos_nao_comissionaveis_updated_by_fkey" FOREIGN KEY ("updated_by") REFERENCES "legado_users" ("id") ON DELETE NO ACTION
);
INSERT INTO "legado_parametros_pagamentos_nao_comissionaveis" ("id", "termo", "termo_normalizado", "ativo", "created_at", "created_by", "updated_at", "updated_by") SELECT "id", "termo", "termo_normalizado", "ativo", "created_at", "created_by", "updated_at", "updated_by" FROM "legado_bak_parametros_pagamentos_nao_comissionaveis";
DROP TABLE "legado_bak_parametros_pagamentos_nao_comissionaveis";

CREATE TABLE "legado_product_commission_rule" (
  "id" TEXT PRIMARY KEY,
  "produto_id" TEXT NOT NULL,
  "rule_id" TEXT NOT NULL,
  "fix_meta_nao_atingida" REAL,
  "fix_meta_atingida" REAL,
  "fix_super_meta" REAL,
  "ativo" INTEGER NOT NULL DEFAULT 0,
  "created_at" TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  "updated_at" TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  UNIQUE ("produto_id"),
  CONSTRAINT "product_commission_rule_produto_id_fkey" FOREIGN KEY ("produto_id") REFERENCES "legado_tipo_produtos" ("id") ON DELETE CASCADE,
  CONSTRAINT "product_commission_rule_rule_id_fkey" FOREIGN KEY ("rule_id") REFERENCES "legado_commission_rule" ("id") ON DELETE NO ACTION
);
INSERT INTO "legado_product_commission_rule" ("id", "produto_id", "rule_id", "fix_meta_nao_atingida", "fix_meta_atingida", "fix_super_meta", "ativo", "created_at", "updated_at") SELECT "id", "produto_id", "rule_id", "fix_meta_nao_atingida", "fix_meta_atingida", "fix_super_meta", "ativo", "created_at", "updated_at" FROM "legado_bak_product_commission_rule";
DROP TABLE "legado_bak_product_commission_rule";

CREATE TABLE "legado_product_commission_rule_pacote" (
  "id" TEXT PRIMARY KEY,
  "produto_id" TEXT NOT NULL,
  "tipo_pacote" TEXT NOT NULL,
  "rule_id" TEXT,
  "fix_meta_nao_atingida" REAL,
  "fix_meta_atingida" REAL,
  "fix_super_meta" REAL,
  "ativo" INTEGER,
  "created_at" TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  "updated_at" TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  CONSTRAINT "product_commission_rule_pacote_produto_id_fkey" FOREIGN KEY ("produto_id") REFERENCES "legado_tipo_produtos" ("id") ON DELETE CASCADE,
  CONSTRAINT "product_commission_rule_pacote_rule_id_fkey" FOREIGN KEY ("rule_id") REFERENCES "legado_commission_rule" ("id") ON DELETE SET NULL
);
INSERT INTO "legado_product_commission_rule_pacote" ("id", "produto_id", "tipo_pacote", "rule_id", "fix_meta_nao_atingida", "fix_meta_atingida", "fix_super_meta", "ativo", "created_at", "updated_at") SELECT "id", "produto_id", "tipo_pacote", "rule_id", "fix_meta_nao_atingida", "fix_meta_atingida", "fix_super_meta", "ativo", "created_at", "updated_at" FROM "legado_bak_product_commission_rule_pacote";
DROP TABLE "legado_bak_product_commission_rule_pacote";

CREATE TABLE "legado_produtos" (
  "id" TEXT PRIMARY KEY,
  "nome" TEXT NOT NULL,
  "cidade_id" TEXT,
  "informacoes_importantes" TEXT,
  "atracao_principal" TEXT,
  "melhor_epoca" TEXT,
  "duracao_sugerida" TEXT,
  "nivel_preco" TEXT,
  "imagem_url" TEXT,
  "ativo" INTEGER,
  "created_at" TEXT,
  "updated_at" TEXT,
  "tipo_produto" TEXT,
  "destino" TEXT,
  "fornecedor_id" TEXT,
  "todas_as_cidades" INTEGER NOT NULL DEFAULT 0,
  "valor_neto" REAL,
  "margem" REAL,
  "valor_venda" REAL,
  "moeda" TEXT,
  "cambio" REAL,
  "valor_em_reais" REAL,
  "circuito_id" TEXT,
  CONSTRAINT "produtos_circuito_id_fkey" FOREIGN KEY ("circuito_id") REFERENCES "legado_circuitos" ("id") ON DELETE SET NULL,
  CONSTRAINT "produtos_fornecedor_id_fkey" FOREIGN KEY ("fornecedor_id") REFERENCES "legado_fornecedores" ("id") ON DELETE NO ACTION,
  CONSTRAINT "produtos_tipo_produto_fkey" FOREIGN KEY ("tipo_produto") REFERENCES "legado_tipo_produtos" ("id") ON DELETE NO ACTION
);
INSERT INTO "legado_produtos" ("id", "nome", "cidade_id", "informacoes_importantes", "atracao_principal", "melhor_epoca", "duracao_sugerida", "nivel_preco", "imagem_url", "ativo", "created_at", "updated_at", "tipo_produto", "destino", "fornecedor_id", "todas_as_cidades", "valor_neto", "margem", "valor_venda", "moeda", "cambio", "valor_em_reais", "circuito_id") SELECT "id", "nome", "cidade_id", "informacoes_importantes", "atracao_principal", "melhor_epoca", "duracao_sugerida", "nivel_preco", "imagem_url", "ativo", "created_at", "updated_at", "tipo_produto", "destino", "fornecedor_id", "todas_as_cidades", "valor_neto", "margem", "valor_venda", "moeda", "cambio", "valor_em_reais", "circuito_id" FROM "legado_bak_produtos";
DROP TABLE "legado_bak_produtos";

CREATE TABLE "legado_produtos_tarifas" (
  "id" TEXT PRIMARY KEY,
  "produto_id" TEXT NOT NULL,
  "acomodacao" TEXT NOT NULL,
  "qte_pax" INTEGER NOT NULL DEFAULT 0,
  "tipo" TEXT,
  "validade_de" TEXT NOT NULL,
  "validade_ate" TEXT NOT NULL,
  "valor_neto" REAL NOT NULL DEFAULT 0,
  "padrao" TEXT NOT NULL,
  "margem" REAL,
  "valor_venda" REAL NOT NULL DEFAULT 0,
  "moeda" TEXT NOT NULL,
  "cambio" REAL NOT NULL DEFAULT 0,
  "valor_em_reais" REAL NOT NULL DEFAULT 0,
  "created_at" TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  "updated_at" TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  CONSTRAINT "produtos_tarifas_produto_id_fkey" FOREIGN KEY ("produto_id") REFERENCES "legado_produtos" ("id") ON DELETE CASCADE
);
INSERT INTO "legado_produtos_tarifas" ("id", "produto_id", "acomodacao", "qte_pax", "tipo", "validade_de", "validade_ate", "valor_neto", "padrao", "margem", "valor_venda", "moeda", "cambio", "valor_em_reais", "created_at", "updated_at") SELECT "id", "produto_id", "acomodacao", "qte_pax", "tipo", "validade_de", "validade_ate", "valor_neto", "padrao", "margem", "valor_venda", "moeda", "cambio", "valor_em_reais", "created_at", "updated_at" FROM "legado_bak_produtos_tarifas";
DROP TABLE "legado_bak_produtos_tarifas";

CREATE TABLE "legado_quote" (
  "id" TEXT PRIMARY KEY,
  "created_at" TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  "updated_at" TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  "created_by" TEXT NOT NULL,
  "client_id" TEXT,
  "status" TEXT NOT NULL,
  "currency" TEXT NOT NULL,
  "total" REAL NOT NULL DEFAULT 0,
  "average_confidence" REAL,
  "source_file_path" TEXT,
  "source_file_url" TEXT,
  "raw_json" TEXT NOT NULL,
  "status_negociacao" TEXT NOT NULL,
  "subtotal" REAL,
  "taxes" REAL,
  "client_name" TEXT,
  "client_whatsapp" TEXT,
  "client_email" TEXT,
  "destino_cidade_id" TEXT,
  "data_embarque" TEXT,
  "data_final" TEXT,
  "last_interaction_at" TEXT,
  "last_interaction_notes" TEXT,
  "roteiro_id" TEXT,
  CONSTRAINT "quote_client_id_fkey" FOREIGN KEY ("client_id") REFERENCES "legado_clientes" ("id") ON DELETE SET NULL,
  CONSTRAINT "quote_destino_cidade_id_fkey" FOREIGN KEY ("destino_cidade_id") REFERENCES "legado_cidades" ("id") ON DELETE SET NULL,
  CONSTRAINT "quote_roteiro_id_fkey" FOREIGN KEY ("roteiro_id") REFERENCES "legado_roteiro_personalizado" ("id") ON DELETE SET NULL
);
INSERT INTO "legado_quote" ("id", "created_at", "updated_at", "created_by", "client_id", "status", "currency", "total", "average_confidence", "source_file_path", "source_file_url", "raw_json", "status_negociacao", "subtotal", "taxes", "client_name", "client_whatsapp", "client_email", "destino_cidade_id", "data_embarque", "data_final", "last_interaction_at", "last_interaction_notes", "roteiro_id") SELECT "id", "created_at", "updated_at", "created_by", "client_id", "status", "currency", "total", "average_confidence", "source_file_path", "source_file_url", "raw_json", "status_negociacao", "subtotal", "taxes", "client_name", "client_whatsapp", "client_email", "destino_cidade_id", "data_embarque", "data_final", "last_interaction_at", "last_interaction_notes", "roteiro_id" FROM "legado_bak_quote";
DROP TABLE "legado_bak_quote";

CREATE TABLE "legado_quote_import_log" (
  "id" TEXT PRIMARY KEY,
  "quote_id" TEXT NOT NULL,
  "level" TEXT NOT NULL,
  "message" TEXT,
  "payload" TEXT NOT NULL,
  "created_at" TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  CONSTRAINT "quote_import_log_quote_id_fkey" FOREIGN KEY ("quote_id") REFERENCES "legado_quote" ("id") ON DELETE CASCADE
);
INSERT INTO "legado_quote_import_log" ("id", "quote_id", "level", "message", "payload", "created_at") SELECT "id", "quote_id", "level", "message", "payload", "created_at" FROM "legado_bak_quote_import_log";
DROP TABLE "legado_bak_quote_import_log";

CREATE TABLE "legado_quote_item" (
  "id" TEXT PRIMARY KEY,
  "quote_id" TEXT NOT NULL,
  "item_type" TEXT NOT NULL,
  "title" TEXT,
  "product_name" TEXT,
  "city_name" TEXT,
  "quantity" INTEGER NOT NULL DEFAULT 0,
  "unit_price" REAL NOT NULL DEFAULT 0,
  "total_amount" REAL NOT NULL DEFAULT 0,
  "start_date" TEXT,
  "end_date" TEXT,
  "currency" TEXT NOT NULL,
  "confidence" REAL,
  "raw" TEXT NOT NULL,
  "created_at" TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  "updated_at" TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  "order_index" INTEGER NOT NULL DEFAULT 0,
  "taxes_amount" REAL NOT NULL DEFAULT 0,
  "cidade_id" TEXT,
  CONSTRAINT "quote_item_cidade_id_fkey" FOREIGN KEY ("cidade_id") REFERENCES "legado_cidades" ("id") ON DELETE SET NULL,
  CONSTRAINT "quote_item_quote_id_fkey" FOREIGN KEY ("quote_id") REFERENCES "legado_quote" ("id") ON DELETE CASCADE
);
INSERT INTO "legado_quote_item" ("id", "quote_id", "item_type", "title", "product_name", "city_name", "quantity", "unit_price", "total_amount", "start_date", "end_date", "currency", "confidence", "raw", "created_at", "updated_at", "order_index", "taxes_amount", "cidade_id") SELECT "id", "quote_id", "item_type", "title", "product_name", "city_name", "quantity", "unit_price", "total_amount", "start_date", "end_date", "currency", "confidence", "raw", "created_at", "updated_at", "order_index", "taxes_amount", "cidade_id" FROM "legado_bak_quote_item";
DROP TABLE "legado_bak_quote_item";

CREATE TABLE "legado_quote_item_segment" (
  "id" TEXT PRIMARY KEY,
  "quote_item_id" TEXT NOT NULL,
  "segment_type" TEXT NOT NULL,
  "data" TEXT NOT NULL,
  "order_index" INTEGER NOT NULL DEFAULT 0,
  "created_at" TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  CONSTRAINT "quote_item_segment_quote_item_id_fkey" FOREIGN KEY ("quote_item_id") REFERENCES "legado_quote_item" ("id") ON DELETE CASCADE
);
INSERT INTO "legado_quote_item_segment" ("id", "quote_item_id", "segment_type", "data", "order_index", "created_at") SELECT "id", "quote_item_id", "segment_type", "data", "order_index", "created_at" FROM "legado_bak_quote_item_segment";
DROP TABLE "legado_bak_quote_item_segment";

CREATE TABLE "legado_quote_print_settings" (
  "id" TEXT PRIMARY KEY,
  "owner_user_id" TEXT NOT NULL,
  "company_id" TEXT,
  "logo_url" TEXT,
  "consultor_nome" TEXT,
  "filial_nome" TEXT,
  "endereco_linha1" TEXT,
  "endereco_linha2" TEXT,
  "endereco_linha3" TEXT,
  "telefone" TEXT,
  "whatsapp" TEXT,
  "email" TEXT,
  "rodape_texto" TEXT,
  "created_at" TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  "updated_at" TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  "logo_path" TEXT,
  "imagem_complementar_url" TEXT,
  "imagem_complementar_path" TEXT,
  "whatsapp_codigo_pais" TEXT,
  CONSTRAINT "quote_print_settings_company_id_fkey" FOREIGN KEY ("company_id") REFERENCES "legado_companies" ("id") ON DELETE NO ACTION,
  CONSTRAINT "quote_print_settings_owner_user_id_fkey" FOREIGN KEY ("owner_user_id") REFERENCES "legado_users" ("id") ON DELETE CASCADE
);
INSERT INTO "legado_quote_print_settings" ("id", "owner_user_id", "company_id", "logo_url", "consultor_nome", "filial_nome", "endereco_linha1", "endereco_linha2", "endereco_linha3", "telefone", "whatsapp", "email", "rodape_texto", "created_at", "updated_at", "logo_path", "imagem_complementar_url", "imagem_complementar_path", "whatsapp_codigo_pais") SELECT "id", "owner_user_id", "company_id", "logo_url", "consultor_nome", "filial_nome", "endereco_linha1", "endereco_linha2", "endereco_linha3", "telefone", "whatsapp", "email", "rodape_texto", "created_at", "updated_at", "logo_path", "imagem_complementar_url", "imagem_complementar_path", "whatsapp_codigo_pais" FROM "legado_bak_quote_print_settings";
DROP TABLE "legado_bak_quote_print_settings";

CREATE TABLE "legado_roteiro_dia" (
  "id" TEXT PRIMARY KEY,
  "created_by" TEXT NOT NULL,
  "company_id" TEXT,
  "roteiro_id" TEXT,
  "cidade" TEXT NOT NULL,
  "data" TEXT,
  "ordem" INTEGER,
  "descricao" TEXT NOT NULL,
  "created_at" TEXT,
  "percurso" TEXT,
  CONSTRAINT "roteiro_dia_company_id_fkey" FOREIGN KEY ("company_id") REFERENCES "legado_companies" ("id") ON DELETE CASCADE,
  CONSTRAINT "roteiro_dia_roteiro_id_fkey" FOREIGN KEY ("roteiro_id") REFERENCES "legado_roteiro_personalizado" ("id") ON DELETE SET NULL
);
INSERT INTO "legado_roteiro_dia" ("id", "created_by", "company_id", "roteiro_id", "cidade", "data", "ordem", "descricao", "created_at", "percurso") SELECT "id", "created_by", "company_id", "roteiro_id", "cidade", "data", "ordem", "descricao", "created_at", "percurso" FROM "legado_bak_roteiro_dia";
DROP TABLE "legado_bak_roteiro_dia";

CREATE TABLE "legado_roteiro_hotel" (
  "id" TEXT PRIMARY KEY,
  "roteiro_id" TEXT NOT NULL,
  "cidade" TEXT,
  "hotel" TEXT,
  "data_inicio" TEXT,
  "data_fim" TEXT,
  "noites" INTEGER,
  "apto" TEXT,
  "categoria" TEXT,
  "regime" TEXT,
  "ordem" INTEGER,
  "endereco" TEXT,
  "qtd_apto" INTEGER,
  "tipo_tarifa" TEXT,
  "qtd_adultos" INTEGER,
  "qtd_criancas" INTEGER,
  "valor_original" REAL,
  "valor_final" REAL,
  CONSTRAINT "roteiro_hotel_roteiro_id_fkey" FOREIGN KEY ("roteiro_id") REFERENCES "legado_roteiro_personalizado" ("id") ON DELETE CASCADE
);
INSERT INTO "legado_roteiro_hotel" ("id", "roteiro_id", "cidade", "hotel", "data_inicio", "data_fim", "noites", "apto", "categoria", "regime", "ordem", "endereco", "qtd_apto", "tipo_tarifa", "qtd_adultos", "qtd_criancas", "valor_original", "valor_final") SELECT "id", "roteiro_id", "cidade", "hotel", "data_inicio", "data_fim", "noites", "apto", "categoria", "regime", "ordem", "endereco", "qtd_apto", "tipo_tarifa", "qtd_adultos", "qtd_criancas", "valor_original", "valor_final" FROM "legado_bak_roteiro_hotel";
DROP TABLE "legado_bak_roteiro_hotel";

CREATE TABLE "legado_roteiro_investimento" (
  "id" TEXT PRIMARY KEY,
  "roteiro_id" TEXT NOT NULL,
  "tipo" TEXT,
  "valor_por_pessoa" REAL,
  "qtd_apto" INTEGER,
  "valor_por_apto" REAL,
  "ordem" INTEGER,
  CONSTRAINT "roteiro_investimento_roteiro_id_fkey" FOREIGN KEY ("roteiro_id") REFERENCES "legado_roteiro_personalizado" ("id") ON DELETE CASCADE
);
INSERT INTO "legado_roteiro_investimento" ("id", "roteiro_id", "tipo", "valor_por_pessoa", "qtd_apto", "valor_por_apto", "ordem") SELECT "id", "roteiro_id", "tipo", "valor_por_pessoa", "qtd_apto", "valor_por_apto", "ordem" FROM "legado_bak_roteiro_investimento";
DROP TABLE "legado_bak_roteiro_investimento";

CREATE TABLE "legado_roteiro_pagamento" (
  "id" TEXT PRIMARY KEY,
  "roteiro_id" TEXT NOT NULL,
  "servico" TEXT,
  "valor_total_com_taxas" REAL,
  "taxas" REAL,
  "forma_pagamento" TEXT,
  "ordem" INTEGER,
  CONSTRAINT "roteiro_pagamento_roteiro_id_fkey" FOREIGN KEY ("roteiro_id") REFERENCES "legado_roteiro_personalizado" ("id") ON DELETE CASCADE
);
INSERT INTO "legado_roteiro_pagamento" ("id", "roteiro_id", "servico", "valor_total_com_taxas", "taxas", "forma_pagamento", "ordem") SELECT "id", "roteiro_id", "servico", "valor_total_com_taxas", "taxas", "forma_pagamento", "ordem" FROM "legado_bak_roteiro_pagamento";
DROP TABLE "legado_bak_roteiro_pagamento";

CREATE TABLE "legado_roteiro_passeio" (
  "id" TEXT PRIMARY KEY,
  "roteiro_id" TEXT NOT NULL,
  "cidade" TEXT,
  "passeio" TEXT,
  "data_inicio" TEXT,
  "tipo" TEXT,
  "ingressos" TEXT,
  "ordem" INTEGER,
  "data_fim" TEXT,
  "fornecedor" TEXT,
  "qtd_adultos" INTEGER,
  "qtd_criancas" INTEGER,
  "valor_original" REAL,
  "valor_final" REAL,
  CONSTRAINT "roteiro_passeio_roteiro_id_fkey" FOREIGN KEY ("roteiro_id") REFERENCES "legado_roteiro_personalizado" ("id") ON DELETE CASCADE
);
INSERT INTO "legado_roteiro_passeio" ("id", "roteiro_id", "cidade", "passeio", "data_inicio", "tipo", "ingressos", "ordem", "data_fim", "fornecedor", "qtd_adultos", "qtd_criancas", "valor_original", "valor_final") SELECT "id", "roteiro_id", "cidade", "passeio", "data_inicio", "tipo", "ingressos", "ordem", "data_fim", "fornecedor", "qtd_adultos", "qtd_criancas", "valor_original", "valor_final" FROM "legado_bak_roteiro_passeio";
DROP TABLE "legado_bak_roteiro_passeio";

CREATE TABLE "legado_sac_controle" (
  "id" TEXT PRIMARY KEY,
  "company_id" TEXT NOT NULL,
  "recibo" TEXT,
  "tour" TEXT,
  "data_solicitacao" TEXT,
  "motivo" TEXT,
  "contratante_pax" TEXT,
  "ok_quando" TEXT,
  "created_by" TEXT,
  "updated_by" TEXT,
  "created_at" TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  "updated_at" TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  "status" TEXT,
  "responsavel" TEXT,
  "prazo" TEXT,
  CONSTRAINT "sac_controle_company_id_fkey" FOREIGN KEY ("company_id") REFERENCES "legado_companies" ("id") ON DELETE NO ACTION,
  CONSTRAINT "sac_controle_created_by_fkey" FOREIGN KEY ("created_by") REFERENCES "legado_users" ("id") ON DELETE NO ACTION,
  CONSTRAINT "sac_controle_updated_by_fkey" FOREIGN KEY ("updated_by") REFERENCES "legado_users" ("id") ON DELETE NO ACTION
);
INSERT INTO "legado_sac_controle" ("id", "company_id", "recibo", "tour", "data_solicitacao", "motivo", "contratante_pax", "ok_quando", "created_by", "updated_by", "created_at", "updated_at", "status", "responsavel", "prazo") SELECT "id", "company_id", "recibo", "tour", "data_solicitacao", "motivo", "contratante_pax", "ok_quando", "created_by", "updated_by", "created_at", "updated_at", "status", "responsavel", "prazo" FROM "legado_bak_sac_controle";
DROP TABLE "legado_bak_sac_controle";

CREATE TABLE "legado_sac_interacoes" (
  "id" TEXT PRIMARY KEY,
  "sac_id" TEXT NOT NULL,
  "data_interacao" TEXT,
  "descricao" TEXT NOT NULL,
  "created_by" TEXT,
  "created_at" TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  CONSTRAINT "sac_interacoes_created_by_fkey" FOREIGN KEY ("created_by") REFERENCES "legado_users" ("id") ON DELETE NO ACTION,
  CONSTRAINT "sac_interacoes_sac_id_fkey" FOREIGN KEY ("sac_id") REFERENCES "legado_sac_controle" ("id") ON DELETE CASCADE
);
INSERT INTO "legado_sac_interacoes" ("id", "sac_id", "data_interacao", "descricao", "created_by", "created_at") SELECT "id", "sac_id", "data_interacao", "descricao", "created_by", "created_at" FROM "legado_bak_sac_interacoes";
DROP TABLE "legado_bak_sac_interacoes";

CREATE TABLE "legado_servico_fornecedor_price" (
  "id" TEXT PRIMARY KEY,
  "servico_fornecedor_id" TEXT NOT NULL,
  "moeda" TEXT NOT NULL,
  "valor_base" REAL NOT NULL DEFAULT 0,
  "tipo_valor" TEXT NOT NULL,
  "ativo" INTEGER NOT NULL DEFAULT 0,
  "created_at" TEXT,
  "updated_at" TEXT,
  CONSTRAINT "servico_fornecedor_price_servico_fornecedor_id_fkey" FOREIGN KEY ("servico_fornecedor_id") REFERENCES "legado_servicos_fornecedor" ("id") ON DELETE NO ACTION
);
INSERT INTO "legado_servico_fornecedor_price" ("id", "servico_fornecedor_id", "moeda", "valor_base", "tipo_valor", "ativo", "created_at", "updated_at") SELECT "id", "servico_fornecedor_id", "moeda", "valor_base", "tipo_valor", "ativo", "created_at", "updated_at" FROM "legado_bak_servico_fornecedor_price";
DROP TABLE "legado_bak_servico_fornecedor_price";

CREATE TABLE "legado_servico_fornecedor_price_period" (
  "id" TEXT PRIMARY KEY,
  "servico_fornecedor_price_id" TEXT NOT NULL,
  "data_inicio" TEXT NOT NULL,
  "data_fim" TEXT NOT NULL,
  "ajuste_tipo" TEXT NOT NULL,
  "ajuste_valor" REAL NOT NULL DEFAULT 0,
  CONSTRAINT "servico_fornecedor_price_period_price_id_fkey" FOREIGN KEY ("servico_fornecedor_price_id") REFERENCES "legado_servico_fornecedor_price" ("id") ON DELETE NO ACTION
);
INSERT INTO "legado_servico_fornecedor_price_period" ("id", "servico_fornecedor_price_id", "data_inicio", "data_fim", "ajuste_tipo", "ajuste_valor") SELECT "id", "servico_fornecedor_price_id", "data_inicio", "data_fim", "ajuste_tipo", "ajuste_valor" FROM "legado_bak_servico_fornecedor_price_period";
DROP TABLE "legado_bak_servico_fornecedor_price_period";

CREATE TABLE "legado_servico_price" (
  "id" TEXT PRIMARY KEY,
  "servico_id" TEXT NOT NULL,
  "moeda" TEXT NOT NULL,
  "valor_base" REAL NOT NULL DEFAULT 0,
  "tipo_valor" TEXT NOT NULL,
  "ativo" INTEGER NOT NULL DEFAULT 0,
  "created_at" TEXT,
  "updated_at" TEXT,
  CONSTRAINT "servico_price_servico_id_fkey" FOREIGN KEY ("servico_id") REFERENCES "legado_servicos" ("id") ON DELETE NO ACTION
);
INSERT INTO "legado_servico_price" ("id", "servico_id", "moeda", "valor_base", "tipo_valor", "ativo", "created_at", "updated_at") SELECT "id", "servico_id", "moeda", "valor_base", "tipo_valor", "ativo", "created_at", "updated_at" FROM "legado_bak_servico_price";
DROP TABLE "legado_bak_servico_price";

CREATE TABLE "legado_servico_price_period" (
  "id" TEXT PRIMARY KEY,
  "servico_price_id" TEXT NOT NULL,
  "data_inicio" TEXT NOT NULL,
  "data_fim" TEXT NOT NULL,
  "ajuste_tipo" TEXT NOT NULL,
  "ajuste_valor" REAL NOT NULL DEFAULT 0,
  CONSTRAINT "servico_price_period_servico_price_id_fkey" FOREIGN KEY ("servico_price_id") REFERENCES "legado_servico_price" ("id") ON DELETE NO ACTION
);
INSERT INTO "legado_servico_price_period" ("id", "servico_price_id", "data_inicio", "data_fim", "ajuste_tipo", "ajuste_valor") SELECT "id", "servico_price_id", "data_inicio", "data_fim", "ajuste_tipo", "ajuste_valor" FROM "legado_bak_servico_price_period";
DROP TABLE "legado_bak_servico_price_period";

CREATE TABLE "legado_system_documentation" (
  "id" TEXT PRIMARY KEY,
  "slug" TEXT NOT NULL,
  "markdown" TEXT NOT NULL,
  "updated_at" TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  "updated_by" TEXT,
  UNIQUE ("slug"),
  CONSTRAINT "system_documentation_updated_by_fkey" FOREIGN KEY ("updated_by") REFERENCES "legado_users" ("id") ON DELETE NO ACTION
);
INSERT INTO "legado_system_documentation" ("id", "slug", "markdown", "updated_at", "updated_by") SELECT "id", "slug", "markdown", "updated_at", "updated_by" FROM "legado_bak_system_documentation";
DROP TABLE "legado_bak_system_documentation";

CREATE TABLE "legado_system_documentation_sections" (
  "id" TEXT PRIMARY KEY,
  "slug" TEXT NOT NULL,
  "role_scope" TEXT NOT NULL,
  "module_key" TEXT NOT NULL,
  "route_pattern" TEXT,
  "title" TEXT NOT NULL,
  "summary" TEXT,
  "content_markdown" TEXT NOT NULL,
  "tone" TEXT NOT NULL,
  "sort_order" INTEGER NOT NULL DEFAULT 0,
  "is_active" INTEGER NOT NULL DEFAULT 0,
  "created_at" TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  "created_by" TEXT,
  "updated_at" TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  "updated_by" TEXT,
  UNIQUE ("slug", "role_scope", "module_key"),
  CONSTRAINT "system_documentation_sections_created_by_fkey" FOREIGN KEY ("created_by") REFERENCES "legado_users" ("id") ON DELETE NO ACTION,
  CONSTRAINT "system_documentation_sections_updated_by_fkey" FOREIGN KEY ("updated_by") REFERENCES "legado_users" ("id") ON DELETE NO ACTION
);
INSERT INTO "legado_system_documentation_sections" ("id", "slug", "role_scope", "module_key", "route_pattern", "title", "summary", "content_markdown", "tone", "sort_order", "is_active", "created_at", "created_by", "updated_at", "updated_by") SELECT "id", "slug", "role_scope", "module_key", "route_pattern", "title", "summary", "content_markdown", "tone", "sort_order", "is_active", "created_at", "created_by", "updated_at", "updated_by" FROM "legado_bak_system_documentation_sections";
DROP TABLE "legado_bak_system_documentation_sections";

CREATE TABLE "legado_system_documentation_versions" (
  "id" TEXT PRIMARY KEY,
  "doc_id" TEXT NOT NULL,
  "slug" TEXT NOT NULL,
  "markdown" TEXT NOT NULL,
  "action" TEXT NOT NULL,
  "created_at" TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  "created_by" TEXT,
  CONSTRAINT "system_documentation_versions_created_by_fkey" FOREIGN KEY ("created_by") REFERENCES "legado_users" ("id") ON DELETE NO ACTION,
  CONSTRAINT "system_documentation_versions_doc_id_fkey" FOREIGN KEY ("doc_id") REFERENCES "legado_system_documentation" ("id") ON DELETE CASCADE
);
INSERT INTO "legado_system_documentation_versions" ("id", "doc_id", "slug", "markdown", "action", "created_at", "created_by") SELECT "id", "doc_id", "slug", "markdown", "action", "created_at", "created_by" FROM "legado_bak_system_documentation_versions";
DROP TABLE "legado_bak_system_documentation_versions";

CREATE TABLE "legado_system_module_settings" (
  "module_key" TEXT PRIMARY KEY,
  "enabled" INTEGER NOT NULL DEFAULT 0,
  "reason" TEXT,
  "updated_at" TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  "updated_by" TEXT,
  CONSTRAINT "system_module_settings_updated_by_fkey" FOREIGN KEY ("updated_by") REFERENCES "legado_users" ("id") ON DELETE SET NULL
);
INSERT INTO "legado_system_module_settings" ("module_key", "enabled", "reason", "updated_at", "updated_by") SELECT "module_key", "enabled", "reason", "updated_at", "updated_by" FROM "legado_bak_system_module_settings";
DROP TABLE "legado_bak_system_module_settings";

CREATE TABLE "legado_tipo_pacotes" (
  "id" TEXT PRIMARY KEY,
  "nome" TEXT NOT NULL,
  "rule_id" TEXT,
  "fix_meta_nao_atingida" REAL,
  "fix_meta_atingida" REAL,
  "fix_super_meta" REAL,
  "ativo" INTEGER,
  "created_at" TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  "updated_at" TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  CONSTRAINT "tipo_pacotes_rule_id_fkey" FOREIGN KEY ("rule_id") REFERENCES "legado_commission_rule" ("id") ON DELETE SET NULL
);
INSERT INTO "legado_tipo_pacotes" ("id", "nome", "rule_id", "fix_meta_nao_atingida", "fix_meta_atingida", "fix_super_meta", "ativo", "created_at", "updated_at") SELECT "id", "nome", "rule_id", "fix_meta_nao_atingida", "fix_meta_atingida", "fix_super_meta", "ativo", "created_at", "updated_at" FROM "legado_bak_tipo_pacotes";
DROP TABLE "legado_bak_tipo_pacotes";

CREATE TABLE "legado_user_convites" (
  "id" TEXT PRIMARY KEY,
  "invited_user_id" TEXT,
  "invited_email" TEXT NOT NULL,
  "company_id" TEXT,
  "user_type_id" TEXT,
  "invited_by" TEXT NOT NULL,
  "invited_by_role" TEXT NOT NULL,
  "status" TEXT NOT NULL,
  "created_at" TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  "accepted_at" TEXT,
  "cancelled_at" TEXT,
  "expires_at" TEXT NOT NULL,
  "uso_individual" INTEGER NOT NULL DEFAULT 0,
  CONSTRAINT "user_convites_company_id_fkey" FOREIGN KEY ("company_id") REFERENCES "legado_companies" ("id") ON DELETE CASCADE,
  CONSTRAINT "user_convites_invited_by_fkey" FOREIGN KEY ("invited_by") REFERENCES "legado_users" ("id") ON DELETE CASCADE,
  CONSTRAINT "user_convites_invited_user_id_fkey" FOREIGN KEY ("invited_user_id") REFERENCES "legado_users" ("id") ON DELETE SET NULL,
  CONSTRAINT "user_convites_user_type_id_fkey" FOREIGN KEY ("user_type_id") REFERENCES "legado_user_types" ("id") ON DELETE NO ACTION
);
INSERT INTO "legado_user_convites" ("id", "invited_user_id", "invited_email", "company_id", "user_type_id", "invited_by", "invited_by_role", "status", "created_at", "accepted_at", "cancelled_at", "expires_at", "uso_individual") SELECT "id", "invited_user_id", "invited_email", "company_id", "user_type_id", "invited_by", "invited_by_role", "status", "created_at", "accepted_at", "cancelled_at", "expires_at", "uso_individual" FROM "legado_bak_user_convites";
DROP TABLE "legado_bak_user_convites";

CREATE TABLE "legado_user_message_template_themes" (
  "id" TEXT PRIMARY KEY,
  "user_id" TEXT NOT NULL,
  "company_id" TEXT,
  "categoria" TEXT NOT NULL,
  "nome" TEXT NOT NULL,
  "asset_url" TEXT NOT NULL,
  "storage_path" TEXT,
  "width_px" INTEGER NOT NULL DEFAULT 0,
  "height_px" INTEGER NOT NULL DEFAULT 0,
  "title_style" TEXT NOT NULL,
  "body_style" TEXT NOT NULL,
  "signature_style" TEXT NOT NULL,
  "ativo" INTEGER NOT NULL DEFAULT 0,
  "created_at" TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  "updated_at" TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  "categoria_id" TEXT,
  "scope" TEXT NOT NULL,
  "greeting_text" TEXT,
  "mensagem_max_linhas" INTEGER NOT NULL DEFAULT 0,
  "mensagem_max_palavras" INTEGER NOT NULL DEFAULT 0,
  "assinatura_max_linhas" INTEGER NOT NULL DEFAULT 0,
  "assinatura_max_palavras" INTEGER NOT NULL DEFAULT 0,
  "logo_url" TEXT,
  "logo_path" TEXT,
  CONSTRAINT "user_message_template_themes_categoria_id_fkey" FOREIGN KEY ("categoria_id") REFERENCES "legado_crm_template_categories" ("id") ON DELETE NO ACTION,
  CONSTRAINT "user_message_template_themes_company_id_fkey" FOREIGN KEY ("company_id") REFERENCES "legado_companies" ("id") ON DELETE SET NULL,
  CONSTRAINT "user_message_template_themes_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "legado_users" ("id") ON DELETE CASCADE
);
INSERT INTO "legado_user_message_template_themes" ("id", "user_id", "company_id", "categoria", "nome", "asset_url", "storage_path", "width_px", "height_px", "title_style", "body_style", "signature_style", "ativo", "created_at", "updated_at", "categoria_id", "scope", "greeting_text", "mensagem_max_linhas", "mensagem_max_palavras", "assinatura_max_linhas", "assinatura_max_palavras", "logo_url", "logo_path") SELECT "id", "user_id", "company_id", "categoria", "nome", "asset_url", "storage_path", "width_px", "height_px", "title_style", "body_style", "signature_style", "ativo", "created_at", "updated_at", "categoria_id", "scope", "greeting_text", "mensagem_max_linhas", "mensagem_max_palavras", "assinatura_max_linhas", "assinatura_max_palavras", "logo_url", "logo_path" FROM "legado_bak_user_message_template_themes";
DROP TABLE "legado_bak_user_message_template_themes";

CREATE TABLE "legado_user_message_templates" (
  "id" TEXT PRIMARY KEY,
  "user_id" TEXT NOT NULL,
  "company_id" TEXT,
  "nome" TEXT NOT NULL,
  "categoria" TEXT,
  "assunto" TEXT,
  "titulo" TEXT NOT NULL,
  "corpo" TEXT NOT NULL,
  "assinatura" TEXT,
  "template_base_url" TEXT,
  "ativo" INTEGER NOT NULL DEFAULT 0,
  "created_at" TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  "updated_at" TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  "theme_id" TEXT,
  "title_style" TEXT NOT NULL,
  "body_style" TEXT NOT NULL,
  "signature_style" TEXT NOT NULL,
  "layout_key" TEXT NOT NULL,
  "scope" TEXT NOT NULL,
  CONSTRAINT "user_message_templates_company_id_fkey" FOREIGN KEY ("company_id") REFERENCES "legado_companies" ("id") ON DELETE SET NULL,
  CONSTRAINT "user_message_templates_theme_id_fkey" FOREIGN KEY ("theme_id") REFERENCES "legado_user_message_template_themes" ("id") ON DELETE SET NULL,
  CONSTRAINT "user_message_templates_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "legado_users" ("id") ON DELETE CASCADE
);
INSERT INTO "legado_user_message_templates" ("id", "user_id", "company_id", "nome", "categoria", "assunto", "titulo", "corpo", "assinatura", "template_base_url", "ativo", "created_at", "updated_at", "theme_id", "title_style", "body_style", "signature_style", "layout_key", "scope") SELECT "id", "user_id", "company_id", "nome", "categoria", "assunto", "titulo", "corpo", "assinatura", "template_base_url", "ativo", "created_at", "updated_at", "theme_id", "title_style", "body_style", "signature_style", "layout_key", "scope" FROM "legado_bak_user_message_templates";
DROP TABLE "legado_bak_user_message_templates";

CREATE TABLE "legado_user_type_default_perms" (
  "id" TEXT PRIMARY KEY,
  "user_type_id" TEXT NOT NULL,
  "modulo" TEXT NOT NULL,
  "permissao" TEXT NOT NULL,
  "ativo" INTEGER NOT NULL DEFAULT 0,
  "created_at" TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  "updated_at" TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  CONSTRAINT "user_type_default_perms_user_type_id_fkey" FOREIGN KEY ("user_type_id") REFERENCES "legado_user_types" ("id") ON DELETE CASCADE
);
INSERT INTO "legado_user_type_default_perms" ("id", "user_type_id", "modulo", "permissao", "ativo", "created_at", "updated_at") SELECT "id", "user_type_id", "modulo", "permissao", "ativo", "created_at", "updated_at" FROM "legado_bak_user_type_default_perms";
DROP TABLE "legado_bak_user_type_default_perms";

CREATE TABLE "legado_vendas" (
  "id" TEXT PRIMARY KEY,
  "cliente_id" TEXT NOT NULL,
  "destino_id" TEXT NOT NULL,
  "data_lancamento" TEXT NOT NULL,
  "data_embarque" TEXT,
  "created_at" TEXT,
  "updated_at" TEXT,
  "produto_id" TEXT,
  "valor_total" REAL,
  "status" TEXT,
  "notas" TEXT,
  "numero_venda" TEXT,
  "cancelada" INTEGER NOT NULL DEFAULT 0,
  "vendedor_id" TEXT,
  "destino_cidade_id" TEXT,
  "data_final" TEXT,
  "desconto_comercial_aplicado" INTEGER,
  "desconto_comercial_valor" REAL,
  "valor_total_bruto" REAL,
  "valor_total_pago" REAL,
  "valor_taxas" REAL,
  "valor_nao_comissionado" REAL,
  "company_id" TEXT,
  "data_venda" TEXT NOT NULL,
  UNIQUE ("numero_venda"),
  CONSTRAINT "vendas_cliente_id_fkey" FOREIGN KEY ("cliente_id") REFERENCES "legado_clientes" ("id") ON DELETE NO ACTION,
  CONSTRAINT "vendas_company_id_fkey" FOREIGN KEY ("company_id") REFERENCES "legado_companies" ("id") ON DELETE NO ACTION,
  CONSTRAINT "vendas_destino_cidade_id_fkey" FOREIGN KEY ("destino_cidade_id") REFERENCES "legado_cidades" ("id") ON DELETE NO ACTION,
  CONSTRAINT "vendas_destino_id_fkey" FOREIGN KEY ("destino_id") REFERENCES "legado_produtos" ("id") ON DELETE NO ACTION,
  CONSTRAINT "vendas_produto_id_fkey" FOREIGN KEY ("produto_id") REFERENCES "legado_tipo_produtos" ("id") ON DELETE NO ACTION,
  CONSTRAINT "vendas_vendedor_id_fkey" FOREIGN KEY ("vendedor_id") REFERENCES "legado_users" ("id") ON DELETE NO ACTION
);
INSERT INTO "legado_vendas" ("id", "cliente_id", "destino_id", "data_lancamento", "data_embarque", "created_at", "updated_at", "produto_id", "valor_total", "status", "notas", "numero_venda", "cancelada", "vendedor_id", "destino_cidade_id", "data_final", "desconto_comercial_aplicado", "desconto_comercial_valor", "valor_total_bruto", "valor_total_pago", "valor_taxas", "valor_nao_comissionado", "company_id", "data_venda") SELECT "id", "cliente_id", "destino_id", "data_lancamento", "data_embarque", "created_at", "updated_at", "produto_id", "valor_total", "status", "notas", "numero_venda", "cancelada", "vendedor_id", "destino_cidade_id", "data_final", "desconto_comercial_aplicado", "desconto_comercial_valor", "valor_total_bruto", "valor_total_pago", "valor_taxas", "valor_nao_comissionado", "company_id", "data_venda" FROM "legado_bak_vendas";
DROP TABLE "legado_bak_vendas";

CREATE TABLE "legado_vendas_recibos" (
  "id" TEXT PRIMARY KEY,
  "venda_id" TEXT NOT NULL,
  "produto_id" TEXT,
  "numero_recibo" TEXT,
  "valor_total" REAL,
  "valor_taxas" REAL,
  "created_at" TEXT,
  "updated_at" TEXT,
  "data_inicio" TEXT,
  "data_fim" TEXT,
  "produto_resolvido_id" TEXT,
  "numero_reserva" TEXT,
  "contrato_path" TEXT,
  "contrato_url" TEXT,
  "tipo_pacote" TEXT,
  "valor_rav" REAL,
  "valor_du" REAL,
  "data_venda" TEXT,
  "cancelado_por_conciliacao_em" TEXT,
  "cancelado_por_conciliacao_observacao" TEXT,
  "numero_recibo_normalizado" TEXT,
  "destino_cidade_id" TEXT,
  CONSTRAINT "vendas_recibos_destino_cidade_id_fkey" FOREIGN KEY ("destino_cidade_id") REFERENCES "legado_cidades" ("id") ON DELETE SET NULL,
  CONSTRAINT "vendas_recibos_produto_id_fkey" FOREIGN KEY ("produto_id") REFERENCES "legado_tipo_produtos" ("id") ON DELETE NO ACTION,
  CONSTRAINT "vendas_recibos_produto_resolvido_id_fkey" FOREIGN KEY ("produto_resolvido_id") REFERENCES "legado_produtos" ("id") ON DELETE NO ACTION,
  CONSTRAINT "vendas_recibos_venda_id_fkey" FOREIGN KEY ("venda_id") REFERENCES "legado_vendas" ("id") ON DELETE CASCADE
);
INSERT INTO "legado_vendas_recibos" ("id", "venda_id", "produto_id", "numero_recibo", "valor_total", "valor_taxas", "created_at", "updated_at", "data_inicio", "data_fim", "produto_resolvido_id", "numero_reserva", "contrato_path", "contrato_url", "tipo_pacote", "valor_rav", "valor_du", "data_venda", "cancelado_por_conciliacao_em", "cancelado_por_conciliacao_observacao", "numero_recibo_normalizado", "destino_cidade_id") SELECT "id", "venda_id", "produto_id", "numero_recibo", "valor_total", "valor_taxas", "created_at", "updated_at", "data_inicio", "data_fim", "produto_resolvido_id", "numero_reserva", "contrato_path", "contrato_url", "tipo_pacote", "valor_rav", "valor_du", "data_venda", "cancelado_por_conciliacao_em", "cancelado_por_conciliacao_observacao", "numero_recibo_normalizado", "destino_cidade_id" FROM "legado_bak_vendas_recibos";
DROP TABLE "legado_bak_vendas_recibos";

CREATE TABLE "legado_vendas_recibos_complementares" (
  "id" TEXT PRIMARY KEY,
  "venda_id" TEXT NOT NULL,
  "recibo_id" TEXT NOT NULL,
  "created_at" TEXT,
  CONSTRAINT "vendas_recibos_complementares_recibo_id_fkey" FOREIGN KEY ("recibo_id") REFERENCES "legado_vendas_recibos" ("id") ON DELETE CASCADE,
  CONSTRAINT "vendas_recibos_complementares_venda_id_fkey" FOREIGN KEY ("venda_id") REFERENCES "legado_vendas" ("id") ON DELETE CASCADE
);
INSERT INTO "legado_vendas_recibos_complementares" ("id", "venda_id", "recibo_id", "created_at") SELECT "id", "venda_id", "recibo_id", "created_at" FROM "legado_bak_vendas_recibos_complementares";
DROP TABLE "legado_bak_vendas_recibos_complementares";

CREATE TABLE "legado_vendas_recibos_notas" (
  "id" TEXT PRIMARY KEY,
  "venda_id" TEXT NOT NULL,
  "recibo_id" TEXT NOT NULL,
  "company_id" TEXT NOT NULL,
  "notas" TEXT NOT NULL,
  "created_at" TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  "updated_at" TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  CONSTRAINT "vendas_recibos_notas_company_id_fkey" FOREIGN KEY ("company_id") REFERENCES "legado_companies" ("id") ON DELETE NO ACTION,
  CONSTRAINT "vendas_recibos_notas_recibo_id_fkey" FOREIGN KEY ("recibo_id") REFERENCES "legado_vendas_recibos" ("id") ON DELETE CASCADE,
  CONSTRAINT "vendas_recibos_notas_venda_id_fkey" FOREIGN KEY ("venda_id") REFERENCES "legado_vendas" ("id") ON DELETE CASCADE
);
INSERT INTO "legado_vendas_recibos_notas" ("id", "venda_id", "recibo_id", "company_id", "notas", "created_at", "updated_at") SELECT "id", "venda_id", "recibo_id", "company_id", "notas", "created_at", "updated_at" FROM "legado_bak_vendas_recibos_notas";
DROP TABLE "legado_bak_vendas_recibos_notas";

CREATE TABLE "legado_viagens" (
  "id" TEXT PRIMARY KEY,
  "venda_id" TEXT,
  "orcamento_id" TEXT,
  "company_id" TEXT NOT NULL,
  "responsavel_user_id" TEXT,
  "origem" TEXT,
  "destino" TEXT,
  "data_inicio" TEXT,
  "data_fim" TEXT,
  "status" TEXT NOT NULL,
  "observacoes" TEXT,
  "created_at" TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  "updated_at" TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  "cliente_id" TEXT,
  "recibo_id" TEXT,
  "follow_up_text" TEXT,
  "follow_up_fechado" INTEGER NOT NULL DEFAULT 0,
  CONSTRAINT "viagens_cliente_id_fkey" FOREIGN KEY ("cliente_id") REFERENCES "legado_clientes" ("id") ON DELETE NO ACTION,
  CONSTRAINT "viagens_company_id_fkey" FOREIGN KEY ("company_id") REFERENCES "legado_companies" ("id") ON DELETE NO ACTION,
  CONSTRAINT "viagens_recibo_id_fkey" FOREIGN KEY ("recibo_id") REFERENCES "legado_vendas_recibos" ("id") ON DELETE CASCADE,
  CONSTRAINT "viagens_responsavel_user_id_fkey" FOREIGN KEY ("responsavel_user_id") REFERENCES "legado_users" ("id") ON DELETE NO ACTION,
  CONSTRAINT "viagens_venda_id_fkey" FOREIGN KEY ("venda_id") REFERENCES "legado_vendas" ("id") ON DELETE SET NULL
);
INSERT INTO "legado_viagens" ("id", "venda_id", "orcamento_id", "company_id", "responsavel_user_id", "origem", "destino", "data_inicio", "data_fim", "status", "observacoes", "created_at", "updated_at", "cliente_id", "recibo_id", "follow_up_text", "follow_up_fechado") SELECT "id", "venda_id", "orcamento_id", "company_id", "responsavel_user_id", "origem", "destino", "data_inicio", "data_fim", "status", "observacoes", "created_at", "updated_at", "cliente_id", "recibo_id", "follow_up_text", "follow_up_fechado" FROM "legado_bak_viagens";
DROP TABLE "legado_bak_viagens";

CREATE TABLE "legado_vouchers" (
  "id" TEXT PRIMARY KEY,
  "company_id" TEXT NOT NULL,
  "created_by" TEXT,
  "updated_by" TEXT,
  "provider" TEXT NOT NULL,
  "nome" TEXT NOT NULL,
  "codigo_sistema" TEXT,
  "codigo_fornecedor" TEXT,
  "reserva_online" TEXT,
  "operador" TEXT,
  "resumo" TEXT,
  "data_inicio" TEXT,
  "data_fim" TEXT,
  "ativo" INTEGER NOT NULL DEFAULT 0,
  "created_at" TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  "updated_at" TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  "passageiros" TEXT,
  "tipo_acomodacao" TEXT,
  "extra_data" TEXT NOT NULL,
  "viagem_id" TEXT,
  CONSTRAINT "vouchers_company_id_fkey" FOREIGN KEY ("company_id") REFERENCES "legado_companies" ("id") ON DELETE CASCADE,
  CONSTRAINT "vouchers_created_by_fkey" FOREIGN KEY ("created_by") REFERENCES "legado_users" ("id") ON DELETE SET NULL,
  CONSTRAINT "vouchers_updated_by_fkey" FOREIGN KEY ("updated_by") REFERENCES "legado_users" ("id") ON DELETE SET NULL,
  CONSTRAINT "vouchers_viagem_id_fkey" FOREIGN KEY ("viagem_id") REFERENCES "legado_viagens" ("id") ON DELETE SET NULL
);
INSERT INTO "legado_vouchers" ("id", "company_id", "created_by", "updated_by", "provider", "nome", "codigo_sistema", "codigo_fornecedor", "reserva_online", "operador", "resumo", "data_inicio", "data_fim", "ativo", "created_at", "updated_at", "passageiros", "tipo_acomodacao", "extra_data", "viagem_id") SELECT "id", "company_id", "created_by", "updated_by", "provider", "nome", "codigo_sistema", "codigo_fornecedor", "reserva_online", "operador", "resumo", "data_inicio", "data_fim", "ativo", "created_at", "updated_at", "passageiros", "tipo_acomodacao", "extra_data", "viagem_id" FROM "legado_bak_vouchers";
DROP TABLE "legado_bak_vouchers";

CREATE TABLE "legado_cliente_acompanhantes" (
  "id" TEXT PRIMARY KEY,
  "cliente_id" TEXT NOT NULL,
  "company_id" TEXT NOT NULL,
  "nome_completo" TEXT NOT NULL,
  "cpf" TEXT,
  "rg" TEXT,
  "telefone" TEXT,
  "grau_parentesco" TEXT,
  "data_nascimento" TEXT,
  "observacoes" TEXT,
  "ativo" INTEGER NOT NULL DEFAULT 0,
  "created_by" TEXT,
  "created_at" TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  "updated_at" TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  CONSTRAINT "cliente_acompanhantes_cliente_id_fkey" FOREIGN KEY ("cliente_id") REFERENCES "legado_clientes" ("id") ON DELETE CASCADE,
  CONSTRAINT "cliente_acompanhantes_company_id_fkey" FOREIGN KEY ("company_id") REFERENCES "legado_companies" ("id") ON DELETE NO ACTION,
  CONSTRAINT "cliente_acompanhantes_created_by_fkey" FOREIGN KEY ("created_by") REFERENCES "legado_users" ("id") ON DELETE NO ACTION
);
INSERT INTO "legado_cliente_acompanhantes" ("id", "cliente_id", "company_id", "nome_completo", "cpf", "rg", "telefone", "grau_parentesco", "data_nascimento", "observacoes", "ativo", "created_by", "created_at", "updated_at") SELECT "id", "cliente_id", "company_id", "nome_completo", "cpf", "rg", "telefone", "grau_parentesco", "data_nascimento", "observacoes", "ativo", "created_by", "created_at", "updated_at" FROM "legado_bak_cliente_acompanhantes";
DROP TABLE "legado_bak_cliente_acompanhantes";

CREATE TABLE "legado_cliente_template_dispatches" (
  "id" TEXT PRIMARY KEY,
  "user_id" TEXT NOT NULL,
  "company_id" TEXT,
  "cliente_id" TEXT NOT NULL,
  "template_id" TEXT,
  "canal" TEXT NOT NULL,
  "categoria" TEXT NOT NULL,
  "status" TEXT NOT NULL,
  "recipient_name" TEXT,
  "recipient_contact" TEXT,
  "subject" TEXT,
  "sent_at" TEXT NOT NULL,
  "sent_day" TEXT NOT NULL,
  "created_at" TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  "updated_at" TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  CONSTRAINT "cliente_template_dispatches_cliente_id_fkey" FOREIGN KEY ("cliente_id") REFERENCES "legado_clientes" ("id") ON DELETE CASCADE,
  CONSTRAINT "cliente_template_dispatches_company_id_fkey" FOREIGN KEY ("company_id") REFERENCES "legado_companies" ("id") ON DELETE SET NULL,
  CONSTRAINT "cliente_template_dispatches_template_id_fkey" FOREIGN KEY ("template_id") REFERENCES "legado_user_message_templates" ("id") ON DELETE SET NULL,
  CONSTRAINT "cliente_template_dispatches_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "legado_users" ("id") ON DELETE CASCADE
);
INSERT INTO "legado_cliente_template_dispatches" ("id", "user_id", "company_id", "cliente_id", "template_id", "canal", "categoria", "status", "recipient_name", "recipient_contact", "subject", "sent_at", "sent_day", "created_at", "updated_at") SELECT "id", "user_id", "company_id", "cliente_id", "template_id", "canal", "categoria", "status", "recipient_name", "recipient_contact", "subject", "sent_at", "sent_day", "created_at", "updated_at" FROM "legado_bak_cliente_template_dispatches";
DROP TABLE "legado_bak_cliente_template_dispatches";

CREATE TABLE "legado_comissoes" (
  "id" TEXT PRIMARY KEY,
  "venda_id" TEXT,
  "vendedor_id" TEXT,
  "regra_id" TEXT,
  "valor_venda" REAL NOT NULL DEFAULT 0,
  "valor_comissionavel" REAL NOT NULL DEFAULT 0,
  "percentual_aplicado" REAL NOT NULL DEFAULT 0,
  "valor_comissao" REAL NOT NULL DEFAULT 0,
  "status" TEXT NOT NULL,
  "data_pagamento" TEXT,
  "observacoes_pagamento" TEXT,
  "pago_por" TEXT,
  "mes_referencia" INTEGER,
  "ano_referencia" INTEGER,
  "company_id" TEXT,
  "created_by" TEXT,
  "created_at" TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  "updated_at" TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  "recibo_id" TEXT,
  CONSTRAINT "comissoes_company_id_fkey" FOREIGN KEY ("company_id") REFERENCES "legado_companies" ("id") ON DELETE CASCADE,
  CONSTRAINT "comissoes_created_by_fkey" FOREIGN KEY ("created_by") REFERENCES "legado_users" ("id") ON DELETE SET NULL,
  CONSTRAINT "comissoes_pago_por_fkey" FOREIGN KEY ("pago_por") REFERENCES "legado_users" ("id") ON DELETE SET NULL,
  CONSTRAINT "comissoes_recibo_id_fkey" FOREIGN KEY ("recibo_id") REFERENCES "legado_vendas_recibos" ("id") ON DELETE SET NULL,
  CONSTRAINT "comissoes_venda_id_fkey" FOREIGN KEY ("venda_id") REFERENCES "legado_vendas" ("id") ON DELETE SET NULL,
  CONSTRAINT "comissoes_vendedor_id_fkey" FOREIGN KEY ("vendedor_id") REFERENCES "legado_users" ("id") ON DELETE SET NULL
);
INSERT INTO "legado_comissoes" ("id", "venda_id", "vendedor_id", "regra_id", "valor_venda", "valor_comissionavel", "percentual_aplicado", "valor_comissao", "status", "data_pagamento", "observacoes_pagamento", "pago_por", "mes_referencia", "ano_referencia", "company_id", "created_by", "created_at", "updated_at", "recibo_id") SELECT "id", "venda_id", "vendedor_id", "regra_id", "valor_venda", "valor_comissionavel", "percentual_aplicado", "valor_comissao", "status", "data_pagamento", "observacoes_pagamento", "pago_por", "mes_referencia", "ano_referencia", "company_id", "created_by", "created_at", "updated_at", "recibo_id" FROM "legado_bak_comissoes";
DROP TABLE "legado_bak_comissoes";

CREATE TABLE "legado_conciliacao_recibos" (
  "id" TEXT PRIMARY KEY,
  "company_id" TEXT NOT NULL,
  "documento" TEXT NOT NULL,
  "movimento_data" TEXT,
  "status" TEXT NOT NULL,
  "descricao" TEXT,
  "valor_lancamentos" REAL,
  "valor_taxas" REAL,
  "valor_descontos" REAL,
  "valor_abatimentos" REAL,
  "valor_calculada_loja" REAL,
  "valor_visao_master" REAL,
  "valor_opfax" REAL,
  "valor_saldo" REAL,
  "origem" TEXT,
  "raw" TEXT,
  "conciliado" INTEGER NOT NULL DEFAULT 0,
  "match_total" INTEGER,
  "match_taxas" INTEGER,
  "sistema_valor_total" REAL,
  "sistema_valor_taxas" REAL,
  "diff_total" REAL,
  "diff_taxas" REAL,
  "venda_id" TEXT,
  "venda_recibo_id" TEXT,
  "imported_by" TEXT,
  "last_checked_at" TEXT,
  "conciliado_em" TEXT,
  "created_at" TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  "updated_at" TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  "ranking_vendedor_id" TEXT,
  "ranking_produto_id" TEXT,
  "ranking_assigned_by" TEXT,
  "ranking_assigned_at" TEXT,
  "descricao_chave" TEXT NOT NULL,
  "valor_venda_real" REAL,
  "valor_comissao_loja" REAL,
  "percentual_comissao_loja" REAL,
  "faixa_comissao" TEXT,
  "is_seguro_viagem" INTEGER NOT NULL DEFAULT 0,
  "is_baixa_rac" INTEGER NOT NULL DEFAULT 0,
  "valor_nao_comissionavel" REAL,
  "numero_reserva" TEXT,
  CONSTRAINT "conciliacao_recibos_company_id_fkey" FOREIGN KEY ("company_id") REFERENCES "legado_companies" ("id") ON DELETE CASCADE,
  CONSTRAINT "conciliacao_recibos_imported_by_fkey" FOREIGN KEY ("imported_by") REFERENCES "legado_users" ("id") ON DELETE SET NULL,
  CONSTRAINT "conciliacao_recibos_ranking_assigned_by_fkey" FOREIGN KEY ("ranking_assigned_by") REFERENCES "legado_users" ("id") ON DELETE SET NULL,
  CONSTRAINT "conciliacao_recibos_ranking_produto_id_fkey" FOREIGN KEY ("ranking_produto_id") REFERENCES "legado_tipo_produtos" ("id") ON DELETE SET NULL,
  CONSTRAINT "conciliacao_recibos_ranking_vendedor_id_fkey" FOREIGN KEY ("ranking_vendedor_id") REFERENCES "legado_users" ("id") ON DELETE SET NULL,
  CONSTRAINT "conciliacao_recibos_venda_id_fkey" FOREIGN KEY ("venda_id") REFERENCES "legado_vendas" ("id") ON DELETE SET NULL,
  CONSTRAINT "conciliacao_recibos_venda_recibo_id_fkey" FOREIGN KEY ("venda_recibo_id") REFERENCES "legado_vendas_recibos" ("id") ON DELETE SET NULL
);
INSERT INTO "legado_conciliacao_recibos" ("id", "company_id", "documento", "movimento_data", "status", "descricao", "valor_lancamentos", "valor_taxas", "valor_descontos", "valor_abatimentos", "valor_calculada_loja", "valor_visao_master", "valor_opfax", "valor_saldo", "origem", "raw", "conciliado", "match_total", "match_taxas", "sistema_valor_total", "sistema_valor_taxas", "diff_total", "diff_taxas", "venda_id", "venda_recibo_id", "imported_by", "last_checked_at", "conciliado_em", "created_at", "updated_at", "ranking_vendedor_id", "ranking_produto_id", "ranking_assigned_by", "ranking_assigned_at", "descricao_chave", "valor_venda_real", "valor_comissao_loja", "percentual_comissao_loja", "faixa_comissao", "is_seguro_viagem", "is_baixa_rac", "valor_nao_comissionavel", "numero_reserva") SELECT "id", "company_id", "documento", "movimento_data", "status", "descricao", "valor_lancamentos", "valor_taxas", "valor_descontos", "valor_abatimentos", "valor_calculada_loja", "valor_visao_master", "valor_opfax", "valor_saldo", "origem", "raw", "conciliado", "match_total", "match_taxas", "sistema_valor_total", "sistema_valor_taxas", "diff_total", "diff_taxas", "venda_id", "venda_recibo_id", "imported_by", "last_checked_at", "conciliado_em", "created_at", "updated_at", "ranking_vendedor_id", "ranking_produto_id", "ranking_assigned_by", "ranking_assigned_at", "descricao_chave", "valor_venda_real", "valor_comissao_loja", "percentual_comissao_loja", "faixa_comissao", "is_seguro_viagem", "is_baixa_rac", "valor_nao_comissionavel", "numero_reserva" FROM "legado_bak_conciliacao_recibos";
DROP TABLE "legado_bak_conciliacao_recibos";

CREATE TABLE "legado_escala_dia" (
  "id" TEXT PRIMARY KEY,
  "escala_mes_id" TEXT NOT NULL,
  "usuario_id" TEXT NOT NULL,
  "data" TEXT NOT NULL,
  "tipo" TEXT NOT NULL,
  "hora_inicio" TEXT,
  "hora_fim" TEXT,
  "observacao" TEXT,
  "created_at" TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  "updated_at" TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  UNIQUE ("escala_mes_id", "usuario_id", "data"),
  CONSTRAINT "escala_dia_escala_mes_id_fkey" FOREIGN KEY ("escala_mes_id") REFERENCES "legado_escala_mes" ("id") ON DELETE CASCADE,
  CONSTRAINT "escala_dia_usuario_id_fkey" FOREIGN KEY ("usuario_id") REFERENCES "legado_users" ("id") ON DELETE CASCADE
);
INSERT INTO "legado_escala_dia" ("id", "escala_mes_id", "usuario_id", "data", "tipo", "hora_inicio", "hora_fim", "observacao", "created_at", "updated_at") SELECT "id", "escala_mes_id", "usuario_id", "data", "tipo", "hora_inicio", "hora_fim", "observacao", "created_at", "updated_at" FROM "legado_bak_escala_dia";
DROP TABLE "legado_bak_escala_dia";

CREATE TABLE "legado_historico_viagens_real" (
  "id" TEXT PRIMARY KEY,
  "venda_id" TEXT NOT NULL,
  "cliente_id" TEXT NOT NULL,
  "destino_id" TEXT NOT NULL,
  "data_viagem" TEXT,
  "produto" TEXT,
  "valor" REAL,
  "recibos" TEXT,
  "notas" TEXT,
  "created_at" TEXT,
  "updated_at" TEXT,
  "valor_total" REAL,
  CONSTRAINT "historico_viagens_real_cliente_id_fkey" FOREIGN KEY ("cliente_id") REFERENCES "legado_clientes" ("id") ON DELETE CASCADE,
  CONSTRAINT "historico_viagens_real_destino_id_fkey" FOREIGN KEY ("destino_id") REFERENCES "legado_produtos" ("id") ON DELETE NO ACTION,
  CONSTRAINT "historico_viagens_real_venda_id_fkey" FOREIGN KEY ("venda_id") REFERENCES "legado_vendas" ("id") ON DELETE NO ACTION
);
INSERT INTO "legado_historico_viagens_real" ("id", "venda_id", "cliente_id", "destino_id", "data_viagem", "produto", "valor", "recibos", "notas", "created_at", "updated_at", "valor_total") SELECT "id", "venda_id", "cliente_id", "destino_id", "data_viagem", "produto", "valor", "recibos", "notas", "created_at", "updated_at", "valor_total" FROM "legado_bak_historico_viagens_real";
DROP TABLE "legado_bak_historico_viagens_real";

CREATE TABLE "legado_mural_recado_respostas" (
  "id" TEXT PRIMARY KEY,
  "recado_id" TEXT NOT NULL,
  "company_id" TEXT NOT NULL,
  "sender_id" TEXT NOT NULL,
  "conteudo" TEXT NOT NULL,
  "created_at" TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  CONSTRAINT "mural_recado_respostas_company_id_fkey" FOREIGN KEY ("company_id") REFERENCES "legado_companies" ("id") ON DELETE CASCADE,
  CONSTRAINT "mural_recado_respostas_recado_id_fkey" FOREIGN KEY ("recado_id") REFERENCES "legado_mural_recados" ("id") ON DELETE CASCADE,
  CONSTRAINT "mural_recado_respostas_sender_id_fkey" FOREIGN KEY ("sender_id") REFERENCES "legado_users" ("id") ON DELETE CASCADE
);
INSERT INTO "legado_mural_recado_respostas" ("id", "recado_id", "company_id", "sender_id", "conteudo", "created_at") SELECT "id", "recado_id", "company_id", "sender_id", "conteudo", "created_at" FROM "legado_bak_mural_recado_respostas";
DROP TABLE "legado_bak_mural_recado_respostas";

CREATE TABLE "legado_ranking_recibo_contribuicoes" (
  "id" TEXT PRIMARY KEY,
  "source_key" TEXT NOT NULL,
  "company_id" TEXT NOT NULL,
  "mes" TEXT NOT NULL,
  "data_recibo" TEXT NOT NULL,
  "vendedor_id" TEXT NOT NULL,
  "cliente_id" TEXT,
  "venda_id" TEXT,
  "recibo_id" TEXT,
  "venda_key" TEXT NOT NULL,
  "recibo_numero" TEXT,
  "produto_id" TEXT,
  "produto_nome" TEXT,
  "destino_nome" TEXT,
  "valor_bruto" REAL NOT NULL DEFAULT 0,
  "valor_taxas" REAL NOT NULL DEFAULT 0,
  "valor_seguro" REAL NOT NULL DEFAULT 0,
  "is_seguro" INTEGER NOT NULL DEFAULT 0,
  "fator" REAL NOT NULL DEFAULT 0,
  "source_bruto" REAL NOT NULL DEFAULT 0,
  "source_taxas" REAL NOT NULL DEFAULT 0,
  "origem" TEXT NOT NULL,
  "built_at" TEXT NOT NULL,
  "updated_at" TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  UNIQUE ("source_key"),
  CONSTRAINT "ranking_recibo_contribuicoes_cliente_id_fkey" FOREIGN KEY ("cliente_id") REFERENCES "legado_clientes" ("id") ON DELETE SET NULL,
  CONSTRAINT "ranking_recibo_contribuicoes_company_id_fkey" FOREIGN KEY ("company_id") REFERENCES "legado_companies" ("id") ON DELETE CASCADE,
  CONSTRAINT "ranking_recibo_contribuicoes_produto_id_fkey" FOREIGN KEY ("produto_id") REFERENCES "legado_tipo_produtos" ("id") ON DELETE SET NULL,
  CONSTRAINT "ranking_recibo_contribuicoes_recibo_id_fkey" FOREIGN KEY ("recibo_id") REFERENCES "legado_vendas_recibos" ("id") ON DELETE SET NULL,
  CONSTRAINT "ranking_recibo_contribuicoes_venda_id_fkey" FOREIGN KEY ("venda_id") REFERENCES "legado_vendas" ("id") ON DELETE SET NULL,
  CONSTRAINT "ranking_recibo_contribuicoes_vendedor_id_fkey" FOREIGN KEY ("vendedor_id") REFERENCES "legado_users" ("id") ON DELETE CASCADE
);
INSERT INTO "legado_ranking_recibo_contribuicoes" ("id", "source_key", "company_id", "mes", "data_recibo", "vendedor_id", "cliente_id", "venda_id", "recibo_id", "venda_key", "recibo_numero", "produto_id", "produto_nome", "destino_nome", "valor_bruto", "valor_taxas", "valor_seguro", "is_seguro", "fator", "source_bruto", "source_taxas", "origem", "built_at", "updated_at") SELECT "id", "source_key", "company_id", "mes", "data_recibo", "vendedor_id", "cliente_id", "venda_id", "recibo_id", "venda_key", "recibo_numero", "produto_id", "produto_nome", "destino_nome", "valor_bruto", "valor_taxas", "valor_seguro", "is_seguro", "fator", "source_bruto", "source_taxas", "origem", "built_at", "updated_at" FROM "legado_bak_ranking_recibo_contribuicoes";
DROP TABLE "legado_bak_ranking_recibo_contribuicoes";

CREATE TABLE "legado_recibos" (
  "id" TEXT PRIMARY KEY,
  "venda_id" TEXT NOT NULL,
  "produto_id" TEXT NOT NULL,
  "valor" REAL NOT NULL DEFAULT 0,
  "descricao" TEXT,
  "created_at" TEXT,
  CONSTRAINT "recibos_produto_id_fkey" FOREIGN KEY ("produto_id") REFERENCES "legado_tipo_produtos" ("id") ON DELETE NO ACTION,
  CONSTRAINT "recibos_venda_id_fkey" FOREIGN KEY ("venda_id") REFERENCES "legado_vendas" ("id") ON DELETE NO ACTION
);
INSERT INTO "legado_recibos" ("id", "venda_id", "produto_id", "valor", "descricao", "created_at") SELECT "id", "venda_id", "produto_id", "valor", "descricao", "created_at" FROM "legado_bak_recibos";
DROP TABLE "legado_bak_recibos";

CREATE TABLE "legado_system_documentation_section_versions" (
  "id" TEXT PRIMARY KEY,
  "section_id" TEXT NOT NULL,
  "slug" TEXT NOT NULL,
  "role_scope" TEXT NOT NULL,
  "module_key" TEXT NOT NULL,
  "route_pattern" TEXT,
  "title" TEXT NOT NULL,
  "summary" TEXT,
  "content_markdown" TEXT NOT NULL,
  "tone" TEXT NOT NULL,
  "sort_order" INTEGER NOT NULL DEFAULT 0,
  "is_active" INTEGER NOT NULL DEFAULT 0,
  "action" TEXT NOT NULL,
  "created_at" TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  "created_by" TEXT,
  CONSTRAINT "system_documentation_section_versions_created_by_fkey" FOREIGN KEY ("created_by") REFERENCES "legado_users" ("id") ON DELETE NO ACTION,
  CONSTRAINT "system_documentation_section_versions_section_id_fkey" FOREIGN KEY ("section_id") REFERENCES "legado_system_documentation_sections" ("id") ON DELETE CASCADE
);
INSERT INTO "legado_system_documentation_section_versions" ("id", "section_id", "slug", "role_scope", "module_key", "route_pattern", "title", "summary", "content_markdown", "tone", "sort_order", "is_active", "action", "created_at", "created_by") SELECT "id", "section_id", "slug", "role_scope", "module_key", "route_pattern", "title", "summary", "content_markdown", "tone", "sort_order", "is_active", "action", "created_at", "created_by" FROM "legado_bak_system_documentation_section_versions";
DROP TABLE "legado_bak_system_documentation_section_versions";

CREATE TABLE "legado_vendas_pagamentos" (
  "id" TEXT PRIMARY KEY,
  "venda_id" TEXT NOT NULL,
  "forma_pagamento_id" TEXT,
  "company_id" TEXT NOT NULL,
  "forma_nome" TEXT,
  "operacao" TEXT,
  "plano" TEXT,
  "valor_bruto" REAL,
  "desconto_valor" REAL,
  "valor_total" REAL,
  "parcelas" TEXT,
  "parcelas_qtd" INTEGER,
  "parcelas_valor" REAL,
  "vencimento_primeira" TEXT,
  "paga_comissao" INTEGER,
  "observacoes" TEXT,
  "created_at" TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  "updated_at" TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  "venda_recibo_id" TEXT,
  CONSTRAINT "vendas_pagamentos_company_id_fkey" FOREIGN KEY ("company_id") REFERENCES "legado_companies" ("id") ON DELETE NO ACTION,
  CONSTRAINT "vendas_pagamentos_forma_pagamento_id_fkey" FOREIGN KEY ("forma_pagamento_id") REFERENCES "legado_formas_pagamento" ("id") ON DELETE SET NULL,
  CONSTRAINT "vendas_pagamentos_venda_id_fkey" FOREIGN KEY ("venda_id") REFERENCES "legado_vendas" ("id") ON DELETE CASCADE,
  CONSTRAINT "vendas_pagamentos_venda_recibo_id_fkey" FOREIGN KEY ("venda_recibo_id") REFERENCES "legado_vendas_recibos" ("id") ON DELETE SET NULL
);
INSERT INTO "legado_vendas_pagamentos" ("id", "venda_id", "forma_pagamento_id", "company_id", "forma_nome", "operacao", "plano", "valor_bruto", "desconto_valor", "valor_total", "parcelas", "parcelas_qtd", "parcelas_valor", "vencimento_primeira", "paga_comissao", "observacoes", "created_at", "updated_at", "venda_recibo_id") SELECT "id", "venda_id", "forma_pagamento_id", "company_id", "forma_nome", "operacao", "plano", "valor_bruto", "desconto_valor", "valor_total", "parcelas", "parcelas_qtd", "parcelas_valor", "vencimento_primeira", "paga_comissao", "observacoes", "created_at", "updated_at", "venda_recibo_id" FROM "legado_bak_vendas_pagamentos";
DROP TABLE "legado_bak_vendas_pagamentos";

CREATE TABLE "legado_vendas_recibos_rateio" (
  "id" TEXT PRIMARY KEY,
  "venda_recibo_id" TEXT,
  "company_id" TEXT NOT NULL,
  "vendedor_origem_id" TEXT NOT NULL,
  "vendedor_destino_id" TEXT NOT NULL,
  "percentual_origem" REAL NOT NULL DEFAULT 0,
  "percentual_destino" REAL NOT NULL DEFAULT 0,
  "ativo" INTEGER NOT NULL DEFAULT 0,
  "observacao" TEXT,
  "created_by" TEXT,
  "updated_by" TEXT,
  "created_at" TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  "updated_at" TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  "conciliacao_recibo_id" TEXT,
  CONSTRAINT "vendas_recibos_rateio_company_id_fkey" FOREIGN KEY ("company_id") REFERENCES "legado_companies" ("id") ON DELETE CASCADE,
  CONSTRAINT "vendas_recibos_rateio_conciliacao_recibo_id_fkey" FOREIGN KEY ("conciliacao_recibo_id") REFERENCES "legado_conciliacao_recibos" ("id") ON DELETE CASCADE,
  CONSTRAINT "vendas_recibos_rateio_created_by_fkey" FOREIGN KEY ("created_by") REFERENCES "legado_users" ("id") ON DELETE SET NULL,
  CONSTRAINT "vendas_recibos_rateio_updated_by_fkey" FOREIGN KEY ("updated_by") REFERENCES "legado_users" ("id") ON DELETE SET NULL,
  CONSTRAINT "vendas_recibos_rateio_venda_recibo_id_fkey" FOREIGN KEY ("venda_recibo_id") REFERENCES "legado_vendas_recibos" ("id") ON DELETE CASCADE,
  CONSTRAINT "vendas_recibos_rateio_vendedor_destino_id_fkey" FOREIGN KEY ("vendedor_destino_id") REFERENCES "legado_users" ("id") ON DELETE RESTRICT,
  CONSTRAINT "vendas_recibos_rateio_vendedor_origem_id_fkey" FOREIGN KEY ("vendedor_origem_id") REFERENCES "legado_users" ("id") ON DELETE RESTRICT
);
INSERT INTO "legado_vendas_recibos_rateio" ("id", "venda_recibo_id", "company_id", "vendedor_origem_id", "vendedor_destino_id", "percentual_origem", "percentual_destino", "ativo", "observacao", "created_by", "updated_by", "created_at", "updated_at", "conciliacao_recibo_id") SELECT "id", "venda_recibo_id", "company_id", "vendedor_origem_id", "vendedor_destino_id", "percentual_origem", "percentual_destino", "ativo", "observacao", "created_by", "updated_by", "created_at", "updated_at", "conciliacao_recibo_id" FROM "legado_bak_vendas_recibos_rateio";
DROP TABLE "legado_bak_vendas_recibos_rateio";

CREATE TABLE "legado_viagem_acompanhantes" (
  "id" TEXT PRIMARY KEY,
  "viagem_id" TEXT NOT NULL,
  "acompanhante_id" TEXT NOT NULL,
  "company_id" TEXT NOT NULL,
  "papel" TEXT,
  "documento_url" TEXT,
  "observacoes" TEXT,
  "created_by" TEXT,
  "created_at" TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  "updated_at" TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  CONSTRAINT "viagem_acompanhantes_acompanhante_id_fkey" FOREIGN KEY ("acompanhante_id") REFERENCES "legado_cliente_acompanhantes" ("id") ON DELETE CASCADE,
  CONSTRAINT "viagem_acompanhantes_company_id_fkey" FOREIGN KEY ("company_id") REFERENCES "legado_companies" ("id") ON DELETE NO ACTION,
  CONSTRAINT "viagem_acompanhantes_created_by_fkey" FOREIGN KEY ("created_by") REFERENCES "legado_users" ("id") ON DELETE NO ACTION,
  CONSTRAINT "viagem_acompanhantes_viagem_id_fkey" FOREIGN KEY ("viagem_id") REFERENCES "legado_viagens" ("id") ON DELETE CASCADE
);
INSERT INTO "legado_viagem_acompanhantes" ("id", "viagem_id", "acompanhante_id", "company_id", "papel", "documento_url", "observacoes", "created_by", "created_at", "updated_at") SELECT "id", "viagem_id", "acompanhante_id", "company_id", "papel", "documento_url", "observacoes", "created_by", "created_at", "updated_at" FROM "legado_bak_viagem_acompanhantes";
DROP TABLE "legado_bak_viagem_acompanhantes";

CREATE TABLE "legado_viagem_documentos" (
  "id" TEXT PRIMARY KEY,
  "viagem_id" TEXT NOT NULL,
  "company_id" TEXT NOT NULL,
  "titulo" TEXT NOT NULL,
  "tipo" TEXT,
  "url" TEXT,
  "mime_type" TEXT,
  "size_bytes" INTEGER,
  "expires_at" TEXT,
  "created_by" TEXT,
  "created_at" TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  "updated_at" TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  CONSTRAINT "viagem_documentos_company_id_fkey" FOREIGN KEY ("company_id") REFERENCES "legado_companies" ("id") ON DELETE NO ACTION,
  CONSTRAINT "viagem_documentos_created_by_fkey" FOREIGN KEY ("created_by") REFERENCES "legado_users" ("id") ON DELETE NO ACTION,
  CONSTRAINT "viagem_documentos_viagem_id_fkey" FOREIGN KEY ("viagem_id") REFERENCES "legado_viagens" ("id") ON DELETE CASCADE
);
INSERT INTO "legado_viagem_documentos" ("id", "viagem_id", "company_id", "titulo", "tipo", "url", "mime_type", "size_bytes", "expires_at", "created_by", "created_at", "updated_at") SELECT "id", "viagem_id", "company_id", "titulo", "tipo", "url", "mime_type", "size_bytes", "expires_at", "created_by", "created_at", "updated_at" FROM "legado_bak_viagem_documentos";
DROP TABLE "legado_bak_viagem_documentos";

CREATE TABLE "legado_viagem_passageiros" (
  "id" TEXT PRIMARY KEY,
  "viagem_id" TEXT NOT NULL,
  "cliente_id" TEXT NOT NULL,
  "company_id" TEXT NOT NULL,
  "papel" TEXT NOT NULL,
  "observacoes" TEXT,
  "created_by" TEXT,
  "created_at" TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  "updated_at" TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  CONSTRAINT "viagem_passageiros_cliente_id_fkey" FOREIGN KEY ("cliente_id") REFERENCES "legado_clientes" ("id") ON DELETE CASCADE,
  CONSTRAINT "viagem_passageiros_company_id_fkey" FOREIGN KEY ("company_id") REFERENCES "legado_companies" ("id") ON DELETE NO ACTION,
  CONSTRAINT "viagem_passageiros_created_by_fkey" FOREIGN KEY ("created_by") REFERENCES "legado_users" ("id") ON DELETE NO ACTION,
  CONSTRAINT "viagem_passageiros_viagem_id_fkey" FOREIGN KEY ("viagem_id") REFERENCES "legado_viagens" ("id") ON DELETE CASCADE
);
INSERT INTO "legado_viagem_passageiros" ("id", "viagem_id", "cliente_id", "company_id", "papel", "observacoes", "created_by", "created_at", "updated_at") SELECT "id", "viagem_id", "cliente_id", "company_id", "papel", "observacoes", "created_by", "created_at", "updated_at" FROM "legado_bak_viagem_passageiros";
DROP TABLE "legado_bak_viagem_passageiros";

CREATE TABLE "legado_viagem_servicos" (
  "id" TEXT PRIMARY KEY,
  "viagem_id" TEXT NOT NULL,
  "company_id" TEXT NOT NULL,
  "tipo" TEXT,
  "fornecedor" TEXT,
  "descricao" TEXT,
  "status" TEXT,
  "data_inicio" TEXT,
  "data_fim" TEXT,
  "valor" REAL,
  "moeda" TEXT,
  "voucher_url" TEXT,
  "observacoes" TEXT,
  "created_by" TEXT,
  "created_at" TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  "updated_at" TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  CONSTRAINT "viagem_servicos_company_id_fkey" FOREIGN KEY ("company_id") REFERENCES "legado_companies" ("id") ON DELETE NO ACTION,
  CONSTRAINT "viagem_servicos_created_by_fkey" FOREIGN KEY ("created_by") REFERENCES "legado_users" ("id") ON DELETE NO ACTION,
  CONSTRAINT "viagem_servicos_viagem_id_fkey" FOREIGN KEY ("viagem_id") REFERENCES "legado_viagens" ("id") ON DELETE CASCADE
);
INSERT INTO "legado_viagem_servicos" ("id", "viagem_id", "company_id", "tipo", "fornecedor", "descricao", "status", "data_inicio", "data_fim", "valor", "moeda", "voucher_url", "observacoes", "created_by", "created_at", "updated_at") SELECT "id", "viagem_id", "company_id", "tipo", "fornecedor", "descricao", "status", "data_inicio", "data_fim", "valor", "moeda", "voucher_url", "observacoes", "created_by", "created_at", "updated_at" FROM "legado_bak_viagem_servicos";
DROP TABLE "legado_bak_viagem_servicos";

CREATE TABLE "legado_voucher_dias" (
  "id" TEXT PRIMARY KEY,
  "voucher_id" TEXT NOT NULL,
  "dia_numero" INTEGER NOT NULL DEFAULT 0,
  "titulo" TEXT,
  "descricao" TEXT NOT NULL,
  "data_referencia" TEXT,
  "cidade" TEXT,
  "ordem" INTEGER NOT NULL DEFAULT 0,
  "created_at" TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  CONSTRAINT "voucher_dias_voucher_id_fkey" FOREIGN KEY ("voucher_id") REFERENCES "legado_vouchers" ("id") ON DELETE CASCADE
);
INSERT INTO "legado_voucher_dias" ("id", "voucher_id", "dia_numero", "titulo", "descricao", "data_referencia", "cidade", "ordem", "created_at") SELECT "id", "voucher_id", "dia_numero", "titulo", "descricao", "data_referencia", "cidade", "ordem", "created_at" FROM "legado_bak_voucher_dias";
DROP TABLE "legado_bak_voucher_dias";

CREATE TABLE "legado_voucher_hoteis" (
  "id" TEXT PRIMARY KEY,
  "voucher_id" TEXT NOT NULL,
  "cidade" TEXT NOT NULL,
  "hotel" TEXT NOT NULL,
  "endereco" TEXT,
  "data_inicio" TEXT,
  "data_fim" TEXT,
  "noites" INTEGER,
  "telefone" TEXT,
  "contato" TEXT,
  "status" TEXT,
  "observacao" TEXT,
  "ordem" INTEGER NOT NULL DEFAULT 0,
  "created_at" TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  CONSTRAINT "voucher_hoteis_voucher_id_fkey" FOREIGN KEY ("voucher_id") REFERENCES "legado_vouchers" ("id") ON DELETE CASCADE
);
INSERT INTO "legado_voucher_hoteis" ("id", "voucher_id", "cidade", "hotel", "endereco", "data_inicio", "data_fim", "noites", "telefone", "contato", "status", "observacao", "ordem", "created_at") SELECT "id", "voucher_id", "cidade", "hotel", "endereco", "data_inicio", "data_fim", "noites", "telefone", "contato", "status", "observacao", "ordem", "created_at" FROM "legado_bak_voucher_hoteis";
DROP TABLE "legado_bak_voucher_hoteis";

CREATE TABLE "legado_conciliacao_recibo_changes" (
  "id" TEXT PRIMARY KEY,
  "company_id" TEXT NOT NULL,
  "conciliacao_recibo_id" TEXT,
  "venda_id" TEXT,
  "venda_recibo_id" TEXT,
  "numero_recibo" TEXT,
  "field" TEXT NOT NULL,
  "old_value" REAL,
  "new_value" REAL,
  "actor" TEXT NOT NULL,
  "changed_by" TEXT,
  "changed_at" TEXT NOT NULL,
  "reverted_at" TEXT,
  "reverted_by" TEXT,
  "revert_reason" TEXT,
  CONSTRAINT "conciliacao_recibo_changes_changed_by_fkey" FOREIGN KEY ("changed_by") REFERENCES "legado_users" ("id") ON DELETE SET NULL,
  CONSTRAINT "conciliacao_recibo_changes_company_id_fkey" FOREIGN KEY ("company_id") REFERENCES "legado_companies" ("id") ON DELETE CASCADE,
  CONSTRAINT "conciliacao_recibo_changes_conciliacao_recibo_id_fkey" FOREIGN KEY ("conciliacao_recibo_id") REFERENCES "legado_conciliacao_recibos" ("id") ON DELETE SET NULL,
  CONSTRAINT "conciliacao_recibo_changes_reverted_by_fkey" FOREIGN KEY ("reverted_by") REFERENCES "legado_users" ("id") ON DELETE SET NULL,
  CONSTRAINT "conciliacao_recibo_changes_venda_id_fkey" FOREIGN KEY ("venda_id") REFERENCES "legado_vendas" ("id") ON DELETE SET NULL,
  CONSTRAINT "conciliacao_recibo_changes_venda_recibo_id_fkey" FOREIGN KEY ("venda_recibo_id") REFERENCES "legado_vendas_recibos" ("id") ON DELETE SET NULL
);
INSERT INTO "legado_conciliacao_recibo_changes" ("id", "company_id", "conciliacao_recibo_id", "venda_id", "venda_recibo_id", "numero_recibo", "field", "old_value", "new_value", "actor", "changed_by", "changed_at", "reverted_at", "reverted_by", "revert_reason") SELECT "id", "company_id", "conciliacao_recibo_id", "venda_id", "venda_recibo_id", "numero_recibo", "field", "old_value", "new_value", "actor", "changed_by", "changed_at", "reverted_at", "reverted_by", "revert_reason" FROM "legado_bak_conciliacao_recibo_changes";
DROP TABLE "legado_bak_conciliacao_recibo_changes";

PRAGMA foreign_keys = ON;
CREATE INDEX IF NOT EXISTS "legado_idx_agenda_itens_categoria" ON "legado_agenda_itens" ("categoria_id");
CREATE INDEX IF NOT EXISTS "legado_idx_agenda_itens_company" ON "legado_agenda_itens" ("company_id");
CREATE INDEX IF NOT EXISTS "legado_idx_agenda_itens_end_date" ON "legado_agenda_itens" ("end_date");
CREATE INDEX IF NOT EXISTS "legado_idx_agenda_itens_prioridade" ON "legado_agenda_itens" ("prioridade");
CREATE INDEX IF NOT EXISTS "legado_idx_agenda_itens_start" ON "legado_agenda_itens" ("start_date");
CREATE INDEX IF NOT EXISTS "legado_idx_agenda_itens_start_at" ON "legado_agenda_itens" ("start_at");
CREATE INDEX IF NOT EXISTS "legado_idx_agenda_itens_status" ON "legado_agenda_itens" ("status");
CREATE INDEX IF NOT EXISTS "legado_idx_agenda_itens_user" ON "legado_agenda_itens" ("user_id");
CREATE INDEX IF NOT EXISTS "legado_idx_agenda_itens_user_tipo_created" ON "legado_agenda_itens" ("user_id", "tipo", "created_at");
CREATE INDEX IF NOT EXISTS "legado_idx_agenda_itens_user_tipo_end" ON "legado_agenda_itens" ("user_id", "tipo", "end_date");
CREATE INDEX IF NOT EXISTS "legado_idx_agenda_itens_user_tipo_start" ON "legado_agenda_itens" ("user_id", "tipo", "start_date");
CREATE INDEX IF NOT EXISTS "legado_airline_iata_aliases_alias_idx" ON "legado_airline_iata_aliases" ("alias");
CREATE INDEX IF NOT EXISTS "legado_idx_auth_passkeys_user_id" ON "legado_auth_passkeys" ("user_id");
CREATE INDEX IF NOT EXISTS "legado_idx_campanhas_company_id" ON "legado_campanhas" ("company_id");
CREATE INDEX IF NOT EXISTS "legado_idx_campanhas_data" ON "legado_campanhas" ("data_campanha");
CREATE INDEX IF NOT EXISTS "legado_idx_campanhas_status" ON "legado_campanhas" ("status");
CREATE INDEX IF NOT EXISTS "legado_idx_cidades_subdiv" ON "legado_cidades" ("subdivisao_id");
CREATE INDEX IF NOT EXISTS "legado_idx_cidades_import_targets_city_country" ON "legado_cidades_import_targets" ("pais_id", "cidade_key");
CREATE INDEX IF NOT EXISTS "legado_idx_targets_norm" ON "legado_cidades_import_targets_norm" ("pais_id", "cidade_key");
CREATE INDEX IF NOT EXISTS "legado_idx_cidades_norm_nome" ON "legado_cidades_norm_cache" ("nome_key");
CREATE INDEX IF NOT EXISTS "legado_idx_cidades_norm_nomept" ON "legado_cidades_norm_cache" ("nome_pt_key");
CREATE INDEX IF NOT EXISTS "legado_idx_cidades_norm_pais" ON "legado_cidades_norm_cache" ("pais_id");
CREATE INDEX IF NOT EXISTS "legado_idx_circuito_datas_circuito" ON "legado_circuito_datas" ("circuito_id");
CREATE INDEX IF NOT EXISTS "legado_idx_circuito_dias_circuito" ON "legado_circuito_dias" ("circuito_id");
CREATE INDEX IF NOT EXISTS "legado_idx_circuito_dias_cidades_dia" ON "legado_circuito_dias_cidades" ("circuito_dia_id");
CREATE INDEX IF NOT EXISTS "legado_cliente_template_dispatches_cliente_day_idx" ON "legado_cliente_template_dispatches" ("cliente_id", "sent_day");
CREATE INDEX IF NOT EXISTS "legado_cliente_template_dispatches_user_day_idx" ON "legado_cliente_template_dispatches" ("user_id", "sent_day", "categoria");
CREATE INDEX IF NOT EXISTS "legado_idx_clientes_company" ON "legado_clientes" ("company_id");
CREATE INDEX IF NOT EXISTS "legado_idx_clientes_company_telefone" ON "legado_clientes" ("company_id", "telefone");
CREATE INDEX IF NOT EXISTS "legado_idx_clientes_created_by" ON "legado_clientes" ("created_by");
CREATE INDEX IF NOT EXISTS "legado_idx_clientes_company_cliente" ON "legado_clientes_company" ("cliente_id");
CREATE INDEX IF NOT EXISTS "legado_idx_comissionamento_ativo" ON "legado_comissionamento_geral" ("ativo");
CREATE INDEX IF NOT EXISTS "legado_idx_comissionamento_produto" ON "legado_comissionamento_geral" ("produto_id");
CREATE INDEX IF NOT EXISTS "legado_idx_comissoes_company" ON "legado_comissoes" ("company_id");
CREATE INDEX IF NOT EXISTS "legado_idx_comissoes_data_pagamento" ON "legado_comissoes" ("data_pagamento");
CREATE INDEX IF NOT EXISTS "legado_idx_comissoes_lookup" ON "legado_comissoes" ("company_id", "venda_id", "vendedor_id");
CREATE INDEX IF NOT EXISTS "legado_idx_comissoes_lookup_recibo" ON "legado_comissoes" ("company_id", "recibo_id", "vendedor_id");
CREATE INDEX IF NOT EXISTS "legado_idx_comissoes_recibo" ON "legado_comissoes" ("recibo_id");
CREATE INDEX IF NOT EXISTS "legado_idx_comissoes_referencia" ON "legado_comissoes" ("ano_referencia", "mes_referencia");
CREATE INDEX IF NOT EXISTS "legado_idx_comissoes_regra" ON "legado_comissoes" ("regra_id");
CREATE INDEX IF NOT EXISTS "legado_idx_comissoes_status" ON "legado_comissoes" ("status");
CREATE INDEX IF NOT EXISTS "legado_idx_comissoes_venda" ON "legado_comissoes" ("venda_id");
CREATE INDEX IF NOT EXISTS "legado_idx_comissoes_vendedor" ON "legado_comissoes" ("vendedor_id");
CREATE INDEX IF NOT EXISTS "legado_commission_rule_company_idx" ON "legado_commission_rule" ("company_id");
CREATE INDEX IF NOT EXISTS "legado_idx_commission_rule_ativo" ON "legado_commission_rule" ("ativo");
CREATE INDEX IF NOT EXISTS "legado_idx_commission_rule_tipo" ON "legado_commission_rule" ("tipo");
CREATE INDEX IF NOT EXISTS "legado_idx_commission_tier_rule" ON "legado_commission_tier" ("rule_id");
CREATE INDEX IF NOT EXISTS "legado_company_billing_status_idx" ON "legado_company_billing" ("status");
CREATE INDEX IF NOT EXISTS "legado_company_billing_events_company_idx" ON "legado_company_billing_events" ("company_id");
CREATE INDEX IF NOT EXISTS "legado_company_billing_events_status_idx" ON "legado_company_billing_events" ("status");
CREATE INDEX IF NOT EXISTS "legado_conciliacao_execucoes_actor_created_idx" ON "legado_conciliacao_execucoes" ("actor", "created_at");
CREATE INDEX IF NOT EXISTS "legado_conciliacao_execucoes_company_created_idx" ON "legado_conciliacao_execucoes" ("company_id", "created_at");
CREATE INDEX IF NOT EXISTS "legado_conciliacao_changes_company_changed_at_idx" ON "legado_conciliacao_recibo_changes" ("company_id", "changed_at");
CREATE INDEX IF NOT EXISTS "legado_conciliacao_changes_company_reverted_idx" ON "legado_conciliacao_recibo_changes" ("company_id", "reverted_at");
CREATE INDEX IF NOT EXISTS "legado_conciliacao_changes_venda_recibo_idx" ON "legado_conciliacao_recibo_changes" ("venda_recibo_id");
CREATE INDEX IF NOT EXISTS "legado_conciliacao_recibos_company_doc_idx" ON "legado_conciliacao_recibos" ("company_id", "documento", "movimento_data");
CREATE INDEX IF NOT EXISTS "legado_conciliacao_recibos_company_pendente_idx" ON "legado_conciliacao_recibos" ("company_id", "conciliado", "movimento_data");
CREATE INDEX IF NOT EXISTS "legado_conciliacao_recibos_documento_idx" ON "legado_conciliacao_recibos" ("documento");
CREATE INDEX IF NOT EXISTS "legado_conciliacao_recibos_is_baixa_rac_idx" ON "legado_conciliacao_recibos" ("company_id", "is_baixa_rac", "movimento_data");
CREATE INDEX IF NOT EXISTS "legado_conciliacao_recibos_ranking_status_idx" ON "legado_conciliacao_recibos" ("company_id", "is_baixa_rac", "ranking_vendedor_id", "status", "movimento_data");
CREATE INDEX IF NOT EXISTS "legado_conciliacao_recibos_ranking_vendedor_idx" ON "legado_conciliacao_recibos" ("company_id", "ranking_vendedor_id", "movimento_data");
CREATE INDEX IF NOT EXISTS "legado_consultorias_online_data_hora_idx" ON "legado_consultorias_online" ("data_hora");
CREATE INDEX IF NOT EXISTS "legado_consultorias_online_fechada_idx" ON "legado_consultorias_online" ("fechada");
CREATE INDEX IF NOT EXISTS "legado_consultorias_online_lembrete_enviado_idx" ON "legado_consultorias_online" ("lembrete_enviado_em");
CREATE INDEX IF NOT EXISTS "legado_idx_crm_message_templates_active" ON "legado_crm_message_templates" ("is_active");
CREATE INDEX IF NOT EXISTS "legado_idx_crm_message_templates_category" ON "legado_crm_message_templates" ("category");
CREATE INDEX IF NOT EXISTS "legado_dashboard_widgets_usuario_ordem_idx" ON "legado_dashboard_widgets" ("usuario_id", "ordem");
CREATE INDEX IF NOT EXISTS "legado_idx_dashboard_widgets_usuario_ordem" ON "legado_dashboard_widgets" ("usuario_id", "ordem");
CREATE INDEX IF NOT EXISTS "legado_idx_documentos_viagens_company_created" ON "legado_documentos_viagens" ("company_id", "created_at");
CREATE INDEX IF NOT EXISTS "legado_idx_documentos_viagens_uploader" ON "legado_documentos_viagens" ("uploaded_by", "created_at");
CREATE INDEX IF NOT EXISTS "legado_escala_dia_data_idx" ON "legado_escala_dia" ("data");
CREATE INDEX IF NOT EXISTS "legado_escala_dia_mes_idx" ON "legado_escala_dia" ("escala_mes_id");
CREATE INDEX IF NOT EXISTS "legado_escala_dia_usuario_idx" ON "legado_escala_dia" ("usuario_id");
CREATE INDEX IF NOT EXISTS "legado_idx_escala_horario_usuario_company" ON "legado_escala_horario_usuario" ("company_id");
CREATE INDEX IF NOT EXISTS "legado_escala_mes_company_idx" ON "legado_escala_mes" ("company_id");
CREATE INDEX IF NOT EXISTS "legado_escala_mes_gestor_idx" ON "legado_escala_mes" ("gestor_id");
CREATE INDEX IF NOT EXISTS "legado_estados_pais_id_idx" ON "legado_estados" ("pais_id");
CREATE INDEX IF NOT EXISTS "legado_feriados_company_idx" ON "legado_feriados" ("company_id");
CREATE INDEX IF NOT EXISTS "legado_feriados_data_idx" ON "legado_feriados" ("data");
CREATE INDEX IF NOT EXISTS "legado_financeiro_empresas_company_idx" ON "legado_financeiro_empresas" ("company_id");
CREATE INDEX IF NOT EXISTS "legado_financeiro_empresas_financeiro_idx" ON "legado_financeiro_empresas" ("financeiro_id");
CREATE INDEX IF NOT EXISTS "legado_idx_formas_pagamento_company" ON "legado_formas_pagamento" ("company_id");
CREATE INDEX IF NOT EXISTS "legado_idx_fornecedores_company" ON "legado_fornecedores" ("company_id");
CREATE INDEX IF NOT EXISTS "legado_idx_gestor_equipe_compartilhada_base" ON "legado_gestor_equipe_compartilhada" ("gestor_base_id");
CREATE INDEX IF NOT EXISTS "legado_idx_gestor_vendedor_company" ON "legado_gestor_vendedor" ("company_id");
CREATE INDEX IF NOT EXISTS "legado_idx_gestor_vendedor_gestor" ON "legado_gestor_vendedor" ("gestor_id");
CREATE INDEX IF NOT EXISTS "legado_idx_gestor_vendedor_vendedor" ON "legado_gestor_vendedor" ("vendedor_id");
CREATE INDEX IF NOT EXISTS "legado_idx_historico_viagens_cliente_id" ON "legado_historico_viagens_real" ("cliente_id");
CREATE INDEX IF NOT EXISTS "legado_idx_historico_viagens_real_destino_id" ON "legado_historico_viagens_real" ("destino_id");
CREATE INDEX IF NOT EXISTS "legado_idx_historico_viagens_venda_id" ON "legado_historico_viagens_real" ("venda_id");
CREATE INDEX IF NOT EXISTS "legado_lgpd_consentimentos_cliente_idx" ON "legado_lgpd_consentimentos" ("cliente_id");
CREATE INDEX IF NOT EXISTS "legado_lgpd_consentimentos_email_idx" ON "legado_lgpd_consentimentos" ("titular_email");
CREATE INDEX IF NOT EXISTS "legado_lgpd_consentimentos_finalidade_idx" ON "legado_lgpd_consentimentos" ("finalidade", "consentido");
CREATE INDEX IF NOT EXISTS "legado_lgpd_solicitacoes_email_idx" ON "legado_lgpd_solicitacoes" ("titular_email");
CREATE INDEX IF NOT EXISTS "legado_lgpd_solicitacoes_status_idx" ON "legado_lgpd_solicitacoes" ("status");
CREATE INDEX IF NOT EXISTS "legado_idx_logs_acao_created_at_desc" ON "legado_logs" ("acao", "created_at");
CREATE INDEX IF NOT EXISTS "legado_idx_logs_created_at_desc" ON "legado_logs" ("created_at");
CREATE INDEX IF NOT EXISTS "legado_idx_logs_modulo_created_at_desc" ON "legado_logs" ("modulo", "created_at");
CREATE INDEX IF NOT EXISTS "legado_idx_logs_user_id_created_at_desc" ON "legado_logs" ("user_id", "created_at");
CREATE INDEX IF NOT EXISTS "legado_logs_acao_idx" ON "legado_logs" ("acao");
CREATE INDEX IF NOT EXISTS "legado_logs_created_at_idx" ON "legado_logs" ("created_at");
CREATE INDEX IF NOT EXISTS "legado_logs_modulo_idx" ON "legado_logs" ("modulo");
CREATE INDEX IF NOT EXISTS "legado_logs_user_id_idx" ON "legado_logs" ("user_id");
CREATE INDEX IF NOT EXISTS "legado_master_documents_master_id_idx" ON "legado_master_documents" ("master_id");
CREATE INDEX IF NOT EXISTS "legado_master_empresas_company_idx" ON "legado_master_empresas" ("company_id");
CREATE INDEX IF NOT EXISTS "legado_master_empresas_master_idx" ON "legado_master_empresas" ("master_id");
CREATE INDEX IF NOT EXISTS "legado_master_empresas_status_idx" ON "legado_master_empresas" ("status");
CREATE INDEX IF NOT EXISTS "legado_idx_menu_prefs_updated_at" ON "legado_menu_prefs" ("updated_at");
CREATE INDEX IF NOT EXISTS "legado_idx_message_templates_v2_ativo" ON "legado_message_templates_v2" ("ativo");
CREATE INDEX IF NOT EXISTS "legado_idx_message_templates_v2_categoria" ON "legado_message_templates_v2" ("categoria");
CREATE INDEX IF NOT EXISTS "legado_idx_message_templates_v2_created_by" ON "legado_message_templates_v2" ("created_by");
CREATE INDEX IF NOT EXISTS "legado_idx_message_templates_v2_ocasiao" ON "legado_message_templates_v2" ("ocasiao");
CREATE INDEX IF NOT EXISTS "legado_idx_message_templates_v2_scope" ON "legado_message_templates_v2" ("scope");
CREATE INDEX IF NOT EXISTS "legado_idx_message_templates_v2_slug" ON "legado_message_templates_v2" ("slug");
CREATE INDEX IF NOT EXISTS "legado_idx_message_templates_v2_theme" ON "legado_message_templates_v2" ("theme_id");
CREATE INDEX IF NOT EXISTS "legado_idx_metas_ativo" ON "legado_metas_vendedor" ("ativo");
CREATE INDEX IF NOT EXISTS "legado_idx_metas_periodo" ON "legado_metas_vendedor" ("periodo");
CREATE INDEX IF NOT EXISTS "legado_idx_metas_vendedor" ON "legado_metas_vendedor" ("vendedor_id");
CREATE INDEX IF NOT EXISTS "legado_metas_vendedor_produto_meta_idx" ON "legado_metas_vendedor_produto" ("meta_vendedor_id");
CREATE INDEX IF NOT EXISTS "legado_metas_vendedor_produto_produto_idx" ON "legado_metas_vendedor_produto" ("produto_id");
CREATE INDEX IF NOT EXISTS "legado_idx_minhas_preferencias_cidade" ON "legado_minhas_preferencias" ("cidade_id");
CREATE INDEX IF NOT EXISTS "legado_idx_minhas_preferencias_company_created" ON "legado_minhas_preferencias" ("company_id", "created_at");
CREATE INDEX IF NOT EXISTS "legado_idx_minhas_preferencias_owner" ON "legado_minhas_preferencias" ("created_by", "created_at");
CREATE INDEX IF NOT EXISTS "legado_idx_minhas_preferencias_tipo" ON "legado_minhas_preferencias" ("tipo_produto_id");
CREATE INDEX IF NOT EXISTS "legado_idx_minhas_preferencias_shares_by" ON "legado_minhas_preferencias_shares" ("shared_by", "created_at");
CREATE INDEX IF NOT EXISTS "legado_idx_minhas_preferencias_shares_company" ON "legado_minhas_preferencias_shares" ("company_id", "created_at");
CREATE INDEX IF NOT EXISTS "legado_idx_minhas_preferencias_shares_with" ON "legado_minhas_preferencias_shares" ("shared_with", "created_at");
CREATE INDEX IF NOT EXISTS "legado_idx_modulo_acesso_ativo" ON "legado_modulo_acesso" ("ativo");
CREATE INDEX IF NOT EXISTS "legado_idx_modulo_acesso_modulo" ON "legado_modulo_acesso" ("modulo");
CREATE INDEX IF NOT EXISTS "legado_idx_modulo_acesso_usuario" ON "legado_modulo_acesso" ("usuario_id");
CREATE INDEX IF NOT EXISTS "legado_idx_mural_respostas_company_created" ON "legado_mural_recado_respostas" ("company_id", "created_at");
CREATE INDEX IF NOT EXISTS "legado_idx_mural_respostas_recado_created" ON "legado_mural_recado_respostas" ("recado_id", "created_at");
CREATE INDEX IF NOT EXISTS "legado_idx_mural_recados_company_created" ON "legado_mural_recados" ("company_id", "created_at");
CREATE INDEX IF NOT EXISTS "legado_idx_mural_recados_receiver_created" ON "legado_mural_recados" ("receiver_id", "created_at");
CREATE INDEX IF NOT EXISTS "legado_idx_mural_recados_sender_created" ON "legado_mural_recados" ("sender_id", "created_at");
CREATE INDEX IF NOT EXISTS "legado_idx_mural_recados_arquivos_company_created" ON "legado_mural_recados_arquivos" ("company_id", "created_at");
CREATE INDEX IF NOT EXISTS "legado_idx_mural_recados_arquivos_recado" ON "legado_mural_recados_arquivos" ("recado_id");
CREATE INDEX IF NOT EXISTS "legado_idx_mural_recados_leituras_user_company" ON "legado_mural_recados_leituras" ("company_id", "user_id");
CREATE INDEX IF NOT EXISTS "legado_idx_paises_codigo" ON "legado_paises" ("codigo_iso");
CREATE INDEX IF NOT EXISTS "legado_idx_parametros_cambios_company_moeda" ON "legado_parametros_cambios" ("company_id", "moeda");
CREATE INDEX IF NOT EXISTS "legado_parametros_comissao_company_idx" ON "legado_parametros_comissao" ("company_id");
CREATE INDEX IF NOT EXISTS "legado_parametros_comissao_owner_idx" ON "legado_parametros_comissao" ("owner_user_id");
CREATE INDEX IF NOT EXISTS "legado_plans_ativo_idx" ON "legado_plans" ("ativo");
CREATE INDEX IF NOT EXISTS "legado_idx_product_commission_rule_produto" ON "legado_product_commission_rule" ("produto_id");
CREATE INDEX IF NOT EXISTS "legado_idx_product_commission_rule_rule" ON "legado_product_commission_rule" ("rule_id");
CREATE INDEX IF NOT EXISTS "legado_idx_product_comm_rule_pacote_produto" ON "legado_product_commission_rule_pacote" ("produto_id");
CREATE INDEX IF NOT EXISTS "legado_idx_destinos_ativo" ON "legado_produtos" ("ativo");
CREATE INDEX IF NOT EXISTS "legado_idx_destinos_cidade_id" ON "legado_produtos" ("cidade_id");
CREATE INDEX IF NOT EXISTS "legado_idx_destinos_nome" ON "legado_produtos" ("nome");
CREATE INDEX IF NOT EXISTS "legado_idx_produtos_circuito_id" ON "legado_produtos" ("circuito_id");
CREATE INDEX IF NOT EXISTS "legado_idx_produtos_fornecedor" ON "legado_produtos" ("fornecedor_id");
CREATE INDEX IF NOT EXISTS "legado_idx_produtos_tarifas_produto" ON "legado_produtos_tarifas" ("produto_id");
CREATE INDEX IF NOT EXISTS "legado_quote_client_id_idx" ON "legado_quote" ("client_id");
CREATE INDEX IF NOT EXISTS "legado_quote_created_by_idx" ON "legado_quote" ("created_by");
CREATE INDEX IF NOT EXISTS "legado_quote_status_idx" ON "legado_quote" ("status");
CREATE INDEX IF NOT EXISTS "legado_quote_import_log_quote_idx" ON "legado_quote_import_log" ("quote_id");
CREATE INDEX IF NOT EXISTS "legado_quote_item_order_idx" ON "legado_quote_item" ("quote_id", "order_index");
CREATE INDEX IF NOT EXISTS "legado_quote_item_quote_id_idx" ON "legado_quote_item" ("quote_id");
CREATE INDEX IF NOT EXISTS "legado_quote_item_segment_item_idx" ON "legado_quote_item_segment" ("quote_item_id");
CREATE INDEX IF NOT EXISTS "legado_quote_print_settings_company_idx" ON "legado_quote_print_settings" ("company_id");
CREATE INDEX IF NOT EXISTS "legado_idx_ranking_read_model_status_lookup" ON "legado_ranking_read_model_status" ("modelo", "company_id", "mes", "status");
CREATE INDEX IF NOT EXISTS "legado_idx_ranking_recibo_contribuicoes_company_mes" ON "legado_ranking_recibo_contribuicoes" ("company_id", "mes");
CREATE INDEX IF NOT EXISTS "legado_idx_ranking_recibo_contribuicoes_vendedor_mes" ON "legado_ranking_recibo_contribuicoes" ("company_id", "mes", "vendedor_id");
CREATE INDEX IF NOT EXISTS "legado_roteiro_dia_company_idx" ON "legado_roteiro_dia" ("company_id");
CREATE INDEX IF NOT EXISTS "legado_roteiro_sugestoes_company_tipo_idx" ON "legado_roteiro_sugestoes" ("company_id", "tipo");
CREATE INDEX IF NOT EXISTS "legado_idx_sac_controle_company" ON "legado_sac_controle" ("company_id");
CREATE INDEX IF NOT EXISTS "legado_idx_sac_controle_data" ON "legado_sac_controle" ("data_solicitacao");
CREATE INDEX IF NOT EXISTS "legado_idx_sac_interacoes_sac" ON "legado_sac_interacoes" ("sac_id");
CREATE INDEX IF NOT EXISTS "legado_idx_security_audit_weekly_runs_ran_at" ON "legado_security_audit_weekly_runs" ("ran_at");
CREATE INDEX IF NOT EXISTS "legado_idx_security_audit_weekly_runs_status" ON "legado_security_audit_weekly_runs" ("status", "ran_at");
CREATE INDEX IF NOT EXISTS "legado_security_rate_limits_expires_at_idx" ON "legado_security_rate_limits" ("expires_at");
CREATE INDEX IF NOT EXISTS "legado_idx_subdivisoes_codigo" ON "legado_subdivisoes" ("codigo_admin1");
CREATE INDEX IF NOT EXISTS "legado_idx_subdivisoes_pais" ON "legado_subdivisoes" ("pais_id");
CREATE INDEX IF NOT EXISTS "legado_idx_system_documentation_section_versions_section" ON "legado_system_documentation_section_versions" ("section_id", "created_at");
CREATE INDEX IF NOT EXISTS "legado_idx_system_documentation_sections_route_pattern" ON "legado_system_documentation_sections" ("route_pattern");
CREATE INDEX IF NOT EXISTS "legado_idx_system_documentation_sections_slug_sort" ON "legado_system_documentation_sections" ("slug", "role_scope", "sort_order", "title");
CREATE INDEX IF NOT EXISTS "legado_idx_system_module_settings_enabled" ON "legado_system_module_settings" ("enabled");
CREATE INDEX IF NOT EXISTS "legado_idx_system_module_settings_updated_at_desc" ON "legado_system_module_settings" ("updated_at");
CREATE INDEX IF NOT EXISTS "legado_idx_produtos_ativo" ON "legado_tipo_produtos" ("ativo");
CREATE INDEX IF NOT EXISTS "legado_idx_produtos_regra" ON "legado_tipo_produtos" ("regra_comissionamento");
CREATE INDEX IF NOT EXISTS "legado_idx_produtos_tipo" ON "legado_tipo_produtos" ("tipo");
CREATE INDEX IF NOT EXISTS "legado_idx_todo_categorias_company" ON "legado_todo_categorias" ("company_id");
CREATE INDEX IF NOT EXISTS "legado_idx_todo_categorias_user" ON "legado_todo_categorias" ("user_id");
CREATE INDEX IF NOT EXISTS "legado_idx_todo_categorias_user_nome" ON "legado_todo_categorias" ("user_id", "nome");
CREATE INDEX IF NOT EXISTS "legado_user_convites_company_status_idx" ON "legado_user_convites" ("company_id", "status", "created_at");
CREATE INDEX IF NOT EXISTS "legado_user_convites_expires_at_idx" ON "legado_user_convites" ("expires_at");
CREATE INDEX IF NOT EXISTS "legado_user_convites_invited_by_idx" ON "legado_user_convites" ("invited_by", "status", "created_at");
CREATE INDEX IF NOT EXISTS "legado_user_message_template_themes_company_idx" ON "legado_user_message_template_themes" ("company_id");
CREATE INDEX IF NOT EXISTS "legado_user_message_template_themes_user_idx" ON "legado_user_message_template_themes" ("user_id", "categoria", "nome");
CREATE INDEX IF NOT EXISTS "legado_user_message_templates_company_idx" ON "legado_user_message_templates" ("company_id");
CREATE INDEX IF NOT EXISTS "legado_user_message_templates_user_idx" ON "legado_user_message_templates" ("user_id", "nome");
CREATE INDEX IF NOT EXISTS "legado_user_type_default_perms_user_type_idx" ON "legado_user_type_default_perms" ("user_type_id");
CREATE INDEX IF NOT EXISTS "legado_idx_users_active" ON "legado_users" ("active");
CREATE INDEX IF NOT EXISTS "legado_idx_users_company_id" ON "legado_users" ("company_id");
CREATE INDEX IF NOT EXISTS "legado_idx_users_cpf" ON "legado_users" ("cpf");
CREATE INDEX IF NOT EXISTS "legado_idx_users_user_type_id" ON "legado_users" ("user_type_id");
CREATE INDEX IF NOT EXISTS "legado_idx_users_uso_individual" ON "legado_users" ("uso_individual");
CREATE INDEX IF NOT EXISTS "legado_idx_vendas_cliente_id" ON "legado_vendas" ("cliente_id");
CREATE INDEX IF NOT EXISTS "legado_idx_vendas_company" ON "legado_vendas" ("company_id");
CREATE INDEX IF NOT EXISTS "legado_idx_vendas_company_data_venda_desc" ON "legado_vendas" ("company_id", "data_venda");
CREATE INDEX IF NOT EXISTS "legado_idx_vendas_company_vendedor_data_venda_desc" ON "legado_vendas" ("company_id", "vendedor_id", "data_venda");
CREATE INDEX IF NOT EXISTS "legado_idx_vendas_data_venda" ON "legado_vendas" ("data_venda");
CREATE INDEX IF NOT EXISTS "legado_idx_vendas_destino_cidade_id" ON "legado_vendas" ("destino_cidade_id");
CREATE INDEX IF NOT EXISTS "legado_idx_vendas_destino_id" ON "legado_vendas" ("destino_id");
CREATE INDEX IF NOT EXISTS "legado_idx_vendas_produto_id" ON "legado_vendas" ("produto_id");
CREATE INDEX IF NOT EXISTS "legado_idx_vendas_vendedor_data_venda_desc" ON "legado_vendas" ("vendedor_id", "data_venda");
CREATE INDEX IF NOT EXISTS "legado_idx_vendas_pagamentos_company" ON "legado_vendas_pagamentos" ("company_id");
CREATE INDEX IF NOT EXISTS "legado_idx_vendas_pagamentos_venda" ON "legado_vendas_pagamentos" ("venda_id");
CREATE INDEX IF NOT EXISTS "legado_idx_vendas_pagamentos_venda_recibo_id" ON "legado_vendas_pagamentos" ("venda_recibo_id");
CREATE INDEX IF NOT EXISTS "legado_idx_vendas_recibos_data_venda" ON "legado_vendas_recibos" ("data_venda");
CREATE INDEX IF NOT EXISTS "legado_idx_vendas_recibos_destino_cidade" ON "legado_vendas_recibos" ("destino_cidade_id");
CREATE INDEX IF NOT EXISTS "legado_idx_vendas_recibos_produto_id" ON "legado_vendas_recibos" ("produto_id");
CREATE INDEX IF NOT EXISTS "legado_idx_vendas_recibos_produto_resolvido_id" ON "legado_vendas_recibos" ("produto_resolvido_id");
CREATE INDEX IF NOT EXISTS "legado_idx_vendas_recibos_tipo_pacote" ON "legado_vendas_recibos" ("tipo_pacote");
CREATE INDEX IF NOT EXISTS "legado_idx_vendas_recibos_venda_id" ON "legado_vendas_recibos" ("venda_id");
CREATE INDEX IF NOT EXISTS "legado_idx_vendas_recibos_comp_recibo" ON "legado_vendas_recibos_complementares" ("recibo_id");
CREATE INDEX IF NOT EXISTS "legado_idx_vendas_recibos_comp_venda" ON "legado_vendas_recibos_complementares" ("venda_id");
CREATE INDEX IF NOT EXISTS "legado_idx_vendas_recibos_notas_company" ON "legado_vendas_recibos_notas" ("company_id");
CREATE INDEX IF NOT EXISTS "legado_idx_vendas_recibos_notas_recibo" ON "legado_vendas_recibos_notas" ("recibo_id");
CREATE INDEX IF NOT EXISTS "legado_idx_vendas_recibos_notas_venda" ON "legado_vendas_recibos_notas" ("venda_id");
CREATE INDEX IF NOT EXISTS "legado_idx_vendas_recibos_rateio_company" ON "legado_vendas_recibos_rateio" ("company_id");
CREATE INDEX IF NOT EXISTS "legado_idx_vendas_recibos_rateio_destino" ON "legado_vendas_recibos_rateio" ("vendedor_destino_id");
CREATE INDEX IF NOT EXISTS "legado_idx_vendas_recibos_rateio_origem" ON "legado_vendas_recibos_rateio" ("vendedor_origem_id");
CREATE INDEX IF NOT EXISTS "legado_idx_viagem_acompanhantes_viagem" ON "legado_viagem_acompanhantes" ("viagem_id");
CREATE INDEX IF NOT EXISTS "legado_idx_viagem_documentos_company" ON "legado_viagem_documentos" ("company_id");
CREATE INDEX IF NOT EXISTS "legado_idx_viagem_documentos_viagem" ON "legado_viagem_documentos" ("viagem_id");
CREATE INDEX IF NOT EXISTS "legado_idx_viagem_passageiros_viagem" ON "legado_viagem_passageiros" ("viagem_id");
CREATE INDEX IF NOT EXISTS "legado_idx_viagem_servicos_company" ON "legado_viagem_servicos" ("company_id");
CREATE INDEX IF NOT EXISTS "legado_idx_viagem_servicos_viagem" ON "legado_viagem_servicos" ("viagem_id");
CREATE INDEX IF NOT EXISTS "legado_idx_viagens_cliente" ON "legado_viagens" ("cliente_id");
CREATE INDEX IF NOT EXISTS "legado_idx_viagens_company_status" ON "legado_viagens" ("company_id", "status");
CREATE INDEX IF NOT EXISTS "legado_idx_viagens_recibo_id" ON "legado_viagens" ("recibo_id");
CREATE INDEX IF NOT EXISTS "legado_idx_voucher_assets_company_provider" ON "legado_voucher_assets" ("company_id", "provider", "asset_kind", "ordem", "created_at");
CREATE INDEX IF NOT EXISTS "legado_idx_voucher_dias_ordem" ON "legado_voucher_dias" ("voucher_id", "ordem", "dia_numero");
CREATE INDEX IF NOT EXISTS "legado_idx_voucher_hoteis_ordem" ON "legado_voucher_hoteis" ("voucher_id", "ordem", "cidade");
CREATE INDEX IF NOT EXISTS "legado_idx_vouchers_company_provider" ON "legado_vouchers" ("company_id", "provider", "updated_at");

