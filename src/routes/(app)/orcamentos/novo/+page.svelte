<script lang="ts">
  import { goto } from '$app/navigation';
  import { onMount, onDestroy } from 'svelte';
  import PageHeader from '$lib/components/ui/PageHeader.svelte';
  import CidadeDestinoAutocomplete from '$lib/components/CidadeDestinoAutocomplete.svelte';
  import Card from '$lib/components/ui/Card.svelte';
  import Button from '$lib/components/ui/Button.svelte';
  import { FieldInput, FieldSelect, FieldTextarea } from '$lib/components/ui';
  import { ArrowLeft, Save, Send, Plus, X, FileText, Search, User } from '$lib/icons';
  import { toast } from '$lib/stores/ui';
  import { addDaysISODate, todayISODateLocal } from '$lib/date';
  import { toUserMessage } from '$lib/utils/errors';
  import { apiFetch, apiGet, apiPost, isCanceledApiError } from '$lib/services/api';

  // ─── Tipos ───────────────────────────────────────────────────────────────────
  interface ItemOrcamento {
    title: string;
    product_name: string;
    item_type: string;
    quantity: number;
    unit_price: number;
    total_amount: number;
    city_name: string;
    order_index: number;
  }

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
    itens: [
      makeItem(0)
    ] as ItemOrcamento[]
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
    return {
      title: '',
      product_name: '',
      item_type: 'servico',
      quantity: 1,
      unit_price: 0,
      total_amount: 0,
      city_name: '',
      order_index: index
    };
  }

  /** Recalcula total_amount de cada item sem reatribuir o array inteiro */
  function recalcularItem(index: number) {
    const item = formData.itens[index];
    formData.itens[index] = {
      ...item,
      total_amount: (item.quantity || 0) * (item.unit_price || 0)
    };
    // Força reatividade do Svelte sem re-criar o array
    formData.itens = formData.itens;
  }

  $: valorTotal = formData.itens.reduce((acc, item) => acc + (item.total_amount || 0), 0);

  function addItem() {
    formData.itens = [...formData.itens, makeItem(formData.itens.length)];
  }

  function removeItem(index: number) {
    if (formData.itens.length > 1) {
      formData.itens = formData.itens
        .filter((_, i) => i !== index)
        .map((item, i) => ({ ...item, order_index: i }));
    }
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

    const hasItensValidos = formData.itens.some(
      (i) => i.title?.trim() && i.total_amount > 0
    );
    if (!hasItensValidos) {
      errors.itens = 'Adicione pelo menos um item válido com descrição e valor';
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
          title: item.title,
          product_name: item.product_name || item.title,
          item_type: item.item_type,
          quantity: item.quantity,
          unit_price: item.unit_price,
          total_amount: item.total_amount,
          city_name: item.city_name,
          order_index: item.order_index
        }))
      };

      await apiPost('/api/v1/orcamentos/create', payload);

      toast.success(
        enviar
          ? 'Orçamento criado e enviado ao cliente!'
          : 'Orçamento salvo com sucesso!'
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

  const tiposItem = [
    { value: 'servico', label: 'Serviço' },
    { value: 'pacote', label: 'Pacote' },
    { value: 'hotel', label: 'Hotel' },
    { value: 'passagem', label: 'Passagem' },
    { value: 'passeio', label: 'Passeio' },
    { value: 'transfer', label: 'Transfer' },
    { value: 'seguro', label: 'Seguro' },
    { value: 'outro', label: 'Outro' }
  ];
</script>

<svelte:head>
  <title>Novo Orçamento | VTUR</title>
</svelte:head>

<PageHeader
  title="Novo Orçamento"
  subtitle="Crie um novo orçamento para o cliente"
  color="orcamentos"
  breadcrumbs={[
    { label: 'Orçamentos', href: '/orcamentos' },
    { label: 'Novo Orçamento' }
  ]}
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
          placeholder="(00) 00000-0000"
        />
        <FieldInput
          label="E-mail"
          type="email"
          bind:value={formData.cliente_email}
          placeholder="cliente@email.com"
        />
      </div>

      <div>
        <label for="orcamento-novo-cliente" class="block text-sm font-medium text-slate-700 mb-1">
          Vincular cliente cadastrado <span class="text-slate-500 font-normal">(opcional)</span>
        </label>

        {#if formData.client_id}
          <!-- Cliente selecionado -->
          <div class="flex items-center gap-3 p-3 bg-slate-50 rounded-lg border border-slate-200">
            <div class="w-10 h-10 rounded-full bg-orcamentos-100 flex items-center justify-center shrink-0">
              <User size={20} class="text-orcamentos-600" />
            </div>
            <div class="flex-1 min-w-0">
              <p class="font-medium text-slate-900 truncate">{formData.cliente_nome}</p>
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
              <div class="absolute z-50 top-full left-0 right-0 mt-1 bg-white rounded-lg shadow-lg border border-slate-200 max-h-60 overflow-auto">
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
                        {cliente.email || 'Sem email'}{cliente.telefone ? ` • ${cliente.telefone}` : ''}
                      </p>
                    </Button>
                  {/each}
                {:else}
                  <div class="px-4 py-3 text-sm text-slate-500">
                    Nenhum cliente encontrado. O orçamento pode ser salvo com os dados manuais acima.
                    <a href="/clientes/novo" class="text-orcamentos-600 hover:underline ml-1" target="_self">
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
    <div class="grid grid-cols-1 md:grid-cols-2 gap-4">
      <div class="flex gap-2 items-start">
        <FieldInput
          label="Válido até"
          required
          type="date"
          bind:value={formData.valid_until}
          error={errors.valid_until}
          class_name="flex-1"
        />
        <div class="flex gap-1 mt-[1.65rem] shrink-0">
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
        <div class="flex gap-3 items-start p-4 bg-slate-50 rounded-lg border border-slate-100">
          <div class="flex-1 grid grid-cols-1 md:grid-cols-12 gap-3">

            <div class="md:col-span-4">
              <FieldInput
                id={`orcamento-novo-item-titulo-${index}`}
                label="Descrição"
                bind:value={item.title}
                class_name="w-full"
                placeholder="Ex: Passagem Aérea Ida e Volta"
                required
              />
            </div>

            <div class="md:col-span-2">
              <FieldSelect
                id={`orcamento-novo-item-tipo-${index}`}
                label="Tipo"
                bind:value={item.item_type}
                options={tiposItem}
                placeholder={null}
                class_name="w-full"
              />
            </div>

            <div class="md:col-span-2">
              <CidadeDestinoAutocomplete
                id={`orcamento-novo-item-destino-${index}`}
                label="Destino"
                bind:value={item.city_name}
                placeholder="Cidade"
                class_name="w-full"
              />
            </div>

            <div class="md:col-span-1">
              <FieldInput
                id={`orcamento-novo-item-quantidade-${index}`}
                label="Qtd"
                type="number"
                bind:value={item.quantity}
                min="1"
                class_name="w-full"
                on:input={() => recalcularItem(index)}
              />
            </div>

            <div class="md:col-span-2">
              <FieldInput
                id={`orcamento-novo-item-valor-${index}`}
                label="Valor Unit."
                type="number"
                bind:value={item.unit_price}
                min="0"
                step="0.01"
                class_name="w-full"
                on:input={() => recalcularItem(index)}
              />
            </div>

            <div class="md:col-span-1">
              <p class="block text-xs font-medium text-slate-500 mb-1">Total</p>
              <div class="px-2 py-2 bg-white rounded-lg text-sm font-semibold text-slate-800 text-right border border-slate-200">
                {formatCurrency(item.total_amount)}
              </div>
            </div>

          </div>

          {#if formData.itens.length > 1}
            <Button
              type="button"
              on:click={() => removeItem(index)}
              variant="ghost"
              size="sm"
              class_name="mt-5 shrink-0 text-red-500 hover:text-red-600 hover:bg-red-50"
              ariaLabel="Remover item"
              title="Remover item"
            >
              <X size={18} />
            </Button>
          {/if}
        </div>
      {/each}

      {#if errors.itens}
        <p class="text-sm text-red-600">{errors.itens}</p>
      {/if}

      <Button type="button" variant="secondary" on:click={addItem}>
        <Plus size={16} class="mr-2" />
        Adicionar Item
      </Button>
    </div>

    <!-- Total -->
    <div class="mt-6 pt-4 border-t border-slate-200">
      <div class="flex justify-end">
        <div class="text-right">
          <p class="text-sm text-slate-500">Valor Total do Orçamento</p>
          <p class="text-3xl font-bold text-orcamentos-600">{formatCurrency(valorTotal)}</p>
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
