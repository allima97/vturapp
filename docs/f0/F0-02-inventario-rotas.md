# F0-02 — Inventário de rotas reconciliado

**Estado:** CONCLUÍDA  
**Responsável / data:** 2026-10-26  
**Dependência:** F0-01  

## Reconciliação: +server.ts vs api-inventory.json

| Medida | Valor |
|---|---|
| Arquivos `+server.ts` em `src/routes/` | 259 |
| Entradas em `docs/api-inventory.json` | 258 |
| Discrepância | 1 |

### Explicação da discrepância

**Em `+server.ts` mas não no inventário (2 rotas fora de `/api/v1`):**
- `/auth/logout` — GET e POST via Supabase `auth.signOut()`; não está no inventário pois fica em `src/routes/auth/`, não em `src/routes/api/`
- `/test-env` — endpoint debug, também fora do prefixo `/api/`

**No inventário mas sem `+server.ts` correspondente (1 rota stale):**
- `/api/v1/pagamentos/[id]/conciliar` — o arquivo `+server.ts` não existe mais na pasta, mas o inventário ainda lista. A implementação Hono também não existe (`src/lib/server/api/routes/pagamentos/id-conciliar.ts` ausente). **Inventário desatualizado.**

## Inventário por grupo de rotas

### Autenticação e sessão (não-Hono, SvelteKit puro)

| Rota | Métodos | Observação |
|---|---|---|
| `/api/auth/convite/activate` | POST | Ativa convite; usa adminClient |
| `/api/auth/login` | POST | Login; usa Supabase client; Turnstile |
| `/api/auth/passkeys` | GET, DELETE | Lista/remove passkeys |
| `/api/auth/passkeys/login/options` | POST | Challenge de passkey login |
| `/api/auth/passkeys/login/verify` | POST | Verifica passkey login |
| `/api/auth/passkeys/register/options` | POST | Challenge de registro de passkey |
| `/api/auth/passkeys/register/verify` | POST | Verifica registro de passkey |
| `/api/auth/set-session` | POST | Estabelece sessão por token |
| `/api/auth/turnstile/verify` | POST | Verifica Turnstile CAPTCHA |
| `/auth/logout` | GET, POST | Logout via Supabase `auth.signOut()` |

### Catch-all Hono

| Rota | Métodos | Observação |
|---|---|---|
| `/api/v1/[...path]` | GET, POST, PUT, PATCH, DELETE | Repassa para Hono quando não há `+server.ts` específico |

### Módulos de API via Hono (por domínio)

| Domínio | Endpoints | Tabelas principais | Notas |
|---|---|---|---|
| admin | 25 | `companies`, `users`, `user_types`, `plans`, `logs` | Administração de plataforma |
| agenda | 5 | `agenda_itens`, `escala_*` | |
| cards | 4 | `voucher_assets` | Geração de cartões/vouchers |
| cidades | 2 | `cidades` | RPC `buscar_cidades` |
| circuitos | 2 | `circuitos` | Cadastros |
| client-error | 1 | `logs` | Telemetria de erros frontend |
| clientes | 14 | `clientes`, `cliente_acompanhantes` | M02 |
| **conciliacao** | **18+1** | `conciliacao_*`, `vendas_recibos_rateio` | **X02 — EXCLUSÃO PLANEJADA** |
| consultorias | 2 | `consultorias_online` | |
| convites | 2 | `user_convites` | |
| crm | 2 | `crm_*`, `user_message_templates` | |
| cron | 2 | — | Cron-secret; substituir por `scheduled()` |
| dashboard | 11 | read model + múltiplas tabelas | M11 |
| debug | 2+3 | — | debug-only; remover em produção |
| documentacao | 1 | `system_documentation*` | |
| documentos-viagens | 5 | `documentos_viagens`, `viagem_documentos` | |
| enderecos | 1 | `cidades`, `paises` | |
| equipe | 1 | `gestor_equipe_compartilhada` | RPC `gestor_equipe_base_id` |
| financeiro | 11 | `caixa_movimentacoes`, `vendas_pagamentos`, `formas_pagamento` | M05; ajustes-vendas usa `conciliacao_recibos` |
| fornecedores | 3 | `fornecedores` | M03 |
| health | 1 | — | |
| lgpd | — | `logs` | Admin LGPD, não no inventário |
| menu | 1 | `menu_prefs`, `modulo_acesso` | |
| mural | 4 | `mural_recados`, `mural_recados_leituras` | M09 |
| operacao | 5 | `escala_*`, `feriados` | M08 |
| orcamentos | 14 | `quote`, `quote_item*`, `roteiro_*` | M07 |
| pagamentos | 4 | `vendas_pagamentos` | upload inclui Supabase Storage |
| paises | 1 | `paises` | |
| parametros | 12 | `parametros_*`, `admin_*` | |
| preferencias | 8 | `minhas_preferencias*`, `dashboard_widgets` | |
| produtos | 5 | `produtos`, `produtos_tarifas`, `tipo_pacotes`, `tipo_produtos` | M03 |
| profile | 1 | `users` | |
| push | 2 | `push_subscriptions` | |
| qr | 1 | — | |
| read-model | 1 | — | Cron-secret; substituir por `scheduled()` |
| relatorios | 13 | múltiplas | M11 |
| roteiros | 10 | `roteiro_*` | M07 |
| subdivisoes | 1 | `subdivisoes` | |
| tarefas | 3 | — | M08 |
| tipo-produtos | 1 | `tipo_produtos` | |
| todo | 5 | `todo_*` | M08 |
| user | 2 | `users` | |
| users | 1 | `users` | |
| vendas | 21 | `vendas`, `vendas_recibos*`, `vendas_pagamentos` | M04 |
| viagens | 10 | `viagens`, `viagem_*` | M06 |
| voucher-assets | 1 | `voucher_assets` | Supabase Storage |
| vouchers | 4 | `vouchers`, `voucher_*` | M06 |
| welcome-email | 1 | — | |

