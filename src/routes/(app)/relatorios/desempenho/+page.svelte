<script lang="ts">
  import { onDestroy, onMount } from 'svelte';
  import PageHeader from '$lib/components/ui/PageHeader.svelte';
  import Card from '$lib/components/ui/Card.svelte';
  import Button from '$lib/components/ui/Button.svelte';
  import { FieldSelect } from '$lib/components/ui';
  import ChartJS from '$lib/components/charts/ChartJS.svelte';
  import { TrendingUp, TrendingDown, Minus, BarChart3, RefreshCw } from '$lib/icons';
  import type { ChartData, ChartOptions } from 'chart.js';
  import { toast } from '$lib/stores/ui';
  import { permissoes } from '$lib/stores/permissoes';
  import { toUserMessage } from '$lib/utils/errors';
  import { apiFetch, apiGet, isCanceledApiError } from '$lib/services/api';

  // ---------------------------------------------------------------------------
  // Types
  // ---------------------------------------------------------------------------
  interface MesBucket {
    mes: number;
    totalVendas: number;
    qtdVendas: number;
  }
  interface AnoEvolucao {
    ano: number;
    meses: MesBucket[];
    totalAno: number;
    qtdAno: number;
  }
  interface EvolucaoAnualResult {
    anos: AnoEvolucao[];
    crescimentoYoY: Record<string, number | null>;
  }
  interface EmpresaFiltro {
    id: string;
    nome: string;
  }
  interface VendedorFiltro {
    id: string;
    nome: string;
    company_id: string;
  }
  interface EmpresaBaseRow extends Partial<EmpresaFiltro> {
    nome_fantasia?: string | null;
    nome_empresa?: string | null;
  }
  interface VendedorBaseRow extends Partial<VendedorFiltro> {
    nome_completo?: string | null;
  }
  interface RelatoriosBaseResponse {
    empresas?: EmpresaBaseRow[];
    vendedores?: VendedorBaseRow[];
  }

  // ---------------------------------------------------------------------------
  // Paleta — uma cor por ano (até 5)
  // ---------------------------------------------------------------------------
  const ANO_COLORS = [
    { border: '#2457a6', bg: 'rgba(36,87,166,0.15)', solid: 'rgba(36,87,166,0.7)' },
    { border: '#0f766e', bg: 'rgba(15,118,110,0.15)', solid: 'rgba(15,118,110,0.7)' },
    { border: '#b45309', bg: 'rgba(180,83,9,0.15)', solid: 'rgba(180,83,9,0.7)' },
    { border: '#7c3aed', bg: 'rgba(124,58,237,0.15)', solid: 'rgba(124,58,237,0.7)' },
    { border: '#dc2626', bg: 'rgba(220,38,38,0.15)', solid: 'rgba(220,38,38,0.7)' }
  ];

  const MESES = [
    'Jan',
    'Fev',
    'Mar',
    'Abr',
    'Mai',
    'Jun',
    'Jul',
    'Ago',
    'Set',
    'Out',
    'Nov',
    'Dez'
  ];
  const BRL_INTEGER_CURRENCY_FORMATTER = new Intl.NumberFormat('pt-BR', {
    style: 'currency',
    currency: 'BRL',
    minimumFractionDigits: 0,
    maximumFractionDigits: 0
  });

  // ---------------------------------------------------------------------------
  // Estado
  // ---------------------------------------------------------------------------
  const currentYear = new Date().getFullYear();

  const anosDisponiveis: number[] = [];
  for (let y = currentYear; y >= 2020; y--) anosDisponiveis.push(y);

  let anosSelecionados: number[] = [currentYear - 1, currentYear];
  let empresaSelecionada = '';
  let vendedorSelecionado = '';
  let empresas: EmpresaFiltro[] = [];
  let vendedores: VendedorFiltro[] = [];
  let loading = false;
  let data: EvolucaoAnualResult | null = null;
  let baseRequestSeq = 0;
  let baseAbortController: AbortController | null = null;
  let desempenhoRequestSeq = 0;
  let desempenhoAbortController: AbortController | null = null;

  // ---------------------------------------------------------------------------
  // Helpers
  // ---------------------------------------------------------------------------
  function toggleAno(ano: number) {
    if (anosSelecionados.includes(ano)) {
      if (anosSelecionados.length > 1) anosSelecionados = anosSelecionados.filter((a) => a !== ano);
    } else {
      if (anosSelecionados.length < 4) {
        anosSelecionados = [...anosSelecionados, ano].sort((a, b) => a - b);
      } else {
        toast.warning('Selecione no máximo 4 anos para comparar.');
      }
    }
  }

  function fmt(v: number) {
    return BRL_INTEGER_CURRENCY_FORMATTER.format(v);
  }

  function fmtShort(v: number) {
    if (v >= 1_000_000) return `R$ ${(v / 1_000_000).toFixed(1).replace('.', ',')}M`;
    if (v >= 1_000) return `R$ ${(v / 1_000).toFixed(0)}K`;
    return fmt(v);
  }

  function fmtPct(v: number | null) {
    if (v === null) return '–';
    return `${v > 0 ? '+' : ''}${v.toFixed(1)}%`;
  }

  // ---------------------------------------------------------------------------
  // Carregamento de dados base
  // ---------------------------------------------------------------------------
  async function loadBase() {
    const requestSeq = ++baseRequestSeq;
    baseAbortController?.abort();
    const controller = new AbortController();
    baseAbortController = controller;
    try {
      const res = await apiGet<RelatoriosBaseResponse>(
        '/api/v1/relatorios/base',
        undefined,
        controller.signal,
        60_000
      );
      if (requestSeq !== baseRequestSeq) return;
      empresas = (res.empresas || []).map((e) => ({
        id: String(e.id || ''),
        nome: String(e.nome || e.nome_fantasia || e.nome_empresa || 'Empresa')
      }));
      vendedores = (res.vendedores || []).map((v) => ({
        id: String(v.id || ''),
        nome: String(v.nome || v.nome_completo || 'Usuário'),
        company_id: String(v.company_id || '')
      }));
    } catch (err) {
      if (isCanceledApiError(err)) return;
      if (requestSeq !== baseRequestSeq) return;
      empresas = [];
      vendedores = [];
    } finally {
      if (requestSeq === baseRequestSeq && baseAbortController === controller) {
        baseAbortController = null;
      }
    }
  }

  // ---------------------------------------------------------------------------
  // Carregamento principal
  // ---------------------------------------------------------------------------
  async function loadDesempenho() {
    if (anosSelecionados.length === 0) return;
    const requestSeq = ++desempenhoRequestSeq;
    desempenhoAbortController?.abort();
    const controller = new AbortController();
    desempenhoAbortController = controller;
    loading = true;
    data = null;
    try {
      const res = await apiFetch<{ data: EvolucaoAnualResult }>(
        '/api/v1/dashboard/evolucao-anual',
        {
          method: 'GET',
          timeoutMs: 90_000,
          signal: controller.signal,
          query: {
            anos: anosSelecionados.join(','),
            company_id: empresaSelecionada || undefined,
            vendedor_id: vendedorSelecionado || undefined
          }
        }
      );
      if (requestSeq !== desempenhoRequestSeq) return;
      data = res.data ?? null;
    } catch (err: unknown) {
      if (isCanceledApiError(err)) return;
      if (requestSeq !== desempenhoRequestSeq) return;
      const message = toUserMessage(err, 'Erro ao carregar análise de desempenho.');
      toast.error(message);
      data = null;
    } finally {
      if (requestSeq === desempenhoRequestSeq) {
        loading = false;
        if (desempenhoAbortController === controller) {
          desempenhoAbortController = null;
        }
      }
    }
  }

  onMount(async () => {
    await Promise.all([loadBase(), loadDesempenho()]);
  });

  onDestroy(() => {
    baseAbortController?.abort();
    desempenhoAbortController?.abort();
  });

  // Vendedores filtrados pela empresa selecionada
  $: vendedoresFiltrados = empresaSelecionada
    ? vendedores.filter((v) => v.company_id === empresaSelecionada)
    : vendedores;

  // Limpa filtro de vendedor quando troca empresa
  $: if (empresaSelecionada && vendedorSelecionado) {
    const ainda = vendedoresFiltrados.find((v) => v.id === vendedorSelecionado);
    if (!ainda) vendedorSelecionado = '';
  }

  // ---------------------------------------------------------------------------
  // Dados dos gráficos (reativos)
  // ---------------------------------------------------------------------------
  $: receita_line = data?.anos?.length
    ? ({
        labels: MESES,
        datasets: data.anos.map((a, i) => ({
          label: String(a.ano),
          data: a.meses.map((m) => m.totalVendas),
          borderColor: ANO_COLORS[i % ANO_COLORS.length].border,
          backgroundColor: ANO_COLORS[i % ANO_COLORS.length].bg,
          borderWidth: 2.5,
          pointRadius: 4,
          pointHoverRadius: 6,
          fill: false,
          tension: 0.3
        }))
      } as ChartData)
    : null;

  $: receita_bar = data?.anos?.length
    ? ({
        labels: MESES,
        datasets: data.anos.map((a, i) => ({
          label: String(a.ano),
          data: a.meses.map((m) => m.totalVendas),
          backgroundColor: ANO_COLORS[i % ANO_COLORS.length].solid,
          borderColor: ANO_COLORS[i % ANO_COLORS.length].border,
          borderWidth: 1.5,
          borderRadius: 4
        }))
      } as ChartData)
    : null;

  $: qtd_line = data?.anos?.length
    ? ({
        labels: MESES,
        datasets: data.anos.map((a, i) => ({
          label: String(a.ano),
          data: a.meses.map((m) => m.qtdVendas),
          borderColor: ANO_COLORS[i % ANO_COLORS.length].border,
          backgroundColor: ANO_COLORS[i % ANO_COLORS.length].bg,
          borderWidth: 2,
          pointRadius: 3,
          fill: false,
          tension: 0.3
        }))
      } as ChartData)
    : null;

  $: ticket_line = data?.anos?.length
    ? ({
        labels: MESES,
        datasets: data.anos.map((a, i) => ({
          label: String(a.ano),
          data: a.meses.map((m) => (m.qtdVendas > 0 ? Math.round(m.totalVendas / m.qtdVendas) : 0)),
          borderColor: ANO_COLORS[i % ANO_COLORS.length].border,
          backgroundColor: ANO_COLORS[i % ANO_COLORS.length].bg,
          borderWidth: 2,
          pointRadius: 3,
          fill: false,
          tension: 0.3
        }))
      } as ChartData)
    : null;

  // Opções de gráfico
  const optsMoeda: ChartOptions = {
    plugins: {
      tooltip: { callbacks: { label: (ctx) => `${ctx.dataset.label}: ${fmt(Number(ctx.raw))}` } }
    },
    scales: { y: { ticks: { callback: (v) => fmtShort(Number(v)) } } }
  };
  const optsQtd: ChartOptions = { scales: { y: { beginAtZero: true } } };
  const optsBar: ChartOptions = {
    plugins: {
      tooltip: { callbacks: { label: (ctx) => `${ctx.dataset.label}: ${fmt(Number(ctx.raw))}` } }
    },
    scales: {
      y: { ticks: { callback: (v) => fmtShort(Number(v)) } },
      x: { grid: { display: false } }
    }
  };

  // YoY entries para KPI cards
  $: yoyEntries = data?.crescimentoYoY ? Object.entries(data.crescimentoYoY) : [];

  // Melhor / pior mês por ano
  $: melhorPior =
    data?.anos?.map((a) => {
      const comDados = a.meses.filter((m) => m.totalVendas > 0);
      const melhor = a.meses.reduce((b, m) => (m.totalVendas > b.totalVendas ? m : b), a.meses[0]);
      const pior = comDados.length
        ? comDados.reduce((b, m) => (m.totalVendas < b.totalVendas ? m : b), comDados[0])
        : null;
      return {
        ano: a.ano,
        melhorMes: MESES[(melhor?.mes ?? 1) - 1],
        melhorVal: melhor?.totalVendas ?? 0,
        piorMes: pior ? MESES[pior.mes - 1] : '–',
        piorVal: pior?.totalVendas ?? 0
      };
    }) ?? [];

  function yoyIcon(pct: number | null) {
    if (pct === null) return Minus;
    return pct > 0 ? TrendingUp : pct < 0 ? TrendingDown : Minus;
  }
  function yoyClass(pct: number | null) {
    if (pct === null) return 'text-slate-400';
    return pct > 0 ? 'text-emerald-600' : pct < 0 ? 'text-red-600' : 'text-slate-400';
  }
