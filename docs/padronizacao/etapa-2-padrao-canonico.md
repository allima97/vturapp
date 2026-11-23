# Etapa 2 — Padrão Canônico (Design & Contrato)

Data: 2026-11-22 · Base: `docs/padronizacao/etapa-1-diagnostico.md`.
Este documento é a **especificação única**. Toda tela nova ou migrada (Etapa 4) deve segui-lo;
divergências existentes são débito a remover.

---

## 1. Tipografia

### 1.1 UI (app)
- Família base: **Source Sans 3** (já definida em `src/app.css`), fallback system sans.
- Escala canônica (tokens `--vtur-*` em `app.css`):

| Token | Uso | Valor |
|---|---|---|
| `--vtur-copy-xs` | metadados, hints | 0.75rem |
| `--vtur-copy-sm` | texto secundário, tabelas | 0.82rem |
| corpo | texto padrão, inputs | 0.92rem |
| títulos de página | via `PageHeader` | 1.25rem / 600 |
| títulos de card/seção | via `Card` | 1rem / 600 |

- `line-height`: 1.5 corpo; 1.22 labels; 1.4 inputs.
- Pesos: 400 (corpo), 600 (ênfase/títulos), 700 (apenas destaques fortes). Não usar 800/900.
- **Valores monetários, documentos e colunas numéricas de tabelas: sempre `tabular-nums`** (classe utilitária `tnum` a criar ou `font-variant-numeric: tabular-nums` no `DataTable`).
- **Proibido** `!important` tipográfico novo. Os blocos atuais com `!important` em `.vtur-layout` (`app.css`) serão eliminados na Etapa 3 resolvendo a cascata na origem.

### 1.2 PDFs
- Tema único em `src/lib/quote/roteiroPdfTheme.ts` (estender para valores/tabelas) consumido por **ambos** os geradores (`lib/quote/exportQuotePdfClient.ts` e `lib/server/vendas/pdf.ts`).
- Família: helvetica (jsPDF core) para corpo; times apenas onde já houver identidade consolidada — decisão final de família registrada aqui após Etapa 3. **Interim: manter o que cada gerador usa, mas tamanhos/pesos/cores vêm do tema.**
- Valores monetários em PDF: sempre formatados com `formatCurrency` (nunca concatenação manual de "R$").

---

## 2. Botões (catálogo fixo)

Componente único: `src/lib/components/ui/Button.svelte`. Import sempre via barrel: `import { Button } from '$lib/components/ui'`.

| Ação | Variante | Cor | Ícone (semântica fixa) |
|---|---|---|---|
| Ação principal do formulário/tela | `primary` | cor da seção | — |
| Ação secundária | `outline` | cor da seção | — |
| Cancelar / voltar | `ghost` | — | — |
| Excluir / ação destrutiva | `danger` | red | `Trash2` |
| Editar | `outline` ou ghost-icon | — | `Pencil` |
| Adicionar / novo | `primary` | cor da seção | `Plus` |
| Visualizar | ghost-icon | — | `Eye` |
| Baixar / exportar | `outline` | — | `Download` |
| Filtrar | `outline` | — | `Filter` |

Regras:
- Botão com ícone e sem texto: **obrigatório** `ariaLabel` (ex.: `ariaLabel="Excluir"`).
- Estado de submissão: sempre `loading` (nunca desabilitar sem spinner quando houver await).
- Tamanhos: `md` padrão em formulários/barras; `sm` em células de tabela; `xs` apenas em chips/ações densas.
- Barras de ação de formulário: usar `ui/form/FormActions.svelte` (primário à direita, cancelar à esquerda dele).
- `<button>` cru estilizado à mão: **proibido** fora de `lib/components/ui` (19 ocorrências a migrar).

---

## 3. Ícones

- Sistema único: **`$lib/icons`** (biblioteca local, semântica Lucide).
- `flowbite-svelte-icons` e `lucide-svelte`: **deprecadas** — migrar usos e remover dependências ao fim da Etapa 4. Exceção temporária: `flowbite-svelte` (componentes legados em `ui/flowbite-legacy`) até serem substituídos.
- Mapa semântico fixo (ação → ícone): Editar `Pencil` · Adicionar `Plus` · Excluir `Trash2` · Visualizar `Eye` · Baixar `Download` · Filtrar `Filter` · Buscar `Search` · Fechar `X` · Voltar `ArrowLeft` · Enviar `Send` · Anexo/arquivo `Paperclip` · WhatsApp `Whatsapp` · Alerta `AlertTriangle` · Sucesso `CheckCircle2` · Erro `AlertCircle`.
- Tamanho padrão: 16px (`size={16}`) em botões/inputs; 20px em ações de tabela; cor via `currentColor` (herda do botão/texto).
- Ícone novo: adicionar em `$lib/icons` seguindo o formato dos existentes (SVG 24×24, stroke). Nunca inline na página.
- Limpar pares ambíguos já identificados (`Building` × `Building2`, etc.) — canônico é o sem sufixo.

