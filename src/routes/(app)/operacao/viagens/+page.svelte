<script lang="ts">
  import { onDestroy, onMount } from 'svelte';
  import { goto } from '$app/navigation';
  import Button from '$lib/components/ui/Button.svelte';
  import Card from '$lib/components/ui/Card.svelte';
  import DataTable from '$lib/components/ui/DataTable.svelte';
  import BottomSheet from '$lib/components/ui/BottomSheet.svelte';
  import FieldSelect from '$lib/components/ui/form/FieldSelect.svelte';
  import PageHeader from '$lib/components/ui/PageHeader.svelte';
  import KPICard from '$lib/components/kpis/KPICard.svelte';
  import {
    Plus,
    Plane,
    Calendar,
    FileText,
    Clock,
    CreditCard,
    SlidersHorizontal
  } from '$lib/icons';
  import { toast } from '$lib/stores/ui';
  import { compareISODate, diffDaysISODate, todayISODateLocal } from '$lib/date';
  import { toUserMessage } from '$lib/utils/errors';
  import { formatDate } from '$lib/utils/formatters';
  import { escapeHtml } from '$lib/utils/html';
  import { formatViagemStatus, resolveViagemStatus, type StatusViagem } from '$lib/viagens/status';
  import { apiGet, isCanceledApiError } from '$lib/services/api';

  interface Viagem {
    id: string;
    codigo: string;
    cliente: string;
    cliente_id: string;
    destino: string;
    data_inicio: string;
    data_fim: string;
    numero_pessoas: number;
    dias_viagem: number;
    status: StatusViagem;
    tipo: 'nacional' | 'internacional';
    valor_total: number;
    responsavel: string;
    venda_id: string;
    created_at: string;
  }

  type ViagemApiItem = Partial<Viagem> & Record<string, unknown>;

  interface ViagensResponse {
    items?: ViagemApiItem[];
  }

  let viagens: Viagem[] = [];
  let viagensFiltradas: Viagem[] = [];
  let loading = true;
  let errorMessage: string | null = null;
  let viagensRequestSeq = 0;
  let viagensAbortController: AbortController | null = null;

  type PeriodoEmbarque = '' | 'semana' | 'quinzena' | 'mes';
  type OrdenacaoViagem = 'embarque_asc' | 'embarque_desc' | 'retorno_asc' | 'cadastro_desc';

  // Filtros de operação
  let filtroStatus = '';
  let filtroPeriodo: PeriodoEmbarque = '';
  let ordenacao: OrdenacaoViagem = 'embarque_asc';
  let showFilterSheet = false;

  const statusOptions = [
    { value: '', label: 'Todos' },
    { value: 'pendente', label: 'Pendente' },
    { value: 'confirmada', label: 'Confirmada' },
    { value: 'em_viagem', label: 'Em viagem' },
    { value: 'concluida', label: 'Concluída' },
    { value: 'cancelada', label: 'Cancelada' }
  ];

  const periodoOptions: Array<{ value: PeriodoEmbarque; label: string; helper: string }> = [
    { value: '', label: 'Todos', helper: 'Sem recorte' },
    { value: 'semana', label: 'Semana', helper: '7 dias' },
    { value: 'quinzena', label: 'Quinzena', helper: '15 dias' },
    { value: 'mes', label: 'Mês', helper: '30 dias' }
  ];

  const ordenacaoOptions = [
    { value: 'embarque_asc', label: 'Embarque mais próximo' },
    { value: 'embarque_desc', label: 'Embarque mais distante' },
    { value: 'retorno_asc', label: 'Retorno mais próximo' },
    { value: 'cadastro_desc', label: 'Cadastro recente' }
  ];

  const BRL_CURRENCY_FORMATTER = new Intl.NumberFormat('pt-BR', {
    style: 'currency',
    currency: 'BRL'
  });

  const BRL_INTEGER_CURRENCY_FORMATTER = new Intl.NumberFormat('pt-BR', {
    style: 'currency',
    currency: 'BRL',
    maximumFractionDigits: 0
  });

  async function loadViagens() {
    const requestSeq = ++viagensRequestSeq;
    viagensAbortController?.abort();
    const controller = new AbortController();
    viagensAbortController = controller;
    loading = true;
    errorMessage = null;
    try {
      const data = await apiGet<ViagensResponse>(
        '/api/v1/viagens',
        {
          status: filtroStatus || undefined,
          periodo: filtroPeriodo || undefined,
          ordenar: ordenacao,
          limit: 500
        },
        controller.signal,
        60_000
      );
      if (requestSeq !== viagensRequestSeq) return;
      viagens = (data.items || []).map((v) => ({
        id: String(v.id || ''),
        codigo: v.venda_id
          ? `VND-${String(v.venda_id).slice(0, 8)}`
          : String(v.id || '').slice(0, 8),
        cliente: String(v.cliente_nome || ''),
        cliente_id: String(v.cliente_id || ''),
        destino: String(v.destino || ''),
        data_inicio: String(v.data_inicio || ''),
        data_fim: String(v.data_fim || ''),
        numero_pessoas: Number(v.numero_passageiros || 1),
        dias_viagem: calcularDias(String(v.data_inicio || ''), String(v.data_fim || '')),
        status: resolveViagemStatus({
          status: v.status,
          data_inicio: v.data_inicio,
          data_fim: v.data_fim
        }),
        tipo: v.tipo_viagem === 'internacional' ? 'internacional' : 'nacional',
        valor_total: Number(v.valor_total || 0),
        responsavel: String(v.responsavel_nome || 'Não atribuído'),
        venda_id: String(v.venda_id || ''),
        created_at: String(v.created_at || '')
      }));
      viagensFiltradas = viagens;
    } catch (err) {
      if (isCanceledApiError(err)) return;
      if (requestSeq !== viagensRequestSeq) return;
      errorMessage = `Erro ao carregar viagens: ${toUserMessage(err, 'falha inesperada')}`;
      toast.error(errorMessage);
      viagens = [];
      viagensFiltradas = [];
    } finally {
      if (requestSeq === viagensRequestSeq) {
        loading = false;
        if (viagensAbortController === controller) {
          viagensAbortController = null;
        }
      }
    }
  }

  onDestroy(() => {
    viagensAbortController?.abort();
  });

  function calcularDias(inicio: string, fim: string): number {
    const diff = diffDaysISODate(inicio, fim);
    if (diff === null) return 0;
    return diff + 1;
  }

  function setPeriodo(value: PeriodoEmbarque) {
    filtroPeriodo = value;
    loadViagens();
  }

  onMount(() => {
    loadViagens();
  });

  function handleRowClick(row: Viagem) {
    goto(`/operacao/viagens/${row.id}`);
  }

  function handleExport() {
    if (viagensFiltradas.length === 0) {
      toast.info('Não há viagens para exportar');
      return;
    }

    const headers = [
      'Código',
      'Cliente',
      'Destino',
      'Início',
      'Fim',
      'Dias',
      'Pessoas',
      'Status',
      'Valor'
    ];
    const rows = viagensFiltradas.map((v) => [
      v.codigo,
      v.cliente,
      v.destino,
      v.data_inicio ? formatDate(v.data_inicio) : '',
      v.data_fim ? formatDate(v.data_fim) : '',
      v.dias_viagem.toString(),
      v.numero_pessoas.toString(),
      formatViagemStatus(v.status),
      v.valor_total.toFixed(2).replace('.', ',')
    ]);

    const csv = [headers.join(';'), ...rows.map((r) => r.join(';'))].join('\n');
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
    const link = document.createElement('a');
    link.href = URL.createObjectURL(blob);
    link.download = `viagens_${todayISODateLocal()}.csv`;
    link.click();

    toast.success('Viagens exportadas com sucesso!');
  }

  const columns = [
    {
      key: 'codigo',
      label: 'Código',
      sortable: true,
      width: '100px'
    },
    {
      key: 'cliente',
      label: 'Cliente / Destino',
      sortable: true,
      formatter: (value: string, row: Viagem) => {
        const dotColor =
          row.status === 'cancelada'
            ? '#f87171'
            : row.tipo === 'internacional'
              ? '#a78bfa'
              : '#4ade80';
        const destino = escapeHtml(row.destino || '');
        return `<div class="font-semibold text-slate-900 leading-tight">${escapeHtml(value)}</div><div class="text-xs text-slate-500 leading-tight"><span style="display:inline-block;width:6px;height:6px;border-radius:50%;background:${dotColor};margin-right:4px;vertical-align:middle;"></span>${destino}</div>`;
      }
    },
    {
      key: 'data_inicio',
      label: 'Período',
      sortable: true,
      formatter: (value: string, row: Viagem) => {
        const hoje = todayISODateLocal();
        let alerta = '';

        if (row.status === 'em_viagem') {
          alerta = '<span class="text-amber-600 font-medium">• Em viagem</span>';
        } else if (row.status === 'concluida') {
          alerta = '<span class="text-slate-400">• Concluída</span>';
        } else if (row.status === 'confirmada' && compareISODate(value, hoje) > 0) {
          const dias = diffDaysISODate(hoje, value) ?? 0;
          if (dias <= 7) alerta = `<span class="text-red-600 font-medium">• Falta ${dias}d</span>`;
        }

        return `<div class="leading-tight">${formatDate(value)} - ${formatDate(row.data_fim)}</div><div class="text-xs text-slate-500 leading-tight">${row.dias_viagem} dias ${alerta}</div>`;
      }
    },
    {
      key: 'numero_pessoas',
      label: 'Viajantes',
      sortable: true,
      width: '80px',
      align: 'center' as const,
      formatter: (value: number) => escapeHtml(String(value ?? 0))
    },
    {
      key: 'valor_total',
      label: 'Valor',
      sortable: true,
      align: 'right' as const,
      formatter: (value: number) => {
        return BRL_CURRENCY_FORMATTER.format(value || 0);
      }
    },
    {
      key: 'status',
      label: 'Status',
      sortable: true,
      formatter: (value: string) => {
        const styles: Record<string, string> = {
          pendente: 'bg-slate-100 text-slate-700',
          confirmada: 'bg-blue-100 text-blue-700',
          em_viagem: 'bg-amber-100 text-amber-700',
          concluida: 'bg-green-100 text-green-700',
          cancelada: 'bg-red-100 text-red-700'
        };
        return `<span class="px-2 py-0.5 text-xs font-medium rounded-full ${styles[value] || styles.pendente}">${escapeHtml(formatViagemStatus(value))}</span>`;
      }
    },
    {
      key: 'responsavel',
      label: 'Responsável',
      sortable: true
    }
  ];

  $: resumo = (() => {
    const lista = viagensFiltradas;
    const agregados = lista.reduce(
      (acc, v) => {
        acc.valorTotal += v.valor_total || 0;
        if (v.status === 'pendente') acc.pendentes += 1;
        if (v.status === 'confirmada') acc.confirmadas += 1;
        if (v.status === 'em_viagem') acc.emViagem += 1;
        if (v.status === 'concluida') acc.concluidas += 1;
        if (v.status === 'cancelada') acc.canceladas += 1;
        return acc;
      },
      { pendentes: 0, confirmadas: 0, emViagem: 0, concluidas: 0, canceladas: 0, valorTotal: 0 }
    );
    const { pendentes, confirmadas, emViagem, concluidas, canceladas, valorTotal } = agregados;
    return {
      total: lista.length,
      pendentes,
      confirmadas,
      emViagem,
      concluidas,
      canceladas,
      valorTotal
    };
  })();
