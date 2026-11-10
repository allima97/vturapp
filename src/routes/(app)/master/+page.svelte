<script lang="ts">
  import { onMount } from 'svelte';
  import { goto } from '$app/navigation';
  import PageHeader from '$lib/components/ui/PageHeader.svelte';
  import Card from '$lib/components/ui/Card.svelte';
  import Badge from '$lib/components/ui/Badge.svelte';
  import Button from '$lib/components/ui/Button.svelte';
  import LoadingState from '$lib/components/ui/LoadingState.svelte';
  import { toast } from '$lib/stores/ui';
  import { apiGet, isCanceledApiError } from '$lib/services/api';
  import { createLoadGuard } from '$lib/utils/loadGuard';
  import { toUserMessage } from '$lib/utils/errors';
  import { Building2, Shield, Users, CheckCircle2, AlertCircle } from '$lib/icons';

  type AdminSummary = {
    counts?: Record<string, number | undefined>;
    indicators?: {
      escopo?: string | null;
      scope_company_ids?: string[] | null;
    };
  };

  let loading = true;
  let summary: AdminSummary | null = null;
  const loadGuard = createLoadGuard();

  const modules = [
    {
      title: 'Usuarios',
      description:
        'Listagem de usuarios no portfolio master, com status, papel, escopo, senha e 2FA.',
      href: '/master/usuarios',
      icon: Users,
      countKey: 'usuarios_total'
    },
    {
      title: 'Permissoes',
      description: 'Permissoes por usuario e configuracao global de modulos.',
      href: '/master/permissoes',
      icon: Shield
    },
    {
      title: 'Empresas',
      description: 'Empresas do portfolio master, com billing e vinculos disponiveis.',
      href: '/master/empresas',
      icon: Building2,
      countKey: 'empresas_total'
    }
  ];

  async function loadSummary() {
    const request = loadGuard.next();
    loading = true;
    try {
      summary = await apiGet<AdminSummary>('/api/v1/admin/summary', undefined, request.signal);
      if (!loadGuard.isCurrent(request.seq)) return;
    } catch (err) {
      if (isCanceledApiError(err)) return;
      toast.error(toUserMessage(err, 'Nao foi possivel carregar o resumo.'));
      summary = null;
    } finally {
      if (loadGuard.isCurrent(request.seq)) loading = false;
    }
  }

  onMount(loadSummary);
</script>

<svelte:head>
  <title>Master | VTUR</title>
</svelte:head>

<PageHeader
  title="Master"
  subtitle="Painel consolidado do portfolio master para usuarios, permissoes e empresas acessiveis."
  breadcrumbs={[{ label: 'Master' }]}
/>

<div class="space-y-6">
  <Card color="financeiro">
    <div class="flex items-start gap-3">
      <Shield size={22} class="mt-0.5 text-orange-600" />
      <div class="space-y-1">
        <p class="text-sm font-semibold text-slate-900">Area master do sistema</p>
        <p class="text-sm text-slate-600">
          Este modulo concentra gestao global de usuarios, permissoes e empresas de todo o
          portfolio.
        </p>
      </div>
    </div>
  </Card>

  {#if loading}
    <LoadingState />
  {:else}
    <div class="vtur-kpi-grid vtur-kpi-grid-3 mb-6">
      <div class="vtur-kpi-card">
        <div class="flex h-10 w-10 items-center justify-center rounded-xl bg-blue-50 text-blue-500">
          <Users size={20} />
        </div>
        <div>
          <p class="text-sm font-medium text-slate-500">Usuários ativos</p>
          <p class="text-2xl font-bold text-slate-900">{summary?.counts?.usuarios_ativos ?? 0}</p>
          <p class="text-xs text-slate-400">{summary?.counts?.usuarios_inativos ?? 0} inativos</p>
        </div>
      </div>
      <div class="vtur-kpi-card">
        <div
          class="flex h-10 w-10 items-center justify-center rounded-xl bg-orange-50 text-orange-500"
        >
          <Building2 size={20} />
        </div>
        <div>
          <p class="text-sm font-medium text-slate-500">Empresas no escopo</p>
          <p class="text-2xl font-bold text-slate-900">{summary?.counts?.empresas_total ?? 0}</p>
          <p class="text-xs text-slate-400">{summary?.counts?.empresas_ativas ?? 0} ativas</p>
        </div>
      </div>
      <div class="vtur-kpi-card">
        <div class="flex h-10 w-10 items-center justify-center rounded-xl bg-red-50 text-red-500">
          <AlertCircle size={20} />
        </div>
        <div>
          <p class="text-sm font-medium text-slate-500">Vínculos master pendentes</p>
          <p class="text-2xl font-bold text-slate-900">
            {summary?.counts?.vinculos_master_pendentes ?? 0}
          </p>
          <p class="text-xs text-slate-400">Pendências de portfólio</p>
        </div>
      </div>
    </div>
  {/if}

  <Card color="financeiro" title="Modulos master">
    <div class="grid gap-4 lg:grid-cols-3">
      {#each modules as item}
        <Button
          type="button"
          variant="unstyled"
          class_name="block rounded-2xl border border-slate-200 bg-white p-5 text-left transition hover:border-orange-300 hover:bg-orange-50/40"
          on:click={() => goto(item.href)}
        >
          <div class="flex items-start justify-between gap-4">
            <div class="flex items-start gap-3">
              <div class="rounded-xl bg-orange-100 p-3 text-orange-700">
                <svelte:component this={item.icon} size={20} />
              </div>
              <div class="space-y-1">
                <p class="font-semibold text-slate-900">{item.title}</p>
                <p class="text-sm text-slate-600">{item.description}</p>
              </div>
            </div>

            {#if item.countKey}
              {#if loading}
                <div class="h-5 w-8 animate-pulse rounded-sm bg-slate-200"></div>
              {:else}
                <Badge color="yellow" size="sm">
                  {summary?.counts?.[item.countKey] ?? 0}
                </Badge>
              {/if}
            {/if}
          </div>
        </Button>
      {/each}
    </div>
  </Card>

  <Card color="financeiro" title="Escopo atual">
    <div class="grid gap-4 md:grid-cols-2">
      <div class="rounded-xl border border-slate-200 bg-slate-50 p-4">
        <div class="flex items-center gap-2 text-slate-900">
          <CheckCircle2 size={18} class="text-emerald-600" />
          <p class="font-medium">Perfil master ativo</p>
        </div>
        <p class="mt-2 text-sm text-slate-600">
          Acesso ao portfolio associado ao master, com controle sobre usuarios, permissoes e
          empresas em escopo.
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
