<script lang="ts">
  import { onMount } from 'svelte';
  import PageHeader from '$lib/components/ui/PageHeader.svelte';
  import Card from '$lib/components/ui/Card.svelte';
  import Button from '$lib/components/ui/Button.svelte';
  import { BottomSheet, FieldCheckbox, FieldInput, FieldSelect } from '$lib/components/ui';
  import Dialog from '$lib/components/ui/Dialog.svelte';
  import DataTable from '$lib/components/ui/DataTable.svelte';
  import {
    Plus,
    Edit2,
    Trash2,
    CreditCard,
    CheckCircle,
    XCircle,
    SlidersHorizontal
  } from '$lib/icons';
  import { toast } from '$lib/stores/ui';
  import { toUserMessage } from '$lib/utils/errors';
  import { apiDelete, apiGet, apiPatch, apiPost, isCanceledApiError } from '$lib/services/api';
  import { escapeHtml } from '$lib/utils/html';
  import { createLoadGuard } from '$lib/utils/loadGuard';

  interface FormaPagamento {
    id: string;
    nome: string;
    descricao: string | null;
    paga_comissao?: boolean;
    permite_desconto?: boolean;
    desconto_padrao_pct?: number | null;
    ativo: boolean;
    codigo?: string;
    icone?: string;
    cor?: string;
    ordem?: number;
  }

  interface EmpresaOption {
    id: string;
    nome: string;
  }

  const PT_BR_NUMBER_FORMATTER = new Intl.NumberFormat('pt-BR');
  const contextGuard = createLoadGuard();
  const formasGuard = createLoadGuard();

  let formasPagamento: FormaPagamento[] = [];
  let loading = true;
  let showFormDialog = false;
  let showDeleteDialog = false;
  let processando = false;
  let editando: FormaPagamento | null = null;
  let excluindo: FormaPagamento | null = null;
  let empresas: EmpresaOption[] = [];
  let empresaId = '';
  let filtroRapido: 'todas' | 'ativas' | 'inativas' | 'sem_comissao' | 'com_desconto' = 'todas';
  let showFilterSheet = false;

  let form = {
    nome: '',
    descricao: '',
    paga_comissao: true,
    permite_desconto: false,
    desconto_padrao_pct: null as number | null,
    ativo: true
  };
  let descontoPadraoPctValue = '';

  const columns = [
    {
      key: 'nome',
      label: 'Nome',
      sortable: true,
      formatter: (value: string, row: FormaPagamento) => {
        const detalhes: string[] = [];
        if (row.permite_desconto) detalhes.push('Permite desconto');
        if (row.paga_comissao === false) detalhes.push('Sem comissão');
        return `<div class="flex flex-col"><span class="font-medium text-slate-900">${escapeHtml(value)}</span><span class="text-xs text-slate-500">${escapeHtml(detalhes.join(' · ') || row.descricao || '-')}</span></div>`;
      }
    },
    {
      key: 'descricao',
      label: 'Descrição',
      formatter: (value: string | null) => value || '-'
    },
    {
      key: 'paga_comissao',
      label: 'Paga Comissão',
      width: '130px',
      align: 'center' as const,
      formatter: (value: boolean) =>
        value !== false
          ? '<span class="inline-flex px-2 py-1 text-xs font-medium rounded-full bg-green-100 text-green-700">Sim</span>'
          : '<span class="inline-flex px-2 py-1 text-xs font-medium rounded-full bg-slate-100 text-slate-600">Não</span>'
    },
    {
      key: 'permite_desconto',
      label: 'Desconto',
      width: '120px',
      align: 'center' as const,
      formatter: (value: boolean, row: FormaPagamento) =>
        value
          ? `<span class="inline-flex px-2 py-1 text-xs font-medium rounded-full bg-blue-100 text-blue-700">${PT_BR_NUMBER_FORMATTER.format(Number(row.desconto_padrao_pct || 0))}%</span>`
          : '<span class="inline-flex px-2 py-1 text-xs font-medium rounded-full bg-slate-100 text-slate-600">Não</span>'
    },
    {
      key: 'ativo',
      label: 'Status',
      sortable: true,
      width: '100px',
      formatter: (value: boolean) =>
        value
          ? '<span class="inline-flex px-2 py-1 text-xs font-medium rounded-full bg-green-100 text-green-700">Ativo</span>'
          : '<span class="inline-flex px-2 py-1 text-xs font-medium rounded-full bg-slate-100 text-slate-600">Inativo</span>'
    }
  ];

  $: empresaOptions = empresas.map((empresa) => ({ value: empresa.id, label: empresa.nome }));
  $: temVariasEmpresas = empresas.length > 1;
  $: {
    const normalized = descontoPadraoPctValue.replace(',', '.').trim();
    form.desconto_padrao_pct = normalized ? Number(normalized) : null;
  }

  onMount(async () => {
    if (await carregarContexto()) {
      carregarFormasPagamento();
    } else {
      loading = false;
    }
  });

  async function carregarContexto() {
    const request = contextGuard.next();
    try {
      const data = await apiGet<{ company_id?: string; empresas?: EmpresaOption[] }>(
        '/api/v1/user/context',
        undefined,
        request.signal
      );
      if (!contextGuard.isCurrent(request.seq)) return false;
      empresas = data.empresas || [];
      empresaId = String(data.company_id || empresas[0]?.id || '').trim();
      return true;
    } catch (err) {
      if (isCanceledApiError(err)) return false;
      empresas = [];
      empresaId = '';
      return true;
    }
  }

  async function carregarFormasPagamento(opts: { silent?: boolean } = {}) {
    const request = formasGuard.next();
    const silent = opts.silent ?? false;
    if (!silent) loading = true;
    try {
      const data = await apiGet<{ items?: FormaPagamento[] }>(
        '/api/v1/financeiro/formas-pagamento',
        { empresa_id: empresaId || undefined },
        request.signal
      );
      if (!formasGuard.isCurrent(request.seq)) return;
      formasPagamento = data.items || [];
    } catch (err) {
      if (isCanceledApiError(err)) return;
      toast.error(toUserMessage(err, 'Erro ao carregar dados'));
    } finally {
      if (formasGuard.isCurrent(request.seq)) loading = false;
    }
  }

  function abrirForm(forma?: FormaPagamento) {
    if (forma) {
      editando = forma;
      form = {
        nome: forma.nome,
        descricao: forma.descricao || '',
        paga_comissao: forma.paga_comissao !== false,
        permite_desconto: Boolean(forma.permite_desconto),
        desconto_padrao_pct: forma.desconto_padrao_pct ?? null,
        ativo: forma.ativo
      };
      descontoPadraoPctValue =
        forma.desconto_padrao_pct != null ? String(forma.desconto_padrao_pct) : '';
    } else {
      editando = null;
      form = {
        nome: '',
        descricao: '',
        paga_comissao: true,
        permite_desconto: false,
        desconto_padrao_pct: null,
        ativo: true
      };
      descontoPadraoPctValue = '';
    }
    showFormDialog = true;
  }

  function confirmarExclusao(forma: FormaPagamento) {
    excluindo = forma;
    showDeleteDialog = true;
  }

  async function salvar() {
    if (!form.nome) {
      toast.error('Nome é obrigatório');
      return;
    }

    processando = true;
    try {
      const url = '/api/v1/financeiro/formas-pagamento';
      const method = editando ? 'PATCH' : 'POST';
      const body = editando
        ? { ...form, id: editando.id, empresa_id: empresaId || undefined }
        : { ...form, empresa_id: empresaId || undefined };

      if (method === 'PATCH') await apiPatch(url, body);
      else await apiPost(url, body);

      toast.success(editando ? 'Forma de pagamento atualizada!' : 'Forma de pagamento criada!');
      showFormDialog = false;
      await carregarFormasPagamento({ silent: true });
    } catch (err: unknown) {
      toast.error(toUserMessage(err, 'Erro ao salvar'));
    } finally {
      processando = false;
    }
  }

  async function excluir() {
    if (!excluindo) return;

    processando = true;
    try {
      const result = await apiDelete<{ message?: string }>('/api/v1/financeiro/formas-pagamento', {
        id: excluindo.id
      });
      toast.success(result.message || 'Forma de pagamento excluída!');
      showDeleteDialog = false;
      excluindo = null;
      await carregarFormasPagamento({ silent: true });
    } catch (err: unknown) {
      toast.error(toUserMessage(err, 'Erro ao excluir'));
    } finally {
      processando = false;
    }
  }

  $: ativas = formasPagamento.filter((f) => f.ativo);
  $: inativas = formasPagamento.filter((f) => !f.ativo);
  $: semComissao = formasPagamento.filter((f) => f.paga_comissao === false);
  $: comDesconto = formasPagamento.filter((f) => Boolean(f.permite_desconto));
  $: formasVisiveis = formasPagamento.filter((f) => {
    if (filtroRapido === 'ativas') return f.ativo;
    if (filtroRapido === 'inativas') return !f.ativo;
    if (filtroRapido === 'sem_comissao') return f.paga_comissao === false;
    if (filtroRapido === 'com_desconto') return Boolean(f.permite_desconto);
    return true;
  });
