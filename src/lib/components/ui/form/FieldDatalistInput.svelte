<script lang="ts">
  import { uniqueCleanStrings } from '$lib/utils/array';
  import type { Component, ComponentType, SvelteComponent } from 'svelte';
  import FieldInput from './FieldInput.svelte';
  import { uniqueFieldId } from './fieldId';

  type IconProps = { class?: string; size?: number | string };
  type IconComponent = Component<IconProps> | ComponentType<SvelteComponent<IconProps>>;

  export let label: string | null = null;
  export let value = '';
  export let options: string[] = [];
  export let placeholder = '';
  export let type: 'text' | 'email' | 'password' | 'number' | 'date' | 'tel' | 'time' | 'url' =
    'text';
  export let required = false;
  export let disabled = false;
  export let readonly = false;
  export let error: string | null = null;
  export let helper: string | null = null;
  export let icon: IconComponent | null = null;
  export let id: string | null = null;
  export let name: string | null = null;
  export let min: string | null = null;
  export let max: string | null = null;
  export let step: string | null = null;
  export let maxlength: number | null = null;
  export let class_name = '';
  export let listId: string | null = null;

  $: fieldId = id || uniqueFieldId(label);
  $: resolvedListId = listId || (fieldId ? `${fieldId}-list` : undefined);
  $: normalizedOptions = uniqueCleanStrings(options);
</script>

<div class={class_name}>
  <FieldInput
    {label}
    bind:value
    {placeholder}
    {type}
    {required}
    {disabled}
    {readonly}
    {error}
    {helper}
    {icon}
    id={fieldId}
    {name}
    list={resolvedListId ?? null}
    {min}
    {max}
    {step}
    {maxlength}
    on:input
    on:change
    on:blur
    on:focus
  />

  {#if resolvedListId && normalizedOptions.length > 0}
    <datalist id={resolvedListId}>
      {#each normalizedOptions as option}
        <option value={option}></option>
      {/each}
    </datalist>
  {/if}
</div>
