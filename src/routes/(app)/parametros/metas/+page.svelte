<script lang="ts">
  import { mobileCardActions } from '$lib/actions/mobileCardActions';
  import { onMount } from 'svelte';
  import PageHeader from '$lib/components/ui/PageHeader.svelte';
  import Card from '$lib/components/ui/Card.svelte';
  import Button from '$lib/components/ui/Button.svelte';
  import Dialog from '$lib/components/ui/Dialog.svelte';
  import {
    BottomSheet,
    FieldCheckbox,
    FieldInput,
    FieldSelect,
    LoadingState
  } from '$lib/components/ui';
  import { addMonthsISODate, todayISODateLocal } from '$lib/date';
  import { formatCurrency, formatYearMonthLabel } from '$lib/utils/formatters';
  import { toast } from '$lib/stores/ui';
  import { permissoes } from '$lib/stores/permissoes';
  import { confirmAction } from '$lib/stores/confirm';
  import { apiDelete, apiGet, apiPost, isCanceledApiError } from '$lib/services/api';
  import { createLoadGuard } from '$lib/utils/loadGuard';
  import {
    CopyCheck,
    Pencil,
    Plus,
    RefreshCw,
    SlidersHorizontal,
    Target,
    Trash2
  } from '$lib/icons';
  import { toUserMessage } from '$lib/utils/errors';

  type Produto = {
    id: string;
    nome: string | null;
    tipo?: string | null;
  };

  type MetaProduto = {
    id?: string | null;
    meta_vendedor_id?: string | null;
    produto_id: string;
    valor: number;
    produto?: Produto | null;
  };

  type Vendedor = {
    id: string;
    nome_completo: string | null;
    email?: string | null;
    company_id?: string | null;
  };

  type Meta = {
    id: string;
    vendedor_id: string;
    periodo: string;
    meta_geral: number;
    meta_diferenciada: number;
    ativo: boolean;
    scope: string | null;
    vendedor?: Vendedor | null;
    meta_produtos?: MetaProduto[];
  };

  type ProdutoFormRow = {
    produto_id: string;
    valor: string;
  };

  type GridRow = {
    vendedor: Vendedor;
    meta: Meta | null;
  };

  const currentMonth = todayISODateLocal().slice(0, 7);

  let periodo = currentMonth;
  let vendedorFiltro = '';
  let metas: Meta[] = [];
  let vendedores: Vendedor[] = [];
  let produtos: Produto[] = [];
  let loading = true;
  let saving = false;
  let deletingId = '';
  let modalOpen = false;
  let bulkOpen = false;
  let showFilterSheet = false;
  let form = createForm();
  let bulkForm = createBulkForm();
  const loadGuard = createLoadGuard();

  $: canEdit =
    !$permissoes.ready ||
    $permissoes.isSystemAdmin ||
    permissoes.can('metas', 'edit') ||
    permissoes.can('parametros', 'edit');
  $: canDelete =
    !$permissoes.ready ||
    $permissoes.isSystemAdmin ||
    permissoes.can('metas', 'delete') ||
    permissoes.can('parametros', 'delete');

  function createForm() {
    return {
      id: '',
      vendedor_id: '',
      periodo,
      meta_geral: '',
      ativo: true,
      meta_produtos: [] as ProdutoFormRow[]
    };
  }

  function createBulkForm() {
    return {
      modo: 'por_vendedor',
      meta_geral: '',
      ativo: true,
      meta_produtos: [] as ProdutoFormRow[]
    };
  }

  function parseMoney(value: unknown) {
    if (typeof value === 'number') return Number.isFinite(value) ? value : 0;
    const raw = String(value ?? '').replace(/\s/g, '');
    const parsed = Number(raw.includes(',') ? raw.replace(/\./g, '').replace(',', '.') : raw);
    return Number.isFinite(parsed) ? parsed : 0;
  }

  function formatInputValue(value: number | string | null | undefined) {
    const num = parseMoney(value);
    return num > 0 ? String(Number(num.toFixed(2))) : '';
  }

  function buildMonthOptions() {
    const options: Array<{ value: string; label: string }> = [];
    for (let i = -24; i <= 12; i++) {
      const value = addMonthsISODate(`${currentMonth}-01`, i).slice(0, 7);
      options.push({ value, label: formatYearMonthLabel(value) });
    }
    return options.reverse();
  }

  const monthOptions = buildMonthOptions();

  $: vendedorOptions = [
    { value: '', label: 'Todos os vendedores' },
    ...vendedores.map((v) => ({ value: v.id, label: v.nome_completo || v.email || 'Vendedor' }))
  ];

  $: vendedorModalOptions = vendedores.map((v) => ({
    value: v.id,
    label: v.nome_completo || v.email || 'Vendedor'
  }));

  $: produtoOptions = produtos.map((produto) => ({
    value: produto.id,
    label: produto.nome || 'Produto'
  }));

  $: metaByVendedor = (() => {
    const byVendedor = new Map<string, Meta>();
    for (const meta of metas) {
      byVendedor.set(meta.vendedor_id, meta);
    }
    return byVendedor;
  })();
  $: rows = vendedores
    .filter((vendedor) => !vendedorFiltro || vendedor.id === vendedorFiltro)
    .map((vendedor) => ({ vendedor, meta: metaByVendedor.get(vendedor.id) || null }));

  $: metasResumo = rows.reduce(
    (acc, row) => {
      acc.bulkCount += 1;
      acc.totalVendas += Number(row.meta?.meta_geral || 0);
      acc.totalProdutos += totalMetaProduto(row.meta);
      if (row.meta?.ativo) acc.metasAtivas += 1;
      if (!row.meta) acc.vendedoresSemMeta += 1;
      return acc;
    },
    { totalVendas: 0, totalProdutos: 0, metasAtivas: 0, vendedoresSemMeta: 0, bulkCount: 0 }
  );
  $: ({ totalVendas, totalProdutos, metasAtivas, vendedoresSemMeta, bulkCount } = metasResumo);

  function totalMetaProduto(meta: Meta | null | undefined) {
    const detalhes = meta?.meta_produtos || [];
    const totalDetalhes = detalhes.reduce((sum, item) => sum + Number(item.valor || 0), 0);
    return totalDetalhes > 0 ? totalDetalhes : Number(meta?.meta_diferenciada || 0);
  }

  function produtoNome(produtoId: string) {
    return produtos.find((produto) => produto.id === produtoId)?.nome || 'Produto';
  }

  function produtoResumo(meta: Meta | null) {
    if (!meta) return 'Sem meta de produto';
    const detalhes = meta.meta_produtos || [];
    if (detalhes.length === 0) {
      return Number(meta.meta_diferenciada || 0) > 0
        ? formatCurrency(Number(meta.meta_diferenciada || 0))
        : 'Sem meta de produto';
    }

    return detalhes
      .map(
        (item) =>
          `${item.produto?.nome || produtoNome(item.produto_id)}: ${formatCurrency(Number(item.valor || 0))}`
      )
      .join(' | ');
  }

  async function load() {
    const request = loadGuard.next();
    loading = true;
    try {
      const payload = await apiGet<{
        items?: Meta[];
        vendedores?: Vendedor[];
        produtos?: Produto[];
      }>(
        '/api/v1/parametros/metas',
        {
          periodo,
          vendedor_id: vendedorFiltro || undefined
        },
        request.signal
      );
      if (!loadGuard.isCurrent(request.seq)) return;
      metas = payload.items || [];
      vendedores = payload.vendedores || [];
      produtos = payload.produtos || [];
    } catch (err) {
      if (isCanceledApiError(err)) return;
      toast.error(toUserMessage(err, 'Erro ao carregar metas.'));
    } finally {
      if (loadGuard.isCurrent(request.seq)) loading = false;
    }
  }

  function addProdutoRow(target: 'form' | 'bulk') {
    if (target === 'form') {
      form = { ...form, meta_produtos: [...form.meta_produtos, { produto_id: '', valor: '' }] };
    } else {
      bulkForm = {
        ...bulkForm,
        meta_produtos: [...bulkForm.meta_produtos, { produto_id: '', valor: '' }]
      };
    }
  }

  function removeProdutoRow(target: 'form' | 'bulk', index: number) {
    if (target === 'form') {
      form = { ...form, meta_produtos: form.meta_produtos.filter((_, i) => i !== index) };
    } else {
      bulkForm = {
        ...bulkForm,
        meta_produtos: bulkForm.meta_produtos.filter((_, i) => i !== index)
      };
    }
  }

  function updateProdutoRow(
    target: 'form' | 'bulk',
    index: number,
    patch: Partial<ProdutoFormRow>
  ) {
    if (target === 'form') {
      const meta_produtos = form.meta_produtos.map((row, i) =>
        i === index ? { ...row, ...patch } : row
      );
      form = { ...form, meta_produtos };
    } else {
      const meta_produtos = bulkForm.meta_produtos.map((row, i) =>
        i === index ? { ...row, ...patch } : row
      );
      bulkForm = { ...bulkForm, meta_produtos };
    }
  }

  function openNew(vendedor?: Vendedor) {
    form = createForm();
    form.vendedor_id = vendedor?.id || vendedorFiltro || vendedores[0]?.id || '';
    modalOpen = true;
  }

  function openEdit(row: GridRow) {
    const meta = row.meta;
    form = {
      id: meta?.id || '',
      vendedor_id: row.vendedor.id,
      periodo: meta?.periodo ? meta.periodo.slice(0, 7) : periodo,
      meta_geral: formatInputValue(meta?.meta_geral || ''),
      ativo: meta?.ativo !== false,
      meta_produtos: (meta?.meta_produtos || []).map((item) => ({
        produto_id: item.produto_id,
        valor: formatInputValue(item.valor)
      }))
    };
    modalOpen = true;
  }

  function openBulk() {
    bulkForm = createBulkForm();
    bulkOpen = true;
  }

  function normalizedProdutoRows(rowsToNormalize: ProdutoFormRow[], divisor = 1) {
    return rowsToNormalize
      .map((row) => ({
        produto_id: row.produto_id,
        valor: parseMoney(row.valor) / Math.max(1, divisor)
      }))
      .filter((row) => row.produto_id && row.valor > 0);
  }

  async function save() {
    if (!form.vendedor_id) {
      toast.error('Selecione o vendedor.');
      return;
    }
    if (!form.periodo) {
      toast.error('Informe o mês da meta.');
      return;
    }

    saving = true;
    try {
      await apiPost('/api/v1/parametros/metas', {
        id: form.id || undefined,
        vendedor_id: form.vendedor_id,
        periodo: form.periodo,
        meta_geral: parseMoney(form.meta_geral),
        ativo: form.ativo,
        meta_produtos: normalizedProdutoRows(form.meta_produtos)
      });
      toast.success(form.id ? 'Meta atualizada.' : 'Meta criada.');
      modalOpen = false;
      await load();
    } catch (err) {
      toast.error(toUserMessage(err, 'Erro ao salvar meta.'));
    } finally {
      saving = false;
    }
  }

  async function saveBulk() {
    if (rows.length === 0) {
      toast.error('Não há vendedores no filtro atual.');
      return;
    }

    const divisor = bulkForm.modo === 'total_loja' ? rows.length : 1;
    const metaGeral = parseMoney(bulkForm.meta_geral) / divisor;
    const metaProdutos = normalizedProdutoRows(bulkForm.meta_produtos, divisor);

    if (metaGeral <= 0 && metaProdutos.length === 0) {
      toast.error('Informe a meta de vendas ou uma meta de produto.');
      return;
    }

    const confirmed = await confirmAction(
      `Isso vai aplicar metas para ${rows.length} vendedor(es) em ${formatYearMonthLabel(periodo)} e substituir as metas de produto desses vendedores. Deseja continuar?`
    );
    if (!confirmed) return;

    saving = true;
    try {
      await apiPost('/api/v1/parametros/metas', {
        periodo,
        items: rows.map((row) => ({
          id: row.meta?.id || undefined,
          vendedor_id: row.vendedor.id,
          periodo,
          meta_geral: metaGeral,
          ativo: bulkForm.ativo,
          meta_produtos: metaProdutos
        }))
      });
      toast.success('Metas aplicadas ao mês.');
      bulkOpen = false;
      await load();
    } catch (err) {
      toast.error(toUserMessage(err, 'Erro ao aplicar metas.'));
    } finally {
      saving = false;
    }
  }

  async function deleteMeta(meta: Meta) {
    if (
      !(await confirmAction(`Excluir a meta de ${formatYearMonthLabel(meta.periodo.slice(0, 7))}?`))
    )
      return;
    deletingId = meta.id;
    try {
      await apiDelete('/api/v1/parametros/metas', { id: meta.id });
      toast.success('Meta excluída.');
      await load();
    } catch (err) {
      toast.error(toUserMessage(err, 'Erro ao excluir meta.'));
    } finally {
      deletingId = '';
    }
  }

  onMount(load);
