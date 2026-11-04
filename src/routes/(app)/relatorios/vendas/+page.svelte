<script lang="ts">
  import { onDestroy, onMount, tick } from 'svelte';
  import { goto, replaceState } from '$app/navigation';
  import type { ChartData } from 'chart.js';
  import PageHeader from '$lib/components/ui/PageHeader.svelte';
  import Card from '$lib/components/ui/Card.svelte';
  import Button from '$lib/components/ui/Button.svelte';
  import DataTable from '$lib/components/ui/DataTable.svelte';
  import LoadingState from '$lib/components/ui/LoadingState.svelte';
  import { FieldInput, FieldSelect, BottomSheet } from '$lib/components/ui';
  import ChartJS from '$lib/components/charts/ChartJS.svelte';
  import KPICard from '$lib/components/kpis/KPICard.svelte';
  import KPIGrid from '$lib/components/kpis/KPIGrid.svelte';
  import {
    ArrowLeft,
    X,
    TrendingUp,
    DollarSign,
    Users,
    ShoppingCart,
    SlidersHorizontal
  } from '$lib/icons';
  import { toast } from '$lib/stores/ui';
  import { permissoes } from '$lib/stores/permissoes';
  import {
    addMonthsISODate,
    monthRangeFromKey,
    monthRangeFromYearMonth,
    parseISODateParts,
    todayISODateLocal
  } from '$lib/date';
  import { formatCurrency, formatDate } from '$lib/utils/formatters';
  import { toUserMessage } from '$lib/utils/errors';
  import { createDebouncedReloader } from '$lib/utils/autoReload';
  import { apiFetch, apiGet, isCanceledApiError } from '$lib/services/api';

  interface Recibo {
    id: string | null;
    numero_recibo: string | null;
    numero_recibo_normalizado: string | null;
    data_venda: string | null;
    vendedor_id?: string | null;
    vendedor_nome?: string | null;
    produto_id?: string | null;
    tipo_produto: string;
    produto_nome: string;
    cidade_nome: string | null;
    valor_total: number;
    valor_taxas: number;
    valor_du: number;
    valor_rav: number;
    percentual_comissao_loja: number;
    faixa_comissao: string | null;
    valor_comissao_loja: number;
    valor_bruto_override?: number | null;
    valor_liquido_override?: number | null;
    valor_meta_override?: number | null;
    valor_comissionavel?: number | null;
    valor_comissao_calculada?: number | null;
    percentual_comissao_calculado?: number | null;
  }

  interface VendaRelatorio {
    id: string;
    numero_venda: string | null;
    codigo: string;
    data_venda: string | null;
    data_embarque: string | null;
    data_final: string | null;
    cliente_id: string | null;
    cliente_nome: string;
    cliente_cpf: string | null;
    vendedor_id: string | null;
    vendedor_nome: string;
    destino_id: string | null;
    destino_nome: string;
    destino_cidade_id: string | null;
    destino_cidade_nome: string | null;
    valor_total: number;
    valor_taxas: number;
    cancelada: boolean;
    status: 'confirmada' | 'pendente' | 'concluida' | 'cancelada';
    forma_pagamento: string;
    recibos: Recibo[];
    comissao: number;
  }

  interface Resumo {
    total_vendas: number;
    vendas_confirmadas: number;
    vendas_canceladas: number;
    total_valor: number;
    total_comissao: number;
    ticket_medio: number;
    total_recibos?: number;
  }

  interface VendedorFiltro {
    id: string;
    nome: string;
  }

  interface EmpresaFiltro {
    id: string;
    nome: string;
  }

  interface BasePayload {
    empresas: EmpresaFiltro[];
    vendedores: Array<VendedorFiltro & { company_id?: string; company_name?: string }>;
  }

  interface RelatorioPayload {
    items: VendaRelatorio[];
    total?: number;
    resumo: Resumo;
    series?: {
      mensal?: Array<{ key: string; total_valor: number }>;
      diaria?: Array<{ date: string; value: number }>;
    };
    pagination?: {
      offset: number;
      limit: number;
      returned: number;
      total: number;
      truncated: boolean;
    };
  }

  interface ReciboLinha {
    id: string;
    venda_id: string;
    codigo: string;
    numero_recibo: string | null;
    data_venda: string | null;
    produto_id: string | null;
    cliente_nome: string;
    cliente_cpf: string | null;
    vendedor_nome: string;
    destino_nome: string;
    cidade_nome: string | null;
    produto_nome: string;
    tipo_produto: string;
    valor_total: number;
    valor_taxas: number;
    comissao: number;
    percentual_comissao: number;
    status: VendaRelatorio['status'];
    forma_pagamento: string;
  }

  type PeriodoModo = 'mes' | 'periodo';

  function getDefaultRange() {
    return getCurrentMonthRange();
  }

  function getCurrentMonthRange() {
    const today = todayISODateLocal();
    return {
      start: `${today.slice(0, 7)}-01`,
      end: today
    };
  }

  function getReportMonthRange(monthKey: string) {
    const today = todayISODateLocal();
    const range = monthRangeFromKey(monthKey);
    if (!range) return getCurrentMonthRange();
    return {
      start: range.inicio,
      end: monthKey === today.slice(0, 7) ? today : range.fim
    };
  }

  const MONTH_LABEL_FORMATTER = new Intl.DateTimeFormat('pt-BR', {
    month: 'short',
    year: '2-digit',
    timeZone: 'UTC'
  });

  function formatMonthLabel(monthKey: string) {
    const [year, month] = monthKey.split('-').map(Number);
    return MONTH_LABEL_FORMATTER.format(new Date(Date.UTC(year, month - 1, 1)));
  }

  function hasConciliacaoOverride(recibo?: Recibo | null) {
    return Boolean(
      recibo &&
      (recibo.valor_bruto_override != null ||
        recibo.valor_liquido_override != null ||
        recibo.valor_meta_override != null ||
        recibo.faixa_comissao ||
        recibo.percentual_comissao_loja != null)
    );
  }

  function getReciboBaseBruta(recibo: Recibo) {
    if (hasConciliacaoOverride(recibo) && recibo.valor_bruto_override != null) {
      return Math.max(0, Number(recibo.valor_bruto_override || 0));
    }
    return Math.max(0, Number(recibo.valor_total || 0));
  }

  function getFatorComissionavelRecibo(recibo: Recibo) {
    const bruto = getReciboBaseBruta(recibo);
    if (bruto <= 0) return 0;
    const brutoComissionavel =
      recibo.valor_comissionavel != null ? Number(recibo.valor_comissionavel || 0) : bruto;
    if (!Number.isFinite(brutoComissionavel)) return 1;
    return Math.max(0, Math.min(1, brutoComissionavel / bruto));
  }

  function getReciboBrutoExibicao(recibo: Recibo) {
    return getReciboBaseBruta(recibo) * getFatorComissionavelRecibo(recibo);
  }

  function getReciboTaxasExibicao(recibo: Recibo) {
    return Math.max(0, Number(recibo.valor_taxas || 0)) * getFatorComissionavelRecibo(recibo);
  }

  function normalizarDataIso(value?: string | null) {
    const raw = String(value || '').trim();
    if (!raw) return '';
    const iso = raw.includes('T') ? raw.slice(0, 10) : raw;
    return /^\d{4}-\d{2}-\d{2}$/.test(iso) ? iso : '';
  }

  function buildReciboBusinessKey(
    recibo: Pick<ReciboLinha, 'numero_recibo' | 'produto_id' | 'produto_nome' | 'data_venda'>
  ) {
    const numeroRecibo = String(recibo.numero_recibo || '')
      .trim()
      .toLowerCase();
    const produtoId = String(recibo.produto_id || recibo.produto_nome || '')
      .trim()
      .toLowerCase();
    const dataVenda = normalizarDataIso(recibo.data_venda);
    if (!numeroRecibo || !produtoId || !dataVenda) return '';
    return `${numeroRecibo}::${produtoId}::${dataVenda}`;
  }

  function normalizarRecibosPeriodo(
    recibos: ReciboLinha[],
    inicio?: string | null,
    fim?: string | null
  ) {
    const ini = normalizarDataIso(inicio);
    const end = normalizarDataIso(fim);
    const idsSeen = new Set<string>();
    const businessSeen = new Set<string>();

    return recibos.filter((recibo) => {
      const data = normalizarDataIso(recibo.data_venda);
      if (ini && (!data || data < ini)) return false;
      if (end && (!data || data > end)) return false;

      const reciboId = String(recibo.id || '').trim();
      if (reciboId) {
        if (idsSeen.has(reciboId)) return false;
        idsSeen.add(reciboId);
      }

      const businessKey = buildReciboBusinessKey(recibo);
      if (businessKey) {
        if (businessSeen.has(businessKey)) return false;
        businessSeen.add(businessKey);
      }

      return true;
    });
  }

  function getLastSixMonthsRange(referenceIso?: string | null) {
    const reference = referenceIso || todayISODateLocal();
    const parts = parseISODateParts(reference);
    if (!parts) return getCurrentMonthRange();
    const monthStart = `${parts.year}-${String(parts.month).padStart(2, '0')}-01`;
    return {
      start: addMonthsISODate(monthStart, -5),
      end: parts.iso
    };
  }

  const defaultRange = getDefaultRange();
  const defaultMonth = todayISODateLocal().slice(0, 7);
  const RELATORIO_ITEMS_LIMIT = 250;
  let vendas: VendaRelatorio[] = [];
  let vendedores: VendedorFiltro[] = [];
  let empresas: EmpresaFiltro[] = [];
  let resumo: Resumo = {
    total_vendas: 0,
    vendas_confirmadas: 0,
    vendas_canceladas: 0,
    total_valor: 0,
    total_comissao: 0,
    ticket_medio: 0
  };
  let loading = true;
  let loadingBase = true;
  let filtroPeriodoModo: PeriodoModo = 'mes';
  let mesSelecionado = defaultMonth;
  let dataInicio = defaultRange.start;
  let dataFim = defaultRange.end;
  let vendedorSelecionado = '';
  let empresaSelecionada = '';
  let clienteIdFiltro = '';
  let destinoFiltro = '';
  let produtoFiltro = '';
  let tipoProdutoFiltro = '';
  let chartSeries: NonNullable<RelatorioPayload['series']> = {
    mensal: [],
    diaria: []
  };
  let autoReloadEnabled = false;
  let lastAutoReloadKey = '';
  let baseRequestSeq = 0;
  let baseAbortController: AbortController | null = null;
  let relatorioRequestSeq = 0;
  let relatorioAbortController: AbortController | null = null;
  let loadMoreAbortController: AbortController | null = null;
  let loadingMore = false;
  let totalDetalheVendas = 0;
  let detalheTruncado = false;
  let showFilterSheet = false;
  const autoReload = createDebouncedReloader(() => loadRelatorio(), 250);

  const columnsBase = [
    { key: 'numero_recibo', label: 'Recibo', sortable: true, width: '140px' },
    {
      key: 'data_venda',
      label: 'Data',
      sortable: true,
      width: '100px',
      formatter: (value: string | null) => formatDate(value)
    },
    { key: 'cliente_nome', label: 'Cliente', sortable: true },
    { key: 'vendedor_nome', label: 'Vendedor', sortable: true, width: '160px' },
    { key: 'destino_nome', label: 'Destino', sortable: true },
    { key: 'produto_nome', label: 'Produto', sortable: true },
    {
      key: 'valor_total',
      label: 'Valor',
      sortable: true,
      align: 'right' as const,
      formatter: (value: number) => formatCurrency(value)
    },
    {
      key: 'valor_taxas',
      label: 'Taxas',
      sortable: true,
      align: 'right' as const,
      formatter: (value: number) => formatCurrency(value)
    },
    {
      key: 'comissao',
      label: 'Comissão',
      sortable: true,
      align: 'right' as const,
      formatter: (value: number) => formatCurrency(value)
    },
    {
      key: 'percentual_comissao',
      label: '% Comissão',
      sortable: true,
      align: 'right' as const,
      formatter: (value: number) => `${value.toFixed(2).replace('.', ',')}%`
    }
  ];

  let columns = columnsBase;

  async function loadBase() {
    const requestSeq = ++baseRequestSeq;
    baseAbortController?.abort();
    const controller = new AbortController();
    baseAbortController = controller;
    loadingBase = true;
    try {
      const data = await apiGet<BasePayload>(
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
      toast.error(toUserMessage(err, 'Erro ao carregar filtros analíticos'));
    } finally {
      if (requestSeq === baseRequestSeq) {
        loadingBase = false;
        if (baseAbortController === controller) {
          baseAbortController = null;
        }
      }
    }
  }

  function syncUrl() {
    const params = new URLSearchParams({
      data_inicio: dataInicio,
      data_fim: dataFim,
      periodo: filtroPeriodoModo
    });

    if (filtroPeriodoModo === 'mes') params.set('mes', mesSelecionado);

    if (empresaSelecionada) params.set('empresa_id', empresaSelecionada);
    if (vendedorSelecionado) params.set('vendedor_id', vendedorSelecionado);
    if (clienteIdFiltro) params.set('cliente_id', clienteIdFiltro);
    if (destinoFiltro) params.set('destino', destinoFiltro);
    if (produtoFiltro) params.set('produto', produtoFiltro);
    if (tipoProdutoFiltro) params.set('tipo_produto', tipoProdutoFiltro);

    // Só atualiza o endereço (replaceState do SvelteKit = sem navegação). Com goto(), o
    // beforeNavigate do layout raiz chama abortInFlightApiReads(): se o relatório terminasse antes
    // do loadBase() (disparados juntos no onMount), a busca dos filtros era cancelada e nunca
    // resolvia, deixando empresas/vendedores em "carregando".
    replaceState(`/relatorios/vendas?${params.toString()}`, {});
  }

  function buildRelatorioParams(start: string, end: string) {
    const params = new URLSearchParams({
      data_inicio: start,
      data_fim: end
    });

    if (empresaSelecionada) params.set('empresa_id', empresaSelecionada);
    if (vendedorSelecionado) params.set('vendedor_id', vendedorSelecionado);
    if (clienteIdFiltro) params.set('cliente_id', clienteIdFiltro);
    if (destinoFiltro) params.set('destino', destinoFiltro);
    if (produtoFiltro) params.set('produto', produtoFiltro);
    if (tipoProdutoFiltro) params.set('tipo_produto', tipoProdutoFiltro);

    return params;
  }

  function buildAutoReloadKey() {
    return [
      filtroPeriodoModo,
      mesSelecionado,
      dataInicio,
      dataFim,
      empresaSelecionada,
      vendedorSelecionado,
      clienteIdFiltro,
      destinoFiltro,
      produtoFiltro,
      tipoProdutoFiltro
    ].join('|');
  }

  function scheduleAutoReload() {
    autoReload.schedule();
  }

  async function handleFilterChange() {
    await tick();
    if (!autoReloadEnabled) return;
    autoReload.cancel();
    lastAutoReloadKey = buildAutoReloadKey();
    void loadRelatorio();
  }

  async function fetchRelatorioRange(
    start: string,
    end: string,
    signal?: AbortSignal,
    offset = 0
  ): Promise<RelatorioPayload> {
    const params = buildRelatorioParams(start, end);
    return apiFetch<RelatorioPayload>('/api/v1/relatorios/vendas', {
      method: 'GET',
      timeoutMs: 120_000,
      cacheTtlMs: 30_000,
      signal,
      query: {
        ...Object.fromEntries(params),
        items_limit: RELATORIO_ITEMS_LIMIT,
        items_offset: offset,
        include_summary: offset > 0 ? 0 : 1
      }
    });
  }

  async function loadRelatorio(showSuccess = false) {
    const requestSeq = ++relatorioRequestSeq;
    relatorioAbortController?.abort();
    const controller = new AbortController();
    relatorioAbortController = controller;
    loading = true;

    try {
      const principal = await fetchRelatorioRange(dataInicio, dataFim, controller.signal);
      if (requestSeq !== relatorioRequestSeq) return;

      vendas = principal.items || [];
      totalDetalheVendas = Number(principal.pagination?.total ?? principal.total ?? vendas.length);
      detalheTruncado = Boolean(principal.pagination?.truncated);
      resumo = principal.resumo || resumo;
      chartSeries = {
        mensal: principal.series?.mensal || [],
        diaria: principal.series?.diaria || []
      };

      syncUrl();

      if (showSuccess) {
        toast.success('Relatório atualizado');
      }
    } catch (err) {
      if (isCanceledApiError(err)) return;
      if (requestSeq !== relatorioRequestSeq) return;

      if (vendas.length === 0) {
        vendas = [];
      }
      totalDetalheVendas = 0;
      detalheTruncado = false;
      chartSeries = { mensal: [], diaria: [] };
      toast.error(toUserMessage(err, 'Erro ao carregar relatório de vendas'));
    } finally {
      if (requestSeq === relatorioRequestSeq) {
        loading = false;
        if (relatorioAbortController === controller) {
          relatorioAbortController = null;
        }
      }
    }
  }

  async function loadMoreDetalhe() {
    if (loading || loadingMore || !detalheTruncado) return;
    const requestKey = buildAutoReloadKey();
    loadMoreAbortController?.abort();
    const controller = new AbortController();
    loadMoreAbortController = controller;
    loadingMore = true;

    try {
      const nextPage = await fetchRelatorioRange(
        dataInicio,
        dataFim,
        controller.signal,
        vendas.length
      );
      if (requestKey !== buildAutoReloadKey()) return;

      vendas = [...vendas, ...(nextPage.items || [])];
      totalDetalheVendas = Number(nextPage.pagination?.total ?? nextPage.total ?? vendas.length);
      detalheTruncado = Boolean(nextPage.pagination?.truncated);
    } catch (err) {
      if (isCanceledApiError(err)) return;
      toast.error(toUserMessage(err, 'Erro ao carregar mais vendas'));
    } finally {
      loadingMore = false;
      if (loadMoreAbortController === controller) {
        loadMoreAbortController = null;
      }
    }
  }

  onMount(async () => {
    const params = new URLSearchParams(window.location.search);
    const hasDataInicio = Boolean(params.get('data_inicio'));
    const hasDataFim = Boolean(params.get('data_fim'));
    const periodoParam = params.get('periodo');
    const mesParam = params.get('mes');
    const monthRange = getCurrentMonthRange();
    const vendedorDefaultRange =
      $permissoes.ready && ($permissoes.isVendedor || $permissoes.usoIndividual);

    if (periodoParam === 'mes' || (mesParam && periodoParam !== 'periodo')) {
      filtroPeriodoModo = 'mes';
      mesSelecionado = mesParam || defaultMonth;
      const range = getReportMonthRange(mesSelecionado);
      dataInicio = range.start;
      dataFim = range.end;
    } else if (hasDataInicio || hasDataFim) {
      filtroPeriodoModo = 'periodo';
      dataInicio = hasDataInicio
        ? String(params.get('data_inicio'))
        : vendedorDefaultRange
          ? monthRange.start
          : defaultRange.start;
      dataFim = hasDataFim
        ? String(params.get('data_fim'))
        : vendedorDefaultRange
          ? monthRange.end
          : defaultRange.end;
      mesSelecionado = dataInicio.slice(0, 7) || defaultMonth;
    } else {
      filtroPeriodoModo = 'mes';
      mesSelecionado = defaultMonth;
      const range = getReportMonthRange(mesSelecionado);
      dataInicio = range.start;
      dataFim = range.end;
    }

    vendedorSelecionado = params.get('vendedor_id') || '';
    empresaSelecionada = params.get('empresa_id') || '';
    clienteIdFiltro = params.get('cliente_id') || '';
    destinoFiltro = params.get('destino') || '';
    produtoFiltro = params.get('produto') || '';
    tipoProdutoFiltro = params.get('tipo_produto') || '';

    // loadBase carrega filtros (empresas/vendedores); loadRelatorio não depende deles no mount.
    await Promise.all([loadBase(), loadRelatorio()]);
    lastAutoReloadKey = buildAutoReloadKey();
    autoReloadEnabled = true;
  });

  onDestroy(() => {
    baseAbortController?.abort();
    relatorioAbortController?.abort();
    loadMoreAbortController?.abort();
    autoReload.cancel();
  });

  function getStatusBadge(status: string): string {
    const styles: Record<string, string> = {
      confirmada: 'bg-green-100 text-green-700',
      pendente: 'bg-amber-100 text-amber-700',
      concluida: 'bg-blue-100 text-blue-700',
      cancelada: 'bg-red-100 text-red-700'
    };
    const labels: Record<string, string> = {
      confirmada: 'Confirmada',
      pendente: 'Pendente',
      concluida: 'Concluída',
      cancelada: 'Cancelada'
    };

    return `<span class="inline-flex px-2 py-1 text-xs font-medium rounded-full ${styles[status] || 'bg-slate-100 text-slate-600'}">${labels[status] || status}</span>`;
  }

  function handleExport() {
    if (recibosFiltrados.length === 0) {
      toast.info('Não há recibos para exportar');
      return;
    }

    const hideVendedorColumn =
      $permissoes.ready && ($permissoes.isVendedor || $permissoes.usoIndividual);
    const headers = [
      'Recibo',
      'Data',
      'Cliente',
      ...(hideVendedorColumn ? [] : ['Vendedor']),
      'Destino',
      'Produto',
      'Valor',
      'Taxas',
      'Comissão',
      '% Comissão'
    ];
    const rows = recibosFiltrados.map((recibo) => [
      recibo.numero_recibo || '',
      recibo.data_venda ? formatDate(recibo.data_venda) : '',
      recibo.cliente_nome,
      ...(hideVendedorColumn ? [] : [recibo.vendedor_nome]),
      recibo.destino_nome,
      recibo.produto_nome,
      recibo.valor_total.toFixed(2).replace('.', ','),
      recibo.valor_taxas.toFixed(2).replace('.', ','),
      recibo.comissao.toFixed(2).replace('.', ','),
      recibo.percentual_comissao.toFixed(2).replace('.', ',')
    ]);

    const csv = ['\uFEFF' + headers.join(';'), ...rows.map((row) => row.join(';'))].join('\n');
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
    const link = document.createElement('a');
    link.href = URL.createObjectURL(blob);
    link.download = `relatorio_vendas_${todayISODateLocal()}.csv`;
    link.click();
    toast.success('Relatório exportado com sucesso');
  }

  function clearContextFilters() {
    clienteIdFiltro = '';
    destinoFiltro = '';
    produtoFiltro = '';
    tipoProdutoFiltro = '';
  }

  function handleRowClick(row: ReciboLinha) {
    void goto(`/vendas/${row.venda_id}`);
  }

  // Regra fiel de escopo: vendedor/uso individual não deve escolher empresa ou vendedor global.
  $: showEmpresaFiltro = $permissoes.ready && ($permissoes.isSystemAdmin || $permissoes.isMaster);
  $: showVendedorFiltro =
    $permissoes.ready && !$permissoes.isVendedor && !$permissoes.usoIndividual;
  $: hideVendedorColumn =
    $permissoes.ready && ($permissoes.isVendedor || $permissoes.usoIndividual);
  $: columns = hideVendedorColumn
    ? columnsBase.filter((column) => column.key !== 'vendedor_nome')
    : columnsBase;

  $: if ($permissoes.ready && !showEmpresaFiltro && empresaSelecionada) {
    empresaSelecionada = '';
  }

  $: if ($permissoes.ready && !showVendedorFiltro && vendedorSelecionado) {
    vendedorSelecionado = '';
  }

  $: if (filtroPeriodoModo === 'mes') {
    const range = getReportMonthRange(mesSelecionado);
    if (dataInicio !== range.start) dataInicio = range.start;
    if (dataFim !== range.end) dataFim = range.end;
  }

  // O $: do modo legado só reage às variáveis escritas nesta linha (não enxerga dentro de
  // buildAutoReloadKey()). Por isso a mesma expressão da função fica aqui, idêntica.
  $: autoReloadKey = [
    filtroPeriodoModo,
    mesSelecionado,
    dataInicio,
    dataFim,
    empresaSelecionada,
    vendedorSelecionado,
    clienteIdFiltro,
    destinoFiltro,
    produtoFiltro,
    tipoProdutoFiltro
  ].join('|');

  $: if (autoReloadEnabled && autoReloadKey !== lastAutoReloadKey) {
    lastAutoReloadKey = autoReloadKey;
    scheduleAutoReload();
  }

  function buildReciboLinhas(
    rows: VendaRelatorio[],
    periodo: { inicio?: string | null; fim?: string | null } = { inicio: dataInicio, fim: dataFim }
  ): ReciboLinha[] {
    const linhas = rows.flatMap((venda) =>
      (Array.isArray(venda.recibos) ? venda.recibos : []).map((recibo, index) => ({
        id: recibo.id || `${venda.id}:${index}`,
        venda_id: venda.id,
        codigo: venda.codigo,
        numero_recibo: recibo.numero_recibo,
        data_venda: recibo.data_venda || venda.data_venda,
        produto_id: recibo.produto_id || null,
        cliente_nome: venda.cliente_nome,
        cliente_cpf: venda.cliente_cpf,
        vendedor_nome: recibo.vendedor_nome || venda.vendedor_nome,
        cidade_nome: recibo.cidade_nome || venda.destino_cidade_nome,
        destino_nome:
          recibo.cidade_nome ||
          venda.destino_cidade_nome ||
          venda.destino_nome ||
          'Destino nao informado',
        produto_nome: recibo.produto_nome,
        tipo_produto: recibo.tipo_produto,
        valor_total: getReciboBrutoExibicao(recibo),
        valor_taxas: getReciboTaxasExibicao(recibo),
        comissao: Number(recibo.valor_comissao_calculada || 0),
        percentual_comissao: Number(recibo.percentual_comissao_calculado || 0),
        status: venda.status,
        forma_pagamento: venda.forma_pagamento
      }))
    );

    return normalizarRecibosPeriodo(linhas, periodo.inicio, periodo.fim);
  }

  $: recibosFiltrados = buildReciboLinhas(vendas, { inicio: dataInicio, fim: dataFim });
  $: totalVendas = Number(resumo.total_valor || 0);
  $: totalComissoes = Number(resumo.total_comissao || 0);
  $: totalRecibos = Number(resumo.total_recibos ?? recibosFiltrados.length);
  $: ticketMedio = Number(resumo.ticket_medio || 0);
  $: monthKeys = (() => {
    const reference = parseISODateParts(dataFim || todayISODateLocal());
    if (!reference) return [];
    const monthStart = `${reference.year}-${String(reference.month).padStart(2, '0')}-01`;
    return Array.from({ length: 6 }, (_, index) => {
      return addMonthsISODate(monthStart, -(5 - index)).slice(0, 7);
    });
  })();

  $: currentMonthKey = (() => {
    return (dataFim || todayISODateLocal()).slice(0, 7);
  })();

  $: vendasPorMesData = (() => {
    const monthMap = new Map<string, number>();

    for (const item of chartSeries.mensal || []) {
      monthMap.set(item.key, Number(item.total_valor || 0));
    }

    return {
      labels: monthKeys.map((key) => formatMonthLabel(key)),
      datasets: [
        {
          label: 'Vendas',
          data: monthKeys.map((key) => monthMap.get(key) || 0),
          backgroundColor: '#f97316'
        }
      ]
    } satisfies ChartData;
  })();

  $: vendasPorDiaMesData = (() => {
    const reference = parseISODateParts(dataFim || todayISODateLocal());
    if (!reference) {
      return { labels: [], datasets: [] } satisfies ChartData;
    }
    const range = monthRangeFromYearMonth(reference.year, reference.month);
    const daysInMonth = Number(range.fim.slice(8, 10));
    const dayMap = new Map<number, number>();

    for (const point of chartSeries.diaria || []) {
      const date = String(point?.date || '').slice(0, 10);
      if (!date) continue;
      const day = Number(date.slice(8, 10));
      if (!Number.isFinite(day) || day <= 0) continue;
      dayMap.set(day, (dayMap.get(day) || 0) + Number(point.value || 0));
    }

    const labels = Array.from({ length: daysInMonth }, (_, idx) =>
      String(idx + 1).padStart(2, '0')
    );
    const data = Array.from({ length: daysInMonth }, (_, idx) => dayMap.get(idx + 1) || 0);

    return {
      labels,
      datasets: [
        {
          label: 'Entrada diária',
          data,
          borderColor: '#0ea5e9',
          backgroundColor: 'rgba(14,165,233,0.18)',
          fill: true,
          tension: 0.25
        }
      ]
    } satisfies ChartData;
  })();
</script>

<svelte:head>
  <title>Relatório de Vendas | VTUR</title>
</svelte:head>

<PageHeader
  title="Relatório de Vendas"
  subtitle="Leitura detalhada das vendas com drill-down operacional por cliente, destino, produto e responsável."
  color="financeiro"
  actions={[{ label: 'Voltar', href: '/relatorios', variant: 'secondary', icon: ArrowLeft }]}
  breadcrumbs={[{ label: 'Relatórios', href: '/relatorios' }, { label: 'Vendas' }]}
/>

<!-- Mobile: botão de filtros -->
<div class="mb-4 sm:hidden">
  <Button variant="secondary" class_name="w-full" on:click={() => (showFilterSheet = true)}>
    <SlidersHorizontal size={16} class="mr-2" />
    Filtros
    {#if empresaSelecionada || vendedorSelecionado}
      <span class="bg-financeiro-500 ml-2 inline-flex h-2 w-2 rounded-full"></span>
    {/if}
  </Button>
</div>

<BottomSheet bind:open={showFilterSheet} title="Filtrar vendas">
  <div class="flex flex-col gap-4">
    <FieldSelect
      id="rel-vendas-periodo-modo-mobile"
      label="Período"
      bind:value={filtroPeriodoModo}
      options={[
        { value: 'mes', label: 'Mês' },
        { value: 'periodo', label: 'Data específica' }
      ]}
      placeholder={null}
      class_name="w-full"
    />
    {#if filtroPeriodoModo === 'mes'}
      <FieldInput
        id="rel-vendas-mes-mobile"
        label="Mês"
        type="month"
        bind:value={mesSelecionado}
        class_name="w-full"
      />
    {:else}
      <FieldInput
        id="rel-vendas-data-inicio-mobile"
        label="Data início"
        type="date"
        bind:value={dataInicio}
        class_name="w-full"
      />
      <FieldInput
        id="rel-vendas-data-fim-mobile"
        label="Data fim"
        type="date"
        bind:value={dataFim}
        min={dataInicio || null}
        class_name="w-full"
      />
    {/if}
    {#if showEmpresaFiltro}
      <FieldSelect
        id="rel-vendas-empresa-mobile"
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
        id="rel-vendas-vendedor-mobile"
        label="Vendedor"
        bind:value={vendedorSelecionado}
        options={[
          { value: '', label: 'Todos' },
          ...vendedores.map((vendedor) => ({ value: vendedor.id, label: vendedor.nome }))
        ]}
        placeholder={null}
        class_name="w-full"
        on:change={handleFilterChange}
      />
    {/if}
    <Button variant="primary" class_name="w-full mt-2" on:click={() => (showFilterSheet = false)}>
      Aplicar filtros
    </Button>
  </div>
</BottomSheet>

<Card color="financeiro" class="mb-6 hidden sm:block">
  <div class="flex flex-col gap-4">
    <div class="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-6">
      <FieldSelect
        id="rel-vendas-periodo-modo"
        label="Período"
        bind:value={filtroPeriodoModo}
        options={[
          { value: 'mes', label: 'Mês' },
          { value: 'periodo', label: 'Data específica' }
        ]}
        placeholder={null}
        class_name="w-full"
      />
      {#if filtroPeriodoModo === 'mes'}
        <FieldInput
          id="rel-vendas-mes"
          label="Mês"
          type="month"
          bind:value={mesSelecionado}
          class_name="w-full"
        />
      {:else}
        <FieldInput
          id="rel-vendas-data-inicio"
          label="Data início"
          type="date"
          bind:value={dataInicio}
          class_name="w-full"
        />
        <FieldInput
          id="rel-vendas-data-fim"
          label="Data fim"
          type="date"
          bind:value={dataFim}
          min={dataInicio || null}
          class_name="w-full"
        />
      {/if}
      {#if showEmpresaFiltro}
        <FieldSelect
          id="rel-vendas-empresa"
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
          id="rel-vendas-vendedor"
          label="Vendedor"
          bind:value={vendedorSelecionado}
          options={[
            { value: '', label: 'Todos' },
            ...vendedores.map((vendedor) => ({ value: vendedor.id, label: vendedor.nome }))
          ]}
          placeholder={null}
          class_name="w-full"
          on:change={handleFilterChange}
        />
      {/if}
    </div>

    {#if clienteIdFiltro || destinoFiltro || produtoFiltro || tipoProdutoFiltro}
      <div
        class="border-financeiro-100 bg-financeiro-50/60 flex flex-wrap items-center gap-2 rounded-2xl border px-3 py-3 text-sm text-slate-600"
      >
        <span class="font-medium text-slate-900">Drill-down ativo:</span>
        {#if clienteIdFiltro}
          <span class="rounded-full bg-white px-3 py-1">Cliente específico</span>
        {/if}
        {#if destinoFiltro}
          <span class="rounded-full bg-white px-3 py-1">Destino: {destinoFiltro}</span>
        {/if}
        {#if produtoFiltro}
          <span class="rounded-full bg-white px-3 py-1">Produto: {produtoFiltro}</span>
        {/if}
        {#if tipoProdutoFiltro}
          <span class="rounded-full bg-white px-3 py-1">Tipo: {tipoProdutoFiltro}</span>
        {/if}
        <Button
          variant="secondary"
          size="sm"
          class_name="rounded-full"
          on:click={clearContextFilters}
        >
          <X size={14} />
          Limpar contexto
        </Button>
      </div>
    {/if}
  </div>
</Card>

{#if loadingBase}
  <LoadingState className="mb-6" />
{/if}

{#if loading}
  <LoadingState className="mb-6" />
{:else}
  <KPIGrid className="mb-6" columns={5}>
    <KPICard
      title="Total vendido"
      value={formatCurrency(totalVendas)}
      color="financeiro"
      icon={DollarSign}
    />
    <KPICard
      title="Total de vendas"
      value={resumo.total_vendas}
      color="financeiro"
      icon={ShoppingCart}
    />
    <KPICard title="Total de recibos" value={totalRecibos} color="financeiro" icon={Users} />
    <KPICard
      title="Comissões"
      value={formatCurrency(totalComissoes)}
      color="financeiro"
      icon={TrendingUp}
    />
    <KPICard
      title="Ticket médio"
      value={formatCurrency(ticketMedio)}
      color="financeiro"
      icon={TrendingUp}
    />
  </KPIGrid>
{/if}

<div class="mb-6 grid grid-cols-1 gap-6 lg:grid-cols-2">
  <Card header="Vendas por mês (últimos 6 meses)" color="financeiro">
    {#if loading}
      <LoadingState />
    {:else}
      <ChartJS type="bar" data={vendasPorMesData} height={280} />
    {/if}
  </Card>
  <Card header="Venda por dia do mês selecionado" color="financeiro">
    {#if loading}
      <LoadingState />
    {:else}
      <ChartJS type="line" data={vendasPorDiaMesData} height={280} />
    {/if}
  </Card>
</div>

{#if detalheTruncado}
  <div
    class="mb-4 flex flex-col gap-3 rounded-2xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900 sm:flex-row sm:items-center sm:justify-between"
  >
    <span>
      Mostrando {vendas.length} de {totalDetalheVendas} vendas no detalhamento para manter a tela responsiva.
      Use filtros mais específicos para carregar/exportar um conjunto menor.
    </span>
    <Button variant="secondary" size="sm" on:click={loadMoreDetalhe} disabled={loadingMore}>
      {loadingMore ? 'Carregando...' : 'Carregar mais'}
    </Button>
  </div>
{/if}

<DataTable
  {columns}
  data={recibosFiltrados}
  color="financeiro"
  {loading}
  title="Detalhamento de vendas"
  searchable={true}
  exportable={true}
  onExport={handleExport}
  onRowClick={handleRowClick}
/>