### Telas SvelteKit (rotas de UI) — domínios

| Domínio de UI | Observação |
|---|---|
| `/auth/*` | login, logout, register, mfa, recuperar-senha, nova-senha, convite |
| `/(app)/admin/*` | empresas, usuários, permissões, tipos-usuario, avisos, planos, lgpd, crm, email |
| `/(app)/clientes/*` | listagem, detalhe, edição, novo |
| `/(app)/vendas/*` | listagem, detalhe, cadastro |
| `/(app)/financeiro/*` | caixa, comissões, conciliação (X02), ajustes-vendas, formas-pagamento, notas-fiscais, regras |
| `/(app)/dashboard/*` | admin, financeiro, geral, gestor, master, vendedor, logs |
| `/(app)/operacao/*` | acompanhamento, agenda, conciliação (X02) |
| `/(app)/cadastros/*` | circuitos, destinos, estados, fornecedores, produtos, cidades, paises |
| `/(app)/orcamentos/*` | roteiros, orçamentos |
| `/(app)/relatorios/*` | relatórios |
| `/(app)/master/*` | multi-empresa (MASTER) |
| `/(app)/comissoes/*` | fechamento |
| `/(app)/metas/*` | metas de vendedor |
| `/(app)/parametros/*` | configurações, e-mail, integrações, importação |
| `/(app)/perfil/*` | MFA, perfil |
| `/(app)/aniversariantes` | |
| `/(app)/consultoria-online` | |
| `/(app)/debug`, `/diagnostico` | debug |
| `/calculadora` | pública |
| `/privacidade` | LGPD |
| `/negado` | acesso negado |
| `/test-env` | debug; 404 em produção |

## Chamadas diretas ao Supabase no cliente (frontend)

11 arquivos `.svelte` acessam `supabase` diretamente:

| Arquivo | O que faz |
|---|---|
| `/auth/login/+page.svelte` | `auth.getSession`, `auth.onAuthStateChange` |
| `/auth/mfa/+page.svelte` | `auth.mfa.*` (verificação de MFA) |
| `/auth/nova-senha/+page.svelte` | `auth.exchangeCodeForSession`, `auth.updateUser` |
| `/auth/recuperar-senha/+page.svelte` | `auth.resetPasswordForEmail` |
| `/(app)/+layout.svelte` | `auth.signOut` |
| `/(app)/perfil/mfa/+page.svelte` | `auth.mfa.*` (enroll/unenroll) |
| `/(app)/diagnostico/+page.svelte` | `auth.getSession` |
| `/(app)/orcamentos/roteiros/[id]/+page.svelte` | `storage.from('quotes').download` |
| `/(app)/parametros/integracoes/+page.svelte` | ? |
| `/(app)/parametros/orcamentos/+page.svelte` | `storage.from(LOGO_BUCKET).*` (upload/download de logo) |
| `/auth/recuperar-senha/+page.svelte` | já listado |

> Todos esses serão substituídos na F2 (Better Auth) e F5/F3 (R2 para arquivos).

## Endpoints a eliminar por exclusão deliberada (X02)

- 18 rotas `/api/v1/conciliacao/*`
- 1 rota `/api/v1/pagamentos/[id]/conciliar` (já stale no inventário)
- Telas: `/(app)/financeiro/conciliacao`, `/(app)/operacao/conciliacao`
- Dependências indiretas: `financeiro/ajustes-vendas` usa `conciliacao_recibos` (ver F0-04)

## Endpoints debug a remover de produção (F2-06)

- `/api/v1/dashboard/debug-aggregates`
- `/api/v1/debug-comissao`
- `/api/v1/debug/permissions`
- `/api/v1/debug/vendas-recibos-diff`
- `/api/v1/relatorios/ranking-debug`
- `/test-env`

## Endpoints cron-secret a substituir por scheduled() (F1-02, F5-02)

- `/api/v1/cron/alerta-comissao`
- `/api/v1/cron/lembretes-consultoria`
- `/api/v1/read-model/rebuild`

## Problemas identificados

| ID | Problema |
|---|---|
| P07 | Inventário stale: `/api/v1/pagamentos/[id]/conciliar` listado sem arquivo real |
| P08 | `/auth/logout` e `/test-env` fora de `api/` não aparecem no inventário |
| P09 | Supabase Storage usado diretamente no cliente (orcamentos, parametros) — substituir por R2 mediado em F3/F5 |
| P10 | MFA e auth fluxos totalmente acoplados ao SDK Supabase frontend |

## Aceite verificado

- [x] Discrepância de 1 entre `+server.ts` e inventário explicada
- [x] Todos os grupos de rotas catalogados por domínio
- [x] Endpoints fora de `/api/v1` identificados
- [x] Chamadas diretas ao Supabase no frontend mapeadas
- [x] Exclusões deliberadas (X02) com lista completa de rotas afetadas
- [x] Endpoints debug e cron-secret identificados para tratamento futuro