---

## 4. Campos especializados e contrato de dados

### 4.1 Contrato D1/Hono (dado bruto)

| Tipo | No D1 / API | Na UI |
|---|---|---|
| Moeda | `REAL`/decimal com 2 casas (string `"1234.56"` na API) | `1.234,56` com máscara ao digitar (`FieldInput money`) |
| CPF | `TEXT` 11 dígitos puros | `000.000.000-00` |
| CNPJ | `TEXT` 14 dígitos puros | `00.000.000/0000-00` |
| Telefone/WhatsApp | `TEXT` 10–13 dígitos puros (com DDI quando houver) | `(00) 00000-0000` |
| CEP | `TEXT` 8 dígitos puros | `00000-000` |
| Datas | `TEXT` ISO `YYYY-MM-DD` | `DD/MM/AAAA` |

Regra de ouro: **a API nunca recebe nem devolve string mascarada.** A máscara vive só na camada de UI.

### 4.2 Implementação canônica (revisada após verificação de código)
- **Entrada de moeda já existe e está adotada: `FieldInput money`** (`ui/form/FieldInput.svelte` + `src/lib/utils/moneyInput.ts`) — 22 arquivos, 107 usos. Digitação mascarada pt-BR, emite **string decimal** (`"1234.56"`) via evento `moneyInput`, `inputmode="decimal"`, suporte a negativo e min/max. **Não criar `FieldCurrency`** — o trabalho da Etapa 4 é migrar entradas de moeda avulsas para `FieldInput money`.
- Fonte única de máscaras: `src/lib/actions/inputMask.ts` (`cpf, cnpj, phone, cep, date, rg, time`).
  - **WhatsApp usa `mask="phone"`** — a máscara já preserva formato internacional (`+DDI...`). Não criar tipo separado.
  - Pendência identificada (Etapa 3): `inputmode` automático por máscara — hoje só `time` define `numeric`; estender para `cpf/cnpj/cep/phone/date` (`numeric`).
- Exibição (somente leitura): `src/lib/utils/formatters.ts` (`formatCurrency`, `formatCPF`, …). Proibido `toLocaleString`/`Intl.NumberFormat` ad-hoc em componentes (28 ocorrências a migrar).
- `src/lib/utils/inputFormatting.ts`: **uso interno do `inputMask`** — não deprecar o arquivo, mas proibir import direto por páginas/componentes (4 usos externos a migrar para `formatters.ts`).

---

## 5. Filtros de busca (anatomia única)

Componente: `ui/FilterPanel.svelte` (promovido a oficial).

- **Desktop:** barra acima da listagem, grid de campos (`fieldsClass` padrão), slot `actions` com botão **Filtrar** (`primary`) e **Limpar** (`ghost`).
- **Mobile (<lg):** colapsar para botão "Filtros" que abre `ui/BottomSheet.svelte` com os mesmos campos; badge com contagem de filtros ativos.
- **Busca textual:** debounce de **350ms** embutido (helper `createDebounced` a extrair do padrão usado em `parametros/crm`), `type="search"`, ícone `Search`.
- **Limpar filtros:** reseta todos os campos e dispara nova busca; sempre visível quando houver ≥1 filtro ativo.
- Filtros de período: par de datas ISO (`de`/`ate`) com `FieldInput type="date"`; presets opcionais (Hoje, 7d, 30d, Mês).
- Filtros de status/valor: `FieldSelect` com opção "Todos" como primeiro item.

---

## 6. Upload de arquivos (R2)

Componente único: **`ui/FileDropzone.svelte`** (evoluído na Etapa 3 — decisão revista: em vez de criar um terceiro componente `FileUpload`, o `FileDropzone` existente foi estendido; `FileInput.svelte` fica **deprecado**, migrar o uso restante em `financeiro/conciliacao`).

