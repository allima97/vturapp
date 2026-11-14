<script lang="ts">
  import { goto } from '$app/navigation';
  import { onMount, onDestroy } from 'svelte';
  import PageHeader from '$lib/components/ui/PageHeader.svelte';
  import QuoteItemFields from '$lib/components/orcamentos/QuoteItemFields.svelte';
  import {
    formatarDescricaoItem,
    moverItemOrcamento,
    novoItemOrcamento,
    recalcularTotaisItem,
    rawDetalhes,
    resumoItemOrcamento,
    validarDetalhes,
    type ItemOrcamento
  } from '$lib/quote/detalhesItem';
  import { campoGeografico } from '$lib/config/destinosGeograficos';
  import { supportsFlightSegments } from '$lib/quote/flights';
  import Card from '$lib/components/ui/Card.svelte';
  import Button from '$lib/components/ui/Button.svelte';
  import { FieldInput, FieldSelect, FieldTextarea } from '$lib/components/ui';
  import {
    ArrowDown,
    ArrowLeft,
    ArrowUp,
    Save,
    Send,
    Plus,
    X,
    FileText,
    Search,
    User,
    Whatsapp
  } from '$lib/icons';
  import { toast } from '$lib/stores/ui';
  import { addDaysISODate, todayISODateLocal } from '$lib/date';
  import { toUserMessage } from '$lib/utils/errors';
  import { apiFetch, apiGet, apiPost, isCanceledApiError } from '$lib/services/api';

  // ─── Tipos ───────────────────────────────────────────────────────────────────
  interface ClienteOption {
    id: string;
    nome: string;
    email?: string | null;
    telefone?: string | null;
    cpf?: string | null;
  }

  const BRL_CURRENCY_FORMATTER = new Intl.NumberFormat('pt-BR', {
    style: 'currency',
    currency: 'BRL'
  });

  // ─── Estado do formulário ────────────────────────────────────────────────────
  let formData = {
    client_id: '',
    cliente_nome: '',
    cliente_telefone: '',
    cliente_email: '',
    status: 'pendente',
    status_negociacao: 'novo',
    currency: 'BRL',
    valid_until: '',
    notes: '',
    itens: [makeItem(0)] as ItemOrcamento[]
  };

  let saving = false;
  let errors: Record<string, string> = {};

  // ─── Busca de cliente (lazy) ─────────────────────────────────────────────────
  let searchClienteQuery = '';
  let showClienteSearch = false;
  let loadingClientes = false;
  let clientesFiltrados: ClienteOption[] = [];
  let searchDebounceTimer: ReturnType<typeof setTimeout> | null = null;
  let searchController: AbortController | null = null;
  let searchSeq = 0;
  let destroyed = false;

  // ─── Helpers ─────────────────────────────────────────────────────────────────
  function makeItem(index: number): ItemOrcamento {
    return novoItemOrcamento(index);
  }

  function recalcularItem(index: number) {
    const item = formData.itens[index];
    recalcularTotaisItem(item);
    formData.itens[index] = { ...item };
    formData.itens = formData.itens;
  }

  $: valorTotal = formData.itens.reduce((acc, item) => acc + (item.total_amount || 0), 0);

  function addItem() {
    formData.itens = [
      ...formData.itens.map((item) => ({ ...item, isOpen: false })),
      makeItem(formData.itens.length)
    ];
  }

  function removeItem(index: number) {
    if (formData.itens.length > 1) {
      formData.itens = formData.itens
        .filter((_, i) => i !== index)
        .map((item, i) => ({ ...item, order_index: i }));
    }
  }

  function moverItem(index: number, direction: -1 | 1) {
    formData.itens = moverItemOrcamento(formData.itens, index, direction);
    delete errors[`item-${index}`];
    delete errors[`item-${index + direction}`];
    errors = errors;
  }

  // ─── Busca lazy de clientes ───────────────────────────────────────────────────
  async function fetchClientes(query: string) {
    if (query.length < 2) {
      searchController?.abort();
      searchSeq += 1;
      clientesFiltrados = [];
      return;
    }
    searchController?.abort();
    const controller = new AbortController();
    searchController = controller;
    const seq = ++searchSeq;
    loadingClientes = true;
    try {
      const data = await apiFetch<{ items?: ClienteOption[] }>('/api/v1/clientes/list', {
        query: { q: query, lookup: '1', pageSize: 15 },
        signal: controller.signal,
        // Busca de cliente é opcional no orçamento: sem acesso a Clientes, só não lista (não vai para "/negado").
        redirectOnForbidden: false
      });
      if (seq !== searchSeq || destroyed) return;
      clientesFiltrados = Array.isArray(data.items) ? data.items : [];
    } catch (err) {
      if (isCanceledApiError(err)) return;
      clientesFiltrados = [];
    } finally {
      if (seq === searchSeq && !destroyed) loadingClientes = false;
    }
  }

  function handleSearchInput() {
    if (searchDebounceTimer) clearTimeout(searchDebounceTimer);
    showClienteSearch = true;
    searchDebounceTimer = setTimeout(() => fetchClientes(searchClienteQuery), 300);
  }

  function handleSearchFocus() {
    showClienteSearch = true;
    if (searchClienteQuery.length >= 2 && clientesFiltrados.length === 0) {
      void fetchClientes(searchClienteQuery);
    }
  }

  /** Fecha com delay para permitir o click no item da lista */
  function handleSearchBlur() {
    setTimeout(() => {
      showClienteSearch = false;
    }, 200);
  }

  function selecionarCliente(cliente: ClienteOption) {
    formData.client_id = cliente.id;
    formData.cliente_nome = cliente.nome;
    formData.cliente_telefone = cliente.telefone || '';
    formData.cliente_email = cliente.email || '';
    searchClienteQuery = '';
    showClienteSearch = false;
    clientesFiltrados = [];
    delete errors.cliente;
    errors = errors;
  }

  function limparCliente() {
    formData.client_id = '';
    searchClienteQuery = '';
    clientesFiltrados = [];
  }

  // ─── Validade ─────────────────────────────────────────────────────────────────
  function setValidadeDias(dias: number) {
    formData.valid_until = addDaysISODate(todayISODateLocal(), dias);
  }

  onMount(() => {
    setValidadeDias(7);
  });

  onDestroy(() => {
    destroyed = true;
    searchSeq += 1;
    searchController?.abort();
    if (searchDebounceTimer) clearTimeout(searchDebounceTimer);
  });

  // ─── Validação ────────────────────────────────────────────────────────────────
  function validateForm(): boolean {
    errors = {};

    if (!formData.cliente_nome.trim()) {
      errors.cliente = 'Informe o nome do cliente';
    }

    if (!formData.valid_until) {
      errors.valid_until = 'Data de validade é obrigatória';
    }

    const hasItensValidos = formData.itens.some((i) => i.title?.trim() && i.total_amount > 0);
    if (!hasItensValidos) {
      errors.itens = 'Adicione pelo menos um item válido com descrição e valor';
    }
    for (const [index, item] of formData.itens.entries()) {
      const erro = validarDetalhes(item);
      if (erro) errors[`item-${index}`] = `Item ${index + 1}: ${erro}`;
    }

    return Object.keys(errors).length === 0;
  }

  // ─── Submit ───────────────────────────────────────────────────────────────────
  async function handleSubmit(enviar = false) {
    if (!validateForm()) {
      toast.error('Corrija os erros no formulário');
      return;
    }

    saving = true;

    try {
      const payload = {
        client_id: formData.client_id,
        client_name: formData.cliente_nome.trim(),
        client_whatsapp: formData.cliente_telefone.trim() || null,
        client_email: formData.cliente_email.trim() || null,
        status: enviar ? 'enviado' : formData.status,
        status_negociacao: enviar ? 'enviado' : formData.status_negociacao,
        currency: formData.currency,
        valid_until: formData.valid_until,
        notes: formData.notes,
        itens: formData.itens.map((item) => ({
          title: formatarDescricaoItem(item.item_type, item.title),
          product_name: item.product_name || formatarDescricaoItem(item.item_type, item.title),
          item_type: item.item_type,
          quantity: item.quantity,
          unit_price: item.unit_price,
          total_amount: item.total_amount,
          city_name: item.city_name,
          start_date: item.start_date,
          end_date: item.end_date,
          raw: {
            detalhes_orcamento: rawDetalhes(item),
            ...(supportsFlightSegments(item.item_type)
              ? { aereo_import: { segmentos: item.flightSegments } }
              : {})
          },
          ...campoGeografico(item.destino_geografico_id),
          order_index: item.order_index
        }))
      };

      await apiPost('/api/v1/orcamentos/create', payload);

      toast.success(
        enviar ? 'Orçamento criado e enviado ao cliente!' : 'Orçamento salvo com sucesso!'
      );
      goto('/orcamentos');
    } catch (err: unknown) {
      toast.error(toUserMessage(err, 'Erro ao salvar orçamento'));
    } finally {
      saving = false;
    }
  }

  // ─── Formatação ───────────────────────────────────────────────────────────────
  function formatCurrency(value: number): string {
    return BRL_CURRENCY_FORMATTER.format(value || 0);
  }