</script>

<svelte:head>
  <title>Formas de Pagamento | VTUR</title>
</svelte:head>

<PageHeader
  title="Formas de Pagamento"
  subtitle="Cadastre e gerencie as formas de pagamento aceitas"
  color="financeiro"
  breadcrumbs={[{ label: 'Financeiro', href: '/financeiro' }, { label: 'Formas de Pagamento' }]}
  actions={[
    {
      label: 'Nova Forma',
      onClick: () => abrirForm(),
      variant: 'primary',
      icon: Plus
    }
  ]}
/>

<div class="vtur-kpi-grid mb-6">
  <div class="vtur-kpi-card">
    <div class="flex h-10 w-10 items-center justify-center rounded-xl bg-teal-50 text-teal-500">
      <CreditCard size={20} />
    </div>
    <div>
      <p class="text-sm font-medium text-slate-500">Total</p>
      <p class="text-2xl font-bold text-slate-900">{formasPagamento.length}</p>
    </div>
  </div>

  <div class="vtur-kpi-card">
    <div class="flex h-10 w-10 items-center justify-center rounded-xl bg-green-50 text-green-500">
      <CheckCircle size={20} />
    </div>
    <div>
      <p class="text-sm font-medium text-slate-500">Ativas</p>
      <p class="text-2xl font-bold text-slate-900">{ativas.length}</p>
    </div>
  </div>

  <div class="vtur-kpi-card">
    <div class="flex h-10 w-10 items-center justify-center rounded-xl bg-blue-50 text-blue-500">
      <XCircle size={20} />
    </div>
    <div>
      <p class="text-sm font-medium text-slate-500">Inativas</p>
      <p class="text-2xl font-bold text-slate-900">{inativas.length}</p>
    </div>
  </div>

  <div class="vtur-kpi-card">
    <div class="flex h-10 w-10 items-center justify-center rounded-xl bg-blue-50 text-blue-500">
      <CheckCircle size={20} />
    </div>
    <div>
      <p class="text-sm font-medium text-slate-500">Com Desconto</p>
      <p class="text-2xl font-bold text-slate-900">{comDesconto.length}</p>
    </div>
  </div>
