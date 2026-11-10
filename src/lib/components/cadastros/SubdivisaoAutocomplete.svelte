<script lang="ts">
  import { createEventDispatcher, onDestroy } from 'svelte';
  import FieldInput from '$lib/components/ui/form/FieldInput.svelte';
  import { apiGet } from '$lib/services/api';

  type SubdivisaoOption = {
    id: string;
    nome: string;
    pais_id?: string | null;
    pais?: { id?: string; nome: string } | null;
  };

  type SubdivisoesListResponse = {
    items?: SubdivisaoOption[];
  };

  const dispatch = createEventDispatcher<{
    select: SubdivisaoOption;
  }>();

  export let id = '';
  export let label = 'Estado/Província';
  export let placeholder = 'Digite para buscar...';
  export let value = '';
  export let disabled = false;
  export let required = false;
  export let error: string | null = null;
  export let helper: string | null = null;
  export let minChars = 2;
  export let maxResults = 30;

  let searchText = '';
  let open = false;
  let loading = false;
  let activeIndex = -1;
  let results: SubdivisaoOption[] = [];
  let searchTimer: ReturnType<typeof setTimeout> | null = null;
  let blurTimer: ReturnType<typeof setTimeout> | null = null;
  let ensuringId = '';
  let currentQuery = '';

  const DIACRITICS_RE = /[\u0300-\u036f]/g;
  const PT_BR_BASE_COLLATOR = new Intl.Collator('pt-BR', { sensitivity: 'base' });

  function normalizeLookup(input: string | null | undefined) {
    return String(input || '')
      .normalize('NFD')
      .replace(DIACRITICS_RE, '')
      .toLowerCase()
      .trim();
  }

  function getOptionLabel(option: SubdivisaoOption) {
    const nome = String(option?.nome || '').trim();
    const pais = String(option?.pais?.nome || '').trim();
    return pais ? `${nome} · ${pais}` : nome;
  }

  function getOptionScore(option: SubdivisaoOption, input: string) {
    const query = normalizeLookup(input);
    if (!query) return 100;

    const nome = normalizeLookup(option.nome);
    const pais = normalizeLookup(option.pais?.nome);
    const full = `${nome} ${pais}`.trim();

    if (nome === query) return 0;
    if (nome.startsWith(query)) return 1;
    if (full.startsWith(query)) return 2;
    if (pais && pais.startsWith(query)) return 3;
    if (full.includes(query)) return 4;
    return 10;
  }

  function sortOptions(items: SubdivisaoOption[], input: string) {
    return [...items].sort((a, b) => {
      const scoreDiff = getOptionScore(a, input) - getOptionScore(b, input);
      if (scoreDiff !== 0) return scoreDiff;

      const nomeDiff = PT_BR_BASE_COLLATOR.compare(String(a.nome || ''), String(b.nome || ''));
      if (nomeDiff !== 0) return nomeDiff;

      return PT_BR_BASE_COLLATOR.compare(String(a.pais?.nome || ''), String(b.pais?.nome || ''));
    });
  }

  function uniqueOptions(items: SubdivisaoOption[]) {
    const byId = new Map<string, SubdivisaoOption>();
    for (const item of items) {
      const itemId = String(item?.id || '').trim();
      if (!itemId) continue;
      byId.set(itemId, { ...(byId.get(itemId) || {}), ...item });
    }
    return Array.from(byId.values());
  }

  function hasOptionId(payload: unknown): payload is SubdivisaoOption {
    return Boolean(
      payload &&
      typeof payload === 'object' &&
      String((payload as { id?: unknown }).id || '').trim()
    );
  }

  function getSelectedOption() {
    return uniqueOptions(results).find((item) => String(item.id) === String(value)) || null;
  }

  function selectOption(option: SubdivisaoOption) {
    value = String(option.id || '');
    searchText = getOptionLabel(option);
    results = uniqueOptions([option, ...results]);
    activeIndex = -1;
    open = false;
    dispatch('select', option);
  }

  async function ensureSelectedLoaded(subdivisaoId: string) {
    const idValue = String(subdivisaoId || '').trim();
    if (!idValue || ensuringId === idValue || getSelectedOption()) return;

    ensuringId = idValue;
    try {
      const payload = await apiGet<SubdivisaoOption>('/api/v1/subdivisoes', { id: idValue });
      if (!hasOptionId(payload)) return;
      results = uniqueOptions([payload, ...results]);
      if (!open) {
        searchText = getOptionLabel(payload);
      }
    } catch {
      // Mantemos o campo utilizavel mesmo sem conseguir prefetch do registro atual.
    } finally {
      if (ensuringId === idValue) ensuringId = '';
    }
  }

  async function searchOptions(term: string) {
    const query = term.trim();
    currentQuery = query;

    if (query.length < minChars) {
      loading = false;
      results = value ? results.filter((item) => String(item.id) === String(value)) : [];
      activeIndex = -1;
      return;
    }

    loading = true;
    try {
      const payload = await apiGet<SubdivisoesListResponse>('/api/v1/subdivisoes', {
        q: query,
        page: 1,
        pageSize: maxResults
      });
      if (currentQuery !== query) return;
      const items = Array.isArray(payload?.items) ? payload.items : [];
      results = uniqueOptions([
        ...(value ? results.filter((item) => String(item.id) === String(value)) : []),
        ...sortOptions(items, query)
      ]);
      activeIndex = results.length > 0 ? 0 : -1;
    } catch {
      if (currentQuery !== query) return;
      results = value ? results.filter((item) => String(item.id) === String(value)) : [];
      activeIndex = -1;
    } finally {
      if (currentQuery === query) loading = false;
    }
  }

  function resolveTypedValue() {
    const typed = searchText.trim();
    if (!typed) {
      value = '';
      results = [];
      return;
    }

    const normalized = normalizeLookup(typed);
    const exact = uniqueOptions(results).find((item) => {
      return (
        normalizeLookup(item.nome) === normalized ||
        normalizeLookup(getOptionLabel(item)) === normalized
      );
    });

    if (exact) {
      selectOption(exact);
      return;
    }

    const selected = getSelectedOption();
    if (selected) {
      searchText = getOptionLabel(selected);
      return;
    }

    value = '';
  }

  function scheduleSearch(term: string) {
    if (searchTimer) clearTimeout(searchTimer);
    searchTimer = setTimeout(() => {
      void searchOptions(term);
    }, 180);
  }

  function handleInput(event: Event) {
    searchText = (event.currentTarget as HTMLInputElement).value;
    open = true;
    value = '';
    activeIndex = -1;
    scheduleSearch(searchText);
  }

  function handleFocus() {
    open = true;
    if (searchText.trim().length >= minChars) {
      scheduleSearch(searchText);
    }
  }

  function closeSoon() {
    if (blurTimer) clearTimeout(blurTimer);
    blurTimer = setTimeout(() => {
      open = false;
      resolveTypedValue();
    }, 120);
  }

  function handleKeydown(event: KeyboardEvent) {
    if (event.key === 'ArrowDown') {
      event.preventDefault();
      open = true;
      if (results.length > 0) {
        activeIndex = activeIndex < 0 ? 0 : (activeIndex + 1) % results.length;
      }
      return;
    }

    if (event.key === 'ArrowUp') {
      event.preventDefault();
      open = true;
      if (results.length > 0) {
        activeIndex =
          activeIndex < 0
            ? results.length - 1
            : (activeIndex - 1 + results.length) % results.length;
      }
      return;
    }

    if (event.key === 'Enter') {
      if (open && activeIndex >= 0 && results[activeIndex]) {
        event.preventDefault();
        selectOption(results[activeIndex]);
      }
      return;
    }

    if (event.key === 'Escape') {
      event.preventDefault();
      open = false;
      const selected = getSelectedOption();
      if (selected) {
        searchText = getOptionLabel(selected);
      }
    }
  }

  $: if (value) {
    void ensureSelectedLoaded(value);
  } else if (!open && !searchText.trim()) {
    results = [];
  }

  $: {
    const selected = getSelectedOption();
    if (selected && !open) {
      const labelValue = getOptionLabel(selected);
      if (searchText !== labelValue) {
        searchText = labelValue;
      }
    }
  }

  onDestroy(() => {
    if (searchTimer) clearTimeout(searchTimer);
    if (blurTimer) clearTimeout(blurTimer);
  });
