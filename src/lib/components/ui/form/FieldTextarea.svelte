<script lang="ts">
  import { Helper, Label, Textarea } from '../flowbite-legacy';
  import { buildVturInputClasses } from '../inputContract';
  import { uniqueFieldId } from './fieldId';

  export let label: string | null = null;
  export let value = '';
  export let placeholder = '';
  export let required = false;
  export let disabled = false;
  export let readonly = false;
  export let error: string | null = null;
  export let helper: string | null = null;
  export let id: string | null = null;
  export let name: string | null = null;
  export let rows = 4;
  export let monospace = false;
  export let resize: 'none' | 'vertical' | 'both' = 'vertical';
  export let class_name = '';

  const resizeClasses: Record<typeof resize, string> = {
    none: 'resize-none',
    vertical: 'resize-y',
    both: 'resize'
  };

  $: fieldId = id || uniqueFieldId(label);
  $: describedById = error || helper ? `${fieldId}-desc` : undefined;
  $: textareaClasses = buildVturInputClasses(
    'text-sm',
    resizeClasses[resize],
    monospace ? 'font-mono text-xs leading-5' : '',
    error ? 'border-red-400 focus:border-red-500 focus:ring-red-200' : 'focus:ring-blue-200'
  );
</script>

<div class={class_name}>
  {#if label}
    <Label for={fieldId} class="mb-1.5 block text-sm font-medium text-slate-700">
      {label}{#if required}<span class="ml-0.5 text-red-500" aria-hidden="true">*</span>{/if}
    </Label>
  {/if}

  <Textarea
    id={fieldId}
    {name}
    bind:value
    {placeholder}
    {disabled}
    {required}
    {readonly}
    {rows}
    aria-invalid={error ? 'true' : undefined}
    aria-describedby={describedById}
    class={textareaClasses}
    on:input
    on:change
    on:blur
    on:focus
  />

  {#if error}
    <Helper id={describedById} class="mt-1 text-red-600">{error}</Helper>
  {:else if helper}
    <Helper id={describedById} class="mt-1 text-slate-500">{helper}</Helper>
  {/if}
</div>
