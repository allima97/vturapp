<script lang="ts">
  import { onDestroy, onMount } from 'svelte';
  import { RefreshCw, SlidersHorizontal } from '$lib/icons';
  import PageHeader from '$lib/components/ui/PageHeader.svelte';
  import Card from '$lib/components/ui/Card.svelte';
  import Button from '$lib/components/ui/Button.svelte';
  import Badge from '$lib/components/ui/Badge.svelte';
  import LoadingState from '$lib/components/ui/LoadingState.svelte';
  import SimpleTable from '$lib/components/ui/SimpleTable.svelte';
  import PaginationControls from '$lib/components/ui/PaginationControls.svelte';
  import { BottomSheet, FieldInput } from '$lib/components/ui';
  import { toast } from '$lib/stores/ui';
  import { apiGet } from '$lib/services/api';
  import { formatDateTime } from '$lib/utils/formatters';
  import { createDebouncedReloader } from '$lib/utils/autoReload';
  import { toUserMessage } from '$lib/utils/errors';

  type LogUsuario = {
    nome_completo: string | null;
    email: string | null;
  } | null;

  type LogItem = {
    id: string;
    modulo: string | null;
    acao: string | null;
    detalhes: unknown;
    user_id: string | null;
    ip: string | null;
    created_at: string | null;
    usuario?: LogUsuario;
  };

  type LogsPayload = {
    items?: LogItem[];
    total?: number;
    page?: number;
    pageSize?: number;
  };

  let loading = true;
  let logs: LogItem[] = [];
  let total = 0;
  let page = 1;
  let pageSize = 50;
  let tipo = '';
  let userId = '';
  let showFilterSheet = false;
  let autoReloadEnabled = false;
  let lastAutoReloadKey = '';
  const autoReload = createDebouncedReloader(() => loadLogs(1), 300);

  function formatDetails(value: unknown) {
    if (!value) return '-';
    if (typeof value === 'string') return value;
    try {
      return JSON.stringify(value);
    } catch {
      return String(value);
    }
  }

  function userLabel(log: LogItem) {
    return log.usuario?.nome_completo || log.usuario?.email || log.user_id || '-';
  }

  async function loadLogs(nextPage = page) {
    loading = true;
    try {
      const payload = await apiGet<LogsPayload>('/api/v1/admin/logs', {
        page: nextPage,
        pageSize,
        tipo,
        user_id: userId
      });
      logs = payload.items || [];
      total = Number(payload.total || 0);
      page = Number(payload.page || nextPage);
      pageSize = Number(payload.pageSize || pageSize);
    } catch (err) {
      toast.error(toUserMessage(err, 'Erro ao carregar logs administrativos.'));
    } finally {
      loading = false;
    }
  }

  function nextPage() {
    if (page * pageSize >= total) return;
    void loadLogs(page + 1);
  }

  function prevPage() {
    if (page <= 1) return;
    void loadLogs(page - 1);
  }

  onMount(() => {
    void (async () => {
      await loadLogs(1);
      lastAutoReloadKey = buildAutoReloadKey();
      autoReloadEnabled = true;
    })();
  });

  onDestroy(() => {
    autoReload.cancel();
  });

  function buildAutoReloadKey() {
    return [tipo.trim(), userId.trim()].join('|');
  }

  function scheduleAutoReload() {
    autoReload.schedule();
  }

  // O $: do modo legado só reage às variáveis escritas nesta linha (não enxerga dentro de
  // buildAutoReloadKey()). Por isso a mesma expressão da função fica aqui, idêntica.
  $: autoReloadKey = [tipo.trim(), userId.trim()].join('|');
  $: if (autoReloadEnabled && autoReloadKey !== lastAutoReloadKey) {
    lastAutoReloadKey = autoReloadKey;
    scheduleAutoReload();
  }
</script>

<svelte:head>
  <title>Logs administrativos | VTUR</title>
</svelte:head>

<PageHeader
  title="Logs administrativos"
  subtitle="Auditoria técnica e trilha de eventos do sistema."
  breadcrumbs={[{ label: 'Admin', href: '/admin' }, { label: 'Logs' }]}
  actions={[
    { label: 'Atualizar', onClick: () => loadLogs(page), variant: 'secondary', icon: RefreshCw }
  ]}
/>

<div class="space-y-6">
  <div class="sm:hidden">
    <Button variant="secondary" class_name="w-full" on:click={() => (showFilterSheet = true)}>
      <SlidersHorizontal size={16} class="mr-2" />
      Filtros
    </Button>
  </div>

  <Card title="Filtros" class="hidden sm:block">
    <div class="grid gap-4 lg:grid-cols-2">
      <FieldInput
        id="log-modulo"
        label="Módulo"
        bind:value={tipo}
        placeholder="Ex.: admin, vendas, conciliacao"
      />
      <FieldInput
        id="log-user"
        label="ID do usuário"
        bind:value={userId}
        placeholder="UUID do usuário"
      />
    </div>
  </Card>

  <BottomSheet bind:open={showFilterSheet} title="Filtrar logs">
    <div class="space-y-4">
      <FieldInput
        id="log-modulo-mobile"
        label="Módulo"
        bind:value={tipo}
        placeholder="Ex.: admin, vendas, conciliacao"
      />
      <FieldInput
        id="log-user-mobile"
        label="ID do usuário"
        bind:value={userId}
        placeholder="UUID do usuário"
      />

      <Button variant="primary" class_name="w-full mt-2" on:click={() => (showFilterSheet = false)}>
        Aplicar filtros
      </Button>
    </div>
  </BottomSheet>

  {#if loading}
    <LoadingState />
  {:else}
    <SimpleTable
      title="Eventos"
      empty={logs.length === 0}
      emptyMessage="Nenhum log encontrado para os filtros atuais."
    >
      <thead>
        <tr>
          <th class="px-5 py-3 text-left">Data</th>
          <th class="px-5 py-3 text-left">Módulo</th>
          <th class="px-5 py-3 text-left">Ação</th>
          <th class="px-5 py-3 text-left">Usuário</th>
          <th class="px-5 py-3 text-left">IP</th>
          <th class="px-5 py-3 text-left">Detalhes</th>
        </tr>
      </thead>
      <tbody>
        {#each logs as log}
          <tr>
            <td data-label="Data" class="px-5 py-3 whitespace-nowrap"
              >{formatDateTime(log.created_at)}</td
            >
            <td data-label="Módulo" class="px-5 py-3">
              <Badge color="yellow" size="sm">{log.modulo || '-'}</Badge>
            </td>
            <td data-label="Ação" class="px-5 py-3 font-medium text-slate-900">{log.acao || '-'}</td
            >
            <td data-label="Usuário" class="max-w-[240px] truncate px-5 py-3">{userLabel(log)}</td>
            <td data-label="IP" class="px-5 py-3 font-mono text-xs text-slate-500"
              >{log.ip || '-'}</td
            >
            <td
              data-label="Detalhes"
              class="max-w-[420px] truncate px-5 py-3 text-xs text-slate-500"
            >
              {formatDetails(log.detalhes)}
            </td>
          </tr>
        {/each}
      </tbody>
    </SimpleTable>

    <PaginationControls {page} {total} {pageSize} onPrev={prevPage} onNext={nextPage} />
  {/if}
</div>
