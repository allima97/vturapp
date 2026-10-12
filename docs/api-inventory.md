# Inventário de contrato das APIs

Gerado por `node scripts/api-inventory.mjs` — **não editar à mão**. JSON completo em `docs/api-inventory.json`.

- Endpoints: **258** (126 gravam no banco)
- Domínios: 50
- Migrados para Hono: **249** (marcados com <sub>hono</sub>)

## Pontos de atenção (detectados automaticamente)

Heurística por análise de texto — confirmar manualmente antes de agir.

### Gravam no banco sem `requireAuthenticatedUser` (1)
- `/api/auth/convite/activate` (POST)

### Métodos de escrita sem `rejectCrossOriginRequest` (0)
- nenhum

### Gravam em tabelas de venda/conciliação sem invalidação explícita de cache (0)
Desde a migration 20260924184114 o read model v4 é marcado dirty por trigger; ainda assim o cache em memória/KV depende da invalidação na aplicação.

- nenhum

## Endpoints por domínio

Legenda: **Auth** = requireAuthenticatedUser · **Escopo** = resolveUserScope · **CSRF** = rejectCrossOriginRequest · **Body** = limite de tamanho do corpo

### [...path] (1)

| Rota | Métodos | Auth | Escopo | Perfis | CSRF | Body | Tabelas (operações) | RPC | Invalidação |
|---|---|:-:|:-:|---|:-:|:-:|---|---|---|
| `/v1/[...path]` <sub>hono</sub> | DELETE GET PATCH POST PUT |  |  |  |  |  | — | — | — |

### admin (25)

| Rota | Métodos | Auth | Escopo | Perfis | CSRF | Body | Tabelas (operações) | RPC | Invalidação |
|---|---|:-:|:-:|---|:-:|:-:|---|---|---|
| `/v1/admin/auth/mfa-status` <sub>hono</sub> | POST | ✔ | ✔ |  | ✔ | ✔ | — | — | — |
| `/v1/admin/auth/reset-mfa` <sub>hono</sub> | POST | ✔ | ✔ |  | ✔ | ✔ | — | — | — |
| `/v1/admin/auth/set-password` <sub>hono</sub> | POST | ✔ | ✔ |  | ✔ | ✔ | — | — | — |
| `/v1/admin/avisos` <sub>hono</sub> | GET POST | ✔ | ✔ | Admin Gestor Master | ✔ | ✔ | admin_avisos_templates(D/U) | — | — |
| `/v1/admin/avisos/send` <sub>hono</sub> | POST | ✔ | ✔ | Admin Gestor Master | ✔ | ✔ | — | — | — |
| `/v1/admin/crm` <sub>hono</sub> | GET POST | ✔ | ✔ | Admin | ✔ | ✔ | crm_template_categories(R), user_message_templates(R) | — | — |
| `/v1/admin/email` <sub>hono</sub> | GET POST | ✔ | ✔ | Admin | ✔ | ✔ | admin_email_settings(R/U) | — | — |
| `/v1/admin/email/test` <sub>hono</sub> | POST | ✔ | ✔ | Admin | ✔ | ✔ | — | — | — |
| `/v1/admin/empresas` <sub>hono</sub> | GET POST | ✔ | ✔ | Admin | ✔ | ✔ | companies(R/U), company_billing(C/R), master_empresas(R) | — | — |
| `/v1/admin/empresas/[id]` <sub>hono</sub> | GET PATCH | ✔ | ✔ | Admin | ✔ | ✔ | companies(R/U), company_billing(R), master_empresas(R) | — | — |
| `/v1/admin/fix-recibos` <sub>hono</sub> | GET POST | ✔ | ✔ | Admin | ✔ | ✔ | conciliacao_recibo_changes(C), conciliacao_recibos(R/U), users(R), vendas_recibos(R) | — | invalidateSalesReadModels |
| `/v1/admin/logs` <sub>hono</sub> | GET | ✔ | ✔ | Admin |  |  | logs(R) | — | — |
| `/v1/admin/maintenance` <sub>hono</sub> | GET POST | ✔ | ✔ | Admin | ✔ | ✔ | admin_system_settings(R/UP) | — | — |
| `/v1/admin/master-empresas` <sub>hono</sub> | GET POST | ✔ | ✔ | Admin | ✔ | ✔ | master_empresas(C/R) | — | — |
| `/v1/admin/modulos-sistema` <sub>hono</sub> | GET POST | ✔ | ✔ | Admin | ✔ | ✔ | system_module_settings(R/UP) | — | — |
| `/v1/admin/permissoes` <sub>hono</sub> | GET POST | ✔ | ✔ | Admin | ✔ | ✔ | modulo_acesso(R), system_module_settings(R) | — | invalidateUserReadModels |
| `/v1/admin/permissoes/[id]` <sub>hono</sub> | GET POST | ✔ | ✔ |  | ✔ | ✔ | — | — | invalidateUserReadModels |
| `/v1/admin/planos` <sub>hono</sub> | DELETE GET POST | ✔ | ✔ | Admin | ✔ | ✔ | plans(D/R/U) | — | — |
| `/v1/admin/summary` <sub>hono</sub> | GET | ✔ | ✔ | Admin |  |  | company_billing(R), master_empresas(R), plans(R) | — | — |
| `/v1/admin/system-modules` <sub>hono</sub> | GET POST | ✔ | ✔ | Admin | ✔ | ✔ | system_module_settings(R/UP) | — | — |
| `/v1/admin/tipos-usuario` <sub>hono</sub> | GET POST | ✔ | ✔ | Admin | ✔ | ✔ | user_type_default_perms(R), user_types(D/U) | — | — |
| `/v1/admin/tipos-usuario/[id]` <sub>hono</sub> | GET | ✔ | ✔ |  |  |  | users(R) | — | — |
| `/v1/admin/tipos-usuario/[id]/permissoes` <sub>hono</sub> | GET POST | ✔ | ✔ |  | ✔ | ✔ | — | — | — |
| `/v1/admin/usuarios` <sub>hono</sub> | GET POST | ✔ | ✔ | Admin Gestor | ✔ | ✔ | user_types(R), users(U/UP) | — | invalidateReadModelCache |
| `/v1/admin/usuarios/[id]` <sub>hono</sub> | GET PATCH | ✔ | ✔ | Admin | ✔ | ✔ | users(U) | — | invalidateReadModelCache |

### agenda (5)

| Rota | Métodos | Auth | Escopo | Perfis | CSRF | Body | Tabelas (operações) | RPC | Invalidação |
|---|---|:-:|:-:|---|:-:|:-:|---|---|---|
| `/v1/agenda` <sub>hono</sub> | GET | ✔ | ✔ |  |  |  | agenda_itens(R) | — | — |
| `/v1/agenda/create` <sub>hono</sub> | POST | ✔ | ✔ | Admin | ✔ | ✔ | agenda_itens(C) | — | — |
| `/v1/agenda/delete` <sub>hono</sub> | DELETE | ✔ | ✔ | Admin | ✔ |  | agenda_itens(D/R) | — | — |
| `/v1/agenda/range` <sub>hono</sub> | GET | ✔ | ✔ | Vendedor |  |  | agenda_itens(R), users(R) | — | — |
| `/v1/agenda/update` <sub>hono</sub> | PATCH POST | ✔ | ✔ | Admin | ✔ | ✔ | agenda_itens(R/U) | — | — |

### auth (9)

