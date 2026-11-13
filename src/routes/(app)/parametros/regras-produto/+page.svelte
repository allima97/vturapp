<script lang="ts">
  import { onMount } from 'svelte';
  import PageHeader from '$lib/components/ui/PageHeader.svelte';
  import Button from '$lib/components/ui/Button.svelte';
  import Dialog from '$lib/components/ui/Dialog.svelte';
  import DataTable from '$lib/components/ui/DataTable.svelte';
  import { FieldInput, FieldSelect } from '$lib/components/ui';
  import { toast } from '$lib/stores/ui';
  import { permissoes } from '$lib/stores/permissoes';
  import { apiDelete, apiGet, apiPost, isCanceledApiError } from '$lib/services/api';
  import { createLoadGuard } from '$lib/utils/loadGuard';
  import { Plus, Trash2, RefreshCw } from '$lib/icons';
  import { toUserMessage } from '$lib/utils/errors';
  import { confirmAction } from '$lib/stores/confirm';

  type ProdutoOption = {
    id: string;
    nome: string | null;
  };

  type RegraOption = {
    id: string;
    nome: string;
    ativo?: boolean;
  };

  type RegraProduto = {
    id: string;
    produto_id: string;
    rule_id: string | null;
    fix_meta_nao_atingida: number | null;
    fix_meta_atingida: number | null;
    fix_super_meta: number | null;
    tipo_produtos?: { nome: string | null } | null;
    commission_rule?: { nome: string | null } | null;
  };

  let items: RegraProduto[] = [];
  let produtos: ProdutoOption[] = [];
  let regras: RegraOption[] = [];
  let loading = true;
  let modalOpen = false;
  let saving = false;
  let deletingId = '';
  let editingId: string | null = null;
  const loadGuard = createLoadGuard();

  let form = createForm();

  function createForm() {
    return {
      produto_id: '',
      rule_id: '',
      fix_meta_nao_atingida: '' as string | number,
      fix_meta_atingida: '' as string | number,
      fix_super_meta: '' as string | number
    };
  }

  $: canEdit =
    !$permissoes.ready || $permissoes.isSystemAdmin || permissoes.can('parametros', 'edit');
  $: canDelete =
    !$permissoes.ready || $permissoes.isSystemAdmin || permissoes.can('parametros', 'admin');

  $: produtoOptions = produtos.map((p) => ({ value: p.id, label: p.nome || '—' }));
  $: regraOptions = [
    { value: '', label: 'Nenhuma (usar fixos)' },
    ...regras.map((r) => ({ value: r.id, label: r.nome }))
  ];

  const columns = [
    {
      key: 'tipo_produtos',
      label: 'Produto',
      sortable: true,
      formatter: (_v: unknown, row: RegraProduto) => row.tipo_produtos?.nome || '—'
    },
    {
      key: 'commission_rule',
      label: 'Regra vinculada',
      sortable: true,
      width: '160px',
      formatter: (_v: unknown, row: RegraProduto) =>
        row.commission_rule?.nome
          ? `<span class="inline-flex rounded-full bg-financeiro-100 px-2.5 py-1 text-xs font-semibold text-financeiro-700">${escapeHtml(row.commission_rule.nome)}</span>`
          : '<span class="inline-flex rounded-full bg-slate-100 px-2.5 py-1 text-xs font-semibold text-slate-600">—</span>'
    },
    {
      key: 'fixos',
      label: 'Fixos',
      sortable: false,
      width: '160px',
      formatter: (_v: unknown, row: RegraProduto) => {
        const parts: string[] = [];
        if (row.fix_meta_nao_atingida != null) parts.push(`Não: ${row.fix_meta_nao_atingida}%`);
        if (row.fix_meta_atingida != null) parts.push(`Sim: ${row.fix_meta_atingida}%`);
        if (row.fix_super_meta != null) parts.push(`Super: ${row.fix_super_meta}%`);
        if (parts.length === 0)
          return '<span class="inline-flex rounded-full bg-slate-100 px-2.5 py-1 text-xs font-semibold text-slate-600">—</span>';
        return `<span class="inline-flex rounded-full bg-amber-100 px-2.5 py-1 text-xs font-semibold text-amber-700">${escapeHtml(parts.join(', '))}</span>`;
      }
    }
  ];

  function escapeHtml(text: string): string {
    const div = typeof document !== 'undefined' ? document.createElement('div') : null;
    if (div) {
      div.textContent = text;
      return div.innerHTML;
    }
    return text
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;');
  }

  async function load() {
    const request = loadGuard.next();
    loading = true;
    try {
      const [itemsPayload, produtosPayload, regrasPayload] = await Promise.all([
        apiGet<{ items?: RegraProduto[] }>(
          '/api/v1/parametros/regras-produto',
          undefined,
          request.signal
        ),
        apiGet<{ items?: ProdutoOption[] }>('/api/v1/tipo-produtos', { all: 1 }, request.signal),
        apiGet<{ items?: RegraOption[] }>(
          '/api/v1/parametros/commission-rules',
          undefined,
          request.signal
        )
      ]);
      if (!loadGuard.isCurrent(request.seq)) return;
      items = itemsPayload.items || [];
      produtos = produtosPayload.items || [];
      regras = (regrasPayload.items || []).filter((r: RegraOption) => r.ativo !== false);
    } catch (err) {
      if (isCanceledApiError(err)) return;
      toast.error(toUserMessage(err, 'Erro ao carregar regras por produto.'));
    } finally {
      if (loadGuard.isCurrent(request.seq)) loading = false;
    }
  }

  function openNew() {
    editingId = null;
    form = createForm();
    modalOpen = true;
  }

  function openEdit(row: RegraProduto) {
    editingId = row.id;
    form = {
      produto_id: row.produto_id,
      rule_id: row.rule_id || '',
      fix_meta_nao_atingida: row.fix_meta_nao_atingida ?? '',
      fix_meta_atingida: row.fix_meta_atingida ?? '',
      fix_super_meta: row.fix_super_meta ?? ''
    };
    modalOpen = true;
  }

  async function save() {
    if (!form.produto_id) {
      toast.error('Produto obrigatório.');
      return;
    }
    const temFixo =
      form.fix_meta_nao_atingida !== '' ||
      form.fix_meta_atingida !== '' ||
      form.fix_super_meta !== '';
    if (!form.rule_id && !temFixo) {
      toast.error('Informe uma regra de comissão ou pelo menos um percentual fixo.');
      return;
    }

    saving = true;
    try {
      await apiPost('/api/v1/parametros/regras-produto', {
        id: editingId || undefined,
        produto_id: form.produto_id,
        rule_id: form.rule_id || null,
        fix_meta_nao_atingida:
          form.fix_meta_nao_atingida === '' ? null : Number(form.fix_meta_nao_atingida),
        fix_meta_atingida: form.fix_meta_atingida === '' ? null : Number(form.fix_meta_atingida),
        fix_super_meta: form.fix_super_meta === '' ? null : Number(form.fix_super_meta)
      });
      toast.success(editingId ? 'Regra atualizada.' : 'Regra criada.');
      modalOpen = false;
      await load();
    } catch (err) {
      toast.error(toUserMessage(err, 'Erro ao salvar regra por produto.'));
    } finally {
      saving = false;
    }
  }

  async function deleteItem(id: string) {
    if (!(await confirmAction('Deseja excluir esta regra?'))) return;
    deletingId = id;
    try {
      await apiDelete('/api/v1/parametros/regras-produto', { id });
      toast.success('Regra excluída.');
      await load();
    } catch (err) {
      toast.error(toUserMessage(err, 'Erro ao excluir regra.'));
    } finally {
      deletingId = '';
    }
  }

  onMount(load);
