<script lang="ts">
  import { Helper, Toggle } from '../flowbite-legacy';
  import { uniqueFieldId } from './fieldId';

  type FieldToggleBaseColor = 'blue' | 'green' | 'red' | 'yellow' | 'purple' | 'teal' | 'orange';
  type FieldToggleColor =
    | FieldToggleBaseColor
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
  export let id: string | null = null;
  export let name: string | null = null;
  export let helper: string | null = null;
  export let error: string | null = null;
  export let size: 'small' | 'default' | 'large' = 'default';
  export let color: FieldToggleColor = 'blue';
  export let class_name = '';
  /** Fase 5.2: nome para leitor de tela quando não há `label` visível. */
  export let ariaLabel: string | null = null;

  const colorAlias: Record<FieldToggleColor, FieldToggleBaseColor> = {
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
</script>

<div class={class_name}>
  <div
    class="flex items-start justify-between gap-4 rounded-xl border border-slate-200 bg-white px-4 py-3"
  >
    <div class="min-w-0">
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

    <Toggle
      id={fieldId}
      {name}
      {checked}
      {disabled}
      {size}
      color={resolvedColor}
      aria-invalid={error ? 'true' : undefined}
      aria-describedby={describedById}
      aria-label={label ? undefined : (ariaLabel ?? undefined)}
      on:change
      on:blur
      on:focus
      on:click
    />
  </div>
</div>
