<script lang="ts">
  import { onMount } from 'svelte';
  import { goto } from '$app/navigation';
  import PageHeader from '$lib/components/ui/PageHeader.svelte';
  import Card from '$lib/components/ui/Card.svelte';
  import DataTable from '$lib/components/ui/DataTable.svelte';
  import { toast } from '$lib/stores/ui';
  import { Plus, RefreshCw } from '$lib/icons';
  import { apiGet, isCanceledApiError } from '$lib/services/api';
  import { createLoadGuard } from '$lib/utils/loadGuard';
  import { escapeHtml } from '$lib/utils/html';
  import { toUserMessage } from '$lib/utils/errors';

  type TipoUsuario = {
    id: string;
    nome: string;
    descricao: string;
    usuarios: number;
    permissoes_padrao: number;
    created_at?: string | null;
  };

  let loading = true;
  let rows: TipoUsuario[] = [];
  const loadGuard = createLoadGuard();

  const columns = [
    {
      key: 'nome',
      label: 'Tipo de usuario',
      sortable: true,
      formatter: (_value: unknown, row: TipoUsuario) => `
        <div>
          <p class="font-medium text-slate-900">${escapeHtml(row.nome)}</p>
          <p class="text-xs text-slate-500">${escapeHtml(row.descricao || 'Sem descricao')}</p>
        </div>
      `
    },
    { key: 'usuarios', label: 'Usuarios', sortable: true },
    { key: 'permissoes_padrao', label: 'Permissoes padrao', sortable: true }
  ];

  async function loadPage() {
    const request = loadGuard.next();
    loading = true;
    try {
      const payload = await apiGet<{ items?: TipoUsuario[] }>(
        '/api/v1/admin/tipos-usuario',
        undefined,
        request.signal
      );
      if (!loadGuard.isCurrent(request.seq)) return;
      rows = payload.items || [];
    } catch (err) {
      if (isCanceledApiError(err)) return;
      toast.error(toUserMessage(err, 'Nao foi possivel carregar os tipos de usuario.'));
    } finally {
      if (loadGuard.isCurrent(request.seq)) loading = false;
    }
  }

  onMount(loadPage);
</script>

<svelte:head>
  <title>Tipos de usuario | VTUR</title>
</svelte:head>

<PageHeader
  title="Tipos de usuario"
  subtitle="Perfis administrativos com permissoes padrao aplicadas a novos usuarios."
  breadcrumbs={[{ label: 'Administracao', href: '/admin' }, { label: 'Tipos de usuario' }]}
  actions={[
    { label: 'Atualizar', onClick: loadPage, variant: 'secondary', icon: RefreshCw },
    { label: 'Novo tipo', href: '/admin/tipos-usuario/novo', variant: 'primary', icon: Plus }
  ]}
/>

<div class="space-y-6">
  <Card color="financeiro">
    <p class="text-sm text-slate-600">
      Cada tipo concentra as permissoes default copiadas para o `modulo_acesso` quando um usuario
      novo e vinculado ao perfil correspondente.
    </p>
  </Card>

  <DataTable
    title="Perfis cadastrados"
    color="financeiro"
    {loading}
    {columns}
    data={rows}
    emptyMessage="Nenhum tipo de usuario encontrado."
    onRowClick={(row: TipoUsuario) => goto(`/admin/tipos-usuario/${row.id}`)}
  />
</div>
