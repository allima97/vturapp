# Etapa 1 — Relatório de Diagnóstico (Auditoria e Mapeamento)

Data: 2026-11-22 · Escopo: todo o app (`src/`) — SvelteKit + Hono + Cloudflare D1/R2.

## 0. Resumo executivo

O app já tem uma base de componentes UI razoavelmente adotada (`Button`, `PageHeader`, `DataTable`, `LoadingState`, `FieldInput`), mas a padronização é **parcial e convive com implementações avulsas** em praticamente todos os eixos auditados. Os três problemas mais graves não são de design, e sim de higiene do repositório:

1. **259 arquivos duplicados com sufixo ` 2` dentro de `src/`** (cópias acidentais de Finder), incluindo componentes (`AccessibleDialog 2.svelte`, `CursorPagination 2.svelte`, `ClientActionsCell 2.svelte`), módulos TS, testes e uma rota inteira (`reescrita/clientes 2/`). Isso polui buscas, gera ambiguidade sobre qual arquivo é o canônico e infla o bundle de dev.
2. **Centenas de artefatos `vite.config.ts.timestamp-*.mjs` na raiz do repo** (lixo de crashes do Vite).
3. **Três sistemas de ícones coexistindo** (`$lib/icons` próprio, `flowbite-svelte-icons`, `lucide-svelte`) mais SVG inline.

## 1. Mapa de rotas e seções

- **146 páginas** (`+page.svelte`), **470 componentes `.svelte`** no total (298 em `src/lib`, 172 em `src/routes`).
- Seções identificadas em `src/routes/(app)`:
  - **Administrativa:** `admin/*` (usuários, empresas, permissões, planos, tipos-usuario, crm, email, avisos, financeiro, lgpd, modulos-sistema, aniversariantes, fix-recibos, parametros-importacao), `master/*`.
  - **Financeira:** `financeiro/*` (caixa, conciliacao, comissoes, notas-fiscais, formas-pagamento, regras, ajustes-vendas), `comissoes/*`.
  - **Vendas:** `vendas/*`, `orcamentos/*` (inclui `roteiros`), `consultoria-online`.
  - **Operação:** `operacao/*` (agenda, viagens, vouchers, passagens, tarefas, recados, campanhas, documentos-viagens, controle-sac, acompanhamento, ultimas-compras, minhas-preferencias).
  - **Consultas/Relatórios:** `relatorios/*` (ranking, desempenho, performance), `dashboard/*` (7 variantes: admin, financeiro, geral, gestor, logs, master, vendedor), `aniversariantes`, `clientes/*`.
  - **Cadastros:** `cadastros/*` (cidades, estados, paises, destinos, circuitos, fornecedores, produtos, opcionais, lote).
  - **Parametrização:** `parametros/*` (equipe, metas, cambios, crm, empresa, escalas, vouchers, tipo-produtos, tipo-pacotes, regras-produto...).
  - **Outras:** `auth/*`, `perfil/*`, `documentacao`, `debug`, `diagnostico`, `reescrita/*` (legado), `api/*` (Hono).
- Componentes locais por rota existem em `_components/` (ex.: `financeiro/conciliacao/_components`, `orcamentos/roteiros/[id]/_components`) — padrão aceitável, desde que não dupliquem UI genérica.

## 2. Botões de ação

| Item | Situação |
|---|---|
| Componente canônico | `src/lib/components/ui/Button.svelte` — variantes `primary/secondary/outline/ghost/danger/unstyled/selected`, tamanhos `xs–lg`, cores por seção, `loading`, `disabled`, props ARIA completas |
| Adoção | **133 arquivos** importam o `Button` (+ imports via `$lib/components/ui`) |
| Divergência | **19 arquivos com `<button>` cru** estilizado à mão |
| Índice | `ui/index.ts` existe, mas a maioria importa o caminho direto (`ui/Button.svelte`) — dois idiomas de import convivendo |

**Ação sugerida:** manter `Button` como único canônico; migrar os 19 `<button>` crus; escolher um único idioma de import (barrel `ui/index.ts`).

## 3. Ícones de ação

| Sistema | Arquivos usando |
|---|---|
| `$lib/icons/*` (biblioteca própria, 158 ícones estilo Lucide) | 159 |
| `flowbite-svelte-icons` | 147 |
| `lucide-svelte` | 24 |
| SVG inline em componentes/páginas | 8 |

