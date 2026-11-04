# Reanálise da migração integral para D1 e R2

**Data:** 2026-11-04  
**Branch de trabalho:** `cursor/migracao-d1-r2-sem-supabase-d46b`  
**Estado:** o código da aplicação não consome mais o SDK, Auth, Storage nem RPCs remotos. Os D1 remotos ainda precisam receber a migration `0013` antes do deploy. Não desligar o projeto antigo até o ensaio de staging.

## Corte realizado em 04/11/2026

- Sessão do app, login, logout, recuperação de senha e 2FA usam Better Auth e a tabela `mfa_fatores`.
- `getAdminClient()` e `locals.dados` executam SQL no D1. As tabelas do catálogo legado ficam em `legado_*`, para conviver com o modelo novo (`vendas`, `clientes`, `user` etc.).
- Uploads, downloads e URLs de arquivo usam o binding R2. Buckets de leitura pública no Worker: `campanhas`, `mural-recados`, `message-template-themes`, `quotes`, `system-docs`. Os demais exigem sessão ou URL assinada.
- O limite persistente fica só no D1 (`security_rate_limits`) ou na memória do isolate. O fallback remoto foi removido.
- `rg -i supabase src` não encontra consumidor. `@supabase/ssr`, `@supabase/supabase-js` e o CLI `supabase` saíram do `package.json`.
- Nenhum Worker foi publicado e nenhuma migration foi aplicada em D1 remoto nesta etapa.

### Comandos manuais

```bash
npm run d1:migrate:staging
npm run d1:migrate:prod
# só depois do ensaio local/staging
npm run cf:deploy:staging
```

Segredos que continuam necessários: `BETTER_AUTH_SECRET`, `RESEND_API_KEY`. Não configurar URL, anon key nem service role do banco antigo.

**Data anterior:** 2026-10-31  
**Branch/SHA analisados então:** `reescrita/f2-identidade-autorizacao` / `b2f3a460`  
**Estado naquela data:** migração parcial.

Este documento separa o que o código demonstra do que ainda é hipótese ou decisão pendente. A decisão vigente de iniciar com banco e buckets vazios permanece: não transferir usuários, senhas, vendas, arquivos ou sessões antigas. Isso não dispensa reproduzir as regras de negócio necessárias no sistema novo.

## Estado atual e pendências

### 1. D1/R2 provisionados; tráfego ainda não foi cortado

- Staging D1 `vturapp-db-staging` (`96c13e55-60e3-4e3b-9ecc-b22da019c010`) e produção D1 `vturapp-db` (`36d3da2e-b186-48f8-bb3e-4f9a14b20235`) estão associados ao binding `DB` em `wrangler.toml`.
- As 13 migrations foram aplicadas nos dois bancos vazios; Wrangler não reporta migrations pendentes. Cada banco tem 30 tabelas da aplicação (32 incluindo `d1_migrations` e `_cf_KV`) e `PRAGMA foreign_key_check` não retorna violações.
- Os buckets R2 `vturapp-files-staging` e `vturapp-files` existem. A existência dos buckets ainda não prova que os fluxos ativos usem R2.
- O KV de staging `vturapp-kv-staging` (`10586afa5db14a7ab8d2e406ba98d5da`) foi criado e vinculado, substituindo o placeholder de `KV_BINDING`. O Worker de staging ainda não existe; o Worker atual de produção continua legado e contém secrets Supabase. Nenhum Worker com a configuração D1/R2 desta migração foi publicado.
- Na produção D1, as contagens de `user`, `empresas`, `vendas` e `clientes` são zero. Nenhum registro ou objeto Supabase foi importado; a decisão do usuário dispensa a migração histórica.
- A configuração Drizzle atual declara 30 tabelas. Pelo nome exato, somente 6 coincidem com tabelas públicas legadas (`clientes`, `produtos`, `formas_pagamento`, `vendas`, `agenda_itens`, `mural_recados`); os demais nomes precisam de mapeamento semântico, não de suposição automática.

### 2. O catálogo de migrations não é único

- Wrangler usa `./drizzle` como `migrations_dir` e carrega arquivos `.sql` do primeiro nível. A listagem local confirmou que ele incluía `0002_marvelous_chimera.sql`, apesar do comentário do arquivo dizer que Wrangler o ignorava.
- O arquivo vazio foi movido para `drizzle/archive/`, fora do conjunto aplicado por Wrangler.
- `drizzle/meta/_journal.json` acompanha migrations Drizzle somente até `0005_f4_vendas`; Wrangler também encontra `0006`–`0011`, que não estão nesse journal. A cadeia SQL em `./drizzle` foi escolhida como fonte canônica do Wrangler; `drizzle:generate`/`drizzle:push:local` foram removidos para evitar uma segunda história aplicada acidentalmente. O journal/snapshots Drizzle permanecem históricos e precisam de reconciliação planejada.
- A cadeia das 13 migrations foi aplicada do zero em D1 local temporário e nos D1 remotos de staging e produção. Isso valida a execução sintática da cadeia nesses ambientes, mas não comprova paridade funcional de todos os domínios.
- `supabase migration list --linked` foi executado com a CLI global do Mac (`2.122.0`): há 25 versões no conjunto combinado, somente `20260924184114` aparece nos dois lados, 9 aparecem apenas localmente e 15 apenas no remoto. Portanto, o histórico de migrations PostgreSQL também divergiu; não aplicar/reparar migrations automaticamente nem usar `migration repair` antes de cruzar cada arquivo local com o schema remoto e com os fluxos ainda ativos.