</script>

<svelte:head>
  <title>Metas | VTUR</title>
</svelte:head>

<PageHeader
  title="Metas de Vendedores"
  subtitle="Filtre o mês, revise o histórico e ajuste metas de vendas e produtos diferenciados."
  color="financeiro"
  breadcrumbs={[{ label: 'Parâmetros', href: '/parametros' }, { label: 'Metas' }]}
  actions={[
    { label: 'Atualizar', onClick: load, variant: 'secondary', icon: RefreshCw },
    ...(canEdit
      ? [
          {
            label: 'Aplicar em lote',
            onClick: openBulk,
            variant: 'secondary' as const,
            icon: CopyCheck
          }
        ]
      : []),
    ...(canEdit
      ? [{ label: 'Nova meta', onClick: () => openNew(), variant: 'primary' as const, icon: Plus }]
      : [])
  ]}
/>

<div class="mb-4 sm:hidden">
  <Button variant="secondary" class_name="w-full" on:click={() => (showFilterSheet = true)}>
    <SlidersHorizontal size={16} class="mr-2" />
    Filtros
  </Button>
</div>

<Card title="Filtros" padding="md" class="mb-6 hidden sm:block">
  <div class="grid gap-4 md:grid-cols-[220px_minmax(220px,320px)] md:items-end">
    <FieldSelect
      id="metas-periodo-filtro"
      label="Mês"
      bind:value={periodo}
      options={monthOptions}
      placeholder={null}
      on:change={load}
    />

    <FieldSelect
      id="metas-vendedor-filtro"
      label="Vendedor"
      bind:value={vendedorFiltro}
      options={vendedorOptions}
      placeholder={null}
      on:change={load}
    />
  </div>
