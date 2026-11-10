<script lang="ts">
  import { dev } from '$app/environment';
  import { page } from '$app/stores';
  import PageHeader from '$lib/components/ui/PageHeader.svelte';
  import Card from '$lib/components/ui/Card.svelte';
  import Button from '$lib/components/ui/Button.svelte';
  import Badge from '$lib/components/ui/Badge.svelte';
  import { Checkbox, FieldSelect } from '$lib/components/ui';
  import { apiGet, apiPost, isCanceledApiError } from '$lib/services/api';
  import { toast } from '$lib/stores/ui';
  import { toUserMessage } from '$lib/utils/errors';
  import { createLoadGuard } from '$lib/utils/loadGuard';

  type PermissionEntry = {
    label: string;
    modulo: string;
    permissao: string;
    ativo: boolean;
  };

  type PermissionSection = {
    id: string;
    titulo: string;
    modulos: string[];
  };

  type PermissionDetailResponse = {
    user?: { id: string; nome: string; email: string | null } | null;
    permissions?: PermissionEntry[];
    sections?: PermissionSection[];
  };

  let loading = true;
  let saving = false;
  let userInfo: { id: string; nome: string; email: string | null } | null = null;
  let permissions: PermissionEntry[] = [];
  let sections: PermissionSection[] = [];

  const levels = [
    { value: 'none', label: 'Nenhum' },
    { value: 'view', label: 'Ver' },
    { value: 'create', label: 'Criar' },
    { value: 'edit', label: 'Editar' },
    { value: 'delete', label: 'Excluir' },
    { value: 'admin', label: 'Admin' }
  ];

  let lastLoadedId = '';
  const pageGuard = createLoadGuard();

  function entriesForSection(section: Pick<PermissionSection, 'modulos'>) {
    return permissions.filter((entry) => section.modulos.includes(entry.label));
  }

  async function loadPage() {
    const request = pageGuard.next();
    loading = true;
    try {
      const payload = await apiGet<PermissionDetailResponse>(
        `/api/v1/admin/permissoes/${$page.params.id}`,
        undefined,
        request.signal
      );
      if (!pageGuard.isCurrent(request.seq)) return;
      userInfo = payload.user || null;
      permissions = payload.permissions || [];
      sections = payload.sections || [];
    } catch (err) {
      if (isCanceledApiError(err)) return;
      if (dev) console.error(err);
      toast.error(toUserMessage(err, 'Nao foi possivel carregar a matriz de permissoes.'));
    } finally {
      if (pageGuard.isCurrent(request.seq)) loading = false;
    }
  }

  async function savePermissions() {
    saving = true;
    try {
      await apiPost('/api/v1/admin/permissoes', {
        action: 'user',
        user_id: userInfo?.id,
        permissions
      });
      toast.success('Permissoes atualizadas com sucesso.');
      await loadPage();
    } catch (err) {
      if (dev) console.error(err);
      toast.error(toUserMessage(err, 'Erro ao salvar permissoes.'));
    } finally {
      saving = false;
    }
  }

  $: if ($page.params.id && $page.params.id !== lastLoadedId) {
    lastLoadedId = $page.params.id;
    loadPage();
  }
  $: activePermissionsCount = permissions.reduce((total, item) => total + (item.ativo ? 1 : 0), 0);
</script>

<svelte:head>
  <title>Permissoes do usuario | VTUR</title>
</svelte:head>

<PageHeader
  title={userInfo?.nome || 'Permissoes do usuario'}
  subtitle="Matriz completa de modulos, niveis e ativacao por usuario."
  breadcrumbs={[
    { label: 'Administracao', href: '/admin' },
    { label: 'Permissoes', href: '/admin/permissoes' },
    { label: userInfo?.nome || 'Detalhe' }
  ]}
/>

<div class="space-y-6">
  <Card color="financeiro">
    <div class="flex flex-wrap items-center gap-3">
      <Badge color="blue">{userInfo?.email || 'Sem e-mail'}</Badge>
      <Badge color="yellow">{activePermissionsCount} modulos ativos</Badge>
    </div>
  </Card>

  {#each sections as section}
    <Card color="financeiro" title={section.titulo}>
      <div class="space-y-3">
        {#each entriesForSection(section) as entry}
          <div
            class="grid gap-3 rounded-xl border border-slate-200 p-4 lg:grid-cols-[minmax(0,1fr)_180px_100px]"
          >
            <div>
              <p class="font-medium text-slate-900">{entry.label}</p>
              <p class="text-xs text-slate-500">{entry.modulo}</p>
            </div>

            <div>
              <FieldSelect
                id={`perm-${entry.modulo}`}
                bind:value={entry.permissao}
                label="Nivel"
                placeholder={null}
                options={levels}
                class_name="w-full"
                disabled={!entry.ativo}
              />
            </div>

            <label
              class="flex items-center gap-2 rounded-xl border border-slate-200 px-3 py-2 lg:self-end"
            >
              <Checkbox
                bind:checked={entry.ativo}
                on:change={() => {
                  if (!entry.ativo) entry.permissao = 'none';
                  if (entry.ativo && entry.permissao === 'none') entry.permissao = 'view';
                  permissions = [...permissions];
                }}
                ariaLabel={`Ativar ${entry.label}`}
              />
              <span class="text-sm text-slate-700">Ativo</span>
            </label>
          </div>
        {/each}
      </div>
    </Card>
  {/each}

  <div class="flex flex-wrap gap-3">
    <Button variant="secondary" href="/admin/permissoes">Voltar</Button>
    <Button variant="primary" color="financeiro" on:click={savePermissions} loading={saving}>
      Salvar permissoes
    </Button>
  </div>
</div>
