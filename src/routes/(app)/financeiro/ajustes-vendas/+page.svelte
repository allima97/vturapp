<script lang="ts">
  import { onDestroy, onMount } from 'svelte';
  import PageHeader from '$lib/components/ui/PageHeader.svelte';
  import Card from '$lib/components/ui/Card.svelte';
  import Button from '$lib/components/ui/Button.svelte';
  import Dialog from '$lib/components/ui/Dialog.svelte';
  import DataTable from '$lib/components/ui/DataTable.svelte';
  import { FieldInput, FieldSelect, BottomSheet } from '$lib/components/ui';
  import { toast } from '$lib/stores/ui';
  import { permissoes } from '$lib/stores/permissoes';
  import { RefreshCw, RotateCcw, Search, SlidersHorizontal } from '$lib/icons';
  import { todayISODateLocal } from '$lib/date';
  import { formatDate } from '$lib/utils/formatters';
  import { escapeHtml } from '$lib/utils/html';
  import { apiGet, apiPost } from '$lib/services/api';
  import { toUserMessage } from '$lib/utils/errors';
  import { createDebouncedReloader } from '$lib/utils/autoReload';

  type AjusteItem = {
    id: string;
    recibo_tipo?: string;
    recibo_origem_id: string;
    venda_id: string;
    numero_recibo: string;
    data_venda: string | null;
    valor_total: number;
    valor_taxas: number;
    vendedor_origem_id: string;
    vendedor_origem_nome: string;
    cliente_nome: string;
    produto_nome?: string;
    rateio: {
      id: string;
      ativo: boolean;
      vendedor_destino_id: string;
      vendedor_destino_nome?: string;
      percentual_origem: number;
      percentual_destino: number;
      observacao: string | null;
      vendedor_destino?: { nome_completo?: string | null } | null;
    } | null;
  };

  type Vendedor = { id: string; nome_completo: string | null };
  type EmpresaOption = { id: string; nome: string };

  let items: AjusteItem[] = [];
  let vendedores: Vendedor[] = [];
  let empresas: EmpresaOption[] = [];
  let empresaId = '';
  let loading = true;
  let modalOpen = false;
  let saving = false;
  let selectedItem: AjusteItem | null = null;
  let clearing = false;

  let inicio = (() => {
    const d = todayISODateLocal();
    return `${d.slice(0, 7)}-01`;
  })();
  let fim = todayISODateLocal();
  let filtroVendedor = '';
  let filtroApenasRateados = 'false';
  let busca = '';
  let autoReloadEnabled = false;
  let lastAutoReloadKey = '';
  let showFilterSheet = false;
  const autoReload = createDebouncedReloader(() => load({ silent: true }), 300);

  let form = { vendedor_destino_id: '', percentual_destino: '50', observacao: '' };
  const BRL_CURRENCY_FORMATTER = new Intl.NumberFormat('pt-BR', {
    style: 'currency',
    currency: 'BRL'
  });

  $: canEdit =
    !$permissoes.ready ||
    $permissoes.isSystemAdmin ||
    $permissoes.isMaster ||
    $permissoes.isFinanceiro ||
    $permissoes.isGestor;

  $: empresaOptions = empresas.map((empresa) => ({
    value: empresa.id,
    label: empresa.nome
  }));

  $: canSelectEmpresa = empresaOptions.length > 1;

  function formatCurrency(value: number) {
    return BRL_CURRENCY_FORMATTER.format(value || 0);
  }

  const columns = [
    {
      key: 'numero_recibo',
      label: 'Recibo',
      sortable: true,
      width: '130px'
    },
    {
      key: 'cliente_nome',
      label: 'Cliente',
      sortable: true
    },
    {
      key: 'vendedor_origem_nome',
      label: 'Vendedor Origem',
      sortable: true,
      width: '160px'
    },
    {
      key: 'data_venda',
      label: 'Data Venda',
      sortable: true,
      width: '110px',
      formatter: (v: string | null) => formatDate(v)
    },
    {
      key: 'valor_total',
      label: 'Valor',
      sortable: true,
      align: 'right' as const,
      formatter: (v: number) => formatCurrency(v)
    },
    {
      key: 'rateio',
      label: 'Rateio',
      sortable: false,
      formatter: (_: unknown, row: AjusteItem) => {
        if (!row.rateio || !row.rateio.ativo)
          return '<span class="text-slate-400 text-xs">Sem rateio</span>';
        const nome =
          row.rateio.vendedor_destino_nome ||
          row.rateio.vendedor_destino?.nome_completo ||
          'Vendedor';
        return `<span class="text-xs">${escapeHtml(nome)} · ${Number(
          row.rateio.percentual_destino || 0
        )
          .toFixed(2)
          .replace('.', ',')}%</span>`;
      }
    }
  ];

  async function load(opts: { silent?: boolean } = {}) {
    const silent = opts.silent ?? false;
    if (!silent) loading = true;
    try {
      const payload = await apiGet<{ items?: AjusteItem[]; vendedores?: Vendedor[] }>(
        '/api/v1/financeiro/ajustes-vendas/list',
        {
          inicio,
          fim,
          company_id: empresaId || undefined,
          vendedor_id: filtroVendedor || undefined,
          apenas_rateados: filtroApenasRateados === 'true' ? 'true' : undefined,
          q: busca.trim() || undefined
        }
      );
      items = payload.items || [];
      vendedores = payload.vendedores || [];
    } catch (err) {
      toast.error(toUserMessage(err, 'Erro ao carregar ajustes.'));
    } finally {
      loading = false;
    }
  }

  function openEdit(item: AjusteItem) {
    selectedItem = item;
    form = {
      vendedor_destino_id: item.rateio?.vendedor_destino_id || '',
      percentual_destino: String(item.rateio?.percentual_destino ?? 50),
      observacao: item.rateio?.observacao || ''
    };
    modalOpen = true;
  }

  async function save() {
    if (!selectedItem) return;
    if (!form.vendedor_destino_id) {
      toast.error('Selecione o vendedor destino.');
      return;
    }

    saving = true;
    try {
      await apiPost('/api/v1/financeiro/ajustes-vendas', {
        ajuste_id: selectedItem.id,
        company_id: empresaId || undefined,
        vendedor_destino_id: form.vendedor_destino_id,
        percentual_destino: Number(form.percentual_destino),
        observacao: form.observacao
      });
      toast.success('Rateio salvo com sucesso.');
      modalOpen = false;
      await load({ silent: true });
    } catch (err) {
      toast.error(toUserMessage(err, 'Erro ao salvar rateio.'));
    } finally {
      saving = false;
    }
  }

  async function clearRateio() {
    if (!selectedItem?.rateio?.ativo) return;

    clearing = true;
    try {
      await apiPost('/api/v1/financeiro/ajustes-vendas', {
        ajuste_id: selectedItem.id,
        company_id: empresaId || undefined,
        percentual_destino: 0,
        observacao: form.observacao || 'Rateio desfeito'
      });
      toast.success('Rateio desfeito. O recibo voltou ao valor integral do vendedor de origem.');
      modalOpen = false;
      await load({ silent: true });
    } catch (err) {
      toast.error(toUserMessage(err, 'Erro ao desfazer rateio.'));
    } finally {
      clearing = false;
    }
  }

  async function loadUserContext() {
    try {
      const payload = await apiGet<{
        company_id?: string | null;
        empresas?: EmpresaOption[];
      }>('/api/v1/user/context');

      empresas = Array.isArray(payload.empresas)
        ? payload.empresas
            .map((empresa) => ({
              id: String(empresa?.id || '').trim(),
              nome: String(empresa?.nome || 'Empresa sem nome').trim() || 'Empresa sem nome'
            }))
            .filter((empresa) => empresa.id)
        : [];
      empresaId = String(payload.company_id || '').trim() || empresas[0]?.id || '';
    } catch (err) {
      empresas = [];
      empresaId = '';
      toast.error(toUserMessage(err, 'Erro ao carregar empresas.'));
    }
  }

  async function handleEmpresaChange() {
    filtroVendedor = '';
    selectedItem = null;
    modalOpen = false;
    await load();
  }

  onMount(() => {
    void (async () => {
      await loadUserContext();
      await load();
      lastAutoReloadKey = buildAutoReloadKey();
      autoReloadEnabled = true;
    })();
  });

  onDestroy(() => {
    autoReload.cancel();
  });

  function buildAutoReloadKey() {
    return [empresaId, inicio, fim, filtroVendedor, filtroApenasRateados, busca.trim()].join('|');
  }

  function scheduleAutoReload() {
    autoReload.schedule();
  }

  // O $: do modo legado só reage às variáveis escritas nesta linha (não enxerga dentro de
  // buildAutoReloadKey()). Por isso a mesma expressão da função fica aqui, idêntica.
  $: autoReloadKey = [
    empresaId,
    inicio,
    fim,
    filtroVendedor,
    filtroApenasRateados,
    busca.trim()
  ].join('|');
  $: if (autoReloadEnabled && autoReloadKey !== lastAutoReloadKey) {
    lastAutoReloadKey = autoReloadKey;
    scheduleAutoReload();
  }
