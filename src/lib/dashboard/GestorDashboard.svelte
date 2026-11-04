<script lang="ts">
  import { dev } from '$app/environment';
  import { onDestroy, onMount } from 'svelte';
  import type { ChartData, TooltipItem } from 'chart.js';
  import PageHeader from '$lib/components/ui/PageHeader.svelte';
  import Card from '$lib/components/ui/Card.svelte';
  import Button from '$lib/components/ui/Button.svelte';
  import { FieldInput, FieldSelect, LoadingState } from '$lib/components/ui';
  import KPIGrid from '$lib/components/kpis/KPIGrid.svelte';
  import ChartJS from '$lib/components/charts/ChartJS.svelte';
  import {
    Award,
    BarChart2,
    Building2,
    Calendar,
    Clock,
    Eye,
    Gift,
    MapPin,
    MessageCircle,
    RefreshCw,
    ShoppingCart,
    SlidersHorizontal,
    Target,
    TrendingUp,
    UserPlus,
    Users,
    Wallet
  } from '$lib/icons';
  import { toast } from '$lib/stores/ui';
  import { apiFetch, apiGet, isCanceledApiError } from '$lib/services/api';
  import { goto } from '$app/navigation';
  import { addDaysISODate, monthRangeFromKey, todayISODateLocal } from '$lib/date';
  import { formatDate as formatDateValue } from '$lib/utils/formatters';
  import { toUserMessage } from '$lib/utils/errors';
  import { construirLinkWhatsAppComTexto, montarMensagemFollowUp } from '$lib/whatsapp';

  export let title = 'Dashboard do gestor';
  export let subtitle = 'Visão consolidada da equipe e desempenho comercial.';

  // ── Widgets configuráveis (personalização) ──────────────────────────────
  type GestorWidgetId =
    | 'top_vendedores'
    | 'timeline'
    | 'top_destinos'
    | 'clientes'
    | 'ultimas_compras'
    | 'followups'
    | 'aniversariantes'
    | 'comparativo_vendas'
    | 'comparativo_metas';

  const GESTOR_WIDGETS: Array<{ id: GestorWidgetId; titulo: string }> = [
    { id: 'top_vendedores', titulo: 'Top 3 vendedores' },
    { id: 'timeline', titulo: 'Evolução das vendas' },
    { id: 'top_destinos', titulo: 'Top destinos' },
    { id: 'clientes', titulo: 'Clientes que mais gastaram' },
    { id: 'ultimas_compras', titulo: 'Últimas compras' },
    { id: 'followups', titulo: 'Follow-up' },
    { id: 'aniversariantes', titulo: 'Aniversariantes' },
    { id: 'comparativo_vendas', titulo: 'Comparativo de vendas por empresa' },
    { id: 'comparativo_metas', titulo: 'Atingimento de meta por empresa' }
  ];

  const PREFS_KEY = 'gestor_dashboard_widgets';
  const BRL_CURRENCY_FORMATTER = new Intl.NumberFormat('pt-BR', {
    style: 'currency',
    currency: 'BRL'
  });

  function loadWidgetPrefs(): Record<GestorWidgetId, boolean> {
    const defaults = Object.fromEntries(GESTOR_WIDGETS.map((w) => [w.id, true])) as Record<
      GestorWidgetId,
      boolean
    >;
    if (typeof window === 'undefined') return defaults;
    try {
      const raw = window.localStorage.getItem(PREFS_KEY);
      if (!raw) return defaults;
      const parsed = JSON.parse(raw);
      for (const w of GESTOR_WIDGETS) {
        if (typeof parsed[w.id] === 'boolean') defaults[w.id] = parsed[w.id];
      }
    } catch {
      /* ignore */
    }
    return defaults;
  }

  function saveWidgetPrefs(prefs: Record<GestorWidgetId, boolean>) {
    if (typeof window === 'undefined') return;
    window.localStorage.setItem(PREFS_KEY, JSON.stringify(prefs));
  }

  let widgetVisible: Record<GestorWidgetId, boolean> = loadWidgetPrefs();
  let showCustomize = false;

  type Meta = {
    id: string;
    vendedor_id: string;
    periodo: string;
    meta_geral: number;
    meta_diferenciada: number;
    ativo: boolean;
    scope?: string | null;
  };

  type FollowUp = {
    id: string;
    cliente_id?: string | null;
    cliente_nome?: string | null;
    cliente_whatsapp?: string | null;
    cliente_telefone?: string | null;
    destino_nome?: string | null;
    data_inicio?: string | null;
    data_fim?: string | null;
    data_embarque?: string | null;
    data_final?: string | null;
    follow_up_fechado?: boolean | null;
    venda?: {
      data_embarque: string | null;
      clientes?: { nome: string | null; whatsapp?: string | null; telefone?: string | null } | null;
      destino_cidade?: { nome: string | null } | null;
    } | null;
  };

  type SummaryPayload = {
    userCtx?: {
      nome: string | null;
      papel: string;
      vendedorIds: string[];
      vendedorCount?: number;
    } | null;
    vendasAgg?: {
      totalVendas: number;
      totalTaxas: number;
      totalLiquido: number;
      totalSeguro: number;
      qtdVendas: number;
      ticketMedio: number;
      timeline: Array<{ date: string; value: number }>;
      topDestinos: Array<{ name: string; value: number }>;
      porProduto: Array<{ id: string; name: string; value: number }>;
    };
    metas?: Meta[];
  };

  type DashboardCompra = {
    id: string;
    cliente_id: string | null;
    cliente_nome: string;
    cliente_email: string | null;
    cliente_telefone: string | null;
    cliente_whatsapp: string | null;
    cliente_nascimento: string | null;
    vendedor_nome: string;
    data_compra: string | null;
    data_saida: string | null;
    destino: string;
    valor: number;
  };

  type DashboardCompraPayload = {
    topVendedores?: Array<{
      vendedor_id: string;
      vendedor_nome: string;
      valor: number;
      quantidade: number;
    }>;
    topClientes?: Array<{
      cliente_id: string | null;
      cliente_nome: string;
      data_saida: string | null;
      destino: string;
      valor: number;
      quantidade: number;
    }>;
    ultimasCompras?: DashboardCompra[];
  };

  type Aniversariante = {
    id: string;
    nome: string;
    nascimento: string | null;
    telefone?: string | null;
    whatsapp?: string | null;
    aniversario_hoje?: boolean | null;
  };

  type EmpresaComparativoItem = {
    company_id: string;
    nome: string;
    totalVendas: number;
    qtdVendas: number;
    totalMeta: number;
    atingimentoPct: number;
  };

  let loading = true;
  let errorMessage: string | null = null;
  let userCtx: SummaryPayload['userCtx'] = null;

  function getDefaultPeriod() {
    const today = todayISODateLocal();
    return { inicio: `${today.slice(0, 7)}-01`, fim: today };
  }

  const defaultPeriod = getDefaultPeriod();
  const defaultMonth = defaultPeriod.inicio.slice(0, 7);

  let filtroPeriodoModo: 'mes' | 'periodo' = 'mes';
  let mesSelecionado = defaultMonth;
  let periodoInicio = defaultPeriod.inicio;
  let periodoFim = defaultPeriod.fim;
  let empresaSelecionada = '';
  let vendedorSelecionado = '';

  let empresas: { id: string; nome: string }[] = [];
  let vendedoresFiltro: { id: string; nome: string }[] = [];
  let filtrosInicializados = false;
  let lastAppliedFilterKey = '';
  let lastBaseCompanyId = '';
  let applyFiltersTimer: ReturnType<typeof setTimeout> | null = null;
  let baseRequestSeq = 0;
  let baseAbortController: AbortController | null = null;
  let dashboardRequestSeq = 0;
  let dashboardAbortController: AbortController | null = null;
  let auxiliaryRequestSeq = 0;
  let auxiliaryAbortController: AbortController | null = null;

  let vendasAgg: NonNullable<SummaryPayload['vendasAgg']> = {
    totalVendas: 0,
    totalTaxas: 0,
    totalLiquido: 0,
    totalSeguro: 0,
    qtdVendas: 0,
    ticketMedio: 0,
    timeline: [],
    topDestinos: [],
    porProduto: []
  };
  let metas: Meta[] = [];
  let followUps: FollowUp[] = [];
  let assinaturaUsuario = 'André Lima';
  let topVendedores: NonNullable<DashboardCompraPayload['topVendedores']> = [];
  let topClientes: NonNullable<DashboardCompraPayload['topClientes']> = [];
  let ultimasCompras: DashboardCompra[] = [];
  let aniversariantes: Aniversariante[] = [];
  let empresasComparativo: EmpresaComparativoItem[] = [];
  let loadingComparativo = false;

  function formatCurrency(value: number) {
    return BRL_CURRENCY_FORMATTER.format(value || 0);
  }

  function formatDate(value: string | null | undefined) {
    return formatDateValue(value);
  }

  function getInitials(value: string | null | undefined) {
    return (
      String(value || '-')
        .trim()
        .split(/\s+/)
        .filter(Boolean)
        .slice(0, 2)
        .map((part) => part.charAt(0))
        .join('')
        .toUpperCase() || '-'
    );
  }

  function formatBirthdayContext(value: string | null | undefined) {
    const raw = String(value || '').trim();
    const match = raw.match(/^\d{4}-(\d{2})-(\d{2})/);
    if (!match) return '-';
    const today = todayISODateLocal();
    const todayParts = today.match(/^\d{4}-(\d{2})-(\d{2})/);
    const monthDay = `${match[1]}-${match[2]}`;
    if (todayParts && monthDay === `${todayParts[1]}-${todayParts[2]}`) return 'Hoje';
    return `${match[2]}/${match[1]}`;
  }

  function clamp(value: number, min: number, max: number) {
    return Math.min(max, Math.max(min, value));
  }

  function interpolateRgb(from: [number, number, number], to: [number, number, number], t: number) {
    const ratio = clamp(t, 0, 1);
    const r = Math.round(from[0] + (to[0] - from[0]) * ratio);
    const g = Math.round(from[1] + (to[1] - from[1]) * ratio);
    const b = Math.round(from[2] + (to[2] - from[2]) * ratio);
    return `rgb(${r}, ${g}, ${b})`;
  }

  function getAtingimentoColor(percentual: number) {
    const pct = clamp(percentual, 0, 100);
    if (pct < 80) return interpolateRgb([239, 68, 68], [249, 115, 22], pct / 80);
    return interpolateRgb([249, 115, 22], [34, 197, 94], (pct - 80) / 20);
  }

  $: metaTotal = metas.reduce((sum, item) => sum + Number(item.meta_geral || 0), 0);
  $: atingimento = metaTotal > 0 ? (vendasAgg.totalVendas / metaTotal) * 100 : 0;
  $: metaSeguroTotal = metas.reduce((sum, item) => sum + Number(item.meta_diferenciada || 0), 0);
  $: atingimentoSeguro = metaSeguroTotal > 0 ? (vendasAgg.totalSeguro / metaSeguroTotal) * 100 : 0;
  $: atingimentoVendasClamped = clamp(atingimento, 0, 100);
  $: atingimentoSeguroClamped = clamp(atingimentoSeguro, 0, 100);
  $: atingimentoVendasColor = getAtingimentoColor(atingimento);
  $: atingimentoMetaColor = getAtingimentoColor(atingimento);
  $: atingimentoSeguroColor = getAtingimentoColor(atingimentoSeguro);
  $: teamSize = userCtx?.vendedorCount ?? userCtx?.vendedorIds?.length ?? 0;
  $: rolePapel = String(userCtx?.papel || '').toUpperCase();
  $: isMasterDashboard = rolePapel.includes('MASTER');
  $: isMasterPage = title.toLowerCase().includes('master');
  $: canSeeCompanyComparativos = isMasterDashboard || rolePapel.includes('ADMIN');
  $: vendedorSelecionadoNome =
    vendedoresFiltro.find((item) => item.id === vendedorSelecionado)?.nome?.trim() || '';
  $: isFiltroVendedorAtivo = Boolean(vendedorSelecionado && vendedorSelecionadoNome);
  $: salesLabel = isFiltroVendedorAtivo
    ? `Vendas de ${vendedorSelecionadoNome}`
    : isMasterDashboard
      ? 'Vendas das equipes'
      : 'Vendas da equipe';
  $: countLabel = isFiltroVendedorAtivo
    ? `Qtd. vendas de ${vendedorSelecionadoNome}`
    : 'Qtd. vendas';
  $: metaLabel = isFiltroVendedorAtivo ? `Meta de ${vendedorSelecionadoNome}` : 'Meta da equipe';
  $: scopeLabel = isFiltroVendedorAtivo ? 'Vendedor no escopo' : 'Equipe no escopo';
  $: scopeHelperLabel = isFiltroVendedorAtivo
    ? `Filtro: ${vendedorSelecionadoNome}`
    : `Papel: ${userCtx?.papel || '-'}`;
  $: evolucaoHeader = isFiltroVendedorAtivo
    ? `Evolução das vendas de ${vendedorSelecionadoNome}`
    : isMasterDashboard
      ? 'Evolução das vendas das equipes'
      : 'Evolução das vendas';
  $: destinosHeader = isFiltroVendedorAtivo
    ? `Top destinos de ${vendedorSelecionadoNome}`
    : isMasterDashboard
      ? 'Top destinos das equipes'
      : 'Top destinos da equipe';
  $: followUpHeader = isFiltroVendedorAtivo
    ? `Follow-up de ${vendedorSelecionadoNome}`
    : 'Follow-up';
  $: followUpEmptyLabel = isFiltroVendedorAtivo
    ? `Nenhum cliente retornado pendente de follow-up para ${vendedorSelecionadoNome}.`
    : 'Nenhum cliente retornado pendente de follow-up.';
  function getMonthRange(monthValue: string) {
    const raw = String(monthValue || '').trim();
    if (!/^\d{4}-\d{2}$/.test(raw)) return { inicio: defaultPeriod.inicio, fim: defaultPeriod.fim };
    return monthRangeFromKey(raw) || { inicio: defaultPeriod.inicio, fim: defaultPeriod.fim };
  }

  function getFollowUpCliente(item: FollowUp) {
    return item.cliente_nome || item.venda?.clientes?.nome || '-';
  }

  function getFollowUpDestino(item: FollowUp) {
    return item.destino_nome || item.venda?.destino_cidade?.nome || '';
  }

  function getFollowUpRetorno(item: FollowUp) {
    return item.data_fim || item.data_final || item.venda?.data_embarque || null;
  }

  function getFollowUpTelefone(item: FollowUp) {
    return (
      item.cliente_whatsapp ||
      item.cliente_telefone ||
      item.venda?.clientes?.whatsapp ||
      item.venda?.clientes?.telefone ||
      null
    );
  }

  function getFollowUpNotificationRange(inicio: string, fim: string) {
    const ontem = addDaysISODate(todayISODateLocal(), -1);
    const followUpFim = fim && fim < ontem ? fim : ontem;
    if (!followUpFim || followUpFim < inicio) return null;
    return { inicio, fim: followUpFim };
  }

  function getFollowUpWhatsAppLink(item: FollowUp) {
    return construirLinkWhatsAppComTexto(
      getFollowUpTelefone(item),
      montarMensagemFollowUp(getFollowUpCliente(item), assinaturaUsuario),
      '55'
    );
  }

  function goToRanking() {
    const mes = filtroPeriodoModo === 'mes' ? mesSelecionado : periodoInicio.slice(0, 7);
    void goto(`/relatorios/ranking?mes=${mes}`);
  }

  $: if (filtroPeriodoModo === 'mes') {
    const range = getMonthRange(mesSelecionado);
    if (periodoInicio !== range.inicio) periodoInicio = range.inicio;
    if (periodoFim !== range.fim) periodoFim = range.fim;
  }

  $: currentFilterKey = [
    filtroPeriodoModo,
    mesSelecionado,
    periodoInicio,
    periodoFim,
    empresaSelecionada,
    vendedorSelecionado
  ].join('|');

  $: timelineChartData = {
    labels: vendasAgg.timeline.map((item) => formatDate(item.date)),
    datasets: [
      {
        label: salesLabel,
        data: vendasAgg.timeline.map((item) => item.value),
        borderColor: '#0284c7',
        backgroundColor: 'rgba(2,132,199,0.12)',
        fill: true,
        tension: 0.32
      }
    ]
  } satisfies ChartData;

  $: destinosChartData = {
    labels: vendasAgg.topDestinos.map((item) => item.name),
    datasets: [
      {
        label: 'Receita',
        data: vendasAgg.topDestinos.map((item) => item.value),
        backgroundColor: ['#0f766e', '#14b8a6', '#2dd4bf', '#99f6e4', '#ccfbf1']
      }
    ]
  } satisfies ChartData;

  // Paleta de cores distintas por empresa (até 12 empresas)
  const EMPRESA_COLORS = [
    '#3b82f6', // blue-500
    '#f97316', // orange-500
    '#10b981', // emerald-500
    '#a855f7', // purple-500
    '#ef4444', // red-500
    '#06b6d4', // cyan-500
    '#eab308', // yellow-500
    '#ec4899', // pink-500
    '#14b8a6', // teal-500
    '#8b5cf6', // violet-500
    '#f59e0b', // amber-500
    '#6366f1' // indigo-500
  ];

  $: comparativoVendasChartData = {
    labels: empresasComparativo.map((e) => e.nome),
    datasets: [
      {
        label: 'Vendas no período',
        data: empresasComparativo.map((e) => e.totalVendas),
        backgroundColor: empresasComparativo.map(
          (_, i) => EMPRESA_COLORS[i % EMPRESA_COLORS.length]
        ),
        borderRadius: 6,
        borderSkipped: false
      }
    ]
  } satisfies ChartData;

  $: empresasComMeta = empresasComparativo.filter((e) => e.totalMeta > 0);
  $: comparativoMetasChartData = {
    labels: empresasComMeta.map((e) => e.nome),
    datasets: [
      {
        label: 'Meta do período',
        data: empresasComMeta.map((e) => e.totalMeta),
        backgroundColor: empresasComMeta.map((emp) => {
          const index = empresasComparativo.indexOf(emp);
          return EMPRESA_COLORS[index % EMPRESA_COLORS.length] + '40';
        }),
        borderColor: empresasComMeta.map((emp) => {
          const index = empresasComparativo.indexOf(emp);
          return EMPRESA_COLORS[index % EMPRESA_COLORS.length];
        }),
        borderWidth: 2,
        borderRadius: 6,
        borderSkipped: false
      },
      {
        label: 'Vendas realizadas',
        data: empresasComMeta.map((e) => e.totalVendas),
        backgroundColor: empresasComMeta.map((emp) => {
          const index = empresasComparativo.indexOf(emp);
          return EMPRESA_COLORS[index % EMPRESA_COLORS.length];
        }),
        borderRadius: 6,
        borderSkipped: false
      }
    ]
  } satisfies ChartData;

  // Opções para gráfico de barras horizontais
  const horizontalBarOptions = {
    indexAxis: 'y' as const,
    responsive: true,
    maintainAspectRatio: false,
    plugins: {
      legend: { display: false },
      tooltip: {
        callbacks: {
          label: (ctx: TooltipItem<'bar'>) => {
            const parsed = typeof ctx.parsed === 'object' && ctx.parsed ? ctx.parsed : null;
            const value = parsed?.x ?? parsed?.y ?? 0;
            return ' ' + BRL_CURRENCY_FORMATTER.format(value);
          }
        }
      }
    },
    scales: {
      x: {
        grid: { color: 'rgba(148,163,184,0.15)' },
        ticks: {
          color: '#94a3b8',
          font: { size: 11 },
          callback: (value: unknown) => {
            const numericValue = Number(value);
            if (numericValue >= 1_000_000) return `R$ ${(numericValue / 1_000_000).toFixed(1)}M`;
            if (numericValue >= 1_000) return `R$ ${(numericValue / 1_000).toFixed(0)}K`;
            return `R$ ${numericValue}`;
          }
        }
      },
      y: {
        grid: { display: false },
        ticks: { color: '#475569', font: { size: 12 } }
      }
    }
  };

  const metasBarOptions = {
    ...horizontalBarOptions,
    plugins: {
      ...horizontalBarOptions.plugins,
      legend: {
        display: true,
        position: 'bottom' as const,
        labels: { color: '#475569', font: { size: 12 }, boxWidth: 12 }
      }
    }
  };

  async function loadBase() {
    const requestSeq = ++baseRequestSeq;
    baseAbortController?.abort();
    const controller = new AbortController();
    baseAbortController = controller;
    const shouldLoadVendedores =
      !isMasterPage || Boolean(empresaSelecionada || vendedorSelecionado);
    try {
      const data = await apiGet<{
        empresas: { id: string; nome: string }[];
        vendedores: { id: string; nome: string }[];
      }>(
        '/api/v1/dashboard/base',
        {
          empresa_id: empresaSelecionada || undefined,
          include_vendedores: shouldLoadVendedores ? 1 : 0
        },
        controller.signal,
        60_000
      );
      if (requestSeq !== baseRequestSeq) return;
      empresas = data.empresas || [];
      vendedoresFiltro = data.vendedores || [];
      if (
        vendedorSelecionado &&
        !vendedoresFiltro.some((item) => item.id === vendedorSelecionado)
      ) {
        vendedorSelecionado = '';
      }
    } catch (err) {
      if (isCanceledApiError(err)) return;
      if (requestSeq !== baseRequestSeq) return;
      empresas = [];
      vendedoresFiltro = [];
      vendedorSelecionado = '';
    } finally {
      if (requestSeq === baseRequestSeq) {
        lastBaseCompanyId = empresaSelecionada;
        if (baseAbortController === controller) {
          baseAbortController = null;
        }
      }
    }
  }

  async function loadDashboard() {
    const requestSeq = ++dashboardRequestSeq;
    dashboardAbortController?.abort();
    const controller = new AbortController();
    dashboardAbortController = controller;
    loading = true;
    errorMessage = null;

    try {
      const payload = await apiFetch<SummaryPayload>('/api/v1/dashboard/summary', {
        method: 'GET',
        signal: controller.signal,
        timeoutMs: 60_000,
        noCache: true,
        query: {
          inicio: periodoInicio,
          fim: periodoFim,
          include_orcamentos: 0,
          company_id: empresaSelecionada || undefined,
          vendedor_ids: vendedorSelecionado || undefined
        }
      });
      if (requestSeq !== dashboardRequestSeq) return;

      userCtx = payload.userCtx || null;
      vendasAgg = payload.vendasAgg || vendasAgg;
      metas = payload.metas || [];
    } catch (err: unknown) {
      if (isCanceledApiError(err)) return;
      if (requestSeq !== dashboardRequestSeq) return;
      errorMessage = toUserMessage(err, 'Erro ao carregar dashboard do gestor.');
      toast.error('Erro ao carregar dashboard do gestor.');
    } finally {
      if (requestSeq === dashboardRequestSeq) {
        loading = false;
        if (dashboardAbortController === controller) {
          dashboardAbortController = null;
        }
      }
    }
  }

  async function loadAssinaturaUsuario(signal?: AbortSignal) {
    try {
      const payload = await apiGet<{
        signature?: string | null;
        fallbackName?: string | null;
        nome_completo?: string | null;
      }>('/api/v1/profile/signature', undefined, signal, 30_000);
      const nome = String(
        payload?.signature || payload?.fallbackName || payload?.nome_completo || ''
      ).trim();
      if (nome) assinaturaUsuario = nome;
    } catch {
      const fallback = String(userCtx?.nome || '').trim();
      if (fallback) assinaturaUsuario = fallback;
    }
  }

  function isCurrentAuxiliaryRequest(requestSeq: number) {
    return requestSeq === auxiliaryRequestSeq;
  }

  async function loadOperational(signal?: AbortSignal, requestSeq = auxiliaryRequestSeq) {
    if (widgetVisible.followups === false) {
      followUps = [];
      return;
    }

    const params: Record<string, string> = {};
    if (!isMasterDashboard) {
      if (empresaSelecionada) params.company_id = empresaSelecionada;
      if (vendedorSelecionado) params.vendedor_ids = vendedorSelecionado;
    }

    try {
      const followUpRange = getFollowUpNotificationRange('1900-01-01', todayISODateLocal());
      if (!followUpRange) {
        followUps = [];
        return;
      }
      const data = await apiGet<{ items: FollowUp[] }>(
        '/api/v1/dashboard/follow-ups',
        {
          ...params,
          ...followUpRange,
          status: 'abertos',
          limit: 8
        },
        signal,
        60_000
      );
      if (!isCurrentAuxiliaryRequest(requestSeq)) return;
      followUps = data.items || [];
    } catch (err) {
      if (isCanceledApiError(err) || !isCurrentAuxiliaryRequest(requestSeq)) return;
      followUps = [];
    }
  }

  async function loadComprasResumo(signal?: AbortSignal, requestSeq = auxiliaryRequestSeq) {
    const needsCompras =
      widgetVisible.top_vendedores !== false ||
      widgetVisible.clientes !== false ||
      widgetVisible.ultimas_compras !== false;
    if (!needsCompras) {
      topVendedores = [];
      topClientes = [];
      ultimasCompras = [];
      return;
    }

    try {
      const payload = await apiGet<DashboardCompraPayload>(
        '/api/v1/dashboard/ultimas-compras',
        {
          inicio: periodoInicio,
          fim: periodoFim,
          company_id: empresaSelecionada || undefined,
          vendedor_ids: vendedorSelecionado || undefined,
          limit: 5
        },
        signal,
        60_000
      );
      if (!isCurrentAuxiliaryRequest(requestSeq)) return;
      topVendedores = payload.topVendedores || [];
      topClientes = payload.topClientes || [];
      ultimasCompras = payload.ultimasCompras || [];
    } catch (err) {
      if (isCanceledApiError(err) || !isCurrentAuxiliaryRequest(requestSeq)) return;
      topVendedores = [];
      topClientes = [];
      ultimasCompras = [];
    }
  }

  async function loadAniversariantes(signal?: AbortSignal, requestSeq = auxiliaryRequestSeq) {
    if (widgetVisible.aniversariantes === false) {
      aniversariantes = [];
      return;
    }

    try {
      const data = await apiGet<{ items?: Aniversariante[] }>(
        '/api/v1/dashboard/aniversariantes',
        {
          dias: 30,
          company_id: isMasterDashboard ? undefined : empresaSelecionada || undefined,
          limit: 5
        },
        signal,
        60_000
      );
      if (!isCurrentAuxiliaryRequest(requestSeq)) return;
      aniversariantes = data.items || [];
    } catch (err) {
      if (isCanceledApiError(err) || !isCurrentAuxiliaryRequest(requestSeq)) return;
      aniversariantes = [];
    }
  }

  async function loadComparativo(signal?: AbortSignal, requestSeq = auxiliaryRequestSeq) {
    // Só carrega se MASTER (ou ADMIN) e pelo menos um widget de comparativo visível
    if (!canSeeCompanyComparativos) {
      empresasComparativo = [];
      return;
    }
    if (widgetVisible.comparativo_vendas === false && widgetVisible.comparativo_metas === false)
      return;
    loadingComparativo = true;
    try {
      const data = await apiGet<{ empresas: EmpresaComparativoItem[] }>(
        '/api/v1/dashboard/comparativo-empresas',
        { inicio: periodoInicio, fim: periodoFim, company_id: empresaSelecionada || undefined },
        signal,
        90_000
      );
      if (!isCurrentAuxiliaryRequest(requestSeq)) return;
      empresasComparativo = data.empresas || [];
    } catch (err) {
      if (isCanceledApiError(err) || !isCurrentAuxiliaryRequest(requestSeq)) return;
      if (dev) console.error('[comparativo] erro ao carregar:', err);
      empresasComparativo = [];
    } finally {
      if (isCurrentAuxiliaryRequest(requestSeq)) {
        loadingComparativo = false;
      }
    }
  }

  async function loadAuxiliaryData() {
    const requestSeq = ++auxiliaryRequestSeq;
    auxiliaryAbortController?.abort();
    const controller = new AbortController();
    auxiliaryAbortController = controller;

    await Promise.all([
      loadAssinaturaUsuario(controller.signal),
      loadOperational(controller.signal, requestSeq),
      loadComprasResumo(controller.signal, requestSeq),
      loadAniversariantes(controller.signal, requestSeq),
      loadComparativo(controller.signal, requestSeq)
    ]);

    if (isCurrentAuxiliaryRequest(requestSeq) && auxiliaryAbortController === controller) {
      auxiliaryAbortController = null;
    }
  }

  async function atualizar() {
    if (empresaSelecionada !== lastBaseCompanyId) {
      await loadBase();
    }
    await loadDashboard();
    await loadAuxiliaryData();
  }

  $: if (filtrosInicializados && currentFilterKey !== lastAppliedFilterKey) {
    if (applyFiltersTimer) clearTimeout(applyFiltersTimer);
    applyFiltersTimer = setTimeout(() => {
      lastAppliedFilterKey = currentFilterKey;
      void atualizar();
      applyFiltersTimer = null;
    }, 250);
  }

  onMount(async () => {
    const params = new URLSearchParams(window.location.search);
    const modoParam = String(params.get('modo') || '')
      .trim()
      .toLowerCase();
    filtroPeriodoModo = modoParam === 'periodo' ? 'periodo' : 'mes';

    const inicioParam = params.get('inicio') || defaultPeriod.inicio;
    const fimParam = params.get('fim') || defaultPeriod.fim;
    periodoInicio = inicioParam;
    periodoFim = fimParam;

    const mesParam = params.get('mes') || inicioParam.slice(0, 7) || defaultMonth;
    mesSelecionado = mesParam;

    if (filtroPeriodoModo === 'mes') {
      const range = getMonthRange(mesSelecionado);
      periodoInicio = range.inicio;
      periodoFim = range.fim;
    }

    empresaSelecionada = params.get('empresa_id') || '';
    vendedorSelecionado = params.get('vendedor_id') || '';

    await Promise.all([loadBase(), loadDashboard()]);
    await loadAuxiliaryData();
    lastAppliedFilterKey = currentFilterKey;
    filtrosInicializados = true;
  });

  onDestroy(() => {
    baseAbortController?.abort();
    dashboardAbortController?.abort();
    auxiliaryAbortController?.abort();
    if (applyFiltersTimer) clearTimeout(applyFiltersTimer);
  });