</script>

<svelte:head>
  <title>Novo Orçamento | VTUR</title>
</svelte:head>

<PageHeader
  title="Novo Orçamento"
  subtitle="Crie um novo orçamento para o cliente"
  color="orcamentos"
  breadcrumbs={[{ label: 'Orçamentos', href: '/orcamentos' }, { label: 'Novo Orçamento' }]}
/>

<form on:submit|preventDefault={() => handleSubmit(false)} class="space-y-6">
  <!-- ── Dados do Cliente ─────────────────────────────────────────────────── -->
  <Card header="Dados do Cliente" color="orcamentos">
    <div class="space-y-4">
      <div class="grid grid-cols-1 gap-4 md:grid-cols-3">
        <FieldInput
          label="Nome do cliente *"
          bind:value={formData.cliente_nome}
          error={errors.cliente || null}
          placeholder="Digite o nome do cliente"
        />
        <FieldInput
          label="Telefone/WhatsApp"
          bind:value={formData.cliente_telefone}
          icon={Whatsapp}
          placeholder="(00) 00000-0000"
          mask="phone"
        />
        <FieldInput
          label="E-mail"
          type="email"
          bind:value={formData.cliente_email}
          placeholder="cliente@email.com"
        />
      </div>

      <div>
        <label for="orcamento-novo-cliente" class="mb-1 block text-sm font-medium text-slate-700">
          Vincular cliente cadastrado <span class="font-normal text-slate-500">(opcional)</span>
        </label>

        {#if formData.client_id}
          <!-- Cliente selecionado -->
          <div class="flex items-center gap-3 rounded-lg border border-slate-200 bg-slate-50 p-3">
            <div
              class="bg-orcamentos-100 flex h-10 w-10 shrink-0 items-center justify-center rounded-full"
            >
              <User size={20} class="text-orcamentos-600" />
            </div>
            <div class="min-w-0 flex-1">
              <p class="truncate font-medium text-slate-900">{formData.cliente_nome}</p>
              <p class="text-sm text-slate-500">Cliente cadastrado selecionado</p>
            </div>
            <Button variant="ghost" size="sm" type="button" on:click={limparCliente}>
              <X size={16} />
            </Button>
          </div>
        {:else}
          <!-- Campo de busca com dropdown corretamente posicionado -->
          <div class="relative">
            <FieldInput
              id="orcamento-novo-cliente"
              bind:value={searchClienteQuery}
              label={null}
              icon={Search}
              on:input={handleSearchInput}
              on:focus={handleSearchFocus}
              on:blur={handleSearchBlur}
              placeholder="Buscar para vincular por nome, email ou CPF..."
              class_name="w-full"
              autocomplete="off"
            />

            <!-- Dropdown posicionado relative ao input wrapper -->
            {#if showClienteSearch && searchClienteQuery.length >= 2}
              <div
                class="absolute top-full right-0 left-0 z-50 mt-1 max-h-60 overflow-auto rounded-lg border border-slate-200 bg-white shadow-lg"
              >
                {#if loadingClientes}
                  <div class="px-4 py-3 text-sm text-slate-500">Buscando...</div>
                {:else if clientesFiltrados.length > 0}
                  {#each clientesFiltrados as cliente}
                    <Button
                      type="button"
                      variant="unstyled"
                      size="sm"
                      on:click={() => selecionarCliente(cliente)}
                      class_name="block w-full rounded-none border-b border-slate-100 px-4 py-3 text-left hover:bg-slate-50 transition-colors"
                    >
                      <p class="font-medium text-slate-900">{cliente.nome}</p>
                      <p class="text-sm text-slate-500">
                        {cliente.email || 'Sem email'}{cliente.telefone
                          ? ` • ${cliente.telefone}`
                          : ''}
                      </p>
                    </Button>
                  {/each}
                {:else}
                  <div class="px-4 py-3 text-sm text-slate-500">
                    Nenhum cliente encontrado. O orçamento pode ser salvo com os dados manuais
                    acima.
                    <a
                      href="/clientes/novo"
                      class="text-orcamentos-600 ml-1 hover:underline"
                      target="_self"
                    >
                      Cadastrar novo cliente
                    </a>
                  </div>
                {/if}
              </div>
            {/if}
          </div>
        {/if}
      </div>
    </div>
  </Card>

  <!-- ── Dados do Orçamento ───────────────────────────────────────────────── -->
  <Card header="Dados do Orçamento" color="orcamentos">
    <div class="grid grid-cols-1 gap-4 md:grid-cols-2">
      <div class="flex items-start gap-2">
        <FieldInput
          label="Válido até"
          required
          type="date"
          bind:value={formData.valid_until}
          error={errors.valid_until}
          class_name="flex-1"
        />
        <div class="mt-[1.65rem] flex shrink-0 gap-1">
          {#each [7, 15, 30] as dias}
            <Button
              type="button"
              on:click={() => setValidadeDias(dias)}
              variant="secondary"
              size="sm"
              class_name="rounded-lg! px-3! py-2! text-xs"
            >
              {dias}d
            </Button>
          {/each}
        </div>
      </div>

      <FieldSelect
        label="Moeda"
        bind:value={formData.currency}
        options={[
          { value: 'BRL', label: 'Real (R$)' },
          { value: 'USD', label: 'Dólar (US$)' },
          { value: 'EUR', label: 'Euro (€)' }
        ]}
      />
    </div>
  </Card>

  <!-- ── Itens do Orçamento ───────────────────────────────────────────────── -->
  <Card header="Itens do Orçamento" color="orcamentos">
    <div class="space-y-3">
      {#each formData.itens as item, index}
        <div class="flex items-start gap-3">
          <div class="min-w-0 flex-1">
            <details bind:open={item.isOpen} class="rounded-lg border border-slate-200 bg-slate-50">
              <summary
                class="flex cursor-pointer list-none items-center justify-between gap-4 px-4 py-3 text-sm font-medium text-slate-800"
              >
                <span class="min-w-0 truncate">{resumoItemOrcamento(item)}</span>
                <span
                  class="shrink-0 rounded-full border border-slate-300 bg-white px-2 py-0.5 text-base leading-none"
                >
                  {item.isOpen ? '-' : '+'}
                </span>
              </summary>
              <div class="border-t border-slate-200 p-4">
                <QuoteItemFields
                  bind:item
                  prefix={`orcamento-novo-item-${index}`}
                  currency={formData.currency}
                  onChange={() => recalcularItem(index)}
                />
              </div>
            </details>
            {#if errors[`item-${index}`]}
              <p role="alert" class="mt-2 text-sm text-red-600">{errors[`item-${index}`]}</p>
            {/if}
          </div>

          <div class="mt-1 flex shrink-0 flex-col">
            <Button
              type="button"
              variant="ghost"
              size="xs"
              disabled={index === 0}
              on:click={() => moverItem(index, -1)}
              ariaLabel={`Mover item ${index + 1} para cima`}
              title="Mover para cima"><ArrowUp size={16} /></Button
            >
            <Button
              type="button"
              variant="ghost"
              size="xs"
              disabled={index === formData.itens.length - 1}
              on:click={() => moverItem(index, 1)}
              ariaLabel={`Mover item ${index + 1} para baixo`}
              title="Mover para baixo"><ArrowDown size={16} /></Button
            >
          </div>
          {#if formData.itens.length > 1}
            <Button
              type="button"
              on:click={() => removeItem(index)}
              variant="ghost"
              size="sm"
              class_name="mt-2 shrink-0 text-red-500 hover:text-red-600 hover:bg-red-50"
              ariaLabel="Remover item"
              title="Remover item"
            >
              <X size={18} />
            </Button>
          {/if}
        </div>
      {/each}

      {#if errors.itens}
        <p role="alert" class="text-sm text-red-600">{errors.itens}</p>
      {/if}

      <Button type="button" variant="secondary" on:click={addItem}>
        <Plus size={16} class="mr-2" />
        Adicionar Item
      </Button>
    </div>

    <!-- Total -->
    <div class="mt-6 border-t border-slate-200 pt-4">
      <div class="flex justify-end">
        <div class="text-right">
          <p class="text-sm text-slate-500">Valor Total do Orçamento</p>
          <p class="text-orcamentos-600 text-3xl font-bold">{formatCurrency(valorTotal)}</p>
        </div>
      </div>
    </div>
  </Card>

  <!-- ── Observações ──────────────────────────────────────────────────────── -->
  <Card header="Observações e Condições" color="orcamentos">
    <FieldTextarea
      bind:value={formData.notes}
      rows={4}
      placeholder="Informações adicionais, condições de pagamento, validade da proposta..."
    />
  </Card>

  <!-- ── Ações ────────────────────────────────────────────────────────────── -->
  <div class="flex items-center justify-end gap-3">
    <Button
      type="button"
      variant="secondary"
      on:click={() => goto('/orcamentos')}
      disabled={saving}
    >
      <ArrowLeft size={16} class="mr-2" />
      Cancelar
    </Button>

    <Button
      type="button"
      variant="secondary"
      on:click={() => handleSubmit(false)}
      disabled={saving}
      loading={saving}
    >
      <Save size={16} class="mr-2" />
      Salvar Rascunho
    </Button>

    <Button
      type="button"
      variant="primary"
      color="orcamentos"
      on:click={() => handleSubmit(true)}
      loading={saving}
    >
      <Send size={16} class="mr-2" />
      Salvar e Enviar
    </Button>
  </div>
</form>