</script>

<svelte:head>
  <title>Regras por Produto | VTUR</title>
</svelte:head>

<PageHeader
  title="Regras por Produto"
  subtitle="Vincule regras de comissão ou percentuais fixos a produtos específicos."
  color="financeiro"
  breadcrumbs={[{ label: 'Parâmetros', href: '/parametros' }, { label: 'Regras por Produto' }]}
  actions={[
    { label: 'Atualizar', onClick: load, variant: 'secondary', icon: RefreshCw },
    ...(canEdit
      ? [{ label: 'Nova Regra', onClick: openNew, variant: 'primary' as const, icon: Plus }]
      : [])
  ]}
/>

<DataTable
  {columns}
  data={items}
  color="financeiro"
  {loading}
  title="Regras cadastradas"
  searchable={true}
  emptyMessage="Nenhuma regra por produto cadastrada"
  onRowClick={canEdit ? (row) => openEdit(row) : undefined}
  rowActionsAvailable={() => canDelete}
>
  <svelte:fragment slot="row-actions" let:row>
    {#if canDelete}
      <Button
        variant="ghost"
        size="xs"
        color="financeiro"
        on:click={(event) => {
          event.stopPropagation();
          deleteItem(row.id);
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
  title={editingId ? 'Editar Regra por Produto' : 'Nova Regra por Produto'}
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
    <FieldSelect
      id="rp-produto"
      label="Produto"
      bind:value={form.produto_id}
      options={produtoOptions}
      placeholder="Selecione..."
      required={true}
      class_name="w-full"
    />
    <FieldSelect
      id="rp-regra"
      label="Regra de comissão"
      bind:value={form.rule_id}
      options={regraOptions}
      placeholder=""
      class_name="w-full"
    />
    <div class="border-financeiro-200 bg-financeiro-50/40 space-y-4 rounded-xl border p-4">
      <p class="text-financeiro-700 text-sm font-semibold">
        Percentuais fixos (alternativa à regra vinculada)
      </p>
      <div class="grid grid-cols-1 gap-4 md:grid-cols-3">
        <FieldInput
          id="rp-fix-nao"
          label="% meta não atingida"
          type="number"
          bind:value={form.fix_meta_nao_atingida}
          placeholder="0"
          class_name="w-full"
          suffix="%"
        />
        <FieldInput
          id="rp-fix-atingida"
          label="% meta atingida"
          type="number"
          bind:value={form.fix_meta_atingida}
          placeholder="0"
          class_name="w-full"
          suffix="%"
        />
        <FieldInput
          id="rp-fix-super"
          label="% super meta"
          type="number"
          bind:value={form.fix_super_meta}
          placeholder="0"
          class_name="w-full"
          suffix="%"
        />
      </div>
    </div>
  </div>
</Dialog>
