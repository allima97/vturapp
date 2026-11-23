<script lang="ts">
  import { Helper, Label } from './flowbite-legacy';
  import { createEventDispatcher, onDestroy } from 'svelte';
  import type { Component, ComponentType, SvelteComponent } from 'svelte';
  import { uniqueFieldId } from './form/fieldId';
  import { formatFileSize } from '$lib/utils/formatters';

  type IconProps = { class?: string; size?: number | string };
  type IconComponent = Component<IconProps> | ComponentType<SvelteComponent<IconProps>>;

  export let label: string | null = null;
  export let title = 'Clique para escolher um arquivo';
  export let description: string | null = null;
  export let hint: string | null = null;
  export let files: FileList | undefined = undefined;
  export let accept: string | null = null;
  export let multiple = false;
  export let disabled = false;
  export let required = false;
  export let id: string | null = null;
  export let name: string | null = null;
  export let error: string | null = null;
  export let helper: string | null = null;
  export let icon: IconComponent | null = null;
  /** Tamanho máximo por arquivo (MB). Exceder gera erro de validação inline. */
  export let maxSizeMB: number | null = null;
  /** Exibe botão para remover o(s) arquivo(s) selecionado(s). */
  export let clearable = true;
  /** Exibe thumbnail de preview para arquivos de imagem. */
  export let showPreview = false;
  export let class_name = '';

  const dispatch = createEventDispatcher();

  let sizeError: string | null = null;
  let dragging = false;
  let previewUrls = new Map<string, string>();

  $: fieldId = id || uniqueFieldId(label);
  $: fileArray = files ? Array.from(files) : [];
  $: visibleError = error || sizeError;
  $: if (showPreview) syncPreviews(fileArray);

  function syncPreviews(current: File[]) {
    const keep = new Set<string>();
    for (const file of current) {
      if (!file.type.startsWith('image/')) continue;
      keep.add(file.name);
      if (!previewUrls.has(file.name)) {
        previewUrls.set(file.name, URL.createObjectURL(file));
      }
    }
    for (const [key, url] of previewUrls) {
      if (!keep.has(key)) {
        URL.revokeObjectURL(url);
        previewUrls.delete(key);
      }
    }
    previewUrls = previewUrls;
  }

  onDestroy(() => {
    for (const url of previewUrls.values()) URL.revokeObjectURL(url);
  });

  function validate(incoming: File[]): File[] {
    if (maxSizeMB === null) {
      sizeError = null;
      return incoming;
    }
    const maxBytes = maxSizeMB * 1024 * 1024;
    const accepted: File[] = [];
    const rejected: string[] = [];
    for (const file of incoming) {
      if (file.size <= maxBytes) accepted.push(file);
      else rejected.push(file.name);
    }
    sizeError =
      rejected.length > 0
        ? `${rejected.join(', ')}: tamanho acima do limite de ${maxSizeMB} MB.`
        : null;
    return accepted;
  }

  function toFileList(list: File[]): FileList | undefined {
    if (list.length === 0) return undefined;
    const dt = new DataTransfer();
    for (const file of list) dt.items.add(file);
    return dt.files;
  }

  function setFiles(list: File[], event?: Event) {
    files = toFileList(multiple ? [...fileArray, ...list] : list.slice(0, 1));
    dispatch('change', event);
  }

  function handleChange(event: Event) {
    const input = event.currentTarget as HTMLInputElement;
    const selected = validate(Array.from(input.files ?? []));
    setFiles(selected, event);
    input.value = '';
  }

  function handleDrop(event: DragEvent) {
    event.preventDefault();
    dragging = false;
    if (disabled) return;
    const dropped = validate(Array.from(event.dataTransfer?.files ?? []));
    setFiles(dropped, event);
  }

  function removeFile(fileName: string) {
    files = toFileList(fileArray.filter((file) => file.name !== fileName));
    sizeError = null;
    dispatch('change');
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
    class="vtur-upload-dropzone flex min-h-[44px] cursor-pointer items-center gap-3 px-4 py-2.5 {visibleError
      ? 'border-red-300 ring-1 ring-red-200'
      : ''} {dragging ? 'border-blue-400 ring-2 ring-blue-200' : ''} {disabled
      ? 'cursor-not-allowed opacity-60'
      : ''}"
    on:dragover|preventDefault={() => {
      if (!disabled) dragging = true;
    }}
    on:dragleave={() => (dragging = false)}
    on:drop={handleDrop}
  >
    {#if icon}
      <div class="vtur-upload-dropzone__icon shrink-0">
        <svelte:component this={icon} size={16} />
      </div>
    {/if}

    <div class="min-w-0 flex-1">
      <p class="vtur-upload-dropzone__title leading-tight">
        {#if fileArray.length > 0}
          {fileArray.length === 1
            ? fileArray[0].name
            : `${fileArray.length} arquivos selecionados`}
        {:else}
          {title}
        {/if}
      </p>
      {#if description && fileArray.length === 0}
        <p class="vtur-upload-dropzone__meta leading-tight">{description}</p>
      {/if}
      {#if hint && fileArray.length === 0}
        <p class="vtur-upload-dropzone__meta leading-tight">{hint}</p>
      {/if}
      {#if maxSizeMB !== null && fileArray.length === 0}
        <p class="vtur-upload-dropzone__meta leading-tight">Tamanho máximo: {maxSizeMB} MB</p>
      {/if}
    </div>

    <input
      id={fieldId}
      {name}
      type="file"
      {accept}
      {multiple}
      {disabled}
      {required}
      class="hidden"
      on:change={handleChange}
    />
  </label>

  {#if fileArray.length > 0}
    <ul class="mt-2 space-y-1">
      {#each fileArray as file (file.name)}
        <li
          class="flex items-center gap-2 rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 text-sm text-slate-600"
        >
          {#if showPreview && previewUrls.get(file.name)}
            <img
              src={previewUrls.get(file.name)}
              alt=""
              class="h-10 w-10 shrink-0 rounded-lg object-cover"
            />
          {/if}
          <span class="min-w-0 flex-1 truncate font-medium text-slate-700">{file.name}</span>
          <span class="shrink-0 text-xs text-slate-500">{formatFileSize(file.size)}</span>
          {#if clearable && !disabled}
            <button
              type="button"
              class="shrink-0 rounded-lg p-1.5 text-slate-400 transition-colors hover:bg-slate-200 hover:text-slate-600"
              aria-label="Remover {file.name}"
              on:click={() => removeFile(file.name)}
            >
              <svg
                class="h-4 w-4"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                stroke-width="2"
                stroke-linecap="round"
                aria-hidden="true"
              >
                <path d="M18 6 6 18M6 6l12 12" />
              </svg>
            </button>
          {/if}
        </li>
      {/each}
    </ul>
  {/if}

  {#if visibleError}
    <Helper class="mt-1 text-red-600" aria-live="polite">{visibleError}</Helper>
  {:else if helper}
    <Helper class="mt-1 text-slate-500">{helper}</Helper>
  {/if}
</div>
