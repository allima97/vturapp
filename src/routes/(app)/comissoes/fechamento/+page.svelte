<script lang="ts">
  import { onMount, onDestroy } from 'svelte';
  import PageHeader from '$lib/components/ui/PageHeader.svelte';
  import Card from '$lib/components/ui/Card.svelte';
  import Button from '$lib/components/ui/Button.svelte';
  import DataTable from '$lib/components/ui/DataTable.svelte';
  import { BottomSheet, FieldInput, FieldSelect } from '$lib/components/ui';
  import KPICard from '$lib/components/kpis/KPICard.svelte';
  import { toast } from '$lib/stores/ui';
  import { apiGet } from '$lib/services/api';
  import {
    Calculator,
    DollarSign,
    RefreshCw,
    SlidersHorizontal,
    TrendingUp,
    Users
  } from '$lib/icons';
  import { parseISODateParts, todayISODateLocal } from '$lib/date';
  import { formatCurrency, formatDate } from '$lib/utils/formatters';
  import { createDebouncedReloader } from '$lib/utils/autoReload';
  import { toUserMessage } from '$lib/utils/errors';

  // ─── Tipos ──────────────────────────────────────────────────────────────────
  interface ComissaoItem {
    id: string;
    venda_id: string;
    numero_venda: string;
    vendedor_id: string;
    vendedor: string;
    cliente: string;
    data_venda: string;
    valor_venda: number;
    valor_comissionavel: number;
    percentual_aplicado: number;
    valor_comissao: number;
    status: string;
    mes_referencia: number;
    ano_referencia: number;
  }

  interface VendedorOption {
    id: string;
    nome_completo?: string;
    email?: string;
  }

  interface EmpresaOption {
    id: string;
    nome?: string | null;
    nome_fantasia?: string | null;
    razao_social?: string | null;
  }

  interface ComissoesResponse {
    items?: ComissaoItem[] | null;
  }

  interface VendedoresResponse {
    items?: VendedorOption[] | null;
  }

  // ─── Estado ─────────────────────────────────────────────────────────────────
  let comissoes: ComissaoItem[] = [];
  let vendedores: VendedorOption[] = [];
  let empresas: EmpresaOption[] = [];
  let loading = true;

  const todayParts = parseISODateParts(todayISODateLocal());
  let filtroMes = todayParts?.month || new Date().getMonth() + 1;
  let filtroMesValue = String(filtroMes);
  let filtroAno = todayParts?.year || new Date().getFullYear();
  let filtroVendedor = '';
  let filtroStatus = 'todas';
  let empresaId = '';

  let abortController: AbortController | null = null;
  let autoReloadEnabled = false;
  let lastAutoReloadKey = '';
  let showFilterSheet = false;
  const autoReload = createDebouncedReloader(() => {
    void load();
    void loadVendedores();
  }, 250);

  // ─── KPIs derivados ───────────────────────────────────────────────────────
  $: comissoesStats = comissoes.reduce(
    (acc, c) => {
      acc.totalComissoes += c.valor_comissao;
      acc.totalVendas += c.valor_venda;
      if (c.status === 'PENDENTE' || c.status === 'pendente') acc.pendentes += 1;
      acc.vendedores.add(c.vendedor_id);
      return acc;
    },
    { totalComissoes: 0, totalVendas: 0, pendentes: 0, vendedores: new Set<string>() }
  );
  $: totalComissoes = comissoesStats.totalComissoes;
  $: totalVendas = comissoesStats.totalVendas;
  $: pendentes = comissoesStats.pendentes;
  $: vendedoresUnicos = comissoesStats.vendedores.size;

  // ─── Colunas da tabela ──────────────────────────────────────────────────────
  function formatCurrencySafe(value: number) {
    return formatCurrency(value || 0);
  }

  const columns = [
    { key: 'numero_venda', label: 'Venda', sortable: true, width: '120px' },
    { key: 'vendedor', label: 'Vendedor', sortable: true },
    { key: 'cliente', label: 'Cliente', sortable: true },
    {
      key: 'data_venda',
      label: 'Data',
      sortable: true,
      width: '110px',
      formatter: (v: string) => formatDate(v)
    },
    {
      key: 'valor_venda',
      label: 'Valor Venda',
      sortable: true,
      align: 'right' as const,
      formatter: (v: number) => formatCurrencySafe(v)
    },
    {
      key: 'percentual_aplicado',
      label: '%',
      sortable: true,
      width: '70px',
      align: 'center' as const,
      formatter: (v: number) => `${v ?? 10}%`
    },
    {
      key: 'valor_comissao',
      label: 'Comissão',
      sortable: true,
      align: 'right' as const,
      formatter: (v: number) => formatCurrencySafe(v)
    },
    {
      key: 'status',
      label: 'Status',
      sortable: true,
      width: '110px',
      formatter: (v: string) => {
        const norm = v?.toLowerCase();
        const styles: Record<string, string> = {
          pendente: 'bg-amber-100 text-amber-700',
          pago: 'bg-green-100 text-green-700',
          cancelada: 'bg-red-100 text-red-700'
        };
        const labels: Record<string, string> = {
          pendente: 'Pendente',
          pago: 'Pago',
          cancelada: 'Cancelada'
        };
        return `<span class="inline-flex rounded-full px-2.5 py-1 text-xs font-semibold ${
          styles[norm] ?? 'bg-slate-100 text-slate-600'
        }">${labels[norm] ?? v}</span>`;
      }
    }
  ];

  // ─── Fetch com AbortController ────────────────────────────────────────────────
  async function load() {
    if (abortController) abortController.abort();
    abortController = new AbortController();

    loading = true;
    try {
      const data = await apiGet<ComissoesResponse>(
        '/api/v1/financeiro/comissoes/calcular',
        {
          status: filtroStatus !== 'todas' ? filtroStatus : undefined,
          mes: filtroMes,
          ano: filtroAno,
          vendedor_id: filtroVendedor || undefined,
          empresa_id: empresaId || undefined
        },
        abortController.signal
      );
      comissoes = data.items ?? [];
    } catch (err: unknown) {
      if (err instanceof DOMException && err.name === 'AbortError') return;
      toast.error(toUserMessage(err, 'Erro ao carregar comissões.'));
    } finally {
      loading = false;
    }
  }

  async function loadVendedores() {
    try {
      const data = await apiGet<VendedoresResponse>('/api/v1/financeiro/comissoes/vendedores', {
        empresa_id: empresaId || undefined
      });
      vendedores = Array.isArray(data.items) ? data.items : [];
      if (filtroVendedor && !vendedores.some((v) => v.id === filtroVendedor)) {
        filtroVendedor = '';
      }
    } catch {
      /* silencioso */
    }
  }

  async function loadUserContext() {
    try {
      const data = await apiGet<{
        company_id?: string | null;
        empresas?: EmpresaOption[];
      }>('/api/v1/user/context');

      empresas = Array.isArray(data.empresas) ? data.empresas : [];
      empresaId = String(data.company_id || '').trim() || empresas[0]?.id || '';
    } catch {
      empresas = [];
      empresaId = '';
    }
  }

  function handleExport() {
    if (comissoes.length === 0) {
      toast.info('Nenhuma comissão para exportar.');
      return;
    }
    const headers = [
      'Venda',
      'Vendedor',
      'Cliente',
      'Data',
      'Valor Venda',
      '%',
      'Comissão',
      'Status'
    ];
    const rows = comissoes.map((c) => [
      c.numero_venda,
      c.vendedor,
      c.cliente,
      c.data_venda ? formatDate(c.data_venda) : '',
      c.valor_venda.toFixed(2),
      c.percentual_aplicado ?? 10,
      c.valor_comissao.toFixed(2),
      c.status
    ]);
    const csv = [headers.join(';'), ...rows.map((r) => r.join(';'))].join('\n');
    const blob = new Blob(['\uFEFF' + csv], { type: 'text/csv;charset=utf-8;' });
    const link = document.createElement('a');
    link.href = URL.createObjectURL(blob);
    link.download = `fechamento_comissoes_${filtroMes}_${filtroAno}.csv`;
    link.click();
    toast.success('Exportado com sucesso.');
  }

  onMount(async () => {
    await loadUserContext();
    await Promise.all([load(), loadVendedores()]);
    lastAutoReloadKey = buildAutoReloadKey();
    autoReloadEnabled = true;
  });

  onDestroy(() => {
    if (abortController) abortController.abort();
    autoReload.cancel();
  });

  function buildAutoReloadKey() {
    return [empresaId, filtroMes, filtroAno, filtroStatus, filtroVendedor].join('|');
  }

  function scheduleAutoReload() {
    autoReload.schedule();
  }

  const MONTH_NAME_FORMATTER = new Intl.DateTimeFormat('pt-BR', {
    month: 'long',
    timeZone: 'UTC'
  });

  function formatMonthName(month: number) {
    return MONTH_NAME_FORMATTER.format(new Date(Date.UTC(2024, month - 1, 1)));
  }

  function buildMonthOptions() {
    return Array.from({ length: 12 }, (_, i) => ({
      value: String(i + 1),
      label: formatMonthName(i + 1)
    }));
  }

  $: {
    const parsedMonth = Number.parseInt(filtroMesValue, 10);
    filtroMes =
      Number.isInteger(parsedMonth) && parsedMonth >= 1 && parsedMonth <= 12
        ? parsedMonth
        : todayParts?.month || new Date().getMonth() + 1;
  }

  const statusOptions = [
    { value: 'todas', label: 'Todas' },
    { value: 'pendente', label: 'Pendentes' },
    { value: 'pago', label: 'Pagas' },
    { value: 'cancelada', label: 'Canceladas' }
  ];

  $: vendedorOptions = [
    { value: '', label: 'Todos' },
    ...vendedores.map((v) => ({
      value: v.id,
      label: v.nome_completo || v.email || v.id
    }))
  ];
  $: empresaOptions = empresas.map((empresa) => ({
    value: empresa.id,
    label: empresa.nome_fantasia || empresa.nome || empresa.razao_social || empresa.id
  }));
  $: canSelectEmpresa = empresaOptions.length > 1;
  // O $: do modo legado só reage às variáveis escritas nesta linha (não enxerga dentro de
  // buildAutoReloadKey()). Por isso a mesma expressão da função fica aqui, idêntica.
  $: autoReloadKey = [empresaId, filtroMes, filtroAno, filtroStatus, filtroVendedor].join('|');
  $: if (autoReloadEnabled && autoReloadKey !== lastAutoReloadKey) {
    lastAutoReloadKey = autoReloadKey;
    scheduleAutoReload();
  }
