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
    <div
      class="flex flex-wrap items-center justify-between gap-3 border-b border-slate-100 px-5 py-4"
    >
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
  <div class={paddingClasses[padding] ?? paddingClasses.md}>
    <slot />
  </div>
</div>
