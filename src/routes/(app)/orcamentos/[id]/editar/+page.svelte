<script lang="ts">
  import { page } from '$app/stores';
  import { goto } from '$app/navigation';
  import { onMount, onDestroy } from 'svelte';
  import PageHeader from '$lib/components/ui/PageHeader.svelte';
  import QuoteItemFields from '$lib/components/orcamentos/QuoteItemFields.svelte';
  import {
    formatarDescricaoItem,
    lerDetalhes,
    novoItemOrcamento,
    recalcularTotaisItem,
    rawDetalhes,
    resumoItemOrcamento,
    validarDetalhes,
    type ItemOrcamento
  } from '$lib/quote/detalhesItem';
  import { campoGeografico } from '$lib/config/destinosGeograficos';
  import { readQuoteFlightSegments, supportsFlightSegments } from '$lib/quote/flights';
  import Card from '$lib/components/ui/Card.svelte';
  import Button from '$lib/components/ui/Button.svelte';
  import { FieldInput, FieldSelect, FieldTextarea, LoadingState } from '$lib/components/ui';
  import { ArrowLeft, Save, Send, Plus, X, FileText, Search, User, Whatsapp } from '$lib/icons';
  import { toast } from '$lib/stores/ui';
  import { addDaysISODate, todayISODateLocal } from '$lib/date';
  import { toUserMessage } from '$lib/utils/errors';
  import { ApiError, apiFetch, apiGet, apiPatch, isCanceledApiError } from '$lib/services/api';
  import { ensureServerSessionCookie } from '$lib/services/session';

  const orcamentoId = $page.params.id ?? '';

  // ─── Tipos ───────────────────────────────────────────────────────────────────
  interface ClienteOption {
    id: string;
    nome: string;
    email?: string | null;
    telefone?: string | null;
    cpf?: string | null;
  }

  // ─── Estado do formulário ───────────────────────────────────────────────────
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

  let loading = true;
  let saving = false;
  let errors: Record<string, string> = {};
  let orcamentoOriginal: Record<string, unknown> | null = null;

  // ─── Busca de cliente (lazy) ─────────────────────────────────────────────────
  let searchClienteQuery = '';
  let showClienteSearch = false;
  let loadingClientes = false;
  let clientesFiltrados: ClienteOption[] = [];
  let searchDebounceTimer: ReturnType<typeof setTimeout> | null = null;
  let loadController: AbortController | null = null;
  let searchController: AbortController | null = null;
  let loadSeq = 0;
  let searchSeq = 0;
  let destroyed = false;

  // ─── Helpers de itens ───────────────────────────────────────────────────────
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

  interface OrcamentoEditClientePayload {
    nome?: string | null;
    email?: string | null;
  }

  interface OrcamentoEditPayload extends Record<string, unknown> {
    client_id?: string | null;
    client_name?: string | null;
    client_whatsapp?: string | null;
    client_email?: string | null;
    cliente_email?: string | null;
    status?: string | null;
    status_negociacao?: string | null;
    currency?: string | null;
    valid_until?: string | null;
    data_validade?: string | null;
    notes?: string | null;
    observacoes?: string | null;
    cliente?: OrcamentoEditClientePayload | string | null;
    itens?: Record<string, unknown>[] | null;
  }

  // ─── Carregar orçamento existente ───────────────────────────────────────────────
  async function carregarOrcamento() {
    loadController?.abort();
    const controller = new AbortController();
    loadController = controller;
    const seq = ++loadSeq;
    try {
      loading = true;
      const data = await apiFetch<OrcamentoEditPayload>(`/api/v1/orcamentos/${orcamentoId}`, {
        redirectOnUnauthorized: false,
        redirectOnForbidden: false,
        signal: controller.signal
      });
      if (seq !== loadSeq || destroyed) return;
      orcamentoOriginal = data;
      const clientePayload = data.cliente && typeof data.cliente === 'object' ? data.cliente : null;

      const itensCarregados: ItemOrcamento[] = (Array.isArray(data.itens) ? data.itens : []).map(
        (item: Record<string, unknown>, index: number) => ({
          id: String(item.id ?? ''),
          title: formatarDescricaoItem(
            String(item.item_type ?? 'servico'),
            String(item.title ?? item.descricao ?? '')
          ),
          product_name: String(item.product_name ?? item.produto ?? ''),
          item_type: String(item.item_type ?? 'servico'),
          isOpen: false,
          quantity: Number(item.quantity ?? item.quantidade ?? 1),
          unit_price: Number(item.unit_price ?? item.valor_unitario ?? 0),
          total_amount: Number(item.total_amount ?? item.valor_total ?? 0),
          city_name: String(item.city_name ?? item.cidade ?? ''),
          destino_geografico_id: String(item.destino_geografico_id ?? ''),
          order_index: Number(item.order_index ?? index),
          flightSegments: readQuoteFlightSegments(item.raw),
          ...lerDetalhes(item)
        })
      );

      formData = {
        client_id: String(data.client_id ?? ''),
        cliente_nome: String(data.client_name ?? clientePayload?.nome ?? data.cliente ?? ''),
        cliente_telefone: String(data.client_whatsapp ?? ''),
        cliente_email: String(
          data.client_email ?? clientePayload?.email ?? data.cliente_email ?? ''
        ),
        status: String(data.status ?? 'pendente'),
        status_negociacao: String(data.status_negociacao ?? data.status ?? 'novo'),
        currency: String(data.currency ?? 'BRL'),
        valid_until: String(data.valid_until ?? data.data_validade ?? ''),
        notes: String(data.notes ?? data.observacoes ?? ''),
        itens: itensCarregados.length > 0 ? itensCarregados : [makeItem(0)]
      };
    } catch (err: unknown) {
      if (isCanceledApiError(err)) return;
      if (seq !== loadSeq || destroyed) return;
      if (err instanceof ApiError && err.status === 401) {
        toast.error('Sessão expirada. Faça login novamente para continuar.');
        const next = `${$page.url.pathname}${$page.url.search}`;
        await goto(`/auth/login?session_expired=1&next=${encodeURIComponent(next)}`);
        return;
      }
      if (err instanceof ApiError && err.status === 403) {
        toast.error(err.message || 'Você não tem permissão para editar este orçamento.');
        await goto('/orcamentos');
        return;
      }
      if (err instanceof ApiError && err.status === 404) {
        toast.error(err.message || 'Orçamento não encontrado.');
        await goto('/orcamentos');
        return;
      }
      toast.error(toUserMessage(err, 'Erro ao carregar orçamento'));
      goto('/orcamentos');
    } finally {
      if (seq === loadSeq && !destroyed) loading = false;
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

  function handleSearchBlur() {
    setTimeout(() => {
      showClienteSearch = false;
    }, 200);
  }

  function selecionarCliente(cliente: ClienteOption) {
    formData.client_id = cliente.id;
    formData.cliente_nome = cliente.nome;
    formData.cliente_telefone = cliente.telefone ?? '';
    formData.cliente_email = cliente.email ?? '';
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

  // ─── Sincronizar status ───────────────────────────────────────────────────────
  $: formData.status = formData.status_negociacao;

  // ─── Validade ─────────────────────────────────────────────────────────────────
  function setValidadeDias(dias: number) {
    formData.valid_until = addDaysISODate(todayISODateLocal(), dias);
  }

  onMount(() => {
    void (async () => {
      await ensureServerSessionCookie();
      await carregarOrcamento();
    })();
  });

  onDestroy(() => {
    destroyed = true;
    loadSeq += 1;
    searchSeq += 1;
    loadController?.abort();
    searchController?.abort();
    if (searchDebounceTimer) clearTimeout(searchDebounceTimer);
  });

  // ─── Validação ────────────────────────────────────────────────────────────────
  function validateForm(): boolean {
    errors = {};
    if (!formData.cliente_nome.trim()) errors.cliente = 'Informe o nome do cliente';
    if (!formData.valid_until) errors.valid_until = 'Data de validade é obrigatória';
    const hasItensValidos = formData.itens.some((i) => i.title?.trim() && i.total_amount > 0);
    if (!hasItensValidos) errors.itens = 'Adicione pelo menos um item válido com descrição e valor';
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
        total: valorTotal,
        itens: formData.itens.map((item) => ({
          id: item.id || undefined,
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
            aereo_import: supportsFlightSegments(item.item_type)
              ? { segmentos: item.flightSegments }
              : null
          },
          ...campoGeografico(item.destino_geografico_id),
          order_index: item.order_index
        }))
      };

      await apiPatch(`/api/v1/orcamentos/${orcamentoId}`, payload);

      toast.success(
        enviar ? 'Orçamento atualizado e enviado ao cliente!' : 'Orçamento atualizado com sucesso!'
      );
      goto(`/orcamentos/${orcamentoId}`);
    } catch (err: unknown) {
      toast.error(toUserMessage(err, 'Erro ao salvar orçamento'));
    } finally {
      saving = false;
    }
  }

  // ─── Formatação ───────────────────────────────────────────────────────────────
  const CURRENCY_FORMATTERS = new Map<string, Intl.NumberFormat>();

  function getCurrencyFormatter(currency: string) {
    const cached = CURRENCY_FORMATTERS.get(currency);
    if (cached) return cached;
    const formatter = new Intl.NumberFormat('pt-BR', {
      style: 'currency',
      currency
    });
    CURRENCY_FORMATTERS.set(currency, formatter);
    return formatter;
  }

  function formatCurrency(value: number): string {
    return getCurrencyFormatter(formData.currency || 'BRL').format(value || 0);
  }

  const statusOptions = [
    { value: 'novo', label: 'Novo' },
    { value: 'pendente', label: 'Pendente' },
    { value: 'enviado', label: 'Enviado' },
    { value: 'aprovado', label: 'Aprovado' },
    { value: 'rejeitado', label: 'Rejeitado' },
    { value: 'expirado', label: 'Expirado' }
  ];
