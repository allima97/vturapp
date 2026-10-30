# F3-01 — Clientes em D1 e anexos privados em R2

Data: 2026-10-26  
Estado: implementado e validado localmente; interface do fluxo fica em F3-02.

## Implementado

- Schema D1 para clientes e metadados de anexos, com unicidade de documento por empresa, índices de listagem, soft delete e versão para edição concorrente.
- Serviço de domínio para criar, listar com cursor, buscar, detalhar, editar, desativar e gerenciar anexos.
- Rotas autenticadas `/api/v2/clientes`, protegidas pelas capacidades de F2 e filtradas pelo tenant da sessão.
- Upload privado para R2 com validação de MIME e assinatura do conteúdo; download mediado pelo Worker e compensação do objeto se falhar o registro dos metadados.
- Testes de integração no runtime Workers com D1/R2 locais: CRUD, validação, paginação, unicidade, isolamento entre empresas, conflito de versão, upload/download/remoção e permissões HTTP.

## Verificação

- `npm test -- --project workers`: 15 testes passaram.
- `npm run check`: sem erros de tipos; permanecem 9 avisos de acessibilidade preexistentes em `src/routes/(app)/admin/lgpd/+page.svelte`.
- `npm test`: 905 testes passaram em 108 arquivos, incluindo os 15 testes Workers.
- `npm run api:inventory:check`: aprovado (259 endpoints catalogados).

## Limites deste checkpoint

- Ainda não há tela nova ligada a esta API. Busca, filtros, estados visuais, formulário/modal acessível e fluxo desktop/mobile pertencem a F3-02.
- O aplicativo legado e suas rotas não foram alterados nem substituídos por esta implementação.