| Rota | Métodos | Auth | Escopo | Perfis | CSRF | Body | Tabelas (operações) | RPC | Invalidação |
|---|---|:-:|:-:|---|:-:|:-:|---|---|---|
| `/auth/convite/activate` | POST |  |  |  | ✔ | ✔ | user_convites(R/U), users(UP) | — | — |
| `/auth/login` <sub>turnstile</sub> | POST |  |  |  | ✔ | ✔ | — | — | — |
| `/auth/passkeys` | DELETE GET | ✔ |  |  | ✔ | ✔ | — | — | — |
| `/auth/passkeys/login/options` | POST |  |  |  | ✔ | ✔ | — | — | — |
| `/auth/passkeys/login/verify` | POST |  |  |  | ✔ | ✔ | — | — | — |
| `/auth/passkeys/register/options` | POST | ✔ |  |  |  |  | — | — | — |
| `/auth/passkeys/register/verify` | POST | ✔ |  |  | ✔ | ✔ | — | — | — |
| `/auth/set-session` | POST |  |  |  | ✔ | ✔ | — | — | — |
| `/auth/turnstile/verify` <sub>turnstile</sub> | POST |  |  |  | ✔ | ✔ | — | — | — |

### cards (4)

| Rota | Métodos | Auth | Escopo | Perfis | CSRF | Body | Tabelas (operações) | RPC | Invalidação |
|---|---|:-:|:-:|---|:-:|:-:|---|---|---|
| `/v1/cards/aniversario.svg` <sub>hono</sub> | GET |  |  |  |  |  | — | — | — |
| `/v1/cards/render.png` <sub>hono</sub> | GET |  |  |  |  |  | — | — | — |
| `/v1/cards/render.svg` <sub>hono</sub> | GET |  |  |  |  |  | — | — | — |
| `/v1/cards/render` <sub>hono</sub> | GET |  |  |  |  |  | — | — | — |

### cidades (2)

| Rota | Métodos | Auth | Escopo | Perfis | CSRF | Body | Tabelas (operações) | RPC | Invalidação |
|---|---|:-:|:-:|---|:-:|:-:|---|---|---|
| `/v1/cidades` <sub>hono</sub> | DELETE GET POST | ✔ | ✔ | Admin | ✔ | ✔ | cidades(D/R/U) | — | invalidateCatalogReadModels |
| `/v1/cidades/[id]` <sub>hono</sub> | DELETE GET PATCH | ✔ | ✔ | Admin | ✔ | ✔ | cidades(D/R/U) | — | invalidateCatalogReadModels |

### circuitos (2)

| Rota | Métodos | Auth | Escopo | Perfis | CSRF | Body | Tabelas (operações) | RPC | Invalidação |
|---|---|:-:|:-:|---|:-:|:-:|---|---|---|
| `/v1/circuitos` <sub>hono</sub> | GET POST | ✔ | ✔ | Admin | ✔ | ✔ | circuitos(R/U) | — | — |
| `/v1/circuitos/[id]` <sub>hono</sub> | DELETE GET PATCH | ✔ | ✔ | Admin | ✔ | ✔ | circuitos(D/R/U) | — | — |

### client-error (1)

| Rota | Métodos | Auth | Escopo | Perfis | CSRF | Body | Tabelas (operações) | RPC | Invalidação |
|---|---|:-:|:-:|---|:-:|:-:|---|---|---|
| `/v1/client-error` <sub>hono</sub> | POST |  |  |  | ✔ | ✔ | — | — | — |

### clientes (14)

| Rota | Métodos | Auth | Escopo | Perfis | CSRF | Body | Tabelas (operações) | RPC | Invalidação |
|---|---|:-:|:-:|---|:-:|:-:|---|---|---|
| `/v1/clientes` <sub>hono</sub> | GET | ✔ | ✔ | Admin |  |  | clientes(R) | — | — |
| `/v1/clientes/[id]` <sub>hono</sub> | DELETE GET PATCH | ✔ | ✔ |  | ✔ | ✔ | cliente_acompanhantes(R), clientes(D/R/U), quote(R), vendas(R) | — | invalidateClientReadModels |
| `/v1/clientes/[id]/acompanhantes` <sub>hono</sub> | GET POST | ✔ | ✔ |  | ✔ | ✔ | cliente_acompanhantes(R), clientes(R) | — | invalidateClientReadModels |
| `/v1/clientes/[id]/acompanhantes/[acompanhanteId]` <sub>hono</sub> | DELETE PATCH | ✔ | ✔ |  | ✔ | ✔ | cliente_acompanhantes(D/U) | — | invalidateClientReadModels |
| `/v1/clientes/avisos/history` <sub>hono</sub> | GET | ✔ | ✔ | Admin |  |  | cliente_avisos_historico(R) | — | — |
| `/v1/clientes/avisos/send` <sub>hono</sub> | GET POST | ✔ | ✔ | Admin | ✔ | ✔ | cliente_avisos_historico(C/R), clientes(R) | — | — |
| `/v1/clientes/avisos/templates` <sub>hono</sub> | GET | ✔ | ✔ | Admin |  |  | master_empresas(R), user_message_templates(R) | — | — |
| `/v1/clientes/create` <sub>hono</sub> | POST | ✔ | ✔ | Admin | ✔ | ✔ | clientes(C) | — | invalidateClientReadModels |
| `/v1/clientes/delete` <sub>hono</sub> | DELETE |  |  |  | ✔ |  | — | — | — |
| `/v1/clientes/historico` <sub>hono</sub> | GET | ✔ | ✔ |  |  |  | cidades(R), quote(R), vendas(R), vendas_recibos(R), viagem_passageiros(R), viagens(R) | — | — |
| `/v1/clientes/list` <sub>hono</sub> | GET | ✔ | ✔ | Admin |  |  | clientes(R), quote(R), users(R), vendas(R) | — | — |
| `/v1/clientes/resolve-import` <sub>hono</sub> | POST | ✔ | ✔ | Admin | ✔ | ✔ | clientes(C/R/U) | — | invalidateClientReadModels |
| `/v1/clientes/template-dispatches` <sub>hono</sub> | GET POST | ✔ | ✔ | Admin Gestor Master Vendedor | ✔ | ✔ | cliente_template_dispatches(C/R), clientes(R), vendas(R) | — | — |
| `/v1/clientes/templates/send` <sub>hono</sub> | POST | ✔ | ✔ |  | ✔ | ✔ | companies(R), master_empresas(R), user_message_template_themes(R), user_message_templates(R), users(R) | — | — |

### conciliacao (18)

