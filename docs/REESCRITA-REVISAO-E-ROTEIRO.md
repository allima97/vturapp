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
| F0 | Inventário, regras, baseline e validação contínua | Nenhuma | PENDENTE; esta revisão é insumo parcial |
| F1 | Prova de stack em ambiente isolado | F0 | PENDENTE |
| F2 | Identidade, permissões e fundação de dados | F1 | PENDENTE |
| F3 | Primeiro fluxo completo e base visual | F2 | PENDENTE |
| F4 | Núcleo de vendas e financeiro | F3 | PENDENTE |
| F5 | Demais módulos e tarefas | F4 para dependências comerciais | PENDENTE |
| F6 | Operação, carga, recuperação e revisão final | F3–F5 | PENDENTE; medições começam antes |
| F7 | Ensaio de lançamento e entrada em produção | F6 | PENDENTE |
| F8 | Estabilização e retirada das dependências antigas | F7 | PENDENTE |

### F0 — entender e estabelecer a referência

- [ ] F0-01: registrar branch, SHA, alterações existentes, versões resolvidas e baseline de check/testes/build; manter falhas preexistentes identificadas e com destino, sem declará-las resolvidas.
- [ ] F0-02: reconciliar inventário por **rota + método**, incluindo aliases, endpoints SvelteKit fora do Hono, auth, uploads, exports, debug, webhooks, crons e chamadas diretas ao Supabase no cliente.
- [ ] F0-03: catalogar entidades, schema disponível e RPCs referenciadas. Se faltar informação, obter apenas o schema necessário com acesso de leitura; não exportar dados pessoais para documentação. Ao mapear entidades para o Drizzle, registrar a convenção de tipos para o SQLite: booleanos → INTEGER (0/1), datas sem hora → TEXT ISO 8601, timestamps → TEXT ISO 8601 UTC, UUIDs → TEXT, valores monetários → INTEGER (centavos). O SQLite usa tipagem por afinidade e não por declaração rígida; os tipos TypeScript gerados pelo Drizzle devem expressar essas convenções explicitamente para evitar inconsistências silenciosas em runtime — especialmente após a migração do PostgreSQL, onde booleano e timestamp têm tipos nativos distintos.
- [ ] F0-04: montar mapa de regras e papéis com exemplos. Para cada função existente: manter, redesenhar ou excluir; remoções de conciliação/importadores entram como exclusão deliberada.
- [ ] F0-05: preparar CI em modo de execução única: tipos, testes, inventário e build. Acrescentar testes D1/Worker e E2E à medida que os fluxos existirem; não depender de mocks Supabase para provar a camada nova. E2E com Playwright sobre 3–5 fluxos críticos (login, criação de venda, acesso negado); a correção do `npm test` para modo `run` está registrada na seção 9. Para testes que acessam D1/KV/R2, usar `@cloudflare/vitest-pool-workers` — integração oficial que roda sobre o Miniflare e simula o runtime Workers com fidelidade (o uso programático direto do Miniflare é desaconselhado; o pacote segue como motor do `wrangler dev`). O projeto usa `vitest.workspace.ts` com grupos `unit`/`dom`: o pool de Workers entra como terceiro grupo, sem migrar a suíte existente. Conferir a faixa de peer dependency do Vitest antes de instalar (projeto em Vitest 2.1.9).
- [ ] F0-06: definir cenários de UX/performance e dados sintéticos; registrar requisitos de custo, volume, simultaneidade, disponibilidade e recuperação ainda desconhecidos. Estimar linhas lidas/escritas por rebuild do read model e o custo mensal projetado no D1 (cobrança por linha lida/escrita, limites diários no Free) antes de decidir onde as agregações vivem: consulta direta, tabela pré-agregada por escrita ou cron noturno.
- [ ] F0-07: registrar decisões pendentes de login, papéis, UI e escopo mínimo do lançamento. Registrar que importação histórica está DISPENSADA por decisão do usuário. Criar `docs/adr/` com um arquivo por decisão (stack, autenticação, UI, tempo real, dinheiro/datas); decisão nova ou revertida vira arquivo novo, nunca edição retroativa.

**Aceite:** catálogo rastreável, exclusões explícitas, baseline reproduzível, nenhum dado antigo alterado. Primeiro passo da execução é F0-01, não instalar pacotes.

### F1 — provar a combinação de ferramentas

