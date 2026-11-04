<script lang="ts">
  import { onDestroy, onMount } from 'svelte';
  import { goto } from '$app/navigation';
  import type { ChartData } from 'chart.js';
  import PageHeader from '$lib/components/ui/PageHeader.svelte';
  import Card from '$lib/components/ui/Card.svelte';
  import DataTable from '$lib/components/ui/DataTable.svelte';
  import FilterPanel from '$lib/components/ui/FilterPanel.svelte';
  import Button from '$lib/components/ui/Button.svelte';
  import { FieldInput, FieldSelect, BottomSheet } from '$lib/components/ui';
  import ChartJS from '$lib/components/charts/ChartJS.svelte';
  import { ArrowLeft, Wallet, TrendingUp, BarChart2, Trophy, SlidersHorizontal } from '$lib/icons';
  import { toast } from '$lib/stores/ui';
  import { permissoes } from '$lib/stores/permissoes';
  import { monthRangeFromKey, todayISODateLocal } from '$lib/date';
  import { apiGet, isCanceledApiError } from '$lib/services/api';
  import { escapeHtml } from '$lib/utils/html';
  import { formatCurrency } from '$lib/utils/formatters';
  import { createDebouncedReloader } from '$lib/utils/autoReload';
  import { toUserMessage } from '$lib/utils/errors';

  interface ProdutoRelatorio {
    produto: string;
    tipo: string;
    quantidade: number;
    receita: number;
    custo_medio: number;
    lucro: number;
    margem: number;
  }

  interface EmpresaFiltro {
    id: string;
    nome: string;
  }

  interface VendedorFiltro {
    id: string;
    nome: string;
  }

  interface ProdutosSummary {
    totalReceita: number;
    totalLucro: number;
    margemMedia: number;
    produtoTop: ProdutoRelatorio | null;
  }

  interface ProdutosRelatorioPayload {
    items?: ProdutoRelatorio[] | null;
    total?: number | null;
    truncated?: boolean | null;
    tipos?: string[] | null;
    summary?: Partial<ProdutosSummary> | null;
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
  const PT_BR_COLLATOR = new Intl.Collator('pt-BR');
  const RELATORIO_PAGE_SIZE = 250;

  let produtos: ProdutoRelatorio[] = [];
  let empresas: EmpresaFiltro[] = [];
  let vendedores: VendedorFiltro[] = [];
  let loading = true;
  let filtroPeriodoModo: PeriodoModo = 'mes';
  let mesSelecionado = defaultMonth;
  let dataInicio = defaultRange.start;
  let dataFim = defaultRange.end;
  let empresaSelecionada = '';
  let vendedorSelecionado = '';
  let tipoSelecionado = '';
  let ordenacao = 'receita';
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
  let tiposDisponiveisPayload: string[] = [];
  let resumoProdutos: ProdutosSummary = {
    totalReceita: 0,
    totalLucro: 0,
    margemMedia: 0,
    produtoTop: null
  };
  let showFilterSheet = false;
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
    { key: 'produto', label: 'Produto', sortable: true },
    {
      key: 'tipo',
      label: 'Tipo',
      sortable: true,
      width: '140px',
      formatter: (value: string) =>
        `<span class="inline-flex px-2 py-1 text-xs font-medium rounded-full bg-financeiro-50 text-financeiro-700">${escapeHtml(value)}</span>`
    },
    { key: 'quantidade', label: 'Qtd', sortable: true, align: 'center' as const, width: '80px' },
    {
      key: 'receita',
      label: 'Receita',
      sortable: true,
      align: 'right' as const,
      formatter: (value: number) => formatCurrency(value)
    },
    {
      key: 'lucro',
      label: 'Lucro',
      sortable: true,
      align: 'right' as const,
      formatter: (value: number) => formatCurrency(value)
    },
    {
      key: 'margem',
      label: 'Margem',
      sortable: true,
      align: 'center' as const,
      width: '100px',
      formatter: (value: number) =>
        `<span class="font-medium ${value >= 30 ? 'text-green-600' : value >= 20 ? 'text-financeiro-600' : 'text-amber-600'}">${value.toFixed(1)}%</span>`
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
      const data = await apiGet<ProdutosRelatorioPayload>(
        '/api/v1/relatorios/produtos',
        {
          data_inicio: dataInicio,
          data_fim: dataFim,
          empresa_id: empresaSelecionada || undefined,
          vendedor_id: vendedorSelecionado || undefined,
          tipo: tipoSelecionado || undefined,
          ordenacao,
          items_limit: RELATORIO_PAGE_SIZE,
          items_offset: 0
        },
        controller.signal,
        90_000
      );
      if (requestSeq !== relatorioRequestSeq) return;
      produtos = data.items || [];
      totalRelatorioItems = Number(data.total || produtos.length || 0);
      relatorioTruncado = Boolean(data.truncated);
      tiposDisponiveisPayload = data.tipos || [];
      resumoProdutos = {
        totalReceita: Number(data.summary?.totalReceita || 0),
        totalLucro: Number(data.summary?.totalLucro || 0),
        margemMedia: Number(data.summary?.margemMedia || 0),
        produtoTop: data.summary?.produtoTop || produtos[0] || null
      };

      if (showSuccess) {
        toast.success('Relatorio atualizado!');
      }
    } catch (err) {
      if (isCanceledApiError(err)) return;
      if (requestSeq !== relatorioRequestSeq) return;
      produtos = [];
      totalRelatorioItems = 0;
      relatorioTruncado = false;
      tiposDisponiveisPayload = [];
      resumoProdutos = { totalReceita: 0, totalLucro: 0, margemMedia: 0, produtoTop: null };
      toast.error(toUserMessage(err, 'Erro ao carregar relatório de produtos'));
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
      const data = await apiGet<ProdutosRelatorioPayload>(
        '/api/v1/relatorios/produtos',
        {
          data_inicio: dataInicio,
          data_fim: dataFim,
          empresa_id: empresaSelecionada || undefined,
          vendedor_id: vendedorSelecionado || undefined,
          tipo: tipoSelecionado || undefined,
          ordenacao,
          items_limit: RELATORIO_PAGE_SIZE,
          items_offset: produtos.length
        },
        controller.signal,
        90_000
      );

      produtos = [...produtos, ...(data.items || [])];
      totalRelatorioItems = Number(data.total || totalRelatorioItems || produtos.length);
      relatorioTruncado = Boolean(data.truncated);
    } catch (err) {
      if (isCanceledApiError(err)) return;
      toast.error(toUserMessage(err, 'Erro ao carregar mais produtos'));
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
      tipoSelecionado,
      ordenacao
    ].join('|');
  }

  function scheduleAutoReload() {
    autoReload.schedule();
  }

  function handleExport() {
    if (produtosFiltrados.length === 0) {
      toast.info('Não há dados para exportar');
      return;
    }

    const headers = ['Produto', 'Tipo', 'Quantidade', 'Receita', 'Lucro', 'Margem'];
    const rows = produtosFiltrados.map((produto) => [
      produto.produto,
      produto.tipo,
      produto.quantidade,
      produto.receita.toFixed(2).replace('.', ','),
      produto.lucro.toFixed(2).replace('.', ','),
      produto.margem.toFixed(2).replace('.', ',')
    ]);

    const csv = ['\uFEFF' + headers.join(';'), ...rows.map((row) => row.join(';'))].join('\n');
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
    const link = document.createElement('a');
    link.href = URL.createObjectURL(blob);
    link.download = `relatorio_produtos_${todayISODateLocal()}.csv`;
    link.click();
    toast.success('Relatório exportado com sucesso');
  }

  function handleRowClick(row: ProdutoRelatorio) {
    const params = new URLSearchParams({
      data_inicio: dataInicio,
      data_fim: dataFim,
      produto: row.produto,
      tipo_produto: row.tipo
    });

    if (empresaSelecionada) params.set('empresa_id', empresaSelecionada);
    if (vendedorSelecionado) params.set('vendedor_id', vendedorSelecionado);

    void goto(`/relatorios/vendas?${params.toString()}`);
  }

  $: tiposDisponiveis = tiposDisponiveisPayload.length
    ? tiposDisponiveisPayload
    : Array.from(new Set(produtos.map((produto) => produto.tipo)))
        .filter(Boolean)
        .sort((left, right) => PT_BR_COLLATOR.compare(left, right));

  $: produtosFiltrados = produtos;
  $: totalReceita = resumoProdutos.totalReceita;
  $: totalLucro = resumoProdutos.totalLucro;
  $: margemMedia = resumoProdutos.margemMedia;
  $: produtoTop = resumoProdutos.produtoTop;

  $: if (filtroPeriodoModo === 'mes') {
    const range = monthRangeFromKey(mesSelecionado) || defaultRange;
    const inicio = 'inicio' in range ? range.inicio : range.start;
    const fim = 'fim' in range ? range.fim : range.end;
    if (dataInicio !== inicio) dataInicio = inicio;
    if (dataFim !== fim) dataFim = fim;
  }

  $: receitaPorProdutoData = {
    labels: produtosFiltrados.slice(0, 8).map((produto) => produto.produto),
    datasets: [
      {
        label: 'Receita',
        data: produtosFiltrados.slice(0, 8).map((produto) => produto.receita),
        backgroundColor: '#f97316'
      },
      {
        label: 'Lucro',
        data: produtosFiltrados.slice(0, 8).map((produto) => produto.lucro),
        backgroundColor: '#22c55e'
      }
    ]
  } satisfies ChartData;

  $: margemPorProdutoData = {
    labels: produtosFiltrados.slice(0, 8).map((produto) => produto.produto),
    datasets: [
      {
        label: 'Margem %',
        data: produtosFiltrados.slice(0, 8).map((produto) => produto.margem),
        borderColor: '#f97316',
        backgroundColor: 'rgba(249, 115, 22, 0.1)',
        type: 'line' as const,
        yAxisID: 'y'
      },
      {
        label: 'Quantidade',
        data: produtosFiltrados.slice(0, 8).map((produto) => produto.quantidade),
        backgroundColor: '#fdba74',
        type: 'bar' as const,
        yAxisID: 'y1'
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
    tipoSelecionado,
    ordenacao
  ].join('|');

  $: if (autoReloadEnabled && autoReloadKey !== lastAutoReloadKey) {
    lastAutoReloadKey = autoReloadKey;
    scheduleAutoReload();
  }
</script>

<svelte:head>
  <title>Vendas por Produto | VTUR</title>
</svelte:head>

<PageHeader
  title="Vendas por Produto"
  subtitle="Performance por tipo de produto"
  color="financeiro"
  actions={[{ label: 'Voltar', href: '/relatorios', variant: 'secondary', icon: ArrowLeft }]}
  breadcrumbs={[{ label: 'Relatorios', href: '/relatorios' }, { label: 'Produtos' }]}
/>

<!-- Mobile: botão de filtros -->
<div class="mb-4 sm:hidden">
  <Button variant="secondary" class_name="w-full" on:click={() => (showFilterSheet = true)}>
    <SlidersHorizontal size={16} class="mr-2" />
    Filtros
    {#if empresaSelecionada || vendedorSelecionado || tipoSelecionado}
      <span class="bg-financeiro-500 ml-2 inline-flex h-2 w-2 rounded-full"></span>
    {/if}
  </Button>
</div>

<BottomSheet bind:open={showFilterSheet} title="Filtrar produtos">
  <div class="flex flex-col gap-4">
    <FieldSelect
      id="rel-produtos-periodo-modo-mobile"
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
        id="rel-produtos-mes-mobile"
        label="Mês"
        type="month"
        bind:value={mesSelecionado}
        class_name="w-full"
      />
    {:else}
      <FieldInput
        id="rel-produtos-data-inicio-mobile"
        label="Data Início"
        type="date"
        bind:value={dataInicio}
        class_name="w-full"
      />
      <FieldInput
        id="rel-produtos-data-fim-mobile"
        label="Data Fim"
        type="date"
        bind:value={dataFim}
        min={dataInicio || null}
        class_name="w-full"
      />
    {/if}
    {#if showEmpresaFiltro}
      <FieldSelect
        id="rel-produtos-empresa-mobile"
        label="Empresa"
        bind:value={empresaSelecionada}
        options={[
          { value: '', label: 'Todas' },
          ...empresas.map((e) => ({ value: e.id, label: e.nome }))
        ]}
        placeholder={null}
        class_name="w-full"
      />
    {/if}
    {#if showVendedorFiltro}
      <FieldSelect
        id="rel-produtos-vendedor-mobile"
        label="Vendedor"
        bind:value={vendedorSelecionado}
        options={[
          { value: '', label: 'Todos' },
          ...vendedores.map((v) => ({ value: v.id, label: v.nome }))
        ]}
        placeholder={null}
        class_name="w-full"
      />
    {/if}
    <FieldSelect
      id="rel-produtos-tipo-mobile"
      label="Tipo"
      bind:value={tipoSelecionado}
      options={[
        { value: '', label: 'Todos' },
        ...tiposDisponiveis.map((t) => ({ value: t, label: t }))
      ]}
      placeholder={null}
      class_name="w-full"
    />
    <FieldSelect
      id="rel-produtos-ordenacao-mobile"
      label="Ordenar Por"
      bind:value={ordenacao}
      options={[
        { value: 'receita', label: 'Receita' },
        { value: 'lucro', label: 'Lucro' },
        { value: 'margem', label: 'Margem' },
        { value: 'quantidade', label: 'Quantidade' }
      ]}
      placeholder={null}
      class_name="w-full"
    />
    <Button variant="primary" class_name="w-full mt-2" on:click={() => (showFilterSheet = false)}>
      Aplicar filtros
    </Button>
  </div>
</BottomSheet>

<FilterPanel color="financeiro" className="hidden sm:block">
  <FieldSelect
    id="rel-produtos-periodo-modo"
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
      id="rel-produtos-mes"
      label="Mês"
      type="month"
      bind:value={mesSelecionado}
      class_name="w-full"
    />
  {:else}
    <FieldInput
      id="rel-produtos-data-inicio"
      label="Data Início"
      type="date"
      bind:value={dataInicio}
      class_name="w-full"
    />
    <FieldInput
      id="rel-produtos-data-fim"
      label="Data Fim"
      type="date"
      bind:value={dataFim}
      min={dataInicio || null}
      class_name="w-full"
    />
  {/if}
  {#if showEmpresaFiltro}
    <FieldSelect
      id="rel-produtos-empresa"
      label="Empresa"
      bind:value={empresaSelecionada}
      options={[
        { value: '', label: 'Todas' },
        ...empresas.map((e) => ({ value: e.id, label: e.nome }))
      ]}
      placeholder={null}
      class_name="w-full"
    />
  {/if}
  {#if showVendedorFiltro}
    <FieldSelect
      id="rel-produtos-vendedor"
      label="Vendedor"
      bind:value={vendedorSelecionado}
      options={[
        { value: '', label: 'Todos' },
        ...vendedores.map((v) => ({ value: v.id, label: v.nome }))
      ]}
      placeholder={null}
      class_name="w-full"
    />
  {/if}
  <FieldSelect
    id="rel-produtos-tipo"
    label="Tipo"
    bind:value={tipoSelecionado}
    options={[
      { value: '', label: 'Todos' },
      ...tiposDisponiveis.map((t) => ({ value: t, label: t }))
    ]}
    placeholder={null}
    class_name="w-full"
  />
  <FieldSelect
    id="rel-produtos-ordenacao"
    label="Ordenar Por"
    bind:value={ordenacao}
    options={[
      { value: 'receita', label: 'Receita' },
      { value: 'lucro', label: 'Lucro' },
      { value: 'margem', label: 'Margem' },
      { value: 'quantidade', label: 'Quantidade' }
    ]}
    placeholder={null}
    class_name="w-full"
  />
</FilterPanel>

<div class="vtur-kpi-grid {produtoTop ? '' : 'vtur-kpi-grid-3'} mb-6">
  <div class="vtur-kpi-card">
    <div class="flex h-10 w-10 items-center justify-center rounded-xl bg-teal-50 text-teal-500">
      <Wallet size={20} />
    </div>
    <div>
      <p class="text-sm font-medium text-slate-500">Receita Total</p>
      <p class="text-2xl font-bold text-slate-900">{formatCurrency(totalReceita)}</p>
    </div>
  </div>
  <div class="vtur-kpi-card">
    <div class="flex h-10 w-10 items-center justify-center rounded-xl bg-green-50 text-green-500">
      <TrendingUp size={20} />
    </div>
    <div>
      <p class="text-sm font-medium text-slate-500">Lucro Total</p>
      <p class="text-2xl font-bold text-slate-900">{formatCurrency(totalLucro)}</p>
    </div>
  </div>
  <div class="vtur-kpi-card">
    <div class="flex h-10 w-10 items-center justify-center rounded-xl bg-blue-50 text-blue-500">
      <BarChart2 size={20} />
    </div>
    <div>
      <p class="text-sm font-medium text-slate-500">Margem Média</p>
      <p class="text-2xl font-bold text-slate-900">{margemMedia.toFixed(1)}%</p>
    </div>
  </div>
  {#if produtoTop}
    <div class="vtur-kpi-card">
      <div class="flex h-10 w-10 items-center justify-center rounded-xl bg-amber-50 text-amber-500">
        <Trophy size={20} />
      </div>
      <div>
        <p class="text-sm font-medium text-slate-500">Produto Top</p>
        <p class="truncate text-lg font-bold text-slate-900">{produtoTop.produto}</p>
      </div>
    </div>
  {/if}
</div>

<div class="mb-6 grid grid-cols-1 gap-6 lg:grid-cols-2">
  <Card header="Receita vs Lucro por Produto" color="financeiro">
    <ChartJS type="bar" data={receitaPorProdutoData} height={280} />
  </Card>
  <Card header="Margem e Quantidade" color="financeiro">
    <ChartJS type="bar" data={margemPorProdutoData} height={280} />
  </Card>
</div>

{#if relatorioTruncado}
  <div
    class="mb-4 flex flex-col gap-3 rounded-2xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800 sm:flex-row sm:items-center sm:justify-between"
  >
    <span
      >Exibindo {produtos.length} de {totalRelatorioItems} produtos. Carregue mais somente quando precisar
      detalhar/exportar mais linhas.</span
    >
    <Button variant="secondary" size="sm" disabled={loadingMore} on:click={loadMoreRelatorio}>
      {loadingMore ? 'Carregando...' : 'Carregar mais'}
    </Button>
  </div>
{/if}

<DataTable
  {columns}
  data={produtosFiltrados}
  color="financeiro"
  {loading}
  title="Performance por Produto"
  searchable={true}
  exportable={true}
  onExport={handleExport}
  onRowClick={handleRowClick}
/>