| Rota | Métodos | Auth | Escopo | Perfis | CSRF | Body | Tabelas (operações) | RPC | Invalidação |
|---|---|:-:|:-:|---|:-:|:-:|---|---|---|
| `/v1/conciliacao` <sub>hono</sub> | GET | ✔ | ✔ | Admin Financeiro Gestor Master |  |  | conciliacao_recibos(R) | — | — |
| `/v1/conciliacao/assign` <sub>hono</sub> | POST | ✔ | ✔ | Admin Financeiro Gestor Master | ✔ | ✔ | conciliacao_recibo_changes(C), conciliacao_recibos(R/U), master_empresas(R), users(R) | — | invalidateSalesReadModels |
| `/v1/conciliacao/changes` <sub>hono</sub> | GET | ✔ | ✔ | Admin Financeiro Gestor Master |  |  | conciliacao_recibo_changes(R) | — | — |
| `/v1/conciliacao/delete` <sub>hono</sub> | DELETE | ✔ | ✔ | Admin Financeiro Gestor Master | ✔ |  | conciliacao_recibos(D/R) | — | invalidateSalesReadModels |
| `/v1/conciliacao/executions` <sub>hono</sub> | GET | ✔ | ✔ | Admin Financeiro Gestor Master |  |  | conciliacao_execucoes(R) | — | — |
| `/v1/conciliacao/existing` <sub>hono</sub> | POST | ✔ | ✔ | Admin Financeiro Gestor Master | ✔ | ✔ | conciliacao_recibos(R) | — | — |
| `/v1/conciliacao/fix-vinculos` <sub>hono</sub> | POST | ✔ | ✔ | Admin Financeiro Gestor Master | ✔ | ✔ | conciliacao_recibos(R/U), users(R), vendas_recibos(R), vendas_recibos_rateio(R) | — | invalidateSalesReadModels |
| `/v1/conciliacao/import` <sub>hono</sub> | POST | ✔ | ✔ | Admin Financeiro Gestor Master | ✔ | ✔ | conciliacao_dias_sem_movimento(R), conciliacao_recibos(R/U), vendas(R), vendas_recibos(R) | — | invalidateSalesReadModels |
| `/v1/conciliacao/list` <sub>hono</sub> | GET | ✔ | ✔ | Admin Financeiro Gestor Master |  |  | clientes(R), conciliacao_recibos(R), users(R), vendas(R), vendas_pagamentos(R), vendas_recibos(R) | — | — |
| `/v1/conciliacao/lookup` <sub>hono</sub> | POST | ✔ | ✔ | Admin Financeiro Gestor Master | ✔ | ✔ | vendas(R), vendas_recibos(R) | — | — |
| `/v1/conciliacao/options` <sub>hono</sub> | GET | ✔ | ✔ | Admin Financeiro Gestor Master |  |  | tipo_produtos(R) | — | — |
| `/v1/conciliacao/rateio-info` <sub>hono</sub> | GET | ✔ | ✔ | Admin Financeiro Gestor Master |  |  | conciliacao_recibos(R), vendas_recibos(R) | — | — |
| `/v1/conciliacao/revert` <sub>hono</sub> | POST | ✔ | ✔ | Admin Financeiro Gestor Master | ✔ | ✔ | conciliacao_recibo_changes(R/U) | — | invalidateSalesReadModels |
| `/v1/conciliacao/run` <sub>hono</sub> | POST | ✔ | ✔ | Admin Financeiro Gestor Master | ✔ | ✔ | — | — | invalidateSalesReadModels |
| `/v1/conciliacao/sem-movimento` <sub>hono</sub> | DELETE GET POST | ✔ | ✔ | Admin Financeiro Gestor Master | ✔ | ✔ | conciliacao_dias_sem_movimento(D/R/UP), conciliacao_recibos(R) | — | invalidateSalesReadModels |
| `/v1/conciliacao/status-cronologico` <sub>hono</sub> | GET | ✔ | ✔ | Admin Financeiro Gestor Master |  |  | — | — | — |
| `/v1/conciliacao/summary` <sub>hono</sub> | GET | ✔ | ✔ | Admin Financeiro Gestor Master |  |  | conciliacao_recibos(R) | — | — |
| `/v1/conciliacao/update-valores` <sub>hono</sub> | POST | ✔ | ✔ | Admin | ✔ | ✔ | conciliacao_recibos(R/U) | — | invalidateSalesReadModels |

### consultorias (2)

| Rota | Métodos | Auth | Escopo | Perfis | CSRF | Body | Tabelas (operações) | RPC | Invalidação |
|---|---|:-:|:-:|---|:-:|:-:|---|---|---|
| `/v1/consultorias` <sub>hono</sub> | GET PATCH POST | ✔ | ✔ | Admin Gestor Master | ✔ | ✔ | consultorias_online(C/R/U) | — | invalidateConsultoriaReadModels |
| `/v1/consultorias/ics` <sub>hono</sub> | GET | ✔ |  |  |  |  | consultorias_online(R) | — | — |

### convites (2)

| Rota | Métodos | Auth | Escopo | Perfis | CSRF | Body | Tabelas (operações) | RPC | Invalidação |
|---|---|:-:|:-:|---|:-:|:-:|---|---|---|
| `/v1/convites/accept` <sub>hono</sub> | POST | ✔ |  |  | ✔ | ✔ | user_convites(R/U), users(C/R/U) | — | — |
| `/v1/convites/send` <sub>hono</sub> | POST | ✔ | ✔ | Admin Gestor Master | ✔ | ✔ | gestor_equipe_compartilhada(R), gestor_vendedor(C), master_empresas(R), user_convites(C/R/U), user_types(R), users(R/U) | — | — |

### crm (2)

| Rota | Métodos | Auth | Escopo | Perfis | CSRF | Body | Tabelas (operações) | RPC | Invalidação |
|---|---|:-:|:-:|---|:-:|:-:|---|---|---|
| `/v1/crm/library` <sub>hono</sub> | GET | ✔ | ✔ | Admin |  |  | companies(R), crm_template_categories(R), master_empresas(R), quote_print_settings(R), user_crm_assinaturas(R), user_message_template_themes(R) | — | — |
| `/v1/crm/signature` <sub>hono</sub> | POST | ✔ |  |  | ✔ | ✔ | user_crm_assinaturas(UP) | — | — |

### cron (2)

| Rota | Métodos | Auth | Escopo | Perfis | CSRF | Body | Tabelas (operações) | RPC | Invalidação |
|---|---|:-:|:-:|---|:-:|:-:|---|---|---|
| `/v1/cron/alerta-comissao` <sub>hono cron-secret</sub> | GET POST |  |  |  |  | ✔ | — | — | — |
| `/v1/cron/lembretes-consultoria` <sub>hono cron-secret</sub> | POST |  |  |  |  | ✔ | — | — | — |

### dashboard (11)

| Rota | Métodos | Auth | Escopo | Perfis | CSRF | Body | Tabelas (operações) | RPC | Invalidação |
|---|---|:-:|:-:|---|:-:|:-:|---|---|---|
| `/v1/dashboard/aniversariantes` <sub>hono</sub> | GET | ✔ | ✔ | Admin Vendedor |  |  | cliente_acompanhantes(R), clientes(R), vendas(R) | — | — |
| `/v1/dashboard/base` <sub>hono</sub> | GET | ✔ | ✔ | Admin Financeiro Gestor Master |  |  | companies(R), users(R) | — | — |
| `/v1/dashboard/comparativo-empresas` <sub>hono</sub> | GET | ✔ | ✔ | Admin Master |  |  | companies(R), metas_vendedor(R), users(R) | — | — |
| `/v1/dashboard/consultorias` <sub>hono</sub> | GET | ✔ | ✔ | Admin Gestor Master |  |  | consultorias_online(R) | rpc_dashboard_consultorias | — |
| `/v1/dashboard/debug-aggregates` <sub>hono debug-only</sub> | GET | ✔ | ✔ | Admin |  |  | conciliacao_recibos(R), vendas(R) | — | — |
| `/v1/dashboard/evolucao-anual` <sub>hono</sub> | GET | ✔ | ✔ | Admin |  |  | companies(R) | — | — |
| `/v1/dashboard/follow-ups` <sub>hono</sub> | GET | ✔ | ✔ |  |  |  | viagem_passageiros(R), viagens(R) | — | — |
| `/v1/dashboard/summary` <sub>hono</sub> | GET | ✔ | ✔ | Admin |  |  | companies(R), dashboard_widgets(R), metas_vendedor(R), quote(R), users(R) | — | — |
| `/v1/dashboard/ultimas-compras` <sub>hono</sub> | GET | ✔ | ✔ | Admin Gestor Master |  |  | clientes(R), companies(R), users(R), vendas(R) | — | — |
| `/v1/dashboard/viagens` <sub>hono</sub> | GET | ✔ | ✔ | Admin |  |  | clientes(R), users(R), vendas(R), viagens(R) | — | — |
| `/v1/dashboard/widgets` <sub>hono</sub> | GET POST | ✔ | ✔ | Admin | ✔ | ✔ | dashboard_widgets(D/C/R) | — | — |

### debug (2)

| Rota | Métodos | Auth | Escopo | Perfis | CSRF | Body | Tabelas (operações) | RPC | Invalidação |
|---|---|:-:|:-:|---|:-:|:-:|---|---|---|
| `/v1/debug/permissions` <sub>hono debug-only</sub> | GET | ✔ | ✔ | Admin Gestor Master Vendedor |  |  | companies(R), users(R) | — | — |
| `/v1/debug/vendas-recibos-diff` <sub>hono debug-only</sub> | GET | ✔ | ✔ | Admin Master |  |  | — | — | — |

### debug-comissao (1)

