<script lang="ts">
  import { onMount } from "svelte";
  import { page } from "$app/stores";
  import { goto } from "$app/navigation";
  import { toast } from "$lib/stores/ui";
  import PageHeader from "$lib/components/ui/PageHeader.svelte";
  import Card from "$lib/components/ui/Card.svelte";
  import Button from "$lib/components/ui/Button.svelte";
  import LoadingState from "$lib/components/ui/LoadingState.svelte";
  import Badge from "$lib/components/ui/Badge.svelte";
  import Dialog from "$lib/components/ui/Dialog.svelte";
  import FieldInput from "$lib/components/ui/form/FieldInput.svelte";
  import FieldTextarea from "$lib/components/ui/form/FieldTextarea.svelte";
  import FieldCheckbox from "$lib/components/ui/form/FieldCheckbox.svelte";
  import KPICard from "$lib/components/kpis/KPICard.svelte";
  import {
    Plane,
    Calendar,
    MapPin,
    Users,
    FileText,
    CreditCard,
    ArrowLeft,
    Edit2,
    Trash2,
    ExternalLink,
    Ticket,
    Plus,
    User,
    Mail,
    Phone,
    MessageCircle,
    AlertCircle,
    CheckCircle,
    Clock,
    Briefcase,
    History,
    TrendingUp,
    MapPinned,
  } from '$lib/icons';
  import { diffDaysISODate } from "$lib/date";
  import {
    formatDate as formatDateValue,
    formatDateTime as formatDateTimeValue,
  } from "$lib/utils/formatters";
  import {
    formatViagemStatus,
    normalizeViagemStatus,
    type StatusViagem,
  } from "$lib/viagens/status";
  import { toUserMessage } from "$lib/utils/errors";
  import { ApiError, apiDelete, apiGet, apiPatch, isCanceledApiError } from "$lib/services/api";
  import { createLoadGuard } from "$lib/utils/loadGuard";

  interface Cliente {
    id: string;
    nome: string;
    email: string;
    telefone: string;
    whatsapp: string;
  }

  interface Recibo {
    id: string;
    venda_id: string;
    produto_id: string;
    produto_nome: string;
    numero_recibo: string;
    numero_reserva: string;
    tipo_pacote: string;
    valor_total: number;
    valor_taxas: number;
    data_inicio: string;
    data_fim: string;
    contrato_url: string;
  }

  interface Venda {
    id: string;
    valor_total: number;
    valor_total_pago: number;
    status: string;
    data_venda: string;
    recibos: Recibo[];
  }

  interface Voucher {
    id: string;
    nome: string;
    provider: string;
    codigo_sistema: string | null;
    codigo_fornecedor: string | null;
    data_inicio: string | null;
    data_fim: string | null;
    ativo: boolean;
  }

  interface Passageiro {
    id: string;
    nome: string;
    documento: string;
    tipo_documento: string;
    data_nascimento: string;
    contato: string;
  }

  interface HistoricoItem {
    id: string;
    tipo: string;
    descricao: string;
    data: string;
    usuario: string;
  }

  type BadgeColor =
    | "gray"
    | "dark"
    | "blue"
    | "green"
    | "yellow"
    | "red"
    | "purple"
    | "pink"
    | "indigo"
    | "teal"
    | "operacao"
    | "clientes"
    | "vendas"
    | "financeiro"
    | "orcamentos"
    | "comissoes";

  interface Viagem {
    id: string;
    venda_id: string;
    orcamento_id: string;
    cliente_id: string;
    responsavel_user_id: string;
    origem: string;
    destino: string;
    data_inicio: string;
    data_fim: string;
    status: StatusViagem;
    observacoes: string;
    follow_up_text: string;
    follow_up_fechado: boolean;
    created_at: string;
    updated_at: string;
    cliente: Cliente | null;
    venda: Venda | null;
    vouchers: Voucher[];
    passageiros: Passageiro[];
    historico: HistoricoItem[];
  }

  const viagemId = $page.params.id;
  let viagem: Viagem | null = null;
  let loading = true;
  let showDeleteDialog = false;
  let showEditModal = false;
  let showStatusModal = false;
  let saving = false;
  const loadGuard = createLoadGuard();

  // Form de edição
  let editForm: {
    data_inicio: string;
    data_fim: string;
    status: StatusViagem;
    observacoes: string;
    follow_up_text: string;
    follow_up_fechado: boolean;
  } = {
    data_inicio: "",
    data_fim: "",
    status: "pendente",
    observacoes: "",
    follow_up_text: "",
    follow_up_fechado: false,
  };

  const statusOptions: Array<{
    value: StatusViagem;
    label: string;
    color: BadgeColor;
    icon: typeof Calendar;
  }> = [
    { value: "pendente", label: "Pendente", color: "gray", icon: Calendar },
    {
      value: "confirmada",
      label: "Confirmada",
      color: "blue",
      icon: CheckCircle,
    },
    { value: "em_viagem", label: "Em viagem", color: "yellow", icon: Plane },
    {
      value: "concluida",
      label: "Concluída",
      color: "green",
      icon: CheckCircle,
    },
    { value: "cancelada", label: "Cancelada", color: "red", icon: AlertCircle },
  ];

  const providerVoucherLabels: Record<string, string> = {
    special_tours: "Special Tours",
    europamundo: "Europamundo",
    sato_tours: "Sato Tours",
  };

  const BRL_CURRENCY_FORMATTER = new Intl.NumberFormat("pt-BR", {
    style: "currency",
    currency: "BRL",
  });

  onMount(() => {
    loadViagem();
  });

  async function loadViagem() {
    const request = loadGuard.next();
    loading = true;
    try {
      const data = await apiGet<{ viagem?: Viagem }>(`/api/v1/viagens/${viagemId}`, undefined, request.signal);
      if (!loadGuard.isCurrent(request.seq)) return;
      if (!data.viagem) throw new Error("Viagem não encontrada");
      const viagemData: Viagem = data.viagem;
      viagem = viagemData;

      // Preenche formulário de edição
      editForm = {
        data_inicio: viagemData.data_inicio
          ? viagemData.data_inicio.split("T")[0]
          : "",
        data_fim: viagemData.data_fim ? viagemData.data_fim.split("T")[0] : "",
        status: normalizeViagemStatus(viagemData.status),
        observacoes: viagemData.observacoes || "",
        follow_up_text: viagemData.follow_up_text || "",
        follow_up_fechado: viagemData.follow_up_fechado || false,
      };
    } catch (err) {
      if (isCanceledApiError(err)) return;
      if (err instanceof ApiError && err.status === 404) {
        toast.error("Viagem não encontrada");
        goto("/operacao/viagens");
        return;
      }
      toast.error(toUserMessage(err, "Erro ao carregar viagem"));
    } finally {
      if (loadGuard.isCurrent(request.seq)) loading = false;
    }
  }

  async function saveViagem() {
    saving = true;
    try {
      await apiPatch(`/api/v1/viagens/${viagemId}`, editForm);
      toast.success("Viagem atualizada com sucesso");
      showEditModal = false;
      showStatusModal = false;
      await loadViagem();
    } catch (err) {
      toast.error(toUserMessage(err, "Erro ao atualizar viagem"));
    } finally {
      saving = false;
    }
  }

  async function deleteViagem() {
    try {
      await apiDelete(`/api/v1/viagens/${viagemId}`);
      toast.success("Viagem excluída com sucesso");
      goto("/operacao/viagens");
    } catch (err) {
      toast.error(toUserMessage(err, "Erro ao excluir viagem"));
    }
  }

  function getStatusColor(status: string): BadgeColor {
    const colors: Record<string, BadgeColor> = {
      planejada: "gray",
      pendente: "gray",
      confirmada: "blue",
      em_viagem: "yellow",
      concluida: "green",
      cancelada: "red",
    };
    return colors[status] || "gray";
  }

  function getStatusLabel(status: string): string {
    const labels: Record<string, string> = {
      planejada: "Pendente",
      pendente: "Pendente",
      confirmada: "Confirmada",
      em_viagem: "Em viagem",
      concluida: "Concluída",
      cancelada: "Cancelada",
    };
    return labels[status] || formatViagemStatus(status);
  }

  function formatDate(dateString: string | null | undefined): string {
    return formatDateValue(dateString);
  }

  function formatDateTime(dateString: string | null | undefined): string {
    return formatDateTimeValue(dateString);
  }

  function formatCurrency(value: number | null): string {
    if (value === null || value === undefined) return "-";
    return BRL_CURRENCY_FORMATTER.format(value);
  }

  function getDiasViagem(inicio: string, fim: string): number {
    const diff = diffDaysISODate(inicio, fim);
    if (diff === null) return 0;
    return diff + 1;
  }

  function getDataSaida(recibos: Recibo[]): string | null {
    if (!recibos || recibos.length === 0) return null;
    const datas = recibos
      .map((r) => r.data_inicio)
      .filter(Boolean)
      .sort();
    return datas[0] || null;
  }

  function getDataRetorno(recibos: Recibo[]): string | null {
    if (!recibos || recibos.length === 0) return null;
    const datas = recibos
      .map((r) => r.data_fim)
      .filter(Boolean)
      .sort();
    return datas[datas.length - 1] || null;
  }

  // Mock de histórico (em produção viria da API)
  function gerarHistoricoMock(): HistoricoItem[] {
    if (!viagem) return [];
    return [
      {
        id: "1",
        tipo: "criacao",
        descricao: "Viagem criada",
        data: viagem.created_at,
        usuario: "Sistema",
      },
      {
        id: "2",
        tipo: "status",
        descricao: `Status alterado para: ${getStatusLabel(viagem.status)}`,
        data: viagem.updated_at,
        usuario: "Operador",
      },
    ];
  }

  $: diasViagem = viagem
    ? getDiasViagem(viagem.data_inicio, viagem.data_fim)
    : 0;
  $: dataSaida = viagem?.venda?.recibos
    ? getDataSaida(viagem.venda.recibos)
    : viagem?.data_inicio;
  $: dataRetorno = viagem?.venda?.recibos
    ? getDataRetorno(viagem.venda.recibos)
    : viagem?.data_fim;
  $: historico = viagem ? gerarHistoricoMock() : [];
