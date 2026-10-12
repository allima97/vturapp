<script lang="ts">
  import { onMount } from "svelte";
  import type { ComponentType } from "svelte";
  import { browser } from "$app/environment";
  import { goto } from "$app/navigation";
  import { page } from "$app/stores";
  import PageHeader from "$lib/components/ui/PageHeader.svelte";
  import Card from "$lib/components/ui/Card.svelte";
  import Button from "$lib/components/ui/Button.svelte";
  import LoadingState from "$lib/components/ui/LoadingState.svelte";
  import {
    ArrowLeft,
    Edit,
    Trash2,
    Ticket,
    Download,
    Printer,
    CheckCircle,
    MapPin,
    Calendar,
    Hotel,
    Users,
    Info,
    Plane,
    Phone,
    Smartphone,
    AlertCircle,
    FileText,
    ChevronRight,
    Copy,
  } from '$lib/icons';
  import { toast } from "$lib/stores/ui";
  import Dialog from "$lib/components/ui/Dialog.svelte";
  import { fade } from "svelte/transition";
  import { formatDate as formatDateValue } from "$lib/utils/formatters";
  import { toUserMessage } from "$lib/utils/errors";
  import type { VoucherRecord, VoucherAssetRecord } from "$lib/vouchers/types";
  import { apiDelete, apiGet, apiPatch, apiPost, isCanceledApiError } from "$lib/services/api";
  import { createLoadGuard } from "$lib/utils/loadGuard";

  let voucher: VoucherRecord | null = null;
  let assets: VoucherAssetRecord[] = [];
  let loading = true;
  let showDeleteDialog = false;
  let showEditor = false;
  let showPreview = false;
  let companyId: string | null = null;
  let VoucherEditorModal: ComponentType | null = null;
  let VoucherPreviewModal: ComponentType | null = null;
  let loadingEditorModal = false;
  let loadingPreviewModal = false;
  let assetsLoaded = false;
  let duplicating = false;
  const contextGuard = createLoadGuard();
  const voucherGuard = createLoadGuard();
  const assetsGuard = createLoadGuard();

  const providerConfig: Record<
    string,
    { label: string; color: string; bg: string; border: string }
  > = {
    special_tours: {
      label: "Special Tours",
      color: "text-blue-700",
      bg: "bg-blue-50",
      border: "border-blue-200",
    },
    europamundo: {
      label: "Europamundo",
      color: "text-orange-700",
      bg: "bg-orange-50",
      border: "border-orange-200",
    },
    sato_tours: {
      label: "Sato Tours",
      color: "text-emerald-700",
      bg: "bg-emerald-50",
      border: "border-emerald-200",
    },
  };

  const statusConfig: Record<
    string,
    { label: string; color: string; bg: string }
  > = {
    rascunho: { label: "Rascunho", color: "text-amber-600", bg: "bg-amber-50" },
    finalizado: {
      label: "Finalizado",
      color: "text-green-600",
      bg: "bg-green-50",
    },
    cancelado: { label: "Cancelado", color: "text-red-600", bg: "bg-red-50" },
  };

  onMount(async () => {
    const id = $page.params.id;
    if (id) {
      await Promise.all([
        loadUserContext(),
        carregarVoucher(id),
      ]);
    }
  });

  async function loadUserContext() {
    const request = contextGuard.next();
    try {
      const data = await apiGet<{ company_id?: string | null }>(
        "/api/v1/user/context",
        undefined,
        request.signal,
      );
      if (!contextGuard.isCurrent(request.seq)) return;
      companyId = data.company_id || null;
    } catch (err) {
      if (isCanceledApiError(err)) return;
      companyId = null;
    }
  }

  async function carregarVoucher(id: string) {
    const request = voucherGuard.next();
    loading = true;
    try {
      const data = await apiGet<{ item?: VoucherRecord }>(
        `/api/v1/vouchers/${id}`,
        undefined,
        request.signal,
      );
      if (!voucherGuard.isCurrent(request.seq)) return;
      voucher = data.item || null;
      if (!voucher) {
        toast.error("Voucher não encontrado");
        goto("/operacao/vouchers");
      }
    } catch (err) {
      if (isCanceledApiError(err)) return;
      toast.error(toUserMessage(err, "Erro ao carregar voucher"));
      goto("/operacao/vouchers");
    } finally {
      if (voucherGuard.isCurrent(request.seq)) loading = false;
    }
  }

  async function carregarAssets() {
    if (assetsLoaded) return;
    const request = assetsGuard.next();
    try {
      const data = await apiGet<{ items?: VoucherAssetRecord[] }>(
        "/api/v1/voucher-assets",
        undefined,
        request.signal,
      );
      if (!assetsGuard.isCurrent(request.seq)) return;
      assets = data.items || [];
      assetsLoaded = true;
    } catch (err) {
      if (isCanceledApiError(err)) return;
      assets = [];
    }
  }

  async function handleSave(event: CustomEvent) {
    const formData = event.detail;

    try {
      if (formData.id) {
        await apiPatch(`/api/v1/vouchers/${formData.id}`, formData);
      } else {
        await apiPost("/api/v1/vouchers", formData);
      }

      toast.success(formData.id ? "Voucher atualizado!" : "Voucher criado!");
      showEditor = false;
      if ($page.params.id) {
        await carregarVoucher($page.params.id);
      }
    } catch (err) {
      toast.error(toUserMessage(err, "Erro ao salvar voucher"));
    }
  }

  async function loadEditorModal() {
    if (VoucherEditorModal || loadingEditorModal) return;
    loadingEditorModal = true;
    try {
      VoucherEditorModal = (await import("$lib/components/modais/VoucherEditorModal.svelte")).default;
    } finally {
      loadingEditorModal = false;
    }
  }

  async function loadPreviewModal() {
    if (VoucherPreviewModal || loadingPreviewModal) return;
    loadingPreviewModal = true;
    try {
      VoucherPreviewModal = (await import("$lib/components/modais/VoucherPreviewModal.svelte")).default;
    } finally {
      loadingPreviewModal = false;
    }
  }

  async function openEditor() {
    try {
      await Promise.all([loadEditorModal(), carregarAssets()]);
      showEditor = true;
    } catch (err) {
      toast.error(toUserMessage(err, "Erro ao carregar editor de voucher."));
    }
  }

  async function openPreview() {
    try {
      await Promise.all([loadPreviewModal(), carregarAssets()]);
      showPreview = true;
    } catch (err) {
      toast.error(toUserMessage(err, "Erro ao carregar prévia do voucher."));
    }
  }

  async function excluirVoucher() {
    if (!voucher) return;

    try {
      await apiDelete(`/api/v1/vouchers/${voucher.id}`);
      toast.success("Voucher excluído com sucesso!");
      goto("/operacao/vouchers");
    } catch (err) {
      toast.error(toUserMessage(err, "Erro ao excluir voucher"));
    }
  }

  function buildDuplicateName(baseName: string): string {
    const normalized = baseName.trim() || "Voucher";
    return /\(c[oó]pia\)$/i.test(normalized) ? normalized : `${normalized} (Cópia)`;
  }

  async function duplicarVoucher() {
    if (!voucher || duplicating) return;

    if (browser && !window.confirm(`Deseja duplicar o voucher "${voucher.nome}"?`)) {
      return;
    }

    duplicating = true;
    try {
      const payload = {
        provider: voucher.provider,
        nome: buildDuplicateName(voucher.nome),
        codigo_sistema: voucher.codigo_sistema || null,
        codigo_fornecedor: voucher.codigo_fornecedor || null,
        reserva_online: voucher.reserva_online || null,
        passageiros: voucher.passageiros || null,
        tipo_acomodacao: voucher.tipo_acomodacao || null,
        operador: voucher.operador || null,
        resumo: voucher.resumo || null,
        data_inicio: voucher.data_inicio || null,
        data_fim: voucher.data_fim || null,
        ativo: true,
        extra_data: voucher.extra_data || {},
        dias: (voucher.voucher_dias || []).map((dia, index) => ({
          dia_numero: dia.dia_numero || index + 1,
          titulo: dia.titulo || null,
          descricao: dia.descricao || "",
          data_referencia: dia.data_referencia || null,
          cidade: dia.cidade || null,
          ordem: index,
        })),
        hoteis: (voucher.voucher_hoteis || []).map((hotel, index) => ({
          cidade: hotel.cidade || "",
          hotel: hotel.hotel || "",
          endereco: hotel.endereco || null,
          data_inicio: hotel.data_inicio || null,
          data_fim: hotel.data_fim || null,
          noites: hotel.noites ?? null,
          telefone: hotel.telefone || null,
          contato: hotel.contato || null,
          status: hotel.status || null,
          observacao: hotel.observacao || null,
          ordem: index,
        })),
      };

      const response = await apiPost<{ item?: { id?: string } }>("/api/v1/vouchers", payload);
      const newId = response?.item?.id;
      if (!newId) throw new Error("Não foi possível obter o ID do voucher duplicado.");

      toast.success("Voucher duplicado com sucesso!");
      await goto(`/operacao/vouchers/${newId}`);
    } catch (err) {
      toast.error(toUserMessage(err, "Erro ao duplicar voucher"));
    } finally {
      duplicating = false;
    }
  }

  function formatDate(dateString: string | null | undefined): string {
    return formatDateValue(dateString);
  }

  function formatDateRange(
    inicio: string | null | undefined,
    fim: string | null | undefined,
  ): string {
    if (!inicio && !fim) return "-";
    if (inicio && !fim) return formatDate(inicio);
    if (!inicio && fim) return formatDate(fim);
    return `${formatDate(inicio)} a ${formatDate(fim)}`;
  }

  function getStatusBadgeColor(status: string | undefined): string {
    if (!status) return "bg-slate-100 text-slate-600";
    return (
      statusConfig[status]?.bg + " " + statusConfig[status]?.color ||
      "bg-slate-100 text-slate-600"
    );
  }

  function getStatusLabel(status: string | undefined): string {
    if (!status) return "Desconhecido";
    return statusConfig[status]?.label || status;
  }
