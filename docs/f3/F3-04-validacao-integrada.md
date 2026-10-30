# F3-04 — Validação integrada (concluída)

Data: 2026-10-26; fechamento em 2026-10-29  
Estado: concluída — upload pela UI validado com Playwright em Chromium próprio.

## Cobertura funcional automatizada

`src/lib/server/clientes/clientes.workers.test.ts` roda no runtime Workers com D1/R2 locais. A suíte tem 18 casos, incluindo:

- CRUD, paginação e validação de clientes;
- acesso negado por papel viewer (403) e isolamento entre empresas (404);
- edição concorrente com HTTP 409;
- tentativa inicial sem binding (503 recuperável) seguida de nova chamada (401 sem sessão), demonstrando retry no limite de serviço;
- upload com PDF declarado mas conteúdo incompatível (400) e upload válido + download privado;
- contagem instrumentada de consultas D1 para a listagem autenticada em duas páginas.

Comandos executados:

- `npm test -- --project workers`: 18 passaram.
- `npm test`: 908 passaram em 108 arquivos.
- `npm run check`: zero erros, 9 avisos legados de acessibilidade em `admin/lgpd`.
- `npm run build`: sucesso.
- `npm run api:inventory:check`: sucesso (259 endpoints).
- `git diff --check`: sucesso.
- A rota de teste inclui uma leitura de lista paginada e listagem de anexos concorrentes (`Promise.all`) sob a mesma sessão sintética: ambas retornam 200; resultado confirma 2 leituras independentes sem dependência serial no handler.

## Revisão autenticada no navegador

- Login e navegação autenticados foram feitos com usuário sintético no D1 local, sem usar sessão ou dados pessoais. O ambiente foi iniciado com `wrangler.local.toml`; não houve acesso remoto, migração remota ou deploy.
- A primeira validação encontrou e corrigiu dois bloqueios no hook legado: `/api/auth/*` e `/api/v2/*` agora chegam às proteções Better Auth/Hono próprias, mantendo checagem de origem, conteúdo, limite de corpo, rate limit e RBAC do v2.
- O login também expôs a ausência de campos/tabela do plugin `twoFactor` no schema Drizzle. A migração incremental `0004_better_auth_two_factor.sql` sincroniza o schema e a autenticação local passou a criar sessão.
- Em `/reescrita/clientes`, foram validados lista autenticada, estado vazio, abertura do formulário, criação, busca, edição, detalhe, alternância de “Incluir inativos” e persistência após recarga. A lista exibiu o cadastro atualizado.
- Dialogs inicialmente não abriam após a mudança da propriedade `open`; o componente `AccessibleDialog` foi corrigido e a abertura/fechamento foi conferida no navegador.
- Viewports revisados: 1440×900 e 390×844. `documentElement.scrollWidth` igualou a largura de conteúdo disponível em ambos, sem rolagem horizontal. No segundo conjunto local: página de login 28 ms, `sign-in` 58 ms, `get-session` 9–35 ms, listagem 13–19 ms e listagem de anexos 24 ms. São tempos dos handlers Worker, não da pintura completa.
- Uma navegação autenticada local em `/reescrita/clientes` exibiu a linha sintética em 279 ms, de `goto()` até o elemento ficar visível no DOM. A métrica inclui navegação/carregamento e renderização necessária para a linha aparecer; não é uma métrica isolada de pintura do navegador.
- A navegação por cursor foi conferida pela UI com 22 registros sintéticos: página 1 exibiu 20, “Próxima” levou à página 2 e mostrou os 2 restantes. Os 21 registros auxiliares foram removidos após o teste.
- No retorno ao fluxo autenticado, o detalhe abriu e mostrou “Nenhum anexo enviado”; o seletor do formulário foi acionado, mas a extensão do Chrome recusou o acesso ao PDF sintético local (`fileChooser.setFiles`). A suíte Workers validou upload válido, download privado e rejeição de conteúdo inválido; nenhum arquivo foi enviado pelo navegador.
- Nova tentativa em 26/10: usuário autorizou habilitar a opção, mas a política do navegador bloqueou a navegação automatizada para `chrome://extensions/`; portanto a permissão não foi alterada e `fileChooser.setFiles` continuou bloqueado. Não foi usado outro navegador nem mecanismo alternativo. A conta/sessão local foi removida ao final.
- Ao encerrar, a sessão e a conta de teste temporárias foram removidas do D1 local. O único dado de navegador mantido é o cliente sintético “Cliente F3 Navegador”, para referência em validações locais futuras; não há anexos nesse registro.

## Consultas e limite da medição

- A instrumentação Workers contou 4 chamadas `D1.prepare()` para cada GET autenticado da lista, tanto na primeira página quanto na seguinte. Pelo caminho de código, são a leitura de sessão Better Auth, duas consultas de contexto (usuário/empresa e membro/papel) e um `SELECT` de clientes com `LIMIT limite + 1`; não há consulta separada de contagem.
- O detalhe usa uma consulta para validar/ler o cliente e outra para listar anexos. A cobertura Workers confirma duas leituras concorrentes sem dependência serial.
- Os tempos do Worker são latências locais por requisição. A medição de 279 ms é navegação até linha visível; não representa uma métrica isolada de pintura completa nem orçamento de produção.