</script>

<svelte:head>
  <title
    >{viagem
      ? `Viagem - ${viagem.cliente?.nome || "Cliente"}`
      : "Detalhes da Viagem"} | VTUR</title
  >
</svelte:head>

{#if loading}
  <LoadingState />
{:else if !viagem}
  <div class="text-center py-12">
    <p class="text-slate-500 mb-4">Viagem não encontrada ou sem permissão de acesso.</p>
    <Button variant="secondary" on:click={() => goto('/operacao/viagens')}>
      <ArrowLeft size={16} class="mr-2" />
      Voltar para Viagens
    </Button>
  </div>
{:else if viagem}
  <!-- Header -->
  <PageHeader
    title={`Dossiê da Viagem ${viagem.venda_id ? `• ${viagem.venda_id.slice(0, 8).toUpperCase()}` : ""}`}
    subtitle={viagem?.cliente ? `Cliente: ${viagem.cliente.nome}` : ""}
    color="clientes"
    breadcrumbs={[
      { label: "Viagens", href: "/operacao/viagens" },
      { label: "Detalhe" },
    ]}
    actions={[
      {
        label: "Voltar",
        href: "/operacao/viagens",
        variant: "primary",
        icon: ArrowLeft,
      },
      {
        label: "Editar",
        onClick: () => (showEditModal = true),
        variant: "primary",
        icon: Edit2,
      },
      {
        label: "Mudar Status",
        onClick: () => (showStatusModal = true),
        variant: "secondary",
        icon: CheckCircle,
      },
      {
        label: "Excluir",
        onClick: () => (showDeleteDialog = true),
        variant: "danger",
        icon: Trash2,
      },
    ]}
  />

  <!-- Status Banner -->
  {@const bannerClasses = {
    planejada: "bg-slate-50 border-slate-200",
    pendente: "bg-slate-50 border-slate-200",
    confirmada: "bg-blue-50 border-blue-200",
    em_viagem: "bg-amber-50 border-amber-200",
    concluida: "bg-green-50 border-green-200",
    cancelada: "bg-red-50 border-red-200",
  }}
  <div
    class="mb-6 p-4 rounded-xl border {bannerClasses[viagem.status] ??
      bannerClasses.pendente}"
  >
    <div class="flex items-center justify-between flex-wrap gap-4">
      <div class="flex items-center gap-3">
        <Badge color={getStatusColor(viagem.status)} size="md">
          {getStatusLabel(viagem.status)}
        </Badge>
        <span class="text-sm text-slate-500">
          Última atualização: {formatDateTime(viagem.updated_at)}
        </span>
      </div>
      <div class="flex gap-2">
        {#if viagem.venda_id}
          <Button
            variant="outline"
            size="sm"
            on:click={() => goto(`/vendas/${viagem?.venda_id}`)}
          >
            <CreditCard size={16} class="mr-2" />
            Ver Venda
          </Button>
        {/if}
      </div>
    </div>
  </div>

  <!-- KPIs -->
  <div class="vtur-kpi-grid mb-6">
    <KPICard
      title="Data de Saída"
      value={formatDate(dataSaida)}
      color="operacao"
      icon={Calendar}
    />
    <KPICard
      title="Data de Retorno"
      value={formatDate(dataRetorno)}
      color="operacao"
      icon={Calendar}
    />
    <KPICard
      title="Duração"
      value={`${diasViagem} dias`}
      color="vendas"
      icon={Clock}
      subtitle={diasViagem > 1 ? "dias de viagem" : "dia de viagem"}
    />
    <KPICard
      title="Viajantes"
      value={viagem.passageiros?.length || 1}
      color="clientes"
      icon={Users}
      subtitle={viagem.passageiros?.length === 1 ? "passageiro" : "passageiros"}
    />
  </div>

  <div class="grid grid-cols-1 lg:grid-cols-3 gap-6">
    <!-- Coluna Principal -->
    <div class="lg:col-span-2 space-y-6">
      <!-- Dados do Cliente -->
      <Card title="Dados do Cliente" icon={User} color="clientes">
        <div class="flex items-center gap-4 mb-4">
          <div
            class="w-14 h-14 rounded-full bg-clientes-100 flex items-center justify-center"
          >
            <User size={28} class="text-clientes-600" />
          </div>
          <div>
            <h3 class="text-lg font-semibold text-slate-900">
              {viagem.cliente?.nome || "Cliente não informado"}
            </h3>
            <Button
              variant="secondary"
              size="xs"
              color="clientes"
              on:click={() => {
                const clienteId = viagem?.cliente?.id;
                if (clienteId) goto(`/clientes/${clienteId}`);
              }}
            >
              Ver ficha completa →
            </Button>
          </div>
        </div>

        <div class="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {#if viagem.cliente?.email}
            <div class="flex items-center gap-2 p-3 bg-slate-50 rounded-lg">
              <Mail size={18} class="text-slate-400" />
              <a
                href="mailto:{viagem.cliente.email}"
                class="text-slate-700 hover:text-clientes-600"
              >
                {viagem.cliente.email}
              </a>
            </div>
          {/if}

          {#if viagem.cliente?.telefone}
            <div class="flex items-center gap-2 p-3 bg-slate-50 rounded-lg">
              <Phone size={18} class="text-slate-400" />
              <a
                href="tel:{viagem.cliente.telefone}"
                class="text-slate-700 hover:text-clientes-600"
              >
                {viagem.cliente.telefone}
              </a>
            </div>
          {/if}

          {#if viagem.cliente?.whatsapp}
            <div class="flex items-center gap-2 p-3 bg-slate-50 rounded-lg">
              <MessageCircle size={18} class="text-slate-400" />
              <a
                href="https://wa.me/{viagem.cliente.whatsapp.replace(
                  /\D/g,
                  '',
                )}"
                target="_blank"
                rel="noopener noreferrer"
                class="text-slate-700 hover:text-clientes-600"
              >
                {viagem.cliente.whatsapp}
              </a>
            </div>
          {/if}
        </div>
      </Card>

      <!-- Informações da Viagem -->
      <Card title="Informações da Viagem" icon={MapPinned} color="clientes">
        <div class="grid grid-cols-2 md:grid-cols-4 gap-4">
          <div class="p-4 bg-slate-50 rounded-lg text-center">
            <MapPin size={24} class="mx-auto mb-2 text-clientes-500" />
            <p class="text-sm text-slate-500">Origem</p>
            <p class="font-medium text-slate-900">
              {viagem.origem || "Não informada"}
            </p>
          </div>

          <div class="p-4 bg-slate-50 rounded-lg text-center">
            <MapPin size={24} class="mx-auto mb-2 text-clientes-500" />
            <p class="text-sm text-slate-500">Destino</p>
            <p class="font-medium text-slate-900">
              {viagem.destino || "Não informado"}
            </p>
          </div>

          <div class="p-4 bg-slate-50 rounded-lg text-center">
            <Calendar size={24} class="mx-auto mb-2 text-clientes-500" />
            <p class="text-sm text-slate-500">Saída</p>
            <p class="font-medium text-slate-900">{formatDate(dataSaida)}</p>
          </div>

          <div class="p-4 bg-slate-50 rounded-lg text-center">
            <Calendar size={24} class="mx-auto mb-2 text-clientes-500" />
            <p class="text-sm text-slate-500">Retorno</p>
            <p class="font-medium text-slate-900">{formatDate(dataRetorno)}</p>
          </div>
        </div>
      </Card>

      <!-- Recibos da Viagem -->
      {#if viagem.venda?.recibos && viagem.venda.recibos.length > 0}
        <Card
          title={`Recibos da Viagem (${viagem.venda.recibos.length})`}
          icon={FileText}
          color="clientes"
        >
          <div class="space-y-4">
            {#each viagem.venda.recibos as recibo}
              <div class="bg-slate-50 rounded-lg p-4 border border-slate-200">
                <div class="flex flex-wrap items-start justify-between gap-4">
                  <div class="min-w-0 flex-1 sm:min-w-[300px]">
                    <div class="flex items-center gap-2 mb-2">
                      <Briefcase size={18} class="text-clientes-600" />
                      <span class="font-semibold text-slate-900"
                        >{recibo.produto_nome || "Produto"}</span
                      >
                      {#if recibo.tipo_pacote}
                        <Badge color="gray" size="sm"
                          >{recibo.tipo_pacote}</Badge
                        >
                      {/if}
                    </div>

                    <div class="grid grid-cols-2 md:grid-cols-4 gap-4 text-sm">
                      <div>
                        <p class="text-slate-500">Recibo</p>
                        <p class="font-medium">{recibo.numero_recibo || "-"}</p>
                      </div>

                      {#if recibo.numero_reserva}
                        <div>
                          <p class="text-slate-500">Reserva</p>
                          <p class="font-medium">{recibo.numero_reserva}</p>
                        </div>
                      {/if}

                      <div>
                        <p class="text-slate-500">Início</p>
                        <p class="font-medium">
                          {formatDate(recibo.data_inicio)}
                        </p>
                      </div>

                      <div>
                        <p class="text-slate-500">Fim</p>
                        <p class="font-medium">{formatDate(recibo.data_fim)}</p>
                      </div>
                    </div>
                  </div>

                  <div class="text-right">
                    <p class="text-2xl font-bold text-indigo-600">
                      {formatCurrency(recibo.valor_total)}
                    </p>
                    {#if recibo.valor_taxas > 0}
                      <p class="text-sm text-slate-500">
                        Taxas: {formatCurrency(recibo.valor_taxas)}
                      </p>
                    {/if}
                  </div>
                </div>
              </div>
            {/each}

            <!-- Total -->
            <div class="flex justify-end pt-4 border-t border-slate-200">
              <div class="text-right">
                <p class="text-sm text-slate-500">Valor Total da Viagem</p>
                <p class="text-3xl font-bold text-indigo-600">
                  {formatCurrency(viagem.venda?.valor_total)}
                </p>
              </div>
            </div>
          </div>
        </Card>
      {/if}

      <!-- Vouchers -->
      <Card
        title={`Vouchers (${viagem.vouchers?.length || 0})`}
        icon={Ticket}
        color="clientes"
      >
        {#if viagem.vouchers && viagem.vouchers.length > 0}
          <div class="space-y-3">
            {#each viagem.vouchers as voucher}
              <div
                class="flex items-center justify-between p-3 bg-slate-50 rounded-lg"
              >
                <div class="flex items-center gap-3">
                  <div
                    class="w-10 h-10 rounded-lg bg-clientes-100 flex items-center justify-center"
                  >
                    <Ticket size={20} class="text-clientes-600" />
                  </div>
                  <div>
                    <p class="font-medium text-slate-900">
                      {voucher.nome}
                    </p>
                    <p class="text-sm text-slate-500">
                      {providerVoucherLabels[voucher.provider] ||
                        voucher.provider}
                      {#if voucher.codigo_fornecedor}
                        • {voucher.codigo_fornecedor}
                      {/if}
                      {#if voucher.data_inicio}
                        • {formatDate(voucher.data_inicio)}
                        {#if voucher.data_fim}
                          – {formatDate(voucher.data_fim)}
                        {/if}
                      {/if}
                    </p>
                  </div>
                </div>
                <div class="flex items-center gap-3">
                  <Badge color={voucher.ativo ? "green" : "gray"}>
                    {voucher.ativo ? "Ativo" : "Inativo"}
                  </Badge>
                </div>
              </div>
            {/each}
          </div>
        {:else}
          <div class="text-center py-6 text-slate-500">
            <Ticket size={32} class="mx-auto mb-2 opacity-40" />
            <p>Nenhum voucher vinculado</p>
          </div>
        {/if}

        <div class="mt-4 pt-4 border-t border-slate-100">
          <Button
            variant="secondary"
            size="sm"
            on:click={() =>
              goto(`/operacao/vouchers/novo?viagem_id=${viagem?.id ?? ""}`)}
          >
            <Plus size={16} class="mr-2" />
            Adicionar Voucher
          </Button>
        </div>
      </Card>

      <!-- Passageiros -->
      <Card
        title={`Passageiros (${viagem.passageiros?.length || 0})`}
        icon={Users}
        color="clientes"
      >
        {#if viagem.passageiros && viagem.passageiros.length > 0}
          <div class="grid grid-cols-1 md:grid-cols-2 gap-3">
            {#each viagem.passageiros as passageiro}
              <div class="flex items-center gap-3 p-3 bg-slate-50 rounded-lg">
                <div
                  class="w-10 h-10 rounded-full bg-clientes-100 flex items-center justify-center"
                >
                  <User size={20} class="text-clientes-600" />
                </div>
                <div>
                  <p class="font-medium text-slate-900">{passageiro.nome}</p>
                  {#if passageiro.documento}
                    <p class="text-sm text-slate-500">
                      {passageiro.tipo_documento?.toUpperCase() || "Documento"}: {passageiro.documento}
                    </p>
                  {/if}
                </div>
              </div>
            {/each}
          </div>
        {:else}
          <div class="text-center py-6 text-slate-500">
            <Users size={32} class="mx-auto mb-2 opacity-40" />
            <p>Nenhum passageiro cadastrado</p>
          </div>
        {/if}
      </Card>

      <!-- Observações -->
      {#if viagem.observacoes}
        <Card title="Observações" icon={AlertCircle} color="clientes">
          <p class="text-slate-700 whitespace-pre-wrap">{viagem.observacoes}</p>
        </Card>
      {/if}

      <!-- Follow Up -->
      {#if viagem.follow_up_text}
        <Card title="Follow Up" icon={AlertCircle} color="clientes">
          <p class="text-slate-700 whitespace-pre-wrap">
            {viagem.follow_up_text}
          </p>
          <div class="mt-3">
            {#if viagem.follow_up_fechado}
              <Badge color="green">Fechado</Badge>
            {:else}
              <Badge color="yellow">Em Aberto</Badge>
            {/if}
          </div>
        </Card>
      {/if}
    </div>

    <!-- Coluna Lateral -->
    <div class="space-y-6">
      <!-- Resumo Financeiro -->
      {#if viagem.venda}
        <Card title="Resumo Financeiro" icon={TrendingUp} color="clientes">
          <div class="space-y-4">
            <div class="flex justify-between items-center">
              <span class="text-slate-600">Valor Total</span>
              <span class="text-xl font-bold text-indigo-600">
                {formatCurrency(viagem.venda.valor_total)}
              </span>
            </div>
            <div class="flex justify-between items-center">
              <span class="text-slate-600">Pago</span>
              <span class="font-medium text-green-600">
                {formatCurrency(viagem.venda.valor_total_pago)}
              </span>
            </div>
            {#if viagem.venda.valor_total > (viagem.venda.valor_total_pago || 0)}
              <div
                class="flex justify-between items-center pt-2 border-t border-slate-200"
              >
                <span class="text-slate-600">Saldo Devedor</span>
                <span class="font-medium text-amber-600">
                  {formatCurrency(
                    viagem.venda.valor_total -
                      (viagem.venda.valor_total_pago || 0),
                  )}
                </span>
              </div>
            {/if}
          </div>
        </Card>
      {/if}

      <!-- Histórico -->
      <Card title="Histórico" icon={History} color="clientes">
        <div class="space-y-3 max-h-80 overflow-y-auto">
          {#each historico as item}
            <div class="flex gap-3 p-3 bg-slate-50 rounded-lg">
              <div
                class="w-8 h-8 rounded-full bg-clientes-100 flex items-center justify-center shrink-0"
              >
                <History size={14} class="text-clientes-600" />
              </div>
              <div class="flex-1">
                <p class="text-sm font-medium text-slate-900">
                  {item.descricao}
                </p>
                <p class="text-xs text-slate-500 mt-1">
                  {formatDateTime(item.data)} • {item.usuario}
                </p>
              </div>
            </div>
          {/each}
        </div>
      </Card>

      <!-- Mudar Status, Novo Voucher e Excluir Viagem ficam concentrados no
           cabeçalho da página e no card de Vouchers (Adicionar Voucher),
           em vez de espalhados num card "Ações" à parte aqui embaixo. -->
    </div>
  </div>

  <!-- Dialog de Confirmação de Exclusão -->
  <Dialog
    bind:open={showDeleteDialog}
    title="Confirmar Exclusão"
    description="Tem certeza que deseja excluir esta viagem? Esta ação não pode ser desfeita."
    confirmText="Excluir"
    cancelText="Cancelar"
    confirmVariant="danger"
    showConfirm={true}
    onConfirm={deleteViagem}
    onCancel={() => (showDeleteDialog = false)}
  >
    <div
      class="flex items-start gap-3 text-amber-600 bg-amber-50 p-3 rounded-lg"
    >
      <AlertCircle size={20} class="mt-0.5" />
      <p class="text-sm">
        Todos os vouchers e dados relacionados à viagem também serão removidos.
      </p>
    </div>
  </Dialog>

  <Dialog
    bind:open={showEditModal}
    title="Editar Viagem"
    description="Atualize as datas, observações e informações de acompanhamento."
    size="lg"
    color="operacao"
    cancelText="Cancelar"
    confirmText="Salvar Alterações"
    showConfirm={true}
    loading={saving}
    onCancel={() => (showEditModal = false)}
    onConfirm={saveViagem}
  >
    <div class="grid grid-cols-1 gap-4 md:grid-cols-2">
      <FieldInput
        label="Data de Saída"
        type="date"
        bind:value={editForm.data_inicio}
        id="viagem-edit-data-inicio"
      />
      <FieldInput
        label="Data de Retorno"
        type="date"
        bind:value={editForm.data_fim}
        min={editForm.data_inicio || null}
        id="viagem-edit-data-fim"
      />
      <FieldTextarea
        label="Observações"
        bind:value={editForm.observacoes}
        rows={3}
        id="viagem-edit-observacoes"
        class_name="md:col-span-2"
      />
      <FieldTextarea
        label="Follow Up"
        bind:value={editForm.follow_up_text}
        rows={2}
        id="viagem-edit-follow-up"
        class_name="md:col-span-2"
      />
      <FieldCheckbox
        label="Marcar como fechado"
        bind:checked={editForm.follow_up_fechado}
        class_name="md:col-span-2"
      />
    </div>
  </Dialog>

  <Dialog
    bind:open={showStatusModal}
    title="Mudar Status da Viagem"
    description="Escolha o novo status operacional da viagem."
    color="operacao"
    cancelText="Cancelar"
    confirmText="Confirmar"
    showConfirm={true}
    loading={saving}
    onCancel={() => (showStatusModal = false)}
    onConfirm={saveViagem}
  >
    <div class="grid grid-cols-1 gap-3">
      {#each statusOptions as option}
        <Button
          variant={editForm.status === option.value ? "primary" : "outline"}
          color="clientes"
          class_name="flex w-full items-center justify-start gap-3 text-left"
          on:click={() => (editForm.status = option.value)}
        >
          <svelte:component this={option.icon} size={20} />
          <span>{option.label}</span>
          {#if editForm.status === option.value}
            <CheckCircle size={18} class="ml-auto" />
          {/if}
        </Button>
      {/each}
    </div>
  </Dialog>
{/if}
