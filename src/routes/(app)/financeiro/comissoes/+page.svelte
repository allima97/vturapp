<script lang="ts">
  import { onDestroy, onMount } from 'svelte';
  import { goto } from '$app/navigation';
  import PageHeader from '$lib/components/ui/PageHeader.svelte';
  import Card from '$lib/components/ui/Card.svelte';
  import Button from '$lib/components/ui/Button.svelte';
  import Badge from '$lib/components/ui/Badge.svelte';
  import {
    FieldInput,
    FieldSelect,
    FieldTextarea,
    LoadingState,
    BottomSheet
  } from '$lib/components/ui';
  import Dialog from '$lib/components/ui/Dialog.svelte';
  import DataTable from '$lib/components/ui/DataTable.svelte';
  import KPICard from '$lib/components/kpis/KPICard.svelte';
  import KPIGrid from '$lib/components/kpis/KPIGrid.svelte';
  import {
    DollarSign,
    Users,
    CheckCircle,
    Clock,
    Download,
    Settings,
    FileText,
    AlertCircle,
    Wallet,
    TrendingUp,
    SlidersHorizontal
  } from '$lib/icons';
  import { toast } from '$lib/stores/ui';
  import { permissoes } from '$lib/stores/permissoes';
  import { monthRangeFromKey, todayISODateLocal } from '$lib/date';
  import { toUserMessage } from '$lib/utils/errors';
  import { formatDate } from '$lib/utils/formatters';
  import { apiFetch, apiGet, apiPost, apiPut, isCanceledApiError } from '$lib/services/api';

  interface Comissao {
    id: string;
    venda_id: string;
    recibo_id?: string | null;
    numero_venda: string;
    numero_recibo?: string | null;
    numero_reserva?: string | null;
    produto?: string | null;
    vendedor_id: string;
    vendedor: string;
    cliente: string;
    data_venda: string;
    valor_venda: number;
    valor_comissionavel: number;
    percentual_aplicado: number;
    percentual_comissao_geral?: number;
    percentual_seguro?: number;
    regra_nome?: string;
    tipo_pacote?: string | null;
    valor_comissao: number;
    valor_comissao_geral?: number;
    valor_comissao_seguro?: number;
    valor_pago: number;
    valor_taxas?: number;
    status: string;
    data_pagamento?: string | null;
    observacoes_pagamento?: string | null;
  }

  interface ResumoVendedor {
    vendedor_id: string;
    vendedor_nome: string;
    total_vendas: number;
    total_comissao: number;
    total_pago: number;
    total_pendente: number;
  }

  type ComissaoApiItem = Partial<Comissao> & Record<string, unknown>;

  interface ComissoesResponse {
    persistencia_disponivel?: boolean;
    items?: ComissaoApiItem[];
    resumo?: ResumoVendedor[];
  }

  type EmpresaOption = { id: string; nome: string };

  let comissoes: Comissao[] = [];
  let resumoVendedores: ResumoVendedor[] = [];
  let vendedores: {
    id: string;
    vendedor_id?: string;
    vendedor_nome?: string;
    nome?: string;
    nome_completo?: string;
    email?: string;
  }[] = [];
  let empresas: EmpresaOption[] = [];
  let empresaId = '';
  let loading = true;
  let filtroStatus = 'todas';
  let filtroVendedor = '';
  let filtroMes = getCurrentMonthValue();
  let somentePendentes = false;
  let comissaoSelecionada: Comissao | null = null;
  let comissoesSelecionadas: string[] = [];
  let showPagamentoDialog = false;
  let showPagamentoMultiploDialog = false;
  let showDetalhesDialog = false;
  let processando = false;
  let persistenciaDisponivel = true;
  let dataPagamento = todayISODateLocal();
  let observacoesPagamento = '';
  let detalhesDataPagamento = '';
  let detalhesObservacoes = '';
  let salvandoDetalhes = false;
  let showFilterSheet = false;
  let contextRequestSeq = 0;
  let contextAbortController: AbortController | null = null;
  let comissoesRequestSeq = 0;
  let comissoesAbortController: AbortController | null = null;
  let vendedoresRequestSeq = 0;
  let vendedoresAbortController: AbortController | null = null;
  const BRL_CURRENCY_FORMATTER = new Intl.NumberFormat('pt-BR', {
    style: 'currency',
    currency: 'BRL'
  });

  $: statusOptions = [
    { value: 'todas', label: 'Todas' },
    { value: 'pendente', label: 'Pendentes' },
    { value: 'pago', label: 'Pagas' }
  ];

  $: vendedorOptions = [
    ...vendedores.map((vendedor) => ({
      value: vendedor.vendedor_id || vendedor.id,
      label:
        vendedor.vendedor_nome ||
        vendedor.nome_completo ||
        vendedor.nome ||
        vendedor.email ||
        vendedor.id
    }))
  ];

  $: empresaOptions = empresas.map((empresa) => ({
    value: empresa.id,
    label: empresa.nome
  }));

  $: canSelectEmpresa = empresaOptions.length > 1;

  function getCurrentMonthValue() {
    return todayISODateLocal().slice(0, 7);
  }

  function getMonthRange(monthValue: string) {
    const normalized = /^\d{4}-\d{2}$/.test(monthValue) ? monthValue : getCurrentMonthValue();
    const range = monthRangeFromKey(normalized);

    return {
      inicio: range?.inicio || `${normalized}-01`,
      fim: range?.fim || `${normalized}-01`
    };
  }

  onMount(async () => {
    await loadUserContext();
    await Promise.all([loadComissoes(), loadVendedores()]);
  });

  onDestroy(() => {
    contextAbortController?.abort();
    comissoesAbortController?.abort();
    vendedoresAbortController?.abort();
  });

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
    comissoesSelecionadas = [];
    await Promise.all([loadComissoes(), loadVendedores()]);
  }

  async function loadComissoes() {
    const requestSeq = ++comissoesRequestSeq;
    comissoesAbortController?.abort();
    const controller = new AbortController();
    comissoesAbortController = controller;
    loading = true;
    try {
      const query: Record<string, string | undefined> = {};
      if (filtroStatus !== 'todas') query.status = filtroStatus;
      if (filtroVendedor) query.vendedor_id = filtroVendedor;
      if (empresaId) query.empresa_id = empresaId;
      if (filtroMes) {
        const range = getMonthRange(filtroMes);
        query.data_inicio = range.inicio;
        query.data_fim = range.fim;
      }
      const data = await apiGet<ComissoesResponse>(
        '/api/v1/financeiro/comissoes',
        query,
        controller.signal,
        90_000
      );
      if (requestSeq !== comissoesRequestSeq) return;
      persistenciaDisponivel = data.persistencia_disponivel !== false;
      comissoes = (data.items || []).map((item) => ({
        id: String(item.id || ''),
        venda_id: String(item.venda_id || ''),
        recibo_id: item.recibo_id ? String(item.recibo_id) : null,
        numero_venda: String(item.numero_venda || ''),
        numero_recibo: item.numero_recibo ? String(item.numero_recibo) : null,
        numero_reserva: item.numero_reserva ? String(item.numero_reserva) : null,
        produto: item.produto ? String(item.produto) : null,
        vendedor_id: String(item.vendedor_id || ''),
        vendedor: String(item.vendedor || ''),
        cliente: String(item.cliente || ''),
        data_venda: String(item.data_venda || ''),
        regra_nome: item.regra_nome ? String(item.regra_nome) : undefined,
        tipo_pacote: item.tipo_pacote ? String(item.tipo_pacote) : null,
        valor_venda: Number(item.valor_venda || 0),
        valor_comissionavel: Number(item.valor_comissionavel || 0),
        percentual_aplicado: Number(item.percentual_aplicado || 0),
        percentual_comissao_geral: Number(item.percentual_comissao_geral || 0),
        percentual_seguro: Number(item.percentual_seguro || 0),
        valor_comissao: Number(item.valor_comissao || 0),
        valor_comissao_geral: Number(item.valor_comissao_geral || 0),
        valor_comissao_seguro: Number(item.valor_comissao_seguro || 0),
        valor_pago: Number(item.valor_pago || 0),
        valor_taxas: Number(item.valor_taxas || 0),
        status: String(item.status || 'pendente').toLowerCase(),
        data_pagamento: item.data_pagamento || null,
        observacoes_pagamento: item.observacoes_pagamento || null
      }));
      resumoVendedores = data.resumo || [];
    } catch (err) {
      if (isCanceledApiError(err)) return;
      if (requestSeq !== comissoesRequestSeq) return;
      toast.error(toUserMessage(err, 'Erro ao carregar comissões'));
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
      const data = await apiGet<{ items?: typeof vendedores }>(
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

  function formatCurrency(value: number) {
    return BRL_CURRENCY_FORMATTER.format(value || 0);
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

  function getStatusBadge(status: string): {
    label: string;
    color: 'green' | 'red' | 'blue' | 'yellow';
  } {
    const key = (status || '').toLowerCase();
    const color =
      key === 'pago'
        ? 'green'
        : key === 'cancelada'
          ? 'red'
          : key === 'processando'
            ? 'blue'
            : 'yellow';
    const label =
      key === 'pago'
        ? 'Pago'
        : key === 'cancelada'
          ? 'Cancelada'
          : key === 'processando'
            ? 'Processando'
            : 'Pendente';
    return { label, color };
  }

  function getStatusLabel(status: string) {
    return getStatusBadge(status).label;
  }

  function getStatusColor(status: string) {
    return getStatusBadge(status).color;
  }

  const columns = [
    { key: 'numero_recibo', label: 'Recibo', sortable: true, width: '150px' },
    { key: 'numero_venda', label: 'Venda', sortable: true, width: '120px' },
    { key: 'vendedor', label: 'Vendedor', sortable: true },
    { key: 'cliente', label: 'Cliente', sortable: true },
    { key: 'produto', label: 'Produto', sortable: true },
    {
      key: 'data_venda',
      label: 'Data Recibo',
      sortable: true,
      width: '110px',
      formatter: (value: string) => formatDate(value)
    },
    {
      key: 'valor_venda',
      label: 'Valor Recibo',
      sortable: true,
      align: 'right' as const,
      formatter: (value: number) => formatCurrency(value)
    },
    {
      key: 'percentual_aplicado',
      label: '%',
      sortable: true,
      width: '80px',
      align: 'center' as const,
      formatter: (value: number) => `${Number(value || 0).toFixed(2)}%`
    },
    {
      key: 'valor_comissao',
      label: 'Comissão',
      sortable: true,
      align: 'right' as const,
      formatter: (value: number) => formatCurrency(value)
    },
    {
      key: 'valor_pago',
      label: 'Pago',
      sortable: true,
      align: 'right' as const,
      formatter: (value: number) => formatCurrency(value)
    },
    {
      key: 'status',
      label: 'Status',
      sortable: true,
      width: '110px',
      formatter: (value: string) => getStatusLabel(value)
    }
  ];

  function abrirPagamento(comissao: Comissao) {
    if (!persistenciaDisponivel) {
      toast.warning(
        'Persistência de comissão indisponível neste ambiente. Nenhuma baixa pode ser salva agora.'
      );
      return;
    }
    if (comissao.status !== 'pendente') return;
    comissaoSelecionada = comissao;
    dataPagamento = todayISODateLocal();
    observacoesPagamento = '';
    showPagamentoDialog = true;
  }

  function abrirDetalhes(comissao: Comissao) {
    comissaoSelecionada = comissao;
    detalhesDataPagamento = comissao.data_pagamento || todayISODateLocal();
    detalhesObservacoes = comissao.observacoes_pagamento || '';
    showDetalhesDialog = true;
  }

  async function handleAtualizarDetalhesPagamento() {
    if (!comissaoSelecionada || comissaoSelecionada.status !== 'pago') return;
    if (!persistenciaDisponivel) {
      toast.warning(
        'Persistência de comissão indisponível neste ambiente. Nenhuma alteração pode ser salva agora.'
      );
      return;
    }

    salvandoDetalhes = true;
    try {
      const data = await apiPut<{ fallback?: boolean; message?: string }>(
        '/api/v1/financeiro/comissoes/pagamento',
        {
          empresa_id: empresaId || undefined,
          comissao_ids: [comissaoSelecionada.id],
          data_pagamento: detalhesDataPagamento,
          observacoes: detalhesObservacoes
        }
      );
      if (data?.fallback) {
        persistenciaDisponivel = false;
        toast.warning(data.message || 'Persistência de comissão indisponível neste ambiente.');
        return;
      }

      toast.success('Dados do pagamento atualizados com sucesso');
      showDetalhesDialog = false;
      comissaoSelecionada = null;
      await loadComissoes();
    } catch (err) {
      toast.error(toUserMessage(err, 'Erro ao atualizar pagamento'));
    } finally {
      salvandoDetalhes = false;
    }
  }

  async function handleCancelarComissao() {
    if (!comissaoSelecionada) return;
    if (!persistenciaDisponivel) {
      toast.warning(
        'Persistência de comissão indisponível neste ambiente. Nenhuma alteração pode ser salva agora.'
      );
      return;
    }

    salvandoDetalhes = true;
    try {
      const data = await apiFetch<{ fallback?: boolean; message?: string }>(
        '/api/v1/financeiro/comissoes/pagamento',
        {
          method: 'DELETE',
          body: {
            empresa_id: empresaId || undefined,
            comissao_ids: [comissaoSelecionada.id],
            observacoes: detalhesObservacoes
          }
        }
      );
      if (data?.fallback) {
        persistenciaDisponivel = false;
        toast.warning(data.message || 'Persistência de comissão indisponível neste ambiente.');
        return;
      }

      toast.success('Comissão cancelada com sucesso');
      showDetalhesDialog = false;
      comissaoSelecionada = null;
      await loadComissoes();
    } catch (err) {
      toast.error(toUserMessage(err, 'Erro ao cancelar comissão'));
    } finally {
      salvandoDetalhes = false;
    }
  }

  async function handleConfirmarPagamento() {
    if (!comissaoSelecionada) return;
    if (!persistenciaDisponivel) {
      toast.warning(
        'Persistência de comissão indisponível neste ambiente. Nenhuma baixa pode ser salva agora.'
      );
      return;
    }
    try {
      const data = await apiPost<{ fallback?: boolean; message?: string }>(
        '/api/v1/financeiro/comissoes/pagamento',
        {
          empresa_id: empresaId || undefined,
          comissao_ids: [comissaoSelecionada.id],
          data_pagamento: dataPagamento,
          observacoes: observacoesPagamento
        }
      );
      if (data?.fallback) {
        persistenciaDisponivel = false;
        toast.warning(data.message || 'Persistência de comissão indisponível neste ambiente.');
        return;
      }
      toast.success('Pagamento registrado com sucesso');
      showPagamentoDialog = false;
      comissaoSelecionada = null;
      await loadComissoes();
    } catch (err) {
      toast.error(toUserMessage(err, 'Erro ao registrar pagamento'));
    }
  }

  async function handlePagamentoMultiplo() {
    if (comissoesSelecionadas.length === 0) return;
    if (!persistenciaDisponivel) {
      toast.warning(
        'Persistência de comissão indisponível neste ambiente. Nenhuma baixa pode ser salva agora.'
      );
      return;
    }
    try {
      const data = await apiPost<{ fallback?: boolean; message?: string; pagas?: number }>(
        '/api/v1/financeiro/comissoes/pagamento',
        {
          empresa_id: empresaId || undefined,
          comissao_ids: comissoesSelecionadas,
          data_pagamento: dataPagamento,
          observacoes: observacoesPagamento
        }
      );
      if (data?.fallback) {
        persistenciaDisponivel = false;
        toast.warning(data.message || 'Persistência de comissão indisponível neste ambiente.');
        return;
      }
      toast.success(`${data.pagas} comissões marcadas como pagas`);
      showPagamentoMultiploDialog = false;
      comissoesSelecionadas = [];
      await loadComissoes();
    } catch (err) {
      toast.error(toUserMessage(err, 'Erro ao registrar pagamentos'));
    } finally {
      processando = false;
    }
  }

  function handleExport() {
    const base = comissoesVisiveis;
    const headers = [
      'Recibo',
      'Venda',
      'Vendedor',
      'Cliente',
      'Produto',
      'Data Recibo',
      'Valor Recibo',
      'Percentual',
      'Comissão base',
      'Seguro Viagem',
      'Comissão total',
      'Pago',
      'Status'
    ];
    const rows = base.map((c) => [
      c.numero_recibo || c.id,
      c.numero_venda,
      c.vendedor,
      c.cliente,
      c.produto || '',
      c.data_venda ? formatDate(c.data_venda) : '',
      String(c.valor_venda || 0).replace('.', ','),
      String(c.percentual_aplicado || 0).replace('.', ','),
      String(c.valor_comissao_geral || 0).replace('.', ','),
      String(c.valor_comissao_seguro || 0).replace('.', ','),
      String(c.valor_comissao || 0).replace('.', ','),
      String(c.valor_pago || 0).replace('.', ','),
      c.status
    ]);
    const csvContent = [headers.join(';'), ...rows.map((r) => r.join(';'))].join('\n');
    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const link = document.createElement('a');
    link.href = URL.createObjectURL(blob);
    link.download = `comissoes-${filtroMes || 'todos'}.csv`;
    link.click();
    toast.success('Relatório exportado com sucesso');
  }

  function onSelectionChange(selected: string[]) {
    comissoesSelecionadas = selected.filter((id) =>
      comissoes.find((x) => x.id === id && x.status === 'pendente')
    );
  }

  $: pendentes = comissoes.filter((c) => c.status === 'pendente');
  $: pagas = comissoes.filter((c) => c.status === 'pago');
  $: totalPendente = pendentes.reduce((acc, c) => acc + Number(c.valor_comissao || 0), 0);
  $: totalPago = pagas.reduce((acc, c) => acc + Number(c.valor_pago || c.valor_comissao || 0), 0);
  $: totalComissaoGeral = comissoes.reduce(
    (acc, c) => acc + Number(c.valor_comissao_geral ?? c.valor_comissao ?? 0),
    0
  );
  $: totalComissaoSeguro = comissoes.reduce(
    (acc, c) => acc + Number(c.valor_comissao_seguro || 0),
    0
  );
  $: totalComissaoComSeguro = totalComissaoGeral + totalComissaoSeguro;
  $: labelComissao = buildKpiLabel(
    'Comissão',
    comissoes.map((c) => Number(c.percentual_comissao_geral || 0))
  );
  $: labelSeguro = buildKpiLabel(
    'Seguro Viagem',
    comissoes.map((c) => Number(c.percentual_seguro || 0))
  );
  $: valorSelecionado = comissoes
    .filter((c) => comissoesSelecionadas.includes(c.id))
    .reduce((acc, c) => acc + Number(c.valor_comissao || 0), 0);
  $: comissoesVisiveis = somentePendentes ? pendentes : comissoes;
  $: canManagePagamentos = $permissoes.ready && $permissoes.isFinanceiro;
  $: podeFiltrarVendedor =
    $permissoes.ready &&
    ($permissoes.isSystemAdmin ||
      $permissoes.isMaster ||
      $permissoes.isFinanceiro ||
      $permissoes.isGestor);
  $: if ($permissoes.ready && !podeFiltrarVendedor && filtroVendedor) {
    filtroVendedor = '';
  }
</script>

<svelte:head><title>Comissões | VTUR</title></svelte:head>

<PageHeader
  title="Comissões"
  subtitle={canManagePagamentos
    ? 'Gerencie as comissões dos vendedores'
    : 'Consulte as comissões dos vendedores'}
  color="financeiro"
  breadcrumbs={[{ label: 'Financeiro', href: '/financeiro' }, { label: 'Comissões' }]}
  actions={canManagePagamentos
    ? [
        {
          label: 'Regras',
          href: '/financeiro/regras',
          variant: 'secondary' as const,
          icon: Settings
        }
      ]
    : []}
/>

{#if loading}
  <LoadingState />
{:else}
  <div class="mb-6 flex flex-wrap items-center justify-between gap-3">
    <div>
      <p class="text-xs font-semibold tracking-[0.14em] text-slate-400 uppercase">
        Painel executivo
      </p>
      <p class="text-sm text-slate-500">
        Resumo da fila de pagamento interno com foco em backlog, liquidação e priorização por
        vendedor.
      </p>
    </div>
  </div>

  <KPIGrid className="mb-6" columns={4}>
    <Button
      type="button"
      variant="unstyled"
      class_name="!block w-full! border-0! bg-transparent! p-0! shadow-none! focus:ring-0!"
      on:click={() => (somentePendentes = true)}
    >
      <KPICard
        title="Comissões pendentes"
        value={pendentes.length}
        color="financeiro"
        icon={Clock}
      />
    </Button>

    <Button
      type="button"
      variant="unstyled"
      class_name="!block w-full! border-0! bg-transparent! p-0! shadow-none! focus:ring-0!"
      on:click={() => (somentePendentes = false)}
    >
      <KPICard
        title="Total pago"
        value={formatCurrency(totalPago)}
        color="operacao"
        icon={CheckCircle}
      />
    </Button>

    <Button
      type="button"
      variant="unstyled"
      class_name="!block w-full! border-0! bg-transparent! p-0! shadow-none! focus:ring-0!"
      on:click={() => (somentePendentes = true)}
    >
      <KPICard
        title="Valor pendente"
        value={formatCurrency(totalPendente)}
        color="financeiro"
        icon={Wallet}
      />
    </Button>

    <Button
      type="button"
      variant="unstyled"
      class_name="!block w-full! border-0! bg-transparent! p-0! shadow-none! focus:ring-0!"
      on:click={() => goto('/financeiro/regras')}
    >
      <KPICard
        title="Vendedores na base"
        value={resumoVendedores.length}
        color="clientes"
        icon={Users}
      />
    </Button>
  </KPIGrid>

  <!-- Mobile: botão de filtros -->
  <div class="mb-4 sm:hidden">
    <Button variant="secondary" class_name="w-full" on:click={() => (showFilterSheet = true)}>
      <SlidersHorizontal size={16} class="mr-2" />
      Filtros
      {#if filtroVendedor || filtroStatus !== 'todas'}
        <span class="bg-financeiro-500 ml-2 inline-flex h-2 w-2 rounded-full"></span>
      {/if}
    </Button>
  </div>

  <BottomSheet bind:open={showFilterSheet} title="Filtrar comissões">
    <div class="flex flex-col gap-4">
      {#if canSelectEmpresa}
        <FieldSelect
          id="comissoes-empresa-mobile"
          label="Empresa"
          bind:value={empresaId}
          options={empresaOptions}
          placeholder={null}
          class_name="w-full"
          on:change={handleEmpresaChange}
        />
      {/if}
      <FieldInput
        id="comissoes-mes-mobile"
        label="Mês"
        type="month"
        bind:value={filtroMes}
        class_name="w-full"
        on:change={loadComissoes}
      />
      <FieldSelect
        id="comissoes-status-mobile"
        label="Status"
        bind:value={filtroStatus}
        options={statusOptions}
        class_name="w-full"
        on:change={loadComissoes}
      />
      {#if podeFiltrarVendedor}
        <FieldSelect
          id="comissoes-vendedor-mobile"
          label="Vendedor"
          bind:value={filtroVendedor}
          options={vendedorOptions}
          placeholder="Selecione uma opção"
          class_name="w-full"
          on:change={loadComissoes}
        />
      {/if}
      <Button variant="primary" class_name="w-full mt-2" on:click={() => (showFilterSheet = false)}>
        Aplicar filtros
      </Button>
    </div>
  </BottomSheet>

  <Card header="Filtros" color="financeiro" class="mb-6 hidden sm:block">
    <div class="flex flex-wrap items-end gap-4">
      {#if canSelectEmpresa}
        <FieldSelect
          id="comissoes-empresa"
          label="Empresa"
          bind:value={empresaId}
          options={empresaOptions}
          placeholder={null}
          class_name="min-w-[240px]"
          on:change={handleEmpresaChange}
        />
      {/if}
      <FieldInput
        id="comissoes-mes"
        label="Mês"
        type="month"
        bind:value={filtroMes}
        class_name="min-w-[180px]"
        on:change={loadComissoes}
      />
      <FieldSelect
        id="comissoes-status"
        label="Status"
        bind:value={filtroStatus}
        options={statusOptions}
        class_name="min-w-[180px]"
        on:change={loadComissoes}
      />
      {#if podeFiltrarVendedor}
        <FieldSelect
          id="comissoes-vendedor"
          label="Vendedor"
          bind:value={filtroVendedor}
          options={vendedorOptions}
          placeholder="Selecione uma opção"
          class_name="min-w-[240px]"
          on:change={loadComissoes}
        />
      {/if}
      <Button variant="secondary" on:click={handleExport}
        ><Download size={16} class="mr-2" />Exportar</Button
      >
    </div>

    <div class="mt-4 flex flex-wrap items-center gap-2">
      <Button
        variant="secondary"
        size="sm"
        class_name={somentePendentes
          ? 'rounded-full border-amber-300 bg-amber-50 text-amber-800 hover:bg-amber-100 hover:border-amber-400'
          : 'rounded-full border-slate-200 bg-white text-slate-700 hover:bg-slate-50 hover:border-slate-300'}
        on:click={() => (somentePendentes = !somentePendentes)}
      >
        {#if somentePendentes}
          Mostrando backlog de comissões ({pendentes.length})
        {:else}
          Ver backlog de comissões ({pendentes.length})
        {/if}
      </Button>
      {#if somentePendentes}
        <Button
          variant="secondary"
          size="sm"
          class_name="rounded-full border-slate-200 bg-white text-slate-700 hover:bg-slate-50 hover:border-slate-300"
          on:click={() => (somentePendentes = false)}
        >
          Limpar filtro rápido
        </Button>
      {/if}
    </div>
  </Card>

  <KPIGrid className="mb-6" columns={5}>
    <KPICard
      title={labelComissao}
      value={formatCurrency(totalComissaoGeral)}
      color="financeiro"
      icon={DollarSign}
    />
    <KPICard
      title="Comissão total"
      value={formatCurrency(totalComissaoGeral)}
      color="operacao"
      icon={CheckCircle}
    />
    <KPICard
      title={labelSeguro}
      value={formatCurrency(totalComissaoSeguro)}
      color="financeiro"
      icon={Wallet}
    />
    <KPICard
      title="Comissão + seguro"
      value={formatCurrency(totalComissaoComSeguro)}
      color="clientes"
      icon={TrendingUp}
    />
    <KPICard title="Recibos" value={comissoes.length} color="slate" icon={FileText} />
  </KPIGrid>

  <div
    class="rounded-vtur-xl shadow-vtur-lg mb-6 border border-slate-200 bg-white px-5 py-4 text-sm text-slate-600"
  >
    A tela de comissões agora funciona também como fila operacional: <strong
      >{pendentes.length}</strong
    >
    pendências de pagamento somando <strong>{formatCurrency(totalPendente)}</strong>.
    {#if !canManagePagamentos}
      <span class="mt-2 block text-slate-500"
        >Seu perfil possui acesso somente para consulta. Pagamentos de comissão são exclusivos do
        usuário financeiro.</span
      >
    {/if}
  </div>

  {#if !persistenciaDisponivel}
    <Card header="Persistência indisponível" color="orange" class="mb-6">
      <div
        class="flex items-start gap-3 rounded-[16px] border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900"
      >
        <AlertCircle size={18} class="mt-0.5 shrink-0" />
        <div>
          <p class="font-medium">Este ambiente está sem o ledger de comissões persistido.</p>
          <p class="mt-1 text-amber-800">
            A listagem e o cálculo continuam funcionando, mas ações como pagar, editar pagamento e
            cancelar comissão não serão salvas até a tabela <code>comissoes</code> estar disponível.
          </p>
        </div>
      </div>
    </Card>
  {/if}

  {#if resumoVendedores.length > 0}
    <Card header="Resumo por Vendedor" color="financeiro" class="mb-6"
      ><div class="grid grid-cols-1 gap-4 md:grid-cols-2 lg:grid-cols-3">
        {#each resumoVendedores as dados}<div class="rounded-lg bg-slate-50 p-4">
            <p class="truncate font-medium text-slate-900" title={dados.vendedor_nome}>
              {dados.vendedor_nome}
            </p>
            <div class="mt-2 space-y-1 text-sm">
              <div class="flex justify-between">
                <span class="text-slate-500">Recibos:</span><span class="font-medium"
                  >{dados.total_vendas}</span
                >
              </div>
              <div class="flex justify-between">
                <span class="text-slate-500">Comissão:</span><span class="font-medium"
                  >{formatCurrency(dados.total_comissao)}</span
                >
              </div>
              <div class="flex justify-between">
                <span class="text-slate-500">Pago:</span><span class="font-medium text-green-600"
                  >{formatCurrency(dados.total_pago)}</span
                >
              </div>
              <div class="flex justify-between">
                <span class="text-slate-500">Pendente:</span><span
                  class="font-medium text-amber-600">{formatCurrency(dados.total_pendente)}</span
                >
              </div>
            </div>
          </div>{/each}
      </div></Card
    >
  {/if}

  {#if canManagePagamentos && persistenciaDisponivel && comissoesSelecionadas.length > 0}
    <Card header="Pagamento em Lote" color="financeiro" class="mb-6"
      ><div class="flex items-center justify-between">
        <div>
          <p class="text-sm text-slate-600">
            <strong>{comissoesSelecionadas.length}</strong> comissões selecionadas
          </p>
          <p class="text-financeiro-600 text-lg font-semibold">
            {formatCurrency(valorSelecionado)}
          </p>
        </div>
        <Button
          variant="primary"
          color="financeiro"
          on:click={() => {
            dataPagamento = todayISODateLocal();
            observacoesPagamento = '';
            showPagamentoMultiploDialog = true;
          }}><CheckCircle size={16} class="mr-2" />Pagar Selecionadas</Button
        >
      </div></Card
    >
  {/if}

  <DataTable
    {columns}
    data={comissoesVisiveis}
    color="financeiro"
    {loading}
    title="Comissões por Recibo"
    searchable={true}
    filterable={false}
    exportable={false}
    selectable={canManagePagamentos && persistenciaDisponivel && filtroStatus !== 'pago'}
    {onSelectionChange}
    emptyMessage="Nenhuma comissão encontrada"
  >
    <svelte:fragment slot="actions" let:row>
      <div class="flex items-center gap-1">
        <Button variant="secondary" size="sm" on:click={() => abrirDetalhes(row)}
          ><FileText size={16} /></Button
        >{#if canManagePagamentos && row.status === 'pendente'}<Button
            variant="primary"
            color="financeiro"
            size="sm"
            on:click={() => abrirPagamento(row)}
            disabled={!persistenciaDisponivel}>Pagar</Button
          >{/if}
      </div>
    </svelte:fragment>
  </DataTable>
{/if}

{#if canManagePagamentos}
  <Dialog
    bind:open={showPagamentoDialog}
    title="Confirmar Pagamento"
    color="financeiro"
    showCancel={true}
    cancelText="Cancelar"
    showConfirm={true}
    confirmText="Confirmar Pagamento"
    onConfirm={handleConfirmarPagamento}
  >
    {#if comissaoSelecionada}
      <div class="space-y-4">
        <div class="bg-financeiro-50 rounded-lg p-4">
          <div class="mb-2 flex items-start justify-between">
            <div>
              <p class="text-sm text-slate-500">Vendedor</p>
              <p class="font-semibold text-slate-900">{comissaoSelecionada.vendedor}</p>
            </div>
            <p class="text-financeiro-600 text-2xl font-bold">
              {formatCurrency(comissaoSelecionada.valor_comissao)}
            </p>
          </div>
          <div class="mt-3 grid grid-cols-2 gap-4 text-sm">
            <div>
              <p class="text-slate-500">Recibo</p>
              <p class="font-medium">
                {comissaoSelecionada.numero_recibo || comissaoSelecionada.id}
              </p>
            </div>
            <div>
              <p class="text-slate-500">Venda</p>
              <p class="font-medium">{comissaoSelecionada.numero_venda}</p>
            </div>
            <div>
              <p class="text-slate-500">Cliente</p>
              <p class="font-medium">{comissaoSelecionada.cliente}</p>
            </div>
            <div>
              <p class="text-slate-500">Produto</p>
              <p class="font-medium">{comissaoSelecionada.produto || '-'}</p>
            </div>
            <div>
              <p class="text-slate-500">Valor do Recibo</p>
              <p class="font-medium">{formatCurrency(comissaoSelecionada.valor_venda)}</p>
            </div>
            <div>
              <p class="text-slate-500">Já Pago</p>
              <p class="font-medium">{formatCurrency(comissaoSelecionada.valor_pago)}</p>
            </div>
          </div>
        </div>
        <FieldInput
          id="comissao-data-pagamento"
          label="Data do Pagamento"
          type="date"
          bind:value={dataPagamento}
          class_name="w-full"
        /><FieldTextarea
          id="comissao-observacoes"
          label="Observações"
          bind:value={observacoesPagamento}
          rows={2}
          class_name="w-full"
          placeholder="Observações opcionais..."
        />
      </div>
    {/if}
  </Dialog>

  <Dialog
    bind:open={showPagamentoMultiploDialog}
    title="Pagamento em Lote"
    color="financeiro"
    showCancel={true}
    cancelText="Cancelar"
    showConfirm={true}
    confirmText={`Pagar ${comissoesSelecionadas.length} Comissões`}
    onConfirm={handlePagamentoMultiplo}
  >
    <div class="space-y-4">
      <div class="rounded-lg bg-blue-50 p-4">
        <p class="font-medium text-blue-900">Resumo do Pagamento</p>
        <div class="mt-2 space-y-1 text-sm">
          <div class="flex justify-between">
            <span class="text-blue-700">Comissões selecionadas:</span><span class="font-medium"
              >{comissoesSelecionadas.length}</span
            >
          </div>
          <div class="flex justify-between">
            <span class="text-blue-700">Valor total:</span><span class="text-lg font-medium"
              >{formatCurrency(valorSelecionado)}</span
            >
          </div>
        </div>
      </div>
      <FieldInput
        id="comissao-data-pagamento-lote"
        label="Data do Pagamento"
        type="date"
        bind:value={dataPagamento}
        class_name="w-full"
      /><FieldTextarea
        id="comissao-observacoes-lote"
        label="Observações"
        bind:value={observacoesPagamento}
        rows={2}
        class_name="w-full"
        placeholder="Observações para todos os pagamentos..."
      />
    </div>
  </Dialog>
{/if}

<Dialog
  bind:open={showDetalhesDialog}
  title="Detalhes da Comissão"
  color="financeiro"
  showCancel={true}
  cancelText="Fechar"
  showConfirm={false}
>
  {#if comissaoSelecionada}
    <div class="space-y-4">
      <div class="grid grid-cols-2 gap-4 text-sm">
        <div>
          <p class="text-slate-500">Recibo</p>
          <p class="font-medium">{comissaoSelecionada.numero_recibo || comissaoSelecionada.id}</p>
        </div>
        <div>
          <p class="text-slate-500">Venda</p>
          <p class="font-medium">{comissaoSelecionada.numero_venda}</p>
        </div>
        <div>
          <p class="text-slate-500">Status</p>
          <p class="font-medium">
            <Badge color={getStatusColor(comissaoSelecionada.status)} size="sm"
              >{getStatusLabel(comissaoSelecionada.status)}</Badge
            >
          </p>
        </div>
        <div>
          <p class="text-slate-500">Vendedor</p>
          <p class="font-medium">{comissaoSelecionada.vendedor}</p>
        </div>
        <div>
          <p class="text-slate-500">Cliente</p>
          <p class="font-medium">{comissaoSelecionada.cliente}</p>
        </div>
        <div>
          <p class="text-slate-500">Produto</p>
          <p class="font-medium">{comissaoSelecionada.produto || '-'}</p>
        </div>
        <div>
          <p class="text-slate-500">Data do Recibo</p>
          <p class="font-medium">{formatDate(comissaoSelecionada.data_venda)}</p>
        </div>
        <div>
          <p class="text-slate-500">Regra</p>
          <p class="font-medium">{comissaoSelecionada.regra_nome || 'Sem regra'}</p>
        </div>
        <div>
          <p class="text-slate-500">Tipo de pacote</p>
          <p class="font-medium">{comissaoSelecionada.tipo_pacote || '-'}</p>
        </div>
        <div>
          <p class="text-slate-500">Percentual aplicado</p>
          <p class="font-medium">
            {Number(comissaoSelecionada.percentual_aplicado || 0).toFixed(2)}%
          </p>
        </div>
      </div>

      <div class="border-t pt-4">
        <h4 class="mb-2 font-medium text-slate-900">Valores</h4>
        <div class="grid grid-cols-2 gap-4 text-sm">
          <div>
            <p class="text-slate-500">Valor do Recibo</p>
            <p class="font-medium">{formatCurrency(comissaoSelecionada.valor_venda)}</p>
          </div>
          <div>
            <p class="text-slate-500">Valor comissionável</p>
            <p class="font-medium">
              {formatCurrency(comissaoSelecionada.valor_comissionavel || 0)}
            </p>
          </div>
          <div>
            <p class="text-slate-500">Comissão base</p>
            <p class="font-medium">
              {formatCurrency(comissaoSelecionada.valor_comissao_geral || 0)}
            </p>
          </div>
          <div>
            <p class="text-slate-500">Seguro Viagem</p>
            <p class="font-medium">
              {formatCurrency(comissaoSelecionada.valor_comissao_seguro || 0)}
            </p>
          </div>
          <div>
            <p class="text-slate-500">Comissão + seguro</p>
            <p class="text-financeiro-600 font-bold">
              {formatCurrency(comissaoSelecionada.valor_comissao)}
            </p>
          </div>
          <div>
            <p class="text-slate-500">Valor Pago</p>
            <p class="font-medium">{formatCurrency(comissaoSelecionada.valor_pago || 0)}</p>
          </div>
        </div>
      </div>

      {#if comissaoSelecionada.status === 'pago' && canManagePagamentos}
        <div class="space-y-4 border-t pt-4">
          <FieldInput
            id="detalhe-comissao-data-pagamento"
            label="Data do pagamento"
            type="date"
            bind:value={detalhesDataPagamento}
            class_name="w-full"
          />
          <FieldTextarea
            id="detalhe-comissao-observacoes"
            label="Observações do pagamento"
            bind:value={detalhesObservacoes}
            rows={3}
            class_name="w-full"
            placeholder="Observações internas do pagamento..."
          />
          <div class="flex flex-wrap gap-3">
            <Button
              variant="primary"
              color="financeiro"
              on:click={handleAtualizarDetalhesPagamento}
              disabled={salvandoDetalhes}
            >
              Salvar ajustes
            </Button>
            <Button variant="danger" on:click={handleCancelarComissao} disabled={salvandoDetalhes}>
              Cancelar comissão
            </Button>
          </div>
        </div>
      {:else if comissaoSelecionada.status === 'pago'}
        <div class="border-t pt-4">
          <p class="text-sm text-slate-500">
            Esta comissão já foi paga. Seu perfil possui acesso somente para consulta.
          </p>
          {#if comissaoSelecionada.data_pagamento}
            <p class="mt-2 text-sm text-slate-600">
              Data do pagamento: <strong>{formatDate(comissaoSelecionada.data_pagamento)}</strong>
            </p>
          {/if}
          {#if comissaoSelecionada.observacoes_pagamento}
            <p class="mt-2 rounded-lg bg-slate-50 px-3 py-2 text-sm text-slate-600">
              {comissaoSelecionada.observacoes_pagamento}
            </p>
          {/if}
        </div>
      {:else if comissaoSelecionada.status === 'pendente'}
        <div class="border-t pt-4">
          <p class="text-sm text-slate-500">
            Esta comissão ainda está pendente de pagamento.
            {#if canManagePagamentos}
              Use a ação <strong>Pagar</strong> na listagem para registrar a baixa.
            {:else}
              Seu perfil possui acesso somente para consulta.
            {/if}
          </p>
        </div>
      {:else if comissaoSelecionada.status === 'cancelada'}
        <div class="border-t pt-4">
          <p class="text-sm text-slate-500">Esta comissão foi cancelada.</p>
          {#if comissaoSelecionada.observacoes_pagamento}
            <p class="mt-2 rounded-lg bg-slate-50 px-3 py-2 text-sm text-slate-600">
              {comissaoSelecionada.observacoes_pagamento}
            </p>
          {/if}
        </div>
      {/if}
    </div>
  {/if}
</Dialog>
