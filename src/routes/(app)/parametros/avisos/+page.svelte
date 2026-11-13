<script lang="ts">
  import { onMount } from 'svelte';
  import PageHeader from '$lib/components/ui/PageHeader.svelte';
  import Card from '$lib/components/ui/Card.svelte';
  import Button from '$lib/components/ui/Button.svelte';
  import Dialog from '$lib/components/ui/Dialog.svelte';
  import DataTable from '$lib/components/ui/DataTable.svelte';
  import { FieldInput, FieldSelect, FieldTextarea, FieldCheckbox } from '$lib/components/ui';
  import { toast } from '$lib/stores/ui';
  import { permissoes } from '$lib/stores/permissoes';
  import { apiGet, apiPost, isCanceledApiError } from '$lib/services/api';
  import { createLoadGuard } from '$lib/utils/loadGuard';
  import { Plus, Trash2, RefreshCw, MessageSquare } from '$lib/icons';
  import { escapeHtml } from '$lib/utils/html';
  import { toUserMessage } from '$lib/utils/errors';

  import { confirmAction } from '$lib/stores/confirm';
  type MessageTemplate = {
    id: string;
    nome: string;
    categoria: string | null;
    titulo: string;
    corpo: string;
    scope: string;
    ativo: boolean;
  };

  const SCOPE_OPTIONS = [
    { value: 'system', label: 'Sistema (todos)' },
    { value: 'master', label: 'Master' },
    { value: 'gestor', label: 'Gestor' },
    { value: 'user', label: 'Usuário' }
  ];

  const OCASIOES = [
    'Aniversário',
    'Natal',
    'Ano Novo',
    'Páscoa',
    'Dia das Mães',
    'Dia dos Pais',
    'Dia dos Namorados',
    'Dia do Cliente',
    'Cliente Premium',
    'Promoção Exclusiva',
    'Sugestão de Destino',
    'Upgrade VIP',
    'Boas-vindas',
    'Pós-viagem',
    'Outro'
  ];

  let templates: MessageTemplate[] = [];
  let loading = true;
  let modalOpen = false;
  let saving = false;
  let deletingId = '';
  let editingId: string | null = null;
  const loadGuard = createLoadGuard();

  let form = createForm();

  function createForm() {
    return { nome: '', categoria: '', titulo: '', corpo: '', scope: 'user', ativo: true };
  }

  $: canEdit =
    !$permissoes.ready || $permissoes.isSystemAdmin || permissoes.can('parametros', 'edit');

  const columns = [
    { key: 'nome', label: 'Nome', sortable: true },
    {
      key: 'categoria',
      label: 'Ocasião',
      sortable: true,
      formatter: (v: string | null) => v || '-'
    },
    {
      key: 'scope',
      label: 'Escopo',
      sortable: true,
      width: '110px',
      formatter: (v: string) => {
        const found = SCOPE_OPTIONS.find((s) => s.value === v);
        return found
          ? `<span class="inline-flex rounded-full bg-slate-100 px-2.5 py-1 text-xs font-medium text-slate-700">${escapeHtml(found.label)}</span>`
          : escapeHtml(v || '-');
      }
    },
    {
      key: 'ativo',
      label: 'Status',
      sortable: true,
      width: '90px',
      formatter: (v: boolean) =>
        v
          ? '<span class="inline-flex rounded-full bg-green-100 px-2.5 py-1 text-xs font-semibold text-green-700">Ativo</span>'
          : '<span class="inline-flex rounded-full bg-slate-100 px-2.5 py-1 text-xs font-semibold text-slate-600">Inativo</span>'
    }
  ];

  async function load() {
    const request = loadGuard.next();
    loading = true;
    try {
      const payload = await apiGet<{ templates?: MessageTemplate[] }>(
        '/api/v1/admin/crm',
        undefined,
        request.signal
      );
      if (!loadGuard.isCurrent(request.seq)) return;
      templates = payload.templates || [];
    } catch (err) {
      if (isCanceledApiError(err)) return;
      toast.error(toUserMessage(err, 'Erro ao carregar templates.'));
    } finally {
      if (loadGuard.isCurrent(request.seq)) loading = false;
    }
  }

  function openNew() {
    editingId = null;
    form = createForm();
    modalOpen = true;
  }

  function openEdit(t: MessageTemplate) {
    editingId = t.id;
    form = {
      nome: t.nome,
      categoria: t.categoria || '',
      titulo: t.titulo,
      corpo: t.corpo,
      scope: t.scope,
      ativo: t.ativo
    };
    modalOpen = true;
  }

  async function save() {
    if (!form.nome.trim()) {
      toast.error('Nome obrigatório.');
      return;
    }
    if (!form.titulo.trim()) {
      toast.error('Título obrigatório.');
      return;
    }
    if (!form.corpo.trim()) {
      toast.error('Corpo obrigatório.');
      return;
    }

    saving = true;
    try {
      await apiPost('/api/v1/admin/crm', {
        entity: 'template',
        action: 'upsert',
        id: editingId || undefined,
        data: {
          nome: form.nome,
          categoria: form.categoria || null,
          titulo: form.titulo,
          corpo: form.corpo,
          scope: form.scope,
          ativo: form.ativo
        }
      });
      toast.success(editingId ? 'Template atualizado.' : 'Template criado.');
      modalOpen = false;
      await load();
    } catch (err) {
      toast.error(toUserMessage(err, 'Erro ao salvar.'));
    } finally {
      saving = false;
    }
  }

  async function deleteTemplate(id: string) {
    if (!(await confirmAction('Deseja excluir este template?'))) return;
    deletingId = id;
    try {
      await apiPost('/api/v1/admin/crm', { entity: 'template', action: 'delete', id });
      toast.success('Template excluído.');
      await load();
    } catch (err) {
      toast.error(toUserMessage(err, 'Erro ao excluir.'));
    } finally {
      deletingId = '';
    }
  }

  onMount(load);
