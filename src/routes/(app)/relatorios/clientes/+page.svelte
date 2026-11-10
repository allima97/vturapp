<script lang="ts">
  import { onDestroy, onMount } from 'svelte';
  import { goto } from '$app/navigation';
  import type { ChartData } from 'chart.js';
  import PageHeader from '$lib/components/ui/PageHeader.svelte';
  import Card from '$lib/components/ui/Card.svelte';
  import DataTable from '$lib/components/ui/DataTable.svelte';
  import FilterPanel from '$lib/components/ui/FilterPanel.svelte';
  import { BottomSheet, Button, FieldInput, FieldSelect } from '$lib/components/ui';
  import ChartJS from '$lib/components/charts/ChartJS.svelte';
  import { ArrowLeft, SlidersHorizontal, Users, Wallet, TrendingUp, Star } from '$lib/icons';
  import { toast } from '$lib/stores/ui';
  import { permissoes } from '$lib/stores/permissoes';
  import { monthRangeFromKey, todayISODateLocal } from '$lib/date';
  import { formatCurrency, formatDate } from '$lib/utils/formatters';
  import { createDebouncedReloader } from '$lib/utils/autoReload';
  import { toUserMessage } from '$lib/utils/errors';
  import { apiGet, isCanceledApiError } from '$lib/services/api';

  interface ClienteRelatorio {
    cliente_id?: string;
    cliente: string;
    cpf: string | null;
    email: string | null;
    total_compras: number;
    total_gasto: number;
    ticket_medio: number;
    ultima_compra: string | null;
    frequencia: number;
    categoria: 'VIP' | 'Regular' | 'Ocasional';
  }

  interface EmpresaFiltro {
    id: string;
    nome: string;
  }

  interface VendedorFiltro {
    id: string;
    nome: string;
  }

  interface ClientesSummary {
    totalClientes: number;
    totalGasto: number;
    ticketMedioGeral: number;
    clientesVIP: number;
    categorias: {
      vip: number;
      regular: number;
      ocasional: number;
    };
  }

  interface ClientesRelatorioPayload {
    items?: ClienteRelatorio[] | null;
    total?: number | null;
    truncated?: boolean | null;
    summary?: Partial<ClientesSummary> | null;
  }

  type PeriodoModo = 'mes' | 'periodo';

  function getDefaultRange() {
    const today = todayISODateLocal();
    const monthRange = monthRangeFromKey(today.slice(0, 7));
    return {
      start: monthRange?.inicio || `${today.slice(0, 7)}-01`,
      end: monthRange?.fim || today
    };
  }

  const defaultRange = getDefaultRange();
  const defaultMonth = todayISODateLocal().slice(0, 7);
  const RELATORIO_PAGE_SIZE = 250;
  let clientes: ClienteRelatorio[] = [];
  let empresas: EmpresaFiltro[] = [];
  let vendedores: VendedorFiltro[] = [];
  let loading = true;
  let filtroPeriodoModo: PeriodoModo = 'mes';
  let mesSelecionado = defaultMonth;
  let dataInicio = defaultRange.start;
  let dataFim = defaultRange.end;
  let empresaSelecionada = '';
  let vendedorSelecionado = '';
  let categoriaSelecionada = '';
  let ordenacao = 'total_gasto';
  let autoReloadEnabled = false;
  let lastAutoReloadKey = '';
  let baseRequestSeq = 0;
  let baseAbortController: AbortController | null = null;
  let relatorioRequestSeq = 0;
  let relatorioAbortController: AbortController | null = null;
  let loadMoreAbortController: AbortController | null = null;
  let loadingMore = false;
  let totalRelatorioItems = 0;
  let relatorioTruncado = false;
  let showFilterSheet = false;
  let resumoClientes: ClientesSummary = {
    totalClientes: 0,
    totalGasto: 0,
    ticketMedioGeral: 0,
    clientesVIP: 0,
    categorias: { vip: 0, regular: 0, ocasional: 0 }
  };
  const autoReload = createDebouncedReloader(() => loadRelatorio(), 250);

  async function loadBase() {
    const requestSeq = ++baseRequestSeq;
    baseAbortController?.abort();
    const controller = new AbortController();
    baseAbortController = controller;
    try {
      const data = await apiGet<{ empresas?: EmpresaFiltro[]; vendedores?: VendedorFiltro[] }>(
        '/api/v1/relatorios/base',
        undefined,
        controller.signal,
        60_000
      );
      if (requestSeq !== baseRequestSeq) return;
      empresas = data.empresas || [];
      vendedores = data.vendedores || [];
    } catch (err) {
      if (isCanceledApiError(err)) return;
      if (requestSeq !== baseRequestSeq) return;
      empresas = [];
      vendedores = [];
      toast.error('Erro ao carregar filtros do relatório');
    } finally {
      if (requestSeq === baseRequestSeq && baseAbortController === controller) {
        baseAbortController = null;
      }
    }
  }

  const columns = [
    { key: 'cliente', label: 'Cliente', sortable: true },
    { key: 'cpf', label: 'CPF', sortable: false, width: '130px' },
    {
      key: 'categoria',
      label: 'Categoria',
      sortable: true,
      width: '110px',
      formatter: (value: string) => getCategoriaBadge(value)
    },
    {
      key: 'total_compras',
      label: 'Compras',
      sortable: true,
      align: 'center' as const,
      width: '90px'
    },
    {
      key: 'total_gasto',
      label: 'Total Gasto',
      sortable: true,
      align: 'right' as const,
      formatter: (value: number) => formatCurrency(value)
    },
    {
      key: 'ticket_medio',
      label: 'Ticket Medio',
      sortable: true,
      align: 'right' as const,
      formatter: (value: number) => formatCurrency(value)
    },
    {
      key: 'frequencia',
      label: 'Freq./Mes',
      sortable: true,
      align: 'center' as const,
      width: '100px',
      formatter: (value: number) => value.toFixed(1)
    },
    {
      key: 'ultima_compra',
      label: 'Ultima Compra',
      sortable: true,
      width: '130px',
      formatter: (value: string | null) => formatDate(value)
    }
  ];

  async function loadRelatorio(showSuccess = false) {
    const requestSeq = ++relatorioRequestSeq;
    relatorioAbortController?.abort();
    loadMoreAbortController?.abort();
    const controller = new AbortController();
    relatorioAbortController = controller;
    loading = true;

    try {
      const data = await apiGet<ClientesRelatorioPayload>(
        '/api/v1/relatorios/clientes',
        {
          data_inicio: dataInicio,
          data_fim: dataFim,
          empresa_id: empresaSelecionada || undefined,
          vendedor_id: vendedorSelecionado || undefined,
          categoria: categoriaSelecionada || undefined,
          ordenacao,
          items_limit: RELATORIO_PAGE_SIZE,
          items_offset: 0
        },
        controller.signal,
        90_000
      );
      if (requestSeq !== relatorioRequestSeq) return;
      clientes = data.items || [];
      totalRelatorioItems = Number(data.total || clientes.length || 0);
      relatorioTruncado = Boolean(data.truncated);
      resumoClientes = {
        totalClientes: Number(data.summary?.totalClientes || totalRelatorioItems || 0),
        totalGasto: Number(data.summary?.totalGasto || 0),
        ticketMedioGeral: Number(data.summary?.ticketMedioGeral || 0),
        clientesVIP: Number(data.summary?.clientesVIP || 0),
        categorias: {
          vip: Number(data.summary?.categorias?.vip || 0),
          regular: Number(data.summary?.categorias?.regular || 0),
          ocasional: Number(data.summary?.categorias?.ocasional || 0)
        }
      };

      if (showSuccess) {
        toast.success('Relatorio atualizado!');
      }
    } catch (err) {
      if (isCanceledApiError(err)) return;
      if (requestSeq !== relatorioRequestSeq) return;
      clientes = [];
      totalRelatorioItems = 0;
      relatorioTruncado = false;
      resumoClientes = {
        totalClientes: 0,
        totalGasto: 0,
        ticketMedioGeral: 0,
        clientesVIP: 0,
        categorias: { vip: 0, regular: 0, ocasional: 0 }
      };
      toast.error(toUserMessage(err, 'Erro ao carregar relatório de clientes'));
    } finally {
      if (requestSeq === relatorioRequestSeq) {
        loading = false;
        if (relatorioAbortController === controller) {
          relatorioAbortController = null;
        }
      }
    }
  }

  async function loadMoreRelatorio() {
    if (loadingMore || !relatorioTruncado) return;
    loadMoreAbortController?.abort();
    const controller = new AbortController();
    loadMoreAbortController = controller;
    loadingMore = true;

    try {
      const data = await apiGet<ClientesRelatorioPayload>(
        '/api/v1/relatorios/clientes',
        {
          data_inicio: dataInicio,
          data_fim: dataFim,
          empresa_id: empresaSelecionada || undefined,
          vendedor_id: vendedorSelecionado || undefined,
          categoria: categoriaSelecionada || undefined,
          ordenacao,
          items_limit: RELATORIO_PAGE_SIZE,
          items_offset: clientes.length
        },
        controller.signal,
        90_000
      );

      clientes = [...clientes, ...(data.items || [])];
      totalRelatorioItems = Number(data.total || totalRelatorioItems || clientes.length);
      relatorioTruncado = Boolean(data.truncated);
    } catch (err) {
      if (isCanceledApiError(err)) return;
      toast.error(toUserMessage(err, 'Erro ao carregar mais clientes'));
    } finally {
      loadingMore = false;
      if (loadMoreAbortController === controller) {
        loadMoreAbortController = null;
      }
    }
  }

  onMount(() => {
    void (async () => {
      // loadBase carrega filtros (empresas/vendedores); loadRelatorio não depende deles no mount.
      await Promise.all([loadBase(), loadRelatorio()]);
      lastAutoReloadKey = buildAutoReloadKey();
      autoReloadEnabled = true;
    })();
  });

  onDestroy(() => {
    baseAbortController?.abort();
    relatorioAbortController?.abort();
    loadMoreAbortController?.abort();
    autoReload.cancel();
  });

  function buildAutoReloadKey() {
    return [
      filtroPeriodoModo,
      mesSelecionado,
      dataInicio,
      dataFim,
      empresaSelecionada,
      vendedorSelecionado,
      categoriaSelecionada,
      ordenacao
    ].join('|');
  }

  function scheduleAutoReload() {
    autoReload.schedule();
  }

  function getCategoriaBadge(categoria: string): string {
    const styles: Record<string, string> = {
      VIP: 'bg-financeiro-500 text-white',
      Regular: 'bg-financeiro-100 text-financeiro-700',
      Ocasional: 'bg-slate-100 text-slate-700'
    };

    return `<span class="inline-flex px-2 py-1 text-xs font-medium rounded-full ${styles[categoria] || 'bg-slate-100 text-slate-700'}">${categoria}</span>`;
  }

  function handleExport() {
    if (clientesFiltrados.length === 0) {
      toast.info('Não há dados para exportar');
      return;
    }

    const headers = [
      'Cliente',
      'Categoria',
      'Compras',
      'Total Gasto',
      'Ticket Médio',
      'Frequência',
      'Última Compra'
    ];
    const rows = clientesFiltrados.map((cliente) => [
      cliente.cliente,
      cliente.categoria,
      cliente.total_compras,
      cliente.total_gasto.toFixed(2).replace('.', ','),
      cliente.ticket_medio.toFixed(2).replace('.', ','),
      cliente.frequencia.toFixed(2).replace('.', ','),
      cliente.ultima_compra ? formatDate(cliente.ultima_compra) : ''
    ]);

    const csv = ['\uFEFF' + headers.join(';'), ...rows.map((row) => row.join(';'))].join('\n');
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
    const link = document.createElement('a');
    link.href = URL.createObjectURL(blob);
    link.download = `relatorio_clientes_${todayISODateLocal()}.csv`;
    link.click();
    toast.success('Relatório exportado com sucesso');
  }

  function handleRowClick(row: ClienteRelatorio) {
    if (row.cliente_id) {
      void goto(`/clientes/${row.cliente_id}`);
    }
  }

  $: clientesFiltrados = clientes;
  $: totalClientes = resumoClientes.totalClientes;
  $: clientesAgregados = {
    totalGasto: resumoClientes.totalGasto,
    vip: resumoClientes.categorias.vip,
    regular: resumoClientes.categorias.regular,
    ocasional: resumoClientes.categorias.ocasional
  };
  $: totalGasto = resumoClientes.totalGasto;
  $: ticketMedioGeral = resumoClientes.ticketMedioGeral;
  $: clientesVIP = resumoClientes.clientesVIP;

  $: if (filtroPeriodoModo === 'mes') {
    const range = monthRangeFromKey(mesSelecionado) || defaultRange;
    const inicio = 'inicio' in range ? range.inicio : range.start;
    const fim = 'fim' in range ? range.fim : range.end;
    if (dataInicio !== inicio) dataInicio = inicio;
    if (dataFim !== fim) dataFim = fim;
  }

  $: categoriasData = {
    labels: ['VIP', 'Regular', 'Ocasional'],
    datasets: [
      {
        label: 'Clientes',
        data: [clientesAgregados.vip, clientesAgregados.regular, clientesAgregados.ocasional],
        backgroundColor: ['#f97316', '#fb923c', '#cbd5e1']
      }
    ]
  } satisfies ChartData;

  $: gastoPorClienteData = {
    labels: clientesFiltrados.slice(0, 5).map((cliente) => cliente.cliente.split(' ')[0]),
    datasets: [
      {
        label: 'Total Gasto',
        data: clientesFiltrados.slice(0, 5).map((cliente) => cliente.total_gasto),
        backgroundColor: '#f97316'
      }
    ]
  } satisfies ChartData;

  // Regra de escopo: vendedor/uso individual não escolhe empresa ou vendedor global.
  $: showEmpresaFiltro = !$permissoes.ready || $permissoes.isSystemAdmin || $permissoes.isMaster;
  $: showVendedorFiltro =
    !$permissoes.ready || (!$permissoes.isVendedor && !$permissoes.usoIndividual);

  $: if ($permissoes.ready && !showEmpresaFiltro && empresaSelecionada) empresaSelecionada = '';
  $: if ($permissoes.ready && !showVendedorFiltro && vendedorSelecionado) vendedorSelecionado = '';

  // O $: do modo legado só reage às variáveis escritas nesta linha (não enxerga dentro de
  // buildAutoReloadKey()). Por isso a mesma expressão da função fica aqui, idêntica.
  $: autoReloadKey = [
    filtroPeriodoModo,
    mesSelecionado,
    dataInicio,
    dataFim,
    empresaSelecionada,
    vendedorSelecionado,
    categoriaSelecionada,
    ordenacao
  ].join('|');

  $: if (autoReloadEnabled && autoReloadKey !== lastAutoReloadKey) {
    lastAutoReloadKey = autoReloadKey;
    scheduleAutoReload();
  }
