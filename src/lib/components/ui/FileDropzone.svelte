<script lang="ts">
  import { Helper, Label } from './flowbite-legacy';
  import { createEventDispatcher } from 'svelte';
  import type { Component, ComponentType, SvelteComponent } from 'svelte';
  import { uniqueFieldId } from './form/fieldId';

  type IconProps = { class?: string; size?: number | string };
  type IconComponent = Component<IconProps> | ComponentType<SvelteComponent<IconProps>>;

  export let label: string | null = null;
  export let title = 'Clique para escolher um arquivo';
  export let description: string | null = null;
  export let hint: string | null = null;
  export let files: FileList | undefined = undefined;
  export let accept: string | null = null;
  export let disabled = false;
  export let required = false;
  export let id: string | null = null;
  export let name: string | null = null;
  export let error: string | null = null;
  export let helper: string | null = null;
  export let icon: IconComponent | null = null;
  export let class_name = '';

  const dispatch = createEventDispatcher();

  $: fieldId = id || uniqueFieldId(label);
  $: fileNames = files ? Array.from(files).map((file) => file.name) : [];

  function handleChange(event: Event) {
    const input = event.currentTarget as HTMLInputElement;
    files = input.files ?? undefined;
    dispatch('change', event);
  }
</script>

<div class={class_name}>
  {#if label}
    <Label for={fieldId} class="mb-1.5 block text-sm font-medium text-slate-700">
      {label}{#if required}<span class="ml-0.5 text-red-500">*</span>{/if}
    </Label>
  {/if}

  <label
    for={fieldId}
    class="vtur-upload-dropzone flex cursor-pointer items-center gap-3 px-4 py-2.5 {error
      ? 'border-red-300 ring-1 ring-red-200'
      : ''} {disabled ? 'cursor-not-allowed opacity-60' : ''}"
  >
    {#if icon}
      <div class="vtur-upload-dropzone__icon shrink-0">
        <svelte:component this={icon} size={16} />
      </div>
    {/if}

    <div class="min-w-0">
      <p class="vtur-upload-dropzone__title leading-tight">
        {#if fileNames.length > 0}
          {fileNames.join(', ')}
        {:else}
          {title}
        {/if}
      </p>
      {#if description && fileNames.length === 0}
        <p class="vtur-upload-dropzone__meta leading-tight">{description}</p>
      {/if}
      {#if hint && fileNames.length === 0}
        <p class="vtur-upload-dropzone__meta leading-tight">{hint}</p>
      {/if}
    </div>

    <input
      id={fieldId}
      {name}
      type="file"
      {accept}
      {disabled}
      {required}
      class="hidden"
      on:change={handleChange}
    />
  </label>

  {#if error}
    <Helper class="mt-1 text-red-600">{error}</Helper>
  {:else if helper}
    <Helper class="mt-1 text-slate-500">{helper}</Helper>
  {/if}
</div>