</script>

<svelte:head>
  <title>{voucher ? `${voucher.nome}` : "Detalhes do Voucher"} | VTUR</title>
</svelte:head>

<PageHeader
  title={voucher?.nome || "Detalhes do Voucher"}
  subtitle={voucher
    ? `${providerConfig[voucher.provider]?.label || voucher.provider} • ${getStatusLabel(voucher.status || undefined)}`
    : ""}
  color="clientes"
  breadcrumbs={[
    { label: "Vouchers", href: "/operacao/vouchers" },
    { label: voucher?.nome || "Detalhes" },
  ]}
  actions={[
    {
      label: "Voltar",
      href: "/operacao/vouchers",
      variant: "secondary",
      icon: ArrowLeft,
    },
    {
      label: "Duplicar",
      onClick: duplicarVoucher,
      variant: "secondary",
      icon: Copy,
    },
  ]}
/>

{#if loading}
  <LoadingState />
{:else if !voucher}
  <div class="text-center py-12">
    <p class="text-slate-500 mb-4">Voucher não encontrado ou sem permissão de acesso.</p>
    <Button variant="secondary" on:click={() => goto('/operacao/vouchers')}>
      <ArrowLeft size={16} class="mr-2" />
      Voltar para Vouchers
    </Button>
  </div>
{:else if voucher}
  <div class="w-full space-y-6 pb-10" in:fade>
    <!-- Header Card -->
    <div class="bg-white rounded-xl shadow-xs border border-slate-200 p-6">
      <div
        class="flex flex-col md:flex-row md:items-center justify-between gap-4"
      >
        <div class="flex items-center gap-4">
          <div
            class="w-16 h-16 rounded-xl bg-gradient-to-br from-clientes-500 to-clientes-600 text-white flex items-center justify-center shadow-lg"
          >
            <Ticket size={32} />
          </div>
          <div>
            <h1 class="text-2xl font-bold text-slate-900">{voucher.nome}</h1>
            <div class="flex items-center gap-3 mt-1">
              <span
                class="px-3 py-1 rounded-full text-sm font-medium {providerConfig[
                  voucher.provider
                ]?.bg} {providerConfig[voucher.provider]
                  ?.color} border {providerConfig[voucher.provider]?.border}"
              >
                {providerConfig[voucher.provider]?.label || voucher.provider}
              </span>
              <span
                class="px-3 py-1 rounded-full text-sm font-medium {getStatusBadgeColor(
                  voucher.status || undefined,
                )}"
              >
                {getStatusLabel(voucher.status || undefined)}
              </span>
              {#if voucher.codigo_fornecedor}
                <span class="text-sm text-slate-500"
                  >Código: {voucher.codigo_fornecedor}</span
                >
              {/if}
            </div>
          </div>
        </div>

        <div class="flex items-center gap-3">
          <Button variant="secondary" on:click={openPreview} loading={loadingPreviewModal}>
            <FileText size={18} class="mr-2" />
            Visualizar
          </Button>
          <Button variant="primary" on:click={openEditor} loading={loadingEditorModal}>
            <Edit size={18} class="mr-2" />
            Editar
          </Button>
          <Button variant="danger" on:click={() => (showDeleteDialog = true)}>
            <Trash2 size={18} class="mr-2" />
            Excluir
          </Button>
        </div>
      </div>
    </div>

    <div class="grid grid-cols-1 lg:grid-cols-3 gap-6">
      <!-- Coluna Principal -->
      <div class="lg:col-span-2 space-y-6">
        <!-- ETAPA 1: Dados da Viagem -->
        <div
          class="bg-white rounded-xl shadow-xs border border-slate-200 overflow-hidden"
        >
          <div
            class="p-4 bg-gradient-to-r from-clientes-50 to-white border-b border-slate-200"
          >
            <h2
              class="text-lg font-semibold text-slate-900 flex items-center gap-2"
            >
              <MapPin size={20} class="text-clientes-500" />
              Dados da Viagem
            </h2>
          </div>
          <div class="p-6">
            <div class="grid grid-cols-1 md:grid-cols-2 gap-6">
              {#if voucher.codigo_sistema}
                <div>
                  <p class="text-sm text-slate-500 mb-1">Código interno</p>
                  <p class="font-medium text-slate-900">
                    {voucher.codigo_sistema}
                  </p>
                </div>
              {/if}

              {#if voucher.reserva_online}
                <div>
                  <p class="text-sm text-slate-500 mb-1">Reserva Online</p>
                  <p class="font-medium text-slate-900">
                    {voucher.reserva_online}
                  </p>
                </div>
              {/if}

              {#if voucher.tipo_acomodacao}
                <div>
                  <p class="text-sm text-slate-500 mb-1">Tipo de Acomodação</p>
                  <p class="font-medium text-slate-900">
                    {voucher.tipo_acomodacao}
                  </p>
                </div>
              {/if}

              {#if voucher.operador}
                <div>
                  <p class="text-sm text-slate-500 mb-1">Operador</p>
                  <p class="font-medium text-slate-900">{voucher.operador}</p>
                </div>
              {/if}

              <div>
                <p class="text-sm text-slate-500 mb-1">Período</p>
                <p class="font-medium text-slate-900">
                  {formatDateRange(voucher.data_inicio, voucher.data_fim)}
                </p>
              </div>

              {#if voucher.extra_data?.localizador_agencia}
                <div>
                  <p class="text-sm text-slate-500 mb-1">Localizador Agência</p>
                  <p class="font-medium text-slate-900">
                    {voucher.extra_data.localizador_agencia}
                  </p>
                </div>
              {/if}
            </div>

            {#if voucher.resumo}
              <div class="mt-6 pt-6 border-t border-slate-100">
                <p class="text-sm text-slate-500 mb-2">Resumo da Viagem</p>
                <p class="text-slate-700 whitespace-pre-line">
                  {voucher.resumo}
                </p>
              </div>
            {/if}

            <!-- Passageiros -->
            {#if voucher.extra_data?.passageiros_detalhes && voucher.extra_data.passageiros_detalhes.length > 0}
              <div class="mt-6 pt-6 border-t border-slate-100">
                <div class="flex items-center gap-2 mb-4">
                  <Users size={18} class="text-clientes-500" />
                  <h3 class="font-semibold text-slate-900">
                    Passageiros ({voucher.extra_data.passageiros_detalhes
                      .length})
                  </h3>
                </div>
                <div class="space-y-2">
                  {#each voucher.extra_data.passageiros_detalhes as p, i}
                    <div
                      class="p-3 bg-slate-50 rounded-lg flex items-center justify-between"
                    >
                      <div>
                        <p class="font-medium text-slate-900">
                          {p.nome || "Sem nome"}
                        </p>
                        {#if p.passaporte || p.nacionalidade}
                          <p class="text-sm text-slate-500">
                            {p.passaporte ? `Passaporte: ${p.passaporte}` : ""}
                            {p.passaporte && p.nacionalidade ? " • " : ""}
                            {p.nacionalidade || ""}
                          </p>
                        {/if}
                      </div>
                      {#if p.tipo}
                        <span
                          class="px-2 py-1 text-xs rounded-full bg-slate-200 text-slate-700"
                        >
                          {p.tipo}
                        </span>
                      {/if}
                    </div>
                  {/each}
                </div>
              </div>
            {:else if voucher.passageiros}
              <div class="mt-6 pt-6 border-t border-slate-100">
                <div class="flex items-center gap-2 mb-4">
                  <Users size={18} class="text-clientes-500" />
                  <h3 class="font-semibold text-slate-900">Passageiros</h3>
                </div>
                <p class="text-slate-700 whitespace-pre-line">
                  {voucher.passageiros}
                </p>
              </div>
            {/if}
          </div>
        </div>

        <!-- ETAPA 2: Dia a Dia -->
        {#if voucher.voucher_dias && voucher.voucher_dias.length > 0}
          <div
            class="bg-white rounded-xl shadow-xs border border-slate-200 overflow-hidden"
          >
            <div
              class="p-4 bg-gradient-to-r from-amber-50 to-white border-b border-slate-200"
            >
              <h2
                class="text-lg font-semibold text-slate-900 flex items-center gap-2"
              >
                <Calendar size={20} class="text-amber-500" />
                Dia a Dia do Circuito ({voucher.voucher_dias.length} dias)
              </h2>
            </div>
            <div class="p-6">
              <div class="space-y-4">
                {#each voucher.voucher_dias.sort((a, b) => (a.ordem || 0) - (b.ordem || 0)) as dia, i}
                  <div
                    class="p-4 bg-slate-50 rounded-xl border border-slate-200"
                  >
                    <div class="flex items-start gap-4">
                      <div
                        class="w-12 h-12 rounded-full bg-clientes-500 text-white flex items-center justify-center font-bold shrink-0"
                      >
                        {dia.dia_numero}
                      </div>
                      <div class="flex-1 min-w-0">
                        <div class="flex items-center gap-3 flex-wrap">
                          {#if dia.titulo}
                            <h3 class="font-semibold text-slate-900">
                              {dia.titulo}
                            </h3>
                          {/if}
                          {#if dia.cidade}
                            <span
                              class="px-2 py-0.5 text-xs rounded-full bg-slate-200 text-slate-700"
                            >
                              {dia.cidade}
                            </span>
                          {/if}
                          {#if dia.data_referencia}
                            <span class="text-sm text-slate-500"
                              >{formatDate(dia.data_referencia)}</span
                            >
                          {/if}
                        </div>
                        {#if dia.descricao}
                          <p class="text-slate-700 mt-2 whitespace-pre-line">
                            {dia.descricao}
                          </p>
                        {/if}
                      </div>
                    </div>
                  </div>
                {/each}
              </div>
            </div>
          </div>
        {/if}

        <!-- ETAPA 3: Hotéis -->
        {#if voucher.voucher_hoteis && voucher.voucher_hoteis.length > 0}
          <div
            class="bg-white rounded-xl shadow-xs border border-slate-200 overflow-hidden"
          >
            <div
              class="p-4 bg-gradient-to-r from-amber-50 to-white border-b border-slate-200"
            >
              <h2
                class="text-lg font-semibold text-slate-900 flex items-center gap-2"
              >
                <Hotel size={20} class="text-amber-500" />
                Hotéis Confirmados ({voucher.voucher_hoteis.length})
              </h2>
            </div>
            <div class="p-6">
              <div class="grid grid-cols-1 md:grid-cols-2 gap-4">
                {#each voucher.voucher_hoteis.sort((a, b) => (a.ordem || 0) - (b.ordem || 0)) as hotel, i}
                  <div
                    class="p-4 bg-slate-50 rounded-xl border border-slate-200"
                  >
                    <div class="flex items-start gap-3">
                      <div
                        class="w-10 h-10 rounded-full bg-amber-500 text-white flex items-center justify-center shrink-0"
                      >
                        <Hotel size={20} />
                      </div>
                      <div class="flex-1 min-w-0">
                        <h3 class="font-semibold text-slate-900">
                          {hotel.hotel}
                        </h3>
                        <p class="text-sm text-slate-500">{hotel.cidade}</p>

                        {#if hotel.data_inicio || hotel.data_fim}
                          <p class="text-sm text-slate-600 mt-2">
                            <span class="font-medium">Período:</span>
                            {formatDateRange(hotel.data_inicio, hotel.data_fim)}
                            {#if hotel.noites}
                              <span class="text-slate-500"
                                >({hotel.noites} noites)</span
                              >
                            {/if}
                          </p>
                        {/if}

                        {#if hotel.endereco}
                          <p class="text-sm text-slate-600 mt-1">
                            <span class="font-medium">Endereço:</span>
                            {hotel.endereco}
                          </p>
                        {/if}

                        {#if hotel.telefone}
                          <p class="text-sm text-slate-600 mt-1">
                            <span class="font-medium">Telefone:</span>
                            {hotel.telefone}
                          </p>
                        {/if}

                        {#if hotel.status}
                          <span
                            class="inline-block mt-2 px-2 py-1 text-xs rounded-full
                            {hotel.status === 'Confirmado'
                              ? 'bg-green-100 text-green-700'
                              : hotel.status === 'Pendente'
                                ? 'bg-amber-100 text-amber-700'
                                : 'bg-slate-100 text-slate-700'}"
                          >
                            {hotel.status}
                          </span>
                        {/if}

                        {#if hotel.observacao}
                          <p class="text-sm text-slate-500 mt-2 italic">
                            {hotel.observacao}
                          </p>
                        {/if}
                      </div>
                    </div>
                  </div>
                {/each}
              </div>
            </div>
          </div>
        {/if}

        <!-- ETAPA 4: Extra Data -->
        {#if voucher.extra_data && (voucher.extra_data.traslado_chegada?.detalhes || voucher.extra_data.traslado_saida?.detalhes || voucher.extra_data.informacoes_importantes || (voucher.extra_data.apps_recomendados && voucher.extra_data.apps_recomendados.length > 0) || voucher.extra_data.emergencia)}
          <div
            class="bg-white rounded-xl shadow-xs border border-slate-200 overflow-hidden"
          >
            <div
              class="p-4 bg-gradient-to-r from-purple-50 to-white border-b border-slate-200"
            >
              <h2
                class="text-lg font-semibold text-slate-900 flex items-center gap-2"
              >
                <Info size={20} class="text-purple-500" />
                Informações Adicionais
              </h2>
            </div>
            <div class="p-6 space-y-6">
              <!-- Traslados -->
              {#if voucher.extra_data.traslado_chegada?.detalhes || voucher.extra_data.traslado_saida?.detalhes}
                <div class="grid grid-cols-1 md:grid-cols-2 gap-4">
                  {#if voucher.extra_data.traslado_chegada?.detalhes}
                    <div
                      class="p-4 bg-green-50 rounded-xl border border-green-200"
                    >
                      <h3
                        class="font-semibold text-green-900 mb-3 flex items-center gap-2"
                      >
                        <Plane size={18} class="rotate-45" />
                        Traslado Chegada
                      </h3>
                      <p class="text-green-800 whitespace-pre-line">
                        {voucher.extra_data.traslado_chegada.detalhes}
                      </p>
                      {#if voucher.extra_data.traslado_chegada.telefone_transferista}
                        <p class="text-sm text-green-700 mt-2">
                          <span class="font-medium">Telefone:</span>
                          {voucher.extra_data.traslado_chegada
                            .telefone_transferista}
                        </p>
                      {/if}
                      {#if voucher.extra_data.traslado_chegada.notas}
                        <p class="text-sm text-green-600 mt-2 italic">
                          {voucher.extra_data.traslado_chegada.notas}
                        </p>
                      {/if}
                    </div>
                  {/if}

                  {#if voucher.extra_data.traslado_saida?.detalhes}
                    <div
                      class="p-4 bg-orange-50 rounded-xl border border-orange-200"
                    >
                      <h3
                        class="font-semibold text-orange-900 mb-3 flex items-center gap-2"
                      >
                        <Plane size={18} class="-rotate-45" />
                        Traslado Saída
                      </h3>
                      <p class="text-orange-800 whitespace-pre-line">
                        {voucher.extra_data.traslado_saida.detalhes}
                      </p>
                      {#if voucher.extra_data.traslado_saida.telefone_transferista}
                        <p class="text-sm text-orange-700 mt-2">
                          <span class="font-medium">Telefone:</span>
                          {voucher.extra_data.traslado_saida
                            .telefone_transferista}
                        </p>
                      {/if}
                      {#if voucher.extra_data.traslado_saida.notas}
                        <p class="text-sm text-orange-600 mt-2 italic">
                          {voucher.extra_data.traslado_saida.notas}
                        </p>
                      {/if}
                    </div>
                  {/if}
                </div>
              {/if}

              <!-- Informações Importantes -->
              {#if voucher.extra_data.informacoes_importantes}
                <div class="p-4 bg-amber-50 rounded-xl border border-amber-200">
                  <h3
                    class="font-semibold text-amber-900 mb-3 flex items-center gap-2"
                  >
                    <AlertCircle size={18} />
                    Informações Importantes
                  </h3>
                  <p class="text-amber-800 whitespace-pre-line">
                    {voucher.extra_data.informacoes_importantes}
                  </p>
                </div>
              {/if}

              <!-- Apps Recomendados -->
              {#if voucher.extra_data.apps_recomendados && voucher.extra_data.apps_recomendados.length > 0}
                <div>
                  <h3
                    class="font-semibold text-slate-900 mb-3 flex items-center gap-2"
                  >
                    <Smartphone size={18} class="text-blue-500" />
                    Apps Recomendados
                  </h3>
                  <div
                    class="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-3"
                  >
                    {#each voucher.extra_data.apps_recomendados as app}
                      <div
                        class="p-3 bg-blue-50 rounded-lg border border-blue-200"
                      >
                        <p class="font-medium text-blue-900">{app.nome}</p>
                        {#if app.descricao}
                          <p class="text-sm text-blue-700">{app.descricao}</p>
                        {/if}
                      </div>
                    {/each}
                  </div>
                </div>
              {/if}

              <!-- Emergência -->
              {#if voucher.extra_data.emergencia && (voucher.extra_data.emergencia.escritorio || voucher.extra_data.emergencia.emergencia_24h || voucher.extra_data.emergencia.whatsapp)}
                <div class="p-4 bg-red-50 rounded-xl border border-red-200">
                  <h3
                    class="font-semibold text-red-900 mb-3 flex items-center gap-2"
                  >
                    <Phone size={18} />
                    Contatos de Emergência
                  </h3>
                  <div class="space-y-2">
                    {#if voucher.extra_data.emergencia.escritorio}
                      <p class="text-red-800">
                        <span class="font-medium">Escritório:</span>
                        {voucher.extra_data.emergencia.escritorio}
                      </p>
                    {/if}
                    {#if voucher.extra_data.emergencia.emergencia_24h}
                      <p class="text-red-800">
                        <span class="font-medium">Emergência 24h:</span>
                        {voucher.extra_data.emergencia.emergencia_24h}
                      </p>
                    {/if}
                    {#if voucher.extra_data.emergencia.whatsapp}
                      <p class="text-red-800">
                        <span class="font-medium">WhatsApp:</span>
                        {voucher.extra_data.emergencia.whatsapp}
                      </p>
                    {/if}
                  </div>
                </div>
              {/if}
            </div>
          </div>
        {/if}
      </div>

      <!-- Coluna Lateral: Ações -->
      <div class="space-y-6">
        <!-- Editar/Visualizar/Excluir já ficam concentrados no topo da
             página, ao lado do nome do voucher, em vez de duplicados aqui. -->

        <!-- Resumo -->
        <div class="bg-white rounded-xl shadow-xs border border-slate-200 p-6">
          <h3 class="font-semibold text-slate-900 mb-4">Resumo</h3>

          <div class="space-y-3">
            <div
              class="flex justify-between items-center p-3 bg-slate-50 rounded-lg"
            >
              <span class="text-slate-600">Dias</span>
              <span class="font-semibold text-slate-900"
                >{voucher.voucher_dias?.length || 0}</span
              >
            </div>
            <div
              class="flex justify-between items-center p-3 bg-slate-50 rounded-lg"
            >
              <span class="text-slate-600">Hotéis</span>
              <span class="font-semibold text-slate-900"
                >{voucher.voucher_hoteis?.length || 0}</span
              >
            </div>
            <div
              class="flex justify-between items-center p-3 bg-slate-50 rounded-lg"
            >
              <span class="text-slate-600">Passageiros</span>
              <span class="font-semibold text-slate-900"
                >{voucher.extra_data?.passageiros_detalhes?.length || 0}</span
              >
            </div>
            <div
              class="flex justify-between items-center p-3 bg-slate-50 rounded-lg"
            >
              <span class="text-slate-600">Apps</span>
              <span class="font-semibold text-slate-900"
                >{voucher.extra_data?.apps_recomendados?.length || 0}</span
              >
            </div>
          </div>
        </div>

        <!-- Datas -->
        <div class="bg-white rounded-xl shadow-xs border border-slate-200 p-6">
          <h3 class="font-semibold text-slate-900 mb-4">Datas</h3>

          <div class="space-y-3">
            <div>
              <p class="text-sm text-slate-500">Criado em</p>
              <p class="font-medium text-slate-900">
                {formatDate(voucher.created_at)}
              </p>
            </div>
            <div>
              <p class="text-sm text-slate-500">Última atualização</p>
              <p class="font-medium text-slate-900">
                {formatDate(voucher.updated_at)}
              </p>
            </div>
          </div>
        </div>
      </div>
    </div>
  </div>
{/if}

<!-- Editor Modal -->
{#if VoucherEditorModal && showEditor}
  <svelte:component
    this={VoucherEditorModal}
    bind:open={showEditor}
    {voucher}
    {companyId}
    {assets}
    on:save={handleSave}
    on:close={() => (showEditor = false)}
  />
{/if}

<!-- Preview Modal -->
{#if VoucherPreviewModal && showPreview}
  <svelte:component
    this={VoucherPreviewModal}
    bind:open={showPreview}
    {voucher}
    {assets}
    on:edit={async () => {
      showPreview = false;
      await openEditor();
    }}
  />
{/if}

<!-- Delete Dialog -->
<Dialog
  bind:open={showDeleteDialog}
  title="Confirmar Exclusão"
  color="operacao"
  showConfirm={true}
  confirmVariant="danger"
  confirmText="Excluir"
  cancelText="Cancelar"
  onConfirm={excluirVoucher}
  onCancel={() => (showDeleteDialog = false)}
>
  <p class="text-slate-600">
    Tem certeza que deseja excluir o voucher <strong>{voucher?.nome}</strong>?
    Esta ação não pode ser desfeita.
  </p>
</Dialog>
