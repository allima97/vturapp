<script lang="ts">
  import { onMount } from 'svelte';
  import type { ComponentType } from 'svelte';
  import { browser } from '$app/environment';
  import { goto } from '$app/navigation';
  import PageHeader from '$lib/components/ui/PageHeader.svelte';
  import Button from '$lib/components/ui/Button.svelte';
  import DataTable from '$lib/components/ui/DataTable.svelte';
  import Dialog from '$lib/components/ui/Dialog.svelte';
  import { Plus, Ticket, FileText, ExternalLink, Copy } from '$lib/icons';
  import { toast } from '$lib/stores/ui';
  import { toUserMessage } from '$lib/utils/errors';
  import { formatDate } from '$lib/utils/formatters';
  import type { VoucherRecord, VoucherAssetRecord, VoucherProvider } from '$lib/vouchers/types';
  import { apiDelete, apiGet, apiPost, isCanceledApiError } from '$lib/services/api';
  import { escapeHtml } from '$lib/utils/html';
  import { createLoadGuard } from '$lib/utils/loadGuard';

  let vouchers: VoucherRecord[] = [];
  let assets: VoucherAssetRecord[] = [];
  let loading = true;
  let showPreview = false;
  let previewVoucher: VoucherRecord | null = null;
  let companyId: string | null = null;
  let deleteConfirmVoucher: VoucherRecord | null = null;
  let showDeleteDialog = false;
  let VoucherPreviewModal: ComponentType | null = null;
  let loadingPreviewModal = false;
  let assetsLoaded = false;
  let duplicating = false;
  const contextGuard = createLoadGuard();
  const dataGuard = createLoadGuard();
  const previewGuard = createLoadGuard();
  
  $: showDeleteDialog = !!deleteConfirmVoucher;
  $: voucherStats = vouchers.reduce(
    (acc, voucher) => {
      acc.total += 1;
      if (voucher.provider === 'special_tours') acc.specialTours += 1;
      if (voucher.provider === 'europamundo') acc.europamundo += 1;
      if (voucher.provider === 'sato_tours') acc.satoTours += 1;
      if (voucher.ativo) acc.ativos += 1;
      return acc;
    },
    { total: 0, specialTours: 0, europamundo: 0, satoTours: 0, ativos: 0 }
  );

  const columns = [
    { key: 'nome', label: 'Nome', sortable: true },
    { 
      key: 'provider', 
      label: 'Fornecedor', 
      sortable: true,
      width: '140px',
      formatter: (v: VoucherProvider) => {
        const labels: Record<VoucherProvider, string> = {
          special_tours: 'Special Tours',
          europamundo: 'Europamundo',
          sato_tours: 'Sato Tours'
        };
        const colors: Record<VoucherProvider, string> = {
          special_tours: 'bg-blue-100 text-blue-700',
          europamundo: 'bg-orange-100 text-orange-700',
          sato_tours: 'bg-emerald-100 text-emerald-700'
        };
        return `<span class="inline-flex px-2 py-1 text-xs font-medium rounded-full ${colors[v] || 'bg-slate-100 text-slate-700'}">${escapeHtml(labels[v] || v || '-')}</span>`;
      }
    },
    { key: 'codigo_fornecedor', label: 'Código', sortable: true, width: '120px' },
    { 
      key: 'data_inicio', 
      label: 'Data Início', 
      sortable: true,
      width: '120px',
      formatter: (v: string) => formatDate(v)
    },
    { 
      key: 'data_fim', 
      label: 'Data Fim', 
      sortable: true,
      width: '120px',
      formatter: (v: string) => formatDate(v)
    },
    { 
      key: 'ativo', 
      label: 'Status', 
      sortable: true,
      width: '100px',
      formatter: (v: boolean) => v 
        ? '<span class="inline-flex px-2 py-1 text-xs font-medium rounded-full bg-green-100 text-green-700">Ativo</span>'
        : '<span class="inline-flex px-2 py-1 text-xs font-medium rounded-full bg-slate-100 text-slate-600">Inativo</span>'
    }
  ];

  onMount(async () => {
    if (await loadUserContext()) {
      await loadData();
    } else {
      loading = false;
    }
  });

  async function loadUserContext() {
    const request = contextGuard.next();
    try {
      const data = await apiGet<{ company_id?: string | null }>(
        '/api/v1/user/context',
        undefined,
        request.signal
      );
      if (!contextGuard.isCurrent(request.seq)) return false;
      companyId = data.company_id || null;
      return true;
    } catch (err) {
      if (isCanceledApiError(err)) return false;
      companyId = null;
      return false;
    }
  }

  async function loadData() {
    const request = dataGuard.next();
    if (!companyId) {
      loading = false;
      return;
    }
    
    loading = true;
    try {
      const vouchersData = await apiGet<{ items?: VoucherRecord[] }>(
        '/api/v1/vouchers',
        { company_id: companyId },
        request.signal
      );
      if (!dataGuard.isCurrent(request.seq)) return;
      vouchers = vouchersData.items || [];
    } catch (err) {
      if (isCanceledApiError(err)) return;
      toast.error(toUserMessage(err, 'Erro ao carregar vouchers'));
    } finally {
      if (dataGuard.isCurrent(request.seq)) loading = false;
    }
  }

  async function loadPreviewDependencies() {
    if (VoucherPreviewModal && assetsLoaded) return true;
    const request = previewGuard.next();
    loadingPreviewModal = true;
    try {
      if (!VoucherPreviewModal) {
        VoucherPreviewModal = (await import('$lib/components/modais/VoucherPreviewModal.svelte')).default;
        if (!previewGuard.isCurrent(request.seq)) return false;
      }
      if (!assetsLoaded && companyId) {
        const assetsData = await apiGet<{ items?: VoucherAssetRecord[] }>(
          '/api/v1/voucher-assets',
          { company_id: companyId },
          request.signal
        );
        if (!previewGuard.isCurrent(request.seq)) return false;
        assets = assetsData.items || [];
        assetsLoaded = true;
      }
      return previewGuard.isCurrent(request.seq);
    } catch (err) {
      if (isCanceledApiError(err)) return false;
      throw err;
    } finally {
      if (previewGuard.isCurrent(request.seq)) loadingPreviewModal = false;
    }
  }

  async function handleRowClick(row: VoucherRecord) {
    previewVoucher = row;
    try {
      if (await loadPreviewDependencies()) {
        showPreview = true;
      }
    } catch (err) {
      toast.error(toUserMessage(err, 'Erro ao carregar prévia do voucher.'));
    }
  }

  function handleNew() {
    goto('/operacao/vouchers/novo');
  }

  function handleEditFromPreview(event: CustomEvent) {
    showPreview = false;
    if (event.detail?.id) {
      goto(`/operacao/vouchers/${event.detail.id}`);
    }
  }

  function handleDeleteFromPreview(event: CustomEvent) {
    const row = event.detail as VoucherRecord | null;
    if (!row) return;
    deleteConfirmVoucher = row;
  }

  async function handleDelete() {
    if (!deleteConfirmVoucher) return;
    
    try {
      await apiDelete(`/api/v1/vouchers/${deleteConfirmVoucher.id}`);
      toast.success('Voucher excluído!');
      if (previewVoucher?.id === deleteConfirmVoucher.id) {
        showPreview = false;
        previewVoucher = null;
      }
      deleteConfirmVoucher = null;
      await loadData();
    } catch (err) {
      toast.error(toUserMessage(err, 'Erro ao excluir voucher'));
    }
  }

  function buildDuplicateName(baseName: string): string {
    const normalized = baseName.trim() || 'Voucher';
    return /\(c[oó]pia\)$/i.test(normalized) ? normalized : `${normalized} (Cópia)`;
  }

  function handleDuplicateFromPreview(event: CustomEvent) {
    const row = event.detail as VoucherRecord | null;
    if (!row) return;
    duplicateVoucher(row);
  }

  async function duplicateVoucher(row: VoucherRecord) {
    if (duplicating) return;

    if (browser && !window.confirm(`Deseja duplicar o voucher "${row.nome}"?`)) {
      return;
    }

    duplicating = true;
    try {
      const { item } = await apiGet<{ item: VoucherRecord }>(`/api/v1/vouchers/${row.id}`);
      if (!item) throw new Error('Voucher não encontrado.');

      const payload = {
        provider: item.provider,
        nome: buildDuplicateName(item.nome),
        codigo_sistema: item.codigo_sistema || null,
        codigo_fornecedor: item.codigo_fornecedor || null,
        reserva_online: item.reserva_online || null,
        passageiros: item.passageiros || null,
        tipo_acomodacao: item.tipo_acomodacao || null,
        operador: item.operador || null,
        resumo: item.resumo || null,
        data_inicio: item.data_inicio || null,
        data_fim: item.data_fim || null,
        ativo: true,
        status: 'rascunho' as const,
        extra_data: item.extra_data || {},
        dias: (item.voucher_dias || []).map((dia, index) => ({
          dia_numero: dia.dia_numero || index + 1,
          titulo: dia.titulo || null,
          descricao: dia.descricao || '',
          data_referencia: dia.data_referencia || null,
          cidade: dia.cidade || null,
          ordem: index
        })),
        hoteis: (item.voucher_hoteis || []).map((hotel, index) => ({
          cidade: hotel.cidade || '',
          hotel: hotel.hotel || '',
          endereco: hotel.endereco || null,
          data_inicio: hotel.data_inicio || null,
          data_fim: hotel.data_fim || null,
          noites: hotel.noites ?? null,
          telefone: hotel.telefone || null,
          contato: hotel.contato || null,
          status: hotel.status || null,
          observacao: hotel.observacao || null,
          ordem: index
        }))
      };

      const response = await apiPost<{ item?: { id?: string } }>('/api/v1/vouchers', payload);
      const newId = response?.item?.id;
      if (!newId) throw new Error('Não foi possível obter o ID do voucher duplicado.');

      toast.success('Voucher duplicado com sucesso!');
      showPreview = false;
      previewVoucher = null;
      await goto(`/operacao/vouchers/${newId}`);
    } catch (err) {
      toast.error(toUserMessage(err, 'Erro ao duplicar voucher'));
    } finally {
      duplicating = false;
    }
  }

