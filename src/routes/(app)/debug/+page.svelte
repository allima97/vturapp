<script lang="ts">
  import { onMount } from 'svelte';
  import PageHeader from '$lib/components/ui/PageHeader.svelte';
  import Card from '$lib/components/ui/Card.svelte';
  import Button from '$lib/components/ui/Button.svelte';
  import LoadingState from '$lib/components/ui/LoadingState.svelte';
  import { toUserMessage } from '$lib/utils/errors';
  import { apiGet, isCanceledApiError } from '$lib/services/api';
  import { createLoadGuard } from '$lib/utils/loadGuard';
  import { Bug, RefreshCw, CheckCircle, XCircle } from '$lib/icons';

  type DebugPermissionsResponse = {
    usuario?: {
      id?: string | null;
      nome?: string | null;
      email?: string | null;
      company_id?: string | null;
      user_type_id?: string | null;
      uso_individual?: boolean | null;
    } | null;
    scope?: {
      papel?: string | null;
      isAdmin?: boolean | null;
      isMaster?: boolean | null;
      isGestor?: boolean | null;
      isVendedor?: boolean | null;
      companyIds?: string[] | null;
    } | null;
    permissoes_detalhadas?: Array<{
      modulo?: string | null;
      nivel?: number | string | null;
      company_id?: string | null;
    }> | null;
    empresas_disponiveis?: Array<{
      id: string;
      nome_fantasia?: string | null;
    }> | null;
    sample_clientes?: Array<{
      id: string;
      nome?: string | null;
      company_id?: string | null;
      created_by?: string | null;
    }> | null;
  };

  let debugData: DebugPermissionsResponse | null = null;
  let loading = true;
  let error: string | null = null;
  const loadGuard = createLoadGuard();

  onMount(async () => {
    await loadDebugData();
  });

  async function loadDebugData() {
    const request = loadGuard.next();
    loading = true;
    error = null;
    try {
      const payload = await apiGet<DebugPermissionsResponse>(
        '/api/v1/debug/permissions',
        undefined,
        request.signal
      );
      if (!loadGuard.isCurrent(request.seq)) return;
      debugData = payload;
    } catch (err) {
      if (isCanceledApiError(err)) return;
      error = toUserMessage(err, 'Erro ao carregar dados de debug.');
    } finally {
      if (loadGuard.isCurrent(request.seq)) loading = false;
    }
  }

  function formatJSON(obj: unknown): string {
    return JSON.stringify(obj, null, 2);
  }
</script>

<svelte:head>
  <title>Debug - Permissões | VTUR</title>
</svelte:head>