- Divergência grave: **3 bibliotecas + inline**, sem semântica fixa por ação. A mesma ação (ex.: Editar/Excluir) usa ícones de famílias diferentes conforme a seção.
- Dentro da própria `$lib/icons` há pares ambíguos: `Building.svelte` × `Building2.svelte` × `Building 2.svelte`, `Cake.svelte` × `Cake 2.svelte`, `Compass 2.svelte` etc.

**Ação sugerida:** eleger **um** sistema (recomendo `$lib/icons`, já é o mais usado e não depende de lib externa), mapear semanticamente ação → ícone (Editar, Adicionar, Excluir, Visualizar, Baixar, Filtrar), migrar os usos de `flowbite-svelte-icons`/`lucide-svelte` e remover as dependências se ficarem sem uso.

## 4. Campos especializados (Moeda, CPF, CNPJ, Telefone, WhatsApp)

Existem **três utilitários sobrepostos** e nenhuma máscara de moeda:

| Arquivo | Conteúdo | Usos |
|---|---|---|
| `src/lib/actions/inputMask.ts` | action `use:inputMask` com `MaskType`: `cpf, cnpj, phone, cep, date, rg, time` — **sem `currency/moeda`** | aplicada apenas dentro de `FieldInput.svelte` |
| `src/lib/utils/inputFormatting.ts` | `formatTelefone`, `formatDocumento`, `formatCep`, `formatHorario` | 4 arquivos |
| `src/lib/utils/formatters.ts` | `formatCurrency`, `formatCPF/CNPJ/Phone/CEP`, datas, percentuais | 44 arquivos |

Divergências encontradas:
- `mask=` do `FieldInput` usada em apenas **11 arquivos de rota** (23 ocorrências) — a maioria dos formulários não usa máscara ou a faz à mão.
- **28 arquivos formatam moeda ad-hoc** com `toLocaleString('pt-BR')`/`Intl.NumberFormat` direto, apesar de `formatCurrency` existir.
- **Não existe componente/máscara de entrada de moeda** (`CurrencyInput`/`mask="moeda"`): nenhuma ocorrência. Entrada de valores é crua, variando por tela.
- `inputmode` praticamente ausente: apenas **2 ocorrências** em todo `src/` — ruim para mobile em campos numéricos/telefone/moeda.
- Formato de persistência no D1 não está documentado em contrato único (dígitos puros vs. formatado); cada fluxo trata de um jeito.

**Ação sugerida:** unificar máscaras em `inputMask.ts` (adicionar `currency` e `whatsapp`), fazer `FieldInput`/`FieldCurrency` serem o único ponto de entrada, adicionar `inputmode` automático por tipo de máscara, e definir contrato: **D1/API guardam dígitos puros (documento/telefone) e centavos ou decimal numérico (moeda); UI mascara na exibição**.

## 5. Filtros de busca

- Existe `src/lib/components/ui/FilterPanel.svelte` (Card + grid responsivo + slot de ações), mas com apenas **3 usos**.
- **Debounce** em busca textual aparece em **1 único arquivo** (`parametros/crm`).
- Barras de busca ad-hoc (`placeholder="Buscar/Filtrar/Pesquisar"`) em 10+ arquivos, cada uma com layout próprio.
- Não há padrão de gaveta/popover de filtros para mobile — cada listagem resolve (ou não) o responsivo por conta.

**Ação sugerida:** promover `FilterPanel` a anatomia oficial (busca com debounce embutido, selects, período, botão limpar), com variante mobile em `BottomSheet` (componente já existente).

## 6. Upload de arquivos (R2)

- Componentes `FileDropzone.svelte` e `FileInput.svelte` existem em `ui/`, com **~2 usos reais**.
- **`input[type=file]` cru em ~5 arquivos**: `operacao/passagens`, `cadastros/opcionais/ImportarOpcionais.svelte`, `operacao/vouchers/novo/_components/ImportacaoVoucher.svelte`, `reescrita/clientes` (legado) — cada um com UI de seleção/progresso/erro própria.
- Backend R2 está centralizado (`src/lib/server/r2/*`, `storageApi.ts`) — o lado servidor já é unificado; a divergência é toda na UI.

**Ação sugerida:** consolidar um componente único de upload (dropzone + botão, preview, progresso, erro, validação de extensão/tamanho) falando com o fluxo R2 existente; migrar os 4 fluxos avulsos.

## 7. Tipografia (UI e PDFs)

