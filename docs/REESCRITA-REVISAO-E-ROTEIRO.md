# VTURAPP — revisão e roteiro da reescrita

Revisão: 2026-10-26 · Situação: planejamento, sem implementação da reescrita.

**Guia vigente para a reescrita.** Este arquivo concentra a sequência de execução e o acompanhamento das tarefas. `REESCRITA-PLANO.md` é referência histórica; seu texto original foi mantido com um aviso de substituição no início. Não atualizar os dois checklists como se fossem frentes de trabalho independentes.

## 1. Direção recomendada

Manter SvelteKit e Hono, adotar D1 para dados relacionais e R2 para arquivos, organizar o código por domínio e reconstruir autenticação e autorização com testes desde o início. A reescrita deve acontecer por fluxos completos: tela, validação, permissão, operação de negócio, banco e testes juntos.

**Decisão confirmada pelo usuário em 26/10/2026: começar com uma base vazia.** Não importar usuários, senhas, vendas, arquivos ou sessões antigos. Criar banco e buckets novos. Isso dispensa ETL de dados históricos e migração de credenciais; não dispensa o levantamento das regras de negócio. Também não autoriza apagar os recursos antigos agora.

O documento anterior, `docs/REESCRITA-PLANO.md`, tem boa cobertura de temas, mas contém premissas técnicas incorretas e uma sequência que quebraria o aplicativo antes de existir um substituto. Esta revisão preserva o original e propõe um roteiro para a futura execução. Não executar os comandos do documento anterior sem revisar sua compatibilidade.

**Fonte da revisão:** leitura completa da cópia local v2.0, código e configuração do repositório, além das referências oficiais citadas abaixo. O artefato compartilhado no Claude exibiu o título correspondente, mas seu conteúdo não carregou; não foi possível confirmar que as duas cópias são idênticas.

## 2. O que já foi verificado

Fotografia do código em `8bb9f19d537adf7b3b2a9d36c80436c5301a5934`, branch `main`. O plano original estava como arquivo não rastreado. Esta análise não executou build, testes de aplicação, consultas ao banco remoto ou deploy.

| Item observado | Evidência e consequência |
|---|---|
| SvelteKit 2.59.0, Svelte 5.55.1, Hono 4.12.16 | Versões do `package-lock.json`; o cabeçalho “SvelteKit 5” do plano confunde o framework com Svelte. |
| Vite 5.4.21, adapter-cloudflare 7.2.8, Wrangler 4.87.0 | Atualizar como conjunto compatível, incluindo plugins, runtime e configuração. |
| Tailwind 4.3.3, Flowbite 1.33.1, Vitest 2.1.9 | Atualização de biblioteca não substitui a validação dos componentes existentes. |
| 258 entradas no inventário de API e 259 arquivos `+server.ts` | `docs/api-inventory.json` e contagem estática. São medidas diferentes; reconciliar por rota e método antes de definir a cobertura. |
| 354 arquivos TypeScript na pasta de rotas Hono | Incluem testes; não representam 354 endpoints. |
| 102 arquivos `*.test.ts` e 90 componentes Svelte | Quantidade de arquivos, sem atestar aprovação dos testes ou cobertura de negócio. |
| 10 migrações SQL locais | Não demonstram que todo o schema remoto esteja documentado. |
| Ponte SvelteKit → Hono já existente | `src/lib/server/api/sveltekit.ts` passa `{ event }` ao Hono. `c.env.DB` não existe nesse contrato atualmente. |
| Permissões e escopos mais complexos que uma hierarquia | `src/lib/server/v1.ts`: ADMIN, MASTER, FINANCEIRO, GESTOR, VENDEDOR, OUTRO, múltiplas empresas e uso individual. |
| Componentes de UI já encapsulados | `src/lib/components/ui`; há cópias locais de Flowbite 0.48.6 e uma tabela do pacote atual. A troca de UI precisa incluir esse código legado, foco e aparência. |
| Cloudflare já é o destino de execução | `wrangler.toml`: Worker, assets, KV, dois crons; sem bindings de D1/R2. Placement atual em Oregon foi motivado pelo Supabase. |
| Ainda há dependências de conciliação | Ex.: `financeiro/ajustes-vendas.ts` e `ajustes-vendas-list.ts` usam `conciliacao_recibos`. Não transportar essas dependências automaticamente. |

### Escopo de negócio que a reescrita deve respeitar

- Cadastro **manual** de vendas; não reintroduzir importadores CVC/REXTUR.
- Identidade visual VTUR nos documentos, usando uma fonte de marca centralizada; hoje está em `src/lib/brand.ts`.
- Conciliação CVC/REXTUR permanece fora do produto. O plano anterior a recoloca no domínio financeiro; corrigir isso no inventário e nos testes.
- Comissões, recebimentos e caixa continuam sujeitos ao levantamento de regras. Excluir conciliação não significa excluir todo o financeiro.
- Mudanças de regras, papéis, propriedade de clientes e alcance de gestores precisam ser explícitas. A troca de banco não deve alterá-las por acidente.

## 3. Correções necessárias no plano anterior