</script>

<svelte:head>
  <title>Vouchers | VTUR</title>
</svelte:head>

<PageHeader 
  title="Vouchers"
  subtitle="Gerenciamento de vouchers Special Tours, Europamundo e Sato Tours"
  color="clientes"
  breadcrumbs={[
    { label: 'Vouchers' }
  ]}
  actions={[
    { label: 'Novo Voucher', onClick: handleNew, variant: 'primary', icon: Plus }
  ]}
/>

<!-- Resumo -->
<div class="mb-6 vtur-kpi-grid vtur-kpi-grid-5">
  <div class="vtur-kpi-card">
    <div class="flex h-10 w-10 items-center justify-center rounded-xl bg-teal-50 text-teal-500">
      <Ticket size={20} />
    </div>
    <div>
      <p class="text-sm font-medium text-slate-500">Total</p>
      <p class="text-2xl font-bold text-slate-900">{voucherStats.total}</p>
    </div>
  </div>

  <div class="vtur-kpi-card">
    <div class="flex h-10 w-10 items-center justify-center rounded-xl bg-blue-50 text-blue-500">
      <Ticket size={20} />
    </div>
    <div>
      <p class="text-sm font-medium text-slate-500">Special Tours</p>
      <p class="text-2xl font-bold text-slate-900">
        {voucherStats.specialTours}
      </p>
    </div>
  </div>

  <div class="vtur-kpi-card">
    <div class="flex h-10 w-10 items-center justify-center rounded-xl bg-orange-50 text-orange-500">
      <Ticket size={20} />
    </div>
    <div>
      <p class="text-sm font-medium text-slate-500">Europamundo</p>
      <p class="text-2xl font-bold text-slate-900">
        {voucherStats.europamundo}
      </p>
    </div>
  </div>

  <div class="vtur-kpi-card">
    <div class="flex h-10 w-10 items-center justify-center rounded-xl bg-emerald-50 text-emerald-500">
      <Ticket size={20} />
    </div>
    <div>
      <p class="text-sm font-medium text-slate-500">Sato Tours</p>
      <p class="text-2xl font-bold text-slate-900">
        {voucherStats.satoTours}
      </p>
    </div>
  </div>

  <div class="vtur-kpi-card">
    <div class="flex h-10 w-10 items-center justify-center rounded-xl bg-green-50 text-green-500">
      <FileText size={20} />
    </div>
    <div>
      <p class="text-sm font-medium text-slate-500">Ativos</p>
      <p class="text-2xl font-bold text-slate-900">
        {voucherStats.ativos}
      </p>
    </div>
  </div>