</Card>

<BottomSheet bind:open={showFilterSheet} title="Filtrar metas">
  <div class="space-y-4">
    <FieldSelect
      id="metas-periodo-filtro-mobile"
      label="Mês"
      bind:value={periodo}
      options={monthOptions}
      placeholder={null}
      on:change={load}
    />

    <FieldSelect
      id="metas-vendedor-filtro-mobile"
      label="Vendedor"
      bind:value={vendedorFiltro}
      options={vendedorOptions}
      placeholder={null}
      on:change={load}
    />

    <Button variant="primary" class_name="w-full mt-2" on:click={() => (showFilterSheet = false)}>
      Aplicar filtros
    </Button>
  </div>
</BottomSheet>

<div class="vtur-kpi-grid vtur-kpi-grid-4 mb-6">
  <div class="vtur-kpi-card">
    <div class="flex h-10 w-10 items-center justify-center rounded-xl bg-orange-50 text-orange-500">
      <Target size={20} />
    </div>
    <div>
      <p class="text-sm font-medium text-slate-500">Meta de vendas</p>
      <p class="text-2xl font-bold text-slate-900">{formatCurrency(totalVendas)}</p>
    </div>
  </div>
  <div class="vtur-kpi-card">
    <div class="flex h-10 w-10 items-center justify-center rounded-xl bg-orange-50 text-orange-500">
      <Target size={20} />
    </div>
    <div>
      <p class="text-sm font-medium text-slate-500">Produto diferenciado</p>
      <p class="text-2xl font-bold text-slate-900">{formatCurrency(totalProdutos)}</p>
    </div>
  </div>
  <div class="vtur-kpi-card">
    <div class="flex h-10 w-10 items-center justify-center rounded-xl bg-orange-50 text-orange-500">
      <Target size={20} />
    </div>
    <div>
      <p class="text-sm font-medium text-slate-500">Metas ativas</p>
      <p class="text-2xl font-bold text-slate-900">{metasAtivas}</p>
    </div>
  </div>
  <div class="vtur-kpi-card">
    <div class="flex h-10 w-10 items-center justify-center rounded-xl bg-orange-50 text-orange-500">
      <Target size={20} />
    </div>
    <div>
      <p class="text-sm font-medium text-slate-500">Sem meta no mês</p>
      <p class="text-2xl font-bold text-slate-900">{vendedoresSemMeta}</p>
    </div>
  </div>
