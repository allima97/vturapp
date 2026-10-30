# F1-06 — Comparação de Base Visual: Flowbite 1.33 vs Bits UI / shadcn-svelte

**Branch**: `reescrita/f1-prova-stack`  
**Status**: ✅ CONCLUÍDO  
**Data**: 2026-10-26  
**Decisão**: → ver ADR-003-ui-base-visual.md (atualizado abaixo)

---

## Contexto do projeto

| Métrica | Valor |
|---------|-------|
| Arquivos `.svelte` | 405 |
| Componentes wrapper customizados | 28 |
| Usages de `<Button>` | 700+ |
| Usages de `<Card>` | 287 |
| Usages de `<Dialog>` | 68 |
| Usages de `<DataTable>` | 54 |
| Flowbite Svelte atual | 1.33.1 (Svelte 5) |
| Flowbite legado copiado | 0.48.6 (Svelte 4, cópia local) |
| Bits UI instalado | ❌ não |
| shadcn-svelte instalado | ❌ não |

### Camada de wrappers existente

```
src/lib/components/ui/Button.svelte    → flowbite-legacy/Button.svelte
src/lib/components/ui/Dialog.svelte    → flowbite-legacy/Modal.svelte
src/lib/components/ui/Card.svelte      → custom (sem dependência Flowbite)
src/lib/components/ui/DataTable.svelte → custom (sem dependência Flowbite)
src/lib/components/ui/Input.svelte     → flowbite-legacy/Input.svelte
...
```

**Insight crítico**: os wrappers já têm API própria (variants, colors, sizes
específicos do domínio). Consumidores não importam Flowbite diretamente —
apenas `$lib/components/ui/*`. A migração do primitivo subjacente não
afeta as 400+ páginas da aplicação.

---

## Candidatos avaliados

### A — Flowbite Svelte 1.33.1 (atual)

| Critério | Avaliação |
|----------|-----------|
| Svelte 5 | ✅ Migrado completamente para Svelte 5 (runes) |
| Já instalado | ✅ `flowbite-svelte: ^1.33.1` em package.json |
| API familiar | ✅ wrappers legados já conhecidos |
| Acessibilidade | ⚠️ ARIA básico, não usa Radix/Floating UI como primitivo |
| Bundle size | ⚠️ Tree-shaking ok mas componentes são pesados |
| Manutenção | ⚠️ Comunidade mediana; issues lentas |
| TypeScript | ✅ Tipagem completa |
| Dark mode | ✅ Via Tailwind `dark:` class |

### B — Bits UI 1.x (headless) + Tailwind

| Critério | Avaliação |
|----------|-----------|
| Svelte 5 | ✅ Construído para Svelte 5 runes desde o início |
| Já instalado | ❌ Requer `npm install bits-ui` |
| Acessibilidade | ✅ Primitivos baseados em WAI-ARIA, Floating UI, foco gerenciado |
| Headless | ✅ Zero CSS de lib — 100% Tailwind customizável |
| Bundle size | ✅ Menor: apenas primitivos sem CSS embutido |
| Manutenção | ✅ Huntabyte; muito ativo, usada pelo shadcn-svelte |
| TypeScript | ✅ Tipagem forte com variantes |
| Esforço de migração | ⚠️ Reescrever internals dos 28 wrappers |

### C — shadcn-svelte 1.x

| Critério | Avaliação |
|----------|-----------|
| Svelte 5 | ✅ Migrou para Svelte 5 + Bits UI como primitivo |
| Abordagem | 📋 "Copy-paste" — componentes gerados no projeto, sem dependência em runtime |
| Acessibilidade | ✅ Herda de Bits UI |
| Design opinativo | ⚠️ Shadcn visual — precisaria sobrescrever tokens para o design vtur |
| Integração Tailwind 4 | ✅ Suporte ativo no CLI |
| Conflito com wrappers | ⚠️ Geraria dois sistemas de componentes em src/lib/components/ui |

---

## Comparação lado a lado: Dialog (caso mais complexo)

### Flowbite Svelte 1.33.1

```svelte
<script>
  import { Modal } from 'flowbite-svelte';
  let open = false;
</script>
<Modal bind:open title="Confirmar">
  <p>Conteúdo</p>
  <svelte:fragment slot="footer">
    <Button onclick={() => open = false}>OK</Button>
  </svelte:fragment>
</Modal>
```

