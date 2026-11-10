<script lang="ts">
  import { Helper, Label, Radio } from '../flowbite-legacy';
  import { uniqueFieldId } from './fieldId';

  export let label: string | null = null;
  export let value = '';
  export let options: Array<{ value: string; label: string; disabled?: boolean }> = [];
  export let required = false;
  export let disabled = false;
  export let error: string | null = null;
  export let helper: string | null = null;
  export let id: string | null = null;
  export let name: string | null = null;
  export let orientation: 'row' | 'column' = 'row';
  export let class_name = '';

  $: fieldId = id || uniqueFieldId(label);
  $: labelId = `${fieldId}-label`;
  $: describedById = error || helper ? `${fieldId}-desc` : undefined;
</script>

<div class={class_name}>
  {#if label}
    <Label id={labelId} class="mb-1.5 block text-sm font-medium text-slate-700">
      {label}{#if required}<span class="ml-0.5 text-red-500" aria-hidden="true">*</span>{/if}
    </Label>
  {/if}

  <div
    role="radiogroup"
    aria-labelledby={label ? labelId : undefined}
    aria-required={required ? 'true' : undefined}
    aria-invalid={error ? 'true' : undefined}
    aria-describedby={describedById}
    class={`rounded-vtur-lg border px-4 py-3 ${error ? 'border-red-300 bg-red-50/40' : 'border-slate-200 bg-slate-50'} ${orientation === 'column' ? 'space-y-3' : 'flex flex-wrap gap-4'}`}
  >
    {#each options as option, index}
      <label class="flex items-center gap-2 text-sm text-slate-700">
        <Radio
          id={`${fieldId || name || 'radio'}-${index}`}
          {name}
          bind:group={value}
          value={option.value}
          aria-label={option.label}
          disabled={disabled || option.disabled}
          class={error ? 'text-red-600 focus:ring-red-200' : ''}
          on:change
          on:blur
        />
        <span>{option.label}</span>
      </label>
    {/each}
  </div>

  {#if error}
    <Helper id={describedById} class="mt-1 text-red-600">{error}</Helper>
  {:else if helper}
    <Helper id={describedById} class="mt-1 text-slate-500">{helper}</Helper>
  {/if}
</div>
