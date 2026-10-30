# F3-02 — Interface do fluxo de clientes

Data: 2026-10-26  
Estado: implementado; wrappers e tokens padronizados em F3-03; validação visual autenticada continua em F3-04.

## Implementado

- Área isolada em `/reescrita/clientes` com login Better Auth em `/reescrita/login`; não depende da sessão Supabase do aplicativo antigo.
- Busca por nome/documento com debounce, inclusão opcional de inativos e paginação por cursor estável.
- Lista em `DataTable` compartilhada, que apresenta tabela no desktop e cartões no mobile; estados de carregamento, lista vazia, erro/retry e sessão expirada.
- Formulário de cadastro/edição com validação HTML e validação autoritativa no servidor; conflito de versão é apresentado ao usuário.
- Detalhe com metadados e upload/download de anexos privados.
- Diálogos nativos acessíveis com fechamento por Escape, contenção de foco, foco inicial e retorno do foco.

## Validação

- Validação atualizada em `docs/f3/F3-03-componentes-visuais.md` e `docs/f3/F3-04-validacao-integrada.md`.
- Lista e modais com sessão Better Auth ainda precisam de revisão visual e interação real desktop/mobile.
