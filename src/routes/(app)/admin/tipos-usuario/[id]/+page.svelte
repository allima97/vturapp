<script lang="ts">
  import { dev } from '$app/environment';
  import { goto } from '$app/navigation';
  import { page } from '$app/stores';
  import PageHeader from '$lib/components/ui/PageHeader.svelte';
  import Card from '$lib/components/ui/Card.svelte';
  import Button from '$lib/components/ui/Button.svelte';
  import { Checkbox, FieldInput, FieldSelect } from '$lib/components/ui';
  import { toUserMessage } from '$lib/utils/errors';
  import { apiGet, apiPost, isCanceledApiError } from '$lib/services/api';
  import { toast } from '$lib/stores/ui';
  import { createLoadGuard } from '$lib/utils/loadGuard';

  type PermissionEntry = {
    label: string;
    modulo: string;
    permissao: string;
    ativo: boolean;
  };

  type SystemModuleCatalogEntry = {
    key: string;
    label: string;
  };

  type PermissionSection = {
    id: string;
    titulo: string;
    modulos: string[];
  };

  type UserTypeDetailResponse = {
    tipo: {
      id: string;
      name: string;
      description?: string | null;
    };
    usuarios?: Array<{ id: string; nome: string; email: string | null }> | null;
  };

  type UserTypePermissionsResponse = {
    permissions?: PermissionEntry[] | null;
    sections?: PermissionSection[] | null;
  };

  type AdminPermissionsResponse = {
    system_module_catalog?: SystemModuleCatalogEntry[] | null;
    sections?: PermissionSection[] | null;
  };

  const emptyForm = {
    id: '',
    name: '',
    description: ''
  };

  let loading = true;
  let saving = false;
  let deleting = false;
  let form = { ...emptyForm };
  let users: Array<{ id: string; nome: string; email: string | null }> = [];
  let permissions: PermissionEntry[] = [];
  let levels = [
    { value: 'none', label: 'Nenhum' },
    { value: 'view', label: 'Ver' },
    { value: 'create', label: 'Criar' },
    { value: 'edit', label: 'Editar' },
    { value: 'delete', label: 'Excluir' },
    { value: 'admin', label: 'Admin' }
  ];
  let sections: PermissionSection[] = [];
  let lastLoadedId = '';
  const pageGuard = createLoadGuard();

  $: isCreateMode = $page.params.id === 'novo';

  function entriesForSection(section: { modulos: string[] }) {
    return permissions.filter((entry) => section.modulos.includes(entry.label));
  }

  async function loadPage() {
    const request = pageGuard.next();
    loading = true;
    try {
      if (isCreateMode) {
        const payload = await apiGet<AdminPermissionsResponse>(
          '/api/v1/admin/permissoes',
          undefined,
          request.signal
        );
        if (!pageGuard.isCurrent(request.seq)) return;
        permissions = (payload.system_module_catalog || []).map((item) => ({
          label: item.label,
          modulo: item.key,
          permissao: 'none',
          ativo: false
        }));
        sections = payload.sections || [];
        users = [];
        form = { ...emptyForm };
      } else {
        const [detailPayload, permsPayload] = await Promise.all([
          apiGet<UserTypeDetailResponse>(
            `/api/v1/admin/tipos-usuario/${$page.params.id}`,
            undefined,
            request.signal
          ),
          apiGet<UserTypePermissionsResponse>(
            `/api/v1/admin/tipos-usuario/${$page.params.id}/permissoes`,
            undefined,
            request.signal
          )
        ]);
        if (!pageGuard.isCurrent(request.seq)) return;
        form = {
          id: detailPayload.tipo.id,
          name: detailPayload.tipo.name,
          description: detailPayload.tipo.description || ''
        };
        users = detailPayload.usuarios || [];
        permissions = permsPayload.permissions || [];
        sections = permsPayload.sections || [];
      }
    } catch (err) {
      if (isCanceledApiError(err)) return;
      if (dev) console.error(err);
      toast.error('Nao foi possivel carregar o tipo de usuario.');
    } finally {
      if (pageGuard.isCurrent(request.seq)) loading = false;
    }
  }

  async function saveType() {
    saving = true;
    try {
      if (!form.name.trim()) throw new Error('Informe o nome do tipo de usuario.');

      const typePayload = await apiPost<{ id?: string }>('/api/v1/admin/tipos-usuario', {
        id: isCreateMode ? undefined : form.id,
        name: form.name,
        description: form.description
      });

      const targetId = typePayload.id || form.id;
      await apiPost(`/api/v1/admin/tipos-usuario/${targetId}/permissoes`, { permissions });

      toast.success('Tipo de usuario salvo com sucesso.');
      if (isCreateMode && targetId) {
        await goto(`/admin/tipos-usuario/${targetId}`);
      } else {
        await loadPage();
      }
    } catch (err) {
      if (dev) console.error(err);
      toast.error(toUserMessage(err, 'Erro ao salvar tipo de usuario.'));
    } finally {
      saving = false;
    }
  }

  async function deleteType() {
    deleting = true;
    try {
      await apiPost('/api/v1/admin/tipos-usuario', {
        action: 'delete',
        id: form.id
      });
      toast.success('Tipo de usuario removido.');
      await goto('/admin/tipos-usuario');
    } catch (err) {
      if (dev) console.error(err);
      toast.error(toUserMessage(err, 'Erro ao remover tipo de usuario.'));
    } finally {
      deleting = false;
    }
  }

  $: if ($page.params.id && $page.params.id !== lastLoadedId) {
    lastLoadedId = $page.params.id;
    loadPage();
  }
