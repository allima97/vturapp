<script lang="ts">
  import { onMount } from 'svelte';
  import PageHeader from '$lib/components/ui/PageHeader.svelte';
  import Card from '$lib/components/ui/Card.svelte';
  import DataTable from '$lib/components/ui/DataTable.svelte';
  import Button from '$lib/components/ui/Button.svelte';
  import { FieldInput, FieldSelect, FieldTextarea, FieldCheckbox } from '$lib/components/ui';
  import { toast } from '$lib/stores/ui';
  import { Plus, RefreshCw } from '$lib/icons';
  import { apiGet, apiPost, isCanceledApiError } from '$lib/services/api';
  import { createLoadGuard } from '$lib/utils/loadGuard';
  import { escapeHtml } from '$lib/utils/html';
  import { toUserMessage } from '$lib/utils/errors';

  type Template = {
    id: string;
    nome: string;
    assunto: string;
    mensagem: string;
    ativo: boolean;
    sender_key: string;
  };

  const emptyTemplate = {
    id: '',
    nome: '',
    assunto: '',
    mensagem: '',
    ativo: true,
    sender_key: 'avisos'
  };

  let loading = true;
  let saving = false;
  let deleting = false;
  let templates: Template[] = [];
  let form = { ...emptyTemplate };
  const loadGuard = createLoadGuard();

  const columns = [
    {
      key: 'nome',
      label: 'Template',
      sortable: true,
      formatter: (_value: unknown, row: Template) => `
        <div>
          <p class="font-medium text-slate-900">${escapeHtml(row.nome)}</p>
          <p class="text-xs text-slate-500">${escapeHtml(row.assunto)}</p>
        </div>
      `
    },
    { key: 'sender_key', label: 'Remetente', sortable: true },
    {
      key: 'ativo',
      label: 'Status',
      sortable: true,
      formatter: (value: boolean) =>
        value
          ? '<span class="inline-flex rounded-full bg-emerald-100 px-2 py-1 text-xs font-medium text-emerald-700">Ativo</span>'
          : '<span class="inline-flex rounded-full bg-slate-100 px-2 py-1 text-xs font-medium text-slate-700">Inativo</span>'
    }
  ];

  async function loadPage() {
    const request = loadGuard.next();
    loading = true;
    try {
      const payload = await apiGet<{ items?: Template[] }>(
        '/api/v1/admin/avisos',
        undefined,
        request.signal
      );
      if (!loadGuard.isCurrent(request.seq)) return;
      templates = payload.items || [];
      if (!form.id && templates.length > 0) {
        form = { ...templates[0] };
      }
    } catch (err) {
      if (isCanceledApiError(err)) return;
      toast.error(toUserMessage(err, 'Nao foi possivel carregar os templates de aviso.'));
      templates = [];
    } finally {
      if (loadGuard.isCurrent(request.seq)) loading = false;
    }
  }

  async function saveTemplate() {
    saving = true;
    try {
      const payload = await apiPost<{ id?: string }>('/api/v1/admin/avisos', form);
      toast.success('Template salvo com sucesso.');
      form = { ...form, id: form.id || payload.id || '' };
      await loadPage();
    } catch (err) {
      toast.error(toUserMessage(err, 'Erro ao salvar template.'));
    } finally {
      saving = false;
    }
  }

  async function deleteTemplate() {
    deleting = true;
    try {
      if (!form.id) throw new Error('Nenhum template selecionado.');
      await apiPost('/api/v1/admin/avisos', {
        action: 'delete',
        id: form.id
      });
      toast.success('Template removido.');
      form = { ...emptyTemplate };
      await loadPage();
    } catch (err) {
      toast.error(toUserMessage(err, 'Erro ao remover template.'));
    } finally {
      deleting = false;
    }
  }

  function startNewTemplate() {
    form = { ...emptyTemplate };
  }

  onMount(loadPage);
</script>

<svelte:head>
  <title>Avisos | VTUR</title>
</svelte:head>

<PageHeader
  title="Avisos"
  subtitle="Templates administrativos usados em disparos auxiliares do modulo de usuarios."
  breadcrumbs={[{ label: 'Administracao', href: '/admin' }, { label: 'Avisos' }]}
  actions={[
    { label: 'Atualizar', onClick: loadPage, variant: 'secondary', icon: RefreshCw },
    { label: 'Novo template', onClick: startNewTemplate, variant: 'primary', icon: Plus }
  ]}
/>

<div class="space-y-6">
  <DataTable
    title="Templates cadastrados"
    color="financeiro"
    {loading}
    {columns}
    data={templates}
    emptyMessage="Nenhum template administrativo encontrado."
    onRowClick={(row: Template) => (form = { ...row })}
  />

  <Card color="financeiro" title={form.id ? `Editar template: ${form.nome}` : 'Novo template'}>
    <div class="grid gap-4 md:grid-cols-2">
      <FieldInput id="template-nome" label="Nome" bind:value={form.nome} class_name="w-full" />
      <FieldSelect
        id="template-remetente"
        label="Remetente"
        bind:value={form.sender_key}
        options={[
          { value: 'avisos', label: 'Avisos' },
          { value: 'admin', label: 'Admin' },
          { value: 'financeiro', label: 'Financeiro' },
          { value: 'suporte', label: 'Suporte' }
        ]}
        placeholder=""
        class_name="w-full"
      />
      <FieldInput
        id="template-assunto"
        label="Assunto"
        bind:value={form.assunto}
        class_name="md:col-span-2 w-full"
      />
      <FieldTextarea
        id="template-mensagem"
        label="Mensagem"
        bind:value={form.mensagem}
        rows={10}
        class_name="md:col-span-2 w-full"
      />
      <p class="-mt-2 text-xs text-slate-500 md:col-span-2">
        Variaveis disponiveis: <code>{'{{nome}}'}</code>, <code>{'{{email}}'}</code>,
        <code>{'{{empresa}}'}</code>.
      </p>
      <FieldCheckbox
        label="Template ativo"
        bind:checked={form.ativo}
        helper="Disponivel para disparo no detalhe de usuario."
        class_name="rounded-xl border border-slate-200 p-4"
      />
    </div>

    <div class="mt-6 flex flex-wrap gap-3">
      {#if form.id}
        <Button variant="danger" on:click={deleteTemplate} loading={deleting}
          >Excluir template</Button
        >
      {/if}
      <Button variant="primary" color="financeiro" on:click={saveTemplate} loading={saving}
        >Salvar template</Button
      >
    </div>
  </Card>
</div>
