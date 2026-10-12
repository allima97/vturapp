<script lang="ts">
  import { onDestroy, onMount } from 'svelte';
  import { goto } from '$app/navigation';
  import PageHeader from '$lib/components/ui/PageHeader.svelte';
  import Card from '$lib/components/ui/Card.svelte';
  import Button from '$lib/components/ui/Button.svelte';
  import Dialog from '$lib/components/ui/Dialog.svelte';
  import { BottomSheet, FieldInput, FieldSelect, FieldTextarea, LoadingState } from '$lib/components/ui';
  import KPICard from '$lib/components/kpis/KPICard.svelte';
  import KPIGrid from '$lib/components/kpis/KPIGrid.svelte';
  import ChartJS from '$lib/components/charts/ChartJS.svelte';
  import {
    TrendingUp, TrendingDown, DollarSign, Calendar,
    Plus, Download, ArrowUpRight, ArrowDownRight,
    Wallet, CreditCard, Banknote, FileText,
    AlertCircle, CheckCircle, SlidersHorizontal
  } from '$lib/icons';
  import { toast } from '$lib/stores/ui';
  import { todayISODateLocal } from '$lib/date';
  import { toUserMessage } from '$lib/utils/errors';
  import { formatDate as formatDateValue } from '$lib/utils/formatters';
  import { apiGet, apiPost, isCanceledApiError } from '$lib/services/api';

  interface Movimentacao {
    id: string;
    tipo: 'entrada' | 'saida';
    categoria: string;
    descricao: string;
    valor: number;
    data: string;
    forma_pagamento: string;
    status: string;
    cliente: string;
    origem: string;
  }

  interface Resumo {
    totalEntradas: number;
    totalSaidas: number;
    totalPendente: number;
    totalDivergente: number;
    totalMovimentacoes: number;
    saldo: number;
  }

  interface FormaPagamentoResumo {
    nome: string;
    valor: number;
    quantidade: number;
  }

  interface EmpresaOption {
    id: string;
    nome: string;
  }

  const BRL_CURRENCY_FORMATTER = new Intl.NumberFormat('pt-BR', {
    style: 'currency',
    currency: 'BRL'
  });

  let loading = true;
  let periodo = 'mes_atual';
  let dataInicio = '';
  let dataFim = '';
  let empresas: EmpresaOption[] = [];
  let empresaId = '';
  let resumo: Resumo = {
    totalEntradas: 0,
    totalSaidas: 0,
    totalPendente: 0,
    totalDivergente: 0,
    totalMovimentacoes: 0,
    saldo: 0
  };
  let movimentacoes: Movimentacao[] = [];
  let porFormaPagamento: FormaPagamentoResumo[] = [];
  let showMovimentacaoDialog = false;
  let processando = false;
  let showFilterSheet = false;
  let contextoRequestSeq = 0;
  let contextoAbortController: AbortController | null = null;
  let dadosRequestSeq = 0;
  let dadosAbortController: AbortController | null = null;
  let formasRequestSeq = 0;
  let formasAbortController: AbortController | null = null;

  let novaMovimentacao = {
    tipo: 'entrada' as 'entrada' | 'saida',
    categoria: 'outro',
    descricao: '',
    valor: 0,
    data_movimentacao: '',
    forma_pagamento_id: '',
    observacoes: ''
  };

  let formasPagamento: { id: string; nome: string }[] = [];

  const periodoOptions = [
    { value: 'mes_atual', label: 'Mes Atual' },
    { value: 'semana', label: 'Ultimos 7 dias' },
    { value: 'personalizado', label: 'Personalizado' }
  ];

  const tipoMovimentacaoOptions = [
    { value: 'entrada', label: 'Entrada (Receita)' },
    { value: 'saida', label: 'Saida (Despesa)' }
  ];

  const categoriaMovimentacaoOptions = [
    { value: 'venda', label: 'Venda' },
    { value: 'comissao', label: 'Comissao' },
    { value: 'fornecedor', label: 'Fornecedor' },
    { value: 'despesa_operacional', label: 'Despesa Operacional' },
    { value: 'outro', label: 'Outro' }
  ];

  $: formaPagamentoOptions = formasPagamento.map((fp) => ({
    value: fp.id,
    label: fp.nome
  }));
  $: empresaOptions = empresas.map((empresa) => ({
    value: empresa.id,
    label: empresa.nome
  }));
  $: temVariasEmpresas = empresas.length > 1;

  onMount(async () => {
    const hoje = todayISODateLocal();
    dataInicio = `${hoje.slice(0, 7)}-01`;
    dataFim = hoje;
    novaMovimentacao.data_movimentacao = hoje;

    await carregarContexto();
    carregarDados();
    carregarFormasPagamento();
  });

  async function carregarContexto() {
    const requestSeq = ++contextoRequestSeq;
    contextoAbortController?.abort();
    const controller = new AbortController();
    contextoAbortController = controller;
    try {
      const data = await apiGet<{ company_id?: string; empresas?: EmpresaOption[] }>(
        '/api/v1/user/context',
        undefined,
        controller.signal,
        60_000
      );
      if (requestSeq !== contextoRequestSeq) return;
      empresas = data.empresas || [];
      empresaId = String(data.company_id || empresas[0]?.id || '').trim();
    } catch (err) {
      if (isCanceledApiError(err)) return;
      if (requestSeq !== contextoRequestSeq) return;
      empresas = [];
      empresaId = '';
    } finally {
      if (requestSeq === contextoRequestSeq && contextoAbortController === controller) {
        contextoAbortController = null;
      }
    }
  }

  async function carregarDados() {
    const requestSeq = ++dadosRequestSeq;
    dadosAbortController?.abort();
    const controller = new AbortController();
    dadosAbortController = controller;
    loading = true;
    try {
      const data = await apiGet<{
        resumo?: Resumo;
        movimentacoes?: Movimentacao[];
        porFormaPagamento?: FormaPagamentoResumo[];
      }>('/api/v1/financeiro/caixa', {
        periodo,
        data_inicio: dataInicio || undefined,
        data_fim: dataFim || undefined,
        empresa_id: empresaId || undefined
      }, controller.signal, 60_000);
      if (requestSeq !== dadosRequestSeq) return;
      if (data.resumo) resumo = data.resumo;
      movimentacoes = data.movimentacoes || [];
      porFormaPagamento = data.porFormaPagamento || [];
    } catch (err) {
      if (isCanceledApiError(err)) return;
      if (requestSeq !== dadosRequestSeq) return;
      toast.error(toUserMessage(err, 'Erro ao carregar dados'));
    } finally {
      if (requestSeq === dadosRequestSeq) {
        loading = false;
        if (dadosAbortController === controller) {
          dadosAbortController = null;
        }
      }
    }
  }

  async function carregarFormasPagamento() {
    const requestSeq = ++formasRequestSeq;
    formasAbortController?.abort();
    const controller = new AbortController();
    formasAbortController = controller;
    try {
      const data = await apiGet<{ items?: Array<{ id: string; nome: string }> }>(
        '/api/v1/financeiro/formas-pagamento',
        { ativas: true, empresa_id: empresaId || undefined },
        controller.signal,
        60_000
      );
      if (requestSeq !== formasRequestSeq) return;
      formasPagamento = (data.items || []).map((fp) => ({
        id: fp.id,
        nome: fp.nome
      }));
    } catch (err) {
      if (isCanceledApiError(err)) return;
      if (requestSeq !== formasRequestSeq) return;
      formasPagamento = [];
    } finally {
      if (requestSeq === formasRequestSeq && formasAbortController === controller) {
        formasAbortController = null;
      }
    }
  }

  onDestroy(() => {
    contextoAbortController?.abort();
    dadosAbortController?.abort();
    formasAbortController?.abort();
  });

  function formatCurrency(value: number): string {
    return BRL_CURRENCY_FORMATTER.format(value || 0);
  }

  function formatDate(dateStr: string): string {
    return formatDateValue(dateStr);
  }

  $: backlogFinanceiroValor = Number(resumo.totalPendente || 0) + Number(resumo.totalDivergente || 0);
  $: temBacklogFinanceiro = backlogFinanceiroValor > 0;
  $: movimentacoesResumo = movimentacoes.reduce(
    (acc, m) => {
      if (m.tipo === 'entrada') acc.entradasRecentes += 1;
      if (m.tipo === 'saida') acc.saidasRecentes += 1;
      return acc;
    },
    { entradasRecentes: 0, saidasRecentes: 0 }
  );
  $: ({ entradasRecentes, saidasRecentes } = movimentacoesResumo);
  const chartColors = [
    '#f97316',
    '#3b82f6',
    '#10b981',
    '#8b5cf6',
    '#f59e0b',
    '#ef4444',
    '#06b6d4',
    '#84cc16'
  ];

  function getChartData() {
    const labels = porFormaPagamento.map(fp => fp.nome);
    const data = porFormaPagamento.map(fp => fp.valor);

    return {
      labels,
      datasets: [{
        data,
        backgroundColor: data.map((_, index) => chartColors[index % chartColors.length]),
        borderWidth: 0
      }]
    };
  }

  function getChartOptions() {
    return {
      responsive: true,
      maintainAspectRatio: false,
      plugins: {
        legend: {
          display: false
        }
      }
    };
  }

  async function handleCriarMovimentacao() {
    if (!novaMovimentacao.descricao || novaMovimentacao.valor <= 0) {
      toast.error('Preencha todos os campos obrigatórios');
      return;
    }

    processando = true;
    try {
      await apiPost('/api/v1/financeiro/caixa', {
        ...novaMovimentacao,
        empresa_id: empresaId || undefined
      });

      toast.success('Movimentação registrada com sucesso!');
      showMovimentacaoDialog = false;

      novaMovimentacao = {
        tipo: 'entrada',
        categoria: 'outro',
        descricao: '',
        valor: 0,
        data_movimentacao: todayISODateLocal(),
        forma_pagamento_id: '',
        observacoes: ''
      };

      await carregarDados();
    } catch (err: unknown) {
      toast.error(toUserMessage(err, 'Erro ao criar movimentação'));
    } finally {
      processando = false;
    }
  }

  function handleExportar() {
    try {
      const dados = movimentacoes.map(m => ({
        Data: m.data,
        Tipo: m.tipo === 'entrada' ? 'Entrada' : 'Saída',
        Categoria: m.categoria,
        Descricao: m.descricao,
        Valor: m.valor,
        FormaPagamento: m.forma_pagamento,
        Cliente: m.cliente
      }));

      const headers = Object.keys(dados[0] || {});
      const csv = [
        headers.join(';'),
        ...dados.map(row => headers.map(h => row[h as keyof typeof row]).join(';'))
      ].join('\n');

      const blob = new Blob(['\uFEFF' + csv], { type: 'text/csv;charset=utf-8;' });
      const link = document.createElement('a');
      link.href = URL.createObjectURL(blob);
      link.download = `caixa_${dataInicio}_${dataFim}.csv`;
      link.click();

      toast.success('Relatório exportado!');
    } catch (err) {
      toast.error(toUserMessage(err, 'Erro ao exportar'));
    }
  }

  function getStatusBadge(status: string) {
    const styles: Record<string, string> = {
      conciliado: 'bg-green-100 text-green-700',
      confirmado: 'bg-green-100 text-green-700',
      pendente: 'bg-amber-100 text-amber-700',
      divergente: 'bg-red-100 text-red-700'
    };
    return styles[status] || 'bg-slate-100 text-slate-700';
  }