</script>

<svelte:head>
  <title>{isCreateMode ? 'Novo tipo de usuario' : form.name || 'Tipo de usuario'} | VTUR</title>
</svelte:head>

<PageHeader
  title={isCreateMode ? 'Novo tipo de usuario' : form.name || 'Tipo de usuario'}
  subtitle="Definicao do cargo e da matriz default que sera aplicada aos novos usuarios."
  breadcrumbs={[
    { label: 'Administracao', href: '/admin' },
    { label: 'Tipos de usuario', href: '/admin/tipos-usuario' },
    { label: isCreateMode ? 'Novo' : form.name || 'Detalhe' }
  ]}
/>

<div class="space-y-6">
  <Card color="financeiro" title="Dados do perfil">
    <div class="grid gap-4 md:grid-cols-2">
      <FieldInput id="tipo-nome" label="Nome" bind:value={form.name} class_name="w-full" />
      <FieldInput
        id="tipo-descricao"
        label="Descricao"
        bind:value={form.description}
        class_name="w-full"
      />
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

            <FieldSelect
              id={`tipo-perm-${entry.modulo}`}
              label="Nivel"
              bind:value={entry.permissao}
              options={levels}
              placeholder={null}
              disabled={!entry.ativo}
              class_name="w-full"
              on:change={() => {
                permissions = [...permissions];
              }}
            />

            <label
              class="flex items-center gap-2 rounded-xl border border-slate-200 px-3 py-2 lg:self-end"
            >
              <Checkbox
                bind:checked={entry.ativo}
                color="financeiro"
                ariaLabel={`Ativar permissao ${entry.label}`}
                on:change={() => {
                  if (!entry.ativo) entry.permissao = 'none';
                  if (entry.ativo && entry.permissao === 'none') entry.permissao = 'view';
                  permissions = [...permissions];
                }}
              />
              <span class="text-sm text-slate-700">Ativo</span>
            </label>
          </div>
        {/each}
      </div>
    </Card>
  {/each}

  {#if !isCreateMode}
    <Card color="financeiro" title="Usuarios vinculados">
      <div class="space-y-3">
        {#each users as user}
          <div class="rounded-xl border border-slate-200 p-3">
            <p class="font-medium text-slate-900">{user.nome}</p>
            <p class="text-sm text-slate-500">{user.email || '-'}</p>
          </div>
        {/each}

        {#if users.length === 0}
          <p class="text-sm text-slate-500">Nenhum usuario vinculado a este perfil.</p>
        {/if}
      </div>
    </Card>
  {/if}

  <div class="flex flex-wrap gap-3">
    <Button variant="secondary" href="/admin/tipos-usuario">Voltar</Button>
    {#if !isCreateMode}
      <Button variant="danger" on:click={deleteType} loading={deleting}>Excluir tipo</Button>
    {/if}
    <Button variant="primary" color="financeiro" on:click={saveType} loading={saving}
      >Salvar tipo</Button
    >
  </div>
</div>
