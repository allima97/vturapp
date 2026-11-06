<script lang="ts">
  import { onDestroy, onMount } from 'svelte';
  import { goto } from '$app/navigation';
  import {
    PageHeader,
    Card,
    Button,
    Dialog,
    DataTable,
    FieldInput,
    FieldSelect,
    BottomSheet
  } from '$lib/components/ui';
  import {
    Calculator,
    RefreshCw,
    AlertCircle,
    DollarSign,
    TrendingUp,
    Wallet,
    SlidersHorizontal
  } from '$lib/icons';
  import { toast } from '$lib/stores/ui';
  import { currentMonthRangeISODate, parseISODateParts, todayISODateLocal } from '$lib/date';
  import { formatDate } from '$lib/utils/formatters';
  import { apiGet, apiPost, isCanceledApiError } from '$lib/services/api';
  import { toUserMessage } from '$lib/utils/errors';
  import { createDebouncedReloader } from '$lib/utils/autoReload';

  interface VendaCalculada {
    id?: string;
    venda_id: string;
    recibo_id?: string;
    numero_venda: string;
    numero_recibo?: string;
    produto?: string;
    cliente: string;
    valor_venda: number;
    valor_comissionavel: number;
    percentual: number;
    percentual_comissao_geral?: number;
    percentual_seguro?: number;
    valor_comissao: number;
    valor_comissao_geral?: number;
    valor_comissao_seguro?: number;
    regra: string;
    status: 'calculada' | 'ignorada' | 'erro' | 'paga' | 'pendente' | 'cancelada';
    motivo?: string;
  }

  type EmpresaOption = { id: string; nome: string };
  type VendedorOption = {
    id: string;
    vendedor_id?: string;
    vendedor_nome?: string;
    nome?: string;
    nome_completo?: string;
    email?: string;
  };

  interface ComissoesCalculoResponse {
    items?: VendaCalculada[];
    persistencia_disponivel?: boolean;
  }

  interface VendedoresResponse {
    items?: VendedorOption[];
  }

  let loading = false;
  let calculando = false;
  let showConfirmDialog = false;
  let showResultDialog = false;
  let showFilterSheet = false;
  let resultadoCalculo: {
    processadas: number;
    erro: number;
    total_vendas: number;
    total_recibos?: number;
    detalhes: VendaCalculada[];
  } | null = null;

  let comissoesPendentes: VendaCalculada[] = [];
  let persistenciaDisponivel = true;

  // Filtros
  const todayParts = parseISODateParts(todayISODateLocal());
  let filtroDataInicio = '';
  let filtroDataFim = '';
  let filtroMes = String(todayParts?.month || new Date().getMonth() + 1);
  let filtroAno = todayParts?.year || new Date().getFullYear();
  let filtroVendedor = '';
  let filtroStatus = 'todas';
  let vendedores: VendedorOption[] = [];
  let empresas: EmpresaOption[] = [];
  let empresaId = '';
  let autoReloadEnabled = false;
  let lastAutoReloadKey = '';
  let contextRequestSeq = 0;
  let contextAbortController: AbortController | null = null;
  let comissoesRequestSeq = 0;
  let comissoesAbortController: AbortController | null = null;
  let vendedoresRequestSeq = 0;
  let vendedoresAbortController: AbortController | null = null;
  const autoReload = createDebouncedReloader(() => loadComissoes(), 250);
  const BRL_CURRENCY_FORMATTER = new Intl.NumberFormat('pt-BR', {
    style: 'currency',
    currency: 'BRL'
  });
  const BRL_INTEGER_CURRENCY_FORMATTER = new Intl.NumberFormat('pt-BR', {
    style: 'currency',
    currency: 'BRL',
    maximumFractionDigits: 0
  });
  const MONTH_NAME_FORMATTER = new Intl.DateTimeFormat('pt-BR', {
    month: 'long',
    timeZone: 'UTC'
  });
  const MONTH_YEAR_FORMATTER = new Intl.DateTimeFormat('pt-BR', {
    month: 'long',
    year: 'numeric',
    timeZone: 'UTC'
  });

  function getVendedorId(vendedor: VendedorOption) {
    return String(vendedor?.vendedor_id || vendedor?.id || '');
  }

  function getVendedorNome(vendedor?: VendedorOption | null) {
    return String(
      vendedor?.vendedor_nome ||
        vendedor?.nome_completo ||
        vendedor?.nome ||
        vendedor?.email ||
        vendedor?.id ||
        'Vendedor'
    );
  }

  function formatMonthName(month: number) {
    return MONTH_NAME_FORMATTER.format(new Date(Date.UTC(2024, month - 1, 1)));
  }

  function formatMonthYearLabel(year: number, month: number) {
    return MONTH_YEAR_FORMATTER.format(new Date(Date.UTC(year, month - 1, 1)));
  }

  onMount(() => {
    // Define período padrão (mês atual)
    const range = currentMonthRangeISODate();
    filtroDataInicio = range.inicio;
    filtroDataFim = range.fim;

    void (async () => {
      await loadUserContext();
      await Promise.all([loadComissoes(), loadVendedores()]);
      lastAutoReloadKey = buildAutoReloadKey();
      autoReloadEnabled = true;
    })();
  });

  onDestroy(() => {
    autoReload.cancel();
    contextAbortController?.abort();
    comissoesAbortController?.abort();
    vendedoresAbortController?.abort();
  });

  function buildAutoReloadKey() {
    return [empresaId, filtroMes, filtroAno, filtroStatus, filtroVendedor].join('|');
  }

  $: empresaOptions = empresas.map((empresa) => ({
    value: empresa.id,
    label: empresa.nome
  }));

  $: canSelectEmpresa = empresaOptions.length > 1;

  async function loadUserContext() {
    const requestSeq = ++contextRequestSeq;
    contextAbortController?.abort();
    const controller = new AbortController();
    contextAbortController = controller;
    try {
      const data = await apiGet<{
        company_id?: string | null;
        empresas?: EmpresaOption[];
      }>('/api/v1/user/context', undefined, controller.signal, 60_000);
      if (requestSeq !== contextRequestSeq) return;

      empresas = Array.isArray(data.empresas)
        ? data.empresas
            .map((empresa) => ({
              id: String(empresa?.id || '').trim(),
              nome: String(empresa?.nome || 'Empresa sem nome').trim() || 'Empresa sem nome'
            }))
            .filter((empresa) => empresa.id)
        : [];
      empresaId = String(data.company_id || '').trim() || empresas[0]?.id || '';
    } catch (err) {
      if (isCanceledApiError(err)) return;
      if (requestSeq !== contextRequestSeq) return;
      empresas = [];
      empresaId = '';
      toast.error(toUserMessage(err, 'Erro ao carregar empresas.'));
    } finally {
      if (requestSeq === contextRequestSeq && contextAbortController === controller) {
        contextAbortController = null;
      }
    }
  }

  async function handleEmpresaChange() {
    filtroVendedor = '';
    await Promise.all([loadComissoes(), loadVendedores()]);
  }

  function scheduleAutoReload() {
    autoReload.schedule();
  }

  async function loadComissoes() {
    const requestSeq = ++comissoesRequestSeq;
    comissoesAbortController?.abort();
    const controller = new AbortController();
    comissoesAbortController = controller;
    loading = true;
    try {
      const data = await apiGet<ComissoesCalculoResponse>(
        '/api/v1/financeiro/comissoes/calcular',
        {
          status: filtroStatus !== 'todas' ? filtroStatus : undefined,
          empresa_id: empresaId || undefined,
          mes: filtroMes,
          ano: filtroAno,
          vendedor_id: filtroVendedor || undefined
        },
        controller.signal,
        90_000
      );
      if (requestSeq !== comissoesRequestSeq) return;
      comissoesPendentes = data.items || [];
      persistenciaDisponivel = data.persistencia_disponivel !== false;
    } catch (err) {
      if (isCanceledApiError(err)) return;
      if (requestSeq !== comissoesRequestSeq) return;
      toast.error(toUserMessage(err, 'Erro ao carregar comissões pendentes'));
    } finally {
      if (requestSeq === comissoesRequestSeq) {
        loading = false;
        if (comissoesAbortController === controller) {
          comissoesAbortController = null;
        }
      }
    }
  }

  async function loadVendedores() {
    const requestSeq = ++vendedoresRequestSeq;
    vendedoresAbortController?.abort();
    const controller = new AbortController();
    vendedoresAbortController = controller;
    try {
      const data = await apiGet<VendedoresResponse>(
        '/api/v1/financeiro/comissoes/vendedores',
        {
          empresa_id: empresaId || undefined
        },
        controller.signal,
        60_000
      );
      if (requestSeq !== vendedoresRequestSeq) return;
      vendedores = data.items || [];
    } catch (err) {
      if (isCanceledApiError(err)) return;
      if (requestSeq !== vendedoresRequestSeq) return;
      vendedores = [];
    } finally {
      if (requestSeq === vendedoresRequestSeq && vendedoresAbortController === controller) {
        vendedoresAbortController = null;
      }
    }
  }

  async function handleCalcular() {
    calculando = true;
    try {
      const data = await apiPost<typeof resultadoCalculo>('/api/v1/financeiro/comissoes/calcular', {
        data_inicio: filtroDataInicio,
        data_fim: filtroDataFim,
        empresa_id: empresaId || undefined,
        mes_referencia: Number(filtroMes),
        ano_referencia: filtroAno,
        vendedor_ids: filtroVendedor ? [filtroVendedor] : undefined
      });
      resultadoCalculo = data;
      showResultDialog = true;

      // Recarrega comissões pendentes
      await loadComissoes();
    } catch (err) {
      toast.error(toUserMessage(err, 'Erro ao calcular comissões'));
    } finally {
      calculando = false;
    }
  }

  function openConfirmDialog() {
    showConfirmDialog = true;
  }

  function getStatusBadge(status: string) {
    switch (String(status || '').toLowerCase()) {
      case 'calculada':
        return '<span class="inline-flex px-2 py-1 text-xs font-medium rounded-full bg-green-100 text-green-700">Calculada</span>';
      case 'ignorada':
        return '<span class="inline-flex px-2 py-1 text-xs font-medium rounded-full bg-amber-100 text-amber-700">Ignorada</span>';
      case 'erro':
        return '<span class="inline-flex px-2 py-1 text-xs font-medium rounded-full bg-red-100 text-red-700">Erro</span>';
      case 'paga':
        return '<span class="inline-flex px-2 py-1 text-xs font-medium rounded-full bg-green-100 text-green-700">Paga</span>';
      case 'pendente':
        return '<span class="inline-flex px-2 py-1 text-xs font-medium rounded-full bg-amber-100 text-amber-700">Pendente</span>';
      case 'cancelada':
        return '<span class="inline-flex px-2 py-1 text-xs font-medium rounded-full bg-red-100 text-red-700">Cancelada</span>';
      default:
        return status;
    }
  }

  function formatCurrency(value: number) {
    return BRL_INTEGER_CURRENCY_FORMATTER.format(Number(value || 0));
  }

  function formatPercent(value: number) {
    return `${Number(value || 0)
      .toFixed(2)
      .replace('.', ',')}%`;
  }

  function buildKpiLabel(label: string, values: number[]) {
    const unique = Array.from(
      new Set(
        values
          .map((value) => Number(value || 0))
          .filter((value) => value > 0)
          .map((value) => Number(value.toFixed(2)))
      )
    ).sort((a, b) => a - b);
    if (unique.length === 0) return label;
    if (unique.length <= 2) return `${label} (${unique.map(formatPercent).join(' / ')})`;
    return `${label} (${unique.length} faixas)`;
  }

  const columnsResultado = [
    { key: 'numero_recibo', label: 'Recibo', sortable: true, width: '150px' },
    { key: 'numero_venda', label: 'Venda', sortable: true, width: '120px' },
    { key: 'cliente', label: 'Cliente', sortable: true },
    { key: 'produto', label: 'Produto', sortable: true },
    {
      key: 'valor_venda',
      label: 'Valor Recibo',
      sortable: true,
      align: 'right' as const,
      formatter: (value: number) => BRL_CURRENCY_FORMATTER.format(value)
    },
    {
      key: 'percentual',
      label: '%',
      sortable: true,
      width: '80px',
      align: 'center' as const,
      formatter: (value: number) => `${value}%`
    },
    {
      key: 'valor_comissao',
      label: 'Comissão + seguro',
      sortable: true,
      align: 'right' as const,
      formatter: (value: number) => BRL_CURRENCY_FORMATTER.format(value)
    },
    { key: 'regra', label: 'Regra', sortable: true, width: '150px' },
    {
      key: 'status',
      label: 'Status',
      sortable: true,
      width: '100px',
      formatter: (value: string) => getStatusBadge(value)
    }
  ];

  const columnsPendentes = [
    { key: 'numero_recibo', label: 'Recibo', sortable: true, width: '150px' },
    { key: 'numero_venda', label: 'Venda', sortable: true, width: '120px' },
    { key: 'cliente', label: 'Cliente', sortable: true },
    { key: 'produto', label: 'Produto', sortable: true },
    { key: 'vendedor', label: 'Vendedor', sortable: true, width: '150px' },
    {
      key: 'data_venda',
      label: 'Data',
      sortable: true,
      width: '100px',
      formatter: (value: string) => formatDate(value)
    },
    {
      key: 'valor_venda',
      label: 'Valor Recibo',
      sortable: true,
      align: 'right' as const,
      formatter: (value: number) => BRL_CURRENCY_FORMATTER.format(value)
    },
    {
      key: 'percentual_aplicado',
      label: '%',
      sortable: true,
      width: '60px',
      align: 'center' as const,
      formatter: (value: number) => `${value}%`
    },
    {
      key: 'valor_comissao',
      label: 'Comissão + seguro',
      sortable: true,
      align: 'right' as const,
      formatter: (value: number) => BRL_CURRENCY_FORMATTER.format(value)
    },
    {
      key: 'valor_pago',
      label: 'Pago',
      sortable: true,
      align: 'right' as const,
      formatter: (value: number) => BRL_CURRENCY_FORMATTER.format(value || 0)
    },
    {
      key: 'data_pagamento',
      label: 'Data Pgto',
      sortable: true,
      width: '110px',
      formatter: (value: string) => formatDate(value)
    },
    {
      key: 'status',
      label: 'Status',
      sortable: true,
      width: '110px',
      formatter: (value: string) => getStatusBadge(value)
    }
  ];

  $: totalComissaoGeralPeriodo = comissoesPendentes.reduce(
    (acc, c) => acc + Number(c.valor_comissao_geral ?? c.valor_comissao ?? 0),
    0
  );
  $: totalSeguroPeriodo = comissoesPendentes.reduce(
    (acc, c) => acc + Number(c.valor_comissao_seguro || 0),
    0
  );
  $: totalComissaoComSeguroPeriodo = totalComissaoGeralPeriodo + totalSeguroPeriodo;
  $: labelComissao = buildKpiLabel(
    'Comissão',
    comissoesPendentes.map((c) => Number(c.percentual_comissao_geral || 0))
  );
  $: labelSeguro = buildKpiLabel(
    'Seguro Viagem',
    comissoesPendentes.map((c) => Number(c.percentual_seguro || 0))
  );
  $: quantidadePorStatus = comissoesPendentes.reduce(
    (acc, item) => {
      const status = String(item.status || '').toLowerCase();
      if (status === 'paga') acc.pagas += 1;
      if (status === 'pendente') acc.pendentes += 1;
      return acc;
    },
    { pagas: 0, pendentes: 0 }
  );
  $: quantidadePagas = quantidadePorStatus.pagas;
  $: quantidadePendentes = quantidadePorStatus.pendentes;
  $: statusOptions = [
    { value: 'todas', label: 'Todas' },
    { value: 'pendente', label: 'Pendentes' },
    { value: 'paga', label: 'Pagas' },
    { value: 'cancelada', label: 'Canceladas' }
  ];
  // O $: do modo legado só reage às variáveis escritas nesta linha (não enxerga dentro de
  // buildAutoReloadKey()). Por isso a mesma expressão da função fica aqui, idêntica.
  $: autoReloadKey = [empresaId, filtroMes, filtroAno, filtroStatus, filtroVendedor].join('|');
  $: if (autoReloadEnabled && autoReloadKey !== lastAutoReloadKey) {
    lastAutoReloadKey = autoReloadKey;
    scheduleAutoReload();
  }