| Rota | Métodos | Auth | Escopo | Perfis | CSRF | Body | Tabelas (operações) | RPC | Invalidação |
|---|---|:-:|:-:|---|:-:|:-:|---|---|---|
| `/v1/debug-comissao` <sub>hono debug-only</sub> | GET | ✔ | ✔ | Admin Master |  |  | — | — | — |

### documentacao (1)

| Rota | Métodos | Auth | Escopo | Perfis | CSRF | Body | Tabelas (operações) | RPC | Invalidação |
|---|---|:-:|:-:|---|:-:|:-:|---|---|---|
| `/v1/documentacao` <sub>hono</sub> | DELETE GET POST | ✔ | ✔ | Admin | ✔ | ✔ | system_documentation(R), system_documentation_sections(D/R/U) | — | — |

### documentos-viagens (5)

| Rota | Métodos | Auth | Escopo | Perfis | CSRF | Body | Tabelas (operações) | RPC | Invalidação |
|---|---|:-:|:-:|---|:-:|:-:|---|---|---|
| `/v1/documentos-viagens/create` <sub>hono</sub> | POST | ✔ | ✔ | Admin | ✔ | ✔ | documentos_viagens(C) | — | — |
| `/v1/documentos-viagens/delete` <sub>hono</sub> | POST | ✔ | ✔ | Admin | ✔ | ✔ | documentos_viagens(D/R) | — | — |
| `/v1/documentos-viagens/list` <sub>hono</sub> | GET |  |  |  |  |  | — | — | — |
| `/v1/documentos-viagens/save-template` <sub>hono</sub> | POST | ✔ | ✔ | Admin | ✔ | ✔ | documentos_viagens(R/U) | — | — |
| `/v1/documentos-viagens/update` <sub>hono</sub> | POST | ✔ | ✔ | Admin | ✔ | ✔ | documentos_viagens(R/U) | — | — |

### enderecos (1)

| Rota | Métodos | Auth | Escopo | Perfis | CSRF | Body | Tabelas (operações) | RPC | Invalidação |
|---|---|:-:|:-:|---|:-:|:-:|---|---|---|
| `/v1/enderecos/cep` <sub>hono</sub> | GET |  |  |  |  |  | — | — | — |

### equipe (1)

| Rota | Métodos | Auth | Escopo | Perfis | CSRF | Body | Tabelas (operações) | RPC | Invalidação |
|---|---|:-:|:-:|---|:-:|:-:|---|---|---|
| `/v1/equipe/relacao` <sub>hono</sub> | POST | ✔ | ✔ | Admin Gestor Master | ✔ | ✔ | users(R) | set_gestor_vendedor_relacao | — |

### financeiro (11)

| Rota | Métodos | Auth | Escopo | Perfis | CSRF | Body | Tabelas (operações) | RPC | Invalidação |
|---|---|:-:|:-:|---|:-:|:-:|---|---|---|
| `/v1/financeiro/ajustes-vendas` <sub>hono</sub> | GET POST | ✔ | ✔ | Admin Financeiro Gestor Master | ✔ | ✔ | conciliacao_recibos(R), users(R), vendas_recibos(R), vendas_recibos_rateio(R/U) | — | invalidateAjustesVendasReadModels, invalidateReadModelCache |
| `/v1/financeiro/ajustes-vendas/list` <sub>hono</sub> | GET | ✔ | ✔ | Admin |  |  | conciliacao_recibos(R), users(R), vendas_recibos(R), vendas_recibos_rateio(R) | — | — |
| `/v1/financeiro/ajustes-vendas/save` <sub>hono</sub> | POST | ✔ | ✔ | Admin Financeiro Gestor Master | ✔ | ✔ | conciliacao_recibos(R), users(R), vendas(R), vendas_recibos(R), vendas_recibos_rateio(U) | — | invalidateAjustesVendasReadModels, invalidateReadModelCache |
| `/v1/financeiro/caixa` <sub>hono</sub> | GET POST | ✔ | ✔ | Admin | ✔ | ✔ | caixa_movimentacoes(C/R), vendas_pagamentos(R) | — | invalidateReadModelCache |
| `/v1/financeiro/comissoes` <sub>hono</sub> | GET | ✔ | ✔ | Admin Financeiro Gestor Master |  |  | — | — | — |
| `/v1/financeiro/comissoes/calcular` <sub>hono</sub> | GET POST | ✔ | ✔ | Admin Financeiro Gestor Master | ✔ | ✔ | — | — | — |
| `/v1/financeiro/comissoes/pagamento` <sub>hono</sub> | DELETE POST PUT | ✔ | ✔ | Admin Financeiro | ✔ | ✔ | comissoes(U), vendas_recibos(R) | — | invalidateCommissionReadModels |
| `/v1/financeiro/comissoes/regras` <sub>hono</sub> | DELETE GET POST PUT | ✔ | ✔ | Admin | ✔ | ✔ | commission_rule(C/R/U), commission_tier(D/C) | — | invalidateCommissionReadModels, invalidateCommissionRuleReadModels |
| `/v1/financeiro/comissoes/regras/[id]` <sub>hono</sub> | DELETE GET PUT | ✔ | ✔ | Admin | ✔ | ✔ | commission_rule(R/U), commission_tier(D/C) | — | invalidateCommissionReadModels, invalidateCommissionRuleReadModels |
| `/v1/financeiro/comissoes/vendedores` <sub>hono</sub> | GET POST | ✔ | ✔ | Admin Financeiro Gestor Master | ✔ |  | — | — | — |
| `/v1/financeiro/formas-pagamento` <sub>hono</sub> | DELETE GET PATCH POST | ✔ | ✔ | Admin | ✔ | ✔ | formas_pagamento(D/C/R/U), vendas_pagamentos(R) | — | invalidateReadModelCache |

### fornecedores (3)

| Rota | Métodos | Auth | Escopo | Perfis | CSRF | Body | Tabelas (operações) | RPC | Invalidação |
|---|---|:-:|:-:|---|:-:|:-:|---|---|---|
| `/v1/fornecedores` <sub>hono</sub> | GET | ✔ | ✔ | Admin |  |  | — | — | — |
| `/v1/fornecedores/[id]` <sub>hono</sub> | DELETE GET PUT | ✔ | ✔ | Admin | ✔ | ✔ | fornecedores(U), produtos(R) | — | invalidateCatalogReadModels |
| `/v1/fornecedores/create` <sub>hono</sub> | POST | ✔ | ✔ | Admin | ✔ | ✔ | fornecedores(C) | — | invalidateCatalogReadModels |

### health (1)

| Rota | Métodos | Auth | Escopo | Perfis | CSRF | Body | Tabelas (operações) | RPC | Invalidação |
|---|---|:-:|:-:|---|:-:|:-:|---|---|---|
| `/v1/health` <sub>hono</sub> | GET |  |  |  |  |  | — | — | — |

### menu (1)

| Rota | Métodos | Auth | Escopo | Perfis | CSRF | Body | Tabelas (operações) | RPC | Invalidação |
|---|---|:-:|:-:|---|:-:|:-:|---|---|---|
| `/v1/menu/prefs` <sub>hono</sub> | GET POST | ✔ |  |  | ✔ | ✔ | menu_prefs(R/UP) | — | — |

### mural (4)

| Rota | Métodos | Auth | Escopo | Perfis | CSRF | Body | Tabelas (operações) | RPC | Invalidação |
|---|---|:-:|:-:|---|:-:|:-:|---|---|---|
| `/v1/mural/bootstrap` <sub>hono</sub> | GET | ✔ |  | Admin |  |  | companies(R) | — | — |
| `/v1/mural/company` <sub>hono</sub> | GET | ✔ |  |  |  |  | — | — | — |
| `/v1/mural/read` <sub>hono</sub> | POST | ✔ |  |  | ✔ | ✔ | mural_recados(R), mural_recados_leituras(UP) | — | invalidateMuralReadModels |
| `/v1/mural/recados` <sub>hono</sub> | DELETE GET POST | ✔ |  | Admin | ✔ | ✔ | mural_recados(D/C/R), users(R) | — | invalidateMuralReadModels |