</div>

<!-- Tabela -->
<DataTable
  {columns}
  data={vouchers}
  color="clientes"
  {loading}
  title="Lista de Vouchers"
  searchable={true}
  extraSearchKeys={['codigo_sistema']}
  onRowClick={handleRowClick}
  emptyMessage="Nenhum voucher encontrado"
/>

<!-- Preview Modal -->
{#if VoucherPreviewModal && showPreview}
  <svelte:component
    this={VoucherPreviewModal}
    bind:open={showPreview}
    voucher={previewVoucher}
    {assets}
    on:edit={handleEditFromPreview}
    on:delete={handleDeleteFromPreview}
    on:duplicate={handleDuplicateFromPreview}
  />
{/if}

<!-- Delete Confirmation -->
<Dialog
  bind:open={showDeleteDialog}
  title="Confirmar Exclusão"
  color="financeiro"
  showConfirm={true}
  confirmText="Excluir"
  cancelText="Cancelar"
  confirmVariant="danger"
  onConfirm={handleDelete}
  onCancel={() => deleteConfirmVoucher = null}
>
  <p class="text-slate-600">
    Tem certeza que deseja excluir o voucher <strong>{deleteConfirmVoucher?.nome}</strong>?
    Esta ação não pode ser desfeita.
  </p>
</Dialog>