</script>

<div class="relative">
  <FieldInput
    {id}
    {label}
    bind:value={searchText}
    {placeholder}
    {disabled}
    {required}
    autocomplete="off"
    {error}
    {helper}
    class_name="w-full"
    on:input={handleInput}
    on:focus={handleFocus}
    on:blur={closeSoon}
    on:keydown={handleKeydown}
  />

  {#if open}
    <div
      class="mt-2 max-h-72 w-full overflow-auto rounded-lg border border-slate-200 bg-white shadow-lg"
    >
      {#if loading}
        <div class="px-3 py-2 text-sm text-slate-500">Carregando estados...</div>
      {:else if searchText.trim().length < minChars}
        <div class="px-3 py-2 text-sm text-slate-500">
          Digite pelo menos {minChars} letras para buscar.
        </div>
      {:else if results.length === 0}
        <div class="px-3 py-2 text-sm text-slate-500">Nenhum estado/província encontrado.</div>
      {:else}
        {#each results as option, index}
          <button
            type="button"
            class={`w-full px-3 py-2 text-left text-sm transition-colors ${
              index === activeIndex
                ? 'bg-blue-50 text-blue-700'
                : 'text-slate-700 hover:bg-slate-50'
            }`}
            on:mousedown|preventDefault={() => selectOption(option)}
          >
            <span class="block font-medium">{option.nome}</span>
            {#if option.pais?.nome}
              <span class="block text-xs text-slate-500">{option.pais.nome}</span>
            {/if}
          </button>
        {/each}
      {/if}
    </div>
  {/if}
</div>