### operacao (5)

| Rota | Métodos | Auth | Escopo | Perfis | CSRF | Body | Tabelas (operações) | RPC | Invalidação |
|---|---|:-:|:-:|---|:-:|:-:|---|---|---|
| `/v1/operacao/campanhas` <sub>hono</sub> | DELETE GET POST | ✔ | ✔ | Admin Financeiro Gestor Master | ✔ | ✔ | campanhas(D/R/U) | — | — |
| `/v1/operacao/documentos-viagens` <sub>hono</sub> | DELETE GET | ✔ | ✔ | Admin | ✔ |  | documentos_viagens(D/R) | — | — |
| `/v1/operacao/preferencias` <sub>hono</sub> | DELETE GET PATCH POST | ✔ | ✔ | Admin | ✔ | ✔ | minhas_preferencias(D/R/U), minhas_preferencias_shares(C/U), tipo_produtos(R), users(R) | — | invalidatePreferenceReadModels |
| `/v1/operacao/recados` <sub>hono</sub> | DELETE GET POST | ✔ | ✔ | Admin | ✔ | ✔ | mural_recados(C/R/U), users(R) | — | — |
| `/v1/operacao/sac` <sub>hono</sub> | DELETE GET POST | ✔ | ✔ | Admin | ✔ | ✔ | sac_controle(D/R/U) | — | — |

### orcamentos (14)

| Rota | Métodos | Auth | Escopo | Perfis | CSRF | Body | Tabelas (operações) | RPC | Invalidação |
|---|---|:-:|:-:|---|:-:|:-:|---|---|---|
| `/v1/orcamentos/[id]` <sub>hono</sub> | DELETE GET PATCH | ✔ | ✔ | Admin | ✔ | ✔ | clientes(R), quote(R/U), quote_item(C/R), quote_item_segment(R) | — | invalidateQuoteReadModels |
| `/v1/orcamentos/[id]/resumo-venda` <sub>hono</sub> | GET | ✔ | ✔ | Admin Financeiro |  |  | clientes(R), quote(R) | — | — |
| `/v1/orcamentos/cidades-busca` <sub>hono</sub> | GET | ✔ | ✔ | Admin Financeiro |  |  | cidades(R) | buscar_cidades | — |
| `/v1/orcamentos/cliente-create` <sub>hono</sub> | POST | ✔ | ✔ | Admin | ✔ | ✔ | clientes(C) | — | invalidateClientReadModels |
| `/v1/orcamentos/clientes` <sub>hono</sub> | GET | ✔ | ✔ | Admin |  |  | clientes(R) | — | — |
| `/v1/orcamentos/create` <sub>hono</sub> | POST | ✔ | ✔ | Admin | ✔ | ✔ | clientes(R), quote(C), quote_item(C) | — | invalidateQuoteReadModels |
| `/v1/orcamentos/delete` <sub>hono</sub> | POST | ✔ | ✔ | Admin | ✔ | ✔ | quote(R) | — | invalidateQuoteReadModels |
| `/v1/orcamentos/interacao` <sub>hono</sub> | GET POST | ✔ | ✔ | Admin | ✔ | ✔ | quote(R/U) | — | invalidateQuoteReadModels |
| `/v1/orcamentos/interaction` <sub>hono</sub> | GET POST |  |  |  |  |  | — | — | — |
| `/v1/orcamentos/list` <sub>hono</sub> | GET | ✔ | ✔ | Admin |  |  | clientes(R), quote(R), quote_item(R), users(R) | — | — |
| `/v1/orcamentos/produtos` <sub>hono</sub> | GET | ✔ | ✔ | Admin |  |  | produtos(R) | — | — |
| `/v1/orcamentos/save` <sub>hono</sub> | POST | ✔ | ✔ | Admin | ✔ | ✔ | clientes(R), produtos(R/U), quote(R/U), quote_item(R/UP), quote_item_segment(D/C), tipo_produtos(R) | — | invalidateQuoteReadModels |
| `/v1/orcamentos/status` <sub>hono</sub> | PATCH | ✔ | ✔ | Admin | ✔ | ✔ | quote(R/U) | — | invalidateQuoteReadModels |
| `/v1/orcamentos/tipos` <sub>hono</sub> | GET | ✔ | ✔ | Admin Financeiro |  |  | tipo_produtos(R) | — | — |

### pagamentos (4)

| Rota | Métodos | Auth | Escopo | Perfis | CSRF | Body | Tabelas (operações) | RPC | Invalidação |
|---|---|:-:|:-:|---|:-:|:-:|---|---|---|
| `/v1/pagamentos` <sub>hono</sub> | GET POST | ✔ | ✔ | Admin | ✔ | ✔ | vendas(R), vendas_pagamentos(C/R) | — | invalidatePagamentoReadModels, invalidateReadModelCache |
| `/v1/pagamentos/[id]` <sub>hono</sub> | DELETE GET PATCH | ✔ | ✔ | Admin | ✔ | ✔ | vendas_pagamentos(D/R/U) | — | invalidatePagamentoReadModels, invalidateReadModelCache |
| `/v1/pagamentos/[id]/conciliar` <sub>hono</sub> | POST | ✔ | ✔ | Admin | ✔ | ✔ | vendas_pagamentos(R/U) | — | invalidatePagamentoReadModels, invalidateReadModelCache |
| `/v1/pagamentos/upload` <sub>hono</sub> | POST | ✔ | ✔ | Admin | ✔ |  | vendas_pagamentos(R/U) | — | invalidatePagamentoReadModels, invalidateReadModelCache |

### paises (1)

| Rota | Métodos | Auth | Escopo | Perfis | CSRF | Body | Tabelas (operações) | RPC | Invalidação |
|---|---|:-:|:-:|---|:-:|:-:|---|---|---|
| `/v1/paises` <sub>hono</sub> | DELETE GET POST | ✔ | ✔ | Admin | ✔ | ✔ | paises(D/R/U) | — | invalidateCatalogReadModels |

### parametros (12)

| Rota | Métodos | Auth | Escopo | Perfis | CSRF | Body | Tabelas (operações) | RPC | Invalidação |
|---|---|:-:|:-:|---|:-:|:-:|---|---|---|
| `/v1/parametros/cambios` <sub>hono</sub> | DELETE GET POST | ✔ | ✔ | Admin | ✔ | ✔ | parametros_cambios(D/R/U) | — | invalidateQuoteReadModels |
| `/v1/parametros/commission-rules` <sub>hono</sub> | DELETE GET PATCH POST | ✔ | ✔ | Admin | ✔ | ✔ | commission_rule(C/R/U), commission_tier(D) | — | invalidateCommissionReadModels, invalidateCommissionRuleReadModels |
| `/v1/parametros/empresa` <sub>hono</sub> | GET PATCH | ✔ | ✔ | Admin | ✔ | ✔ | companies(R/U) | — | invalidateUserReadModels |
| `/v1/parametros/equipe` <sub>hono</sub> | GET POST | ✔ | ✔ | Admin Gestor | ✔ | ✔ | gestor_vendedor(C/R), user_types(R), users(R) | — | invalidateUserReadModels |
| `/v1/parametros/escalas` <sub>hono</sub> | GET POST | ✔ | ✔ | Admin Gestor Master Vendedor | ✔ | ✔ | escala_dia(D/R/U/UP), escala_horario_usuario(C/R), escala_mes(R), feriados(R), users(R) | gestor_equipe_base_id | invalidateReadModelCache |
| `/v1/parametros/metas` <sub>hono</sub> | DELETE GET POST | ✔ | ✔ | Admin Gestor Master | ✔ | ✔ | metas_vendedor(R/U), metas_vendedor_produto(D/R), tipo_produtos(R), users(R) | — | invalidateReadModelCache |
| `/v1/parametros/nao-comissionaveis` <sub>hono</sub> | DELETE GET POST | ✔ | ✔ | Admin | ✔ | ✔ | parametros_pagamentos_nao_comissionaveis(D/R/U) | — | invalidateSalesReadModels |
| `/v1/parametros/orcamentos-pdf` <sub>hono</sub> | GET POST | ✔ | ✔ | Admin | ✔ | ✔ | quote_print_settings(R), users(R) | — | invalidateQuoteReadModels |
| `/v1/parametros/regras-produto-pacote` <sub>hono</sub> | DELETE GET POST | ✔ | ✔ | Admin | ✔ | ✔ | product_commission_rule_pacote(D/R/U) | — | invalidateCatalogReadModels |
| `/v1/parametros/regras-produto` <sub>hono</sub> | DELETE GET POST | ✔ | ✔ | Admin | ✔ | ✔ | product_commission_rule(D/R/U) | — | invalidateCatalogReadModels |
| `/v1/parametros/sistema` <sub>hono</sub> | GET POST | ✔ | ✔ | Admin | ✔ | ✔ | parametros_comissao(R/UP), users(R) | — | invalidateSalesReadModels |
| `/v1/parametros/tipo-pacotes` <sub>hono</sub> | DELETE GET POST | ✔ | ✔ | Admin | ✔ | ✔ | tipo_pacotes(D/R/U) | — | invalidateCatalogReadModels |