</script>

<svelte:head>
  <title>Cálculo de Comissões | VTUR</title>
</svelte:head>

<PageHeader
  title="Cálculo de Comissões"
  subtitle="Acompanhe o cálculo e o estado persistido das comissões por período"
  color="financeiro"
  breadcrumbs={[
    { label: 'Financeiro', href: '/financeiro' },
    { label: 'Comissões', href: '/financeiro/comissoes' },
    { label: 'Cálculo' }
  ]}
/>

<!-- Filtros -->
<div class="mb-4 sm:hidden">
  <Button variant="secondary" class_name="w-full" on:click={() => (showFilterSheet = true)}>
    <SlidersHorizontal size={16} class="mr-2" />
    Filtros
  </Button>
</div>

<Card header="Filtros de Cálculo" color="financeiro" class="mb-6 hidden sm:block">
  <div class="grid grid-cols-1 gap-4 md:grid-cols-2 lg:grid-cols-6">
    {#if canSelectEmpresa}
      <FieldSelect
        label="Empresa"
        bind:value={empresaId}
        options={empresaOptions}
        placeholder={null}
        class_name="w-full"
        on:change={handleEmpresaChange}
      />
    {/if}

    <FieldInput label="Data Início" type="date" bind:value={filtroDataInicio} class_name="w-full" />

    <FieldInput
      label="Data Fim"
      type="date"
      bind:value={filtroDataFim}
      min={filtroDataInicio || null}
      class_name="w-full"
    />

    <FieldSelect
      label="Mês Referência"
      bind:value={filtroMes}
      options={Array.from({ length: 12 }, (_, i) => ({
        value: String(i + 1),
        label: formatMonthName(i + 1)
      }))}
      class_name="w-full"
    />

    <FieldInput label="Ano" type="number" bind:value={filtroAno} class_name="w-full" />

    <FieldSelect
      label="Status"
      bind:value={filtroStatus}
      options={statusOptions}
      class_name="w-full"
    />

    <FieldSelect
      label="Vendedor (opcional)"
      bind:value={filtroVendedor}
      options={[
        { value: '', label: 'Todos os vendedores' },
        ...vendedores.map((v) => ({ value: getVendedorId(v), label: getVendedorNome(v) }))
      ]}
      class_name="w-full"
    />
  </div>

  <div class="mt-6 flex justify-end gap-3 border-t pt-4">
    <Button variant="primary" color="financeiro" on:click={openConfirmDialog} disabled={calculando}>
      {#if calculando}
        <RefreshCw size={16} class="mr-2 animate-spin" />
        Calculando...
      {:else}
        <Calculator size={16} class="mr-2" />
        Calcular Comissões
      {/if}
    </Button>
  </div>
</Card>

<BottomSheet bind:open={showFilterSheet} title="Filtrar cálculo">
  <div class="space-y-4">
    {#if canSelectEmpresa}
      <FieldSelect
        label="Empresa"
        bind:value={empresaId}
        options={empresaOptions}
        placeholder={null}
        class_name="w-full"
        on:change={handleEmpresaChange}
      />
    {/if}

    <FieldInput label="Data Início" type="date" bind:value={filtroDataInicio} class_name="w-full" />

    <FieldInput
      label="Data Fim"
      type="date"
      bind:value={filtroDataFim}
      min={filtroDataInicio || null}
      class_name="w-full"
    />

    <FieldSelect
      label="Mês Referência"
      bind:value={filtroMes}
      options={Array.from({ length: 12 }, (_, i) => ({
        value: String(i + 1),
        label: formatMonthName(i + 1)
      }))}
      class_name="w-full"
    />

    <FieldInput label="Ano" type="number" bind:value={filtroAno} class_name="w-full" />

    <FieldSelect
      label="Status"
      bind:value={filtroStatus}
      options={statusOptions}
      class_name="w-full"
    />

    <FieldSelect
      label="Vendedor (opcional)"
      bind:value={filtroVendedor}
      options={[
        { value: '', label: 'Todos os vendedores' },
        ...vendedores.map((v) => ({ value: getVendedorId(v), label: getVendedorNome(v) }))
      ]}
      class_name="w-full"
    />

    <Button variant="primary" class_name="w-full mt-2" on:click={() => (showFilterSheet = false)}>
      Aplicar filtros
    </Button>

    <Button
      variant="primary"
      color="financeiro"
      class_name="w-full"
      on:click={openConfirmDialog}
      disabled={calculando}
    >
      {#if calculando}
        <RefreshCw size={16} class="mr-2 animate-spin" />
        Calculando...
      {:else}
        <Calculator size={16} class="mr-2" />
        Calcular Comissões
      {/if}
    </Button>
  </div>
</BottomSheet>

<!-- Resumo -->
<div class="vtur-kpi-grid mb-6">
  <div class="vtur-kpi-card">
    <div class="flex h-10 w-10 items-center justify-center rounded-xl bg-orange-50 text-orange-500">
      <DollarSign size={20} />
    </div>
    <div>
      <p class="text-sm font-medium text-slate-500">{labelComissao}</p>
      <p class="text-2xl font-bold text-slate-900">{formatCurrency(totalComissaoGeralPeriodo)}</p>
    </div>
  </div>

  <div class="vtur-kpi-card">
    <div class="flex h-10 w-10 items-center justify-center rounded-xl bg-green-50 text-green-500">
      <Calculator size={20} />
    </div>
    <div>
      <p class="text-sm font-medium text-slate-500">Comissão total</p>
      <p class="text-2xl font-bold text-slate-900">
        {formatCurrency(totalComissaoGeralPeriodo)}
      </p>
    </div>
  </div>

  <div class="vtur-kpi-card">
    <div class="flex h-10 w-10 items-center justify-center rounded-xl bg-blue-50 text-blue-500">
      <Wallet size={20} />
    </div>
    <div>
      <p class="text-sm font-medium text-slate-500">{labelSeguro}</p>
      <p class="text-2xl font-bold text-slate-900">
        {formatCurrency(totalSeguroPeriodo)}
      </p>
    </div>
  </div>

  <div class="vtur-kpi-card">
    <div class="flex h-10 w-10 items-center justify-center rounded-xl bg-green-50 text-green-500">
      <TrendingUp size={20} />
    </div>
    <div>
      <p class="text-sm font-medium text-slate-500">Comissão + seguro</p>
      <p class="text-2xl font-bold text-slate-900">
        {formatCurrency(totalComissaoComSeguroPeriodo)}
      </p>
    </div>
  </div>
</div>

<!-- Lista de Comissões Pendentes -->
<Card header={`Comissões do período - ${comissoesPendentes.length} registros`} color="financeiro">
  <div
    class="rounded-vtur-xl mb-4 border border-slate-200 bg-slate-50 px-5 py-4 text-sm text-slate-600"
  >
    O painel agora mistura cálculo e persistência: ele mostra <strong>{quantidadePendentes}</strong>
    pendentes, <strong>{quantidadePagas}</strong> pagas e respeita o status salvo no módulo principal
    de comissões.
  </div>
  {#if !persistenciaDisponivel}
    <div
      class="rounded-vtur-xl mb-4 flex items-start gap-3 border border-amber-200 bg-amber-50 px-5 py-4 text-sm text-amber-900"
    >
      <AlertCircle size={18} class="mt-0.5 shrink-0" />
      <div>
        <p class="font-medium">Persistência indisponível neste ambiente.</p>
        <p class="mt-1 text-amber-800">
          O cálculo continua funcionando, mas os status persistidos de pagamento e cancelamento só
          ficarão completos quando a tabela <code>comissoes</code> estiver disponível.
        </p>
      </div>
    </div>
  {/if}
  <DataTable
    columns={columnsPendentes}
    data={comissoesPendentes}
    color="financeiro"
    {loading}
    pageSize={25}
    searchable={true}
    exportable={true}
    emptyMessage="Nenhuma comissão encontrada para o período e status selecionados"
  />
</Card>

<!-- Dialog de Confirmação -->
<Dialog
  bind:open={showConfirmDialog}
  title="Confirmar Cálculo"
  color="financeiro"
  showCancel={true}
  cancelText="Cancelar"
  showConfirm={true}
  confirmText="Calcular"
  onConfirm={handleCalcular}
>
  <div class="space-y-4">
    <div class="rounded-lg border border-amber-200 bg-amber-50 p-4">
      <div class="flex items-start gap-3">
        <AlertCircle class="mt-0.5 text-amber-600" size={20} />
        <div>
          <p class="font-medium text-amber-800">Atenção</p>
          <p class="text-sm text-amber-700">
            O cálculo de comissões irá processar todos os recibos do período selecionado que ainda
            não possuem comissão calculada ou que precisam ser recalculadas.
          </p>
        </div>
      </div>
    </div>

    <div class="grid grid-cols-1 gap-4 text-sm sm:grid-cols-2">
      <div>
        <p class="text-slate-500">Período</p>
        <p class="font-medium">
          {formatDate(filtroDataInicio)} até {formatDate(filtroDataFim)}
        </p>
      </div>
      <div>
        <p class="text-slate-500">Referência</p>
        <p class="font-medium">
          {formatMonthYearLabel(Number(filtroAno), Number(filtroMes))}
        </p>
      </div>
      <div>
        <p class="text-slate-500">Vendedor</p>
        <p class="font-medium">
          {filtroVendedor
            ? getVendedorNome(vendedores.find((v) => getVendedorId(v) === filtroVendedor))
            : 'Todos'}
        </p>
      </div>
      <div>
        <p class="text-slate-500">Status Atual</p>
        <p class="font-medium">{quantidadePendentes} pendentes · {quantidadePagas} pagas</p>
      </div>
    </div>
  </div>
</Dialog>

<!-- Dialog de Resultado -->
<Dialog
  bind:open={showResultDialog}
  title="Resultado do Cálculo"
  color="financeiro"
  showCancel={true}
  cancelText="Fechar"
  showConfirm={false}
  maxWidth="4xl"
>
  {#if resultadoCalculo}
    <div class="space-y-4">
      <!-- Resumo -->
      <div class="grid grid-cols-1 gap-4 sm:grid-cols-3">
        <div class="rounded-lg bg-green-50 p-4 text-center">
          <p class="text-sm text-green-600">Processadas</p>
          <p class="text-2xl font-bold text-green-700">{resultadoCalculo.processadas}</p>
        </div>
        <div class="rounded-lg bg-red-50 p-4 text-center">
          <p class="text-sm text-red-600">Erros</p>
          <p class="text-2xl font-bold text-red-700">{resultadoCalculo.erro}</p>
        </div>
        <div class="rounded-lg bg-blue-50 p-4 text-center">
          <p class="text-sm text-blue-600">Total Recibos</p>
          <p class="text-2xl font-bold text-blue-700">
            {resultadoCalculo.total_recibos ?? resultadoCalculo.total_vendas}
          </p>
        </div>
      </div>

      <!-- Detalhes -->
      {#if resultadoCalculo.detalhes.length > 0}
        <div class="max-h-96 overflow-auto">
          <DataTable
            columns={columnsResultado}
            data={resultadoCalculo.detalhes}
            color="financeiro"
            pageSize={10}
            searchable={true}
            emptyMessage="Nenhum resultado"
          />
        </div>
      {/if}

      <!-- Ações -->
      <div class="flex justify-end gap-3 border-t pt-4">
        <Button variant="secondary" on:click={() => goto('/financeiro/comissoes')}>
          <DollarSign size={16} class="mr-2" />
          Ir para Pagamentos
        </Button>
      </div>
    </div>
  {/if}
</Dialog>
