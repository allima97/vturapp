<script lang="ts">
  import { onDestroy } from 'svelte';
  import { apiGet } from '$lib/services/api';

  export let id = '';
  export let label = 'Cidade de destino';
  export let value: string | null | undefined = '';
  export let placeholder = 'Digite e selecione a cidade';
  export let required = false;
  export let disabled = false;
  export let class_name = '';
  export let endpoint = '/api/v1/orcamentos/cidades-busca';
  export let onSelect: ((city: string | null) => void) | undefined = undefined;
  export let onInput: ((city: string) => void) | undefined = undefined;
  export let exigirSelecao = false;

  let items: string[] = [];
  let open = false;
  let loading = false;
  let searchError = false;
  let selected = false;
  let committedValue = value;
  let timer: ReturnType<typeof setTimeout> | null = null;
  let sequence = 0;
  let precisaSelecionar = false;
  $: if (!open && value !== committedValue) {
    committedValue = value;
    selected = false;
    onSelect?.(null);
  }

  async function search(query: string) {
    const current = ++sequence;
    if (query.trim().length < (exigirSelecao ? 2 : 3)) {
      items = [];
      loading = false;
      searchError = false;
      return;
    }
    loading = true;
    searchError = false;
    try {
      const payload = await apiGet<Array<{ nome?: string; label?: string }>>(endpoint, {
        q: query.trim(),
        limite: 8
      });
      if (current !== sequence) return;
      items = [
        ...new Set(
          (Array.isArray(payload) ? payload : [])
            .map((item) => String(item.label || item.nome || '').trim())
            .filter(Boolean)
        )
      ];
    } catch {
      if (current === sequence) {
        items = [];
        searchError = true;
      }
    } finally {
      if (current === sequence) loading = false;
    }
  }

  function handleInput(event: Event) {
    value = (event.currentTarget as HTMLInputElement).value;
    onInput?.(value);
    selected = false;
    precisaSelecionar = exigirSelecao && Boolean(value.trim());
    onSelect?.(null);
    open = true;
    if (timer) clearTimeout(timer);
    sequence++;
    items = [];
    searchError = false;
    timer = setTimeout(() => void search(value || ''), 300);
  }

  function choose(city: string) {
    value = city;
    selected = true;
    precisaSelecionar = false;
    committedValue = city;
    open = false;
    items = [];
    onSelect?.(city);
  }

  function handleBlur() {
    setTimeout(() => {
      open = false;
      if (!exigirSelecao && !selected && value !== committedValue) value = '';
    }, 120);
  }

  onDestroy(() => {
    if (timer) clearTimeout(timer);
    sequence++;
  });
</script>

<div class={`relative ${class_name}`}>
  <label for={id} class="mb-1 block text-sm font-medium text-slate-700"
    >{label}{required ? ' *' : ''}</label
  >
  <input
    {id}
    bind:value
    on:input={handleInput}
    on:focus={() => (open = true)}
    on:blur={handleBlur}
    {placeholder}
    {required}
    {disabled}
    autocomplete="off"
    aria-invalid={precisaSelecionar ? 'true' : undefined}
    data-roteiro-cidade-pendente={exigirSelecao && precisaSelecionar ? 'true' : undefined}
    class="w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 shadow-sm outline-none focus:border-indigo-500 focus:ring-2 focus:ring-indigo-200 disabled:cursor-not-allowed disabled:bg-slate-100"
  />
  {#if precisaSelecionar}
    <p class="mt-1 text-xs text-red-600" role="alert">
      Selecione uma cidade cadastrada na lista de sugestões.
    </p>
  {/if}
  {#if open && (value || '').trim().length >= (exigirSelecao ? 2 : 3)}
    <div
      class="absolute z-50 mt-1 max-h-72 w-full overflow-auto rounded-lg border border-slate-200 bg-white shadow-lg"
    >
      {#if loading}<div class="px-3 py-2 text-sm text-slate-500">Buscando cidades...</div>
      {:else if searchError}<div class="px-3 py-2 text-sm text-red-600">
          Não foi possível buscar cidades. Tente novamente.
        </div>
      {:else if items.length}<ul>
          {#each items as city}<li>
              <button
                type="button"
                class="w-full px-3 py-2 text-left text-sm hover:bg-slate-50 focus:bg-slate-50"
                on:mousedown|preventDefault={() => choose(city)}
                on:click={(event) => {
                  if (event.detail === 0) choose(city);
                }}>{city}</button
              >
            </li>{/each}
        </ul>
      {:else}<div class="px-3 py-2 text-sm text-slate-500">
          Nenhuma cidade encontrada. Tente incluir estado ou país.
        </div>{/if}
    </div>
  {/if}
</div>
