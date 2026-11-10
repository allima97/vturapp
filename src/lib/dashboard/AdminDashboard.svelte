<script lang="ts">
  import { onMount } from 'svelte';
  import PageHeader from '$lib/components/ui/PageHeader.svelte';
  import Card from '$lib/components/ui/Card.svelte';
  import Button from '$lib/components/ui/Button.svelte';
  import LoadingState from '$lib/components/ui/LoadingState.svelte';
  import { toast } from '$lib/stores/ui';
  import {
    AlertCircle,
    BellRing,
    BookOpen,
    Building2,
    CreditCard,
    DollarSign,
    FileText,
    Gift,
    Mail,
    Megaphone,
    Settings2,
    SlidersHorizontal,
    Shield,
    UserRoundCog,
    Users,
    Wrench
  } from '$lib/icons';
  import { apiGet, isCanceledApiError } from '$lib/services/api';
  import { createLoadGuard } from '$lib/utils/loadGuard';

  type SummaryPayload = {
    counts?: {
      usuarios_total?: number;
      usuarios_ativos?: number;
      usuarios_inativos?: number;
      empresas_total?: number;
      empresas_ativas?: number;
      empresas_inativas?: number;
      tipos_total?: number;
      planos_total?: number;
      planos_ativos?: number;
      planos_inativos?: number;
      cobrancas_ativas?: number;
      cobrancas_trial?: number;
      cobrancas_atrasadas?: number;
      cobrancas_suspensas?: number;
      cobrancas_canceladas?: number;
      avisos_ativos?: number;
      vinculos_master_pendentes?: number;
    };
    indicators?: {
      email_configurado?: boolean;
      escopo?: string;
      scope_company_ids?: string[];
    };
  };

  type SummaryCounts = NonNullable<SummaryPayload['counts']>;
  type DashboardIcon = typeof Building2;
  type ResumoCard = {
    label: string;
    countKey: keyof SummaryCounts;
    icon: DashboardIcon;
    iconClass: string;
    meta: (counts: SummaryPayload['counts']) => string;
  };
  type CobrancaCard = {
    label: string;
    countKey: keyof SummaryCounts;
    iconClass: string;
  };

  let loading = true;
  let summary: SummaryPayload | null = null;
  const dashboardGuard = createLoadGuard();

  const resumoCards: ResumoCard[] = [
    {
      label: 'Empresas cadastradas',
      countKey: 'empresas_total',
      icon: Building2,
      iconClass: 'bg-sky-50 text-sky-600',
      meta: (counts: SummaryPayload['counts']) =>
        `Ativas: ${counts?.empresas_ativas ?? 0} · Inativas: ${counts?.empresas_inativas ?? 0}`
    },
    {
      label: 'Usuários',
      countKey: 'usuarios_total',
      icon: Users,
      iconClass: 'bg-indigo-50 text-indigo-600',
      meta: (counts: SummaryPayload['counts']) =>
        `Ativos: ${counts?.usuarios_ativos ?? 0} · Inativos: ${counts?.usuarios_inativos ?? 0}`
    },
    {
      label: 'Planos',
      countKey: 'planos_total',
      icon: CreditCard,
      iconClass: 'bg-teal-50 text-teal-600',
      meta: (counts: SummaryPayload['counts']) =>
        `Ativos: ${counts?.planos_ativos ?? 0} · Inativos: ${counts?.planos_inativos ?? 0}`
    },
    {
      label: 'Pagamentos em atraso',
      countKey: 'cobrancas_atrasadas',
      icon: AlertCircle,
      iconClass: 'bg-orange-50 text-orange-600',
      meta: () => 'Monitorar cobranças vencidas'
    }
  ];

  const cobrancaCards: CobrancaCard[] = [
    { label: 'Ativas', countKey: 'cobrancas_ativas', iconClass: 'bg-emerald-50 text-emerald-700' },
    { label: 'Trial', countKey: 'cobrancas_trial', iconClass: 'bg-sky-50 text-sky-700' },
    {
      label: 'Atrasadas',
      countKey: 'cobrancas_atrasadas',
      iconClass: 'bg-amber-50 text-amber-700'
    },
    {
      label: 'Suspensas',
      countKey: 'cobrancas_suspensas',
      iconClass: 'bg-orange-50 text-orange-700'
    },
    { label: 'Canceladas', countKey: 'cobrancas_canceladas', iconClass: 'bg-red-50 text-red-700' }
  ];

  const atalhos = [
    { title: 'Planos', href: '/admin/planos', icon: CreditCard, description: 'Catálogo e valores' },
    {
      title: 'Financeiro',
      href: '/admin/financeiro',
      icon: DollarSign,
      description: 'Status e cobranças'
    },
    {
      title: 'Empresas',
      href: '/admin/empresas',
      icon: Building2,
      description: 'Cadastro e status de contas'
    },
    {
      title: 'Usuários',
      href: '/admin/usuarios',
      icon: Users,
      description: 'Perfis, cargos e acesso'
    },
    {
      title: 'Tipos de usuário',
      href: '/admin/tipos-usuario',
      icon: UserRoundCog,
      description: 'Perfis padrão e escopos'
    },
    {
      title: 'Aniversariantes',
      href: '/admin/aniversariantes',
      icon: Gift,
      description: 'Calendário de colaboradores'
    },
    {
      title: 'Avisos',
      href: '/admin/avisos',
      icon: Megaphone,
      description: 'Templates e notificações'
    },
    { title: 'CRM', href: '/admin/crm', icon: BellRing, description: 'Templates administrativos' },
    { title: 'E-mail', href: '/admin/email', icon: Mail, description: 'Configurar envio' },
    {
      title: 'Módulos',
      href: '/admin/modulos-sistema',
      icon: SlidersHorizontal,
      description: 'Disponibilidade global'
    },
    {
      title: 'Permissões',
      href: '/admin/permissoes',
      icon: Shield,
      description: 'Módulos e níveis de acesso'
    },
    {
      title: 'Parâmetros importação',
      href: '/admin/parametros-importacao',
      icon: Settings2,
      description: 'Termos e parser'
    },
    {
      title: 'Correção de recibos',
      href: '/admin/fix-recibos',
      icon: Wrench,
      description: 'Auditoria e ajustes pontuais'
    },
    { title: 'Logs', href: '/dashboard/logs', icon: FileText, description: 'Auditoria do sistema' },
    {
      title: 'Documentação',
      href: '/documentacao',
      icon: BookOpen,
      description: 'Guias e instruções'
    }
  ];

  async function loadSummary(signal?: AbortSignal) {
    return apiGet<SummaryPayload>('/api/v1/admin/summary', undefined, signal);
  }

  async function loadDashboard() {
    const request = dashboardGuard.next();
    loading = true;
    try {
      const payload = await loadSummary(request.signal);
      if (!dashboardGuard.isCurrent(request.seq)) return;
      summary = payload;
    } catch (err) {
      if (isCanceledApiError(err)) return;
      toast.error('Não foi possível carregar o dashboard administrativo.');
    } finally {
      if (dashboardGuard.isCurrent(request.seq)) loading = false;
    }
  }

  onMount(loadDashboard);