</script>

<svelte:head>
  <title>Vendas por Cliente | VTUR</title>
</svelte:head>

<PageHeader
  title="Vendas por Cliente"
  subtitle="Analise de clientes e historico de compras"
  color="financeiro"
  actions={[{ label: 'Voltar', href: '/relatorios', variant: 'secondary', icon: ArrowLeft }]}
  breadcrumbs={[{ label: 'Relatorios', href: '/relatorios' }, { label: 'Clientes' }]}
/>

<!-- Mobile: botão de filtros -->
<div class="mb-4 sm:hidden">
  <Button variant="secondary" class_name="w-full" on:click={() => (showFilterSheet = true)}>
    <SlidersHorizontal size={16} class="mr-2" />
    Filtros
    {#if empresaSelecionada || vendedorSelecionado || categoriaSelecionada}
      <span class="bg-financeiro-500 ml-2 inline-flex h-2 w-2 rounded-full"></span>
    {/if}
  </Button>
</div>

<FilterPanel color="financeiro" className="hidden sm:block">
  <FieldSelect
    id="rel-clientes-periodo-modo"
    label="Período"
    bind:value={filtroPeriodoModo}
    options={[
      { value: 'mes', label: 'Mês completo' },
      { value: 'periodo', label: 'Data específica' }
    ]}
    placeholder={null}
    class_name="w-full"
  />
  {#if filtroPeriodoModo === 'mes'}
    <FieldInput
      id="rel-clientes-mes"
      label="Mês"
      type="month"
      bind:value={mesSelecionado}
      class_name="w-full"
    />
  {:else}
    <FieldInput
      id="rel-clientes-data-inicio"
      label="Data Início"
      type="date"
      bind:value={dataInicio}
      class_name="w-full"
    />
    <FieldInput
      id="rel-clientes-data-fim"
      label="Data Fim"
      type="date"
      bind:value={dataFim}
      min={dataInicio || null}
      class_name="w-full"
    />
  {/if}
  {#if showEmpresaFiltro}
    <FieldSelect
      id="rel-clientes-empresa"
      label="Empresa"
      bind:value={empresaSelecionada}
      options={[
        { value: '', label: 'Todas' },
        ...empresas.map((empresa) => ({ value: empresa.id, label: empresa.nome }))
      ]}
      placeholder={null}
      class_name="w-full"
    />
  {/if}
  {#if showVendedorFiltro}
    <FieldSelect
      id="rel-clientes-vendedor"
      label="Vendedor"
      bind:value={vendedorSelecionado}
      options={[
        { value: '', label: 'Todos' },
        ...vendedores.map((vendedor) => ({ value: vendedor.id, label: vendedor.nome }))
      ]}
      placeholder={null}
      class_name="w-full"
    />
  {/if}
  <FieldSelect
    id="rel-clientes-categoria"
    label="Categoria"
    bind:value={categoriaSelecionada}
    options={[
      { value: '', label: 'Todas' },
      { value: 'VIP', label: 'VIP' },
      { value: 'Regular', label: 'Regular' },
      { value: 'Ocasional', label: 'Ocasional' }
    ]}
    placeholder={null}
    class_name="w-full"
  />
  <FieldSelect
    id="rel-clientes-ordenacao"
    label="Ordenar Por"
    bind:value={ordenacao}
    options={[
      { value: 'total_gasto', label: 'Total Gasto' },
      { value: 'total_compras', label: 'Quantidade' },
      { value: 'ticket_medio', label: 'Ticket Medio' },
      { value: 'ultima_compra', label: 'Ultima Compra' }
    ]}
    placeholder={null}
    class_name="w-full"
  />
</FilterPanel>

<BottomSheet bind:open={showFilterSheet} title="Filtrar Clientes">
  <div class="space-y-4">
    <FieldSelect
      id="rel-clientes-periodo-modo-mobile"
      label="Período"
      bind:value={filtroPeriodoModo}
      options={[
        { value: 'mes', label: 'Mês completo' },
        { value: 'periodo', label: 'Data específica' }
      ]}
      placeholder={null}
      class_name="w-full"
    />
    {#if filtroPeriodoModo === 'mes'}
      <FieldInput
        id="rel-clientes-mes-mobile"
        label="Mês"
        type="month"
        bind:value={mesSelecionado}
        class_name="w-full"
      />
    {:else}
      <FieldInput
        id="rel-clientes-data-inicio-mobile"
        label="Data Início"
        type="date"
        bind:value={dataInicio}
        class_name="w-full"
      />
      <FieldInput
        id="rel-clientes-data-fim-mobile"
        label="Data Fim"
        type="date"
        bind:value={dataFim}
        min={dataInicio || null}
        class_name="w-full"
      />
    {/if}
    {#if showEmpresaFiltro}
      <FieldSelect
        id="rel-clientes-empresa-mobile"
        label="Empresa"
        bind:value={empresaSelecionada}
        options={[
          { value: '', label: 'Todas' },
          ...empresas.map((empresa) => ({ value: empresa.id, label: empresa.nome }))
        ]}
        placeholder={null}
        class_name="w-full"
      />
    {/if}
    {#if showVendedorFiltro}
      <FieldSelect
        id="rel-clientes-vendedor-mobile"
        label="Vendedor"
        bind:value={vendedorSelecionado}
        options={[
          { value: '', label: 'Todos' },
          ...vendedores.map((vendedor) => ({ value: vendedor.id, label: vendedor.nome }))
        ]}
        placeholder={null}
        class_name="w-full"
      />
    {/if}
    <FieldSelect
      id="rel-clientes-categoria-mobile"
      label="Categoria"
      bind:value={categoriaSelecionada}
      options={[
        { value: '', label: 'Todas' },
        { value: 'VIP', label: 'VIP' },
        { value: 'Regular', label: 'Regular' },
        { value: 'Ocasional', label: 'Ocasional' }
      ]}
      placeholder={null}
      class_name="w-full"
    />
    <FieldSelect
      id="rel-clientes-ordenacao-mobile"
      label="Ordenar Por"
      bind:value={ordenacao}
      options={[
        { value: 'total_gasto', label: 'Total Gasto' },
        { value: 'total_compras', label: 'Quantidade' },
        { value: 'ticket_medio', label: 'Ticket Medio' },
        { value: 'ultima_compra', label: 'Ultima Compra' }
      ]}
      placeholder={null}
      class_name="w-full"
    />
  </div>
  <Button variant="primary" class_name="w-full mt-2" on:click={() => (showFilterSheet = false)}>
    Aplicar filtros
  </Button>
</BottomSheet>

<div class="vtur-kpi-grid mb-6">
  <div class="vtur-kpi-card">
    <div class="flex h-10 w-10 items-center justify-center rounded-xl bg-orange-50 text-orange-500">
      <Users size={20} />
    </div>
    <div>
      <p class="text-sm font-medium text-slate-500">Total de Clientes</p>
      <p class="text-2xl font-bold text-slate-900">{totalClientes}</p>
    </div>
  </div>
  <div class="vtur-kpi-card">
    <div class="flex h-10 w-10 items-center justify-center rounded-xl bg-green-50 text-green-500">
      <Wallet size={20} />
    </div>
    <div>
      <p class="text-sm font-medium text-slate-500">Receita Total</p>
      <p class="text-2xl font-bold text-slate-900">{formatCurrency(totalGasto)}</p>
    </div>
  </div>
  <div class="vtur-kpi-card">
    <div class="flex h-10 w-10 items-center justify-center rounded-xl bg-blue-50 text-blue-500">
      <TrendingUp size={20} />
    </div>
    <div>
      <p class="text-sm font-medium text-slate-500">Ticket Médio</p>
      <p class="text-2xl font-bold text-slate-900">{formatCurrency(ticketMedioGeral)}</p>
    </div>
  </div>
  <div class="vtur-kpi-card">
    <div class="flex h-10 w-10 items-center justify-center rounded-xl bg-violet-50 text-violet-500">
      <Star size={20} />
    </div>
    <div>
      <p class="text-sm font-medium text-slate-500">Clientes VIP</p>
      <p class="text-2xl font-bold text-slate-900">{clientesVIP}</p>
    </div>
  </div>
</div>

<div class="mb-6 grid grid-cols-1 gap-6 lg:grid-cols-2">
  <Card header="Clientes por Categoria" color="financeiro">
    <ChartJS type="doughnut" data={categoriasData} height={250} />
  </Card>
  <Card header="Top 5 Clientes (Gasto)" color="financeiro">
    <ChartJS type="bar" data={gastoPorClienteData} height={250} />
  </Card>
</div>

{#if relatorioTruncado}
  <div
    class="mb-4 flex flex-col gap-3 rounded-2xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800 sm:flex-row sm:items-center sm:justify-between"
  >
    <span
      >Exibindo {clientes.length} de {totalRelatorioItems} clientes. Carregue mais somente quando precisar
      detalhar/exportar mais linhas.</span
    >
    <Button variant="secondary" size="sm" disabled={loadingMore} on:click={loadMoreRelatorio}>
      {loadingMore ? 'Carregando...' : 'Carregar mais'}
    </Button>
  </div>
{/if}

<DataTable
  {columns}
  data={clientesFiltrados}
  color="financeiro"
  {loading}
  title="Detalhamento por Cliente"
  searchable={true}
  exportable={true}
  onExport={handleExport}
  onRowClick={handleRowClick}
/>
