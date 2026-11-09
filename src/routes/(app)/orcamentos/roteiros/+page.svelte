<script lang="ts">
  import { onDestroy, onMount } from 'svelte';
  import { VERSAO_ROTEIRO_IDENTIDADE } from '$lib/roteiroProtocolo';
  import { codificarRevisaoExclusao } from '$lib/roteiroRevisaoExclusao';
  import { revisaoRoteiroAtiva, roteiroGeograficoAtivo } from '$lib/config/destinosGeograficos';
  import { goto } from '$app/navigation';
  import PageHeader from '$lib/components/ui/PageHeader.svelte';
  import Card from '$lib/components/ui/Card.svelte';
  import Button from '$lib/components/ui/Button.svelte';
  import Dialog from '$lib/components/ui/Dialog.svelte';
  import DataTable from '$lib/components/ui/DataTable.svelte';
  import { FieldInput } from '$lib/components/ui';
  import { toUserMessage } from '$lib/utils/errors';
  import { toast } from '$lib/stores/ui';
  import { Plus, Trash2, RefreshCw, Map as MapIcon, Calendar } from '$lib/icons';
  import { formatDate } from '$lib/utils/formatters';

  import { confirmAction } from '$lib/stores/confirm';
  import { apiDelete, apiGet, apiPost, isCanceledApiError } from '$lib/services/api';
  type Roteiro = {
    id: string;
    nome: string;
    duracao: number | null;
    inicio_cidade: string | null;
    fim_cidade: string | null;
    created_at: string | null;
    updated_at: string | null;
    revisao?: string;
  };

  function mergeCidadesVisitadas(inicio?: string | null, fim?: string | null): string {
    const origem = String(inicio || '').trim();
    const destino = String(fim || '').trim();
    if (origem && destino && origem.toLowerCase() !== destino.toLowerCase()) {
      return `${origem} • ${destino}`;
    }
    return origem || destino;
  }

  let roteiros: Roteiro[] = [];
  let loading = true;
  let modalOpen = false;
  let saving = false;
  let deletingId = '';
  let editingId: string | null = null;
  let editingRevisao: string | undefined;
  let loadController: AbortController | null = null;
  let loadSeq = 0;

  let form = { nome: '', duracao: '', cidades_visitadas: '' };

  const columns = [
    { key: 'nome', label: 'Nome', sortable: true },
    {
      key: 'duracao',
      label: 'Duração',
      sortable: true,
      width: '100px',
      formatter: (v: number | null) => (v ? `${v} dias` : '-')
    },
    {
      key: 'cidades_visitadas',
      label: 'Cidades Visitadas',
      sortable: false,
      formatter: (_v: unknown, row: Roteiro) =>
        mergeCidadesVisitadas(row.inicio_cidade, row.fim_cidade) || '-'
    },
    {
      key: 'updated_at',
      label: 'Atualizado',
      sortable: true,
      width: '130px',
      formatter: (v: string | null) => formatDate(v)
    }
  ];

  async function load(opts: { silent?: boolean } = {}) {
    const silent = opts.silent ?? false;
    loadController?.abort();
    const controller = new AbortController();
    loadController = controller;
    const seq = ++loadSeq;
    if (!silent) loading = true;
    try {
      const payload = await apiGet<{ roteiros?: Roteiro[] }>(
        '/api/v1/roteiros',
        undefined,
        controller.signal
      );
      if (seq !== loadSeq) return;
      roteiros = payload.roteiros || [];
    } catch (err) {
      if (isCanceledApiError(err)) return;
      toast.error(toUserMessage(err, 'Erro ao carregar roteiros.'));
    } finally {
      if (seq === loadSeq) loading = false;
    }
  }

  function openNew() {
    editingId = null;
    editingRevisao = undefined;
    form = { nome: '', duracao: '', cidades_visitadas: '' };
    modalOpen = true;
  }

  function openEdit(r: Roteiro) {
    editingId = r.id;
    editingRevisao = r.revisao;
    form = {
      nome: r.nome,
      duracao: r.duracao != null ? String(r.duracao) : '',
      cidades_visitadas: mergeCidadesVisitadas(r.inicio_cidade, r.fim_cidade)
    };
    modalOpen = true;
  }

  async function save() {
    if (!form.nome.trim()) {
      toast.error('Nome obrigatório.');
      return;
    }
    if (revisaoRoteiroAtiva && editingId && typeof editingRevisao !== 'string') {
      toast.error('Revisão indisponível. Recarregue a lista antes de salvar.');
      return;
    }
    saving = true;
    try {
      await apiPost('/api/v1/roteiros', {
        ...(roteiroGeograficoAtivo ? { versao_identidade: VERSAO_ROTEIRO_IDENTIDADE } : {}),
        ...(revisaoRoteiroAtiva && editingId ? { revisao: editingRevisao } : {}),
        id: editingId || undefined,
        nome: form.nome,
        duracao: form.duracao ? Number(form.duracao) : null,
        inicio_cidade: form.cidades_visitadas || null,
        fim_cidade: null
      });
      toast.success(editingId ? 'Roteiro atualizado.' : 'Roteiro criado.');
      modalOpen = false;
      await load({ silent: true });
    } catch (err) {
      toast.error(toUserMessage(err, 'Erro ao salvar.'));
    } finally {
      saving = false;
    }
  }

  async function deleteRoteiro(roteiro: Roteiro) {
    if (revisaoRoteiroAtiva && typeof roteiro.revisao !== 'string') {
      toast.error('Revisão indisponível. Recarregue a lista antes de excluir.');
      return;
    }
    if (!(await confirmAction('Deseja excluir este roteiro?'))) return;
    deletingId = roteiro.id;
    try {
      await apiDelete('/api/v1/roteiros', {
        id: roteiro.id,
        ...(revisaoRoteiroAtiva && typeof roteiro.revisao === 'string'
          ? { revisao: codificarRevisaoExclusao(roteiro.revisao) }
          : {})
      });
      toast.success('Roteiro excluído.');
      await load({ silent: true });
    } catch (err) {
      toast.error(toUserMessage(err, 'Erro ao excluir.'));
    } finally {
      deletingId = '';
    }
  }

  onMount(load);

  onDestroy(() => {
    loadController?.abort();
  });