- [ ] F1-01: criar linha de trabalho isolada e ambientes local/staging/produção com bindings, secrets, buckets e bancos distintos; registrar recursos sem credenciais.
- [ ] F1-02: testar conjunto estável de SvelteKit/Svelte/Vite/adapter/Hono/Wrangler e runtime. Validar SSR, assets, cookies, variáveis, ponte Hono e cron; guardar versões exatas e motivos em decisão técnica. Cron pelo handler `scheduled()` nativo do Worker, sem endpoint HTTP público nem segredo em header: `scripts/patch-worker-scheduled.js` e a rota `/api/v1/read-model/rebuild` não têm equivalente na aplicação nova.
- [ ] F1-03: testar Drizzle + D1: criar banco vazio, aplicar migrations, inserir, consultar, editar condicionalmente, falhar e reverter um lote; validar constraints no runtime Cloudflare. Verificar que os tipos TypeScript do schema Drizzle expressam as convenções de tipo SQLite registradas na F0-03; confirmar inserção e leitura correta de booleanos, datas, UUIDs e valores monetários entre o modelo de domínio e o armazenamento D1 — inconsistência aqui propaga erros silenciosos para toda a camada de negócio.
- [ ] F1-04: testar Better Auth em D1/Workers com sessão revogável, MFA/passkey e e-mail de teste. Validar dependências e adapters da versão escolhida, sem copiar imports antigos do plano. Plano B registrado desde já: se a prova falhar, implementar sessão própria sobre Drizzle (cookie HttpOnly com token gravado com hash no banco, expiração e revogação na aplicação — o modelo que a documentação do Lucia passou a ensinar como guia); o escopo de auth do VTUR (e-mail/senha, TOTP, passkeys, convites) é moderado e viável sem biblioteca.
- [ ] F1-05: testar upload/download privado R2 com acesso negado para outra empresa e estratégia de falha/limpeza.
- [ ] F1-06: comparar um formulário/modal representativo na base visual atual e na candidata. Registrar escolha e plano de substituição dos wrappers legados.
- [ ] F1-07: provar envio de e-mail transacional no runtime por API HTTP (Resend ou equivalente). SMTP cru não é viável em Workers no fluxo normal, e o sistema atual aceita SMTP por empresa (`src/lib/server/emailSettings.ts`): decidir se a configuração por empresa passa a aceitar só provedores HTTP ou se o modelo de configuração muda.

**Aceite:** prova end-to-end em staging com recursos novos, evidências de falha e sucesso; stack escolhida por compatibilidade demonstrada. Se uma biblioteca não atender, trocar só a candidata e repetir os critérios, sem iniciar dois caminhos de implementação.

### F2 — identidade, autorização e estrutura de dados

- [ ] F2-01: definir schema inicial por domínio, constraints, índices e dono único de migrations; criar seeds de referência permitidos e fixtures sintéticas.
- [ ] F2-02: implementar conta, convite, verificação, recuperação, logout, revogação e gestão de sessões conforme seção 5. Bootstrap sem acesso público residual. E-mails de conta (verificação, recuperação, convite) são da plataforma, não da empresa: definir remetente e provedor próprios, separados das configurações de e-mail por empresa.
- [ ] F2-03: implementar políticas centralizadas e contexto de acesso; incluir matriz de capacidades e escopos reais do VTUR, sem hierarquia inventada.
- [ ] F2-04: provar isolamento entre empresas, equipes e uso individual em leitura, gravação e agregação; provar bloqueio imediato na próxima requisição após revogação, ressalvadas operações já iniciadas.
- [ ] F2-05: validação de entrada, erros consistentes, CSRF/origem, CSP compatível com o framework, headers, auditoria e limitador de abuso com política de falhas.
- [ ] F2-06: proibir endpoints de debug em produção por teste do roteamento final, incluindo caminhos alternativos; revisão de segredos, dependências e logs.

**Aceite:** duas empresas e papéis sintéticos demonstram acessos permitidos e negados por API e navegador; alterar IDs/empresa não contorna a política. Autenticação no banco novo funciona sem Supabase.

### F3 — primeiro fluxo completo e experiência compartilhada

- [ ] F3-01: implementar cadastro/listagem/detalhe/edição de cliente e um anexo privado usando as fundações de F2; preparar o cliente para ser referenciado por venda manual.
- [ ] F3-02: tela com busca, filtros, paginação estável, estados vazio/carregando/erro e validação de campo; modais com foco, teclado, fechamento e retorno de foco corretos.
- [ ] F3-03: consolidar tokens visuais e componentes realmente repetidos: botão, campo monetário/data, formulário, modal, lista/tabela responsiva, estados e confirmação. Evitar componente universal cheio de exceções.
- [ ] F3-04: testar criação e edição no mobile e desktop, acesso negado a outro cliente, retry, upload inválido e conflito de edição; medir consultas e carga da tela.

**Aceite:** fluxo completo utilizável com dados sintéticos no D1/R2, sem travamento de modal ou rolagem horizontal. Esse fluxo vira referência de implementação para os demais.

### F4 — vendas, recebimentos e comissões

