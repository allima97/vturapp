<script lang="ts">
  import { onMount } from 'svelte';
  import PageHeader from '$lib/components/ui/PageHeader.svelte';
  import Card from '$lib/components/ui/Card.svelte';
  import Button from '$lib/components/ui/Button.svelte';
  import DataTable from '$lib/components/ui/DataTable.svelte';
  import { toast } from '$lib/stores/ui';
  import { permissoes } from '$lib/stores/permissoes';
  import { RefreshCw, Trash2, FileText, ExternalLink } from '$lib/icons';
  import { formatDate } from '$lib/utils/formatters';
  import { toUserMessage } from '$lib/utils/errors';
  import { escapeHtml } from '$lib/utils/html';

  import { confirmAction } from '$lib/stores/confirm';
  import { apiDelete, apiGet, isCanceledApiError } from '$lib/services/api';
  import { createLoadGuard } from '$lib/utils/loadGuard';
  type Documento = {
    id: string;
    file_name: string;
    display_name: string | null;
    title: string | null;
    storage_bucket: string;
    storage_path: string;
    mime_type: string | null;
    size_bytes: number | null;
    created_at: string | null;
    uploader?: { nome_completo?: string | null; email?: string | null } | null;
  };

  let documentos: Documento[] = [];
  let loading = true;
  let deletingId = '';
  const loadGuard = createLoadGuard();

  $: canDelete =
    !$permissoes.ready ||
    $permissoes.isSystemAdmin ||
    permissoes.can('documentos_viagens', 'delete') ||
    permissoes.can('operacao', 'delete');

  function formatBytes(bytes?: number | null) {
    const n = Number(bytes);
    if (!Number.isFinite(n) || n <= 0) return '-';
    const units = ['B', 'KB', 'MB', 'GB'];
    let idx = 0;
    let val = n;
    while (val >= 1024 && idx < units.length - 1) {
      val /= 1024;
      idx++;
    }
    return `${val.toFixed(idx === 0 ? 0 : 1)} ${units[idx]}`;
  }

  const columns = [
    {
      key: 'display_name',
      label: 'Nome',
      sortable: true,
      formatter: (v: string | null, row: Documento) => {
        const nome = v || row.file_name;
        const titulo = row.title
          ? `<div class="text-xs text-slate-500">${escapeHtml(row.title)}</div>`
          : '';
        return `<div><div class="font-medium text-slate-900">${escapeHtml(nome)}</div>${titulo}</div>`;
      }
    },
    {
      key: 'mime_type',
      label: 'Tipo',
      sortable: true,
      width: '120px',
      formatter: (v: string | null) => {
        if (!v) return '-';
        if (v.includes('pdf')) return '<span class="text-red-600 text-xs font-medium">PDF</span>';
        if (v.includes('word') || v.includes('document'))
          return '<span class="text-blue-600 text-xs font-medium">Word</span>';
        if (v.includes('text'))
          return '<span class="text-slate-600 text-xs font-medium">Texto</span>';
        return `<span class="text-xs text-slate-500">${escapeHtml(v.split('/')[1] || v)}</span>`;
      }
    },
    {
      key: 'size_bytes',
      label: 'Tamanho',
      sortable: true,
      width: '100px',
      formatter: (v: number | null) => formatBytes(v)
    },
    {
      key: 'created_at',
      label: 'Enviado em',
      sortable: true,
      width: '130px',
      formatter: (v: string | null) => formatDate(v)
    },
    {
      key: 'uploader',
      label: 'Por',
      sortable: false,
      formatter: (_: unknown, row: Documento) =>
        row.uploader?.nome_completo || row.uploader?.email || '-'
    }
  ];

  async function load() {
    const request = loadGuard.next();
    loading = true;
    try {
      const payload = await apiGet<{ items?: Documento[] }>(
        '/api/v1/operacao/documentos-viagens',
        undefined,
        request.signal
      );
      if (!loadGuard.isCurrent(request.seq)) return;
      documentos = payload.items || [];
    } catch (err) {
      if (isCanceledApiError(err)) return;
      toast.error(toUserMessage(err, 'Erro ao carregar documentos.'));
    } finally {
      if (loadGuard.isCurrent(request.seq)) loading = false;
    }
  }

  async function deleteDoc(id: string) {
    if (!(await confirmAction('Deseja excluir este documento?'))) return;
    deletingId = id;
    try {
      await apiDelete('/api/v1/operacao/documentos-viagens', { id });
      toast.success('Documento excluído.');
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
  <title>Documentos de Viagens | VTUR</title>
</svelte:head>

<PageHeader
  title="Documentos de Viagens"
  subtitle="Biblioteca de documentos e templates para uso nas viagens dos clientes."
  color="operacao"
  breadcrumbs={[{ label: 'Documentos de Viagens' }]}
  actions={[{ label: 'Atualizar', onClick: load, variant: 'secondary', icon: RefreshCw }]}
/>

<DataTable
  {columns}
  data={documentos}
  color="operacao"
  {loading}
  title="Documentos disponíveis"
  searchable={true}
  extraSearchKeys={['file_name', 'title', 'mime_type']}
  emptyMessage="Nenhum documento encontrado"
>
  <svelte:fragment slot="row-actions" let:row>
    <div class="flex items-center gap-1">
      {#if canDelete}
        <Button
          variant="ghost"
          size="xs"
          color="operacao"
          title="Excluir"
          disabled={deletingId === row.id}
          on:click={() => deleteDoc(row.id)}
        >
          <Trash2 size={15} />
        </Button>
      {/if}
    </div>
  </svelte:fragment>
</DataTable>

{#if documentos.length === 0 && !loading}
  <Card color="operacao" class="mt-6">
    <div class="flex flex-col items-center justify-center py-12 text-slate-500">
      <FileText size={48} class="mb-4 opacity-30" />
      <p class="font-medium">Nenhum documento cadastrado.</p>
      <p class="mt-1 text-sm">Os documentos são enviados via API ou pelo sistema legado.</p>
    </div>
  </Card>
{/if}