</script>

<svelte:head>
  <title>Viagens | VTUR</title>
</svelte:head>

<PageHeader
  title="Viagens"
  subtitle="Gerencie viagens pendentes, confirmadas, em andamento e concluídas"
  color="clientes"
  breadcrumbs={[{ label: 'Viagens' }]}
  actions={[
    {
      label: 'Nova Viagem',
      href: '/operacao/viagens/nova',
      variant: 'primary',
      icon: Plus
    }
  ]}
/>

<!-- Resumo com KPICards -->
<div class="vtur-kpi-grid vtur-kpi-grid-6 mb-6">
  <KPICard title="Total" value={resumo.total} color="clientes" icon={Plane} />

  <KPICard title="Pendentes" value={resumo.pendentes} color="clientes" icon={Calendar} />

  <KPICard title="Confirmadas" value={resumo.confirmadas} color="clientes" icon={Calendar} />

  <KPICard title="Em viagem" value={resumo.emViagem} color="clientes" icon={Clock} />

  <KPICard title="Concluídas" value={resumo.concluidas} color="clientes" icon={FileText} />

  <KPICard
    title="Valor Total"
    value={BRL_INTEGER_CURRENCY_FORMATTER.format(resumo.valorTotal)}
    color="clientes"
    icon={CreditCard}
  />