### preferencias (8)

| Rota | Métodos | Auth | Escopo | Perfis | CSRF | Body | Tabelas (operações) | RPC | Invalidação |
|---|---|:-:|:-:|---|:-:|:-:|---|---|---|
| `/v1/preferencias/base` <sub>hono</sub> | GET | ✔ |  |  |  |  | — | — | — |
| `/v1/preferencias/cidades-busca` <sub>hono</sub> | GET | ✔ |  |  |  |  | cidades(R) | buscar_cidades | — |
| `/v1/preferencias/delete` <sub>hono</sub> | POST | ✔ |  | Admin | ✔ | ✔ | minhas_preferencias(D) | — | invalidatePreferenceReadModels |
| `/v1/preferencias/list` <sub>hono</sub> | GET | ✔ |  |  |  |  | minhas_preferencias(R), minhas_preferencias_shares(R) | — | — |
| `/v1/preferencias/save` <sub>hono</sub> | POST | ✔ |  | Admin | ✔ | ✔ | minhas_preferencias(C/U) | — | invalidatePreferenceReadModels |
| `/v1/preferencias/share-accept` <sub>hono</sub> | POST | ✔ |  |  | ✔ | ✔ | minhas_preferencias_shares(U) | — | invalidatePreferenceReadModels |
| `/v1/preferencias/share-revoke` <sub>hono</sub> | POST | ✔ |  |  | ✔ | ✔ | minhas_preferencias_shares(U) | — | invalidatePreferenceReadModels |
| `/v1/preferencias/share` <sub>hono</sub> | POST | ✔ |  | Admin | ✔ | ✔ | minhas_preferencias(R), minhas_preferencias_shares(UP), users(R) | — | invalidatePreferenceReadModels |

### produtos (5)

| Rota | Métodos | Auth | Escopo | Perfis | CSRF | Body | Tabelas (operações) | RPC | Invalidação |
|---|---|:-:|:-:|---|:-:|:-:|---|---|---|
| `/v1/produtos` <sub>hono</sub> | GET | ✔ | ✔ | Admin |  |  | — | — | — |
| `/v1/produtos/[id]` <sub>hono</sub> | DELETE GET PATCH | ✔ | ✔ | Admin | ✔ | ✔ | produtos(U), produtos_tarifas(D) | — | invalidateCatalogReadModels |
| `/v1/produtos/base` <sub>hono</sub> | GET | ✔ | ✔ | Admin |  |  | — | — | — |
| `/v1/produtos/create` <sub>hono</sub> | POST | ✔ | ✔ | Admin | ✔ | ✔ | produtos(C) | — | invalidateCatalogReadModels |
| `/v1/produtos/tarifas` <sub>hono</sub> | GET POST | ✔ | ✔ | Admin | ✔ | ✔ | produtos_tarifas(D) | — | invalidateCatalogReadModels |

### profile (1)

| Rota | Métodos | Auth | Escopo | Perfis | CSRF | Body | Tabelas (operações) | RPC | Invalidação |
|---|---|:-:|:-:|---|:-:|:-:|---|---|---|
| `/v1/profile/signature` <sub>hono</sub> | GET PATCH | ✔ | ✔ |  | ✔ | ✔ | users(R) | — | invalidateQuoteReadModels |

### push (2)

| Rota | Métodos | Auth | Escopo | Perfis | CSRF | Body | Tabelas (operações) | RPC | Invalidação |
|---|---|:-:|:-:|---|:-:|:-:|---|---|---|
| `/v1/push/subscribe` <sub>hono</sub> | POST | ✔ |  |  | ✔ | ✔ | push_subscriptions(UP) | — | — |
| `/v1/push/unsubscribe` <sub>hono</sub> | POST | ✔ |  |  | ✔ | ✔ | push_subscriptions(U) | — | — |

### qr (1)

| Rota | Métodos | Auth | Escopo | Perfis | CSRF | Body | Tabelas (operações) | RPC | Invalidação |
|---|---|:-:|:-:|---|:-:|:-:|---|---|---|
| `/v1/qr` <sub>hono</sub> | GET |  |  |  |  |  | — | — | — |

### read-model (1)

| Rota | Métodos | Auth | Escopo | Perfis | CSRF | Body | Tabelas (operações) | RPC | Invalidação |
|---|---|:-:|:-:|---|:-:|:-:|---|---|---|
| `/v1/read-model/rebuild` <sub>hono cron-secret</sub> | GET POST | ✔ | ✔ | Admin Financeiro Master |  |  | — | — | — |

### relatorios (13)

| Rota | Métodos | Auth | Escopo | Perfis | CSRF | Body | Tabelas (operações) | RPC | Invalidação |
|---|---|:-:|:-:|---|:-:|:-:|---|---|---|
| `/v1/relatorios/base` <sub>hono</sub> | GET | ✔ | ✔ | Admin Vendedor |  |  | companies(R), users(R) | — | — |
| `/v1/relatorios/cidades-busca` <sub>hono</sub> | GET | ✔ | ✔ | Admin |  |  | — | buscar_cidades | — |
| `/v1/relatorios/clientes` <sub>hono</sub> | GET | ✔ | ✔ | Admin |  |  | clientes(R) | — | — |
| `/v1/relatorios/destinos` <sub>hono</sub> | GET | ✔ | ✔ | Admin |  |  | — | — | — |
| `/v1/relatorios/produtos-recibos` <sub>hono</sub> | GET | ✔ | ✔ | Admin |  |  | — | — | — |
| `/v1/relatorios/produtos` <sub>hono</sub> | GET | ✔ | ✔ | Admin |  |  | — | — | — |
| `/v1/relatorios/ranking-debug` <sub>hono debug-only</sub> | GET POST | ✔ | ✔ | Admin Gestor Master | ✔ | ✔ | conciliacao_recibos(R/U), users(R), vendas(R) | — | invalidateSalesReadModels |
| `/v1/relatorios/ranking-vendas` <sub>hono</sub> | GET |  |  |  |  |  | — | — | — |
| `/v1/relatorios/ranking` <sub>hono</sub> | GET | ✔ | ✔ | Admin |  |  | metas_vendedor(R), parametros_comissao(R), quote(R), users(R) | — | — |
| `/v1/relatorios/vendas-por-cliente` <sub>hono</sub> | GET |  |  |  |  |  | — | — | — |
| `/v1/relatorios/vendas-por-destino` <sub>hono</sub> | GET |  |  |  |  |  | — | — | — |
| `/v1/relatorios/vendas-por-produto` <sub>hono</sub> | GET |  |  |  |  |  | — | — | — |
| `/v1/relatorios/vendas` <sub>hono</sub> | GET | ✔ | ✔ | Admin Financeiro Gestor Master Vendedor |  |  | cidades(R), parametros_comissao(R), users(R), vendas(R), vendas_pagamentos(R), vendas_recibos_rateio(R) | — | — |

