# F3-03 — Tokens e componentes visuais compartilhados

Data: 2026-10-26  
Estado: concluído; verificação visual da página autenticada continua em F3-04.

## Alterações

- As páginas da reescrita consomem os wrappers de `$lib/components/ui`: `Button`, `Card`, `Checkbox`, `FieldInput`, `FieldSelect`, `FileInput`, `AlertMessage`, `LoadingState`, `EmptyState` e `DataTable`.
- A tabela responsiva compartilhada mantém semântica de cabeçalho/linhas no desktop e converte cada linha em cartão no mobile; ações permanecem por cliente.
- `CursorPagination.svelte` trata paginação por cursor sem assumir páginas aleatórias ou total conhecido.
- `AccessibleDialog.svelte` usa `<dialog>.showModal()`, título associado, Escape/backdrop, foco inicial e retorno ao elemento que abriu o modal.
- `src/app.css` acrescenta tokens semânticos de superfície, borda, raio, sombra e foco; `src/lib/styles/reescrita.css` aplica a identidade à área nova.
- Correção necessária encontrada durante a revisão: `/reescrita` foi incluída nas rotas públicas do hook Supabase legado, além do bypass no layout. Os endpoints v2 seguem protegidos pela sessão Better Auth e pela política RBAC.

## Validação

- `npm run check`: zero erros; permanecem 9 avisos preexistentes em `src/routes/(app)/admin/lgpd/+page.svelte`.
- `npm test`: 907 testes passaram em 108 arquivos.
- `npm run build`: sucesso com adapter Cloudflare.
- `npm run api:inventory:check`: aprovado, 259 endpoints.
- `git diff --check`: aprovado.
- Browser local, viewport móvel (390×844): login Better Auth e estado de autenticação requerido revisados; sem rolagem horizontal visível nesse estado.
- Browser local, viewport desktop (1440×900): layout do login revisado.

## Limites

Não havia sessão Better Auth local de teste disponível no navegador. A lista com dados, os formulários, o diálogo de detalhe e as interações autenticadas ainda precisam ser verificados visualmente em desktop e mobile em F3-04. O teste de viewport móvel cobriu o estado sem sessão, não dados reais nem todo o fluxo autenticado.
