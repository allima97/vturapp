<script lang="ts">
  import { onDestroy, onMount } from 'svelte';
  import PageHeader from '$lib/components/ui/PageHeader.svelte';
  import Card from '$lib/components/ui/Card.svelte';
  import Button from '$lib/components/ui/Button.svelte';
  import { FieldInput, FieldSelect } from '$lib/components/ui';
  import KPIGrid from '$lib/components/kpis/KPIGrid.svelte';
  import KPICard from '$lib/components/kpis/KPICard.svelte';
  import { apiGet, isCanceledApiError } from '$lib/services/api';
  import { toast } from '$lib/stores/ui';
  import { toUserMessage } from '$lib/utils/errors';
  import {
    Banknote,
    CreditCard,
    FileCheck2,
    FileText,
    ReceiptText,
    RefreshCw,
    Settings,
    ShoppingCart,
    Wallet
  } from '$lib/icons';

  type CaixaSummary = {
    resumo?: {
      totalEntradas?: number;
      totalSaidas?: number;
      totalPendente?: number;
      totalDivergente?: number;
      saldo?: number;
      totalMovimentacoes?: number;
    };
    movimentacoes?: Array<{ descricao?: string; valor?: number; data?: string; tipo?: string }>;
  };

  type EmpresaOption = {
    id: string;
    nome?: string | null;
    nome_fantasia?: string | null;
    razao_social?: string | null;
  };

  const currency = new Intl.NumberFormat('pt-BR', {
    style: 'currency',
    currency: 'BRL'
  });

  let mes = currentMonthKey();
  let loading = true;
  let mounted = false;
  let caixa: CaixaSummary | null = null;
  let empresas: EmpresaOption[] = [];
  let empresaId = '';
  let contextRequestSeq = 0;
  let contextAbortController: AbortController | null = null;
  let dashboardRequestSeq = 0;
  let dashboardAbortController: AbortController | null = null;

  $: periodo = monthRange(mes);
  $: resumoCaixa = caixa?.resumo || {};
  $: movimentosRecentes = caixa?.movimentacoes?.slice(0, 6) || [];
  $: empresaOptions = empresas.map((empresa) => ({
    value: empresa.id,
    label: empresa.nome_fantasia || empresa.nome || empresa.razao_social || empresa.id
  }));
  $: canSelectEmpresa = empresaOptions.length > 1;

  function money(value?: number | null) {
    return currency.format(Number(value || 0));
  }

  function currentMonthKey() {
    const now = new Date();
    return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
  }

  function monthRange(monthKey: string) {
    const [yearRaw, monthRaw] = String(monthKey || '').split('-').map(Number);
    const year = Number.isFinite(yearRaw) ? yearRaw : new Date().getFullYear();
    const month = Number.isFinite(monthRaw) ? monthRaw : new Date().getMonth() + 1;
    const start = new Date(year, month - 1, 1);
    const end = new Date(year, month, 0);
    const normalizedMonth = String(month).padStart(2, '0');
    return {
      inicio: `${start.getFullYear()}-${normalizedMonth}-01`,
      fim: `${end.getFullYear()}-${normalizedMonth}-${String(end.getDate()).padStart(2, '0')}`
    };
  }

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

      empresas = Array.isArray(data.empresas) ? data.empresas : [];
      empresaId = String(data.company_id || '').trim() || empresas[0]?.id || '';
    } catch (err) {
      if (isCanceledApiError(err)) return;
      if (requestSeq !== contextRequestSeq) return;
      empresas = [];
      empresaId = '';
    } finally {
      if (requestSeq === contextRequestSeq && contextAbortController === controller) {
        contextAbortController = null;
      }
    }
  }

  async function loadDashboard() {
    const requestSeq = ++dashboardRequestSeq;
    dashboardAbortController?.abort();
    const controller = new AbortController();
    dashboardAbortController = controller;
    loading = true;
    try {
      const caixaPayload = await apiGet<CaixaSummary>('/api/v1/financeiro/caixa', {
          data_inicio: periodo.inicio,
          data_fim: periodo.fim,
          empresa_id: empresaId || undefined
        }, controller.signal, 60_000);
      if (requestSeq !== dashboardRequestSeq) return;
      caixa = caixaPayload;
    } catch (error: unknown) {
      if (isCanceledApiError(error)) return;
      if (requestSeq !== dashboardRequestSeq) return;
      toast.error(toUserMessage(error, 'Erro ao carregar dashboard financeiro.'));
    } finally {
      if (requestSeq === dashboardRequestSeq) {
        loading = false;
        if (dashboardAbortController === controller) {
          dashboardAbortController = null;
        }
      }
    }
  }

  $: if (mounted && mes) {
    void loadDashboard();
  }

  async function handleEmpresaChange() {
    await loadDashboard();
  }

  onMount(async () => {
    await loadUserContext();
    mounted = true;
  });

  onDestroy(() => {
    contextAbortController?.abort();
    dashboardAbortController?.abort();
  });
</script>

<svelte:head>
  <title>Dashboard Financeiro | VTUR</title>
</svelte:head>

