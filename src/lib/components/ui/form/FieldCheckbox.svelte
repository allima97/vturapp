<script lang="ts">
  import { Checkbox, Helper } from '../flowbite-legacy';
  import { uniqueFieldId } from './fieldId';

  type FieldCheckboxBaseColor = 'blue' | 'green' | 'red' | 'yellow' | 'purple' | 'teal' | 'orange';
  type FieldCheckboxColor =
    | FieldCheckboxBaseColor
    | 'crm'
    | 'clientes'
    | 'vendas'
    | 'financeiro'
    | 'operacao'
    | 'orcamentos'
    | 'comissoes';

  export let label: string | null = null;
  export let checked = false;
  export let disabled = false;
  export let required = false;
  export let error: string | null = null;
  export let helper: string | null = null;
  export let id: string | null = null;
  export let name: string | null = null;
  export let value = 'on';
  export let align: 'start' | 'center' = 'start';
  export let color: FieldCheckboxColor = 'blue';
  export let class_name = '';

  const colorAlias: Record<FieldCheckboxColor, FieldCheckboxBaseColor> = {
    blue: 'blue',
    green: 'green',
    red: 'red',
    yellow: 'yellow',
    purple: 'purple',
    teal: 'teal',
    orange: 'orange',
    crm: 'purple',
    clientes: 'blue',
    orcamentos: 'blue',
    vendas: 'green',
    financeiro: 'orange',
    operacao: 'teal',
    comissoes: 'orange'
  };

  $: fieldId = id || uniqueFieldId(label);
  $: describedById = error || helper ? `${fieldId}-desc` : undefined;
  $: resolvedColor = colorAlias[color] || 'blue';
  $: containerAlignClass = align === 'center' ? 'items-center' : 'items-start';
  $: labelWrapperClass = align === 'center' ? 'min-w-0' : 'min-w-0 pt-0.5';
</script>

<div class={class_name}>
  <div class={`flex gap-3 ${containerAlignClass}`}>
    <Checkbox
      id={fieldId}
      {name}
      {value}
      bind:checked
      {disabled}
      {required}
      color={resolvedColor}
      aria-invalid={error ? 'true' : undefined}
      aria-describedby={describedById}
      class={error ? 'text-red-600 focus:ring-red-200' : ''}
      on:change
      on:blur
      on:focus
      on:click
    />

    <div class={labelWrapperClass}>
      {#if label}
        <label for={fieldId} class="block cursor-pointer text-sm font-medium text-slate-700">
          {label}
        </label>
      {/if}

      {#if error}
        <Helper id={describedById} class="mt-1 text-red-600">{error}</Helper>
      {:else if helper}
        <Helper id={describedById} class="mt-1 text-slate-500">{helper}</Helper>
      {/if}
    </div>
  </div>
</div>