### roteiros (10)

| Rota | Métodos | Auth | Escopo | Perfis | CSRF | Body | Tabelas (operações) | RPC | Invalidação |
|---|---|:-:|:-:|---|:-:|:-:|---|---|---|
| `/v1/roteiros` <sub>hono</sub> | DELETE GET PATCH POST | ✔ | ✔ | Admin Gestor Master | ✔ | ✔ | roteiro_dia(D/C), roteiro_personalizado(D/C/R/U), roteiro_sugestoes(D/R/U), users(R) | — | — |
| `/v1/roteiros/[id]` <sub>hono</sub> | GET | ✔ | ✔ | Admin Gestor Master |  |  | roteiro_dia(R), roteiro_investimento(R), roteiro_passeio(R), roteiro_personalizado(R) | — | — |
| `/v1/roteiros/delete` <sub>hono</sub> | DELETE | ✔ | ✔ | Admin Gestor Master | ✔ |  | roteiro_personalizado(D/R) | — | — |
| `/v1/roteiros/dias-busca` <sub>hono</sub> | GET | ✔ | ✔ | Admin Gestor Master |  |  | roteiro_dia(R) | — | — |
| `/v1/roteiros/gerar-orcamento` <sub>hono</sub> | POST | ✔ | ✔ | Admin | ✔ | ✔ | clientes(R), quote(C), quote_item(C), roteiro_personalizado(R) | — | invalidateQuoteReadModels |
| `/v1/roteiros/list` <sub>hono</sub> | GET | ✔ | ✔ | Admin Gestor Master |  |  | roteiro_personalizado(R) | — | — |
| `/v1/roteiros/save` <sub>hono</sub> | POST | ✔ | ✔ | Admin Gestor Master | ✔ | ✔ | roteiro_dia(C/UP), roteiro_hotel(C), roteiro_investimento(D/C), roteiro_pagamento(C), roteiro_passeio(C), roteiro_personalizado(C/R/U), roteiro_transporte(C) | — | — |
| `/v1/roteiros/sugestoes-busca` <sub>hono</sub> | GET | ✔ | ✔ |  |  |  | roteiro_sugestoes(R) | — | — |
| `/v1/roteiros/sugestoes-remover` <sub>hono</sub> | POST | ✔ | ✔ |  | ✔ | ✔ | roteiro_sugestoes(D) | — | — |
| `/v1/roteiros/sugestoes-salvar` <sub>hono</sub> | POST | ✔ | ✔ |  | ✔ | ✔ | roteiro_sugestoes(C/R) | — | — |

### subdivisoes (1)

| Rota | Métodos | Auth | Escopo | Perfis | CSRF | Body | Tabelas (operações) | RPC | Invalidação |
|---|---|:-:|:-:|---|:-:|:-:|---|---|---|
| `/v1/subdivisoes` <sub>hono</sub> | DELETE GET POST | ✔ | ✔ | Admin | ✔ | ✔ | subdivisoes(D/R/U) | — | invalidateCatalogReadModels |

### tarefas (3)

| Rota | Métodos | Auth | Escopo | Perfis | CSRF | Body | Tabelas (operações) | RPC | Invalidação |
|---|---|:-:|:-:|---|:-:|:-:|---|---|---|
| `/v1/tarefas` <sub>hono</sub> | GET | ✔ | ✔ |  |  |  | agenda_itens(R), todo_categorias(R) | — | — |
| `/v1/tarefas/clientes` <sub>hono</sub> | GET | ✔ | ✔ | Admin |  |  | clientes(R) | — | — |
| `/v1/tarefas/usuarios` <sub>hono</sub> | GET | ✔ | ✔ | Admin |  |  | users(R) | — | — |

### tipo-produtos (1)

| Rota | Métodos | Auth | Escopo | Perfis | CSRF | Body | Tabelas (operações) | RPC | Invalidação |
|---|---|:-:|:-:|---|:-:|:-:|---|---|---|
| `/v1/tipo-produtos` <sub>hono</sub> | DELETE GET POST | ✔ | ✔ | Admin | ✔ | ✔ | tipo_produtos(D/C/R/U) | — | — |

### todo (5)

| Rota | Métodos | Auth | Escopo | Perfis | CSRF | Body | Tabelas (operações) | RPC | Invalidação |
|---|---|:-:|:-:|---|:-:|:-:|---|---|---|
| `/v1/todo/batch` <sub>hono</sub> | POST | ✔ | ✔ | Admin | ✔ | ✔ | agenda_itens(R/U) | — | invalidateTodoReadModels |
| `/v1/todo/board` <sub>hono</sub> | GET | ✔ | ✔ |  |  |  | todo_categorias(R) | — | — |
| `/v1/todo/category` <sub>hono</sub> | DELETE POST | ✔ | ✔ | Admin | ✔ | ✔ | agenda_itens(R), todo_categorias(R/U) | — | invalidateTodoReadModels |
| `/v1/todo/item` <sub>hono</sub> | DELETE PATCH POST | ✔ | ✔ | Admin | ✔ | ✔ | agenda_itens(D/C/U), todo_categorias(R) | — | invalidateTodoReadModels |
| `/v1/todo/item/[id]` <sub>hono</sub> | GET | ✔ | ✔ | Admin |  |  | agenda_itens(R), todo_categorias(R) | — | — |

### user (2)

| Rota | Métodos | Auth | Escopo | Perfis | CSRF | Body | Tabelas (operações) | RPC | Invalidação |
|---|---|:-:|:-:|---|:-:|:-:|---|---|---|
| `/v1/user/context` <sub>hono</sub> | GET | ✔ | ✔ | Admin Financeiro Gestor Master Vendedor |  |  | companies(R) | — | — |
| `/v1/user/profile` <sub>hono</sub> | GET PATCH | ✔ |  |  | ✔ | ✔ | users(R/U) | — | — |

### users (1)

| Rota | Métodos | Auth | Escopo | Perfis | CSRF | Body | Tabelas (operações) | RPC | Invalidação |
|---|---|:-:|:-:|---|:-:|:-:|---|---|---|
| `/v1/users/aniversariantes` <sub>hono</sub> | GET | ✔ | ✔ |  |  |  | users(R) | — | — |

### vendas (21)