</script>

<svelte:head>
  <title>Dashboard administrativo | VTUR</title>
</svelte:head>

<PageHeader
  title="Dashboard administrativo"
  subtitle="Administração do sistema: empresas, usuários, planos, cobrança, módulos e auditoria."
  breadcrumbs={[{ label: 'Dashboard' }, { label: 'Admin' }]}
  actions={[{ label: 'Atualizar', onClick: loadDashboard, variant: 'secondary', icon: Settings2 }]}
/>

<div class="space-y-6">
  <Card
    color="financeiro"
    title="Resumo administrativo"
    subtitle="Visão consolidada de empresas, usuários, planos e cobranças."
  >
    {#if loading}
      <LoadingState compact={true} />
    {:else}
      <div class="vtur-kpi-grid mb-0">
        {#each resumoCards as card}
          <div class="vtur-kpi-card">
            <div
              class={`flex h-10 w-10 shrink-0 items-center justify-center rounded-xl ${card.iconClass}`}
            >
              <svelte:component this={card.icon} size={18} />
            </div>
            <div class="min-w-0 flex-1">
              <p class="text-xs font-medium text-slate-500 sm:text-sm">{card.label}</p>
              <p class="text-lg font-bold text-slate-900 sm:text-2xl">
                {summary?.counts?.[card.countKey] ?? 0}
              </p>
              <p class="text-xs text-slate-400">{card.meta(summary?.counts)}</p>
            </div>
          </div>
        {/each}
      </div>
    {/if}
  </Card>

  <Card
    color="financeiro"
    title="Status de cobrança"
    subtitle="Acompanhe rapidamente contas ativas, trial, atrasadas, suspensas e canceladas."
  >
    <svelte:fragment slot="actions">
      <Button href="/admin/financeiro" variant="secondary" color="financeiro">
        <DollarSign size={16} />
        Ver financeiro
      </Button>
    </svelte:fragment>
    {#if loading}
      <LoadingState compact={true} />
    {:else}
      <div class="grid gap-4 sm:grid-cols-2 lg:grid-cols-5">
        {#each cobrancaCards as card}
          <div class={`rounded-xl px-4 py-3 ${card.iconClass}`}>
            <p class="text-xs font-semibold tracking-[0.08em] uppercase opacity-80">{card.label}</p>
            <p class="mt-1 text-2xl font-bold">{summary?.counts?.[card.countKey] ?? 0}</p>
          </div>
        {/each}
      </div>
    {/if}
  </Card>

  <Card
    color="financeiro"
    title="Atalhos rápidos"
    subtitle="Acesso direto aos painéis administrativos mais usados."
  >
    <div class="grid gap-4 lg:grid-cols-2 xl:grid-cols-3">
      {#each atalhos as item}
        <Button
          href={item.href}
          variant="unstyled"
          class_name="block rounded-2xl border border-slate-200 bg-white p-5 text-left transition hover:border-orange-300 hover:bg-orange-50/40"
        >
          <div class="flex items-start gap-3">
            <div class="rounded-xl bg-orange-100 p-3 text-orange-700">
              <svelte:component this={item.icon} size={20} />
            </div>
            <div>
              <p class="font-semibold text-slate-900">{item.title}</p>
              <p class="text-sm text-slate-600">{item.description}</p>
            </div>
          </div>
        </Button>
      {/each}
    </div>
  </Card>

  <Card color="financeiro" title="Status operacional">
    <div class="grid gap-4 md:grid-cols-2">
      <div class="rounded-xl border border-slate-200 bg-slate-50 p-4">
        <div class="flex items-center gap-2 text-slate-900">
          <Mail
            size={18}
            class={summary?.indicators?.email_configurado ? 'text-emerald-600' : 'text-slate-400'}
          />
          <p class="font-medium">Disparo de e-mail</p>
        </div>
        <p class="mt-2 text-sm text-slate-600">
          {summary?.indicators?.email_configurado
            ? 'Configuração ativa para testes e avisos administrativos.'
            : 'Ainda sem configuração completa de e-mail global.'}
        </p>
      </div>
      <div class="rounded-xl border border-slate-200 bg-slate-50 p-4">
        <p class="font-medium text-slate-900">Escopo atual</p>
        <p class="mt-2 text-sm text-slate-600">
          Perfil carregado: <span class="font-semibold">{summary?.indicators?.escopo ?? '-'}</span>
        </p>
        <p class="mt-1 text-sm text-slate-500">
          Empresas em escopo: {summary?.indicators?.scope_company_ids?.length ?? 0}
        </p>
      </div>
    </div>
  </Card>
</div>