</div>

<Card title={`Metas de ${formatYearMonthLabel(periodo)}`} padding="none">
  <div class="overflow-x-auto">
    <table class="table-mobile-cards min-w-full divide-y divide-slate-200">
      <thead class="bg-slate-50">
        <tr>
          <th
            class="px-5 py-3 text-left text-xs font-semibold tracking-wide text-slate-500 uppercase"
            >Vendedor</th
          >
          <th
            class="px-5 py-3 text-right text-xs font-semibold tracking-wide text-slate-500 uppercase"
            >Meta vendas</th
          >
          <th
            class="px-5 py-3 text-left text-xs font-semibold tracking-wide text-slate-500 uppercase"
            >Produto diferenciado</th
          >
          <th
            class="px-5 py-3 text-left text-xs font-semibold tracking-wide text-slate-500 uppercase"
            >Status</th
          >
          <th
            class="px-5 py-3 text-right text-xs font-semibold tracking-wide text-slate-500 uppercase"
            >Ações</th
          >
        </tr>
      </thead>
      <tbody class="divide-y divide-slate-100 bg-white">
        {#if loading}
          <tr>
            <td colspan="5" class="px-5 py-8">
              <LoadingState compact={true} />
            </td>
          </tr>
        {:else if rows.length === 0}
          <tr>
            <td colspan="5" class="px-5 py-8 text-center text-sm text-slate-500"
              >Nenhum vendedor no escopo atual.</td
            >
          </tr>
        {:else}
          {#each rows as row}
            <tr
              class="hover:bg-slate-50"
              use:mobileCardActions={canEdit || (canDelete && Boolean(row.meta))}
            >
              <td data-label="Vendedor" class="px-5 py-4">
                <div class="font-semibold text-slate-900">
                  {row.vendedor.nome_completo || 'Vendedor'}
                </div>
                {#if row.vendedor.email}
                  <div class="text-xs text-slate-500">{row.vendedor.email}</div>
                {/if}
              </td>
              <td
                data-label="Meta vendas"
                class="px-5 py-4 text-right font-semibold text-slate-900"
              >
                {row.meta ? formatCurrency(Number(row.meta.meta_geral || 0)) : '-'}
              </td>
              <td data-label="Produto diferenciado" class="px-5 py-4 text-sm text-slate-600">
                {produtoResumo(row.meta)}
              </td>
              <td data-label="Status" class="px-5 py-4">
                {#if row.meta?.ativo}
                  <span
                    class="inline-flex rounded-full bg-green-100 px-2.5 py-1 text-xs font-semibold text-green-700"
                    >Ativa</span
                  >
                {:else if row.meta}
                  <span
                    class="inline-flex rounded-full bg-slate-100 px-2.5 py-1 text-xs font-semibold text-slate-600"
                    >Inativa</span
                  >
                {:else}
                  <span
                    class="inline-flex rounded-full bg-amber-100 px-2.5 py-1 text-xs font-semibold text-amber-700"
                    >Não cadastrada</span
                  >
                {/if}
              </td>
              <td data-label="Ações" class="vtur-table-row-actions px-5 py-4">
                <div class="flex justify-end gap-2">
                  {#if canEdit}
                    <Button
                      variant="ghost"
                      size="xs"
                      color="financeiro"
                      ariaLabel={row.meta ? 'Editar meta' : 'Cadastrar meta'}
                      on:click={() => openEdit(row)}
                    >
                      {#if row.meta}
                        <Pencil size={15} />
                      {:else}
                        <Plus size={15} />
                      {/if}
                    </Button>
                  {/if}
                  {#if canDelete && row.meta}
                    <Button
                      variant="ghost"
                      size="xs"
                      color="financeiro"
                      class_name="hover:bg-red-50! hover:text-red-600!"
                      loading={deletingId === row.meta.id}
                      on:click={() => deleteMeta(row.meta!)}
                    >
                      <Trash2 size={15} />
                    </Button>
                  {/if}
                </div>
              </td>
            </tr>
          {/each}
        {/if}
      </tbody>
    </table>
  </div>
</Card>

<Dialog
  bind:open={modalOpen}
  title={form.id ? 'Editar meta' : 'Nova meta'}
  color="financeiro"
  size="lg"
  showCancel={true}
  cancelText="Cancelar"
  showConfirm={true}
  confirmText="Salvar"
  loading={saving}
  onConfirm={save}
  onCancel={() => (modalOpen = false)}
>
  <div class="space-y-5">
    <div class="grid gap-4 md:grid-cols-2">
      <FieldSelect
        id="meta-vendedor"
        label="Vendedor"
        bind:value={form.vendedor_id}
        options={vendedorModalOptions}
        required={true}
        disabled={Boolean(form.id)}
      />

      <FieldSelect
        id="meta-periodo"
        label="Mês"
        bind:value={form.periodo}
        options={monthOptions}
        placeholder={null}
        required={true}
      />

      <FieldInput
        money
        id="meta-geral"
        label="Meta de vendas"
        type="number"
        step="0.01"
        min="0"
        prefix="R$"
        bind:value={form.meta_geral}
        placeholder="0,00"
      />

      <div class="flex items-end">
        <FieldCheckbox label="Meta ativa" bind:checked={form.ativo} color="financeiro" />
      </div>
    </div>

    <div class="rounded-lg border border-slate-200">
      <div
        class="flex flex-wrap items-center justify-between gap-3 border-b border-slate-100 px-4 py-3"
      >
        <div>
          <h4 class="text-sm font-semibold text-slate-900">Metas por produto diferenciado</h4>
          <p class="text-xs text-slate-500">
            Use para seguro viagem e outros produtos com meta própria.
          </p>
        </div>
        <Button
          variant="secondary"
          size="xs"
          color="financeiro"
          on:click={() => addProdutoRow('form')}
          disabled={produtos.length === 0}
        >
          <Plus size={14} class="mr-1" />
          Produto
        </Button>
      </div>

      <div class="space-y-3 p-4">
        {#if produtos.length === 0}
          <p class="text-sm text-slate-500">Nenhum produto diferenciado ativo encontrado.</p>
        {:else if form.meta_produtos.length === 0}
          <p class="text-sm text-slate-500">Sem meta de produto para este vendedor.</p>
        {:else}
          {#each form.meta_produtos as item, index}
            <div class="grid gap-3 md:grid-cols-[minmax(180px,1fr)_180px_auto] md:items-end">
              <FieldSelect
                label="Produto"
                value={item.produto_id}
                options={produtoOptions}
                on:change={(event) =>
                  updateProdutoRow('form', index, {
                    produto_id: (event.currentTarget as HTMLSelectElement).value
                  })}
                required={true}
              />
              <FieldInput
                money
                label="Meta"
                type="number"
                step="0.01"
                min="0"
                prefix="R$"
                value={item.valor}
                on:moneyInput={(event) =>
                  updateProdutoRow('form', index, {
                    valor: event.detail
                  })}
              />
              <Button
                variant="ghost"
                color="financeiro"
                on:click={() => removeProdutoRow('form', index)}
                class_name="hover:bg-red-50! hover:text-red-600!"
              >
                <Trash2 size={16} />
              </Button>
            </div>
          {/each}
        {/if}
      </div>
    </div>
  </div>
</Dialog>

<Dialog
  bind:open={bulkOpen}
  title="Aplicar metas em lote"
  description={`Aplicação para ${bulkCount} vendedor(es) em ${formatYearMonthLabel(periodo)}.`}
  color="financeiro"
  size="lg"
  showCancel={true}
  cancelText="Cancelar"
  showConfirm={true}
  confirmText="Aplicar"
  loading={saving}
  confirmDisabled={bulkCount === 0}
  onConfirm={saveBulk}
  onCancel={() => (bulkOpen = false)}
>
  <div class="space-y-5">
    <div class="grid gap-4 md:grid-cols-2">
      <FieldSelect
        id="bulk-modo"
        label="Forma de aplicação"
        bind:value={bulkForm.modo}
        options={[
          { value: 'por_vendedor', label: 'Valor informado para cada vendedor' },
          { value: 'total_loja', label: 'Dividir valor total entre vendedores filtrados' }
        ]}
        placeholder={null}
      />

      <FieldInput
        id="bulk-meta-geral"
        label={bulkForm.modo === 'total_loja'
          ? 'Meta total de vendas'
          : 'Meta de vendas por vendedor'}
        type="number"
        step="0.01"
        min="0"
        prefix="R$"
        bind:value={bulkForm.meta_geral}
        placeholder="0,00"
      />

      <div class="rounded-lg bg-slate-50 p-4 text-sm text-slate-600 md:col-span-2">
        {#if bulkForm.modo === 'total_loja'}
          Cada vendedor receberá {formatCurrency(
            parseMoney(bulkForm.meta_geral) / Math.max(1, bulkCount)
          )} de meta de vendas.
        {:else}
          Cada vendedor receberá {formatCurrency(parseMoney(bulkForm.meta_geral))} de meta de vendas.
        {/if}
      </div>

      <div class="md:col-span-2">
        <FieldCheckbox
          label="Criar metas como ativas"
          bind:checked={bulkForm.ativo}
          color="financeiro"
        />
      </div>
    </div>

    <div class="rounded-lg border border-slate-200">
      <div
        class="flex flex-wrap items-center justify-between gap-3 border-b border-slate-100 px-4 py-3"
      >
        <div>
          <h4 class="text-sm font-semibold text-slate-900">Produto diferenciado</h4>
          <p class="text-xs text-slate-500">
            No modo de divisão, o valor de cada produto também será dividido entre os vendedores
            filtrados.
          </p>
        </div>
        <Button
          variant="secondary"
          size="xs"
          color="financeiro"
          on:click={() => addProdutoRow('bulk')}
          disabled={produtos.length === 0}
        >
          <Plus size={14} class="mr-1" />
          Produto
        </Button>
      </div>

      <div class="space-y-3 p-4">
        {#if bulkForm.meta_produtos.length === 0}
          <p class="text-sm text-slate-500">Nenhuma meta de produto será aplicada.</p>
        {:else}
          {#each bulkForm.meta_produtos as item, index}
            <div class="grid gap-3 md:grid-cols-[minmax(180px,1fr)_180px_auto] md:items-end">
              <FieldSelect
                label="Produto"
                value={item.produto_id}
                options={produtoOptions}
                on:change={(event) =>
                  updateProdutoRow('bulk', index, {
                    produto_id: (event.currentTarget as HTMLSelectElement).value
                  })}
                required={true}
              />
              <FieldInput
                money
                label={bulkForm.modo === 'total_loja' ? 'Meta total' : 'Meta por vendedor'}
                type="number"
                step="0.01"
                min="0"
                prefix="R$"
                value={item.valor}
                on:moneyInput={(event) =>
                  updateProdutoRow('bulk', index, {
                    valor: event.detail
                  })}
              />
              <Button
                variant="ghost"
                color="financeiro"
                on:click={() => removeProdutoRow('bulk', index)}
                class_name="hover:bg-red-50! hover:text-red-600!"
              >
                <Trash2 size={16} />
              </Button>
            </div>
          {/each}
        {/if}
      </div>
    </div>
  </div>
</Dialog>
