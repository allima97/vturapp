<script lang="ts">
  import Card from './Card.svelte';

  export let title: string = 'Filtros';
  export let color:
    | 'default'
    | 'blue'
    | 'green'
    | 'orange'
    | 'teal'
    | 'clientes'
    | 'vendas'
    | 'financeiro'
    | 'operacao'
    | 'orcamentos'
    | 'comissoes' = 'financeiro';
  export let className = 'mb-6';
  export let fieldsClass = 'grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-6';
</script>

<div class={className}>
  <Card header={title} {color}>
    <div class="flex flex-col items-end gap-4 lg:flex-row">
      <div class={`flex-1 ${fieldsClass}`.trim()}>
        <slot />
      </div>
      <div class="shrink-0">
        <slot name="actions" />
      </div>
    </div>
  </Card>
</div>