## Fechamento — upload pela UI com Playwright (29/10/2026)

A pendência restante (upload pelo formulário do navegador) foi resolvida com Playwright, que lança seu próprio Chromium e não sofre a limitação de permissão `file://` da extensão do Chrome. Playwright já era o E2E planejado no roteiro (F0-05); foi instalado como dependência de desenvolvimento (`playwright@^1.56.1`).

### Preparação

- `npm install -D playwright@1.56.1` (pacote) e `npx playwright install chromium` (navegador). O primeiro download trouxe o headless shell da revisão mais recente já disponível em cache; a execução usou esse binário via `CHROMIUM_PATH` (variável opcional do script).
- Servidor local: `npx wrangler dev --local --config wrangler.local.toml --port 8787`. O build `.svelte-kit/cloudflare` de 26/10 foi reutilizado por não haver alteração de código-fonte nesta passagem (o `vite build` neste Mac apresentou leituras de disco extremamente lentas, sem avanço em mais de 30 minutos; nenhum arquivo de `src/` foi modificado).
- Usuário sintético criado via `POST /api/auth/sign-up/email` (com header `Origin: http://127.0.0.1:8787`, exigido pela checagem de origem) e vinculado à empresa Alfa no D1 local: `UPDATE user SET empresa_id = 1` + `INSERT INTO membros_empresa (… papel 'admin' …)`.
- PDF sintético válido (479 bytes, assinatura `%PDF-1.4`) em `scripts/f3-04/f3-04-upload-navegador.pdf`.

### Execução (scripts/f3-04/upload-ui.playwright.mjs)

O script abre `/reescrita/login`, entra com a conta sintética, aguarda `/reescrita/clientes`, abre o detalhe de “Cliente F3 Navegador”, envia o PDF via `setInputFiles` no `input[type=file]` do formulário, confere o anexo na lista da UI e baixa pelo botão “Baixar”, comparando os bytes.

Resultados (uma execução, servidor local já aquecido):

- Login até listagem de clientes: 114 ms; abertura do detalhe: 37 ms.
- **Upload até o anexo aparecer na lista da UI: 34 ms** (`f3-04-upload-navegador.pdf`, 1 KB exibido).
- **Download pelo botão “Baixar”: 41 ms; 479 bytes recebidos, conteúdo idêntico ao arquivo enviado** (comparação byte a byte).
- Metadados conferidos no D1: `cliente_anexos` com `chave_r2` `empresa/1/clientes/1/<uuid>-f3-04-upload-navegador.pdf`, `tamanho_bytes` 479.

Observação operacional: o clique em “Entrar” precisa aguardar a hidratação do Svelte (`networkidle`); clicar antes disso não dispara o `signIn` (a requisição nem chega ao Worker).

### Limpeza

- Objeto R2 local removido (`wrangler r2 object delete … --local`), linha de `cliente_anexos` removida e conta/sessão/membro sintéticos apagados do D1 local. Estado final igual ao descrito nas passagens anteriores: apenas o cliente sintético “Cliente F3 Navegador”, sem anexos.
- Sem acesso remoto, deploy, migração remota ou commit.

### Artefatos

- `scripts/f3-04/upload-ui.playwright.mjs` — script de validação (não entra em `npm test`; F0-05 prevê grupo E2E separado).
- `scripts/f3-04/f3-04-upload-navegador.pdf` — PDF sintético de entrada.
- `scripts/f3-04/f3-04-result.json` — métricas registradas pela execução.

### Verificação final da suíte (29/10/2026)

- `npm test`: **908 testes passaram em 108 arquivos** (inclui os 18 Workers). Observação operacional: neste Mac o disco apresentou leituras patologicamente lentas e as duas primeiras execuções a frio tiveram falhas de timeout do RPC de transformação do vitest (`[vitest-worker]: Timeout calling "fetch"`) em 54 e depois 24 arquivos pesados; com o cache de transformação aquecido, a suíte completa passou em 19 s. Não houve alteração de código-fonte nesta passagem.
- `npm run check`: zero erros; permanecem os 9 avisos legados de acessibilidade em `admin/lgpd` (fora do escopo da reescrita).

## Histórico (26/10/2026) — pendência original

- O upload pelo seletor do navegador estava bloqueado porque a extensão de automação do Chrome não tinha permissão para arquivos locais (`fileChooser.setFiles` recusado); a política do navegador também bloqueou a navegação automatizada para `chrome://extensions/`. A suíte Workers já cobria upload válido, download privado e rejeição de conteúdo inválido. Resolvido em 29/10/2026 conforme a seção de fechamento acima.