</script>

<svelte:head>
  <title>{title} | VTUR</title>
</svelte:head>

<PageHeader
  {title}
  {subtitle}
  color="financeiro"
  breadcrumbs={[{ label: 'Dashboard' }]}
  actions={[
    {
      label: 'Personalizar',
      onClick: () => (showCustomize = true),
      variant: 'secondary',
      icon: SlidersHorizontal
    },
    { label: 'Ranking', onClick: goToRanking, variant: 'secondary', icon: BarChart2 },
    { label: 'Atualizar', onClick: atualizar, variant: 'secondary', icon: RefreshCw }
  ]}
/>

<!-- Painel de personalização ─────────────────────────────────────────────── -->
{#if showCustomize}
  <div class="fixed inset-0 z-50 flex items-start justify-end" role="dialog" aria-modal="true">
    <!-- Overlay -->
    <button
      type="button"
      class="absolute inset-0 bg-slate-900/40 backdrop-blur-xs"
      on:click={() => (showCustomize = false)}
      aria-label="Fechar personalização"
    ></button>
    <!-- Painel lateral -->
    <div class="relative z-10 flex h-full w-full max-w-sm flex-col bg-white shadow-2xl">
      <div class="flex items-center justify-between border-b border-slate-100 px-5 py-4">
        <div class="flex items-center gap-2">
          <SlidersHorizontal size={18} class="text-slate-500" />
          <h2 class="text-base font-bold text-slate-900">Personalizar dashboard</h2>
        </div>
        <button
          type="button"
          on:click={() => (showCustomize = false)}
          class="flex h-8 w-8 items-center justify-center rounded-lg text-slate-400 transition-colors hover:bg-slate-100 hover:text-slate-700"
          aria-label="Fechar">✕</button
        >
      </div>
      <div class="flex-1 space-y-2 overflow-y-auto p-5">
        <p class="mb-3 text-xs text-slate-500">
          Ative ou desative os widgets exibidos neste dashboard.
        </p>
        {#each GESTOR_WIDGETS as widget}
          <label
            class="flex cursor-pointer items-center justify-between gap-3 rounded-xl border border-slate-100 px-4 py-3 transition-colors hover:bg-slate-50"
          >
            <span class="text-sm font-medium text-slate-700">{widget.titulo}</span>
            <input
              type="checkbox"
              class="h-4 w-4 rounded-sm accent-orange-500"
              checked={widgetVisible[widget.id] !== false}
              on:change={(e) => {
                widgetVisible = {
                  ...widgetVisible,
                  [widget.id]: (e.target as HTMLInputElement).checked
                };
                saveWidgetPrefs(widgetVisible);
                if (
                  (widget.id === 'comparativo_vendas' || widget.id === 'comparativo_metas') &&
                  (e.target as HTMLInputElement).checked &&
                  empresasComparativo.length === 0
                ) {
                  void loadComparativo();
                }
              }}
            />
          </label>
        {/each}
      </div>
    </div>
  </div>
{/if}

<Card color="financeiro" class="mb-6">
  <div class="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4 xl:grid-cols-6">
    <FieldSelect
      id="gestor-periodo-modo"
      label="Período"
      bind:value={filtroPeriodoModo}
      options={[
        { value: 'mes', label: 'Mês completo' },
        { value: 'periodo', label: 'Data específica' }
      ]}
      class_name="w-full"
    />

    {#if filtroPeriodoModo === 'mes'}
      <FieldInput
        id="gestor-mes"
        label="Mês"
        type="month"
        bind:value={mesSelecionado}
        class_name="w-full"
      />
    {:else}
      <FieldInput
        id="gestor-inicio"
        label="Data início"
        type="date"
        bind:value={periodoInicio}
        class_name="w-full"
      />
      <FieldInput
        id="gestor-fim"
        label="Data fim"
        type="date"
        bind:value={periodoFim}
        class_name="w-full"
      />
    {/if}

    {#if isMasterDashboard && empresas.length > 0}
      <FieldSelect
        id="gestor-empresa"
        label="Empresa"
        bind:value={empresaSelecionada}
        placeholder={null}
        options={[
          { value: '', label: 'Todas' },
          ...empresas.map((item) => ({ value: item.id, label: item.nome }))
        ]}
        class_name="w-full"
      />
    {/if}
    {#if vendedoresFiltro.length > 0}
      <FieldSelect
        id="gestor-vendedor"
        label="Vendedor"
        bind:value={vendedorSelecionado}
        placeholder={null}
        options={[
          { value: '', label: 'Todos' },
          ...vendedoresFiltro.map((item) => ({ value: item.id, label: item.nome }))
        ]}
        class_name="w-full"
      />
    {/if}
  </div>
</Card>

{#if errorMessage}
  <div
    role="alert"
    class="mb-6 rounded-xl border border-red-200 bg-red-50 p-4 text-sm text-red-700"
  >
    {errorMessage}
  </div>
{/if}

<KPIGrid className="mb-6" columns={5} {loading}>
  <div class="vtur-kpi-card">
    <div
      class="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-cyan-50 text-cyan-600"
    >
      <TrendingUp size={18} />
    </div>
    <div class="w-full min-w-0 flex-1">
      <p class="text-xs font-medium text-slate-500 sm:text-sm">{salesLabel}</p>
      {#if loading}
        <div class="mt-1 h-7 w-28 animate-pulse rounded-sm bg-slate-200"></div>
        <div class="mt-1.5 h-3 w-20 animate-pulse rounded-sm bg-slate-100"></div>
      {:else}
        <p class="truncate text-lg font-bold text-slate-900 sm:text-2xl">
          {formatCurrency(vendasAgg.totalVendas)}
        </p>
        <p class="mt-0.5 truncate text-xs text-slate-400">
          Líquido: {formatCurrency(vendasAgg.totalLiquido)}
        </p>
        {#if metaTotal > 0}
          <div class="mt-1.5 w-full">
            <div class="h-1.5 w-full rounded-full bg-slate-200">
              <div
                class="h-1.5 rounded-full transition-all"
                style={`width:${atingimentoVendasClamped.toFixed(1)}%;background:${atingimentoVendasColor};`}
              ></div>
            </div>
            <p class="mt-0.5 text-xs text-slate-400">{atingimento.toFixed(1)}% da meta</p>
          </div>
        {:else}
          <p class="mt-0.5 text-xs text-slate-400">Sem meta</p>
        {/if}
      {/if}
    </div>
  </div>

  <div class="vtur-kpi-card">
    <div
      class="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-emerald-50 text-emerald-600"
    >
      <Wallet size={18} />
    </div>
    <div class="min-w-0 flex-1">
      <p class="text-xs font-medium text-slate-500 sm:text-sm">{countLabel}</p>
      {#if loading}
        <div class="mt-1 h-7 w-16 animate-pulse rounded-sm bg-slate-200"></div>
        <div class="mt-1.5 h-3 w-24 animate-pulse rounded-sm bg-slate-100"></div>
      {:else}
        <p class="text-lg font-bold text-slate-900 sm:text-2xl">{vendasAgg.qtdVendas}</p>
        <p class="mt-0.5 truncate text-xs text-slate-400">
          Ticket: {formatCurrency(vendasAgg.ticketMedio)}
        </p>
      {/if}
    </div>
  </div>

  <div class="vtur-kpi-card">
    <div
      class="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-violet-50 text-violet-600"
    >
      <Target size={18} />
    </div>
    <div class="w-full min-w-0 flex-1">
      <p class="text-xs font-medium text-slate-500 sm:text-sm">{metaLabel}</p>
      {#if loading}
        <div class="mt-1 h-7 w-28 animate-pulse rounded-sm bg-slate-200"></div>
        <div class="mt-1.5 h-3 w-16 animate-pulse rounded-sm bg-slate-100"></div>
      {:else}
        <p class="truncate text-lg font-bold text-slate-900 sm:text-2xl">
          {formatCurrency(metaTotal)}
        </p>
        {#if metaTotal > 0}
          <div class="mt-1.5 w-full">
            <div class="h-1.5 w-full rounded-full bg-slate-200">
              <div
                class="h-1.5 rounded-full transition-all"
                style={`width:${atingimentoVendasClamped.toFixed(1)}%;background:${atingimentoMetaColor};`}
              ></div>
            </div>
            <p class="mt-0.5 text-xs text-slate-400">{atingimento.toFixed(1)}%</p>
          </div>
        {:else}
          <p class="mt-0.5 text-xs text-slate-400">Sem meta</p>
        {/if}
      {/if}
    </div>
  </div>

  <div class="vtur-kpi-card">
    <div
      class="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-amber-50 text-amber-600"
    >
      <Users size={18} />
    </div>
    <div class="min-w-0 flex-1">
      <p class="text-xs font-medium text-slate-500 sm:text-sm">{scopeLabel}</p>
      {#if loading}
        <div class="mt-1 h-7 w-12 animate-pulse rounded-sm bg-slate-200"></div>
        <div class="mt-1.5 h-3 w-20 animate-pulse rounded-sm bg-slate-100"></div>
      {:else}
        <p class="text-lg font-bold text-slate-900 sm:text-2xl">
          {isFiltroVendedorAtivo ? 1 : teamSize}
        </p>
        <p class="mt-0.5 truncate text-xs text-slate-400">{scopeHelperLabel}</p>
      {/if}
    </div>
  </div>

  <div class="vtur-kpi-card">
    <div
      class="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-slate-100 text-slate-600"
    >
      <Wallet size={18} />
    </div>
    <div class="w-full min-w-0 flex-1">
      <p class="text-xs font-medium text-slate-500 sm:text-sm">Seguro viagem</p>
      {#if loading}
        <div class="mt-1 h-7 w-28 animate-pulse rounded-sm bg-slate-200"></div>
        <div class="mt-1.5 h-3 w-16 animate-pulse rounded-sm bg-slate-100"></div>
      {:else}
        <p class="truncate text-lg font-bold text-slate-900 sm:text-2xl">
          {formatCurrency(vendasAgg.totalSeguro)}
        </p>
        {#if metaSeguroTotal > 0}
          <div class="mt-1.5 w-full">
            <div class="h-1.5 w-full rounded-full bg-slate-200">
              <div
                class="h-1.5 rounded-full transition-all"
                style={`width:${atingimentoSeguroClamped.toFixed(1)}%;background:${atingimentoSeguroColor};`}
              ></div>
            </div>
            <p class="mt-0.5 text-xs text-slate-400">{atingimentoSeguro.toFixed(1)}% meta</p>
          </div>
        {:else}
          <p class="mt-0.5 text-xs text-slate-400">Sem meta de seguro</p>
        {/if}
      {/if}
    </div>
  </div>
</KPIGrid>

{#if widgetVisible.top_vendedores !== false}
  <div class="vtur-card mb-6 p-6">
    <div class="mb-4 flex items-center gap-3">
      <div class="flex h-9 w-9 items-center justify-center rounded-xl bg-orange-50 text-orange-600">
        <Award size={18} />
      </div>
      <div>
        <h3 class="text-base font-bold text-slate-900">Top 3 vendedores</h3>
        <p class="text-xs text-slate-500">
          {isMasterDashboard
            ? 'Ranking de todas as lojas do master por receita'
            : 'Ranking da equipe por receita'}
        </p>
      </div>
    </div>
    <div class="border-t border-slate-100 pt-4">
      {#if loading}
        <LoadingState compact={true} />
      {:else if topVendedores.length === 0}
        <p class="py-6 text-center text-sm text-slate-400">
          Sem vendedores com compras no período.
        </p>
      {:else}
        <div class="grid gap-3 md:grid-cols-3">
          {#each topVendedores as item, index}
            <div
              class="flex items-center justify-between gap-3 rounded-xl border border-slate-100 p-3 transition-colors hover:border-orange-200 hover:bg-orange-50"
            >
              <div class="flex min-w-0 items-center gap-3">
                <span
                  class="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-orange-100 text-sm font-bold text-orange-700"
                  >{index + 1}</span
                >
                <div class="min-w-0">
                  <p class="truncate text-sm font-semibold text-slate-900">{item.vendedor_nome}</p>
                  <p class="text-xs text-slate-500">{item.quantidade} compra(s)</p>
                </div>
              </div>
              <p class="shrink-0 text-sm font-semibold text-slate-900">
                {formatCurrency(item.valor)}
              </p>
            </div>
          {/each}
        </div>
      {/if}
    </div>
  </div>

  <!-- Linha principal de gráficos: evolução + destinos -->
  {#if widgetVisible.timeline !== false || widgetVisible.top_destinos !== false}
    <div class="mb-6 grid grid-cols-1 gap-4 sm:gap-6 lg:grid-cols-2">
      <!-- Evolução das vendas -->
      {#if widgetVisible.timeline !== false}
        <div class="vtur-card p-6">
          <div class="mb-4 flex items-center gap-3">
            <div
              class="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-cyan-50 text-cyan-600"
            >
              <TrendingUp size={18} />
            </div>
            <div>
              <h3 class="text-base font-bold text-slate-900">{evolucaoHeader}</h3>
              <p class="text-xs text-slate-500">Receita por data no período selecionado</p>
            </div>
          </div>
          <div class="border-t border-slate-100 pt-4">
            {#if loading}
              <LoadingState compact={true} />
            {:else if vendasAgg.timeline.length === 0}
              <p class="py-8 text-center text-sm text-slate-400">Sem vendas no período.</p>
            {:else}
              <ChartJS type="line" data={timelineChartData} height={220} />
            {/if}
          </div>
        </div>
      {/if}

      <!-- Top destinos -->
      {#if widgetVisible.top_destinos !== false}
        <div class="vtur-card p-6">
          <div class="mb-4 flex items-center gap-3">
            <div
              class="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-teal-50 text-teal-600"
            >
              <MapPin size={18} />
            </div>
            <div>
              <h3 class="text-base font-bold text-slate-900">{destinosHeader}</h3>
              <p class="text-xs text-slate-500">Destinos com maior receita</p>
            </div>
          </div>
          <div class="border-t border-slate-100 pt-4">
            {#if loading}
              <LoadingState compact={true} />
            {:else if vendasAgg.topDestinos.length === 0}
              <p class="py-8 text-center text-sm text-slate-400">Sem destinos no período.</p>
            {:else}
              <ChartJS type="doughnut" data={destinosChartData} height={220} />
            {/if}
          </div>
        </div>
      {/if}
    </div>
  {/if}

  {#if widgetVisible.followups !== false}
    <div class="vtur-card mb-6 p-6">
      <div class="mb-4 flex items-center justify-between gap-3">
        <div class="flex items-center gap-3">
          <div
            class="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-amber-50 text-amber-600"
          >
            <Clock size={18} />
          </div>
          <div>
            <h3 class="text-base font-bold text-slate-900">
              {followUpHeader} ({followUps.length})
            </h3>
            <p class="text-xs text-slate-500">Clientes que já retornaram e precisam de contato</p>
          </div>
        </div>
        <a
          href="/operacao/acompanhamento"
          class="shrink-0 text-sm font-medium text-orange-700 transition-colors hover:text-orange-800"
        >
          Ver todos →
        </a>
      </div>
      <div class="border-t border-slate-100 pt-4">
        {#if loading}
          <LoadingState compact={true} />
        {:else if followUps.length === 0}
          <p class="py-8 text-center text-sm text-slate-400">{followUpEmptyLabel}</p>
        {:else}
          <div class="overflow-x-auto">
            <table class="min-w-full text-left text-sm">
              <thead class="bg-slate-50 text-xs tracking-wide text-slate-500 uppercase">
                <tr>
                  <th class="px-3 py-2 font-semibold">Cliente</th>
                  <th class="px-3 py-2 font-semibold">Destino</th>
                  <th class="px-3 py-2 font-semibold">Embarque</th>
                  <th class="px-3 py-2 font-semibold">Retorno</th>
                  <th class="px-3 py-2 text-right font-semibold">Ações</th>
                </tr>
              </thead>
              <tbody class="divide-y divide-slate-100">
                {#each followUps as item}
                  {@const whatsappLink = getFollowUpWhatsAppLink(item)}
                  <tr class="transition-colors hover:bg-slate-50">
                    <td class="px-3 py-3 font-medium text-slate-900">{getFollowUpCliente(item)}</td>
                    <td class="px-3 py-3 text-slate-600">{getFollowUpDestino(item) || '-'}</td>
                    <td class="px-3 py-3 text-slate-600"
                      >{formatDate(
                        item.data_inicio || item.data_embarque || item.venda?.data_embarque
                      )}</td
                    >
                    <td class="px-3 py-3 text-slate-600">{formatDate(getFollowUpRetorno(item))}</td>
                    <td class="px-3 py-3">
                      <div class="flex justify-end gap-1">
                        {#if whatsappLink}
                          <Button
                            href={whatsappLink}
                            target="_blank"
                            rel="noopener noreferrer"
                            variant="ghost"
                            size="xs"
                            ariaLabel="Enviar follow-up no WhatsApp"
                            title="Enviar follow-up no WhatsApp"
                            class_name="h-8! w-8! rounded-lg! p-0! text-green-600 hover:bg-green-50"
                          >
                            <MessageCircle size={15} />
                          </Button>
                        {/if}
                        {#if item.cliente_id}
                          <Button
                            href={`/clientes/${item.cliente_id}`}
                            variant="ghost"
                            size="xs"
                            ariaLabel="Ver cliente"
                            title="Ver cliente"
                            class_name="h-8! w-8! rounded-lg! p-0! text-slate-600"
                          >
                            <UserPlus size={15} />
                          </Button>
                        {/if}
                        <Button
                          href={`/operacao/viagens/${item.id}`}
                          variant="ghost"
                          size="xs"
                          ariaLabel="Ver viagem"
                          title="Ver viagem"
                          class_name="h-8! w-8! rounded-lg! p-0! text-slate-600"
                        >
                          <Eye size={15} />
                        </Button>
                      </div>
                    </td>
                  </tr>
                {/each}
              </tbody>
            </table>
          </div>
        {/if}
      </div>
    </div>
  {/if}

  <!-- Linha de comparativos por empresa (Master/Admin) -->
  {#if canSeeCompanyComparativos && (widgetVisible.comparativo_vendas !== false || widgetVisible.comparativo_metas !== false)}
    <div class="mb-6 grid grid-cols-1 gap-4 sm:gap-6 lg:grid-cols-2">
      <!-- Comparativo de vendas por empresa -->
      {#if widgetVisible.comparativo_vendas !== false}
        <div class="vtur-card p-6">
          <div class="mb-4 flex items-center justify-between gap-3">
            <div class="flex items-center gap-3">
              <div
                class="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-blue-50 text-blue-600"
              >
                <Building2 size={18} />
              </div>
              <div>
                <h3 class="text-base font-bold text-slate-900">Vendas por empresa</h3>
                <p class="text-xs text-slate-500">Receita total por empresa no período</p>
              </div>
            </div>
            {#if !loadingComparativo && empresasComparativo.length > 0}
              <span
                class="shrink-0 rounded-full bg-blue-50 px-2.5 py-0.5 text-xs font-semibold text-blue-600"
              >
                {empresasComparativo.length} empresa{empresasComparativo.length !== 1 ? 's' : ''}
              </span>
            {/if}
          </div>
          <div class="border-t border-slate-100 pt-4">
            {#if loadingComparativo}
              <LoadingState compact={true} />
            {:else if empresasComparativo.length === 0}
              <p class="py-8 text-center text-sm text-slate-400">
                Sem dados de vendas por empresa no período.
              </p>
            {:else}
              {@const chartH = Math.max(180, empresasComparativo.length * 44)}
              <div style="height:{chartH}px">
                <ChartJS
                  type="bar"
                  data={comparativoVendasChartData}
                  options={horizontalBarOptions}
                  height={chartH}
                />
              </div>
            {/if}
          </div>
        </div>
      {/if}

      <!-- Atingimento de meta por empresa -->
      {#if widgetVisible.comparativo_metas !== false}
        <div class="vtur-card p-6">
          <div class="mb-4 flex items-center gap-3">
            <div
              class="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-violet-50 text-violet-600"
            >
              <Target size={18} />
            </div>
            <div>
              <h3 class="text-base font-bold text-slate-900">Meta por empresa</h3>
              <p class="text-xs text-slate-500">Meta vs. realizado por empresa</p>
            </div>
          </div>
          <div class="border-t border-slate-100 pt-4">
            {#if loadingComparativo}
              <LoadingState compact={true} />
            {:else if empresasComparativo.length === 0}
              <p class="py-8 text-center text-sm text-slate-400">
                Sem dados por empresa no período.
              </p>
            {:else if empresasComparativo.every((e) => e.totalMeta === 0)}
              <p class="py-8 text-center text-sm text-slate-400">
                Nenhuma empresa com meta cadastrada.
              </p>
            {:else}
              <!-- Mini badges de atingimento -->
              <div class="mb-3 flex flex-wrap gap-2">
                {#each empresasComMeta as emp}
                  {@const color =
                    EMPRESA_COLORS[empresasComparativo.indexOf(emp) % EMPRESA_COLORS.length]}
                  <span
                    class="rounded-full px-2.5 py-0.5 text-xs font-semibold text-white"
                    style="background-color:{color}"
                    title="{emp.nome}: {emp.atingimentoPct.toFixed(1)}% da meta"
                  >
                    {emp.nome.length > 12 ? emp.nome.slice(0, 11) + '…' : emp.nome} · {emp.atingimentoPct.toFixed(
                      0
                    )}%
                  </span>
                {/each}
              </div>
              {@const chartH = Math.max(180, empresasComMeta.length * 56)}
              <div style="height:{chartH}px">
                <ChartJS
                  type="bar"
                  data={comparativoMetasChartData}
                  options={metasBarOptions}
                  height={chartH}
                />
              </div>
            {/if}
          </div>
        </div>
      {/if}
    </div>
  {/if}
{/if}
