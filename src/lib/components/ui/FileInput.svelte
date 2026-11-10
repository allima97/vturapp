<script lang="ts">
  import { Fileupload, Helper, Label } from './flowbite-legacy';
  import { uniqueFieldId } from './form/fieldId';

  export let label: string | null = null;
  export let files: FileList | undefined = undefined;
  export let accept: string | null = null;
  export let multiple = false;
  export let disabled = false;
  export let required = false;
  export let clearable = true;
  export let helper: string | null = null;
  export let error: string | null = null;
  export let id: string | null = null;
  export let name: string | null = null;
  export let size: 'sm' | 'md' | 'lg' = 'md';
  export let class_name = '';

  $: fieldId = id || uniqueFieldId(label);
  $: fileNames = files ? Array.from(files).map((file) => file.name) : [];
</script>

<div class={class_name}>
  {#if label}
    <Label for={fieldId} class="mb-1.5 block text-sm font-medium text-slate-700">
      {label}{#if required}<span class="ml-0.5 text-red-500">*</span>{/if}
    </Label>
  {/if}

  <Fileupload
    id={fieldId}
    {name}
    bind:files
    {accept}
    {multiple}
    {disabled}
    {required}
    {clearable}
    {size}
    class={error ? 'border-red-400 focus:border-red-500 focus:ring-red-200' : ''}
    on:change
    on:blur
    on:focus
    on:click
  />

  {#if fileNames.length > 0}
    <div
      class="mt-2 rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 text-sm text-slate-600"
    >
      {#if fileNames.length === 1}
        <span class="font-medium text-slate-700">{fileNames[0]}</span>
      {:else}
        <div class="space-y-1">
          {#each fileNames as fileName}
            <div class="truncate">{fileName}</div>
          {/each}
        </div>
      {/if}
    </div>
  {/if}

  {#if error}
    <Helper class="mt-1 text-red-600">{error}</Helper>
  {:else if helper}
    <Helper class="mt-1 text-slate-500">{helper}</Helper>
  {/if}
</div>