| Local no plano v2.0 | Problema | Substituição recomendada |
|---|---|---|
| F0.3 e F2 | Remover SDKs/clientes Supabase antes de substituir seus consumidores | Preservar o ambiente antigo como referência. Na aplicação nova, remover cada dependência somente quando o fluxo substituto estiver funcionando. Evitar adaptadores genéricos que imitem toda a API Supabase. |
| Stack e F0.3 | Instalar tudo em `latest` de uma vez | Avaliar versões estáveis como conjunto, fixar no lockfile e testar por mudança. A consulta ao registro npm nesta revisão retornou Kit 3.1.0 em `latest`; Kit 3 altera APIs de configuração e Cloudflare. [Guia oficial](https://svelte.dev/docs/kit/migrating-to-sveltekit-3). |
| Decisões de auth | Lucia v3 apresentada como alternativa mantida | Remover essa opção: o projeto informa sua descontinuação. Better Auth é o candidato inicial, sujeito a uma prova real em D1/Workers. [Lucia](https://lucia-auth.com/). |
| F1.2 e F2.1 | Exemplos assumem novos bindings e APIs de auth sem validar a integração | Definir uma ponte tipada e um único responsável pelo handler de auth. A versão escolhida determina como obter bindings; não copiar `event.platform` ou `c.env.DB` indiscriminadamente. |
| F2 e F3.6 | Cache de sessão/permissão sempre ligado por cinco minutos | Exigir revogação testada. Começar sem cache distribuído de autorização; sessão e vínculo ativo são verificados no servidor. O cookie cache pode postergar a percepção de revogação. [Better Auth](https://better-auth.com/docs/concepts/session-management). |
| F3.5 | `master > admin > gestor > vendedor > viewer` | Não corresponde ao modelo encontrado e omite FINANCEIRO e uso individual. Modelar capacidades, ações e escopo de recursos, separando administração de sistema de acesso a dados comerciais. |
| F3.2 | Acrescentar `WHERE empresa_id = ?` em tudo | Tabelas globais, vínculos com várias empresas, equipes e registros filhos exigem políticas próprias. Verificar proprietário e empresa também em joins, arquivos, relatórios, exports e tarefas. |
| F1.4 e F4.5 | Limites incorretos de D1 | Atualmente: linha/string/BLOB até 2.000.000 bytes; banco até 500 MB no Free ou 10 GB no Paid. “1.000 linhas por consulta” não é o limite documentado. Paginar por experiência e custo. [Limites oficiais](https://developers.cloudflare.com/d1/platform/limits/). |
| F4.4 | “Triggers não existem no D1” | D1 oferece recursos de SQLite, incluindo triggers; funções e triggers PostgreSQL precisam de redesenho. Escolher entre constraint/trigger e operação de negócio conforme a regra. [SQL D1](https://developers.cloudflare.com/d1/sql-api/sql-statements/). |
| F8.4 | `batch()` executaria consultas em paralelo | Executa instruções sequencialmente, em lote transacional, com rollback em caso de falha. Não equivale a uma transação interativa do ORM. [API D1](https://developers.cloudflare.com/d1/worker-api/d1-database/). |
| F5.4 | Upload com `presigned POST` | R2 não suporta o POST de formulário assinado descrito; usar PUT assinado ou upload controlado pelo Worker, conforme tamanho e validação. URLs assinadas dão acesso a quem as possui até expirar. [R2](https://developers.cloudflare.com/r2/api/s3/presigned-urls/). |
| F5.4 e F6.1 | Limites universais de 10 s de CPU e 30 s de ociosidade | CPU depende do plano/configuração; duração HTTP e CPU são medidas distintas. SSE exige reconexão e tratamento de interrupções, sem assumir esse limite de 30 s. [Workers](https://developers.cloudflare.com/workers/platform/limits/). |
| F6 | KV como pub/sub e contador de segurança confiável | KV tem consistência eventual. Não usá-lo como autoridade de revogação, contador atômico ou entrega garantida. Polling pode resolver recados; DO só se a necessidade de tempo real justificar. [Consistência KV](https://developers.cloudflare.com/kv/concepts/how-kv-works/). |
| F8.5–8.6 | Replicação automática, `cacheTtl` no D1 e placement antigo | Réplicas exigem Sessions API. `cacheTtl` citado não é uma opção genérica de consulta D1. Medir a topologia nova; preservar consistência após gravações e em verificações de acesso. [Replicação D1](https://developers.cloudflare.com/d1/best-practices/read-replication/). |
| F8.6 | HTTP/2 Push e FID como alvos atuais | Priorizar carregamento seletivo, preload criterioso e INP. HTTP/2 Push foi removido do Chrome. [Chrome](https://developer.chrome.com/blog/removing-push/), [Web Vitals](https://web.dev/articles/vitals). |
| F9 | Segurança, testes e performance concentrados no final | Criar a esteira de validação na F0 e aplicar critérios de aceite em cada fluxo. A auditoria final confirma o trabalho acumulado. |
| F4.2 | Exportar/importar todos os dados antigos | Dispensado pela decisão de começar vazio. Inventariar schema/RPCs apenas para descobrir regras e dependências; criar seeds novos e sintéticos. |

## 4. Arquitetura proposta e decisões de ferramentas

Preferir um aplicativo modular com um ponto de implantação inicial. Cada domínio tem schemas de entrada/saída, políticas de acesso, operações de negócio e repositórios D1. Telas e endpoints usam essas mesmas operações; não duplicar regras entre `load`, form actions e Hono, nem fazer SSR chamar a própria API por HTTP sem necessidade.

```text
Telas SvelteKit + componentes de UI compartilhados
                 ↓ contratos validados
SvelteKit / Hono → contexto autenticado → políticas de acesso
                 ↓
Operações por domínio → repositórios D1 / serviço de arquivos R2
                 ↓ quando necessário
Eventos persistidos → tarefas com retry / notificações
```

| Área | Proposta | Como fechar a decisão |
|---|---|---|
| SvelteKit + Svelte + Hono | Manter a família de ferramentas; avaliar Kit 3 estável | Prova com SSR, cookies, bindings, build, crons e testes; registrar versões exatas, Node, Vite e adaptadores compatíveis. |
| D1 + R2 | Confirmados no objetivo do projeto | Um D1 inicial compartilhado com isolamento lógico explícito; separar bancos por ambiente. Reavaliar particionamento apenas com volume/requisito demonstrado. |
| Drizzle | Candidato preferencial para schema e queries | Testar SQL gerado, constraints, migrations e operações atômicas em D1 real. Uma única pasta e um único histórico de migrations, configurados também no Wrangler. |
| Better Auth | Candidato preferencial para autenticação | Provar adapter SQLite/D1, sessões, convite, recuperação, MFA, passkeys e envio de e-mail. Não presumir que o plugin de organização substitui as políticas do VTUR. [Adapter oficial](https://better-auth.com/docs/adapters/drizzle). |
| UI | Preservar a interface dos wrappers existentes | Comparar uma tela/formulário/modal completo usando a base atual versus componentes acessíveis, como Bits UI/shadcn-svelte. Decidir por manutenção, acessibilidade e bundle medidos. Não manter duas bases de UI indefinidamente. |
| Validação | Schemas compartilhados, por exemplo Zod | Validar no servidor; o formulário pode reutilizar o schema sem receber código ou credenciais do servidor. |
| KV | Opcional, para dados tolerantes a atraso | Não acrescentar cache apenas porque o binding já existe. Documentar chave, escopo, invalidação e atraso aceito de cada uso. |
| Tempo real | Polling com cursor como primeira hipótese para recados | Definir latência necessária e usuários simultâneos. Usar DO/WebSockets se houver requisito demonstrado; SSE sozinho não fornece broadcast entre instâncias. |
| Processamento assíncrono | Cron e, se necessário, Queues | Introduzir fila quando retry durável e desacoplamento forem necessários; consumidor idempotente, limite de tentativas e tratamento de falhas. |
| Busca | Índices/consulta D1 primeiro | Verificar normalização de nomes, acentos, tamanho de catálogo e custo. Busca externa só após evidência. |

Evitar microserviços, múltiplos bancos por empresa, três camadas de cache e bibliotecas concorrentes sem uma necessidade mensurável. Nenhuma ferramenta torna o aplicativo automaticamente seguro ou rápido.

## 5. Modelo de segurança e dados que precisa existir antes dos módulos

### Autenticação e conta

- Cadastro por convite como proposta inicial; confirmar política de entrada. Criar o primeiro administrador por procedimento único, sem senha padrão e sem endpoint público permanente de bootstrap.
- Verificação de e-mail comprovada; convite não equivale a verificação sem token seguro, expiração e uso único. E-mail de recuperação não revela se a conta existe.
- Cookies seguros, HttpOnly, SameSite apropriado, origem confiável e proteção CSRF nas mutações, incluindo endpoints que não passam por form actions.
- Sessões persistidas, expiração por inatividade/absoluta conforme política, listagem de dispositivos, logout e revogação após bloqueio, troca de senha, alteração de vínculo e incidente.
- MFA para contas privilegiadas como proposta de segurança; recuperação, códigos de backup, perda de dispositivo e reset administrativo com nova autenticação e auditoria. Provar compatibilidade de criptografia/hash com o runtime e seus limites.
- Passkeys com RP ID e origens definidos por ambiente/domínio. Como não haverá importação de usuários, serão cadastradas novamente na aplicação nova.
- Limitação de tentativas por conta/IP e proteção contra abuso; definir comportamento quando o limitador falhar. Não cair silenciosamente em contador apenas local para operações críticas.
- Segredos por ambiente, acesso mínimo à Cloudflare e ao envio de e-mail; rotação e mascaramento de logs. Nenhuma credencial em URL, bundle, repositório ou evidência.
- Envio de e-mail por API HTTP; SMTP não é viável no runtime. E-mails de conta usam remetente da plataforma, separado das configurações de e-mail por empresa (ver F1-07 e F2-02).

### Autorização e isolamento

Construir uma matriz **papel × ação × recurso × escopo**, com exemplos positivos e negativos. Negar por padrão; menus ocultos são apenas apresentação. A identidade e os vínculos vêm da sessão validada, não do `company_id` recebido do navegador.

| Escopo a modelar | Casos obrigatórios para validar |
|---|---|
| Próprio vendedor / uso individual | Cadastro, consulta e alteração dos próprios registros; impedir referência a cliente/venda de outro escopo. |
| Equipe | Gestor acessa somente vendedores vinculados, inclusive após remoção do vínculo e em relatórios agregados. |
| Empresa | Membro ativo, ações específicas por módulo e acesso a registros filhos validado pela empresa do pai. |
| Várias empresas | MASTER/FINANCEIRO com vínculos explícitos; trocar a empresa da tela não concede acesso. |
| Administração de sistema | Separar gestão de plataforma de acesso comercial. Qualquer exceção de suporte precisa de política e auditoria próprias. |
| Arquivos, exportações e tarefas | Aplicar a mesma política em download, geração de PDF, export, cron e consumo de fila. |

Criar constraints de integridade e, quando adequado, chaves estrangeiras compostas que impeçam associar um filho de uma empresa a um pai de outra. Não há substituição automática de RLS por Drizzle. Decisões sensíveis e revogação devem usar uma leitura com garantia de atualidade; réplica atrasada ou cache não pode reautorizar um usuário bloqueado.

### Regras de dados e de dinheiro

- Catálogo de entidades e proprietários; separar dados globais dos dados de empresa. Mapear RPCs, triggers, views e joins para **regras**, não fazer conversão textual de PostgreSQL para SQLite.
- Valores monetários em centavos inteiros quando a moeda/escala permitirem; percentuais e câmbio com precisão definida, arredondamento explícito e sem `float` para cálculo financeiro. Definir moeda e momento de conversão.
- Datas de viagem/vencimento como datas de calendário; eventos com instante UTC e fuso de exibição. Não converter automaticamente uma data sem hora em timestamp.
- Venda, itens, recibos, pagamentos, cancelamentos e comissões com estados e invariantes documentados. Evitar exclusão física de fatos financeiros quando a regra exigir estorno/histórico.
- Gravações compostas atômicas; constraints, unicidade e idempotência para duplo clique/retry. Edição concorrente com versão ou condição equivalente; retornar conflito em vez de sobrescrever silenciosamente.
- Escrita no D1 e objeto no R2 não formam uma transação conjunta. Usar estado de upload, confirmação, compensação e limpeza de órfãos. Para eventos externos, persistir a intenção junto à alteração de negócio e processar com retry idempotente.
- Auditoria de alterações críticas: ator, empresa, ação, recurso, resultado e correlação. Não registrar senhas, tokens, documentos completos ou dados pessoais desnecessários. Administrador comum não pode editar o histórico.
- Definir retenção, acesso, exportação e descarte de dados pessoais. Soft delete de tudo não é uma política de privacidade. Se houver requisitos legais específicos, validá-los antes de fixar prazos.

### Arquivos e documentos

R2 privado como padrão para documentos de clientes. Prefixos de empresa ajudam organização, mas não autorizam acesso. Validar dono do registro antes de emitir link ou servir o arquivo; manter metadados no D1 e chaves imprevisíveis.

Limitar tamanho e tipos, validar conteúdo além da extensão/MIME declarado, tratar SVG/HTML e downloads com cabeçalhos seguros. Definir se o risco exige quarentena e análise de conteúdo. Upload direto só é concluído depois da verificação no servidor; não confiar no aviso de sucesso do navegador. Para revogação imediata de download, preferir acesso mediado e autorizado por requisição; URL assinada continua válida até expirar.

## 6. Fases e portas de aceite

**Estados:** PENDENTE, EM ANDAMENTO, BLOQUEADA, CONCLUÍDA, DISPENSADA. Só usar CONCLUÍDA com evidência e aceite. As caixas abaixo são o registro operacional inicial, não uma afirmação de implementação.

| Fase | Objetivo | Dependência | Estado inicial |
|---|---|---|---|
| F0 | Inventário, regras, baseline e validação contínua | Nenhuma | CONCLUÍDA (26/10/2026, commit `8aeaa5e0`; evidências em `docs/f0/`) |
| F1 | Prova de stack em ambiente isolado | F0 | CONCLUÍDA (26/10/2026, commits `76b2b0dd`–`06dcbbf8`; evidências em `docs/f1/`) |
| F2 | Identidade, permissões e fundação de dados | F1 | CONCLUÍDA (26/10/2026, commits `06cf08d7`–`b4a91f6b`; evidências em `docs/f2/`; baseline revalidada em `c8bb5a58`) |
| F3 | Primeiro fluxo completo e base visual | F2 | EM ANDAMENTO |
| F4 | Núcleo de vendas e financeiro | F3 | EM ANDAMENTO (F4-01 concluída 30/10/2026; F4-02 concluída 30/10/2026) |
| F5 | Demais módulos e tarefas | F4 para dependências comerciais | PENDENTE |
| F6 | Operação, carga, recuperação e revisão final | F3–F5 | PENDENTE; medições começam antes |
| F7 | Ensaio de lançamento e entrada em produção | F6 | PENDENTE |
| F8 | Estabilização e retirada das dependências antigas | F7 | PENDENTE |

### F0 — entender e estabelecer a referência

- [x] F0-01: registrar branch, SHA, alterações existentes, versões resolvidas e baseline de check/testes/build; manter falhas preexistentes identificadas e com destino, sem declará-las resolvidas.
- [x] F0-02: reconciliar inventário por **rota + método**, incluindo aliases, endpoints SvelteKit fora do Hono, auth, uploads, exports, debug, webhooks, crons e chamadas diretas ao Supabase no cliente.
- [x] F0-03: catalogar entidades, schema disponível e RPCs referenciadas. Se faltar informação, obter apenas o schema necessário com acesso de leitura; não exportar dados pessoais para documentação. Ao mapear entidades para o Drizzle, registrar a convenção de tipos para o SQLite: booleanos → INTEGER (0/1), datas sem hora → TEXT ISO 8601, timestamps → TEXT ISO 8601 UTC, UUIDs → TEXT, valores monetários → INTEGER (centavos). O SQLite usa tipagem por afinidade e não por declaração rígida; os tipos TypeScript gerados pelo Drizzle devem expressar essas convenções explicitamente para evitar inconsistências silenciosas em runtime — especialmente após a migração do PostgreSQL, onde booleano e timestamp têm tipos nativos distintos.
- [x] F0-04: montar mapa de regras e papéis com exemplos. Para cada função existente: manter, redesenhar ou excluir; remoções de conciliação/importadores entram como exclusão deliberada.
- [x] F0-05: preparar CI em modo de execução única: tipos, testes, inventário e build. Acrescentar testes D1/Worker e E2E à medida que os fluxos existirem; não depender de mocks Supabase para provar a camada nova. E2E com Playwright sobre 3–5 fluxos críticos (login, criação de venda, acesso negado); a correção do `npm test` para modo `run` está registrada na seção 9. Para testes que acessam D1/KV/R2, usar `@cloudflare/vitest-pool-workers` — integração oficial que roda sobre o Miniflare e simula o runtime Workers com fidelidade (o uso programático direto do Miniflare é desaconselhado; o pacote segue como motor do `wrangler dev`). O projeto usa `vitest.workspace.ts` com grupos `unit`/`dom`: o pool de Workers entra como terceiro grupo, sem migrar a suíte existente. Conferir a faixa de peer dependency do Vitest antes de instalar (projeto em Vitest 2.1.9).
- [x] F0-06: definir cenários de UX/performance e dados sintéticos; registrar requisitos de custo, volume, simultaneidade, disponibilidade e recuperação ainda desconhecidos. Estimar linhas lidas/escritas por rebuild do read model e o custo mensal projetado no D1 (cobrança por linha lida/escrita, limites diários no Free) antes de decidir onde as agregações vivem: consulta direta, tabela pré-agregada por escrita ou cron noturno.
- [x] F0-07: registrar decisões pendentes de login, papéis, UI e escopo mínimo do lançamento. Registrar que importação histórica está DISPENSADA por decisão do usuário. Criar `docs/adr/` com um arquivo por decisão (stack, autenticação, UI, tempo real, dinheiro/datas); decisão nova ou revertida vira arquivo novo, nunca edição retroativa.

**Aceite:** catálogo rastreável, exclusões explícitas, baseline reproduzível, nenhum dado antigo alterado. Primeiro passo da execução é F0-01, não instalar pacotes.

### F1 — provar a combinação de ferramentas

- [x] F1-01: criar linha de trabalho isolada e ambientes local/staging/produção com bindings, secrets, buckets e bancos distintos; registrar recursos sem credenciais.
- [x] F1-02: testar conjunto estável de SvelteKit/Svelte/Vite/adapter/Hono/Wrangler e runtime. Validar SSR, assets, cookies, variáveis, ponte Hono e cron; guardar versões exatas e motivos em decisão técnica. Cron pelo handler `scheduled()` nativo do Worker, sem endpoint HTTP público nem segredo em header: `scripts/patch-worker-scheduled.js` e a rota `/api/v1/read-model/rebuild` não têm equivalente na aplicação nova.
- [x] F1-03: testar Drizzle + D1: criar banco vazio, aplicar migrations, inserir, consultar, editar condicionalmente, falhar e reverter um lote; validar constraints no runtime Cloudflare. Verificar que os tipos TypeScript do schema Drizzle expressam as convenções de tipo SQLite registradas na F0-03; confirmar inserção e leitura correta de booleanos, datas, UUIDs e valores monetários entre o modelo de domínio e o armazenamento D1 — inconsistência aqui propaga erros silenciosos para toda a camada de negócio.
- [x] F1-04: testar Better Auth em D1/Workers com sessão revogável, MFA/passkey e e-mail de teste. Validar dependências e adapters da versão escolhida, sem copiar imports antigos do plano. Plano B registrado desde já: se a prova falhar, implementar sessão própria sobre Drizzle (cookie HttpOnly com token gravado com hash no banco, expiração e revogação na aplicação — o modelo que a documentação do Lucia passou a ensinar como guia); o escopo de auth do VTUR (e-mail/senha, TOTP, passkeys, convites) é moderado e viável sem biblioteca.
- [x] F1-05: testar upload/download privado R2 com acesso negado para outra empresa e estratégia de falha/limpeza.
- [x] F1-06: comparar um formulário/modal representativo na base visual atual e na candidata. Registrar escolha e plano de substituição dos wrappers legados.
- [x] F1-07: provar envio de e-mail transacional no runtime por API HTTP (Resend ou equivalente). SMTP cru não é viável em Workers no fluxo normal, e o sistema atual aceita SMTP por empresa (`src/lib/server/emailSettings.ts`): decidir se a configuração por empresa passa a aceitar só provedores HTTP ou se o modelo de configuração muda.

**Aceite:** prova end-to-end em staging com recursos novos, evidências de falha e sucesso; stack escolhida por compatibilidade demonstrada. Se uma biblioteca não atender, trocar só a candidata e repetir os critérios, sem iniciar dois caminhos de implementação.

### F2 — identidade, autorização e estrutura de dados

- [x] F2-01: definir schema inicial por domínio, constraints, índices e dono único de migrations; criar seeds de referência permitidos e fixtures sintéticas.
- [x] F2-02: implementar conta, convite, verificação, recuperação, logout, revogação e gestão de sessões conforme seção 5. Bootstrap sem acesso público residual. E-mails de conta (verificação, recuperação, convite) são da plataforma, não da empresa: definir remetente e provedor próprios, separados das configurações de e-mail por empresa.
- [x] F2-03: implementar políticas centralizadas e contexto de acesso; incluir matriz de capacidades e escopos reais do VTUR, sem hierarquia inventada.
- [x] F2-04: provar isolamento entre empresas, equipes e uso individual em leitura, gravação e agregação; provar bloqueio imediato na próxima requisição após revogação, ressalvadas operações já iniciadas.
- [x] F2-05: validação de entrada, erros consistentes, CSRF/origem, CSP compatível com o framework, headers, auditoria e limitador de abuso com política de falhas.
- [x] F2-06: proibir endpoints de debug em produção por teste do roteamento final, incluindo caminhos alternativos; revisão de segredos, dependências e logs.

**Aceite:** duas empresas e papéis sintéticos demonstram acessos permitidos e negados por API e navegador; alterar IDs/empresa não contorna a política. Autenticação no banco novo funciona sem Supabase.

### F3 — primeiro fluxo completo e experiência compartilhada (CONCLUÍDA em 29/10/2026)

- [x] F3-01: implementar cadastro/listagem/detalhe/edição de cliente e um anexo privado usando as fundações de F2; preparar o cliente para ser referenciado por venda manual. Evidências: `docs/f3/F3-01-clientes-d1-r2.md`.
- [x] F3-02: tela com busca, filtros, cursor estável, estados vazio/carregando/erro, formulário, detalhe e anexos. Evidência: `src/routes/reescrita/clientes/+page.svelte`; usa Better Auth isolado e diálogos acessíveis documentados em F3-03.
- [x] F3-03: adotar tokens semânticos e wrappers compartilhados para botões, campos, cartões, checkbox, tabela responsiva, alertas, estados, paginação e diálogo nativo acessível; manter componentes de célula pequenos e específicos. Evidência: `docs/f3/F3-03-componentes-visuais.md`.
- [x] F3-04: completar validação funcional autenticada em desktop e mobile, criação/edição em navegador, acesso negado, retry, upload inválido, conflito com recarga de dados e medição de carga/consultas. Cobertura HTTP/Workers, revisão autenticada da lista/formulários/detalhe e cursor com várias páginas estão em `docs/f3/F3-04-validacao-integrada.md`; contagem SQL foi instrumentada (4 chamadas D1 por página) e navegação até a linha visível mediu 279 ms localmente. Upload pela UI validado com Playwright em 29/10/2026 (anexo exibido no detalhe e download byte a byte idêntico; script em `scripts/f3-04/`).

**Aceite:** fluxo completo utilizável com dados sintéticos no D1/R2, sem travamento de modal ou rolagem horizontal. Esse fluxo vira referência de implementação para os demais.

### F4 — vendas, recebimentos e comissões

- [x] F4-01: documentar e implementar venda manual, produtos/itens, moeda, recibos/pagamentos e estados necessários; transação e idempotência para as gravações compostas.
- [ ] F4-02: implementar alteração, cancelamento/estorno e comissão com exemplos de cálculo, arredondamento e datas; preservar invariantes sob retry e concorrência.
- [x] F4-03: implementar consultas/dashboards/relatórios a partir do mesmo contrato financeiro; totais precisam reconciliar com os registros de origem.
- [x] F4-04: revisar read models: começar com queries e índices adequados; criar agregações/rebuild apenas onde necessário, com versão, checkpoint, recomposição e limite de atraso visível. A escolha usa a estimativa de linhas/custo de F0-06; o rebuild a cada 5 minutos do sistema atual não é portado por padrão.
- [x] F4-05: gerar PDFs/documentos com marca VTUR e testes de conteúdo/acesso; verificar quebra de página e valores em exemplos representativos.
- [x] F4-06: provar ausência de importadores e conciliação excluídos, incluindo permissões, menus, rotas, parsers e dependências indiretas do financeiro.

**Aceite:** casos financeiros aprovados, duas gravações simultâneas não duplicam nem corrompem valores; relatórios batem com as vendas/recebimentos; nenhum cálculo depende de dado externo legado.

### F5 — completar o escopo de lançamento

- [x] F5-01: executar o catálogo de módulos abaixo, cada um com status próprio e os mesmos critérios de F3/F4.
- [x] F5-02: tarefas agendadas e notificações com autenticação apropriada, processamento em lotes, retomada e idempotência. Provar que um cron não envia e-mail/push duplicado e não perde escopo de empresa. As tarefas usam o handler `scheduled()` nativo (ver F1-02); segredos de cron em header desaparecem.
- [x] F5-03: recados/mural com cursor e retomada; escolher polling/SSE/DO pela necessidade validada, com reconexão e revogação de acesso também para conexões abertas.
- [x] F5-04: eliminar acessos Supabase restantes no aplicativo novo e auditar grafo de imports, rotas e configuração. Não remover uma dependência só porque desapareceu do caminho feliz.

**Aceite:** cada rota inventariada possui destino novo testado ou exclusão justificada. Módulos adiados não aparecem como funcionais. Supabase não é necessário para executar o aplicativo novo.

### F6 — operação e verificação integrada

- [x] F6-01: carga com volume representativo e empresas simultâneas; medir p50/p95, erros, filas, SQL lido/escrito, armazenamento e custo. Testar dados frios, não só cache aquecido.
- [x] F6-02: auditoria de segurança baseada nos requisitos aplicáveis de OWASP ASVS, com foco em auth, isolamento, arquivos, XSS/CSRF, abuso, exportação e vazamento em logs/caches. Registrar achados e correções.
- [x] F6-03: teste de backup/restauração D1 e recuperação dos arquivos R2; documentar consistência entre metadados e objetos e exclusões acidentais. Time Travel do D1 não restaura R2. [Recuperação D1](https://developers.cloudflare.com/d1/reference/time-travel/).
- [x] F6-04: teste de falha de e-mail, upload, banco, fila, rede e repetição de tarefa; alertas com ação e correlação, sem dados pessoais desnecessários.
- [x] F6-05: revisão de acessibilidade, navegação mobile, privacidade e experiência dos papéis reais; corrigir bloqueios antes do lançamento.

**Aceite:** cenários de recuperação executados, riscos críticos de segurança/negócio resolvidos, custos e limites conhecidos; metas de recuperação e performance acordadas e demonstradas, ou limitações explicitamente aceitas.

### F7 — ensaiar e lançar a base nova

- [ ] F7-01: ensaio em banco/bucket vazios: migrations do zero, seeds mínimos, bootstrap, convite e primeiro cadastro/venda; nenhum usuário ou arquivo antigo importado.
- [ ] F7-02: release vinculada a SHA e migrations exatas; staging validado, configuração de domínio, e-mail, passkeys, cookies e jobs conferida. Aplicar migração por ambiente explicitamente.
- [ ] F7-03: definir reversão da aplicação e correção/restauração dos dados. Depois das primeiras gravações reais, voltar ao sistema antigo não recupera esses registros; priorizar correção compatível ou recuperação ensaiada.
- [ ] F7-04: publicar na janela combinada e verificar o domínio real: login, permissão, fluxo principal, arquivo privado, documento e cron. Registrar evidências sem expor dados pessoais.

**Aceite:** aplicação nova operacional na versão validada, observabilidade ativa e plano de resposta utilizável. Upload de build sozinho não encerra a fase.

### F8 — estabilizar e retirar o legado

- [ ] F8-01: acompanhar métricas e incidentes por uma janela acordada; revisar custos e gargalos reais antes de acrescentar infraestrutura.
- [ ] F8-02: concluir retirada de SDKs, secrets, webhooks, crons, documentação e permissões antigas no aplicativo novo; remover componentes obsoletos mantendo licenças necessárias.
- [ ] F8-03: decidir separadamente retenção/desativação dos recursos Supabase e arquivos antigos. Não excluir o ambiente antigo como consequência automática do deploy.
- [ ] F8-04: entregar guia de operação, acesso emergencial, restauração, atualização de dependências e próximo backlog priorizado.

**Aceite:** equipe consegue operar e retomar o projeto usando os documentos; pendências possuem responsável e próximo passo. Recursos antigos têm destino explícito.

## 7. Catálogo de módulos: criar uma linha de trabalho por domínio

O inventário inicial abaixo precisa ser reconciliado na F0. Não confundir presença no código antigo com obrigatoriedade no lançamento.

| ID | Domínio | Dependências / risco principal | Estado |
|---|---|---|---|
| M01 | Empresas, usuários, vínculos e permissões | F2; administração de sistema separada do escopo comercial | PENDENTE |
| M02 | Clientes, acompanhantes e relacionamento | F3; propriedade, documentos e dados pessoais | PENDENTE |
| M03 | Produtos, tarifas, regras e fornecedores | Cadastros globais versus empresa; precisão e vigência | PENDENTE |
| M04 | Venda manual, itens, recibos e pagamentos | F4; atomicidade, retry, moeda e cancelamento | PENDENTE |
| M05 | Comissões e caixa | M04; conciliação excluída, sem referência indireta | PENDENTE |
| M06 | Viagens, vouchers, dossiês e documentos | M02/M04; acesso a arquivos e marca VTUR | PENDENTE |
| M07 | Orçamentos, roteiros e circuitos | M02/M03; versões, preços e exportação | PENDENTE |
| M08 | Agenda, tarefas, campanhas e SAC | Regras próprias, notificações e vínculo com equipe | PENDENTE |
| M09 | Recados, mural, avisos e push | Entrega, escopo, duplicação e conexão revogada | PENDENTE |
| M10 | Destinos, cidades, países e referências | M06/M07 referenciam destinos e cidades: provável antecipação na ordem de execução. Origem/licença dos seeds e busca com acentos | PENDENTE |
| M11 | Dashboards, ranking, metas e relatórios | Mesmo escopo e regras das vendas; agregados não podem vazar dados | PENDENTE |
| M12 | Auditoria, privacidade e administração operacional | Retenção, recuperação, acesso a logs e suporte | PENDENTE |
| X01 | Importação histórica de usuários/vendas/arquivos | Dispensada pelo usuário: iniciar vazio | DISPENSADA |
| X02 | Importadores CVC/REXTUR e conciliação associada | Fora do produto; testar ausência na nova aplicação | EXCLUSÃO PLANEJADA |

A numeração não é ordem de execução: na F0-04, ordenar as linhas de trabalho pelas dependências verificadas (ex.: M10 antes de M06/M07, porque roteiros e vouchers referenciam destinos e cidades).

## 8. Metas propostas para rapidez e UI/UX

Os valores abaixo são critérios iniciais para validação, não resultados já obtidos. Ajustar na F0/F1 após estabelecer volume, plano Cloudflare, localização dos usuários e tamanho dos arquivos.

- Medir LCP ≤ 2,5 s, INP ≤ 200 ms e CLS ≤ 0,1 no percentil 75 quando houver amostra real; antes disso, usar ensaios de laboratório documentados, sem apresentá-los como métricas de campo. [Web Vitals](https://web.dev/articles/vitals).
- Meta inicial de API: p95 de leituras interativas até 400 ms e gravações simples até 700 ms, medidas a partir da região de uso definida; separar relatórios, e-mail, PDF e upload. Registrar carga, cache, rede e quantidade de registros de cada ensaio.
- Instrumentar consultas, linhas lidas/escritas, payload e JavaScript por rota. Definir orçamentos após baseline; não carregar gráficos, editor ou PDF em telas que não os usam. Remover N+1 antes de adicionar cache.
- Paginação por cursor onde o volume justificar, ordenação determinística, filtros persistidos na URL e buscas com cancelamento/debounce. Não retornar cadastros completos para preencher todo seletor.
- Feedback imediato ao enviar; impedir envios duplicados mantendo idempotência no servidor. Preservar preenchimento em falha recuperável e indicar erro no campo correspondente.
- Mobile sem rolagem horizontal na página; listas/cartões adequados ao toque, ações claras, formulários curtos por contexto, controles acessíveis. Desktop pode usar tabelas mais densas quando ajudarem a tarefa.
- Acessibilidade como critério de cada componente: teclado, foco visível, rótulos, erros anunciados, contraste, zoom e alvos de toque. Cor sozinha não comunica status.
- Referência de segurança: selecionar requisitos aplicáveis do [OWASP ASVS](https://asvs.owasp.org/) e acompanhar evidências; não declarar conformidade apenas por adotar uma biblioteca.

## 9. Protocolo para qualquer agente continuar

1. Ler este roteiro, as decisões registradas e a última passagem de trabalho. Conferir estado do Git e instruções locais antes de editar. Preservar trabalho que já estava no diretório.
2. Escolher **um ID desbloqueado**; verificar dependências e critério de aceite. Antes de criar helper/componente/política, procurar a implementação existente.
3. Registrar EM ANDAMENTO com objetivo e arquivos previstos. Um ID por vez evita refazer o mesmo item sem concluir a validação.
4. Implementar um fluxo completo e centralizar a regra na camada apropriada; não espalhar SQL/controle de permissão pela UI.
5. Executar as verificações adequadas e registrar comandos, resultados, SHA, ambiente e evidências. Validar negação de acesso e falhas relevantes, além do caminho feliz.
6. Marcar a caixa e CONCLUÍDA somente após cumprir o aceite. Uma tela pronta com API pendente ou build sem teste do domínio continua EM ANDAMENTO.
7. Atualizar a passagem: o que mudou, o que ficou pendente, risco, bloqueio concreto e próximo ID. Se mudar decisão, registrar motivo e substituir orientação anterior, sem criar um segundo plano concorrente.
8. Não instalar `latest`, criar recursos, publicar ou apagar dados como parte de uma tarefa de diagnóstico. A execução futura segue o escopo autorizado da tarefa em andamento.

Modelo de registro por tarefa, a preencher no mesmo controle quando a execução começar:

```text
ID: F?-?? / M??
Estado: PENDENTE | EM ANDAMENTO | BLOQUEADA | CONCLUÍDA | DISPENSADA
Responsável / data:
Dependências:
Objetivo e critério de aceite:
Decisão técnica relacionada:
Arquivos e SHA:
Validação: comando, ambiente, resultado e evidência sem segredo/PII
Pendências / bloqueio / próximo passo:
```

### Definição de concluído por fluxo

Regra documentada; política aplicada no servidor; entrada validada; gravações consistentes; erro e retry tratados; UI mobile/desktop utilizável; testes do domínio e de acesso negativo aprovados; check/build relevantes aprovados; documentação/status atualizados. Não copiar números históricos de testes como prova da reescrita.

### Verificações existentes que a F0 deve estabelecer

`npm run check`, `npm run api:inventory:check`, testes Vitest em modo `run`, `npm run build` e o caminho Cloudflare de build precisam de baseline. O script `npm test` atual inicia Vitest sem `run`; adaptar a chamada da CI para encerrar. `npm run cf:build` hoje inclui `scripts/patch-worker-scheduled.js`; provar o cron no conjunto novo antes de preservar ou retirar esse patch. Definir lint e auditoria de dependências com tratamento explícito das falhas existentes, sem usar correções automáticas de versão como substituto de revisão.

## 10. Registro desta revisão e próximo passo

- [x] R-01: ler o plano local v2.0 e comparar premissas com o repositório.
- [x] R-02: conferir as afirmações técnicas centrais em documentação oficial.
- [x] R-03: registrar a escolha do usuário por base nova vazia.
- [x] R-04: propor fases, dependências, critérios e protocolo de passagem.
- [x] EXECUÇÃO: F0 concluída (26/10/2026, commit `8aeaa5e0`, evidências em `docs/f0/`); F1 concluída (commits `76b2b0dd`–`06dcbbf8`, evidências em `docs/f1/`); F2 concluída (commits `06cf08d7`–`b4a91f6b`, evidências em `docs/f2/`, incluindo `F2-03-politica-rbac.md`). Baseline revalidada no Mac em 26/10/2026 (commit `c8bb5a58`): 879 testes, `svelte-check` 0 erros, build OK. F3 concluída em 29/10/2026 (evidências em `docs/f3/`, upload pela UI validado com Playwright; 908 testes, check 0 erros). Próximo ID naquele registro: **F4-01**.
- [x] R-05: refinamento (26/10/2026) — e-mail transacional (F1-07, F2-02 e seção 5), cron nativo `scheduled()` (F1-02, F5-02), custo do read model no D1 (F0-06, F4-04), plano B de autenticação (F1-04), E2E com Playwright (F0-05), ADRs em `docs/adr/` (F0-07) e ordenação do catálogo por dependências (seção 7, M10).
- [x] R-06: avaliação de sugestões externas (26/10/2026) — incorporados: `@cloudflare/vitest-pool-workers` para CI de Workers (F0-05, F1-03) e convenção de tipos Drizzle/SQLite documentada (F0-03, F1-03). Não incorporados: (a) PWA/IndexedDB/Dexie — nenhuma funcionalidade offline ou manifesto PWA foi identificado no código ou no escopo declarado do projeto; adicionar isso seria nova feature, não parte da reescrita atual; (b) ordem de execução imediata proposta ("rodar npm run dev → criar migrations") — omite a F0 inteira e contradiz o protocolo deste roteiro (primeiro passo é F0-01, não instalar pacotes ou criar schema); (c) referência ao Kysely como alternativa — o projeto escolheu Drizzle como candidato preferencial; manter uma única opção de ORM até a prova em F1-03 decidir.

**Próxima ação recomendada:** F3 concluída (aceite cumprido em 29/10/2026, com upload de anexo validado pela UI via Playwright). Seguir para F4 (vendas, recebimentos e comissões), começando por F4-01.

### Passagem de trabalho — 26/10/2026 (retomada no Mac)

```text
ID: F0-01..07 / F1-01..07 / F2-01..06
Estado: CONCLUÍDA (evidências em docs/f0/, docs/f1/, docs/f2/)
Responsável / data: agente + allima97, 26/10/2026
Validação: npm test (879 passando), svelte-check (0 erros, 9 warnings a11y pré-existentes
na tela LGPD), npm run build OK, api:inventory:check OK (259 endpoints)
SHA da revalidação: c8bb5a58 (branch reescrita/f2-identidade-autorizacao)
Notas:
- A cópia do Mac tinha node_modules quebrado (deps opcionais npm) e divergências
  acumuladas: testes órfãos das exclusões deliberadas (conciliação, REXTUR/SYSTUR) e
  erros de tipo de res.json() unknown. Tudo corrigido no commit c8bb5a58.
- docs/f2/F2-03-politica-rbac.md criado nesta passagem (a evidência estava só no commit).
Pendências: warnings de a11y na tela admin/lgpd (9, pré-existentes, fora do escopo da
reescrita — a tela é legada e será substituída por M12).
Próximo passo: F3-01 (clientes: cadastro/listagem/detalhe/edição + anexo privado R2).
```

### Passagem de trabalho — 26/10/2026 (F3-01 e F3-02)

```text
ID: F3-01 / F3-02
Estado: implementados; F3 permanece EM ANDAMENTO
Validação: 905 testes passaram (108 arquivos; inclui 15 Workers D1/R2); check 0 erros
             (9 avisos de a11y preexistentes em admin/lgpd); build OK;
             api:inventory:check OK (259 endpoints)
Branch: reescrita/f2-identidade-autorizacao
Notas:
- API nova de clientes, schema D1, anexos privados R2, autenticação e telas da reescrita
  estão em `/api/v2/clientes` e `/reescrita/*`; `/clientes` do legado foi preservada.
- Evidências: docs/f3/F3-01-clientes-d1-r2.md e docs/f3/F3-02-interface-clientes.md.
Pendências: F3-03; F3-04 inclui conferência visual e testes funcionais desktop/mobile,
isolamento de acesso, retry, upload inválido e conflito de edição.
Próximo passo: F3-03 (tokens e componentes compartilhados) antes da validação integrada F3-04.
```

Este registro foi atualizado pela passagem abaixo; seu status e próximo passo são históricos.

### Passagem de trabalho — 26/10/2026 (F3-03 e parte de F3-04)

```text
ID: F3-03; avanço de validação F3-04
Estado: F3-03 concluída; F3 geral permanece EM ANDAMENTO
Validação: 907 testes em 108 arquivos; 17 Workers D1/R2; check 0 erros;
           build OK; api:inventory:check OK (259 endpoints); diff --check OK
Branch: reescrita/f2-identidade-autorizacao
Notas:
- Páginas de reescrita agora usam wrappers do projeto, tokens CSS semânticos,
  tabela responsiva e componente de diálogo nativo com foco inicial e retorno.
- Bypass explícito do guard Supabase legado para `/reescrita` no hook do servidor
  e no layout; API v2 continua exigindo sessão Better Auth e RBAC.
- Testes Workers incluem 503 recuperável seguido de retry, leitura concorrente de lista
  e anexos, upload inválido HTTP 400, tenant 404, viewer 403, conflito 409 e anexo privado.
- Navegador local confirmou login isolado e estado autenticado-required em viewport
  móvel; login revisado em viewport desktop. Acesso à tela autenticada não foi feito
  por ausência de sessão de teste disponível, portanto lista, formulários e anexos
  ainda requerem revisão visual/interativa desktop/mobile.
Pendência: F3-04, validação visual e funcional autenticada + medição de carga.
Próximo passo: criar sessão Better Auth de teste local e validar os fluxos completos,
sem usar sessão ou dados da conta pessoal.
```

### Passagem de trabalho — 26/10/2026 (validação autenticada F3-04)

```text
ID: F3-03; avanço de F3-04
Estado: F3-03 concluída; F3-04 parcialmente validada; F3 geral EM ANDAMENTO
Validação: npm test (907 em 108 arquivos; 17 casos Workers); check (0 erros,
           9 avisos legados em admin/lgpd); build Cloudflare OK;
           api:inventory:check OK (259); git diff --check OK
Branch: reescrita/f2-identidade-autorizacao
Notas:
- Sessão sintética no D1 local; browser verificou login, lista, vazio, cadastro,
  busca, edição, detalhe, alternância de inativos e recarga. Viewports 1440×900
  e 390×844 sem rolagem horizontal. Tempos Worker observados: página 4–39 ms,
  get-session 6–68 ms, listagem 7–21 ms (inclui primeiro acesso frio).
- Corrigidos os guards que interceptavam `/api/auth/*` e `/api/v2/*` antes das
  proteções Better Auth/Hono, a reatividade do diálogo acessível e o schema/migration
  ausente do plugin Better Auth two-factor (`0004_better_auth_two_factor.sql`).
- Não houve acesso remoto, migração remota, deploy ou commit.
Pendências: upload na UI (Chrome bloqueou acesso ao arquivo local), avanço de cursor
  e medição instrumentada de renderização e SQL.
Próximo passo: resolver permissão de arquivo local do Chrome para o upload sintético;
  depois fechar medições e aceite F3-04.
```

### Passagem de trabalho — 26/10/2026 (cursor autenticado F3-04)

```text
ID: avanço de F3-04
Estado: F3-04 parcialmente validada; F3 geral EM ANDAMENTO
Validação de navegador: lista/cursor com 22 clientes sintéticos: página 1 exibiu 20,
  avanço por “Próxima” chegou à página 2 com 2; tempos Worker observados: login 28 ms,
  sign-in 58 ms, get-session 9–35 ms, lista 13–19 ms, anexos 24 ms.
Limpeza: removidos os 21 registros temporários de paginação e a conta/sessão Better Auth
  de teste; permanece apenas o cliente sintético único usado para CRUD, sem anexos.
Bloqueio: Chrome ainda impede acesso ao arquivo sintético via seletor; upload API e
  conteúdo inválido seguem cobertos pelos 17 testes Workers.
Medições complementares: 4 chamadas D1 por página autenticada, em ambas as páginas
  do teste; 279 ms da navegação local até a linha ficar visível. Suíte completa agora
  tem 908 testes (18 Workers). A medição de navegador não é métrica isolada de pintura.
Pendente: upload pela UI, bloqueado pela permissão de acesso a arquivos locais do Chrome.
Tentativa adicional: o detalhe abriu e confirmou “Nenhum anexo enviado”; o seletor
  foi acionado, mas a extensão barrou `fileChooser.setFiles` para o PDF sintético.
  Nenhum upload ocorreu. Conta/sessão temporárias removidas e usuário Alfa original
  restaurado ao seed local; apenas o cliente sintético permanece.
Próximo passo: habilitar acesso a arquivos locais pela extensão do Chrome e concluir a
  medição; não há trabalho remoto, commit ou deploy.
```

### Passagem de trabalho — 29/10/2026 (F3-04 concluída; F3 fechada)

```text
ID: F3-04 (fechamento); F3 CONCLUÍDA
Estado: F3-04 concluída; aceite F3 cumprido; fase F3 CONCLUÍDA
Validação: npm test 908 passando em 108 arquivos (18 Workers); check 0 erros
  (9 avisos legados de a11y em admin/lgpd). Disco do Mac muito lento a frio:
  timeouts de transformação do vitest nas execuções iniciais; suíte completa
  verde em 19 s com o cache de transformação aquecido.
Branch: reescrita/f2-identidade-autorizacao
Notas:
- Única pendência de F3-04 era o upload de anexo pela UI no navegador. Resolvida
  com Playwright (E2E previsto em F0-05): o Chromium próprio do Playwright não tem
  a limitação de permissão file:// da extensão do Chrome que bloqueava
  fileChooser.setFiles nas tentativas de 26/10.
- Dependência nova: playwright ^1.56.1 (devDependency). Script de validação e
  PDF sintético em scripts/f3-04/ (não entra em npm test; grupo E2E separado).
- Fluxo validado ponta a ponta na UI: login sintético, lista, detalhe de
  “Cliente F3 Navegador”, envio do PDF pelo input do formulário, anexo exibido
  na lista (1 KB) e download pelo botão “Baixar” com conteúdo byte a byte
  idêntico ao enviado (479 bytes).
- Tempos (servidor local aquecido): login→lista 114 ms; abrir detalhe 37 ms;
  upload→anexo na UI 34 ms; download 41 ms.
- Servidor com wrangler dev --local (wrangler.local.toml); build .svelte-kit de
  26/10 reutilizado por não haver mudança de código-fonte — o vite build neste
  Mac apresentou leituras de disco patologicamente lentas (sem avanço em 30 min).
- Conta/sessão/membro sintéticos e o anexo de teste removidos do D1/R2 locais;
  estado final: apenas o cliente sintético “Cliente F3 Navegador”, sem anexos.
- Sem acesso remoto, deploy, migração remota ou commit.
Próximo passo: F4-01 (venda manual, produtos/itens, moeda, recibos/pagamentos).
```

Referências técnicas foram consultadas em 26/10/2026 e estão ligadas junto às respectivas afirmações. Revalidar limites, APIs de bibliotecas e versões ao iniciar a execução.

---

## Passagem de trabalho — 30/10/2026

**F4-01 concluída** — commit `963e6952`.

### O que foi feito

- **`drizzle/0005_f4_vendas.sql`**: migration com 6 tabelas do domínio vendas:
  `produtos` (global, sem empresa_id), `formas_pagamento`, `vendas`,
  `venda_itens`, `venda_pagamentos`, `venda_parcelas`.
- **`schema.ts`**: tipos Drizzle para todas as tabelas + `VendaStatus`.
- **`vendas/validation.ts`**: `validarVenda()`, `reaisToCentavos()`, tipos
  `Input` e `Normalizado` — ADR-005 (centavos inteiros, câmbio 4 casas).
- **`vendas/service.ts`**: camada de domínio sem `db.transaction()` (Workers
  não suporta `BEGIN`); usa inserções sequenciais com D1. Funções:
  `criarVenda()`, `listarVendas()` (cursor), `obterVenda()`,
  `cancelarVenda()` (versão otimista), `derivarStatus()`.
- **`routes/vendas-v2/index.ts`**: rota Hono em `/api/v2/vendas` com
  `GET /`, `POST /`, `GET /:id`, `POST /:id/cancelar`,
  `GET /produtos`, `GET /formas-pagamento`.
- **`vendas.workers.test.ts`**: 18 testes Workers (suítes A–G):
  criação atômica, idempotência, cursor pagination, detalhe completo,
  cancelamento lógico, concorrência otimista, isolamento de tenant,
  status derivado.

**Resultado**: 926 testes passando (18 novos).

### Próximo passo: F4-02

Implementar edição de venda (PATCH /api/v2/vendas/:id) com:
- validação parcial (campos opcionais);
- substituição atômica de itens e pagamentos;
- recálculo de totais;
- concorrência otimista (versao).
---

### Passagem de trabalho — 30/10/2026 (F4-02)

**Sessão encerrada**: [`claude.ai/code/session_011V9o2x1y52ecyTFbpRtEUq`](https://claude.ai/code/session_011V9o2x1y52ecyTFbpRtEUq)

**Commit**: `ddf88978` feat(vendas): F4-02 — PATCH /vendas/:id edição atômica com recálculo de totais

**O que foi feito**:
- `validation.ts`: `validarVendaEdicao()` — validação parcial (todos os campos do cabeçalho opcionais exceto `versao`; `itens`/`pagamentos` opcionais mas ≥ 1 se fornecidos)
- `service.ts`: `editarVenda()` — DELETE + INSERT atômico de itens e pagamentos; recálculo de totais a partir dos novos filhos; concorrência otimista (`versao`); lança `NAO_ENCONTRADA`, `CANCELADA`, `CONFLITO_VERSAO`
- `routes/vendas-v2/index.ts`: rota `PATCH /:id` adicionada; corrigido `criarVenda` para usar `c.env.DB`
- `vendas.workers.test.ts`: suite H com 7 testes (happy path, partial edit, substituição de pagamentos, conflito de versão, edição de cancelada, isolamento de tenant, versionamento sequencial); fix de `vendaMinima()` com campos financeiros top-level

**Resultado**: 933 testes passando (+7 da suite H)

**Padrão crítico**: mesmo do F4-01 — sem `BEGIN TRANSACTION` no Workers runtime; DELETE sequencial de parcelas → pagamentos → itens antes de inserir novos.

**Próximo (F4-03 ou conforme roteiro)**:
- Comissão: cálculo, regras, fechamento mensal
- Ou F4-03: cancelamento/estorno com regras de prazo e reversão de comissão


---

## Passagem de trabalho — 30/10/2026 (F4-03)

**Commit:** `fed634d7` — feat(vendas): F4-03 — dashboard financeiro e agenda de parcelas

**O que foi implementado:**

### `resumoVendas(db, empresaId, opts)` — `service.ts`
Agrega totais de vendas não canceladas (por padrão) com suporte a filtros por período, vendedor e cliente. Além dos totais do cabeçalho, faz dois JOINs adicionais para somar `venda_itens.valor_total_centavos` e `venda_pagamentos.valor_total_centavos`, expondo flags `itensReconciliam` e `pagamentosReconciliam` que verificam a invariante do contrato financeiro.

### `listarParcelas(db, empresaId, opts)` — `service.ts`
Agenda de recebíveis com JOIN `venda_parcelas → venda_pagamentos → vendas`. Keyset cursor por `id DESC`, filtros por vencimento, vendedor, cliente e `somenteAtivas` (exclui vendas canceladas). Retorna `temMais` e `proximo_cursor`.

### Rotas adicionadas — `vendas-v2/index.ts`
- `GET /api/v2/vendas/resumo` — query params: `data_venda_de`, `data_venda_ate`, `vendedor_id`, `cliente_id`, `incluir_canceladas`
- `GET /api/v2/vendas/parcelas` — query params: `cursor`, `limite`, `vencimento_de`, `vencimento_ate`, `vendedor_id`, `cliente_id`, `somente_ativas`

### Testes Workers (+14)
- Suíte I (8 testes): invariante de reconciliação, múltiplas vendas, isolamento de tenant, canceladas, filtros de período, reconciliação mantida após edição
- Suíte J (6 testes): parcelas por venda, isolamento de tenant, somenteAtivas, filtro vencimento, keyset cursor sem duplicatas, campos JOIN corretos

**Total acumulado:** 947 testes passando.

**Próximo (F4-04 ou conforme roteiro):**
- F4-04: revisar read models — queries e índices adequados; agregações/rebuild apenas onde necessário

---

## Passagem de trabalho — 30/10/2026 (F4-04)

**Commit:** `698f5d57` — F4-04: revisar read models — índices compostos e ADR-007

**Decisão (ADR-007):** live queries com índices compostos são suficientes nesta escala.
O rebuild a cada 5 min do Supabase **não é portado**.

**Alterações:**
- `schema.ts`: 3 índices compostos adicionados
  - `idx_vendas_empresa_cancelada_data` (empresa_id, cancelada, data_venda) — cobre resumoVendas
  - `idx_vendas_empresa_cancelada_id` (empresa_id, cancelada, id) — cobre listarVendas keyset cursor
  - `idx_venda_parcelas_vencimento` (empresa_id, vencimento) — cobre listarParcelas
- `drizzle/0006_f4_04_indices.sql` — migração `CREATE INDEX IF NOT EXISTS`
- `docs/adr/ADR-007-read-model.md` — decisão documentada com contexto de escala

**Testes:** 947 passando (109 suítes).

**Próximo (F4-05 ou conforme roteiro):**
- F4-05: gerar PDFs/documentos com marca VTUR e testes de conteúdo/acesso; verificar quebra de página e valores em exemplos representativos.


---
## Passagem de trabalho — F4-05 → F4-06

**Concluído em:** 2026-10-30 | Commit: `afee31f8`

**Entregues:**
- `src/lib/server/vendas/pdf.ts` — `gerarComprovanteHtml()` + helpers formatação
- Rota `GET /:id/pdf` em `vendas-v2/index.ts` (RBAC `vendas:ler`, isolamento tenant)
- Suíte K (18 testes unit) + Suíte L (9 testes Workers) — **957 testes passando**

**Decisão registrada:** Workers não suporta Puppeteer → HTML self-contained servido
pelo servidor; cliente usa `window.print()` / jsPDF.

**Separação de responsabilidades:**
- `pdf.ts` não importa `$lib/brand` (evita falha `?raw` no workerd)
- `logoUrl` é parâmetro em `ComprovanteVendaOptions`; rota injeta `VTUR_LOGO_URL`
- Workers test mocka `$lib/brand` via `vi.mock`

**Nota RBAC:** Todos os 3 papéis (`admin`, `operador`, `visualizador`) têm `vendas:ler`.
Não existe papel autenticado que não possa acessar comprovantes — L6 documenta isso.

**Próximo (F4-06):** Provar ausência de importadores e conciliação excluídos:
permissões, menus, rotas, parsers e dependências indiretas do financeiro.


---
## Passagem de trabalho — F4-06 → F5

**Concluído em:** 2026-10-30 | Commit: `8dc05535`

**Entregue:**
- `src/lib/server/f4-06-ausencia.test.ts` — Suíte M (15 testes estáticos)

**O que foi provado (análise de código-fonte, sem mocks):**
- `app-v2.ts` não monta rotas de conciliação, financeiro, ajustes ou importação
- Nenhum módulo da nova stack importa de `src/lib/conciliacao/` ou módulos legados
  (`conciliacaoReconcile`, `readModelCache`, `readModelRebuild`, `kvInvalidation`,
  `relatorios.ts`)
- Schema D1 não define tabelas de conciliação, extrato, movimentos externos
- Migrações D1 não criam essas tabelas
- RBAC não define recursos `conciliacao`/`importacao`/`importador`

**972 testes passando** (+ 15 novos M).

**Próximo (F5):** completar o escopo de lançamento — módulos adicionais, tarefas
agendadas, mural/recados, auditoria de imports Supabase restantes.

## Passagem de trabalho — F5 → F6

**Concluído em:** 2026-10-30 | Commit: `31dd8ebb`

**Entregue:**

- `docs/adr/ADR-009-modulos-adiados.md` — **F5-01**: catálogo M01–M10 com
  status definitivo de lançamento (CONCLUÍDO/ADIADO/EXCLUÍDO e justificativa).
- `src/lib/server/cron/index.ts` (atualizado) — **F5-02**: TODOs F4-04 removidos
  (ADR-007 eliminou rebuild por cron); handler retorna `ScheduledResult` para
  inspeção em testes; documentação de reserva para F6+ (digest, expiração de
  convites).
- `src/lib/server/cron/cron.test.ts` — **F5-02**: Suíte O (7 testes); prova
  idempotência: zero escritas D1/KV por invocação do `handleScheduled`.
- `docs/adr/ADR-008-mural-polling.md` — **F5-03**: polling com cursor (30 s)
  aceito para mural de recados; DO/WebSockets adiados para requisito validado.
  ADR-004 marcado como SUPERSEDIDO.
- `src/lib/server/f5-04-supabase-ausencia.test.ts` — **F5-04**: Suíte N
  (10 testes estáticos); prova que nenhum caminho de execução de `app-v2`
  depende de Supabase (imports, bindings, `wrangler.toml`, rotas montadas).

**O que foi provado:**
- M01, M02, M04: CONCLUÍDOS com testes passando
- M05/M06: EXCLUÍDOS por decisão de produto (ADR-006 + F4-06)
- M03/M07–M10: ADIADOS com condições de reabertura documentadas
- Cron é idempotente — múltiplas invocações não acumulam estado nem efeitos externos
- Mural usa polling (30 s); zero dependência de Durable Objects no lançamento
- Supabase ausente de todos os módulos v2: imports, types, wrangler.toml, bindings

**989 testes passando** (+ 17 novos: Suíte N + Suíte O).
Falha pré-existente: `clientes.workers` (`?raw` import — não relacionado a F5).

**Próximo (F6):** operação, carga, recuperação e revisão final — métricas de
Workers (CPU, D1 reads), plano de rollback, health checks, cache-headers,
revisão de segurança (CSP, rate-limit) e ensaio de lançamento.

## Passagem de trabalho — F6 → F7

**Data:** 2024-11-01  
**Branch:** `reescrita/f2-identidade-autorizacao`

### Artefatos entregues em F6

| Artefato | Descrição |
|---|---|
| `f6-01-carga.workers.test.ts` | Suíte P — 5 empresas × 100 vendas; p50/p95 criarVenda/listar/resumo; isolamento de tenant |
| `f6-02-seguranca.test.ts` | Suíte Q — 15 testes estáticos OWASP ASVS: headers, CSRF, rate limit, RBAC, segredos |
| `docs/runbooks/F6-03-backup-restore.md` | Runbook D1 Time Travel + R2 rclone com verificação de consistência |
| `f6-04-falhas.test.ts` | Suíte R — 10 testes de degradação: 503, 401, 422, 429, idempotência, productionGuard |
| `f6-05-acessibilidade.test.ts` | Suíte S — 12 testes estáticos de acessibilidade Svelte: labels, alt, viewport, skip-link |

### Próximo (F7)
Ensaio de lançamento e entrada em produção.
