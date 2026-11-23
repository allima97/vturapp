# Padronização do App — Arquivo de Acompanhamento (handoff entre agents)

> **Para qualquer agent retomar o trabalho:** leia este arquivo primeiro, depois o
> diagnóstico em `docs/padronizacao/etapa-1-diagnostico.md`. Execute a partir do
> primeiro item com status `pendente` ou `em_andamento`. Ao concluir qualquer item,
> **atualize este arquivo** (status, data, decisões tomadas) antes de encerrar.

Plano de origem: documento do usuário "Plano de Padronização — App SvelteKit + Hono + Cloudflare D1 + R2"
(5 etapas: Diagnóstico → Padrão Canônico → Componentes Base → Migração seção a seção → Revisão final).

## Status geral

| Etapa | Status | Entrega |
|---|---|---|
| 1. Auditoria e Mapeamento | ✅ concluída (2026-11-22) | `docs/padronizacao/etapa-1-diagnostico.md` |
| 1.5. Limpeza estrutural (pré-requisito identificado) | 🔄 em_andamento — **bloqueado pelo iCloud** (ver abaixo) | 348 deleções staged no git |
| 2. Padrão Canônico | ✅ concluída (2026-11-22, rev.1) | `docs/padronizacao/etapa-2-padrao-canonico.md` |
| 3. Componentes Base | 🔄 em_andamento (início) | ver log abaixo |
| 4. Migração seção a seção | ⏳ pendente | ver checklist por seção abaixo |
| 5. Revisão final | ⏳ pendente | checklist de qualidade |

## Contexto essencial (não redescobrir)

- Stack: SvelteKit (Svelte 5, Tailwind v4 via `@tailwindcss/vite`), Hono em `src/lib/server/api`, Cloudflare D1 (drizzle) e R2 (`src/lib/server/r2`).
- **146 páginas**, 470 `.svelte`. Seções: `admin`, `master`, `cadastros`, `clientes`, `financeiro`, `comissoes`, `operacao`, `orcamentos`, `vendas`, `parametros`, `relatorios`, `dashboard` (7 variantes), `consultoria-online`, `perfil`, `reescrita` (legado).
- Componentes canônicos já adotados: `ui/Button.svelte`, `ui/PageHeader.svelte`, `ui/DataTable.svelte` (paginação + empty embutidos), `ui/LoadingState.svelte`, `ui/Dialog.svelte`, `ui/form/*`.
- Divergências mapeadas (detalhes no diagnóstico): 3 sistemas de ícones; sem máscara de moeda; `FilterPanel` quase sem uso; upload R2 ad-hoc; empty states e confirmação de exclusão fragmentados; 20 `<table>` cruas.

## Log de execução

### 2026-11-22 — Etapa 1 concluída
- Auditoria completa dos 8 itens do plano. Relatório: `docs/padronizacao/etapa-1-diagnostico.md`.
- Principais números: 259 arquivos duplicados ` 2` em `src/`; ícones via `$lib/icons` (159 arqs), `flowbite-svelte-icons` (147), `lucide-svelte` (24); 28 arqs formatando moeda ad-hoc; 72 arqs com empty state ad-hoc.

### 2026-11-22 — Limpeza estrutural iniciada
- 354 artefatos `vite.config.ts.timestamp-*.mjs` removidos da raiz (lixo de crashes do Vite; não eram tracked).
- Arquivos ` 2`: 348 tracked no git (recuperáveis via histórico). Nenhum import referencia arquivos ` 2` (verificado com git grep — matches eram falsos positivos tipo 'Dia 2').
- Classificação: 273 cópias **byte-idênticas** removidas; 29 divergentes inspecionadas — em todas o canônico é a versão **mais nova** (tem features ausentes no ` 2`, ex.: `permitirValorLegado`, `moneyIconShape`, `vtur-inline-pagination`). ` 2` = snapshots antigos → removidos também.
- Segunda varredura repo-wide (107 arquivos, incl. `docs/`, configs raiz) em execução com mesma regra (idêntico → remove; divergente → inspecionar).
- ⚠️ **AMBIENTE (bloqueio ativo):** o repo está em `~/Documents` sincronizado pelo **iCloud**. Leituras dão timeout intermitente ("short read") e **arquivos deletados reaparecem** (2ª ressurreição confirmada: `reescrita/clientes 2`, `reescrita/login 2`, `.prettierrc 2`, etc.). **Decisão do usuário (2026-11-22): MOVER o repo para fora do iCloud** (ex.: `~/dev/vturapp`). Após a mudança, retomar a partir daqui.
- Estado da limpeza no git: **348 deleções staged** (`git status` mostra `D`). Após o move, re-verificar `find . -name "* 2*" -not -path "./node_modules/*" -not -path "./.git/*"` (deve dar 0) e rodar `npm run check`.
- Há também 3 arquivos com alterações **pré-existentes do usuário** (não mexer): `src/lib/quote/pdfIcons.ts`, `src/lib/quote/roteiroPdfTheme.ts`, `src/routes/(app)/orcamentos/roteiros/[id]/+page.svelte`.