- [ ] F4-01: documentar e implementar venda manual, produtos/itens, moeda, recibos/pagamentos e estados necessários; transação e idempotência para as gravações compostas.
- [ ] F4-02: implementar alteração, cancelamento/estorno e comissão com exemplos de cálculo, arredondamento e datas; preservar invariantes sob retry e concorrência.
- [ ] F4-03: implementar consultas/dashboards/relatórios a partir do mesmo contrato financeiro; totais precisam reconciliar com os registros de origem.
- [ ] F4-04: revisar read models: começar com queries e índices adequados; criar agregações/rebuild apenas onde necessário, com versão, checkpoint, recomposição e limite de atraso visível. A escolha usa a estimativa de linhas/custo de F0-06; o rebuild a cada 5 minutos do sistema atual não é portado por padrão.
- [ ] F4-05: gerar PDFs/documentos com marca VTUR e testes de conteúdo/acesso; verificar quebra de página e valores em exemplos representativos.
- [ ] F4-06: provar ausência de importadores e conciliação excluídos, incluindo permissões, menus, rotas, parsers e dependências indiretas do financeiro.

**Aceite:** casos financeiros aprovados, duas gravações simultâneas não duplicam nem corrompem valores; relatórios batem com as vendas/recebimentos; nenhum cálculo depende de dado externo legado.

### F5 — completar o escopo de lançamento

- [ ] F5-01: executar o catálogo de módulos abaixo, cada um com status próprio e os mesmos critérios de F3/F4.
- [ ] F5-02: tarefas agendadas e notificações com autenticação apropriada, processamento em lotes, retomada e idempotência. Provar que um cron não envia e-mail/push duplicado e não perde escopo de empresa. As tarefas usam o handler `scheduled()` nativo (ver F1-02); segredos de cron em header desaparecem.
- [ ] F5-03: recados/mural com cursor e retomada; escolher polling/SSE/DO pela necessidade validada, com reconexão e revogação de acesso também para conexões abertas.
- [ ] F5-04: eliminar acessos Supabase restantes no aplicativo novo e auditar grafo de imports, rotas e configuração. Não remover uma dependência só porque desapareceu do caminho feliz.

**Aceite:** cada rota inventariada possui destino novo testado ou exclusão justificada. Módulos adiados não aparecem como funcionais. Supabase não é necessário para executar o aplicativo novo.

### F6 — operação e verificação integrada

- [ ] F6-01: carga com volume representativo e empresas simultâneas; medir p50/p95, erros, filas, SQL lido/escrito, armazenamento e custo. Testar dados frios, não só cache aquecido.
- [ ] F6-02: auditoria de segurança baseada nos requisitos aplicáveis de OWASP ASVS, com foco em auth, isolamento, arquivos, XSS/CSRF, abuso, exportação e vazamento em logs/caches. Registrar achados e correções.
- [ ] F6-03: teste de backup/restauração D1 e recuperação dos arquivos R2; documentar consistência entre metadados e objetos e exclusões acidentais. Time Travel do D1 não restaura R2. [Recuperação D1](https://developers.cloudflare.com/d1/reference/time-travel/).
- [ ] F6-04: teste de falha de e-mail, upload, banco, fila, rede e repetição de tarefa; alertas com ação e correlação, sem dados pessoais desnecessários.
- [ ] F6-05: revisão de acessibilidade, navegação mobile, privacidade e experiência dos papéis reais; corrigir bloqueios antes do lançamento.

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
- [ ] EXECUÇÃO: nenhuma fase F0–F8 foi concluída nesta revisão.
- [x] R-05: refinamento (26/10/2026) — e-mail transacional (F1-07, F2-02 e seção 5), cron nativo `scheduled()` (F1-02, F5-02), custo do read model no D1 (F0-06, F4-04), plano B de autenticação (F1-04), E2E com Playwright (F0-05), ADRs em `docs/adr/` (F0-07) e ordenação do catálogo por dependências (seção 7, M10).
- [x] R-06: avaliação de sugestões externas (26/10/2026) — incorporados: `@cloudflare/vitest-pool-workers` para CI de Workers (F0-05, F1-03) e convenção de tipos Drizzle/SQLite documentada (F0-03, F1-03). Não incorporados: (a) PWA/IndexedDB/Dexie — nenhuma funcionalidade offline ou manifesto PWA foi identificado no código ou no escopo declarado do projeto; adicionar isso seria nova feature, não parte da reescrita atual; (b) ordem de execução imediata proposta ("rodar npm run dev → criar migrations") — omite a F0 inteira e contradiz o protocolo deste roteiro (primeiro passo é F0-01, não instalar pacotes ou criar schema); (c) referência ao Kysely como alternativa — o projeto escolheu Drizzle como candidato preferencial; manter uma única opção de ORM até a prova em F1-03 decidir.

**Próxima ação recomendada:** executar F0-01 a F0-07 e produzir o catálogo de regras/acessos e a baseline. Depois, F1 comprova stack e segurança no runtime escolhido. Só então consolidar ferramentas e expandir a implementação por domínio.

Referências técnicas foram consultadas em 26/10/2026 e estão ligadas junto às respectivas afirmações. Revalidar limites, APIs de bibliotecas e versões ao iniciar a execução.