</div>

<div
  class="rounded-vtur-xl shadow-vtur-lg mb-6 border border-slate-200 bg-white px-5 py-4 text-sm text-slate-600"
>
  A tela agora ajuda a revisar rapidamente formas <strong>ativas</strong>,
  <strong>inativas</strong>, sem comissão e com política de desconto.
</div>

<!-- Mobile: botão de filtros -->
<div class="mb-4 sm:hidden">
  <Button variant="secondary" class_name="w-full" on:click={() => (showFilterSheet = true)}>
    <SlidersHorizontal size={16} class="mr-2" />
    Filtros
    {#if empresaId || filtroRapido !== 'todas'}
      <span class="bg-financeiro-500 ml-2 inline-flex h-2 w-2 rounded-full"></span>
    {/if}
  </Button>
</div>

<Card color="financeiro" class="mb-6 hidden sm:block">
  <div class="flex flex-wrap items-end gap-3">
    {#if temVariasEmpresas}
      <FieldSelect
        id="formas-pagamento-empresa"
        label="Empresa"
        bind:value={empresaId}
        options={empresaOptions}
        placeholder={null}
        class_name="min-w-[240px]"
        on:change={() => carregarFormasPagamento()}
      />
    {/if}
    <Button
      variant={filtroRapido === 'todas' ? 'selected' : 'secondary'}
      size="sm"
      class_name="rounded-full"
      on:click={() => (filtroRapido = 'todas')}
    >
      Todas ({formasPagamento.length})
    </Button>
    <Button
      variant={filtroRapido === 'ativas' ? 'selected' : 'secondary'}
      size="sm"
      color="green"
      class_name="rounded-full"
      on:click={() => (filtroRapido = 'ativas')}
    >
      Ativas ({ativas.length})
    </Button>
    <Button
      variant={filtroRapido === 'inativas' ? 'selected' : 'secondary'}
      size="sm"
      class_name="rounded-full"
      on:click={() => (filtroRapido = 'inativas')}
    >
      Inativas ({inativas.length})
    </Button>
    <Button
      variant={filtroRapido === 'sem_comissao' ? 'selected' : 'secondary'}
      size="sm"
      color="orange"
      class_name="rounded-full"
      on:click={() => (filtroRapido = 'sem_comissao')}
    >
      Sem comissão ({semComissao.length})
    </Button>
    <Button
      variant={filtroRapido === 'com_desconto' ? 'selected' : 'secondary'}
      size="sm"
      color="blue"
      class_name="rounded-full"
      on:click={() => (filtroRapido = 'com_desconto')}
    >
      Com desconto ({comDesconto.length})
    </Button>
  </div>
</Card>

<BottomSheet bind:open={showFilterSheet} title="Filtrar Formas de Pagamento">
  <div class="space-y-4">
    {#if temVariasEmpresas}
      <FieldSelect
        id="formas-pagamento-empresa-mobile"
        label="Empresa"
        bind:value={empresaId}
        options={empresaOptions}
        placeholder={null}
        class_name="w-full"
        on:change={() => carregarFormasPagamento()}
      />
    {/if}

    <div class="space-y-2">
      <p class="text-sm font-medium text-slate-700">Filtro rápido</p>
      <Button
        variant={filtroRapido === 'todas' ? 'selected' : 'secondary'}
        size="sm"
        class_name="w-full rounded-full"
        on:click={() => (filtroRapido = 'todas')}
      >
        Todas ({formasPagamento.length})
      </Button>
      <Button
        variant={filtroRapido === 'ativas' ? 'selected' : 'secondary'}
        size="sm"
        color="green"
        class_name="w-full rounded-full"
        on:click={() => (filtroRapido = 'ativas')}
      >
        Ativas ({ativas.length})
      </Button>
      <Button
        variant={filtroRapido === 'inativas' ? 'selected' : 'secondary'}
        size="sm"
        class_name="w-full rounded-full"
        on:click={() => (filtroRapido = 'inativas')}
      >
        Inativas ({inativas.length})
      </Button>
      <Button
        variant={filtroRapido === 'sem_comissao' ? 'selected' : 'secondary'}
        size="sm"
        color="orange"
        class_name="w-full rounded-full"
        on:click={() => (filtroRapido = 'sem_comissao')}
      >
        Sem comissão ({semComissao.length})
      </Button>
      <Button
        variant={filtroRapido === 'com_desconto' ? 'selected' : 'secondary'}
        size="sm"
        color="blue"
        class_name="w-full rounded-full"
        on:click={() => (filtroRapido = 'com_desconto')}
      >
        Com desconto ({comDesconto.length})
      </Button>
    </div>
  </div>
  <Button variant="primary" class_name="w-full mt-2" on:click={() => (showFilterSheet = false)}>
    Aplicar filtros
  </Button>
</BottomSheet>

<DataTable
  {columns}
  data={formasVisiveis}
  color="financeiro"
  {loading}
  title="Formas de Pagamento Cadastradas"
  emptyMessage="Nenhuma forma de pagamento encontrada"
  searchable={true}
>
  <svelte:fragment slot="actions" let:row>
    <div class="flex items-center gap-2">
      <Button variant="secondary" size="sm" on:click={() => abrirForm(row)}>
        <Edit2 size={16} />
      </Button>
      <Button
        variant="ghost"
        size="sm"
        on:click={() => confirmarExclusao(row)}
        class_name="text-red-600 hover:text-red-700"
      >
        <Trash2 size={16} />
      </Button>
    </div>
  </svelte:fragment>
</DataTable>

<Dialog
  bind:open={showFormDialog}
  title={editando ? 'Editar Forma de Pagamento' : 'Nova Forma de Pagamento'}
  color="financeiro"
  showCancel={true}
  cancelText="Cancelar"
  showConfirm={true}
  confirmText={editando ? 'Salvar' : 'Criar'}
  confirmVariant="primary"
  loading={processando}
  onConfirm={salvar}
>
  <div class="space-y-4">
    {#if temVariasEmpresas && !editando}
      <FieldSelect
        id="forma-pagamento-empresa"
        label="Empresa"
        bind:value={empresaId}
        options={empresaOptions}
        placeholder={null}
        required={true}
        class_name="w-full"
      />
    {/if}
    <FieldInput
      id="forma-pagamento-nome"
      label="Nome"
      bind:value={form.nome}
      placeholder="ex: PIX"
      required={true}
      class_name="w-full"
    />

    <FieldInput
      id="forma-pagamento-descricao"
      label="Descrição"
      bind:value={form.descricao}
      placeholder="Descrição opcional"
      class_name="w-full"
    />

    <FieldInput
      id="forma-pagamento-desconto"
      label="Desconto padrão (%)"
      type="number"
      bind:value={descontoPadraoPctValue}
      min="0"
      max="100"
      step="0.01"
      placeholder="0"
      class_name="w-full"
    />

    <div class="space-y-2">
      <FieldCheckbox label="Paga comissão" bind:checked={form.paga_comissao} color="financeiro" />
      <FieldCheckbox
        label="Permite desconto"
        bind:checked={form.permite_desconto}
        color="financeiro"
      />
      <FieldCheckbox label="Ativo" bind:checked={form.ativo} color="financeiro" />
    </div>
  </div>
</Dialog>

<Dialog
  bind:open={showDeleteDialog}
  title="Excluir Forma de Pagamento"
  color="financeiro"
  showCancel={true}
  cancelText="Cancelar"
  showConfirm={true}
  confirmText="Excluir"
  confirmVariant="danger"
  loading={processando}
  onConfirm={excluir}
>
  {#if excluindo}
    <div class="space-y-3">
      <p class="text-slate-700">
        Tem certeza que deseja excluir a forma de pagamento <strong>{excluindo.nome}</strong>?
      </p>
      <p class="text-sm text-slate-500">
        {#if excluindo.ativo}
          Esta forma de pagamento está ativa. Se houver pagamentos associados, ela será apenas
          inativada.
        {:else}
          Esta forma de pagamento já está inativa.
        {/if}
      </p>
    </div>
  {/if}
</Dialog>
