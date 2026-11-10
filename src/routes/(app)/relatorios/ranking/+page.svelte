<script lang="ts">
  import { onDestroy, onMount } from 'svelte';
  import { goto, replaceState } from '$app/navigation';
  import PageHeader from '$lib/components/ui/PageHeader.svelte';
  import Button from '$lib/components/ui/Button.svelte';
  import Card from '$lib/components/ui/Card.svelte';
  import DataTable from '$lib/components/ui/DataTable.svelte';
  import { FieldInput, BottomSheet } from '$lib/components/ui';
  import KPIGrid from '$lib/components/kpis/KPIGrid.svelte';
  import {
    ArrowLeft,
    Trophy,
    TrendingUp,
    TrendingDown,
    Minus,
    SlidersHorizontal
  } from '$lib/icons';
  import { formatYearMonthLabel } from '$lib/utils/formatters';
  import { toUserMessage } from '$lib/utils/errors';
  import { toast } from '$lib/stores/ui';
  import { permissoes } from '$lib/stores/permissoes';
  import { apiFetch, isCanceledApiError } from '$lib/services/api';
  import { diffDaysISODate, monthRangeFromKey, todayISODateLocal } from '$lib/date';
  import { clamp, getAtingimentoColor } from '$lib/features/ranking/atingimento';

  interface VendedorRanking {
    posicao: number;
    vendedor_id: string;
    vendedor_nome: string;
    total_vendas: number;
    total_receita: number;
    total_liquido: number;
    total_seguro: number;
    total_comissao: number;
    total_orcamentos: number;
    ticket_medio: number;
    taxa_conversao: number;
    alcance_meta: number;
    alcance_meta_seguro: number;
    meta: number;
    meta_seguro: number;
    tendencia: 'up' | 'down' | 'stable';
  }

  interface Resumo {
    meta_mes: number;
    meta_seguro: number;
    total_receita: number;
    total_seguro: number;
    total_comissao: number;
    total_orcamentos: number;
    total_vendas: number;
    total_recibos: number;
    meta_total: number;
  }

  function getMonthRange(monthValue: string) {
    const raw = String(monthValue || '').trim();
    const normalized = /^\d{4}-\d{2}$/.test(raw) ? raw : todayISODateLocal().slice(0, 7);
    const range =
      monthRangeFromKey(normalized) || monthRangeFromKey(todayISODateLocal().slice(0, 7));

    return {
      month: normalized,
      start: range?.inicio || `${normalized}-01`,
      end: range?.fim || `${normalized}-01`
    };
  }

  function dateValueToMonth(dateValue: string) {
    const raw = String(dateValue || '').trim();
    if (/^\d{4}-\d{2}$/.test(raw)) {
      return raw;
    }
    if (/^\d{4}-\d{2}-\d{2}$/.test(raw)) {
      return raw.slice(0, 7);
    }
    return getMonthRange('').month;
  }

  function formatMonthLabel(monthValue: string) {
    return formatYearMonthLabel(getMonthRange(monthValue).month);
  }

  const BRL_CURRENCY_FORMATTER = new Intl.NumberFormat('pt-BR', {
    style: 'currency',
    currency: 'BRL'
  });

  function formatCurrency(value: number): string {
    return BRL_CURRENCY_FORMATTER.format(value);
  }

  const defaultRange = getMonthRange('');

  let vendedores: VendedorRanking[] = [];
  let loading = true;
  let errorMessage: string | null = null;
  let rankingRequestSeq = 0;
  let mesSelecionado = defaultRange.month;
  let mesReferenciaData = defaultRange.month;
  let dataInicio = defaultRange.start;
  let dataFim = defaultRange.end;
  let resumo: Resumo = {
    meta_mes: 0,
    meta_seguro: 0,
    total_receita: 0,
    total_seguro: 0,
    total_comissao: 0,
    total_orcamentos: 0,
    total_vendas: 0,
    total_recibos: 0,
    meta_total: 0
  };
  let vendedoresSeguro: VendedorRanking[] = [];
  let showFilterSheet = false;
  let rankingAbortController: AbortController | null = null;

  function getDiasRestantesNoMes() {
    const hoje = todayISODateLocal();
    const range = getMonthRange(hoje.slice(0, 7));
    return Math.max(0, diffDaysISODate(hoje, range.end) ?? 0);
  }

  function getValorDiario(row: VendedorRanking) {
    const meta = Number(row.meta || 0);
    const bruto = Number(row.total_receita || 0);
    const restante = Math.max(0, meta - bruto);
    if (diasRestantesNoMes <= 0) return 0;
    return restante / diasRestantesNoMes;
  }

  function getMetaDiariaSeguro(row: VendedorRanking) {
    const metaSeguro = Number(row.meta_seguro || 0);
    const vendidoSeguro = Number(row.total_seguro || 0);
    const restante = Math.max(0, metaSeguro - vendidoSeguro);
    if (diasRestantesNoMes <= 0) return 0;
    return restante / diasRestantesNoMes;
  }

  const ROW_CLASS_META_ATINGIDA = 'bg-emerald-200/70! hover:bg-emerald-300/70!';

  function getRowClassMetaVendas(row: VendedorRanking) {
    return Number(row.alcance_meta || 0) >= 100 ? ROW_CLASS_META_ATINGIDA : '';
  }

  function getRowClassMetaSeguro(row: VendedorRanking) {
    return Number(row.alcance_meta_seguro || 0) >= 100 ? ROW_CLASS_META_ATINGIDA : '';
  }

  const columnsVendas = [
    { key: 'posicao', label: '#', sortable: true, width: '60px' },
    { key: 'vendedor_nome', label: 'Vendedor', sortable: true },
    {
      key: 'total_vendas',
      label: 'Vendas',
      sortable: true,
      align: 'right' as const,
      width: '90px'
    },
    {
      key: 'total_receita',
      label: 'Valor Bruto',
      sortable: true,
      align: 'right' as const,
      formatter: (value: number) => formatCurrency(value)
    },
    {
      key: 'total_liquido',
      label: 'Valor Líquido',
      sortable: true,
      align: 'right' as const,
      formatter: (value: number) => formatCurrency(value)
    },
    {
      key: 'valor_diario',
      label: 'Meta diária',
      sortable: false,
      align: 'right' as const,
      headerClass: 'normal-case tracking-normal!',
      formatter: (_value: number, row: VendedorRanking) => formatCurrency(getValorDiario(row))
    },
    {
      key: 'alcance_meta',
      label: '%',
      sortable: true,
      align: 'right' as const,
      width: '100px',
      formatter: (value: number) => `${value.toFixed(1)}%`
    }
  ];

  const columnsSeguro = [
    { key: 'posicao', label: '#', sortable: true, width: '60px' },
    { key: 'vendedor_nome', label: 'Vendedor', sortable: true },
    {
      key: 'meta_seguro',
      label: 'Meta seguro',
      sortable: true,
      align: 'right' as const,
      formatter: (value: number) => formatCurrency(Number(value || 0))
    },
    {
      key: 'total_seguro',
      label: 'Seguro Viagem',
      sortable: true,
      align: 'right' as const,
      formatter: (value: number) => formatCurrency(value)
    },
    {
      key: 'meta_diaria_seguro',
      label: 'Meta diária',
      sortable: false,
      align: 'right' as const,
      headerClass: 'normal-case tracking-normal!',
      formatter: (_value: number, row: VendedorRanking) => formatCurrency(getMetaDiariaSeguro(row))
    },
    {
      key: 'alcance_meta_seguro',
      label: '%',
      sortable: true,
      align: 'right' as const,
      width: '120px',
      formatter: (value: number) => `${Number(value || 0).toFixed(1)}%`
    }
  ];

  async function loadRanking(showSuccess = false) {
    const requestSeq = ++rankingRequestSeq;
    rankingAbortController?.abort();
    const controller = new AbortController();
    rankingAbortController = controller;
    loading = true;
    errorMessage = null;
    try {
      const data = await apiFetch<{ items: VendedorRanking[]; resumo: Resumo }>(
        '/api/v1/relatorios/ranking',
        {
          method: 'GET',
          timeoutMs: 120_000,
          cacheTtlMs: 30_000,
          signal: controller.signal,
          query: {
            data_inicio: dataInicio,
            data_fim: dataFim
          }
        }
      );
      if (requestSeq !== rankingRequestSeq) return;

      vendedores = data.items || [];
      resumo = data.resumo || resumo;

      if (showSuccess) toast.success('Ranking atualizado');
    } catch (err: unknown) {
      if (isCanceledApiError(err)) return;
      if (requestSeq !== rankingRequestSeq) return;
      vendedores = [];
      errorMessage = toUserMessage(err, 'Erro ao carregar ranking de vendas.');
      toast.error(errorMessage || 'Erro ao carregar ranking de vendas.');
    } finally {
      if (requestSeq === rankingRequestSeq) {
        loading = false;
        if (rankingAbortController === controller) {
          rankingAbortController = null;
        }
      }
    }
  }

  function syncUrl() {
    const params = new URLSearchParams({ mes: mesSelecionado });
    // Só atualiza o endereço (replaceState do SvelteKit = sem navegação). Com goto(), o
    // beforeNavigate do layout raiz chama abortInFlightApiReads() e cancela a busca que acabou
    // de começar; a promessa cancelada por navegação nunca resolve e a tela ficava no skeleton.
    replaceState(`/relatorios/ranking?${params.toString()}`, {});
  }

  async function applyMonthFilter(monthValue: string) {
    const range = getMonthRange(monthValue);
    mesSelecionado = range.month;
    mesReferenciaData = range.month;
    dataInicio = range.start;
    dataFim = range.end;
    syncUrl();
    await loadRanking();
  }

  function handleMesReferenciaChange() {
    const monthValue = dateValueToMonth(mesReferenciaData);
    if (monthValue === mesSelecionado) return;
    void applyMonthFilter(monthValue);
  }

  function handleExportVendas() {
    if (vendedores.length === 0) {
      toast.info('Não há dados para exportar');
      return;
    }
    const headers = ['#', 'Vendedor', 'Vendas', 'Valor Bruto', 'Valor Líquido', 'Meta diária', '%'];
    const rows = vendedores.map((v) => [
      v.posicao,
      v.vendedor_nome,
      v.total_vendas,
      v.total_receita.toFixed(2).replace('.', ','),
      v.total_liquido.toFixed(2).replace('.', ','),
      getValorDiario(v).toFixed(2).replace('.', ','),
      v.alcance_meta.toFixed(1) + '%'
    ]);
    const csv = ['\uFEFF' + headers.join(';'), ...rows.map((r) => r.join(';'))].join('\n');
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
    const link = document.createElement('a');
    link.href = URL.createObjectURL(blob);
    link.download = `ranking_vendas_${todayISODateLocal()}.csv`;
    link.click();
    toast.success('Ranking de vendas exportado');
  }

  function handleExportSeguro() {
    if (vendedores.length === 0) {
      toast.info('Não há dados para exportar');
      return;
    }
    const headers = ['#', 'Vendedor', 'Meta seguro', 'Seguro Viagem', 'Meta diária', '%'];
    const rows = vendedores.map((v) => [
      v.posicao,
      v.vendedor_nome,
      Number(v.meta_seguro || 0)
        .toFixed(2)
        .replace('.', ','),
      v.total_seguro.toFixed(2).replace('.', ','),
      getMetaDiariaSeguro(v).toFixed(2).replace('.', ','),
      Number(v.alcance_meta_seguro || 0).toFixed(1) + '%'
    ]);
    const csv = ['\uFEFF' + headers.join(';'), ...rows.map((r) => r.join(';'))].join('\n');
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
    const link = document.createElement('a');
    link.href = URL.createObjectURL(blob);
    link.download = `ranking_seguro_viagem_${todayISODateLocal()}.csv`;
    link.click();
    toast.success('Ranking de seguro exportado');
  }

  onMount(async () => {
    const params = new URLSearchParams(window.location.search);
    const selectedMonth = params.get('mes') || dataInicio.slice(0, 7) || defaultRange.month;
    const range = getMonthRange(selectedMonth);
    mesSelecionado = range.month;
    mesReferenciaData = range.month;
    dataInicio = range.start;
    dataFim = range.end;
    await loadRanking();
  });

  onDestroy(() => {
    rankingAbortController?.abort();
  });

  $: top3 = vendedores.slice(0, 3);
  $: vendedoresSeguro = [...vendedores]
    .sort((a, b) => Number(b?.total_seguro || 0) - Number(a?.total_seguro || 0))
    .map((item, index) => ({
      ...item,
      posicao: index + 1
    }));

  // Ranking: filtro somente por mês
  $: showRankingPodio =
    !$permissoes.ready || $permissoes.isSystemAdmin || $permissoes.isMaster || $permissoes.isGestor;
  $: showBuscaRanking = true;
  $: showExportRanking = !$permissoes.ready || !$permissoes.isVendedor;
  $: diasRestantesNoMes = getDiasRestantesNoMes();
  $: showPodioTop3 = showRankingPodio;
  $: mesSelecionadoLabel = formatMonthLabel(mesSelecionado);

  $: atingimentoVendasPct =
    resumo.meta_mes > 0 ? (resumo.total_receita / resumo.meta_mes) * 100 : 0;
  $: atingimentoVendasPctClamped = clamp(atingimentoVendasPct, 0, 100);
  $: atingimentoVendasColor = getAtingimentoColor(atingimentoVendasPct);

  $: atingimentoSeguroPct =
    resumo.meta_seguro > 0 ? (resumo.total_seguro / resumo.meta_seguro) * 100 : 0;
  $: atingimentoSeguroPctClamped = clamp(atingimentoSeguroPct, 0, 100);
  $: atingimentoSeguroColor = getAtingimentoColor(atingimentoSeguroPct);
