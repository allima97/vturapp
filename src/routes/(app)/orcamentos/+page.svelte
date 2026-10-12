<script lang="ts">
  import { onMount, onDestroy } from 'svelte';
  import { goto } from '$app/navigation';
  import DataTable from '$lib/components/ui/DataTable.svelte';
  import PageHeader from '$lib/components/ui/PageHeader.svelte';
  import Button from '$lib/components/ui/Button.svelte';
  import { Plus, FileText, Send, ShoppingCart, AlertCircle } from '$lib/icons';
  import { toast } from '$lib/stores/ui';
  import { diffDaysISODate, todayISODateLocal } from '$lib/date';
  import { toUserMessage } from '$lib/utils/errors';
  import { formatDate } from '$lib/utils/formatters';
  import { escapeHtml } from '$lib/utils/html';
  import { apiGet } from '$lib/services/api';

  interface Orcamento {
    id: string;
    codigo: string;
    cliente: string;
    cliente_id: string;
    destino: string;
    data_criacao: string | null;
    data_validade: string | null;
    valor_total: number;
    status: 'pendente' | 'enviado' | 'aprovado' | 'rejeitado' | 'expirado' | 'novo' | 'fechado';
    status_negociacao: string | null;
    vendedor: string;
    vendedor_id: string;
    origem: 'manual' | 'site' | 'indicacao';
    quantidade_itens: number;
    created_at?: string | null;
    last_interaction_at?: string | null;
    last_interaction_notes?: string | null;
  }

  let orcamentosFiltrados: Orcamento[] = [];
  let loading = true;
  let errorMessage: string | null = null;

  let filtroStatus = '';
  let filtroPeriodo = '';
  let somenteCriticos = false;
  let somenteProntosVenda = false;

  let abortController: AbortController | null = null;
  const STATUS_SEM_FOLLOW_UP = new Set(['fechado', 'rejeitado', 'expirado']);
  const BRL_CURRENCY_FORMATTER = new Intl.NumberFormat('pt-BR', {
    style: 'currency',
    currency: 'BRL'
  });

  function getDiasSemInteracao(value: string | null | undefined) {
    if (!value) return Number.POSITIVE_INFINITY;
    const data = new Date(value);
    return Math.ceil((Date.now() - data.getTime()) / (1000 * 60 * 60 * 24));
  }

  function getDiasParaValidade(value: string | null | undefined) {
    if (!value) return Number.POSITIVE_INFINITY;
    return diffDaysISODate(todayISODateLocal(), value) ?? Number.POSITIVE_INFINITY;
  }

  function isExpirando(item: Orcamento) {
    if (!item.data_validade) return false;
    if (STATUS_SEM_FOLLOW_UP.has(item.status)) return false;
    const dias = getDiasParaValidade(item.data_validade);
    return dias >= 0 && dias <= 3;
  }

  function isCritico(item: Orcamento) {
    if (STATUS_SEM_FOLLOW_UP.has(item.status)) return false;
    if (!item.last_interaction_at) return true;
    if (getDiasSemInteracao(item.last_interaction_at) >= 7) return true;
    return isExpirando(item);
  }

  function isProntoParaVenda(item: Orcamento) {
    return item.status === 'aprovado';
  }

  function sortOrcamentosPorCriacao(items: Orcamento[]) {
    return [...items].sort((left, right) => {
      return String(right.created_at || right.data_criacao || '').localeCompare(
        String(left.created_at || left.data_criacao || '')
      );
    });
  }

  $: orcamentosAgregados = orcamentosFiltrados.reduce(
    (acc, o) => {
      const fechado = o.status === 'fechado';
      const aprovado = o.status === 'aprovado';

      acc.total += 1;
      acc.valorTotal += o.valor_total;
      if (o.status === 'novo') acc.novos += 1;
      if (o.status === 'pendente') acc.pendentes += 1;
      if (o.status === 'enviado') acc.enviados += 1;
      if (aprovado) {
        acc.aprovados += 1;
        acc.valorAprovado += o.valor_total;
      }
      if (fechado) {
        acc.convertidos += 1;
        acc.valorConvertido += o.valor_total;
      }
      if (!o.last_interaction_at && !fechado) acc.semInteracao += 1;
      if (o.last_interaction_at && getDiasSemInteracao(o.last_interaction_at) >= 7 && !fechado) acc.followupAtrasado += 1;
      if (isExpirando(o)) acc.expirando += 1;
      if (isCritico(o)) acc.criticos += 1;
      if (isProntoParaVenda(o)) acc.prontosVenda += 1;
      return acc;
    },
    {
      total: 0,
      novos: 0,
      pendentes: 0,
      enviados: 0,
      aprovados: 0,
      convertidos: 0,
      semInteracao: 0,
      followupAtrasado: 0,
      expirando: 0,
      valorTotal: 0,
      valorAprovado: 0,
      valorConvertido: 0,
      criticos: 0,
      prontosVenda: 0
    }
  );
  $: criticosCount = orcamentosAgregados.criticos;
  $: prontosVendaCount = orcamentosAgregados.prontosVenda;
  $: orcamentosVisiveis = orcamentosFiltrados.filter((o) => {
    if (somenteCriticos && !isCritico(o)) return false;
    if (somenteProntosVenda && !isProntoParaVenda(o)) return false;
    return true;
  });

  $: resumo = {
    total:         orcamentosAgregados.total,
    novos:         orcamentosAgregados.novos,
    pendentes:     orcamentosAgregados.pendentes,
    enviados:      orcamentosAgregados.enviados,
    aprovados:     orcamentosAgregados.aprovados,
    convertidos:   orcamentosAgregados.convertidos,
    semInteracao:  orcamentosAgregados.semInteracao,
    followupAtrasado: orcamentosAgregados.followupAtrasado,
    expirando:     orcamentosAgregados.expirando,
    valorTotal:    orcamentosAgregados.valorTotal,
    valorAprovado: orcamentosAgregados.valorAprovado,
    valorConvertido: orcamentosAgregados.valorConvertido,
    get taxaConversao() {
      return this.total > 0
        ? (((this.aprovados + this.convertidos) / this.total) * 100).toFixed(1)
        : '0';
    }
  };

  async function loadOrcamentos() {
    if (abortController) abortController.abort();
    abortController = new AbortController();

    loading = true;
    errorMessage = null;

    try {
      const payload = await apiGet<Orcamento[]>(
        '/api/v1/orcamentos/list',
        {
          status: filtroStatus,
          periodo: filtroPeriodo
        },
        abortController.signal
      );
      const items = Array.isArray(payload) ? payload : [];
      orcamentosFiltrados = sortOrcamentosPorCriacao(items);
    } catch (err: unknown) {
      if (err instanceof DOMException && err.name === 'AbortError') return;
      const msg = toUserMessage(err, 'Erro ao carregar orçamentos.');
      errorMessage = msg;
      orcamentosFiltrados = [];
      toast.error(msg);
    } finally {
      loading = false;
    }
  }

  function handleFiltroChange(key: string, value: string) {
    if (key === 'status')  filtroStatus  = value;
    if (key === 'periodo') filtroPeriodo = value;
    void loadOrcamentos();
  }

  onMount(() => void loadOrcamentos());

  onDestroy(() => {
    abortController?.abort();
  });

  function handleRowClick(row: Orcamento) {
    goto(`/orcamentos/${row.id}`);
  }

  function handleExport() {
    if (orcamentosVisiveis.length === 0) {
      toast.info('Não há orçamentos para exportar');
      return;
    }

    const headers = ['Código', 'Cliente', 'Destino', 'Criação', 'Validade', 'Valor', 'Status', 'Última interação', 'Responsável'];
    const rows = orcamentosVisiveis.map(o => [
      o.codigo,
      o.cliente,
      o.destino,
      o.data_criacao ? formatDate(o.data_criacao) : '',
      o.data_validade ? formatDate(o.data_validade) : '',
      o.valor_total.toFixed(2).replace('.', ','),
      o.status,
      o.last_interaction_at ? formatDate(o.last_interaction_at) : '',
      o.vendedor
    ]);

    const csv = [headers.join(';'), ...rows.map(r => r.join(';'))].join('\n');
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
    const link = document.createElement('a');
    link.href = URL.createObjectURL(blob);
    link.download = `orcamentos_${todayISODateLocal()}.csv`;
    link.click();
    toast.success('Orçamentos exportados com sucesso!');
  }

  const columns = [
    { key: 'codigo', label: 'Código', sortable: true, width: '120px' },
    {
      key: 'cliente',
      label: 'Cliente',
      sortable: true,
      formatter: (value: string, row: Orcamento) =>
        `<div class="flex flex-col">
          <span class="font-medium text-slate-900">${escapeHtml(value)}</span>
          <span class="text-xs text-slate-500">${escapeHtml(row.destino || 'Sem destino')}</span>
        </div>`
    },
    {
      key: 'data_criacao',
      label: 'Criação',
      sortable: true,
      width: '110px',
      formatter: (value: string | null) =>
        formatDate(value)
    },
    {
      key: 'last_interaction_at',
      label: 'Última interação',
      sortable: true,
      width: '180px',
      formatter: (value: string | null, row: Orcamento) => {
        if (!value) return '<span class="text-red-600 font-medium">Sem interação</span>';
        const diff = getDiasSemInteracao(value);
        const classe = diff >= 7 ? 'text-amber-700 font-medium' : 'text-slate-700';
        const nota = row.last_interaction_notes ? `<div class="text-xs text-slate-500">${escapeHtml(row.last_interaction_notes)}</div>` : '';
        const atraso = diff >= 7 ? `<div class="text-xs text-amber-700">${diff} dias sem contato</div>` : '';
        return `<div><div class="${classe}">${formatDate(value)}</div>${atraso}${nota}</div>`;
      }
    },
    {
      key: 'data_validade',
      label: 'Validade',
      sortable: true,
      width: '130px',
      formatter: (value: string | null) => {
        if (!value) return '-';
        const diff = getDiasParaValidade(value);
        const classe =
          diff < 0  ? 'text-red-600 font-medium' :
          diff <= 3 ? 'text-amber-600 font-medium' : '';
        const alerta = diff < 0
          ? '<div class="text-xs text-red-600">Expirado</div>'
          : diff <= 3
            ? `<div class="text-xs text-amber-600">Vence em ${diff}d</div>`
            : '';
        return `<div><div class="${classe}">${formatDate(value)}</div>${alerta}</div>`;
      }
    },
    {
      key: 'valor_total',
      label: 'Valor',
      sortable: true,
      align: 'right' as const,
      width: '130px',
      formatter: (value: number) => BRL_CURRENCY_FORMATTER.format(value)
    },
    {
      key: 'status',
      label: 'Status',
      sortable: true,
      width: '160px',
      formatter: (value: string) => {
        const styles: Record<string, string> = {
          pendente: 'bg-amber-100 text-amber-700',
          enviado:  'bg-blue-100 text-blue-700',
          aprovado: 'bg-green-100 text-green-700',
          rejeitado:'bg-red-100 text-red-700',
          expirado: 'bg-slate-100 text-slate-600',
          novo:     'bg-slate-100 text-slate-700',
          fechado:  'bg-emerald-100 text-emerald-700'
        };
        const labels: Record<string, string> = {
          pendente: 'Pendente', enviado: 'Enviado', aprovado: 'Aprovado',
          rejeitado: 'Rejeitado', expirado: 'Expirado', novo: 'Novo',
          fechado: 'Convertido em Venda'
        };
        const cl = styles[value] || 'bg-slate-100 text-slate-700';
        const lb = labels[value] || value;
        return `<span class="inline-flex items-center px-2.5 py-1 rounded-full text-xs font-medium ${cl}">${lb}</span>`;
      }
    },
    { key: 'vendedor', label: 'Responsável', sortable: true, width: '150px' }
  ];

  const filters = [
    {
      key: 'status',
      label: 'Status',
      type: 'select' as const,
      options: [
        { value: '', label: 'Todos' },
        { value: 'novo',      label: 'Novo' },
        { value: 'pendente',  label: 'Pendente' },
        { value: 'enviado',   label: 'Enviado' },
        { value: 'aprovado',  label: 'Aprovado' },
        { value: 'fechado',   label: 'Convertido em Venda' },
        { value: 'rejeitado', label: 'Rejeitado' },
        { value: 'expirado',  label: 'Expirado' }
      ]
    },
    {
      key: 'periodo',
      label: 'Período',
      type: 'select' as const,
      options: [
        { value: '',            label: 'Todos' },
        { value: 'hoje',        label: 'Hoje' },
        { value: 'semana',      label: 'Esta semana' },
        { value: 'mes',         label: 'Este mês' },
        { value: 'mes_passado', label: 'Mês passado' }
      ]
    }
  ];