Anatomia implementada:
- Desktop: drag-and-drop (highlight ao arrastar) + clique abre seletor (label + input escondido acessível).
- Mobile: mesma área com toque ≥44px (`min-h-[44px]`).
- Após seleção: lista com nome, tamanho (`formatFileSize` em `formatters.ts`), thumbnail de imagem (`showPreview`) e botão remover (`clearable`).
- Estados: erro inline (`error` prop ou validação de tamanho), `helper`, disabled.
- Validação: props `accept`, `multiple`, `maxSizeMB` (erro inline padronizado).
- Integração: o componente gerencia apenas seleção/validação de arquivos (`bind:files`); o upload em si (progresso, R2 via `storageApi`) fica no chamador — padronizar os fluxos na Etapa 4.

---

## 7. Lista final de componentes (manter / unificar / depreciar)

### Manter como canônicos
`Button`, `PageHeader`, `Card`, `Badge`, `DataTable` (tabela + paginação + empty), `LoadingState`, `EmptyState`, `AlertMessage`, `Dialog`, `ConfirmDialog` (promovido — ver §8), `BottomSheet`, `Tabs`, `Tooltip`, `ToastContainer`, `FilterPanel`, `ui/form/*` (FieldInput, FieldSelect, FieldTextarea, FieldCheckbox, FieldRadioGroup, FieldToggle, FieldDatalistInput, FormPanel, FormActions), `SanitizedHtml`, `MobileCardField`.

### Unificar (Etapa 3)
- ~~`FileDropzone` + `FileInput` → `FileUpload`~~ → **`FileDropzone` evoluído** (§6); `FileInput` **removido** (era import morto na conciliação).
- `Dialog` (padrão para diálogos com título/ações) × `OverlayModal` (**manter** como primitiva sancionada para overlays não-padrão: janela arrastável da `CalculatorModal`, wizard full-screen do `VoucherEditorModal` — migrar quebraria comportamento) × `AccessibleDialog` (só em `reescrita/*` legado — remover com a seção).
- Paginação: `PaginationControls` + `CursorPagination` → absorver no **`DataTable`** (ou `CursorPagination` único exportado; decisão na Etapa 3 conforme uso real).
- ~~`BottomSheet`/`BottomSheetImpl` → um só~~ → **manter**: fachada lazy-load intencional.
- `SimpleTable` → migrar 5 usos para `DataTable` e remover.
- 20 `<table>` cruas → `DataTable` (ou `SimpleTable` interno onde for markup estático de apresentação).

### Depreciar / remover
- ~~`GlobalConfirmDialog`~~ → **manter**: é o mecanismo canônico de confirmação (§8).
- `ui/FileInput.svelte` (usar `FileDropzone` — §6).
- `utils/inputFormatting.ts` (uso externo; permanece interno do `inputMask` — §4.2).
- `flowbite-legacy/*` (substituir usos restantes por componentes `ui/`).
- Dependências `flowbite-svelte-icons` e `lucide-svelte` ao final da migração.

### Criar (Etapa 3)
- Mapa de ícones de ação (§3) como export nomeado de `$lib/icons`.
- ~~`FieldCurrency`~~ — **cancelado**: `FieldInput money` já cobre (ver §4.2).
- ~~`FileUpload`~~ — **cancelado**: `FileDropzone` evoluído cobre (ver §6).

---

## 8. Estados (loading / empty / erro / exclusão)

- **Loading:** `LoadingState` (já padrão, 61 usos).
- **Empty:** `EmptyState` em listas/cards; `emptyMessage` do `DataTable` em tabelas. Migrar os 72 textos ad-hoc "Nenhum…".
- **Erro:** `AlertMessage` (variante erro) inline; toast para erros de ação assíncrona.
- **Confirmação de exclusão:** mecanismo canônico é **`confirmAction()` de `$lib/stores/confirm`** (promise-based, auto-infere título/variante destrutiva pela mensagem; já adotado em 25+ arquivos), renderizado pelo `GlobalConfirmDialog` montado no layout `(app)/+layout.svelte`. `ConfirmDialog` direto só para casos com slot customizado. Proibido `confirm()` nativo (3 ocorrências a migrar para `confirmAction`) e modais de confirmação customizados.

---

## 9. Responsividade (checklist obrigatório por tela)

1. Sem scroll horizontal em 360px (`overflow-x` já travado no global — não reintroduzir com tabelas sem wrapper).
2. Tabelas: `DataTable` com scroll interno ou cards mobile (`MobileCardField`).
3. Áreas de toque ≥44px em ações mobile.
4. `inputmode` correto em todos os campos mascarados (§4.2).
5. Filtros em `BottomSheet` no mobile (§5).

---

## Rastreabilidade

Decisões aqui registradas alimentam o `docs/padronizacao/ACOMPANHAMENTO.md`.
Qualquer desvio aprovado durante a Etapa 4 deve ser anotado neste documento (não o contrário).
