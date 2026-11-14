<script lang="ts">
  import { page } from '$app/stores';
  import { goto } from '$app/navigation';
  import { browser } from '$app/environment';
  import { onDestroy, onMount } from 'svelte';
  import PageHeader from '$lib/components/ui/PageHeader.svelte';
  import Card from '$lib/components/ui/Card.svelte';
  import Button from '$lib/components/ui/Button.svelte';
  import LoadingState from '$lib/components/ui/LoadingState.svelte';
  import { FieldInput } from '$lib/components/ui';
  import KPICard from '$lib/components/kpis/KPICard.svelte';
  import {
    ArrowLeft,
    Edit,
    Send,
    CheckCircle,
    XCircle,
    FileText,
    Printer,
    Trash2,
    ShoppingCart,
    User,
    Mail,
    Phone,
    MessageCircle,
    Calendar,
    Clock,
    History,
    TrendingUp,
    Package,
    AlertCircle
  } from '$lib/icons';
  import { toast } from '$lib/stores/ui';
  import { compareISODate, todayISODateLocal } from '$lib/date';
  import {
    formatDate as formatDateValue,
    formatDateTime as formatDateTimeValue
  } from '$lib/utils/formatters';
  import { toUserMessage } from '$lib/utils/errors';
  import { ensureServerSessionCookie } from '$lib/services/session';
  import { resumoDetalhes } from '$lib/quote/detalhesItem';

  import { confirmAction } from '$lib/stores/confirm';
  import { ApiError, apiDelete, apiFetch, apiPatch, isCanceledApiError } from '$lib/services/api';
  const orcamentoId = $page.params.id;
  const STATUS_SEM_ALERTA_EXPIRADO = new Set(['aprovado', 'rejeitado', 'fechado']);
  const STATUS_COM_ACOES_DECISAO = new Set(['pendente', 'enviado', 'novo']);
  let previewingPdf = false;
  let ModalInteracaoQuoteComponent:
    | typeof import('$lib/components/modais/ModalInteracaoQuote.svelte').default
    | null = null;
  let interacaoModalLoadPromise: Promise<boolean> | null = null;

  interface OrcamentoInteracao {
    tipo?: string | null;
    created_at?: string | null;
    observacoes?: string | null;
    status?: string | null;
  }

  interface OrcamentoItemResumo {
    id?: string | null;
    title?: string | null;
    descricao?: string | null;
    city_name?: string | null;
    cidade?: string | null;
    item_type?: string | null;
    quantity?: number | null;
    quantidade?: number | null;
    unit_price?: number | null;
    valor_unitario?: number | null;
    total_amount?: number | null;
    valor_total?: number | null;
    segments?: OrcamentoItemSegmento[] | null;
    raw?: Record<string, unknown> | null;
    start_date?: string | null;
    end_date?: string | null;
  }

  interface OrcamentoItemSegmento {
    id?: string | null;
    segment_type?: string | null;
    data?: Record<string, unknown> | null;
    order_index?: number | null;
  }

  interface OrcamentoClienteResumo {
    nome?: string | null;
    email?: string | null;
    telefone?: string | null;
  }

  interface OrcamentoDetalhe {
    codigo?: string | null;
    status?: string | null;
    status_negociacao?: string | null;
    valid_until?: string | null;
    data_validade?: string | null;
    total?: number | null;
    currency?: string | null;
    created_at?: string | null;
    updated_at?: string | null;
    notes?: string | null;
    observacoes?: string | null;
    cliente?: OrcamentoClienteResumo | string | null;
    cliente_email?: string | null;
    itens?: OrcamentoItemResumo[] | null;
    [key: string]: unknown;
  }

  // ── Desconto para exportação PDF (somente aplicado no PDF, não salvo no BD)
  let exportDesconto = '';
  let exportShowBudgetItems: 'sim' | 'nao' = 'nao';
  let exportShowBudgetDetails: 'sim' | 'nao' = 'sim';
  let exportShowItemValues: 'sim' | 'nao' = 'nao';
  $: exportDescontoNum = (() => {
    const v = String(exportDesconto).replace(',', '.').trim();
    const n = parseFloat(v);
    return Number.isFinite(n) && n > 0 ? n : 0;
  })();

  let orcamento: OrcamentoDetalhe | null = null;
  let interacoes: OrcamentoInteracao[] = [];
  let loading = true;
  let error: string | null = null;
  let processando = false;
  let showInteracaoModal = false;
  let loadingInteracoes = false;
  let detailController: AbortController | null = null;
  let interacoesController: AbortController | null = null;
  let loadSeq = 0;
  let destroyed = false;

  onMount(async () => {
    const seq = ++loadSeq;
    detailController?.abort();
    interacoesController?.abort();
    detailController = new AbortController();
    interacoesController = new AbortController();
    loading = true;
    error = null;
    try {
      await ensureServerSessionCookie();
      // Ambas as chamadas usam apenas orcamentoId (da URL) — são independentes entre si.
      // O controle de loading fica no onMount para garantir que sempre seja liberado.
      await Promise.all([
        carregarOrcamento(seq, detailController.signal),
        carregarInteracoes({ seq, signal: interacoesController.signal })
      ]);
    } finally {
      if (seq === loadSeq && !destroyed) loading = false;
    }
  });

  async function ensureInteracaoModalLoaded() {
    if (ModalInteracaoQuoteComponent) return true;
    if (interacaoModalLoadPromise) return interacaoModalLoadPromise;

    interacaoModalLoadPromise = import('$lib/components/modais/ModalInteracaoQuote.svelte')
      .then((module) => {
        ModalInteracaoQuoteComponent = module.default;
        return true;
      })
      .catch((err) => {
        toast.error(toUserMessage(err, 'Erro ao carregar interação do orçamento.'));
        return false;
      })
      .finally(() => {
        interacaoModalLoadPromise = null;
      });

    return interacaoModalLoadPromise;
  }

  async function openInteracaoModal() {
    showInteracaoModal = await ensureInteracaoModalLoaded();
  }

  async function carregarOrcamento(seq = loadSeq, signal?: AbortSignal) {
    try {
      const data = await apiFetch<OrcamentoDetalhe>(`/api/v1/orcamentos/${orcamentoId}`, {
        redirectOnUnauthorized: false,
        redirectOnForbidden: false,
        signal
      });
      if (seq !== loadSeq || destroyed) return;
      orcamento = data;
    } catch (err: unknown) {
      if (isCanceledApiError(err)) return;
      if (seq !== loadSeq || destroyed) return;
      if (err instanceof ApiError && err.status === 401) {
        toast.error('Sessão expirada. Faça login novamente para continuar.');
        const next = `${$page.url.pathname}${$page.url.search}`;
        await goto(`/auth/login?session_expired=1&next=${encodeURIComponent(next)}`);
        return;
      }
      if (err instanceof ApiError && err.status === 403) {
        error = 'Você não tem permissão para acessar este orçamento';
        await goto('/orcamentos');
        return;
      }
      if (err instanceof ApiError && err.status === 404) {
        error = 'Orçamento não encontrado';
        return;
      }
      const message = toUserMessage(err, 'erro desconhecido');
      error = `Erro ao carregar dados do orçamento: ${message}`;
      toast.error('Erro ao carregar orçamento');
    }
  }

  async function carregarInteracoes(options: { seq?: number; signal?: AbortSignal } = {}) {
    const seq = options.seq ?? loadSeq;
    let signal = options.signal;
    if (!signal) {
      interacoesController?.abort();
      interacoesController = new AbortController();
      signal = interacoesController.signal;
    }
    loadingInteracoes = true;
    try {
      const data = await apiFetch<{ interacoes?: OrcamentoInteracao[] }>(
        '/api/v1/orcamentos/interacao',
        {
          query: { quote_id: orcamentoId },
          redirectOnUnauthorized: false,
          signal
        }
      );
      if (seq !== loadSeq || destroyed) return;
      interacoes = data.interacoes || [];
    } catch (err) {
      if (isCanceledApiError(err)) return;
      if (err instanceof ApiError && err.status === 401) return;
    } finally {
      if (seq === loadSeq && !destroyed) loadingInteracoes = false;
    }
  }

  async function atualizarStatus(novoStatus: string, redirectToVenda = false) {
    processando = true;
    try {
      await apiPatch(`/api/v1/orcamentos/${orcamentoId}`, {
        status: novoStatus,
        status_negociacao: novoStatus
      });

      if (orcamento) {
        orcamento.status = novoStatus;
        orcamento.status_negociacao = novoStatus;
      }
      toast.success(`Orçamento ${getStatusLabel(novoStatus).toLowerCase()} com sucesso!`);

      await carregarInteracoes();

      if (redirectToVenda) {
        goto(`/vendas/nova?orcamento=${orcamentoId}`);
      }
    } catch (err) {
      toast.error('Erro ao atualizar status');
    } finally {
      processando = false;
    }
  }

  onDestroy(() => {
    destroyed = true;
    loadSeq += 1;
    detailController?.abort();
    interacoesController?.abort();
  });

  async function handleAprovar() {
    if (!(await confirmAction('Confirmar aprovação deste orçamento?'))) return;
    const redirectToVenda = await confirmAction(
      'Deseja seguir agora para criar a venda a partir deste orçamento?'
    );
    atualizarStatus('aprovado', redirectToVenda);
  }

  async function handleRejeitar() {
    if (await confirmAction('Confirmar rejeição deste orçamento?')) {
      atualizarStatus('rejeitado');
    }
  }

  function handleEnviar() {
    atualizarStatus('enviado');
  }

  async function handleImprimir() {
    if (!browser) return;
    if (!orcamentoId) {
      toast.error('Orçamento inválido para gerar a prévia do PDF.');
      return;
    }
    previewingPdf = true;
    try {
      const [{ createBrowserDataClient }, { openQuotePreview }] = await Promise.all([
        import('$lib/db/browserData'),
        import('$lib/quote/exportQuotePdfClient')
      ]);
      const dadosBrowser = createBrowserDataClient();
      await openQuotePreview({
        quoteId: orcamentoId,
        dados: dadosBrowser,
        showBudgetItems: exportShowBudgetItems === 'sim',
        showBudgetDetails: exportShowBudgetDetails === 'sim',
        showItemValues: exportShowItemValues === 'sim',
        discount: exportDescontoNum
      });
    } catch (err) {
      toast.error(toUserMessage(err, 'Erro ao gerar prévia do PDF.'));
    } finally {
      previewingPdf = false;
    }
  }

  async function handleExcluir() {
    if (
      !(await confirmAction(
        'Tem certeza que deseja excluir este orçamento? Esta ação não pode ser desfeita.'
      ))
    )
      return;

    try {
      await apiDelete(`/api/v1/orcamentos/${orcamentoId}`);

      toast.success('Orçamento excluído');
      goto('/orcamentos');
    } catch (err) {
      toast.error('Erro ao excluir orçamento');
    }
  }

  const CURRENCY_FORMATTERS = new Map<string, Intl.NumberFormat>();

  function getCurrencyFormatter(currency: string) {
    const cached = CURRENCY_FORMATTERS.get(currency);
    if (cached) return cached;
    const formatter = new Intl.NumberFormat('pt-BR', {
      style: 'currency',
      currency
    });
    CURRENCY_FORMATTERS.set(currency, formatter);
    return formatter;
  }

  function formatCurrency(value: number): string {
    return getCurrencyFormatter(orcamento?.currency || 'BRL').format(value || 0);
  }

  function formatDate(dateString: string | null): string {
    return formatDateValue(dateString);
  }

  function formatDateTime(dateString: string | null): string {
    return formatDateTimeValue(dateString);
  }

  function getDiasSemInteracao(dateString: string | null) {
    if (!dateString) return null;
    const data = new Date(dateString);
    return Math.ceil((Date.now() - data.getTime()) / (1000 * 60 * 60 * 24));
  }

  function normalizeLookupText(value: string) {
    return (value || '')
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
      .toLowerCase()
      .trim();
  }

  function isCircuitItem(item: OrcamentoItemResumo) {
    return normalizeLookupText(String(item.item_type || '')).replace(/[^a-z]/g, '') === 'circuito';
  }

  function getCircuitDays(item: OrcamentoItemResumo) {
    return (item.segments || [])
      .filter((seg) => String(seg.segment_type || '').toLowerCase() === 'circuit_day')
      .sort((a, b) => (a.order_index ?? 0) - (b.order_index ?? 0));
  }

  function getStatusColor(status: string): string {
    switch (String(status || '').toLowerCase()) {
      case 'aprovado':
        return 'bg-green-100 text-green-700 border-green-200';
      case 'pendente':
        return 'bg-amber-100 text-amber-700 border-amber-200';
      case 'enviado':
        return 'bg-blue-100 text-blue-700 border-blue-200';
      case 'rejeitado':
        return 'bg-red-100 text-red-700 border-red-200';
      case 'expirado':
        return 'bg-slate-100 text-slate-600 border-slate-200';
      case 'novo':
        return 'bg-purple-100 text-purple-700 border-purple-200';
      case 'fechado':
        return 'bg-emerald-100 text-emerald-700 border-emerald-200';
      default:
        return 'bg-slate-100 text-slate-700 border-slate-200';
    }
  }

  function getStatusLabel(status: string): string {
    const key = String(status || '').toLowerCase();
    const labels: Record<string, string> = {
      aprovado: 'Aprovado',
      pendente: 'Pendente',
      enviado: 'Enviado',
      rejeitado: 'Rejeitado',
      expirado: 'Expirado',
      novo: 'Novo',
      fechado: 'Convertido em Venda'
    };
    return labels[key] || status;
  }

  function getTipoInteracaoIcon(tipo: string) {
    switch (tipo) {
      case 'ligacao':
        return Phone;
      case 'email':
        return Mail;
      case 'whatsapp':
        return MessageCircle;
      case 'reuniao':
        return Calendar;
      default:
        return MessageCircle;
    }
  }

  function getTipoInteracaoLabel(tipo: string): string {
    const labels: Record<string, string> = {
      ligacao: 'Ligação',
      email: 'Email',
      whatsapp: 'WhatsApp',
      reuniao: 'Reunião',
      status: 'Mudança de Status',
      outro: 'Outro'
    };
    return labels[tipo] || tipo;
  }

  $: valorTotal =
    orcamento?.itens?.reduce((acc: number, item) => acc + Number(item.total_amount || 0), 0) || 0;
  $: quantidadeItens = orcamento?.itens?.length || 0;
  $: statusAtual = String(orcamento?.status || '').toLowerCase();
  $: podeCriarVenda = statusAtual === 'aprovado';
  $: orcamentoConvertido = statusAtual === 'fechado';
  $: isExpirado = orcamento?.valid_until
    ? compareISODate(orcamento.valid_until, todayISODateLocal()) < 0
    : false;
  $: clienteObj =
    orcamento?.cliente && typeof orcamento.cliente === 'object' ? orcamento.cliente : null;
  $: clienteNome =
    clienteObj?.nome ||
    (typeof orcamento?.cliente === 'string' ? orcamento.cliente : '') ||
    'Cliente';
  $: clienteEmail = clienteObj?.email || orcamento?.cliente_email || '';
  $: clienteTelefone = clienteObj?.telefone || '';
  $: dataCriacaoOrcamento = orcamento?.created_at || null;
  $: dataValidadeOrcamento = orcamento?.valid_until || orcamento?.data_validade || null;
  $: dataAtualizacaoOrcamento = orcamento?.updated_at || orcamento?.created_at || null;
  $: ultimaInteracao = interacoes.length > 0 ? interacoes[0] : null;
  $: diasSemInteracao = getDiasSemInteracao(ultimaInteracao?.created_at || null);
  $: cardProximoPassoClasse = orcamentoConvertido
    ? 'border-emerald-200 bg-emerald-50 text-emerald-700'
    : podeCriarVenda
      ? 'border-green-200 bg-green-50 text-green-700'
      : !ultimaInteracao
        ? 'border-red-200 bg-red-50 text-red-700'
        : (diasSemInteracao || 0) >= 7
          ? 'border-amber-200 bg-amber-50 text-amber-700'
          : 'border-blue-200 bg-blue-50 text-blue-700';