<div class="p-6">
  <div class="mb-6 flex items-center justify-between">
    <div>
      <PageHeader
        title="Debug de Permissões"
        subtitle="Informações de diagnóstico do usuário"
        color="gray"
      />
    </div>
    <Button variant="secondary" disabled={loading} on:click={loadDebugData}>
      <RefreshCw size={18} class={loading ? 'animate-spin' : ''} />
      Atualizar
    </Button>
  </div>

  {#if loading}
    <LoadingState />
  {:else if error}
    <div role="alert" class="rounded-lg border border-red-200 bg-red-50 p-4 text-red-700">
      {error}
    </div>
  {:else if debugData}
    <div class="mt-6 grid grid-cols-1 gap-6 lg:grid-cols-2">
      <!-- Usuário -->
      <Card title="Usuário" icon={CheckCircle}>
        <div class="space-y-2 text-sm">
          <div class="flex justify-between">
            <span class="text-slate-500">ID:</span>
            <span class="font-mono text-xs">{debugData.usuario?.id}</span>
          </div>
          <div class="flex justify-between">
            <span class="text-slate-500">Nome:</span>
            <span>{debugData.usuario?.nome || 'N/A'}</span>
          </div>
          <div class="flex justify-between">
            <span class="text-slate-500">Email:</span>
            <span>{debugData.usuario?.email}</span>
          </div>
          <div class="flex justify-between">
            <span class="text-slate-500">Company ID:</span>
            <span class="font-mono text-xs">{debugData.usuario?.company_id || 'N/A'}</span>
          </div>
          <div class="flex justify-between">
            <span class="text-slate-500">User Type ID:</span>
            <span class="font-mono text-xs">{debugData.usuario?.user_type_id || 'N/A'}</span>
          </div>
          <div class="flex justify-between">
            <span class="text-slate-500">Uso Individual:</span>
            <span>{debugData.usuario?.uso_individual ? 'Sim' : 'Não'}</span>
          </div>
        </div>
      </Card>

      <!-- Scope -->
      <Card title="Scope (Permissões Calculadas)" icon={CheckCircle}>
        <div class="space-y-2 text-sm">
          <div class="flex items-center justify-between">
            <span class="text-slate-500">Papel:</span>
            <span class="font-medium">{debugData.scope?.papel}</span>
          </div>
          <div class="grid grid-cols-2 gap-2">
            <div class="flex items-center gap-2">
              {#if debugData.scope?.isAdmin}
                <CheckCircle size={16} class="text-green-500" />
              {:else}
                <XCircle size={16} class="text-slate-300" />
              {/if}
              <span class={debugData.scope?.isAdmin ? 'text-green-700' : 'text-slate-400'}
                >Admin</span
              >
            </div>
            <div class="flex items-center gap-2">
              {#if debugData.scope?.isMaster}
                <CheckCircle size={16} class="text-green-500" />
              {:else}
                <XCircle size={16} class="text-slate-300" />
              {/if}
              <span class={debugData.scope?.isMaster ? 'text-green-700' : 'text-slate-400'}
                >Master</span
              >
            </div>
            <div class="flex items-center gap-2">
              {#if debugData.scope?.isGestor}
                <CheckCircle size={16} class="text-green-500" />
              {:else}
                <XCircle size={16} class="text-slate-300" />
              {/if}
              <span class={debugData.scope?.isGestor ? 'text-green-700' : 'text-slate-400'}
                >Gestor</span
              >
            </div>
            <div class="flex items-center gap-2">
              {#if debugData.scope?.isVendedor}
                <CheckCircle size={16} class="text-green-500" />
              {:else}
                <XCircle size={16} class="text-slate-300" />
              {/if}
              <span class={debugData.scope?.isVendedor ? 'text-green-700' : 'text-slate-400'}
                >Vendedor</span
              >
            </div>
          </div>
          <div class="border-t border-slate-100 pt-2">
            <span class="text-slate-500">Company IDs:</span>
            <div class="mt-1 rounded-sm bg-slate-50 p-2 font-mono text-xs">
              {JSON.stringify(debugData.scope?.companyIds)}
            </div>
          </div>
        </div>
      </Card>

      <!-- Permissões Detalhadas -->
      <Card title="Permissões do Banco" icon={CheckCircle}>
        {#if debugData.permissoes_detalhadas && debugData.permissoes_detalhadas.length > 0}
          <div class="space-y-2">
            {#each debugData.permissoes_detalhadas as perm}
              <div class="flex items-center justify-between rounded-sm bg-slate-50 p-2">
                <span class="font-medium">{perm.modulo}</span>
                <div class="flex items-center gap-2">
                  <span class="text-sm text-slate-500">Nível {perm.nivel}</span>
                  {#if perm.company_id}
                    <span class="rounded-sm bg-slate-200 px-2 py-0.5 font-mono text-xs">
                      {perm.company_id.slice(0, 8)}...
                    </span>
                  {/if}
                </div>
              </div>
            {/each}
          </div>
        {:else}
          <p class="text-sm text-slate-500">Nenhuma permissão encontrada no banco</p>
        {/if}
      </Card>

      <!-- Empresas -->
      <Card title="Empresas Disponíveis" icon={CheckCircle}>
        {#if debugData.empresas_disponiveis && debugData.empresas_disponiveis.length > 0}
          <div class="max-h-60 space-y-2 overflow-y-auto">
            {#each debugData.empresas_disponiveis as empresa}
              <div class="flex items-center justify-between rounded-sm bg-slate-50 p-2 text-sm">
                <span>{empresa.nome_fantasia}</span>
                <span class="font-mono text-xs text-slate-400">{empresa.id.slice(0, 8)}...</span>
              </div>
            {/each}
          </div>
        {:else}
          <p class="text-sm text-slate-500">Nenhuma empresa encontrada</p>
        {/if}
      </Card>

      <!-- Sample Clientes -->
      <Card title="Sample de Clientes (últimos 5)" icon={CheckCircle} class="lg:col-span-2">
        {#if debugData.sample_clientes && debugData.sample_clientes.length > 0}
          <div class="space-y-2">
            {#each debugData.sample_clientes as cliente}
              <div class="flex items-center justify-between rounded-sm bg-slate-50 p-3">
                <div>
                  <p class="font-medium">{cliente.nome}</p>
                  <p class="font-mono text-xs text-slate-500">ID: {cliente.id}</p>
                </div>
                <div class="text-right text-sm">
                  <p class="text-slate-500">
                    Company: <span class="font-mono"
                      >{cliente.company_id ? cliente.company_id.slice(0, 8) + '...' : 'N/A'}</span
                    >
                  </p>
                  <p class="text-slate-500">
                    Created by: <span class="font-mono"
                      >{cliente.created_by ? cliente.created_by.slice(0, 8) + '...' : 'N/A'}</span
                    >
                  </p>
                </div>
              </div>
            {/each}
          </div>
        {:else}
          <p class="text-sm text-slate-500">Nenhum cliente encontrado</p>
        {/if}
      </Card>

      <!-- JSON Completo -->
      <Card title="JSON Completo" icon={Bug} class="lg:col-span-2">
        <pre class="overflow-x-auto rounded-lg bg-slate-900 p-4 text-xs text-slate-100">{formatJSON(
            debugData
          )}</pre>
      </Card>
    </div>
  {/if}
</div>