</script>

<svelte:head>
  <title>Ajustes de Vendas | VTUR</title>
</svelte:head>

<PageHeader
  title="Ajustes de Vendas"
  subtitle="Configure o rateio de comissões entre vendedores para recibos específicos."
  color="financeiro"
  breadcrumbs={[{ label: 'Financeiro', href: '/financeiro' }, { label: 'Ajustes de Vendas' }]}
  actions={[{ label: 'Atualizar', onClick: () => load(), variant: 'secondary', icon: RefreshCw }]}
/>

<!-- Mobile: botão de filtros -->
<div class="mb-4 sm:hidden">
  <Button variant="secondary" class_name="w-full" on:click={() => (showFilterSheet = true)}>
    <SlidersHorizontal size={16} class="mr-2" />
    Filtros
    {#if filtroVendedor || filtroApenasRateados !== 'false' || busca}
      <span class="bg-financeiro-500 ml-2 inline-flex h-2 w-2 rounded-full"></span>
    {/if}
  </Button>
</div>

<BottomSheet bind:open={showFilterSheet} title="Filtrar ajustes">
  <div class="flex flex-col gap-4">
    {#if canSelectEmpresa}
      <FieldSelect
        id="aj-empresa-mobile"
        label="Empresa"
        bind:value={empresaId}
        options={empresaOptions}
        placeholder={null}
        class_name="w-full"
        on:change={handleEmpresaChange}
      />
    {/if}
    <FieldInput
      id="aj-inicio-mobile"
      label="Data início"
      type="date"
      bind:value={inicio}
      class_name="w-full"
    />
    <FieldInput
      id="aj-fim-mobile"
      label="Data fim"
      type="date"
      bind:value={fim}
      min={inicio || null}
      class_name="w-full"
    />
    <FieldSelect
      id="aj-vendedor-mobile"
      label="Vendedor"
      bind:value={filtroVendedor}
      options={[
        { value: '', label: 'Todos' },
        ...vendedores.map((v) => ({ value: v.id, label: v.nome_completo || 'Vendedor' }))
      ]}
      placeholder={null}
      class_name="w-full"
    />
    <FieldSelect
      id="aj-rateados-mobile"
      label="Rateio"
      bind:value={filtroApenasRateados}
      options={[
        { value: 'false', label: 'Todos' },
        { value: 'true', label: 'Apenas rateados' }
      ]}
      placeholder={null}
      class_name="w-full"
    />
    <FieldInput
      id="aj-busca-mobile"
      bind:value={busca}
      icon={Search}
      placeholder="Buscar..."
      class_name="w-full"
    />
    <Button variant="primary" class_name="w-full mt-2" on:click={() => (showFilterSheet = false)}>
      Aplicar filtros
    </Button>
  </div>
</BottomSheet>

<Card color="financeiro" class="mb-6 hidden sm:block">
  <div class="flex flex-wrap items-end gap-4">
    {#if canSelectEmpresa}
      <FieldSelect
        id="aj-empresa"
        label="Empresa"
        bind:value={empresaId}
        options={empresaOptions}
        placeholder={null}
        class_name="min-w-[240px]"
        on:change={handleEmpresaChange}
      />
    {/if}
    <FieldInput
      id="aj-inicio"
      label="Data início"
      type="date"
      bind:value={inicio}
      class_name="min-w-[160px]"
    />
    <FieldInput
      id="aj-fim"
      label="Data fim"
      type="date"
      bind:value={fim}
      min={inicio || null}
      class_name="min-w-[160px]"
    />
    <FieldSelect
      id="aj-vendedor"
      label="Vendedor"
      bind:value={filtroVendedor}
      options={[
        { value: '', label: 'Todos' },
        ...vendedores.map((v) => ({ value: v.id, label: v.nome_completo || 'Vendedor' }))
      ]}
      placeholder={null}
      class_name="min-w-[200px]"
    />
    <FieldSelect
      id="aj-rateados"
      label="Rateio"
      bind:value={filtroApenasRateados}
      options={[
        { value: 'false', label: 'Todos' },
        { value: 'true', label: 'Apenas rateados' }
      ]}
      placeholder={null}
      class_name="min-w-[180px]"
    />
    <FieldInput
      bind:value={busca}
      icon={Search}
      placeholder="Buscar..."
      class_name="min-w-[200px]"
    />
  </div>
</Card>

<DataTable
  {columns}
  data={items}
  color="financeiro"
  {loading}
  title="Recibos disponíveis para rateio"
  searchable={false}
  emptyMessage="Nenhum recibo encontrado para o período"
  onRowClick={canEdit ? (row) => openEdit(row) : undefined}
/>

<Dialog
  bind:open={modalOpen}
  title="Configurar Rateio"
  color="financeiro"
  size="md"
  showCancel={true}
  cancelText="Cancelar"
  showConfirm={true}
  confirmText="Salvar Rateio"
  loading={saving}
  onConfirm={save}
  onCancel={() => (modalOpen = false)}
>
  {#if selectedItem}
    <div class="space-y-4">
      <div class="rounded-xl border border-slate-200 bg-slate-50 p-4 text-sm">
        <p class="font-semibold text-slate-900">{selectedItem.cliente_nome}</p>
        <p class="text-slate-600">
          Recibo: {selectedItem.numero_recibo} · {formatCurrency(selectedItem.valor_total)}
        </p>
        <p class="text-slate-500">Vendedor origem: {selectedItem.vendedor_origem_nome}</p>
      </div>

      {#if selectedItem.rateio?.ativo}
        <div class="flex justify-end">
          <Button
            variant="outline"
            color="red"
            size="sm"
            loading={clearing}
            disabled={saving}
            on:click={clearRateio}
          >
            <RotateCcw class="mr-2 h-4 w-4" />
            Desfazer rateio
          </Button>
        </div>
      {/if}

      <FieldSelect
        id="rateio-destino"
        label="Vendedor destino"
        bind:value={form.vendedor_destino_id}
        options={vendedores
          .filter((v) => v.id !== selectedItem?.vendedor_origem_id)
          .map((v) => ({ value: v.id, label: v.nome_completo || 'Vendedor' }))}
        placeholder="Selecione uma opção"
        required={true}
        class_name="w-full"
      />

      <FieldInput
        id="rateio-pct"
        label="% para o vendedor destino"
        type="number"
        min="1"
        max="99"
        step="1"
        bind:value={form.percentual_destino}
        class_name="w-full"
        helper="Origem ficará com {100 -
          Number(form.percentual_destino || 0)}% e destino com {form.percentual_destino}%."
      />

      <FieldInput
        id="rateio-obs"
        label="Observação"
        bind:value={form.observacao}
        placeholder="Motivo do rateio (opcional)"
        class_name="w-full"
      />
    </div>
  {/if}
</Dialog>