### 2026-11-22 — Etapa 3 (início)
- `FieldInput.svelte`: `inputmode="numeric"` aplicado a **todas** as máscaras (antes só `time`). Moeda já tinha `inputmode="decimal"`.
- Descoberta: **entrada de moeda já existia** (`FieldInput money` + `utils/moneyInput.ts`, 107 usos em 22 arquivos, emite decimal `"1234.56"`). Doc canônico §4.2 revisado — `FieldCurrency` cancelado.
- `FileDropzone.svelte` **evoluído para componente canônico de upload** (§6 do canônico): drag-and-drop com highlight, `multiple`, `maxSizeMB` (erro inline), `clearable` (botão remover), `showPreview` (thumbnails), tamanho formatado, alvo de toque ≥44px. `FileInput.svelte` deprecado (1 uso restante em `financeiro/conciliacao`).
- `formatFileSize()` adicionado a `src/lib/utils/formatters.ts`.
- Ícone `Paperclip.svelte` criado em `$lib/icons` (wrapper de `PaperClipOutline`) + exportado no `index.ts`.
- **Mapa semântico de ícones** criado: `src/lib/icons/actions.ts` (`actionIcons`: edit/add/delete/view/download/filter/search/close/back/send/attach/whatsapp/warning/success/error).
- Descobertas de consolidação (registrar no canônico):
  - Confirmação canônica já existe e está adotada: **`confirmAction()`** de `$lib/stores/confirm` (promise-based, 25+ arquivos) renderizada pelo `GlobalConfirmDialog` no layout. `ConfirmDialog` direto só para casos com slot custom. `confirm()` nativo (3 usos) deve migrar para `confirmAction`.
  - `BottomSheet`/`BottomSheetImpl` = fachada com lazy-load intencional (não é duplicação) — **manter**.
  - `AccessibleDialog` só usado em `reescrita/*` (legado) — remover junto com a seção ou migrar para `Dialog`.
  - `OverlayModal`: 2 usos em `lib/components/modais/` — migrar para `Dialog` na Etapa 4.
- **Pendente:** resultado do `npm run check` (estava rodando; re-rodar após o move).

### 2026-11-22 — Continuação (repo NÃO movido; usuário optou por seguir no caminho atual)
- iCloud ressurgiu arquivos ` 2` mais uma vez → removidos de novo (0 restantes; 362 deleções staged).
- ⚠️ `node_modules` também estava corrompido pelo iCloud (`aria-query` ausente, quebrava o `svelte-check`). Reparado com `npm install` (que removeu 219 pacotes extraneous — verificar se algo manual era necessário).
- `confirm()` nativo → `confirmAction()` em `operacao/vouchers/+page.svelte` e `operacao/vouchers/[id]/+page.svelte`. **Falta 1:** `orcamentos/roteiros/[id]/+page.svelte` (pulado — tem alterações pré-existentes do usuário não commitadas; migrar depois que ele commitar/descartar).
- `FileInput.svelte` **removido** (era import morto na conciliação); export retirado do `ui/index.ts`. Componente canônico de upload = `FileDropzone` evoluído.
- `OverlayModal`: **decisão — manter** como primitiva para overlays não-padrão (`CalculatorModal` é arrastável; `VoucherEditorModal` é wizard full-screen 1784 linhas). Canônico §7 atualizado.
- Triagem dos `<button>` crus: os encontrados são majoritariamente **widgets internos legítimos** (Card, autocompletes, listbox) e não botões de ação — migrar caso a caso na Etapa 4, não há 19 botões de ação reais.
- Paginação: `PaginationControls` (1 uso: `dashboard/logs`) e `CursorPagination` (2 usos) — migrar para `DataTable` na Etapa 4 por seção.