</script>

<svelte:head>
  <title>Avisos / CRM | VTUR</title>
</svelte:head>

<PageHeader
  title="Avisos e Templates CRM"
  subtitle="Gerencie os templates de mensagens para envio aos clientes por ocasião."
  color="financeiro"
  breadcrumbs={[{ label: 'Parâmetros', href: '/parametros' }, { label: 'Avisos / CRM' }]}
  actions={[
    { label: 'Atualizar', onClick: load, variant: 'secondary', icon: RefreshCw },
    ...(canEdit
      ? [{ label: 'Novo Template', onClick: openNew, variant: 'primary' as const, icon: Plus }]
      : [])
  ]}
/>

<DataTable
  {columns}
  data={templates}
  color="financeiro"
  {loading}
  title="Templates de mensagem"
  searchable={true}
  emptyMessage="Nenhum template cadastrado"
  onRowClick={canEdit ? (row) => openEdit(row) : undefined}
  rowActionsAvailable={() => canEdit}
>
  <svelte:fragment slot="row-actions" let:row>
    {#if canEdit}
      <Button
        variant="ghost"
        size="xs"
        color="financeiro"
        on:click={(event) => {
          event.stopPropagation();
          deleteTemplate(row.id);
        }}
        class_name="min-w-0 p-1.5! text-slate-400! hover:bg-red-50! hover:text-red-600!"
        loading={deletingId === row.id}
      >
        <Trash2 size={15} />
      </Button>
    {/if}
  </svelte:fragment>
</DataTable>

<Dialog
  bind:open={modalOpen}
  title={editingId ? 'Editar Template' : 'Novo Template'}
  color="financeiro"
  size="lg"
  showCancel={true}
  cancelText="Cancelar"
  showConfirm={true}
  confirmText={editingId ? 'Salvar' : 'Criar'}
  loading={saving}
  onConfirm={save}
  onCancel={() => (modalOpen = false)}
>
  <div class="space-y-4">
    <div class="grid grid-cols-1 gap-4 md:grid-cols-2">
      <FieldInput
        id="tpl-nome"
        label="Nome"
        required
        bind:value={form.nome}
        placeholder="Nome do template"
        class_name="w-full"
      />
      <FieldSelect
        id="tpl-ocasiao"
        label="Ocasião"
        bind:value={form.categoria}
        options={OCASIOES.map((oc) => ({ value: oc, label: oc }))}
        placeholder="Selecione uma opção"
        class_name="w-full"
      />
      <FieldSelect
        id="tpl-scope"
        label="Escopo"
        bind:value={form.scope}
        options={SCOPE_OPTIONS}
        placeholder=""
        class_name="w-full"
      />
      <FieldCheckbox label="Template ativo" bind:checked={form.ativo} class_name="flex items-end" />
    </div>
    <FieldInput
      id="tpl-titulo"
      label="Título"
      required
      bind:value={form.titulo}
      placeholder="Título da mensagem"
      class_name="w-full"
    />
    <FieldTextarea
      id="tpl-corpo"
      label="Corpo"
      required
      bind:value={form.corpo}
      rows={6}
      placeholder={'Texto da mensagem. Use {{nome_cliente}} para variáveis.'}
      class_name="w-full"
    />
    <p class="text-xs text-slate-500">
      Variáveis disponíveis: {'{{nome_cliente}}'}, {'{{primeiro_nome}}'}, {'{{consultor}}'}
    </p>
  </div>
</Dialog>