| Rota | Métodos | Auth | Escopo | Perfis | CSRF | Body | Tabelas (operações) | RPC | Invalidação |
|---|---|:-:|:-:|---|:-:|:-:|---|---|---|
| `/v1/vendas` <sub>hono</sub> | GET | ✔ | ✔ | Admin Financeiro Gestor Master |  |  | vendas(R) | — | — |
| `/v1/vendas/[id]` <sub>hono</sub> | DELETE GET PATCH | ✔ | ✔ | Admin Master | ✔ | ✔ | conciliacao_recibos(U), vendas(R/U), vendas_recibos(R), vendas_recibos_complementares(D), vendas_recibos_notas(D), viagens(U) | — | invalidateSalesReadModels |
| `/v1/vendas/[id]/ranking-recibos` <sub>hono</sub> | GET | ✔ | ✔ | Admin Financeiro Gestor Master |  |  | vendas(R), vendas_recibos(R) | — | — |
| `/v1/vendas/cadastro-base` <sub>hono</sub> | GET | ✔ | ✔ | Admin Financeiro Gestor Master |  |  | cidades(R), clientes(R), companies(R), produtos(R), tipo_pacotes(R), tipo_produtos(R) | — | — |
| `/v1/vendas/cadastro-save` <sub>hono</sub> | POST | ✔ | ✔ | Admin Financeiro Gestor Master | ✔ | ✔ | users(R), vendas(C/R/U) | — | invalidateSalesReadModels, publishKvInvalidationAsync, triggerRebuildAsync |
| `/v1/vendas/cancel` <sub>hono</sub> | POST | ✔ | ✔ | Admin Master | ✔ | ✔ | vendas_recibos(D) | — | invalidateSalesReadModels, publishKvInvalidationAsync, triggerRebuildAsync |
| `/v1/vendas/cidades-busca` <sub>hono</sub> | GET | ✔ | ✔ | Admin Master |  |  | cidades(R) | buscar_cidades | — |
| `/v1/vendas/complementares` <sub>hono</sub> | GET | ✔ | ✔ | Admin Financeiro Gestor Master |  |  | vendas(R), vendas_recibos(R), vendas_recibos_complementares(R) | — | — |
| `/v1/vendas/create` <sub>hono</sub> | POST | ✔ | ✔ | Admin | ✔ | ✔ | users(R), vendas(C) | — | invalidateSalesReadModels |
| `/v1/vendas/gestor-equipe` <sub>hono</sub> | GET | ✔ | ✔ | Admin Gestor |  |  | users(R) | — | — |
| `/v1/vendas/kpis` <sub>hono</sub> | GET | ✔ | ✔ | Admin Master |  |  | — | — | — |
| `/v1/vendas/list` <sub>hono</sub> | GET | ✔ | ✔ | Admin Master |  |  | cidades(R), clientes(R), produtos(R), users(R), vendas(R), vendas_recibos(R) | — | — |
| `/v1/vendas/merge-candidates` <sub>hono</sub> | GET | ✔ | ✔ | Admin Financeiro Gestor Master |  |  | vendas(R), vendas_recibos(R) | — | — |
| `/v1/vendas/merge` <sub>hono</sub> | POST | ✔ | ✔ | Admin Master | ✔ | ✔ | vendas(R/U), vendas_pagamentos(D), vendas_recibos(R), vendas_recibos_notas(U), viagens(U) | — | invalidateSalesReadModels |
| `/v1/vendas/recibo-complementar-link` <sub>hono</sub> | POST | ✔ | ✔ | Admin Master | ✔ | ✔ | vendas(R), vendas_recibos_complementares(D/UP) | — | invalidateSalesReadModels |
| `/v1/vendas/recibo-complementar-remove` <sub>hono</sub> | POST | ✔ | ✔ | Admin Master | ✔ | ✔ | vendas_recibos_complementares(D/R) | — | invalidateSalesReadModels |
| `/v1/vendas/recibo-delete` <sub>hono</sub> | POST | ✔ | ✔ | Admin Master | ✔ | ✔ | vendas_recibos(D) | — | invalidateSalesReadModels, publishKvInvalidationAsync, triggerRebuildAsync |
| `/v1/vendas/recibo-edit` <sub>hono</sub> | PATCH | ✔ | ✔ | Admin Master | ✔ | ✔ | vendas_recibos(R/U) | — | invalidateSalesReadModels, publishKvInvalidationAsync, triggerRebuildAsync |
| `/v1/vendas/recibo-notas` <sub>hono</sub> | GET | ✔ | ✔ | Admin Master |  |  | vendas_recibos_notas(R) | — | — |
| `/v1/vendas/recibo-principal` <sub>hono</sub> | POST | ✔ | ✔ | Admin Master | ✔ | ✔ | vendas(U), vendas_recibos(R) | — | invalidateSalesReadModels |
| `/v1/vendas/status` <sub>hono</sub> | PATCH | ✔ | ✔ | Admin Master | ✔ | ✔ | vendas(U) | — | invalidateSalesReadModels |

### viagens (10)

| Rota | Métodos | Auth | Escopo | Perfis | CSRF | Body | Tabelas (operações) | RPC | Invalidação |
|---|---|:-:|:-:|---|:-:|:-:|---|---|---|
| `/v1/viagens` <sub>hono</sub> | GET | ✔ | ✔ | Admin Vendedor |  |  | clientes(R), users(R), vendas(R), viagem_passageiros(R), viagens(R) | — | — |
| `/v1/viagens/[id]` <sub>hono</sub> | DELETE GET PATCH | ✔ | ✔ | Admin Gestor Master Vendedor | ✔ | ✔ | clientes(R), produtos(R), vendas(R), vendas_recibos(R), viagens(D/R/U), vouchers(R) | — | invalidateTripReadModels |
| `/v1/viagens/cidades-busca` <sub>hono</sub> | GET | ✔ | ✔ | Admin |  |  | cidades(R) | buscar_cidades | — |
| `/v1/viagens/cliente/[id]` <sub>hono</sub> | GET | ✔ | ✔ | Admin |  |  | clientes(R), vendas(R), viagens(R) | — | — |
| `/v1/viagens/clientes` <sub>hono</sub> | GET | ✔ | ✔ | Admin |  |  | clientes(R) | — | — |
| `/v1/viagens/create` <sub>hono</sub> | POST | ✔ | ✔ | Admin | ✔ | ✔ | clientes(R), viagens(C) | — | invalidateTripReadModels |
| `/v1/viagens/delete` <sub>hono</sub> | POST | ✔ | ✔ | Admin Vendedor | ✔ | ✔ | viagens(D/R) | — | invalidateTripReadModels |
| `/v1/viagens/dossie-batch` <sub>hono</sub> | POST | ✔ | ✔ | Admin Vendedor | ✔ | ✔ | cliente_acompanhantes(C/R), viagem_acompanhantes(U), viagem_documentos(C), viagem_servicos(U), viagens(R) | — | invalidateClientReadModels, invalidateTripReadModels |
| `/v1/viagens/dossie` <sub>hono</sub> | GET | ✔ | ✔ | Admin Vendedor |  |  | cliente_acompanhantes(R), viagens(R) | — | — |
| `/v1/viagens/list` <sub>hono</sub> | GET |  |  |  |  |  | — | — | — |

### voucher-assets (1)

| Rota | Métodos | Auth | Escopo | Perfis | CSRF | Body | Tabelas (operações) | RPC | Invalidação |
|---|---|:-:|:-:|---|:-:|:-:|---|---|---|
| `/v1/voucher-assets` <sub>hono</sub> | DELETE GET PATCH POST | ✔ | ✔ | Admin Gestor Master | ✔ |  | voucher_assets(D/C/R/U) | — | — |

### vouchers (4)

| Rota | Métodos | Auth | Escopo | Perfis | CSRF | Body | Tabelas (operações) | RPC | Invalidação |
|---|---|:-:|:-:|---|:-:|:-:|---|---|---|
| `/v1/vouchers` <sub>hono</sub> | GET POST | ✔ | ✔ | Admin | ✔ | ✔ | viagens(R), voucher_dias(C), voucher_hoteis(C), vouchers(R) | — | — |
| `/v1/vouchers/[id]` <sub>hono</sub> | DELETE GET PATCH | ✔ | ✔ | Admin | ✔ | ✔ | voucher_dias(D/C), voucher_hoteis(C), vouchers(D/R) | — | — |
| `/v1/vouchers/create` <sub>hono</sub> | POST | ✔ | ✔ | Admin | ✔ | ✔ | vouchers(C) | — | — |
| `/v1/vouchers/delete` <sub>hono</sub> | DELETE | ✔ | ✔ | Admin | ✔ |  | vouchers(R) | — | — |

### welcome-email (1)

| Rota | Métodos | Auth | Escopo | Perfis | CSRF | Body | Tabelas (operações) | RPC | Invalidação |
|---|---|:-:|:-:|---|:-:|:-:|---|---|---|
| `/v1/welcome-email` <sub>hono</sub> | POST | ✔ |  |  | ✔ |  | admin_avisos_templates(R), users(R/U) | — | — |

Operações: R = select · C = insert · U = update · UP = upsert · D = delete