</script>

<svelte:head>
  <title>Análise de Desempenho | VTUR</title>
</svelte:head>

<!-- Ocupa toda a tela, sem max-w restritivo -->
<div class="flex min-h-screen flex-col bg-slate-50 dark:bg-slate-950">
  <PageHeader
    title="Análise de Desempenho"
    subtitle="Compare a evolução das vendas entre múltiplos anos"
    color="vendas"
    breadcrumbs={[{ label: 'Relatórios', href: '/relatorios' }, { label: 'Análise de Desempenho' }]}
    actions={[
      {
        label: loading ? 'Carregando...' : 'Atualizar',
        onClick: () => loadDesempenho(),
        variant: 'secondary',
        icon: RefreshCw
      }
    ]}
  />

  <div class="flex-1 space-y-6 p-4 sm:p-6">
    <!-- ── Filtros ─────────────────────────────────────────────── -->
    <Card>
      <div class="flex flex-wrap items-end gap-4">
        <!-- Seletor de anos -->
        <div class="flex flex-col gap-1.5">
          <span class="text-xs font-medium text-slate-500">Anos para comparar (máx. 4)</span>
          <div class="flex flex-wrap gap-2">
            {#each anosDisponiveis as ano}
              {@const ativo = anosSelecionados.includes(ano)}
              {@const idx = anosSelecionados.indexOf(ano)}
              <button
                type="button"
                class="rounded-full border px-3 py-1 text-sm font-medium transition-all
                  {ativo
                  ? 'border-transparent text-white shadow-xs'
                  : 'border-slate-300 bg-white text-slate-600 hover:border-slate-400 dark:border-slate-600 dark:bg-slate-800 dark:text-slate-300'}"
                style={ativo
                  ? `background-color: ${ANO_COLORS[idx % ANO_COLORS.length].border}`
                  : ''}
                on:click={() => toggleAno(ano)}>{ano}</button
              >
            {/each}
          </div>
        </div>

        <!-- Filtro empresa (MASTER / ADMIN) -->
        {#if ($permissoes.isMaster || $permissoes.isSystemAdmin) && empresas.length > 0}
          <div class="w-52">
            <FieldSelect
              label="Empresa"
              bind:value={empresaSelecionada}
              options={[
                { value: '', label: 'Todas as empresas' },
                ...empresas.map((e) => ({ value: e.id, label: e.nome }))
              ]}
            />
          </div>
        {/if}

        <!-- Filtro vendedor -->
        {#if vendedoresFiltrados.length > 0}
          <div class="w-52">
            <FieldSelect
              label="Vendedor / Usuário"
              bind:value={vendedorSelecionado}
              options={[
                { value: '', label: 'Todos' },
                ...vendedoresFiltrados.map((v) => ({ value: v.id, label: v.nome }))
              ]}
            />
          </div>
        {/if}

        <Button
          variant="primary"
          size="sm"
          on:click={loadDesempenho}
          disabled={loading || anosSelecionados.length === 0}
          class_name="self-end"
        >
          {loading ? 'Carregando...' : 'Aplicar'}
        </Button>
      </div>
    </Card>

    <!-- ── Skeleton ────────────────────────────────────────────── -->
    {#if loading}
      <div class="grid grid-cols-1 gap-6 lg:grid-cols-2">
        {#each [1, 2, 3, 4] as _}
          <Card>
            <div class="animate-pulse space-y-3">
              <div class="h-4 w-1/3 rounded-sm bg-slate-200"></div>
              <div class="h-52 rounded-sm bg-slate-100"></div>
            </div>
          </Card>
        {/each}
      </div>

      <!-- ── Conteúdo ─────────────────────────────────────────────── -->
    {:else if data?.anos?.length}
      <!-- KPI cards por ano -->
      <div>
        <h2 class="mb-3 text-xs font-semibold tracking-wider text-slate-400 uppercase">
          Resumo por ano
        </h2>
        <div
          class="grid gap-4"
          style="grid-template-columns: repeat({Math.min(data.anos.length, 4)}, minmax(0, 1fr));"
        >
          {#each data.anos as a, idx}
            {@const color = ANO_COLORS[idx % ANO_COLORS.length]}
            <div class="vtur-kpi-card" style="border-top: 3px solid {color.border};">
              <div class="flex items-start justify-between gap-2">
                <div class="min-w-0">
                  <p class="text-xs font-medium text-slate-500">{a.ano}</p>
                  <p class="mt-1 truncate text-2xl font-bold text-slate-800 dark:text-slate-100">
                    {fmtShort(a.totalAno)}
                  </p>
                  <p class="mt-0.5 text-xs text-slate-400">
                    {a.qtdAno} venda{a.qtdAno !== 1 ? 's' : ''} · ticket {a.qtdAno > 0
                      ? fmtShort(a.totalAno / a.qtdAno)
                      : '–'}
                  </p>
                </div>
                <div
                  class="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl"
                  style="background-color:{color.bg}; color:{color.border};"
                >
                  <BarChart3 class="h-5 w-5" />
                </div>
              </div>
              {#each yoyEntries as [key, pct]}
                {#if key.endsWith(`->${a.ano}`)}
                  <div class="mt-2 flex items-center gap-1 text-xs font-medium {yoyClass(pct)}">
                    <svelte:component this={yoyIcon(pct)} class="h-3.5 w-3.5" />
                    <span>{fmtPct(pct)} vs {key.split('->')[0]}</span>
                  </div>
                {/if}
              {/each}
            </div>
          {/each}
        </div>
      </div>

      <!-- Gráficos — grid 2×2 sempre 100% -->
      <div class="grid grid-cols-1 gap-6 lg:grid-cols-2">
        <Card>
          <h3 class="mb-1 text-sm font-semibold text-slate-700 dark:text-slate-200">
            Evolução de Receita
          </h3>
          <p class="mb-4 text-xs text-slate-400">Receita mensal por ano</p>
          {#if receita_line}
            <ChartJS type="line" data={receita_line} options={optsMoeda} height={260} />
          {/if}
        </Card>

        <Card>
          <h3 class="mb-1 text-sm font-semibold text-slate-700 dark:text-slate-200">
            Comparativo Mensal
          </h3>
          <p class="mb-4 text-xs text-slate-400">Receita lado a lado por mês</p>
          {#if receita_bar}
            <ChartJS type="bar" data={receita_bar} options={optsBar} height={260} />
          {/if}
        </Card>

        <Card>
          <h3 class="mb-1 text-sm font-semibold text-slate-700 dark:text-slate-200">
            Quantidade de Vendas
          </h3>
          <p class="mb-4 text-xs text-slate-400">Número de vendas por mês</p>
          {#if qtd_line}
            <ChartJS type="line" data={qtd_line} options={optsQtd} height={260} />
          {/if}
        </Card>

        <Card>
          <h3 class="mb-1 text-sm font-semibold text-slate-700 dark:text-slate-200">
            Ticket Médio Mensal
          </h3>
          <p class="mb-4 text-xs text-slate-400">Receita média por venda</p>
          {#if ticket_line}
            <ChartJS type="line" data={ticket_line} options={optsMoeda} height={260} />
          {/if}
        </Card>
      </div>

      <!-- Destaques por ano -->
      {#if melhorPior.length > 0}
        <div>
          <h2 class="mb-3 text-xs font-semibold tracking-wider text-slate-400 uppercase">
            Destaques
          </h2>
          <div
            class="grid gap-4"
            style="grid-template-columns: repeat({Math.min(melhorPior.length, 4)}, minmax(0, 1fr));"
          >
            {#each melhorPior as mp, idx}
              {@const color = ANO_COLORS[idx % ANO_COLORS.length]}
              <Card>
                <div class="mb-3 flex items-center gap-2">
                  <span class="inline-block h-3 w-3 rounded-full" style="background:{color.border};"
                  ></span>
                  <span class="text-sm font-semibold text-slate-700 dark:text-slate-200"
                    >{mp.ano}</span
                  >
                </div>
                <div class="space-y-2">
                  <div class="rounded-lg bg-emerald-50 p-3 dark:bg-emerald-900/20">
                    <p class="text-xs font-medium text-emerald-600">🏆 Melhor mês</p>
                    <p class="mt-0.5 text-sm font-bold text-emerald-700">{mp.melhorMes}</p>
                    <p class="text-xs text-emerald-600">{fmt(mp.melhorVal)}</p>
                  </div>
                  <div class="rounded-lg bg-red-50 p-3 dark:bg-red-900/20">
                    <p class="text-xs font-medium text-red-500">📉 Menor mês c/ dados</p>
                    <p class="mt-0.5 text-sm font-bold text-red-600">{mp.piorMes}</p>
                    <p class="text-xs text-red-500">{mp.piorMes !== '–' ? fmt(mp.piorVal) : '–'}</p>
                  </div>
                </div>
              </Card>
            {/each}
          </div>
        </div>
      {/if}

      <!-- ── Sem dados ────────────────────────────────────────────── -->
    {:else}
      <Card>
        <div class="py-16 text-center text-slate-500">
          <BarChart3 class="mx-auto mb-3 h-10 w-10 opacity-30" />
          <p class="text-sm">Nenhum dado encontrado para os anos selecionados.</p>
          <p class="mt-1 text-xs text-slate-500">
            Tente selecionar outros anos ou ajustar os filtros.
          </p>
        </div>
      </Card>
    {/if}
  </div>
</div>
