<script lang="ts">
  import { Label, Select, Helper } from '../flowbite-legacy';
  import { buildVturInputClasses } from '../inputContract';
  import { formatYearMonthLabel } from '$lib/utils/formatters';
  import { uniqueFieldId } from './fieldId';

  const YEAR_MONTH_OPTION_RE = /^\d{4}-(0[1-9]|1[0-2])$/;

  export let label: string | null = null;
  export let srLabel = false;
  export let value: string = '';
  export let options: Array<{ value: string; label: string; disabled?: boolean }> = [];
  export let placeholder: string | null = 'Selecione uma opção';
  export let required = false;
  export let disabled = false;
  export let error: string | null = null;
  export let helper: string | null = null;
  export let id: string | null = null;
  export let name: string | null = null;
  export let class_name = '';
  /** Fase 5.2: nome para leitor de tela quando não há `label` visível. */
  export let ariaLabel: string | null = null;

  $: fieldId = id || uniqueFieldId(label);
  $: describedById = error || helper ? `${fieldId}-desc` : undefined;
  $: selectClasses = buildVturInputClasses(
    'text-sm',
    error ? 'border-red-400 focus:border-red-500 focus:ring-red-200' : 'focus:ring-blue-200'
  );
  $: selectPlaceholder = placeholder === null ? '' : (placeholder ?? undefined);
  $: normalizedOptions = options.map((option) => {
    const rawLabel = String(option?.label ?? '');
    const formattedLabel = YEAR_MONTH_OPTION_RE.test(rawLabel)
      ? formatYearMonthLabel(rawLabel)
      : rawLabel;

    return {
      ...option,
      label: formattedLabel
    };
  });
</script>

<div class={class_name}>
  {#if label}
    <Label
      for={fieldId}
      class={srLabel ? 'sr-only' : 'mb-1.5 block text-sm font-medium text-slate-700'}
    >
      {label}{#if required}<span class="ml-0.5 text-red-500" aria-hidden="true">*</span>{/if}
    </Label>
  {/if}

  <Select
    id={fieldId}
    {name}
    bind:value
    {disabled}
    {required}
    placeholder={selectPlaceholder}
    aria-invalid={error ? 'true' : undefined}
    aria-describedby={describedById}
    aria-label={label ? undefined : (ariaLabel ?? undefined)}
    class={selectClasses}
    on:change
    on:blur
  >
    {#each normalizedOptions as option}
      <option value={option.value} disabled={option.disabled}>{option.label}</option>
    {/each}
  </Select>

  {#if error}
    <Helper id={describedById} class="mt-1 text-red-600">{error}</Helper>
  {:else if helper}
    <Helper id={describedById} class="mt-1 text-slate-500">{helper}</Helper>
  {/if}
</div>
