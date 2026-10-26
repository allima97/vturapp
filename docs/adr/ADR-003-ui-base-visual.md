# ADR-003 — Base visual e componentes de UI

**Estado:** ✅ DECIDIDO (F1-06 — 2026-10-26)  
**Data:** 2026-10-26

## Contexto

A aplicação tem 405 arquivos `.svelte`, 28 wrappers customizados em
`src/lib/components/ui/` que encapsulam Flowbite 0.48.6 (copiado em
`flowbite-legacy/`) e Flowbite Svelte 1.33.1. A camada de wrapper isola
os consumidores: 700+ usages de `<Button>`, 287 de `<Card>`, 68 de `<Dialog>`
importam de `$lib/components/ui/*` — nunca de Flowbite diretamente.

## Decisão

**Bits UI como primitivo headless** para os wrappers que precisam de
comportamento interativo (Dialog, Dropdown, Tooltip, Checkbox, Tabs).
Componentes puramente visuais (Button, Badge, Card) usam apenas elemento HTML
nativo + classes Tailwind.

**Nenhuma lib de UI aparece nos imports das páginas** — apenas os wrappers
`$lib/components/ui/*`.

## Consequências

### O que muda em F2-01
- Reescrever internals de 6 wrappers: Dialog, Dropdown, Tooltip, Checkbox, Tabs, Input
- Remover `src/lib/components/ui/flowbite-legacy/` (Flowbite 0.48.6)
- Remover dependências: `flowbite-svelte`, `flowbite-svelte-icons`
- Adicionar: `bits-ui@^1.x`

### O que NÃO muda
- APIs externas dos wrappers (props, snippets, eventos)
- Tailwind 4 como engine de estilo
- `lucide-svelte` para ícones
- Design tokens em `app.css`

### Por que Bits UI e não Flowbite 1.33.1
- Flowbite 1.33 usa compat layer de slots (Svelte 4) que gera warnings em Svelte 5 strict
- Bits UI tem primitivos de acessibilidade nativos (foco trap, aria-modal, navegação teclado)
- Acessibilidade é requisito não-negociável para SaaS B2B com suporte a NVDA/VoiceOver

### Por que não shadcn-svelte
- Geraria conflito com os wrappers existentes (dois sistemas no mesmo diretório)
- shadcn-svelte usa Bits UI como primitivo — o projeto prefere a camada primitive diretamente

## Alternativas rejeitadas

| Alternativa | Motivo da rejeição |
|-------------|-------------------|
| Flowbite Svelte 1.33.1 | Slots Svelte 4 com compat layer; a11y limitada |
| shadcn-svelte | Conflito com wrappers existentes; camada extra desnecessária |
| Manter flowbite-legacy | Svelte 4 incompatível com Svelte 5 strict mode |

## Referências

- `docs/f1/F1-06-ui-base-visual.md` — análise completa com métricas e comparação