<PageHeader
  title="Dashboard Financeiro"
  subtitle="Painel operacional de caixa, conciliação, comissões, recebimentos e pendências fiscais."
  color="financeiro"
  breadcrumbs={[{ label: 'Dashboard' }, { label: 'Financeiro' }]}
  actions={[{ label: 'Atualizar', onClick: loadDashboard, variant: 'secondary', icon: RefreshCw }]}
/>

<div class="space-y-6">
  <Card title="Período" color="financeiro">
    <div class="grid grid-cols-1 gap-4 md:grid-cols-3">
      <FieldInput id="financeiro-mes" label="Mês" type="month" bind:value={mes} class_name="w-full" />
      {#if canSelectEmpresa}
        <FieldSelect
          id="financeiro-dashboard-empresa"
          label="Empresa"
          bind:value={empresaId}
          options={empresaOptions}
          class_name="w-full"
          on:change={handleEmpresaChange}
        />
      {/if}
    </div>
  </Card>

  <KPIGrid columns={4} loading={loading}>
    <KPICard
      title="Entradas"
      value={money(resumoCaixa.totalEntradas)}
      subtitle="Pagamentos e movimentos de entrada"
      color="financeiro"
      icon={Banknote}
    />
    <KPICard
      title="Saídas"
      value={money(resumoCaixa.totalSaidas)}
      subtitle="Despesas e movimentos de saída"
      color="financeiro"
      icon={CreditCard}
    />
    <KPICard
      title="Saldo"
      value={money(resumoCaixa.saldo)}
      subtitle={`${resumoCaixa.totalMovimentacoes || 0} movimentação(ões)`}
      color="financeiro"
      icon={Wallet}
    />
  </KPIGrid>

  <div class="grid gap-6 xl:grid-cols-[1.2fr_0.8fr]">
    <Card title="Fila financeira" subtitle="Atalhos do fluxo operacional" color="financeiro">
      <div class="grid gap-3 md:grid-cols-2">
        <Button href="/financeiro/ajustes-vendas" variant="outline" color="financeiro" class_name="justify-start! rounded-xl! p-4!">
          <Settings size={18} class="mr-3 text-orange-600" /> Ajustes de vendas
        </Button>
        <Button href="/financeiro/comissoes" variant="outline" color="financeiro" class_name="justify-start! rounded-xl! p-4!">
          <Wallet size={18} class="mr-3 text-orange-600" /> Comissionamento
        </Button>
        <Button href="/vendas" variant="outline" color="financeiro" class_name="justify-start! rounded-xl! p-4!">
          <ShoppingCart size={18} class="mr-3 text-orange-600" /> Vendas e pagamentos
        </Button>
        <Button href="/financeiro/formas-pagamento" variant="outline" color="financeiro" class_name="justify-start! rounded-xl! p-4!">
          <CreditCard size={18} class="mr-3 text-orange-600" /> Formas de pagamento
        </Button>
        <Button href="/financeiro/notas-fiscais" variant="outline" color="financeiro" class_name="justify-start! rounded-xl! p-4!">
          <ReceiptText size={18} class="mr-3 text-orange-600" /> Notas fiscais
        </Button>
      </div>
    </Card>

    <Card title="Leitura do mês" subtitle="Indicadores financeiros sem dados comerciais" color="financeiro">
      <div class="space-y-4">
        <div class="flex items-center justify-between rounded-xl border border-slate-200 p-4">
          <div class="flex items-center gap-3">
            <FileCheck2 size={18} class="text-orange-600" />
            <span class="font-medium text-slate-800">Recibos conciliados</span>
          </div>
          <strong class="text-slate-950">—</strong>
        </div>
        <div class="flex items-center justify-between rounded-xl border border-slate-200 p-4">
          <div class="flex items-center gap-3">
            <Banknote size={18} class="text-orange-600" />
            <span class="font-medium text-slate-800">Valor conciliado</span>
          </div>
          <strong class="text-slate-950">—</strong>
        </div>
        <div class="flex items-center justify-between rounded-xl border border-slate-200 p-4">
          <div class="flex items-center gap-3">
            <FileText size={18} class="text-orange-600" />
            <span class="font-medium text-slate-800">Pendências fiscais</span>
          </div>
          <strong class="text-slate-950">Planejado</strong>
        </div>
      </div>
    </Card>
  </div>

  <Card title="Movimentações recentes" color="financeiro">
    {#if movimentosRecentes.length === 0}
      <p class="text-sm text-slate-500">Nenhuma movimentação encontrada no período.</p>
    {:else}
      <div class="divide-y divide-slate-100">
        {#each movimentosRecentes as movimento}
          <div class="flex flex-wrap items-center justify-between gap-3 py-3">
            <div>
              <p class="font-medium text-slate-900">{movimento.descricao || 'Movimentação'}</p>
              <p class="text-sm text-slate-500">{movimento.data || '-'}</p>
            </div>
            <p class="font-semibold text-slate-950">{money(movimento.valor)}</p>
          </div>
        {/each}
      </div>
    {/if}
  </Card>
</div>