Referência do formato de descoberta do Wrangler: [D1 migrations](https://developers.cloudflare.com/d1/reference/migrations/).

### 3. Regras reais de acesso ainda não cabem no RBAC D1

O levantamento legado (`docs/f0/F0-04-regras-papeis-funcoes.md` e `src/lib/server/v1.ts`) registra:

- papéis `ADMIN`, `MASTER`, `FINANCEIRO`, `GESTOR`, `VENDEDOR` e `OUTRO`;
- escopos globais, multiempresa, empresa única e equipe de vendedores;
- `uso_individual`, permissões configuráveis por módulo e herança entre módulos.

A implementação nova (`src/lib/server/db/schema.ts`, `src/lib/server/auth/context.ts` e `src/lib/server/policy/`) aceita somente `admin`, `operador` e `visualizador`, exige uma empresa no contexto e mantém um vínculo por usuário. A própria documentação F2-03 deixa os escopos legados para depois. Isso é uma diferença de regra de acesso, não apenas de banco. M01/F2 não pode ser considerado concluído até compatibilizar o modelo ou documentar uma decisão de produto explícita.

**Progresso após a captura do catálogo:** a migration `0011_m01_legacy_access_model.sql` acrescenta o modelo de acesso ao D1. O fluxo de convite e alteração de papel sincroniza `user_profiles`/`modulo_acesso`; `resolveAuthContext` inclui o escopo D1 e as rotas v2 usam `canForContext`. Os papéis atuais de empresa são salvos como `OUTRO` com permissões `v2:*`, sem convertê-los em `ADMIN` global. A suíte Workers M01 passou com 16 casos, incluindo convite e distinção de exportação. A projeção cobre só os três papéis v2; os seis tipos legados, o acesso multiempresa das rotas, filtros de equipe no domínio e administração de tipos/permissões ainda não foram migrados.

**Progresso adicional:** `0012_security_rate_limits.sql` cria em D1 o armazenamento atômico de limites por janela. Todos os chamadores de `checkPersistentRateLimit` agora passam o binding D1; quando presente, a rotina armazena somente SHA-256 da chave. A suíte Workers do serviço passou (3/3), e a migration foi aplicada ao staging vazio. O fallback Supabase continua temporariamente para execuções sem binding D1, então essa RPC não pode ser retirada até remover esse caminho e garantir bindings em todos os ambientes.

### 4. Escopo de módulos tem status contraditórios

- `REESCRITA-REVISAO-E-ROTEIRO.md` marca M03/M08/M09/M10/M12 como concluídos.
- `ADR-009-modulos-adiados.md` ainda diz M03, M07, M08 e M10 adiados e M09 não montado, embora `app-v2.ts` já monte rotas de agenda, mural, produtos, destinos, dashboard, equipe e auditoria.
- M05/M06 misturam no catálogo comissões, viagens/vouchers e conciliação/importação. A exclusão de conciliação CVC/REXTUR não comprova que todas as regras legítimas de comissões ou todos os fluxos de viagem foram excluídos.

Os status precisam ser reconciliados por rota, tela, regra e tabela antes do corte da v1. Módulos excluídos por decisão anterior continuam excluídos; qualquer domínio ativo que ainda dependa do Supabase precisa de substituto D1/R2 ou retirada formal do produto.

### 5. Supabase ainda é caminho ativo, e R2 cobre só parte dos arquivos

- O app raiz, `hooks.server.ts`, layouts, login/MFA/logout, stores e várias rotas v1 ainda inicializam ou consultam Supabase.
- Há chamadas diretas ao Supabase Storage em configurações de orçamento, roteiros, assets de voucher, pagamentos e documentos de viagem. R2 v2 está comprovado principalmente para anexos de clientes.
- A API v2 é paralela; não substituiu o app e as rotas v1. Uma rota equivalente em v2 não prova que tráfego, cron, uploads e operações administrativas deixaram de usar Supabase.
- O SDK Supabase e credenciais continuam declarados/configurados para o legado.

O Storage remoto tem 10 buckets: `campanhas`, `master-docs`, `message-template-themes`, `mural-recados`, `profile-avatars`, `quotes`, `system-docs`, `viagens`, `viagens-documentos` e `voucher-assets`. Há buckets públicos e privados; cada um precisa de uma regra de acesso equivalente em R2/Worker. A decisão vigente dispensa transferir objetos antigos, mas não dispensa migrar os fluxos ativos de arquivo para R2.

## Schema PostgreSQL remoto: evidência atualizada

A CLI global do Mac (`supabase` 2.122.0) funciona. O erro anterior veio do binário Linux dentro de `node_modules`, incompatível com o macOS; a configuração pública do `.env` não foi necessária porque o CLI global está ligado/autenticado no projeto.

Foi obtido um inventário remoto de metadados usando `supabase gen types ... --linked` e consultas somente `SELECT` a `information_schema`/`pg_catalog`. Nenhuma linha de negócio foi consultada ou exportada. O resultado está em [`SCHEMA-LEGADO-2026-10-31.json`](./SCHEMA-LEGADO-2026-10-31.json), com UUIDs e e-mails literais em expressões de policy mascarados.

| Schema/objeto                             | Contagem observada |
| ----------------------------------------- | -----------------: |
| `public` — tabelas                        |                137 |
| `public` — views                          |                  6 |
| `public` — colunas                        |              1.641 |
| `public` — constraints / indexes          |          486 / 483 |
| `public` — rotinas / triggers             |           227 / 91 |
| `public` — tabelas com RLS / policies     |          137 / 396 |
| `storage` — buckets / policies / triggers |        10 / 33 / 7 |
| `auth` — tabelas gerenciadas              |                 27 |

O CLI Supabase está instalado globalmente em `/opt/homebrew/bin/supabase`; a falha anterior era do binário Linux incluído em `node_modules`, não do Mac. `supabase migration list --linked` confirmou conexão autenticada. O dump SQL completo ainda não foi obtido: `supabase db dump --linked --schema public` exige o daemon Docker/Colima, que não estava ligado nesta sessão. As funções estão catalogadas por assinatura, não por corpo; regras de RPC e triggers ainda devem ser cruzadas com as migrations versionadas e com a implementação antiga antes de portar os domínios.

O inventário F0 anterior de 95 tabelas não representa o schema remoto atual. A diferença inclui tabelas/views ausentes daquele agrupamento e exige nova reconciliação de escopo. O D1 tem hoje 30 tabelas declaradas em Drizzle; só 6 têm o mesmo nome de uma tabela legada, e nomes diferentes ainda precisam de mapeamento semântico por domínio. Isso não prova que as tabelas legadas devam todas ser recriadas: cada uma deve ser classificada como migrar, substituir por modelo novo ou excluir formalmente.

## Ordem de execução da migração

1. Fechar o mapa de regras e escopos de acesso; alinhar Better Auth, RBAC e isolamento D1 às permissões vigentes.
2. Consolidar uma única cadeia de migrations D1 reproduzível do zero e fazer o schema Drizzle refletir todas as tabelas/constraints realmente usadas.
3. Reconciliar cada domínio ativo: telas, rotas e métodos, validação, permissões, regras, tabelas/campos, arquivos e jobs. Migrar ou retirar explicitamente; não deixar fluxo ativo na v1 por omissão.
4. Provisionar D1/R2 separados por ambiente, aplicar migrations e validar os fluxos com dados sintéticos. A criação de bucket, isoladamente, não comprova uso integral.
5. Cortar o tráfego para o app novo e observar falhas/uso real das rotas antigas antes de removê-las.
6. Só quando não houver consumidores ativos, remover hook/layout/auth/SDK/storage/crons/secrets Supabase e revisar privacidade/documentação.
7. Tratar pausa, retenção ou exclusão do projeto Supabase como decisão operacional posterior; este roteiro não apaga dados ou recursos antigos.

## Evidências verificadas nesta etapa

- Wrangler D1 remoto: produção e staging sem migrations pendentes; ambos aplicaram 13 migrations e passaram `PRAGMA foreign_key_check`.
- Wrangler D1 remoto de produção: 30 tabelas da aplicação; contagens de usuários, empresas, vendas e clientes são zero.
- Wrangler KV/R2: bindings separados de KV para staging e produção; bucket `vturapp-files-staging` e bucket existente `vturapp-files`.
- Supabase CLI global do Mac: schema tipado e metadados remotos coletados sem ler registros de negócio; o inventário está no JSON ligado acima.
- `supabase migration list --linked`: 1 migration em comum, 9 somente locais e 15 somente remotas; reconciliação pendente, sem escrita remota.
- Rate limit: testes Workers em D1 passaram (3/3); staging recebeu `0012_security_rate_limits.sql`, listagem Wrangler sem pendências, tabela presente e `PRAGMA foreign_key_check` vazio.
- Busca estática do código: integrações Supabase servidor/cliente e chamadas Storage continuam presentes; API v2 usa Better Auth/D1 para os fluxos já portados.
- Nenhum registro ou objeto Supabase foi lido/exportado; nenhum Worker com a configuração D1/R2 foi publicado, nenhum segredo Supabase alterado e nenhum recurso Supabase removido. O dump SQL não foi obtido porque o daemon Docker estava desligado.
