<script lang="ts">
  import { onMount } from 'svelte';
  import PageHeader from '$lib/components/ui/PageHeader.svelte';
  import Card from '$lib/components/ui/Card.svelte';
  import Button from '$lib/components/ui/Button.svelte';
  import LoadingState from '$lib/components/ui/LoadingState.svelte';
  import { toast } from '$lib/stores/ui';
  import { RefreshCw, Settings, CheckCircle, XCircle } from '$lib/icons';
  import { apiGet, apiPost, isCanceledApiError } from '$lib/services/api';
  import { toUserMessage } from '$lib/utils/errors';
  import { createLoadGuard } from '$lib/utils/loadGuard';

  type ModuloItem = {
    key: string;
    label: string;
    enabled: boolean;
    reason: string;
  };

  type ModuloCatalogItem = {
    key: string;
    label: string;
  };

  let modulos: ModuloItem[] = [];
  let loading = true;
  let savingKey = '';
  let tableMissing = false;
  const loadGuard = createLoadGuard();

  async function load() {
    const request = loadGuard.next();
    loading = true;
    try {
      const payload = await apiGet<{
        table_missing?: boolean;
        catalog?: ModuloCatalogItem[];
        disabled?: string[];
      }>('/api/v1/admin/modulos-sistema', undefined, request.signal);

      if (!loadGuard.isCurrent(request.seq)) return;
      tableMissing = Boolean(payload.table_missing);
      const catalog = payload.catalog || [];
      const disabled = new Set((payload.disabled || []).map((k: string) => k.toLowerCase()));

      modulos = catalog.map((item) => ({
        key: item.key,
        label: item.label,
        enabled: !disabled.has(item.key.toLowerCase()),
        reason: ''
      }));
    } catch (err) {
      if (isCanceledApiError(err)) return;
      toast.error(toUserMessage(err, 'Erro ao carregar módulos.'));
    } finally {
      if (loadGuard.isCurrent(request.seq)) loading = false;
    }
  }

  async function toggleModulo(modulo: ModuloItem) {
    savingKey = modulo.key;
    try {
      await apiPost('/api/v1/admin/modulos-sistema', {
        module_key: modulo.key,
        enabled: !modulo.enabled
      });
      modulo.enabled = !modulo.enabled;
      modulos = [...modulos];
      toast.success(`Módulo ${modulo.label} ${modulo.enabled ? 'habilitado' : 'desabilitado'}.`);
    } catch (err) {
      toast.error(toUserMessage(err, 'Erro ao atualizar módulo.'));
    } finally {
      savingKey = '';
    }
  }

  onMount(load);

  $: modulosResumo = modulos.reduce(
    (acc, modulo) => {
      if (modulo.enabled) acc.habilitados += 1;
      else acc.desabilitados += 1;
      return acc;
    },
    { habilitados: 0, desabilitados: 0 }
  );
  $: ({ habilitados, desabilitados } = modulosResumo);
</script>

<svelte:head>
  <title>Módulos do Sistema | VTUR</title>
</svelte:head>

<PageHeader
  title="Módulos do Sistema"
  subtitle="Habilite ou desabilite módulos para controlar o acesso às funcionalidades."
  breadcrumbs={[{ label: 'Admin', href: '/admin' }, { label: 'Módulos do Sistema' }]}
  actions={[{ label: 'Atualizar', onClick: load, variant: 'secondary', icon: RefreshCw }]}
/>

{#if tableMissing}
  <div
    class="rounded-vtur-lg mb-6 border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800"
  >
    A tabela <code>system_module_settings</code> não existe neste ambiente. Os módulos são exibidos com
    base no catálogo padrão.
  </div>
{/if}

<div class="vtur-kpi-grid vtur-kpi-grid-3 mb-6">
  <div class="vtur-kpi-card">
    <div class="flex h-10 w-10 items-center justify-center rounded-xl bg-slate-100 text-slate-500">
      <Settings size={20} />
    </div>
    <div>
      <p class="text-sm font-medium text-slate-500">Total de módulos</p>
      <p class="text-2xl font-bold text-slate-900">{modulos.length}</p>
    </div>
  </div>
  <div class="vtur-kpi-card">
    <div class="flex h-10 w-10 items-center justify-center rounded-xl bg-green-50 text-green-500">
      <CheckCircle size={20} />
    </div>
    <div>
      <p class="text-sm font-medium text-slate-500">Habilitados</p>
      <p class="text-2xl font-bold text-slate-900">{habilitados}</p>
    </div>
  </div>
  <div class="vtur-kpi-card">
    <div class="flex h-10 w-10 items-center justify-center rounded-xl bg-red-50 text-red-500">
      <XCircle size={20} />
    </div>
    <div>
      <p class="text-sm font-medium text-slate-500">Desabilitados</p>
      <p class="text-2xl font-bold text-slate-900">{desabilitados}</p>
    </div>
  </div>
</div>

{#if loading}
  <LoadingState />
{:else}
  <div class="grid grid-cols-1 gap-3 md:grid-cols-2 lg:grid-cols-3">
    {#each modulos as modulo}
      <div class="vtur-card flex items-center justify-between gap-4 p-4">
        <div class="flex items-center gap-3">
          <div class="rounded-lg p-2 {modulo.enabled ? 'bg-green-50' : 'bg-slate-100'}">
            <Settings size={18} class={modulo.enabled ? 'text-green-600' : 'text-slate-400'} />
          </div>
          <div>
            <p class="font-medium text-slate-900">{modulo.label}</p>
            <p class="font-mono text-xs text-slate-500">{modulo.key}</p>
          </div>
        </div>
        <Button
          type="button"
          variant="unstyled"
          class_name="flex items-center gap-1.5 rounded-full px-3 py-1.5 text-xs font-semibold transition-colors {modulo.enabled
            ? 'bg-green-100 text-green-700 hover:bg-green-200'
            : 'bg-slate-100 text-slate-600 hover:bg-slate-200'}"
          on:click={() => toggleModulo(modulo)}
          disabled={savingKey === modulo.key}
        >
          {#if modulo.enabled}
            <CheckCircle size={14} />
            Ativo
          {:else}
            <XCircle size={14} />
            Inativo
          {/if}
        </Button>
      </div>
    {/each}
  </div>
{/if}
