<script lang="ts">
  import { createEventDispatcher, onDestroy } from 'svelte';
  import { Button, FieldInput } from '$lib/components/ui';
  import { apiGet } from '$lib/services/api';

  type ClienteOption = {
    id: string;
    nome: string;
    cpf?: string | null;
    telefone?: string | null;
    email?: string | null;
    whatsapp?: string | null;
  };

  const dispatch = createEventDispatcher<{
    loaded: ClienteOption[];
    select: ClienteOption;
  }>();

  export let id = '';
  export let label = 'Cliente';
  export let placeholder = 'Digite para buscar cliente';
  export let value = '';
  export let clients: ClienteOption[] = [];
  export let error = '';
  export let disabled = false;
  export let required = false;
  export let maxResults = 30;

  let searchText = '';
  let searchResults: ClienteOption[] = [];
  let showOptions = false;
  let loading = false;
  let searchTimer: ReturnType<typeof setTimeout> | null = null;

  const DIACRITICS_RE = /[\u0300-\u036f]/g;

  function normalizeLookup(input: string | null | undefined) {
    return String(input || '')
      .normalize('NFD')
      .replace(DIACRITICS_RE, '')
      .toLowerCase()
      .trim();
  }

  function getClienteLabel(cliente: ClienteOption) {
    return `${cliente.nome}${cliente.cpf ? ` • ${cliente.cpf}` : ''}`;
  }

  function uniqueClients(items: ClienteOption[]) {
    const byId = new Map<string, ClienteOption>();
    for (const item of items) {
      const clienteId = String(item?.id || '').trim();
      if (!clienteId) continue;
      byId.set(clienteId, { ...(byId.get(clienteId) || {}), ...item });
    }
    return Array.from(byId.values());
  }

  function parseItems(payload: unknown): ClienteOption[] {
    if (Array.isArray(payload)) return payload as ClienteOption[];

    const items =
      payload && typeof payload === 'object' ? (payload as { items?: unknown }).items : null;
    if (Array.isArray(items)) return items as ClienteOption[];

    return [];
  }

  function resolveSelectedClient() {
    return clients.find((item) => String(item.id) === String(value)) || null;
  }

  function getFilteredClients(input: string) {
    if (searchResults.length > 0) return uniqueClients(searchResults).slice(0, maxResults);

    const query = normalizeLookup(input);
    const base = query
      ? clients.filter((item) =>
          normalizeLookup(
            [item.nome, item.email, item.telefone, item.whatsapp, item.cpf]
              .filter(Boolean)
              .join(' ')
          ).includes(query)
        )
      : clients;

    return uniqueClients(base).slice(0, maxResults);
  }

  function applyInputValue() {
    const normalized = normalizeLookup(searchText);
    if (!normalized) {
      value = '';
      return;
    }

    const selected = uniqueClients([...searchResults, ...clients]).find((item) => {
      return (
        normalizeLookup(getClienteLabel(item)) === normalized ||
        normalizeLookup(item.nome) === normalized
      );
    });

    if (selected) {
      selectClient(selected);
      return;
    }

    value = '';
  }

  function selectClient(cliente: ClienteOption) {
    value = String(cliente.id || '');
    searchText = getClienteLabel(cliente);
    searchResults = [];
    showOptions = false;
    dispatch('loaded', [cliente]);
    dispatch('select', cliente);
  }

  async function searchClients(term: string) {
    const query = term.trim();
    if (query.length < 2) {
      searchResults = [];
      return;
    }

    loading = true;
    try {
      const payload = await apiGet('/api/v1/clientes', { search: query });
      const items = uniqueClients(parseItems(payload)).slice(0, maxResults);
      searchResults = items;
      dispatch('loaded', items);
    } catch {
      searchResults = [];
    } finally {
      loading = false;
    }
  }

  function handleInput(event: Event) {
    searchText = (event.currentTarget as HTMLInputElement).value;
    showOptions = true;

    const selected = resolveSelectedClient();
    if (!selected || normalizeLookup(getClienteLabel(selected)) !== normalizeLookup(searchText)) {
      value = '';
    }

    if (searchTimer) clearTimeout(searchTimer);
    searchTimer = setTimeout(() => {
      void searchClients(searchText);
    }, 180);
  }

  function handleBlur() {
    setTimeout(() => {
      showOptions = false;
      applyInputValue();
    }, 120);
  }

  $: if (!showOptions) {
    const selected = resolveSelectedClient();
    if (selected) {
      const labelValue = getClienteLabel(selected);
      if (searchText !== labelValue) {
        searchText = labelValue;
      }
    } else if (!value && !searchText.trim()) {
      searchResults = [];
    }
  }

  onDestroy(() => {
    if (searchTimer) clearTimeout(searchTimer);
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
      class="absolute z-20 mt-1 max-h-64 w-full overflow-y-auto rounded-lg border border-slate-200 bg-white shadow-lg"
    >
      {#if loading}
        <div class="px-3 py-2 text-sm text-slate-500">Buscando...</div>
      {:else if getFilteredClients(searchText).length === 0}
        <div class="px-3 py-2 text-sm text-slate-500">Nenhum cliente encontrado</div>
      {:else}
        {#each getFilteredClients(searchText) as cliente}
          <Button
            type="button"
            variant="unstyled"
            size="sm"
            class_name="block w-full rounded-none border-b border-slate-100 px-3 py-2 text-left text-sm hover:bg-slate-50"
            on:click={() => selectClient(cliente)}
          >
            {getClienteLabel(cliente)}
          </Button>
        {/each}
      {/if}
    </div>
  {/if}
</div>