</script>

<svelte:head>
  <title>Fechamento de Comissões | VTUR</title>
</svelte:head>

<PageHeader
  title="Fechamento de Comissões"
  subtitle="Visualize e exporte o fechamento de comissões por período e vendedor."
  color="comissoes"
  breadcrumbs={[{ label: 'Comissões', href: '/comissoes' }, { label: 'Fechamento' }]}
  actions={[{ label: 'Atualizar', onClick: load, variant: 'secondary', icon: RefreshCw }]}
/>

<!-- KPIs -->
<div class="vtur-kpi-grid mb-6">
  <KPICard
    title="Total comissões"
    value={formatCurrencySafe(totalComissoes)}
    color="comissoes"
    icon={DollarSign}
  />
  <KPICard
    title="Total vendas"
    value={formatCurrencySafe(totalVendas)}
    color="comissoes"
    icon={TrendingUp}
  />
  <KPICard title="Pendentes" value={pendentes} color="comissoes" icon={Calculator} />
  <KPICard title="Vendedores" value={vendedoresUnicos} color="comissoes" icon={Users} />
</div>

<!-- Mobile: botão de filtros -->
<div class="mb-4 sm:hidden">
  <Button variant="secondary" class_name="w-full" on:click={() => (showFilterSheet = true)}>
    <SlidersHorizontal size={16} class="mr-2" />
    Filtros
    {#if filtroVendedor || filtroStatus !== 'todas'}
      <span class="bg-comissoes-500 ml-2 inline-flex h-2 w-2 rounded-full"></span>
    {/if}
  </Button>
</div>

<!-- Filtros -->
<Card color="comissoes" class="mb-6 hidden sm:block">
  <div class="flex flex-wrap items-end gap-4">
    <FieldSelect
      id="fech-mes"
      label="Mês"
      bind:value={filtroMesValue}
      options={buildMonthOptions()}
      placeholder={null}
    />
    <FieldInput
      id="fech-ano"
      label="Ano"
      type="number"
      bind:value={filtroAno}
      min="2020"
      max="2100"
      class_name="w-24"
    />
    {#if canSelectEmpresa}
      <FieldSelect
        id="fech-empresa"
        label="Empresa"
        bind:value={empresaId}
        options={empresaOptions}
        placeholder={null}
      />
    {/if}
    <FieldSelect
      id="fech-status"
      label="Status"
      bind:value={filtroStatus}
      options={statusOptions}
      placeholder={null}
    />
    <FieldSelect
      id="fech-vendedor"
      label="Vendedor"
      bind:value={filtroVendedor}
      options={vendedorOptions}
      placeholder={null}
    />
    <Button variant="secondary" on:click={handleExport}>Exportar CSV</Button>
  </div>
</Card>

<BottomSheet bind:open={showFilterSheet} title="Filtrar Fechamento de Comissões">
  <div class="space-y-4">
    <FieldSelect
      id="fech-mes-mobile"
      label="Mês"
      bind:value={filtroMesValue}
      options={buildMonthOptions()}
      placeholder={null}
      class_name="w-full"
    />
    <FieldInput
      id="fech-ano-mobile"
      label="Ano"
      type="number"
      bind:value={filtroAno}
      min="2020"
      max="2100"
      class_name="w-full"
    />
    {#if canSelectEmpresa}
      <FieldSelect
        id="fech-empresa-mobile"
        label="Empresa"
        bind:value={empresaId}
        options={empresaOptions}
        placeholder={null}
        class_name="w-full"
      />
    {/if}
    <FieldSelect
      id="fech-status-mobile"
      label="Status"
      bind:value={filtroStatus}
      options={statusOptions}
      placeholder={null}
      class_name="w-full"
    />
    <FieldSelect
      id="fech-vendedor-mobile"
      label="Vendedor"
      bind:value={filtroVendedor}
      options={vendedorOptions}
      placeholder={null}
      class_name="w-full"
    />
  </div>
  <Button variant="primary" class_name="w-full mt-2" on:click={() => (showFilterSheet = false)}>
    Aplicar filtros
  </Button>
</BottomSheet>

<!-- Tabela -->
<DataTable
  {columns}
  data={comissoes}
  color="financeiro"
  {loading}
  title={`Fechamento ${filtroMes}/${filtroAno} — ${comissoes.length} registros`}
  searchable={true}
  exportable={true}
  onExport={handleExport}
  emptyMessage="Nenhuma comissão encontrada para o período"
/>