</script>

<svelte:head>
  <title>Ranking de Vendas | VTUR</title>
</svelte:head>

<PageHeader
  title="Ranking de Vendas"
  subtitle="Comparativo por responsável com meta, conversão, comissão e tendência."
  color="financeiro"
  actions={showRankingPodio
    ? [
        { label: 'Placar', href: '/relatorios/ranking/placar', variant: 'secondary', icon: Trophy },
        { label: 'Voltar', href: '/relatorios', variant: 'secondary', icon: ArrowLeft }
      ]
    : [{ label: 'Voltar', href: '/relatorios', variant: 'secondary', icon: ArrowLeft }]}
  breadcrumbs={[{ label: 'Relatórios', href: '/relatorios' }, { label: 'Ranking de Vendas' }]}
/>

<!-- Mobile: botão de filtros -->
<div class="mb-4 sm:hidden">
  <Button variant="secondary" class_name="w-full" on:click={() => (showFilterSheet = true)}>
    <SlidersHorizontal size={16} class="mr-2" />
    Filtros
    {#if mesSelecionado !== defaultRange.month}
      <span class="bg-financeiro-500 ml-2 inline-flex h-2 w-2 rounded-full"></span>
    {/if}
  </Button>
</div>

<BottomSheet bind:open={showFilterSheet} title="Filtrar ranking">
  <div class="flex flex-col gap-4">
    <FieldInput
      id="rank-mes-mobile"
      type="month"
      label="Mês"
      helper="Selecione o mês desejado"
      bind:value={mesReferenciaData}
      on:change={handleMesReferenciaChange}
    />
    <Button variant="primary" class_name="w-full mt-2" on:click={() => (showFilterSheet = false)}>
      Aplicar filtros
    </Button>
  </div>
</BottomSheet>

<!-- Filtros -->
<Card color="financeiro" class="mb-6 hidden sm:block">
  <div class="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
    <FieldInput
      id="rank-mes"
      type="month"
      label="Mês"
      helper="Selecione o mês desejado"
      bind:value={mesReferenciaData}
      on:change={handleMesReferenciaChange}
    />
  </div>
  <p class="mt-2 text-sm font-medium text-slate-600">
    Mês selecionado: <span class="text-slate-900">{mesSelecionadoLabel}</span>
  </p>
</Card>

{#if errorMessage}
  <div
    role="alert"
    class="mb-6 rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700"
  >
    {errorMessage}
  </div>
{/if}

<!-- KPIs -->
<KPIGrid className="mb-6" columns={5}>
  <div class="vtur-kpi-card">
    <div class="flex h-10 w-10 items-center justify-center rounded-xl bg-blue-50 text-blue-500">
      <Trophy size={20} />
    </div>
    <div>
      <p class="text-sm font-medium text-slate-500">Meta do mês</p>
      <p class="text-2xl font-bold text-slate-900">{formatCurrency(resumo.meta_mes)}</p>
    </div>
  </div>

  <div class="vtur-kpi-card">
    <div class="flex h-10 w-10 items-center justify-center rounded-xl bg-orange-50 text-orange-500">
      <TrendingUp size={20} />
    </div>
    <div class="w-full">
      <p class="text-sm font-medium text-slate-500">Valor total de vendas</p>
      <p class="text-2xl font-bold text-slate-900">{formatCurrency(resumo.total_receita)}</p>
      {#if resumo.meta_mes > 0}
        <div class="mt-2 w-full">
          <div class="h-1.5 w-full rounded-full bg-slate-200">
            <div
              class="h-1.5 rounded-full transition-all"
              style={`width:${atingimentoVendasPctClamped.toFixed(1)}%;background:${atingimentoVendasColor};`}
            ></div>
          </div>
          <p class="mt-0.5 text-xs text-slate-500">{atingimentoVendasPct.toFixed(1)}% da meta</p>
        </div>
      {:else}
        <p class="mt-0.5 text-xs text-slate-500">Sem meta cadastrada</p>
      {/if}
    </div>
  </div>

  <div class="vtur-kpi-card">
    <div class="flex h-10 w-10 items-center justify-center rounded-xl bg-amber-50 text-amber-500">
      <TrendingUp size={20} />
    </div>
    <div class="w-full">
      <p class="text-sm font-medium text-slate-500">Total de seguro</p>
      <p class="text-2xl font-bold text-slate-900">{formatCurrency(resumo.total_seguro)}</p>
      {#if resumo.meta_seguro > 0}
        <div class="mt-2 w-full">
          <div class="h-1.5 w-full rounded-full bg-slate-200">
            <div
              class="h-1.5 rounded-full transition-all"
              style={`width:${atingimentoSeguroPctClamped.toFixed(1)}%;background:${atingimentoSeguroColor};`}
            ></div>
          </div>
          <p class="mt-0.5 text-xs text-slate-500">
            {atingimentoSeguroPct.toFixed(1)}% da meta de seguro
          </p>
        </div>
      {:else}
        <p class="mt-0.5 text-xs text-slate-500">Sem meta de seguro cadastrada</p>
      {/if}
    </div>
  </div>

  <div class="vtur-kpi-card">
    <div class="flex h-10 w-10 items-center justify-center rounded-xl bg-green-50 text-green-500">
      <TrendingDown size={20} />
    </div>
    <div>
      <p class="text-sm font-medium text-slate-500">Total de vendas</p>
      <p class="text-2xl font-bold text-slate-900">{resumo.total_vendas}</p>
    </div>
  </div>

  <div class="vtur-kpi-card">
    <div class="flex h-10 w-10 items-center justify-center rounded-xl bg-slate-100 text-slate-500">
      <Minus size={20} />
    </div>
    <div>
      <p class="text-sm font-medium text-slate-500">Total de recibos</p>
      <p class="text-2xl font-bold text-slate-900">{resumo.total_recibos}</p>
    </div>
  </div>
</KPIGrid>

<!-- Pódio top 3 -->
{#if showPodioTop3 && !loading && top3.length > 0}
  <div class="mb-6 grid grid-cols-1 gap-4 sm:grid-cols-3">
    {#each top3 as v, i}
      <div
        class="vtur-card border-t-4 p-5 text-center
        {i === 0
          ? 'border-t-amber-400 bg-amber-50/40'
          : i === 1
            ? 'border-t-slate-400 bg-slate-50/40'
            : 'border-t-orange-400 bg-orange-50/40'}"
      >
        <div class="mb-2 flex items-center justify-center gap-2">
          <Trophy
            size={20}
            class={i === 0 ? 'text-amber-500' : i === 1 ? 'text-slate-500' : 'text-orange-500'}
          />
          <span
            class="text-2xl font-black {i === 0
              ? 'text-amber-600'
              : i === 1
                ? 'text-slate-600'
                : 'text-orange-600'}"
          >
            {v.posicao}º
          </span>
        </div>
        <p class="truncate font-semibold text-slate-900">{v.vendedor_nome}</p>
        <p class="text-financeiro-700 mt-1 text-lg font-bold">{formatCurrency(v.total_receita)}</p>
        <div class="mt-2 flex justify-center gap-3 text-xs text-slate-500">
          <span>{v.total_vendas} venda(s)</span>
          <span>·</span>
          <span>{v.taxa_conversao.toFixed(0)}% conv.</span>
        </div>
        {#if v.meta > 0}
          <div class="mt-3">
            <div class="h-1.5 w-full rounded-full bg-slate-200">
              <div
                class="bg-financeiro-500 h-1.5 rounded-full transition-all"
                style="width: {Math.min(v.alcance_meta, 100).toFixed(1)}%"
              ></div>
            </div>
            <p class="mt-1 text-xs text-slate-500">{v.alcance_meta.toFixed(1)}% da meta</p>
          </div>
        {/if}
        <div class="mt-2 flex justify-center">
          {#if v.tendencia === 'up'}
            <span class="flex items-center gap-1 text-xs font-medium text-green-600">
              <TrendingUp size={12} /> Alta
            </span>
          {:else if v.tendencia === 'down'}
            <span class="flex items-center gap-1 text-xs font-medium text-red-600">
              <TrendingDown size={12} /> Queda
            </span>
          {:else}
            <span class="flex items-center gap-1 text-xs font-medium text-slate-500">
              <Minus size={12} /> Estável
            </span>
          {/if}
        </div>
      </div>
    {/each}
  </div>
{/if}

<!-- Tabela completa de vendas -->
<Card header="Ranking completo de vendas" color="financeiro" padding="none" class="mb-3" />

<DataTable
  columns={columnsVendas}
  data={vendedores}
  color="financeiro"
  {loading}
  rowClass={getRowClassMetaVendas}
  searchable={showBuscaRanking}
  exportable={showExportRanking}
  onExport={handleExportVendas}
/>

<!-- Tabela de meta de seguro -->
<Card
  header="Ranking de meta de seguro viagem"
  color="financeiro"
  padding="none"
  class="mt-6 mb-3"
/>

<DataTable
  columns={columnsSeguro}
  data={vendedoresSeguro}
  color="financeiro"
  {loading}
  rowClass={getRowClassMetaSeguro}
  searchable={showBuscaRanking}
  exportable={showExportRanking}
  onExport={handleExportSeguro}
/>
