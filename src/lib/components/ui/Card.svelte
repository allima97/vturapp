<script lang="ts">
  type CardColor =
    | 'default'
    | 'blue'
    | 'green'
    | 'orange'
    | 'teal'
    | 'purple'
    | 'crm'
    | 'clientes'
    | 'vendas'
    | 'financeiro'
    | 'operacao'
    | 'orcamentos'
    | 'comissoes';
  type CardPadding = 'none' | 'sm' | 'md' | 'lg';

  /*
   * Card — visual limpo e uniforme.
   * A prop `color` é mantida para não quebrar nenhum uso existente,
   * mas não gera mais accent bar colorida. Todos os cards têm a mesma
   * borda sutil em slate, sem variação por módulo.
   */
  export let title: string | null = null;
  export let header: string | null = null;
  export let subtitle: string | null = null;
  export let color: CardColor = 'default';
  export let padding: CardPadding = 'md';
  export let collapsible = false;
  let expanded = false;

  $: color;

  const paddingClasses: Record<CardPadding, string> = {
    none: 'p-0',
    sm: 'p-4',
    md: 'p-5',
    lg: 'p-6'
  };
</script>

<!--
  Card limpo: sem barra colorida no topo, borda uniforme slate, header neutro.
  A prop color permanece aceita (compatibilidade) sem efeito visual diferenciado.
-->
<div class="vtur-card {$$props.class || ''}">
  {#if title || header || subtitle}
    <div class:card-header-open={!collapsible || expanded}>
      {#if collapsible}
        <button
          type="button"
          class="flex w-full items-center justify-between gap-3 px-5 py-4 text-left focus-visible:outline-2 focus-visible:outline-blue-500"
          aria-expanded={expanded}
          on:click={() => (expanded = !expanded)}
        >
          <span>
            <span class="block text-sm font-semibold tracking-tight text-slate-800"
              >{title || header}</span
            >
            {#if subtitle}
              <span class="mt-1 block text-xs text-slate-500">{subtitle}</span>
            {/if}
          </span>
          <span class="text-xl leading-none text-slate-600" aria-hidden="true"
            >{expanded ? '−' : '+'}</span
          >
        </button>
      {:else}
        <div class="flex flex-wrap items-center justify-between gap-3 px-5 py-4">
          <div>
            {#if title || header}
              <h3 class="text-sm font-semibold tracking-tight text-slate-800">{title || header}</h3>
            {/if}
            {#if subtitle}
              <p class="mt-1 text-xs text-slate-500">{subtitle}</p>
            {/if}
          </div>
          <slot name="actions" />
        </div>
      {/if}
    </div>
  {/if}
  <div class={paddingClasses[padding] ?? paddingClasses.md} hidden={collapsible && !expanded}>
    <slot />
  </div>
</div>

<style>
  .card-header-open {
    border-bottom: 1px solid var(--color-slate-100, #f1f5f9);
  }
</style>
