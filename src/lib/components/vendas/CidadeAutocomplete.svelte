<script lang="ts">
  import { createEventDispatcher, onDestroy } from 'svelte';
  import { Button, FieldInput } from '$lib/components/ui';
  import { apiGet } from '$lib/services/api';

  type CidadeOption = {
    id: string;
    nome?: string | null;
    pais_nome?: string | null;
    estado?: string | null;
    uf?: string | null;
    sigla?: string | null;
    subdivisao_nome?: string | null;
    subdivisao?: { nome?: string | null; sigla?: string | null } | null;
    label?: string | null;
    grau_importancia?: number | null;
  };

  const dispatch = createEventDispatcher<{
    loaded: CidadeOption[];
    select: CidadeOption;
  }>();

  export let id = '';
  export let label = 'Cidade';
  export let placeholder = 'Buscar cidade...';
  export let value = '';
  export let cities: CidadeOption[] = [];
  export let error = '';
  export let disabled = false;
  export let required = false;
  export let maxResults = 30;

  let searchText = '';
  let searchResults: CidadeOption[] = [];
  let showOptions = false;
  let loading = false;
  let searchTimer: ReturnType<typeof setTimeout> | null = null;
  let searchAbort: AbortController | null = null;
  let ensuringId = '';

  const DIACRITICS_RE = /[\u0300-\u036f]/g;
  const PT_BR_BASE_COLLATOR = new Intl.Collator('pt-BR', { sensitivity: 'base' });

  function normalizeLookup(value: string | null | undefined) {
    return String(value || '')
      .normalize('NFD')
      .replace(DIACRITICS_RE, '')
      .toLowerCase()
      .trim();
  }

  function getImportanceRank(option: CidadeOption) {
    const parsed = Number(option?.grau_importancia);
    return Number.isFinite(parsed) && parsed > 0 ? parsed : 9999;
  }

  function getCidadeLabel(cidade: CidadeOption) {
    const preferred = String(cidade.label || '').trim();
    if (preferred) return preferred;

    const nome = String(cidade.nome || '').trim();
    const estado = String(
      cidade.estado ||
        cidade.uf ||
        cidade.sigla ||
        cidade.subdivisao_nome ||
        cidade.subdivisao?.sigla ||
        cidade.subdivisao?.nome ||
        ''
    ).trim();

    return estado ? `${nome} (${estado})` : nome;
  }

  function getSearchScore(cidade: CidadeOption, input: string) {
    const query = normalizeLookup(input);
    if (!query) return 100;

    const nome = normalizeLookup(cidade.nome);
    const label = normalizeLookup(getCidadeLabel(cidade));
    const estado = normalizeLookup(
      cidade.estado || cidade.subdivisao_nome || cidade.subdivisao?.nome
    );
    const full = `${nome} ${estado}`.trim();

    if (nome === query) return 0;
    if (label === query) return 1;
    if (nome.startsWith(query)) return 2;
    if (label.startsWith(query)) return 3;
    if (estado && estado.startsWith(query)) return 4;
    if (full.includes(query)) return 5;
    return 10;
  }

  function sortCities(items: CidadeOption[], input: string) {
    return [...items].sort((a, b) => {
      const scoreDiff = getSearchScore(a, input) - getSearchScore(b, input);
      if (scoreDiff !== 0) return scoreDiff;

      const importanceDiff = getImportanceRank(a) - getImportanceRank(b);
      if (importanceDiff !== 0) return importanceDiff;

      const nomeDiff = PT_BR_BASE_COLLATOR.compare(String(a.nome || ''), String(b.nome || ''));
      if (nomeDiff !== 0) return nomeDiff;

      return PT_BR_BASE_COLLATOR.compare(
        String(a.estado || a.subdivisao_nome || a.subdivisao?.nome || ''),
        String(b.estado || b.subdivisao_nome || b.subdivisao?.nome || '')
      );
    });
  }

  function uniqueCities(items: CidadeOption[]) {
    const byId = new Map<string, CidadeOption>();
    for (const item of items) {
      const cidadeId = String(item?.id || '').trim();
      if (!cidadeId) continue;
      byId.set(cidadeId, { ...(byId.get(cidadeId) || {}), ...item });
    }
    return Array.from(byId.values());
  }

  function parseItems(payload: unknown): CidadeOption[] {
    if (Array.isArray(payload)) return payload as CidadeOption[];

    const items =
      payload && typeof payload === 'object' ? (payload as { items?: unknown }).items : null;
    if (Array.isArray(items)) return items as CidadeOption[];

    return [];
  }

  function hasCidadeId(payload: unknown): payload is CidadeOption {
    return Boolean(
      payload &&
      typeof payload === 'object' &&
      String((payload as { id?: unknown }).id || '').trim()
    );
  }

  function resolveSelectedCity() {
    return cities.find((item) => String(item.id) === String(value)) || null;
  }

  function getFilteredCities(input: string) {
    if (searchResults.length > 0)
      return sortCities(uniqueCities(searchResults), input).slice(0, maxResults);

    const query = normalizeLookup(input);
    const base = query
      ? cities.filter((item) =>
          normalizeLookup(
            [
              item.nome,
              item.estado,
              item.uf,
              item.sigla,
              item.subdivisao_nome,
              item.subdivisao?.nome,
              item.subdivisao?.sigla
            ]
              .filter(Boolean)
              .join(' ')
          ).includes(query)
        )
      : cities;

    return sortCities(uniqueCities(base), input).slice(0, maxResults);
  }

  function applyInputValue() {
    const raw = searchText.trim();
    if (!raw) {
      value = '';
      return;
    }

    const normalized = normalizeLookup(raw);
    const selected = uniqueCities([...searchResults, ...cities]).find((item) => {
      return (
        normalizeLookup(getCidadeLabel(item)) === normalized ||
        normalizeLookup(String(item.nome || '')) === normalized
      );
    });

    if (selected) {
      selectCity(selected);
      return;
    }

    value = '';
  }

  function selectCity(cidade: CidadeOption) {
    value = String(cidade.id || '');
    searchText = getCidadeLabel(cidade);
    searchResults = [];
    showOptions = false;
    dispatch('loaded', [cidade]);
    dispatch('select', cidade);
  }

  async function ensureSelectedLoaded(cidadeId: string) {
    const idValue = String(cidadeId || '').trim();
    if (!idValue) return;

    const local = cities.find((item) => String(item.id) === idValue);
    if (local) {
      if (!showOptions) searchText = getCidadeLabel(local);
      return;
    }

    if (ensuringId === idValue) return;
    ensuringId = idValue;

    try {
      let payload: unknown = null;
      for (let attempt = 0; attempt < 3; attempt++) {
        try {
          payload = await apiGet(
            '/api/v1/vendas/cidades-busca',
            { id: idValue },
            undefined,
            30_000
          );
          break;
        } catch {
          if (attempt < 2) await new Promise((r) => setTimeout(r, 250));
        }
      }
      if (!hasCidadeId(payload)) return;
      dispatch('loaded', [payload]);
      if (!showOptions) searchText = getCidadeLabel(payload);
    } catch {
      // Mantemos o campo utilizavel mesmo se o prefetch falhar.
    } finally {
      if (ensuringId === idValue) ensuringId = '';
    }
  }

  async function searchCities(term: string) {
    const query = term.trim();
    if (query.length < 2) {
      searchAbort?.abort();
      searchAbort = null;
      loading = false;
      searchResults = [];
      return;
    }

    searchAbort?.abort();
    const controller = new AbortController();
    searchAbort = controller;

    loading = true;
    for (let attempt = 0; attempt < 3; attempt++) {
      try {
        const payload = await apiGet(
          '/api/v1/vendas/cidades-busca',
          { q: query, limite: maxResults },
          controller.signal,
          30_000
        );
        if (controller.signal.aborted || searchAbort !== controller) return;
        const items = sortCities(uniqueCities(parseItems(payload)), query).slice(0, maxResults);
        searchResults = items;
        dispatch('loaded', items);
        break;
      } catch {
        if (controller.signal.aborted || searchAbort !== controller) return;
        if (attempt < 2) {
          await new Promise((r) => setTimeout(r, 250));
        } else {
          searchResults = [];
        }
      }
    }
    if (searchAbort === controller) {
      searchAbort = null;
      loading = false;
    }
  }

  function handleInput(event: Event) {
    searchText = (event.currentTarget as HTMLInputElement).value;
    showOptions = true;

    const selected = resolveSelectedCity();
    if (!selected || normalizeLookup(getCidadeLabel(selected)) !== normalizeLookup(searchText)) {
      value = '';
    }

    if (searchTimer) clearTimeout(searchTimer);
    searchTimer = setTimeout(() => {
      void searchCities(searchText);
    }, 180);
  }

  function handleBlur() {
    setTimeout(() => {
      showOptions = false;
      applyInputValue();
    }, 120);
  }

  $: if (value) {
    void ensureSelectedLoaded(value);
  }

  $: if (!showOptions) {
    const selected = resolveSelectedCity();
    if (selected) {
      const labelValue = getCidadeLabel(selected);
      if (searchText !== labelValue) {
        searchText = labelValue;
      }
    } else if (!value && !searchText.trim()) {
      searchResults = [];
    }
  }

  onDestroy(() => {
    if (searchTimer) clearTimeout(searchTimer);
    searchAbort?.abort();
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
    error={error || null}
    class_name="w-full"
    on:input={handleInput}
    on:focus={() => (showOptions = true)}
    on:blur={handleBlur}
  />

  {#if showOptions}
    <div
      class="absolute z-20 mt-1 max-h-72 w-full overflow-auto rounded-lg border border-slate-200 bg-white shadow-lg"
    >
      {#if loading}
        <div class="px-3 py-2 text-sm text-slate-500">Buscando...</div>
      {:else if getFilteredCities(searchText).length === 0}
        <div class="px-3 py-2 text-sm text-slate-500">Nenhuma cidade encontrada.</div>
      {:else}
        {#each getFilteredCities(searchText) as cidade}
          <Button
            type="button"
            variant="unstyled"
            size="sm"
            class_name="w-full rounded-none px-3 py-2 text-left text-sm hover:bg-slate-50"
            on:click={() => selectCity(cidade)}
          >
            {getCidadeLabel(cidade)}
          </Button>
        {/each}
      {/if}
    </div>
  {/if}
</div>