</div>

<!-- Mobile: botão de filtros -->
<div class="mb-4 sm:hidden">
  <Button variant="secondary" class_name="w-full" on:click={() => (showFilterSheet = true)}>
    <SlidersHorizontal size={16} class="mr-2" />
    Filtros
    {#if filtroStatus || filtroPeriodo}
      <span class="bg-clientes-500 ml-2 inline-flex h-2 w-2 rounded-full"></span>
    {/if}
  </Button>
</div>

<Card
  title="Ordem de embarque"
  subtitle="Use os recortes rápidos para acompanhar quem embarca nos próximos dias."
  color="clientes"
  class="mb-6 hidden sm:block"
>
  <div class="flex flex-col gap-5 xl:flex-row xl:items-end xl:justify-between">
    <div class="min-w-0 flex-1">
      <div class="mb-2 flex items-center gap-2 text-sm font-medium text-slate-700">
        <Calendar size={16} class="text-blue-500" />
        Recorte por embarque
      </div>
      <div
        class="flex flex-wrap gap-2"
        role="group"
        aria-label="Filtro rápido por data de embarque"
      >
        {#each periodoOptions as option}
          <Button
            variant={filtroPeriodo === option.value ? 'primary' : 'secondary'}
            color="clientes"
            size="sm"
            ariaPressed={filtroPeriodo === option.value}
            on:click={() => setPeriodo(option.value)}
          >
            <span class="flex flex-col items-start leading-tight">
              <span>{option.label}</span>
              <span
                class={filtroPeriodo === option.value
                  ? 'text-[11px] text-white/80'
                  : 'text-[11px] text-slate-500'}
              >
                {option.helper}
              </span>
            </span>
          </Button>
        {/each}
      </div>
    </div>

    <div class="grid gap-3 sm:grid-cols-2 xl:w-[520px]">
      <FieldSelect
        label="Status"
        bind:value={filtroStatus}
        options={statusOptions}
        placeholder={null}
        disabled={loading}
        on:change={loadViagens}
      />

      <FieldSelect
        label="Mostrar por"
        bind:value={ordenacao}
        options={ordenacaoOptions}
        placeholder={null}
        disabled={loading}
        on:change={loadViagens}
      />
    </div>
  </div>
</Card>

<BottomSheet bind:open={showFilterSheet} title="Filtrar Viagens">
  <div class="space-y-4">
    <div class="flex flex-col gap-2">
      <span class="text-sm font-medium text-slate-700">Recorte por embarque</span>
      {#each periodoOptions as option}
        <Button
          variant={filtroPeriodo === option.value ? 'primary' : 'secondary'}
          color="clientes"
          size="sm"
          ariaPressed={filtroPeriodo === option.value}
          on:click={() => setPeriodo(option.value)}
        >
          <span class="flex flex-col items-start leading-tight">
            <span>{option.label}</span>
            <span
              class={filtroPeriodo === option.value
                ? 'text-[11px] text-white/80'
                : 'text-[11px] text-slate-500'}
            >
              {option.helper}
            </span>
          </span>
        </Button>
      {/each}
    </div>
    <FieldSelect
      id="viagens-status-mobile"
      label="Status"
      bind:value={filtroStatus}
      options={statusOptions}
      placeholder={null}
      disabled={loading}
      on:change={loadViagens}
      class_name="w-full"
    />
    <FieldSelect
      id="viagens-ordenacao-mobile"
      label="Mostrar por"
      bind:value={ordenacao}
      options={ordenacaoOptions}
      placeholder={null}
      disabled={loading}
      on:change={loadViagens}
      class_name="w-full"
    />
  </div>
  <Button variant="primary" class_name="w-full mt-2" on:click={() => (showFilterSheet = false)}>
    Aplicar filtros
  </Button>
</BottomSheet>

<DataTable
  {columns}
  data={viagensFiltradas}
  color="clientes"
  {loading}
  compact={false}
  dense={true}
  title="Lista de viagens por embarque"
  searchable={true}
  filterable={false}
  exportable={true}
  pageSize={25}
  extraSearchKeys={['destino', 'responsavel', 'codigo', 'cliente']}
  onRowClick={handleRowClick}
  onExport={handleExport}
  emptyMessage="Nenhuma viagem encontrada"
/>

<div class="mt-3 rounded-lg border border-slate-200 bg-white px-4 py-3 text-xs text-slate-600">
  <p class="font-medium text-slate-700">Legenda dos indicadores:</p>
  <div class="mt-2 flex flex-wrap items-center gap-4">
    <span class="inline-flex items-center gap-2">
      <span class="h-2.5 w-2.5 rounded-full bg-green-400"></span>
      Viagem nacional
    </span>
    <span class="inline-flex items-center gap-2">
      <span class="h-2.5 w-2.5 rounded-full bg-purple-400"></span>
      Viagem internacional
    </span>
    <span class="inline-flex items-center gap-2">
      <span class="h-2.5 w-2.5 rounded-full bg-red-400"></span>
      Viagem cancelada
    </span>
  </div>
</div>
