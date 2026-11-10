<script lang="ts">
  import { Badge as FlowbiteBadge } from './flowbite-legacy';

  type BadgeColor =
    | 'gray'
    | 'dark'
    | 'blue'
    | 'green'
    | 'yellow'
    | 'red'
    | 'purple'
    | 'pink'
    | 'indigo'
    | 'teal'
    | 'operacao'
    | 'clientes'
    | 'vendas'
    | 'financeiro'
    | 'orcamentos'
    | 'comissoes';
  type FlowbiteBadgeColor =
    | 'gray'
    | 'dark'
    | 'blue'
    | 'green'
    | 'yellow'
    | 'red'
    | 'purple'
    | 'pink'
    | 'indigo'
    | 'teal';
  type FlowbiteBadgePropColor =
    | 'none'
    | 'primary'
    | 'blue'
    | 'green'
    | 'red'
    | 'yellow'
    | 'purple'
    | 'dark'
    | 'indigo'
    | 'pink'
    | undefined;
  type BadgeSize = 'sm' | 'md';

  export let color: BadgeColor = 'gray';
  export let size: BadgeSize = 'md';
  export let dot = false;
  export let outline = false;
  export let className = '';

  // Módulos → flowbite-svelte Badge cores
  const colorAlias: Partial<Record<BadgeColor, FlowbiteBadgeColor>> = {
    operacao: 'teal',
    clientes: 'blue',
    orcamentos: 'blue',
    vendas: 'green',
    financeiro: 'yellow',
    comissoes: 'yellow'
  };

  const sizeClasses: Record<BadgeSize, string> = {
    sm: 'px-2 py-0.5 text-xs',
    md: 'px-2.5 py-1 text-xs'
  };

  $: resolvedColor = (colorAlias[color] || color) as FlowbiteBadgeColor;
</script>

<FlowbiteBadge
  color={resolvedColor as FlowbiteBadgePropColor}
  border={outline}
  rounded
  class="{sizeClasses[size]} font-medium {className} inline-flex items-center gap-1"
>
  {#if dot}
    <span class="mr-0.5 inline-block h-1.5 w-1.5 rounded-full bg-current opacity-80"></span>
  {/if}
  <slot />
</FlowbiteBadge>
