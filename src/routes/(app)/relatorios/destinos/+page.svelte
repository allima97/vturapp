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
  import { ArrowLeft, MapPin, SlidersHorizontal } from '$lib/icons';
  import { toast } from '$lib/stores/ui';
  import { permissoes } from '$lib/stores/permissoes';
  import { monthRangeFromKey, todayISODateLocal } from '$lib/date';
  import { apiGet, isCanceledApiError } from '$lib/services/api';
  import { formatCurrency } from '$lib/utils/formatters';
  import { createDebouncedReloader } from '$lib/utils/autoReload';
  import { toUserMessage } from '$lib/utils/errors';

  interface DestinoRelatorio {
    destino: string;
    quantidade: number;
    receita: number;
    ticket_medio: number;
    percentual: number;
  }

  interface EmpresaFiltro {
    id: string;
    nome: string;
  }

  interface VendedorFiltro {
    id: string;
    nome: string;
  }

  interface DestinosSummary {
    totalReceita: number;
    totalVendas: number;
    destinoTop: DestinoRelatorio | null;
  }

  interface DestinosRelatorioPayload {
    items?: DestinoRelatorio[] | null;
    total?: number | null;
    truncated?: boolean | null;
    summary?: Partial<DestinosSummary> | null;
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

  let destinos: DestinoRelatorio[] = [];
  let empresas: EmpresaFiltro[] = [];
  let vendedores: VendedorFiltro[] = [];
  let loading = true;
  let filtroPeriodoModo: PeriodoModo = 'mes';
  let mesSelecionado = defaultMonth;
  let dataInicio = defaultRange.start;
  let dataFim = defaultRange.end;
  let empresaSelecionada = '';
  let vendedorSelecionado = '';
  let ordenacao = 'receita';
  let recorte = 'todos';
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
  let resumoDestinos: DestinosSummary = {
    totalReceita: 0,
    totalVendas: 0,
    destinoTop: null
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
    { key: 'destino', label: 'Destino', sortable: true },
    {
      key: 'quantidade',
      label: 'Vendas',
      sortable: true,
      align: 'center' as const,
      width: '100px'
    },
    {
      key: 'receita',
      label: 'Receita',
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
      key: 'percentual',
      label: 'Participacao',
      sortable: true,
      align: 'center' as const,
      width: '140px',
      formatter: (value: number) =>
        `<div class="flex items-center gap-2"><div class="flex-1 h-2 bg-slate-200 rounded-full"><div class="h-2 bg-financeiro-500 rounded-full" style="width: ${Math.min(value, 100)}%"></div></div><span class="text-sm text-slate-600">${value.toFixed(1)}%</span></div>`
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
      const data = await apiGet<DestinosRelatorioPayload>(
        '/api/v1/relatorios/destinos',
        {
          data_inicio: dataInicio,
          data_fim: dataFim,
          empresa_id: empresaSelecionada || undefined,
          vendedor_id: vendedorSelecionado || undefined,
          ordenacao,
          recorte,
          items_limit: RELATORIO_PAGE_SIZE,
          items_offset: 0
        },
        controller.signal,
        90_000
      );
      if (requestSeq !== relatorioRequestSeq) return;
      destinos = data.items || [];
      totalRelatorioItems = Number(data.total || destinos.length || 0);
      relatorioTruncado = Boolean(data.truncated);
      resumoDestinos = {
        totalReceita: Number(data.summary?.totalReceita || 0),
        totalVendas: Number(data.summary?.totalVendas || 0),
        destinoTop: data.summary?.destinoTop || destinos[0] || null
      };

      if (showSuccess) {
        toast.success('Relatorio atualizado!');
      }
    } catch (err) {
      if (isCanceledApiError(err)) return;
      if (requestSeq !== relatorioRequestSeq) return;
      destinos = [];
      totalRelatorioItems = 0;
      relatorioTruncado = false;
      resumoDestinos = { totalReceita: 0, totalVendas: 0, destinoTop: null };
      toast.error(toUserMessage(err, 'Erro ao carregar relatório de destinos'));
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
      const data = await apiGet<DestinosRelatorioPayload>(
        '/api/v1/relatorios/destinos',
        {
          data_inicio: dataInicio,
          data_fim: dataFim,
          empresa_id: empresaSelecionada || undefined,
          vendedor_id: vendedorSelecionado || undefined,
          ordenacao,
          recorte,
          items_limit: RELATORIO_PAGE_SIZE,
          items_offset: destinos.length
        },
        controller.signal,
        90_000
      );

      destinos = [...destinos, ...(data.items || [])];
      totalRelatorioItems = Number(data.total || totalRelatorioItems || destinos.length);
      relatorioTruncado = Boolean(data.truncated);
    } catch (err) {
      if (isCanceledApiError(err)) return;
      toast.error(toUserMessage(err, 'Erro ao carregar mais destinos'));
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
      ordenacao,
      recorte
    ].join('|');
  }

  function scheduleAutoReload() {
    autoReload.schedule();
  }

  function handleExport() {
    if (destinosFiltrados.length === 0) {
      toast.info('Não há dados para exportar');
      return;
    }

    const headers = ['Destino', 'Vendas', 'Receita', 'Ticket Médio', 'Participação'];
    const rows = destinosFiltrados.map((destino) => [
      destino.destino,
      destino.quantidade,
      destino.receita.toFixed(2).replace('.', ','),
      destino.ticket_medio.toFixed(2).replace('.', ','),
      destino.percentual.toFixed(2).replace('.', ',')
    ]);

    const csv = ['\uFEFF' + headers.join(';'), ...rows.map((row) => row.join(';'))].join('\n');
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
    const link = document.createElement('a');
    link.href = URL.createObjectURL(blob);
    link.download = `relatorio_destinos_${todayISODateLocal()}.csv`;
    link.click();
    toast.success('Relatório exportado com sucesso');
  }

  function handleRowClick(row: DestinoRelatorio) {
    const params = new URLSearchParams({
      data_inicio: dataInicio,
      data_fim: dataFim,
      destino: row.destino
    });

    if (empresaSelecionada) params.set('empresa_id', empresaSelecionada);
    if (vendedorSelecionado) params.set('vendedor_id', vendedorSelecionado);

    void goto(`/relatorios/vendas?${params.toString()}`);
  }

  $: destinosFiltrados = destinos;
  $: totalReceita = resumoDestinos.totalReceita;
  $: totalVendas = resumoDestinos.totalVendas;
  $: destinoTop = resumoDestinos.destinoTop;

  $: if (filtroPeriodoModo === 'mes') {
    const range = monthRangeFromKey(mesSelecionado) || defaultRange;
    const inicio = 'inicio' in range ? range.inicio : range.start;
    const fim = 'fim' in range ? range.fim : range.end;
    if (dataInicio !== inicio) dataInicio = inicio;
    if (dataFim !== fim) dataFim = fim;
  }

  $: vendasPorDestinoData = {
    labels: destinosFiltrados.slice(0, 10).map((destino) => destino.destino.split(' - ')[0]),
    datasets: [
      {
        label: 'Receita',
        data: destinosFiltrados.slice(0, 10).map((destino) => destino.receita),
        backgroundColor: ['#f97316', '#fb923c', '#fdba74', '#fed7aa', '#ffedd5', '#cbd5e1']
      }
    ]
  } satisfies ChartData;

  $: vendasPorQuantidadeData = {
    labels: destinosFiltrados.slice(0, 5).map((destino) => destino.destino.split(' - ')[0]),
    datasets: [
      {
        label: 'Quantidade de Vendas',
        data: destinosFiltrados.slice(0, 5).map((destino) => destino.quantidade),
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
    ordenacao,
    recorte
  ].join('|');

  $: if (autoReloadEnabled && autoReloadKey !== lastAutoReloadKey) {
    lastAutoReloadKey = autoReloadKey;
    scheduleAutoReload();
  }
</script>

<svelte:head>
  <title>Vendas por Destino | VTUR</title>
</svelte:head>

<PageHeader
  title="Vendas por Destino"
  subtitle="Analise de vendas por destino turistico"
  color="financeiro"
  actions={[{ label: 'Voltar', href: '/relatorios', variant: 'secondary', icon: ArrowLeft }]}
  breadcrumbs={[{ label: 'Relatorios', href: '/relatorios' }, { label: 'Destinos' }]}
/>

<!-- Mobile: botão de filtros -->
<div class="mb-4 sm:hidden">
  <Button variant="secondary" class_name="w-full" on:click={() => (showFilterSheet = true)}>
    <SlidersHorizontal size={16} class="mr-2" />
    Filtros
    {#if empresaSelecionada || vendedorSelecionado || recorte !== 'todos'}
      <span class="bg-financeiro-500 ml-2 inline-flex h-2 w-2 rounded-full"></span>
    {/if}
  </Button>
</div>

<BottomSheet bind:open={showFilterSheet} title="Filtrar destinos">
  <div class="flex flex-col gap-4">
    <FieldSelect
      id="rel-destinos-periodo-modo-mobile"
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
        id="rel-destinos-mes-mobile"
        label="Mês"
        type="month"
        bind:value={mesSelecionado}
        class_name="w-full"
      />
    {:else}
      <FieldInput
        id="rel-destinos-data-inicio-mobile"
        label="Data Início"
        type="date"
        bind:value={dataInicio}
        class_name="w-full"
      />
      <FieldInput
        id="rel-destinos-data-fim-mobile"
        label="Data Fim"
        type="date"
        bind:value={dataFim}
        min={dataInicio || null}
        class_name="w-full"
      />
    {/if}
    {#if showEmpresaFiltro}
      <FieldSelect
        id="rel-destinos-empresa-mobile"
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
        id="rel-destinos-vendedor-mobile"
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
      id="rel-destinos-ordenacao-mobile"
      label="Ordenar Por"
      bind:value={ordenacao}
      options={[
        { value: 'receita', label: 'Receita' },
        { value: 'quantidade', label: 'Quantidade' },
        { value: 'ticket_medio', label: 'Ticket Medio' }
      ]}
      placeholder={null}
      class_name="w-full"
    />
    <FieldSelect
      id="rel-destinos-recorte-mobile"
      label="Recorte"
      bind:value={recorte}
      options={[
        { value: 'todos', label: 'Todos' },
        { value: 'top5', label: 'Top 5' },
        { value: 'top10', label: 'Top 10' }
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
    id="rel-destinos-periodo-modo"
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
      id="rel-destinos-mes"
      label="Mês"
      type="month"
      bind:value={mesSelecionado}
      class_name="w-full"
    />
  {:else}
    <FieldInput
      id="rel-destinos-data-inicio"
      label="Data Início"
      type="date"
      bind:value={dataInicio}
      class_name="w-full"
    />
    <FieldInput
      id="rel-destinos-data-fim"
      label="Data Fim"
      type="date"
      bind:value={dataFim}
      min={dataInicio || null}
      class_name="w-full"
    />
  {/if}
  {#if showEmpresaFiltro}
    <FieldSelect
      id="rel-destinos-empresa"
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
      id="rel-destinos-vendedor"
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
    id="rel-destinos-ordenacao"
    label="Ordenar Por"
    bind:value={ordenacao}
    options={[
      { value: 'receita', label: 'Receita' },
      { value: 'quantidade', label: 'Quantidade' },
      { value: 'ticket_medio', label: 'Ticket Medio' }
    ]}
    placeholder={null}
    class_name="w-full"
  />
  <FieldSelect
    id="rel-destinos-recorte"
    label="Recorte"
    bind:value={recorte}
    options={[
      { value: 'todos', label: 'Todos' },
      { value: 'top5', label: 'Top 5' },
      { value: 'top10', label: 'Top 10' }
    ]}
    placeholder={null}
    class_name="w-full"
  />
</FilterPanel>

{#if destinoTop}
  <Card color="financeiro" class="mb-6">
    <div class="flex items-center gap-4">
      <div class="bg-financeiro-100 rounded-full p-4">
        <MapPin size={32} class="text-financeiro-600" />
      </div>
      <div class="flex-1">
        <h3 class="text-lg font-semibold text-slate-900">Destino em Destaque</h3>
        <p class="text-financeiro-600 text-2xl font-bold">{destinoTop.destino}</p>
        <div class="mt-2 flex gap-6 text-sm">
          <span class="text-slate-500">{destinoTop.quantidade} vendas</span>
          <span class="text-slate-500">{formatCurrency(destinoTop.receita)} em receita</span>
          <span class="text-slate-500">{destinoTop.percentual.toFixed(1)}% do total</span>
        </div>
      </div>
    </div>
  </Card>
{/if}

<div class="mb-6 grid grid-cols-1 gap-6 lg:grid-cols-2">
  <Card header="Receita por Destino" color="financeiro">
    <ChartJS type="doughnut" data={vendasPorDestinoData} height={280} />
  </Card>
  <Card header="Top Destinos (Quantidade)" color="financeiro">
    <ChartJS type="bar" data={vendasPorQuantidadeData} height={280} />
  </Card>
</div>

{#if relatorioTruncado}
  <div
    class="mb-4 flex flex-col gap-3 rounded-2xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800 sm:flex-row sm:items-center sm:justify-between"
  >
    <span
      >Exibindo {destinos.length} de {totalRelatorioItems} destinos. Carregue mais somente quando precisar
      detalhar/exportar mais linhas.</span
    >
    <Button variant="secondary" size="sm" disabled={loadingMore} on:click={loadMoreRelatorio}>
      {loadingMore ? 'Carregando...' : 'Carregar mais'}
    </Button>
  </div>
{/if}

<DataTable
  {columns}
  data={destinosFiltrados}
  color="financeiro"
  {loading}
  title="Detalhamento por Destino"
  searchable={true}
  exportable={true}
  onExport={handleExport}
  onRowClick={handleRowClick}
/>