</script>

<svelte:head>
  <title>Editar Orçamento | VTUR</title>
</svelte:head>

{#if loading}
  <LoadingState />
{:else}
  <PageHeader
    title="Editar Orçamento"
    subtitle={`Orçamento: ${(orcamentoOriginal?.codigo as string) || orcamentoId.slice(0, 8)}`}
    color="orcamentos"
    breadcrumbs={[
      { label: 'Orçamentos', href: '/orcamentos' },
      {
        label: (orcamentoOriginal?.codigo as string) || 'Detalhe',
        href: `/orcamentos/${orcamentoId}`
      },
      { label: 'Editar' }
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
          <label
            for="orcamento-editar-cliente"
            class="mb-1 block text-sm font-medium text-slate-700"
          >
            Vincular cliente cadastrado <span class="font-normal text-slate-400">(opcional)</span>
          </label>

          {#if formData.client_id}
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
            <div class="relative">
              <FieldInput
                id="orcamento-editar-cliente"
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
      <div class="grid grid-cols-1 gap-4 md:grid-cols-3">
        <FieldSelect
          label="Status"
          bind:value={formData.status_negociacao}
          options={statusOptions}
        />

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
                class_name="rounded-lg! px-3! py-2! text-xs">{dias}d</Button
              >
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

    <!-- ── Itens ─────────────────────────────────────────────────────────────────── -->
    <Card header="Itens do Orçamento" color="orcamentos">
      <div class="space-y-3">
        {#each formData.itens as item, index}
          <div class="flex items-start gap-3">
            <div class="min-w-0 flex-1">
              <details
                bind:open={item.isOpen}
                class="rounded-lg border border-slate-200 bg-slate-50"
              >
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
                    prefix={`orcamento-editar-item-${index}`}
                    currency={formData.currency}
                    onChange={() => recalcularItem(index)}
                  />
                </div>
              </details>
              {#if errors[`item-${index}`]}
                <p role="alert" class="mt-2 text-sm text-red-600">{errors[`item-${index}`]}</p>
              {/if}
            </div>

            {#if formData.itens.length > 1}
              <Button
                type="button"
                variant="ghost"
                size="sm"
                on:click={() => removeItem(index)}
                class_name="mt-2 shrink-0 text-red-400 hover:text-red-600"
                ariaLabel="Remover item"
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
        on:click={() => goto(`/orcamentos/${orcamentoId}`)}
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
        Salvar Alterações
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
{/if}