**Problema**: usa slot API (Svelte 4), precisa adaptar para Svelte 5 snippets.
Em Flowbite 1.33 os slots foram mantidos com compat layer — funciona mas não é idiomático.

### Bits UI

```svelte
<script>
  import { Dialog } from 'bits-ui';
</script>
<Dialog.Root>
  <Dialog.Trigger>Abrir</Dialog.Trigger>
  <Dialog.Portal>
    <Dialog.Overlay />
    <Dialog.Content>
      <Dialog.Title>Confirmar</Dialog.Title>
      <Dialog.Description>...</Dialog.Description>
      <Dialog.Close>Fechar</Dialog.Close>
    </Dialog.Content>
  </Dialog.Portal>
</Dialog.Root>
```

**Vantagem**: Semântica perfeita; foco trap e aria-modal nativos. Fácil de encapsular
no wrapper `src/lib/components/ui/Dialog.svelte` sem vazamento de API.

---

## Esforço de migração

| Wrapper | Complexidade | flowbite-legacy que usa | Bits UI equivalente |
|---------|-------------|-------------------------|---------------------|
| Button | Baixa | Button | Personalizado (sem primitivo necessário) |
| Dialog | Média | Modal | Dialog.Root |
| Dropdown | Média | Dropdown | DropdownMenu.Root |
| Tooltip | Baixa | Tooltip | Tooltip.Root |
| Input | Baixa | Input | Personalizado (input nativo) |
| Checkbox | Baixa | Checkbox | Checkbox.Root |
| Tabs | Baixa | — (custom) | Tabs.Root |
| Badge | Baixa | Badge | Personalizado |
| Card | Nenhuma | — (custom) | Não precisa |
| DataTable | Nenhuma | — (custom) | Não precisa |

**Total estimado**: 6 componentes precisam de reescrita real, 4 são triviais, 
restantes (Card, DataTable, etc.) não precisam de nada.

---

## Decisão

### Escolha: **Bits UI como primitivo + wrappers customizados** (migração em F2-01)

**Justificativa**:

1. **Acessibilidade é requisito não-negociável** para SaaS B2B: Dialog com foco trap
   correto, Dropdown com navegação por teclado, Tooltip com ARIA.

2. **A camada de wrapper já existe** — os 700 `<Button>`, 68 `<Dialog>`, etc.
   importam de `$lib/components/ui/*`, não de Flowbite. Trocar o primitivo interno
   é cirurgia nos 28 wrappers, **não** nas 405 páginas.

3. **Flowbite 1.33 usa compat layer de slots** que gera warnings em Svelte 5 strict.
   A migração para `{#snippet}` seria necessária de qualquer forma.

4. **Eliminar flowbite-legacy** é obrigatório na reescrita independente da escolha.
   Flowbite 1.33 seria a alternativa, mas trocar legado por versão nova do mesmo
   projeto com API fragmentada não resolve a questão de acessibilidade.

5. **shadcn-svelte** (opção C) foi descartado porque gera conflito com os wrappers
   já existentes — dois sistemas de componentes no mesmo diretório é complexidade sem ganho.

### O que NÃO muda

- APIs externas dos wrappers (props, eventos, slots/snippets) — **zero breaking change**
- Tailwind como engine de estilo
- Design tokens em `app.css`
- `lucide-svelte` para ícones

### Plano de execução (F2-01)

1. `npm install bits-ui`
2. Migrar wrappers na ordem: Dialog → Dropdown → Tooltip → Checkbox → Tabs → Input
3. Button não precisa de primitivo headless (elemento `<button>` nativo + Tailwind)
4. Remover `src/lib/components/ui/flowbite-legacy/` inteiro
5. Remover `flowbite-svelte` e `flowbite-svelte-icons` do package.json

---

## Bundle size estimate

| Cenário | Estimativa gzip |
|---------|----------------|
| flowbite-svelte 1.33 (full) | ~45 KB |
| bits-ui 1.x (apenas componentes usados) | ~8-12 KB |
| Economia estimada | ~33 KB |

(Números aproximados — medir com `vite-bundle-visualizer` em F2-01)

---

## Referências

- [Bits UI — Getting Started](https://bits-ui.com/docs/getting-started)
- [Bits UI — Dialog](https://bits-ui.com/docs/components/dialog)
- [Flowbite Svelte 1.33 — Svelte 5 migration](https://flowbite-svelte.com/docs/pages/changelog)
- `docs/adr/ADR-003-ui-base-visual.md` — decisão formal atualizada