</script>

<svelte:head>
  <title>Orçamentos | VTUR</title>
</svelte:head>

<PageHeader
  title="Orçamentos"
  subtitle="Acompanhe o pipeline de propostas com uma leitura mais limpa, profissional e orientada à decisão."
  color="orcamentos"
  breadcrumbs={[{ label: 'Orçamentos' }]}
  actions={[
    {
      label: 'Novo Orçamento',
      href: '/orcamentos/novo',
      variant: 'primary',
      icon: Plus
    }
  ]}
/>

<div class="mb-6 flex flex-wrap items-center justify-between gap-3">
  <div>
    <p class="text-xs font-semibold uppercase tracking-[0.14em] text-slate-400">Painel executivo</p>
    <p class="text-sm text-slate-500">Resumo do pipeline com foco em follow-up, vencimento e conversão em venda.</p>
  </div>
</div>

{#if errorMessage}
  <div role="alert" class="mb-6 rounded-vtur-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
    {errorMessage}
  </div>
{/if}

<div class="vtur-kpi-grid mb-6">
  <div class="vtur-kpi-card">
    <div class="flex h-10 w-10 items-center justify-center rounded-xl bg-blue-50 text-blue-500"><FileText size={20} /></div>
    <div>
      <p class="text-sm font-medium text-slate-500">Total</p>
      <p class="text-2xl font-bold text-slate-900">{resumo.total}</p>
    </div>
  </div>
  <div class="vtur-kpi-card">
    <div class="flex h-10 w-10 items-center justify-center rounded-xl bg-sky-50 text-sky-500"><Send size={20} /></div>
    <div>
      <p class="text-sm font-medium text-slate-500">Enviados</p>
      <p class="text-2xl font-bold text-slate-900">{resumo.enviados}</p>
      <p class="mt-0.5 text-xs text-slate-500">Aguardando cliente</p>
    </div>
  </div>
  <div class="vtur-kpi-card">
    <div class="flex h-10 w-10 items-center justify-center rounded-xl bg-amber-50 text-amber-500"><AlertCircle size={20} /></div>
    <div>
      <p class="text-sm font-medium text-slate-500">Sem interação</p>
      <p class="text-2xl font-bold text-slate-900">{resumo.semInteracao}</p>
      <p class="mt-0.5 text-xs text-slate-500">Prioridade máxima</p>
    </div>
  </div>
  <div class="vtur-kpi-card">
    <div class="flex h-10 w-10 items-center justify-center rounded-xl bg-green-50 text-green-500"><ShoppingCart size={20} /></div>
    <div>
      <p class="text-sm font-medium text-slate-500">Convertidos</p>
      <p class="text-2xl font-bold text-slate-900">{resumo.convertidos}</p>
      <p class="mt-0.5 text-xs text-slate-500">{resumo.taxaConversao}% conversão</p>
    </div>
  </div>
</div>

<div class="mb-4 flex flex-wrap items-center gap-3">
  <Button
    variant={somenteCriticos ? 'selected' : 'secondary'}
    size="sm"
    class_name="rounded-full"
    on:click={() => {
      somenteCriticos = !somenteCriticos;
      if (somenteCriticos) somenteProntosVenda = false;
    }}
  >
    {#if somenteCriticos}
      Mostrando críticos ({criticosCount})
    {:else}
      Ver apenas críticos ({criticosCount})
    {/if}
  </Button>

  <Button
    variant={somenteProntosVenda ? 'selected' : 'secondary'}
    size="sm"
    color="green"
    class_name="rounded-full"
    on:click={() => {
      somenteProntosVenda = !somenteProntosVenda;
      if (somenteProntosVenda) somenteCriticos = false;
    }}
  >
    {#if somenteProntosVenda}
      Mostrando prontos para venda ({prontosVendaCount})
    {:else}
      Ver prontos para venda ({prontosVendaCount})
    {/if}
  </Button>

  {#if somenteCriticos || somenteProntosVenda}
    <Button
      variant="secondary"
      size="sm"
      class_name="rounded-full"
      on:click={() => {
        somenteCriticos = false;
        somenteProntosVenda = false;
      }}
    >
      Limpar filtro rápido
    </Button>
  {/if}
</div>

<div class="mb-6 rounded-vtur-xl border border-amber-200 bg-amber-50 px-5 py-4 text-sm text-amber-800 shadow-vtur-lg">
  A lista exibe os orçamentos <strong>mais recentes primeiro</strong>. Use os filtros rápidos para ver apenas críticos ou prontos para venda.
</div>

<DataTable
  {columns}
  data={orcamentosVisiveis}
  color="orcamentos"
  {loading}
  title="Lista de Orçamentos"
  {filters}
  searchable={true}
  filterable={true}
  exportable={true}
  extraSearchKeys={['destino', 'status_negociacao', 'cliente_email']}
  onRowClick={handleRowClick}
  onExport={handleExport}
  onFilterChange={handleFiltroChange}
  emptyMessage="Nenhum orçamento encontrado para o escopo atual"
/>