</script>

<svelte:head>
  <title>Caixa | VTUR</title>
</svelte:head>

<PageHeader
  title="Dashboard de Caixa"
  subtitle="Acompanhe o fluxo de caixa e movimentações financeiras"
  color="financeiro"
  breadcrumbs={[
    { label: 'Financeiro', href: '/financeiro' },
    { label: 'Caixa' }
  ]}
  actions={[
    {
      label: 'Nova Movimentação',
      onClick: () => showMovimentacaoDialog = true,
      variant: 'primary',
      icon: Plus
    }
  ]}
/>

{#if loading}
  <LoadingState />
{:else}
  <div class="mb-6 flex flex-wrap items-center justify-between gap-3">
    <div>
      <p class="text-xs font-semibold uppercase tracking-[0.14em] text-slate-400">Painel executivo</p>
      <p class="text-sm text-slate-500">Resumo do caixa com foco em saldo, backlog financeiro, entradas e saídas do período.</p>
    </div>
  </div>

  <KPIGrid className="mb-6" columns={4}>

    <Button
      type="button"
      variant="unstyled"
      class_name="vtur-kpi-card flex! w-full! hover:shadow-lg transition-all duration-200"
      on:click={() => goto('/financeiro/caixa')}
    >
      <div class={`flex h-10 w-10 items-center justify-center rounded-xl ${resumo.saldo >= 0 ? 'bg-green-50 text-green-500' : 'bg-red-50 text-red-500'}`}><DollarSign size={20} /></div>
      <div>
        <p class="text-sm font-medium text-slate-500">Situação de caixa</p>
        <p class="text-2xl font-bold text-slate-900">{formatCurrency(resumo.saldo)}</p>
      </div>
    </Button>

    <Button
      type="button"
      variant="unstyled"
      class_name="vtur-kpi-card flex! w-full! hover:shadow-lg transition-all duration-200"
      on:click={() => goto('/financeiro/caixa')}
    >
      <div class="flex h-10 w-10 items-center justify-center rounded-xl bg-orange-50 text-orange-500"><ArrowUpRight size={20} /></div>
      <div>
        <p class="text-sm font-medium text-slate-500">Total recebido</p>
        <p class="text-2xl font-bold text-slate-900">{formatCurrency(resumo.totalEntradas)}</p>
      </div>
    </Button>

    <Button
      type="button"
      variant="unstyled"
      class_name="vtur-kpi-card flex! w-full! hover:shadow-lg transition-all duration-200"
      on:click={() => goto('/financeiro/caixa')}
    >
      <div class="flex h-10 w-10 items-center justify-center rounded-xl bg-slate-100 text-slate-500"><ArrowDownRight size={20} /></div>
      <div>
        <p class="text-sm font-medium text-slate-500">Total de saídas</p>
        <p class="text-2xl font-bold text-slate-900">{formatCurrency(resumo.totalSaidas)}</p>
      </div>
    </Button>
  </KPIGrid>

  <!-- Mobile: botão de filtros -->
  <div class="mb-4 sm:hidden">
    <Button variant="secondary" class_name="w-full" on:click={() => (showFilterSheet = true)}>
      <SlidersHorizontal size={16} class="mr-2" />
      Filtros
      {#if periodo || empresaId || dataInicio || dataFim}
        <span class="ml-2 inline-flex h-2 w-2 rounded-full bg-financeiro-500"></span>
      {/if}
    </Button>
  </div>

  <Card color="financeiro" class="mb-6 hidden sm:block">
    <div class="flex flex-col sm:flex-row gap-4 items-end">
      <div class="flex-1 flex flex-wrap gap-4">
        <FieldSelect
          id="caixa-periodo"
          label="Periodo"
          bind:value={periodo}
          options={periodoOptions}
          placeholder={null}
          class_name="min-w-[220px]"
          on:change={carregarDados}
        />
        {#if temVariasEmpresas}
          <FieldSelect
            id="caixa-empresa"
            label="Empresa"
            bind:value={empresaId}
            options={empresaOptions}
            placeholder={null}
            class_name="min-w-[220px]"
            on:change={() => {
              carregarDados();
              carregarFormasPagamento();
            }}
          />
        {/if}
        <FieldInput
          id="caixa-data-inicio"
          label="Data Inicio"
          type="date"
          bind:value={dataInicio}
          class_name="min-w-[180px]"
          on:change={carregarDados}
        />
        <FieldInput
          id="caixa-data-fim"
          label="Data Fim"
          type="date"
          bind:value={dataFim}
          min={dataInicio || null}
          class_name="min-w-[180px]"
          on:change={carregarDados}
        />
      </div>
      <Button variant="secondary" on:click={handleExportar}>
        <Download size={18} class="mr-2" />
        Exportar
      </Button>
    </div>
  </Card>

<BottomSheet bind:open={showFilterSheet} title="Filtrar caixa">
  <div class="space-y-4">
    <FieldSelect
      id="caixa-periodo-mobile"
      label="Periodo"
      bind:value={periodo}
      options={periodoOptions}
      placeholder={null}
      class_name="w-full"
      on:change={carregarDados}
    />
    {#if temVariasEmpresas}
      <FieldSelect
        id="caixa-empresa-mobile"
        label="Empresa"
        bind:value={empresaId}
        options={empresaOptions}
        placeholder={null}
        class_name="w-full"
        on:change={() => {
          carregarDados();
          carregarFormasPagamento();
        }}
      />
    {/if}
    <FieldInput
      id="caixa-data-inicio-mobile"
      label="Data Inicio"
      type="date"
      bind:value={dataInicio}
      class_name="w-full"
      on:change={carregarDados}
    />
    <FieldInput
      id="caixa-data-fim-mobile"
      label="Data Fim"
      type="date"
      bind:value={dataFim}
      min={dataInicio || null}
      class_name="w-full"
      on:change={carregarDados}
    />
  </div>
  <Button variant="primary" class_name="w-full mt-2" on:click={() => (showFilterSheet = false)}>Aplicar filtros</Button>
</BottomSheet>

  <KPIGrid className="mb-6" columns={6}>
    <KPICard title="Total Recebido" value={formatCurrency(resumo.totalEntradas)} color="financeiro" icon={ArrowUpRight} />
    <KPICard title="Total Saídas" value={formatCurrency(resumo.totalSaidas)} color="financeiro" icon={ArrowDownRight} />
    <KPICard title="Pendente" value={formatCurrency(resumo.totalPendente)} color="financeiro" icon={Wallet} />
    <KPICard title="Divergente" value={formatCurrency(resumo.totalDivergente)} color="financeiro" icon={TrendingDown} />
    <KPICard title="Backlog" value={formatCurrency(backlogFinanceiroValor)} color="financeiro" icon={Banknote} />
    <KPICard title="Saldo" value={formatCurrency(resumo.saldo)} color="financeiro" icon={DollarSign} />
  </KPIGrid>

  <div class="mb-6 rounded-vtur-xl border {temBacklogFinanceiro ? 'border-amber-200 bg-amber-50 text-amber-800' : 'border-green-200 bg-green-50 text-green-700'} px-5 py-4 text-sm shadow-vtur-lg">
    {#if temBacklogFinanceiro}
      O caixa aponta <strong>{formatCurrency(backlogFinanceiroValor)}</strong> em backlog financeiro, somando pendências e divergências que ainda exigem fechamento.
    {:else}
      O caixa está sem backlog financeiro relevante no período selecionado.
    {/if}
  </div>

  <div class="grid grid-cols-1 md:grid-cols-3 gap-4 mb-6">
    <div class="vtur-card p-5 text-left">
      <p class="text-sm text-slate-500 mb-1">Movimento no período</p>
      <p class="text-lg font-semibold text-slate-900">{entradasRecentes} entradas · {saidasRecentes} saídas</p>
      <p class="mt-2 text-sm text-slate-600">Leitura rápida do volume operacional no período filtrado.</p>
    </div>
    <Button
      type="button"
      variant="unstyled"
      class_name="vtur-card block! w-full! p-5! text-left! hover:shadow-lg transition-all duration-200"
      on:click={() => goto('/financeiro')}
    >
      <p class="text-sm text-slate-500 mb-1">Resumo executivo</p>
      <p class="text-lg font-semibold text-slate-900">Voltar ao Financeiro</p>
      <p class="mt-2 text-sm text-slate-600">Retorne ao painel executivo para navegar entre backlog, caixa e comissões.</p>
    </Button>
  </div>

  <div class="grid grid-cols-1 lg:grid-cols-3 gap-6">
    <Card header="Por Forma de Pagamento" icon={CreditCard} color="financeiro" class="lg:col-span-1">
      {#if porFormaPagamento.length > 0}
        <div class="mx-auto h-56 max-w-[280px]">
          <ChartJS type="doughnut" data={getChartData()} options={getChartOptions()} />
        </div>
        <div class="mt-5 space-y-3">
          {#each porFormaPagamento.slice(0, 5) as fp, index}
            <div class="grid grid-cols-[minmax(0,1fr)_auto] items-start gap-3 text-sm">
              <div class="flex min-w-0 items-center gap-2">
                <span
                  class="h-2.5 w-2.5 shrink-0 rounded-full"
                  style={`background-color: ${chartColors[index % chartColors.length]}`}
                ></span>
                <span class="truncate text-slate-600" title={fp.nome}>{fp.nome}</span>
              </div>
              <div class="shrink-0 text-right leading-tight">
                <p class="font-semibold text-slate-900">{formatCurrency(fp.valor)}</p>
                <p class="text-xs text-slate-500">{fp.quantidade} mov.</p>
              </div>
            </div>
          {/each}
        </div>
      {:else}
        <div class="h-64 flex items-center justify-center text-slate-500">
          <div class="text-center">
            <CreditCard size={48} class="mx-auto mb-2 opacity-30" />
            <p>Nenhum dado disponível</p>
          </div>
        </div>
      {/if}
    </Card>

    <Card header="Movimentações Recentes" icon={FileText} color="financeiro" class="lg:col-span-2">
      {#if movimentacoes.length === 0}
        <div class="py-12 text-center text-slate-500">
          <TrendingUp size={48} class="mx-auto mb-2 opacity-30" />
          <p>Nenhuma movimentação no período</p>
        </div>
      {:else}
        <div class="overflow-x-visible md:overflow-x-auto">
          <table class="w-full text-sm table-mobile-cards">
            <thead class="bg-slate-50">
              <tr>
                <th class="px-4 py-3 text-left text-xs font-semibold text-slate-600 uppercase">Data</th>
                <th class="px-4 py-3 text-left text-xs font-semibold text-slate-600 uppercase">Descrição</th>
                <th class="px-4 py-3 text-left text-xs font-semibold text-slate-600 uppercase">Forma</th>
                <th class="px-4 py-3 text-right text-xs font-semibold text-slate-600 uppercase">Valor</th>
                <th class="px-4 py-3 text-center text-xs font-semibold text-slate-600 uppercase">Status</th>
              </tr>
            </thead>
            <tbody class="divide-y divide-slate-200">
              {#each movimentacoes.slice(0, 10) as mov}
                <tr class="hover:bg-slate-50">
                  <td class="px-4 py-3 text-slate-700">{formatDate(mov.data)}</td>
                  <td class="px-4 py-3">
                    <p class="font-medium text-slate-900">{mov.descricao}</p>
                    {#if mov.cliente && mov.cliente !== '-'}
                      <p class="text-xs text-slate-500">{mov.cliente}</p>
                    {/if}
                  </td>
                  <td class="px-4 py-3 text-slate-700">{mov.forma_pagamento}</td>
                  <td class="px-4 py-3 text-right">
                    <span class={mov.tipo === 'entrada' ? 'text-green-600' : 'text-red-600'}>
                      {mov.tipo === 'entrada' ? '+' : '-'}{formatCurrency(mov.valor)}
                    </span>
                  </td>
                  <td class="px-4 py-3 text-center">
                    <span class="inline-flex px-2 py-1 text-xs font-medium rounded-full {getStatusBadge(mov.status)}">
                      {mov.status === 'conciliado' || mov.status === 'confirmado' ? 'Confirmado' : mov.status === 'pendente' ? 'Pendente' : mov.status}
                    </span>
                  </td>
                </tr>
              {/each}
            </tbody>
          </table>
        </div>
        {#if movimentacoes.length > 10}
          <div class="mt-4 text-center">
            <p class="text-sm text-slate-500">Mostrando 10 de {movimentacoes.length} movimentações</p>
          </div>
        {/if}
      {/if}
    </Card>
  </div>
{/if}

<Dialog
  bind:open={showMovimentacaoDialog}
  title="Nova Movimentação"
  color="financeiro"
  showCancel={true}
  cancelText="Cancelar"
  showConfirm={true}
  confirmText="Salvar"
  confirmVariant="primary"
  loading={processando}
  onConfirm={handleCriarMovimentacao}
>
  <div class="space-y-4">
    {#if temVariasEmpresas}
      <FieldSelect
        id="caixa-mov-empresa"
        label="Empresa"
        bind:value={empresaId}
        options={empresaOptions}
        placeholder={null}
        required={true}
        class_name="w-full"
      />
    {/if}
    <div class="grid grid-cols-1 sm:grid-cols-2 gap-4">
      <FieldSelect
        id="caixa-mov-tipo"
        label="Tipo"
        bind:value={novaMovimentacao.tipo}
        options={tipoMovimentacaoOptions}
        placeholder={null}
        required={true}
        class_name="w-full"
      />
      <FieldSelect
        id="caixa-mov-categoria"
        label="Categoria"
        bind:value={novaMovimentacao.categoria}
        options={categoriaMovimentacaoOptions}
        placeholder={null}
        class_name="w-full"
      />
    </div>

    <FieldInput
      id="caixa-mov-descricao"
      label="Descricao"
      bind:value={novaMovimentacao.descricao}
      placeholder="Descricao da movimentacao"
      required={true}
      class_name="w-full"
    />

    <div class="grid grid-cols-1 sm:grid-cols-2 gap-4">
      <FieldInput
        id="caixa-mov-valor"
        label="Valor"
        type="number"
        step="0.01"
        min="0"
        bind:value={novaMovimentacao.valor}
        placeholder="0,00"
        required={true}
        class_name="w-full"
      />
      <FieldInput
        id="caixa-mov-data"
        label="Data"
        type="date"
        bind:value={novaMovimentacao.data_movimentacao}
        required={true}
        class_name="w-full"
      />
    </div>

    <FieldSelect
      id="caixa-mov-forma-pagamento"
      label="Forma de Pagamento"
      bind:value={novaMovimentacao.forma_pagamento_id}
      options={formaPagamentoOptions}
      placeholder="Selecione uma opção"
      class_name="w-full"
    />

    <FieldTextarea
      id="caixa-mov-observacoes"
      label="Observacoes"
      bind:value={novaMovimentacao.observacoes}
      rows={2}
      placeholder="Observacoes opcionais"
      class_name="w-full"
    />
  </div>
</Dialog>