**UI:**
- Tailwind v4 via `@tailwindcss/vite` (sem `tailwind.config`), tokens CSS custom em `src/app.css` (`--vtur-*`), fonte base **Source Sans 3**, `font-size: 14px`, `line-height: 1.5`.
- Sinal de alerta: blocos com `!important` forçando tamanhos em `.vtur-layout` (labels, inputs, `.text-sm`) — indica guerra de especificidade entre utilitários Tailwind e CSS global, e tamanhos divergentes por seção.
- Não foi encontrada convenção de `tabular-nums` para valores/documentos (verificar na Etapa 2 se entra como token de tabela financeira).

**PDFs:**
- Duas gerações independentes: **client-side** `src/lib/quote/exportQuotePdfClient.ts` (**1.936 linhas**, jsPDF, fonte `times`) e **server-side** `src/lib/server/vendas/pdf.ts` (jsPDF/autotable). `pdfjs-dist` usado para preview/OCR.
- Tipografia dos PDFs não deriva de nenhum token compartilhado com a UI; cada gerador define fontes/tamanhos localmente.

**Ação sugerida:** definir escala tipográfica única (UI) e tema único de PDF (família, tamanhos, pesos, `tabular-nums` em valores) consumido pelos dois geradores; eliminar os `!important` resolvendo a cascata na origem.

## 8. Componentes SvelteKit e duplicações

**Bem adotados (manter como canônicos):** `PageHeader` (118 usos), `LoadingState` (61), `DataTable` (52, com paginação e `emptyMessage` embutidos), `ui/Dialog` (45), conjunto `ui/form/*`.

**Sobreposição a resolver:**

| Família | Componentes coexistindo | Usos |
|---|---|---|
| Diálogo/Modal | `Dialog` (45), `AccessibleDialog` (2), `OverlayModal` (2), `BottomSheet`/`BottomSheetImpl`, `GlobalConfirmDialog` (1), `ConfirmDialog` (2), `confirm()` nativo (3) | fragmentado |
| Tabela | `DataTable` (52), `SimpleTable` (5), `<table>` cru (20 arquivos) | DataTable dominante |
| Paginação | interna do `DataTable`, `PaginationControls` (1), `CursorPagination` (2) | candidatos a fundir |
| Empty state | `EmptyState` (3) vs. textos ad-hoc "Nenhum(a)… encontrado/cadastrado" em **72 arquivos** | padronizar via `DataTable`/EmptyState |
| Células de cliente | `ClientActionsCell`, `ClientNameCell` (+ duplicatas ` 2`) | revisar |

**Lixo/duplicatas estruturais:** 259 arquivos ` 2` em `src/`; raiz com centenas de `vite.config.ts.timestamp-*.mjs`; pastas `drizzle/`, `drizzle/archive 2/`, configs duplicados (`drizzle.config 2.ts`, `eslint.config 2.js`, `.prettierrc 2`, etc.).

## 9. Estados e listagens (ponto 8 complementar do plano)

- **Loading:** bem padronizado via `LoadingState` (61 usos).
- **Empty:** o pior eixo — 72 arquivos com mensagens ad-hoc; `EmptyState` quase sem uso (3). `DataTable` já tem `emptyMessage`, mas as 20 tabelas cruas e listas em cards improvisam.
- **Erro:** `AlertMessage.svelte` existe; verificar adoção por seção na Etapa 4.
- **Confirmação de exclusão:** sem padrão — `ConfirmDialog` (2), `GlobalConfirmDialog` (1), `confirm()` nativo (3), e modais customizados. Candidato claro a componente único (AlertDialog) com variantes destrutivas.
- **Paginação:** majoritariamente via `DataTable` embutida; dois mecanismos órfãos (`PaginationControls`, `CursorPagination`) a fundir/deprecar.

## 10. Prioridades sugeridas para as Etapas 2–4

1. **Limpeza estrutural (pré-requisito):** remover os 259 arquivos ` 2`, os `vite.config.ts.timestamp-*` da raiz e configs duplicados — sem isso qualquer migração corre risco de editar a cópia errada.
2. **Contrato de dados mascarados** (D1/Hono ↔ UI) + máscara de moeda + `inputmode` — maior impacto em consistência e mobile.
3. **Sistema de ícones único** com mapa semântico de ações.
4. **Confirmação de exclusão e empty state** como componentes oficiais (baixo custo, alto ganho visual).
5. **FilterPanel** como anatomia oficial com debounce e variante mobile.
6. **Upload R2** unificado.
7. **Escala tipográfica + tema de PDF** compartilhados.