</script>

<svelte:head>
  <title>{orcamento ? `Orçamento ${orcamento.codigo}` : 'Orçamento'} | VTUR</title>
</svelte:head>

{#if loading && !orcamento}
  <div class="py-12">
    <LoadingState compact={true} />
  </div>
{:else if error}
  <div class="py-12 text-center">
    <p role="alert" class="mb-4 text-red-600">{error}</p>
    <Button variant="secondary" on:click={() => goto('/orcamentos')}>
      <ArrowLeft size={16} class="mr-2" />
      Voltar para Orçamentos
    </Button>
  </div>
{:else if !orcamento}
  <div class="py-12 text-center">
    <p class="mb-4 text-slate-500">Orçamento não encontrado ou sem permissão de acesso.</p>
    <Button variant="secondary" on:click={() => goto('/orcamentos')}>
      <ArrowLeft size={16} class="mr-2" />
      Voltar para Orçamentos
    </Button>
  </div>
{:else if orcamento}
  <PageHeader
    title="Orçamento {orcamento.codigo || ''}"
    subtitle="Criado em {formatDate(dataCriacaoOrcamento)} • Válido até {formatDate(
      dataValidadeOrcamento
    )}"
    color="clientes"
    breadcrumbs={[{ label: 'Orçamentos', href: '/orcamentos' }, { label: orcamento.codigo || '' }]}
    actions={[
      {
        label: 'Editar',
        href: `/orcamentos/${orcamentoId}/editar`,
        variant: 'primary',
        icon: Edit
      },
      {
        label: 'Voltar',
        href: '/orcamentos',
        variant: 'secondary'
      },
      {
        label: 'Excluir',
        onClick: handleExcluir,
        variant: 'danger',
        icon: Trash2
      }
    ]}
  />

  <div class="mb-6 flex flex-wrap items-center justify-between gap-3">
    <div>
      <p class="text-xs font-semibold tracking-[0.14em] text-slate-400 uppercase">
        Painel executivo
      </p>
      <p class="text-sm text-slate-500">
        Resumo do orçamento com foco em status comercial, follow-up, validade e conversão em venda.
      </p>
    </div>
  </div>

  <div class="vtur-kpi-grid mb-6">
    <Button
      variant="unstyled"
      class_name="vtur-kpi-card text-left hover:shadow-lg transition-all duration-200"
      on:click={() => goto('/orcamentos')}
    >
      <div
        class={`flex h-10 w-10 items-center justify-center rounded-xl ${statusAtual === 'aprovado' ? 'bg-green-50 text-green-500' : statusAtual === 'rejeitado' ? 'bg-red-50 text-red-500' : statusAtual === 'enviado' ? 'bg-blue-50 text-blue-500' : 'bg-amber-50 text-amber-500'}`}
      >
        <FileText size={20} />
      </div>
      <div>
        <p class="text-sm font-medium text-slate-500">Status comercial</p>
        <p class="text-2xl font-bold text-slate-900">
          {getStatusLabel(orcamento.status || '')}
        </p>
      </div>
    </Button>

    <Button
      variant="unstyled"
      class_name="vtur-kpi-card text-left hover:shadow-lg transition-all duration-200"
      on:click={openInteracaoModal}
    >
      <div
        class={`flex h-10 w-10 items-center justify-center rounded-xl ${!ultimaInteracao ? 'bg-red-50 text-red-500' : (diasSemInteracao || 0) >= 7 ? 'bg-amber-50 text-amber-500' : 'bg-blue-50 text-blue-500'}`}
      >
        <Clock size={20} />
      </div>
      <div>
        <p class="text-sm font-medium text-slate-500">Última interação</p>
        <p class="text-2xl font-bold text-slate-900">
          {!ultimaInteracao ? 'Sem registro' : `${diasSemInteracao || 0}d`}
        </p>
      </div>
    </Button>

    <Button
      variant="unstyled"
      class_name="vtur-kpi-card text-left hover:shadow-lg transition-all duration-200"
      on:click={() => goto('/orcamentos')}
    >
      <div
        class={`flex h-10 w-10 items-center justify-center rounded-xl ${isExpirado ? 'bg-red-50 text-red-500' : 'bg-amber-50 text-amber-500'}`}
      >
        <AlertCircle size={20} />
      </div>
      <div>
        <p class="text-sm font-medium text-slate-500">Vencimento</p>
        <p class="text-2xl font-bold text-slate-900">
          {formatDate(dataValidadeOrcamento)}
        </p>
      </div>
    </Button>

    <Button
      variant="unstyled"
      class_name="vtur-kpi-card text-left hover:shadow-lg transition-all duration-200"
      on:click={() =>
        podeCriarVenda ? goto(`/vendas/nova?orcamento=${orcamentoId}`) : goto('/orcamentos')}
    >
      <div
        class={`flex h-10 w-10 items-center justify-center rounded-xl ${orcamentoConvertido ? 'bg-green-50 text-green-500' : podeCriarVenda ? 'bg-green-50 text-green-500' : 'bg-slate-100 text-slate-500'}`}
      >
        <ShoppingCart size={20} />
      </div>
      <div>
        <p class="text-sm font-medium text-slate-500">Próximo passo</p>
        <p class="text-2xl font-bold text-slate-900">
          {orcamentoConvertido ? 'Convertido' : podeCriarVenda ? 'Criar venda' : 'Acompanhar'}
        </p>
      </div>
    </Button>
  </div>

  <div class="mb-6 rounded-lg border p-4 {getStatusColor(orcamento.status || '')}">
    <div class="flex flex-wrap items-center justify-between gap-4">
      <div class="flex flex-wrap items-center gap-3">
        <span class="text-lg font-semibold">
          Status: {getStatusLabel(orcamento.status || '')}
        </span>
        {#if isExpirado && !STATUS_SEM_ALERTA_EXPIRADO.has(statusAtual)}
          <span class="rounded-full bg-red-100 px-2 py-1 text-xs font-medium text-red-700">
            EXPIRADO
          </span>
        {/if}
        {#if orcamentoConvertido}
          <span class="rounded-full bg-emerald-200 px-2 py-1 text-xs font-medium text-emerald-800">
            CONVERTIDO
          </span>
        {/if}
      </div>
      <div class="text-sm opacity-75">
        Última atualização: {formatDateTime(dataAtualizacaoOrcamento)}
      </div>
    </div>
  </div>

  <div class="mb-6 rounded-lg border px-4 py-3 {cardProximoPassoClasse}">
    {#if orcamentoConvertido}
      <p class="text-sm font-semibold">Próximo passo: acompanhar a venda</p>
      <p class="mt-1 text-sm">
        Este orçamento já foi convertido. Use esta tela como histórico comercial.
      </p>
    {:else if podeCriarVenda}
      <div class="flex flex-wrap items-start justify-between gap-4">
        <div>
          <p class="text-sm font-semibold">Próximo passo: criar a venda</p>
          <p class="mt-1 text-sm">
            O orçamento já está aprovado e pronto para conversão operacional.
          </p>
        </div>
        <Button
          variant="secondary"
          on:click={() => goto(`/vendas/nova?orcamento=${orcamentoId}`)}
          class_name="shrink-0 justify-center"
        >
          Criar venda agora
        </Button>
      </div>
    {:else if !ultimaInteracao}
      <div class="flex flex-wrap items-start justify-between gap-4">
        <div>
          <p class="text-sm font-semibold">Próximo passo: registrar o primeiro contato</p>
          <p class="mt-1 text-sm">
            Este orçamento ainda não tem interação registrada e entrou na fila crítica de follow-up.
          </p>
        </div>
        <Button
          variant="secondary"
          on:click={openInteracaoModal}
          class_name="shrink-0 justify-center"
        >
          Registrar interação
        </Button>
      </div>
    {:else if (diasSemInteracao || 0) >= 7}
      <div class="flex flex-wrap items-start justify-between gap-4">
        <div>
          <p class="text-sm font-semibold">Próximo passo: retomar follow-up</p>
          <p class="mt-1 text-sm">
            Faz {diasSemInteracao} dias desde a última interação. Vale reabrir contato agora.
          </p>
        </div>
        <Button
          variant="secondary"
          on:click={openInteracaoModal}
          class_name="shrink-0 justify-center"
        >
          Registrar novo follow-up
        </Button>
      </div>
    {:else}
      <div class="flex flex-wrap items-start justify-between gap-4">
        <div>
          <p class="text-sm font-semibold">Acompanhamento em dia</p>
          <p class="mt-1 text-sm">
            O orçamento está com interação recente. Mantenha o acompanhamento até a definição
            comercial.
          </p>
        </div>
        <Button
          variant="secondary"
          on:click={openInteracaoModal}
          class_name="shrink-0 justify-center"
        >
          Registrar interação
        </Button>
      </div>
    {/if}
  </div>

  <div class="vtur-kpi-grid mb-6">
    <div class="vtur-kpi-card">
      <div class="flex h-10 w-10 items-center justify-center rounded-xl bg-blue-50 text-blue-500">
        <TrendingUp size={20} />
      </div>
      <div>
        <p class="text-sm font-medium text-slate-500">Valor Total</p>
        <p class="text-2xl font-bold text-slate-900">
          {formatCurrency(orcamento.total || valorTotal)}
        </p>
      </div>
    </div>
    <div class="vtur-kpi-card">
      <div class="flex h-10 w-10 items-center justify-center rounded-xl bg-blue-50 text-blue-500">
        <Package size={20} />
      </div>
      <div>
        <p class="text-sm font-medium text-slate-500">Itens</p>
        <p class="text-2xl font-bold text-slate-900">{quantidadeItens}</p>
      </div>
    </div>
    <div class="vtur-kpi-card {isExpirado ? 'border-t-amber-400' : 'border-t-blue-400'}">
      <div
        class="flex h-10 w-10 items-center justify-center rounded-xl {isExpirado
          ? 'bg-amber-50 text-amber-500'
          : 'bg-blue-50 text-blue-500'}"
      >
        <Calendar size={20} />
      </div>
      <div>
        <p class="text-sm font-medium text-slate-500">Validade</p>
        <p class="text-2xl font-bold text-slate-900">
          {formatDate(dataValidadeOrcamento)}
        </p>
      </div>
    </div>
    <div class="vtur-kpi-card">
      <div class="flex h-10 w-10 items-center justify-center rounded-xl bg-blue-50 text-blue-500">
        <FileText size={20} />
      </div>
      <div>
        <p class="text-sm font-medium text-slate-500">Moeda</p>
        <p class="text-2xl font-bold text-slate-900">
          {orcamento.currency === 'USD' ? 'US$' : orcamento.currency === 'EUR' ? '€' : 'R$'}
        </p>
      </div>
    </div>
  </div>

  <div
    class="rounded-vtur-xl shadow-vtur-lg mb-6 border border-slate-200 bg-white px-5 py-4 text-sm text-slate-600"
  >
    Este orçamento reúne <strong>{quantidadeItens}</strong> item(ns), total de
    <strong>{formatCurrency(orcamento.total || valorTotal)}</strong>
    e {#if ultimaInteracao}<strong
        >última interação em {formatDateTime(ultimaInteracao.created_at || null)}</strong
      >{:else}<strong>nenhuma interação registrada</strong>{/if}, facilitando a leitura rápida de
    prioridade comercial.
  </div>

  <div class="grid grid-cols-1 gap-6 lg:grid-cols-3">
    <div class="space-y-6 lg:col-span-2">
      <Card header="Dados do Cliente" color="clientes">
        <div class="grid grid-cols-1 gap-4 md:grid-cols-2">
          <div class="flex items-center gap-3">
            <div class="bg-clientes-100 flex h-10 w-10 items-center justify-center rounded-full">
              <User size={20} class="text-clientes-600" />
            </div>
            <div>
              <p class="text-sm text-slate-500">Cliente</p>
              <p class="font-medium text-slate-900">{clienteNome || 'Não informado'}</p>
            </div>
          </div>
          {#if clienteEmail}
            <div class="flex items-center gap-3">
              <div class="bg-clientes-100 flex h-10 w-10 items-center justify-center rounded-full">
                <Mail size={20} class="text-clientes-600" />
              </div>
              <div>
                <p class="text-sm text-slate-500">Email</p>
                <a
                  href="mailto:{clienteEmail}"
                  class="text-clientes-600 font-medium hover:underline"
                >
                  {clienteEmail}
                </a>
              </div>
            </div>
          {/if}
          {#if clienteTelefone}
            <div class="flex items-center gap-3">
              <div class="bg-clientes-100 flex h-10 w-10 items-center justify-center rounded-full">
                <Phone size={20} class="text-clientes-600" />
              </div>
              <div>
                <p class="text-sm text-slate-500">Telefone</p>
                <p class="font-medium text-slate-900">{clienteTelefone}</p>
              </div>
            </div>
          {/if}
        </div>
      </Card>

      <Card header="Itens do Orçamento" color="clientes">
        <svelte:fragment slot="actions">
          <Button
            href={`/orcamentos/${orcamentoId}/editar`}
            variant="primary"
            size="sm"
            title="Editar orçamento"
          >
            <Edit size={15} class="mr-1.5" />
            Editar orçamento
          </Button>
        </svelte:fragment>
        {#if orcamento.itens && orcamento.itens.length > 0}
          <div class="overflow-x-visible md:overflow-x-auto">
            <table class="table-mobile-cards w-full">
              <thead>
                <tr class="border-b border-slate-200">
                  <th class="px-3 py-3 text-left text-sm font-semibold text-slate-600">Descrição</th
                  >
                  <th class="px-3 py-3 text-center text-sm font-semibold text-slate-600">Tipo</th>
                  <th class="px-3 py-3 text-center text-sm font-semibold text-slate-600">Qtd</th>
                  <th class="px-3 py-3 text-right text-sm font-semibold text-slate-600"
                    >Valor Unit.</th
                  >
                  <th class="px-3 py-3 text-right text-sm font-semibold text-slate-600">Total</th>
                </tr>
              </thead>
              <tbody class="divide-y divide-slate-100">
                {#each orcamento.itens as item}
                  <tr class="hover:bg-slate-50">
                    <td data-label="Descrição" class="px-3 py-3 text-slate-900">
                      <p class="font-medium">
                        {item.title || item.descricao || 'Item'}
                      </p>
                      {#if item.city_name || item.cidade}
                        <p class="text-sm text-slate-500">
                          {item.city_name || item.cidade}
                        </p>
                      {/if}
                      {#if item.start_date || item.end_date}
                        <p class="text-sm text-slate-500">
                          {formatDate(item.start_date || item.end_date || null)}{item.start_date &&
                          item.end_date &&
                          item.end_date !== item.start_date
                            ? ` a ${formatDate(item.end_date)}`
                            : ''}
                        </p>
                      {/if}
                      {#if resumoDetalhes(item).length}
                        <p class="text-sm text-slate-500">{resumoDetalhes(item).join(' · ')}</p>
                      {/if}
                      {#if isCircuitItem(item) && getCircuitDays(item).length > 0}
                        <div class="mt-3 space-y-2">
                          {#each getCircuitDays(item) as seg, segIndex}
                            {@const segData = seg.data || {}}
                            <div class="rounded-lg border border-slate-200 bg-slate-50 p-2.5">
                              <p class="text-xs font-semibold text-slate-700">
                                Dia {Number(segData.dia || segIndex + 1)}
                                {#if segData.titulo}
                                  - {String(segData.titulo)}
                                {/if}
                              </p>
                              {#if segData.descricao}
                                <p class="mt-1 text-xs whitespace-pre-wrap text-slate-600">
                                  {String(segData.descricao)}
                                </p>
                              {/if}
                            </div>
                          {/each}
                        </div>
                      {/if}
                    </td>
                    <td data-label="Tipo" class="px-3 py-3 text-center">
                      <span class="rounded-full bg-slate-100 px-2 py-1 text-xs capitalize">
                        {item.item_type || 'servico'}
                      </span>
                    </td>
                    <td data-label="Qtd" class="px-3 py-3 text-center text-slate-700"
                      >{item.quantity || item.quantidade || 1}</td
                    >
                    <td data-label="Valor Unit." class="px-3 py-3 text-right text-slate-700">
                      {formatCurrency(item.unit_price || item.valor_unitario || 0)}
                    </td>
                    <td data-label="Total" class="px-3 py-3 text-right font-medium text-slate-900">
                      {formatCurrency(item.total_amount || item.valor_total || 0)}
                    </td>
                  </tr>
                {/each}
              </tbody>
              <tfoot>
                <tr class="border-t-2 border-slate-200">
                  <td colspan="4" class="px-3 py-4 text-right font-semibold text-slate-900"
                    >Total do Orçamento:</td
                  >
                  <td class="text-clientes-600 px-3 py-4 text-right text-xl font-bold">
                    {formatCurrency(orcamento.total || valorTotal)}
                  </td>
                </tr>
              </tfoot>
            </table>
          </div>
        {:else}
          <div class="py-8 text-center text-slate-500">
            <FileText size={48} class="mx-auto mb-3 opacity-30" />
            <p>Nenhum item no orçamento</p>
          </div>
        {/if}
      </Card>

      {#if orcamento.notes || orcamento.observacoes}
        <Card header="Observações e Condições" color="clientes">
          <div class="prose prose-slate max-w-none">
            <p class="whitespace-pre-wrap text-slate-700">
              {orcamento.notes || orcamento.observacoes}
            </p>
          </div>
        </Card>
      {/if}
    </div>

    <div class="space-y-6">
      <Card header="Ações" color="clientes">
        <div class="space-y-3">
          {#if statusAtual === 'pendente' || statusAtual === 'novo'}
            <Button
              variant="primary"
              color="clientes"
              on:click={handleEnviar}
              loading={processando}
              class_name="w-full justify-center"
            >
              <Send size={16} class="mr-2" />
              Enviar ao Cliente
            </Button>
          {/if}

          {#if STATUS_COM_ACOES_DECISAO.has(statusAtual)}
            <div class="grid grid-cols-2 gap-3">
              <Button
                variant="primary"
                color="vendas"
                on:click={handleAprovar}
                loading={processando}
                class_name="w-full justify-center"
              >
                <CheckCircle size={16} class="mr-2" />
                Aprovar
              </Button>

              <Button
                variant="danger"
                on:click={handleRejeitar}
                loading={processando}
                class_name="w-full justify-center"
              >
                <XCircle size={16} class="mr-2" />
                Rejeitar
              </Button>
            </div>
          {/if}

          {#if podeCriarVenda}
            <Button
              variant="primary"
              color="vendas"
              on:click={() => goto(`/vendas/nova?orcamento=${orcamentoId}`)}
              class_name="w-full justify-center"
            >
              <ShoppingCart size={16} class="mr-2" />
              Criar Venda
            </Button>
          {/if}

          {#if orcamentoConvertido}
            <div
              class="rounded-lg border border-emerald-200 bg-emerald-50 px-3 py-2 text-sm text-emerald-700"
            >
              Este orçamento já foi convertido em venda.
            </div>
          {/if}

          <Button
            variant="secondary"
            color="clientes"
            on:click={openInteracaoModal}
            class_name="w-full justify-center"
          >
            <MessageCircle size={16} class="mr-2" />
            Registrar Interação
          </Button>

          <div class="space-y-3 rounded-xl border border-slate-200 bg-slate-50 p-3">
            <div>
              <p class="text-sm font-semibold text-slate-900">Opções do PDF</p>
              <p class="text-xs text-slate-500">
                Escolha quais seções aparecem na saída do orçamento.
              </p>
            </div>

            <FieldInput
              money
              label={`Desconto no PDF (${orcamento.currency || 'BRL'})`}
              type="number"
              min="0"
              step="0.01"
              placeholder="0,00"
              bind:value={exportDesconto}
              helper="Aplicado apenas no PDF exportado, não altera o orçamento."
            />

            <div>
              <label
                for="export-show-budget-items"
                class="mb-1 block text-sm font-medium text-slate-700"
              >
                Mostrar Itens do orçamento?
              </label>
              <select
                id="export-show-budget-items"
                class="focus:border-clientes-400 focus:ring-clientes-100 w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-700 focus:ring-2 focus:outline-hidden"
                bind:value={exportShowBudgetItems}
              >
                <option value="sim">Sim</option>
                <option value="nao">Não</option>
              </select>
            </div>

            <div>
              <label
                for="export-show-budget-details"
                class="mb-1 block text-sm font-medium text-slate-700"
              >
                Mostrar Detalhes do orçamento?
              </label>
              <select
                id="export-show-budget-details"
                class="focus:border-clientes-400 focus:ring-clientes-100 w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-700 focus:ring-2 focus:outline-hidden"
                bind:value={exportShowBudgetDetails}
              >
                <option value="sim">Sim</option>
                <option value="nao">Não</option>
              </select>
            </div>

            <div>
              <label
                for="export-show-item-values"
                class="mb-1 block text-sm font-medium text-slate-700"
              >
                Mostrar preços por produto?
              </label>
              <select
                id="export-show-item-values"
                class="focus:border-clientes-400 focus:ring-clientes-100 w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-700 focus:ring-2 focus:outline-hidden"
                bind:value={exportShowItemValues}
              >
                <option value="sim">Sim</option>
                <option value="nao">Não</option>
              </select>
            </div>

            <Button
              variant="secondary"
              on:click={handleImprimir}
              loading={previewingPdf}
              class_name="w-full justify-center"
            >
              <Printer size={16} class="mr-2" />
              {previewingPdf ? 'Gerando...' : 'Visualizar PDF'}
            </Button>
          </div>
          <!-- Editar e Excluir ficam no cabeçalho da página, junto com Voltar,
               em vez de duplicados aqui embaixo. -->
        </div>
      </Card>

      <Card header="Histórico de Interações" color="clientes">
        {#if loadingInteracoes}
          <LoadingState compact={true} />
        {:else if interacoes.length === 0}
          <div class="py-6 text-center text-slate-500">
            <History size={32} class="mx-auto mb-2 opacity-30" />
            <p class="text-sm">Nenhuma interação registrada</p>
            <Button
              variant="unstyled"
              on:click={openInteracaoModal}
              class_name="mt-2 text-sm text-clientes-600 hover:underline"
            >
              Registrar primeira interação
            </Button>
          </div>
        {:else}
          <div class="max-h-96 space-y-3 overflow-y-auto">
            {#each interacoes as interacao}
              <div class="rounded-lg bg-slate-50 p-3">
                <div class="flex items-start gap-3">
                  <div
                    class="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-white"
                  >
                    <svelte:component
                      this={getTipoInteracaoIcon(interacao.tipo || '')}
                      size={14}
                      class="text-clientes-600"
                    />
                  </div>
                  <div class="min-w-0 flex-1">
                    <div class="flex items-center justify-between gap-2">
                      <span class="text-sm font-medium text-slate-900">
                        {getTipoInteracaoLabel(interacao.tipo || '')}
                      </span>
                      <span class="text-xs text-slate-500">
                        {formatDateTime(interacao.created_at || null)}
                      </span>
                    </div>
                    <p class="mt-1 text-sm text-slate-700">
                      {interacao.observacoes}
                    </p>
                    {#if interacao.status}
                      <span
                        class="mt-2 inline-block rounded-full px-2 py-0.5 text-xs {getStatusColor(
                          interacao.status
                        )}"
                      >
                        Status: {getStatusLabel(interacao.status)}
                      </span>
                    {/if}
                  </div>
                </div>
              </div>
            {/each}
          </div>
        {/if}
      </Card>
    </div>
  </div>

  {#if ModalInteracaoQuoteComponent}
    <svelte:component
      this={ModalInteracaoQuoteComponent}
      bind:open={showInteracaoModal}
      {orcamentoId}
      {clienteNome}
      onClose={() => (showInteracaoModal = false)}
      onSave={carregarInteracoes}
    />
  {/if}
{/if}