</script>

<svelte:head>
  <title>Roteiros | VTUR</title>
</svelte:head>

<PageHeader
  title="Roteiros Personalizados"
  subtitle="Crie e gerencie roteiros de viagem para usar nos orçamentos."
  color="clientes"
  breadcrumbs={[{ label: 'Orçamentos', href: '/orcamentos' }, { label: 'Roteiros' }]}
  actions={[
    { label: 'Atualizar', onClick: () => load(), variant: 'secondary', icon: RefreshCw },
    { label: 'Novo Roteiro', onClick: openNew, variant: 'primary', icon: Plus }
  ]}
/>

<DataTable
  {columns}
  data={roteiros}
  color="clientes"
  {loading}
  title="Roteiros cadastrados"
  searchable={true}
  emptyMessage="Nenhum roteiro cadastrado"
  onRowClick={(row) => goto(`/orcamentos/roteiros/${row.id}`)}
>
  <svelte:fragment slot="row-actions" let:row>
    <Button
      type="button"
      variant="ghost"
      size="xs"
      ariaLabel="Excluir roteiro"
      title="Excluir"
      disabled={deletingId === row.id}
      class_name="h-8 w-8 p-0! text-slate-400 hover:bg-red-50! hover:text-red-600!"
      on:click={(event) => {
        event.stopPropagation();
        deleteRoteiro(row);
      }}
    >
      <Trash2 size={15} />
    </Button>
  </svelte:fragment>
</DataTable>

<Dialog
  bind:open={modalOpen}
  title={editingId ? 'Editar Roteiro' : 'Novo Roteiro'}
  color="clientes"
  size="md"
  showCancel={true}
  cancelText="Cancelar"
  showConfirm={true}
  confirmText={editingId ? 'Salvar' : 'Criar'}
  loading={saving}
  onConfirm={save}
  onCancel={() => (modalOpen = false)}
>
  <div class="space-y-4">
    <FieldInput
      id="rot-nome"
      label="Nome"
      bind:value={form.nome}
      class_name="w-full"
      placeholder="Ex: Europa Clássica 10 dias"
      required={true}
    />
    <div class="grid grid-cols-1 gap-4 sm:grid-cols-2">
      <FieldInput
        id="rot-duracao"
        label="Duração (dias)"
        type="number"
        min="1"
        bind:value={form.duracao}
        class_name="w-full"
        placeholder="10"
      />
      <FieldInput
        id="rot-cidades-visitadas"
        label="Cidades Visitadas"
        bind:value={form.cidades_visitadas}
        class_name="w-full"
        placeholder="Ex: Lisboa • Paris • Roma"
      />
    </div>
  </div>
</Dialog>