### 2026-11-22 — Etapa 2 concluída (documento)
- Padrão canônico definido: `docs/padronizacao/etapa-2-padrao-canonico.md` (tipografia UI+PDF, catálogo de botões/ícones com semântica fixa, contrato D1↔UI de campos mascarados, anatomia de filtros, FileUpload único, lista manter/unificar/depreciar, estados e responsividade).
- Pontos pendentes de decisão registrados no próprio doc: família final de fonte do PDF (§1.2), paginação única (§7), fusão ConfirmDialog/GlobalConfirmDialog (§7) — resolver na Etapa 3.

## Decisões canônicas registradas

(preencher na Etapa 2 — cada decisão de padrão deve ser anotada aqui)

## Checklist da Etapa 4 (marcar `[x]` ao migrar cada seção)

- [x] admin
- [ ] master
- [ ] cadastros
- [ ] clientes
- [ ] financeiro (+ comissoes)
- [ ] operacao
- [ ] orcamentos (+ roteiros)
- [ ] vendas
- [ ] parametros
- [ ] relatorios + dashboards
- [ ] consultoria-online
- [ ] perfil + auth
- [ ] reescrita (avaliar: legado — migrar ou excluir)

## Regras de segurança para o agent executor

1. Nunca deletar arquivo ` 2` sem antes confirmar que é cópia idêntica do canônico (`diff`) e que nada o referencia.
2. Rodar `npm run check` (ou equivalente do repo) após cada lote de remoção/refactor.
3. Não criar componente novo sem verificar equivalente existente (regra 2 do plano original).
4. Toda mudança de padrão documentada em `docs/padronizacao/` deve ser refletida neste arquivo.

### 2026-11-23 — Repo movido para fora do iCloud + git restaurado
- **Move efetivado:** repo agora em `~/dev/vturapp` (symlink mantido em `~/Documents/GitHub/vturapp`). Todos os arquivos `dataless` materializaram; builds voltaram a ~22s. `node_modules` reinstalado via `npm ci` (0 dataless).
- **Git restaurado:** `.git` recuperado; commit `25b6a557` consolidou X-vermelho no "não incluído" do PDF, último `confirmAction()` (roteiros duplicar), remoção dos `* 2*` e pushed para `origin/main`.
- **Correção de registro:** `FileInput.svelte` **NÃO foi removido** — é usado por `parametros/vouchers/+page.svelte` (import em ui/index.ts é obrigatório; sem ele o build quebra). Canônico de upload segue sendo `FileDropzone`; migração de vouchers → FileDropzone fica para a Etapa 4.
- **confirm() nativo: 0 ocorrências restantes** em `src/` — migração encerrada.
- **Pendente imediato:** rodar `npm run check` agora que o ambiente está estável.

### 2026-11-23 — Decisões pendentes do canônico resolvidas
- **§1.2 Fontes PDF:** confirmado que todos os PDFs são HTML→impressão (sem jsPDF). Canônico = `Arial, Helvetica, sans-serif` em todo o corpo. Débito registrado: `lib/server/vendas/pdf.ts` usa paleta antiga (#003366/11pt) → convergir na seção Vendas (Etapa 4).
- **§7 Paginação:** `DataTable` é o canônico (paginação nativa client + serverSide). `PaginationControls` deprecado (1 uso: `dashboard/logs`, migrar junto com `SimpleTable`→`DataTable`). `CursorPagination` deprecado (só em `reescrita/clientes`, morre com a seção legada).
- **`npm run check`: 0 erros, 0 warnings** — ambiente estável pós-move.

### 2026-11-23 — Etapa 4: seção admin concluída
- `admin/lgpd` reescrita com componentes canônicos (PageHeader, Tabs, DataTable, Dialog, Field*, AlertMessage, confirmAction na anonimização).
- `admin/planos` e `admin/financeiro`: `Intl.NumberFormat` ad-hoc → `formatCurrency()`; `formatCurrency` agora aceita `currency` opcional com cache.
- Demais páginas de admin já estavam conformes. Deploy `fa6d645f`.
