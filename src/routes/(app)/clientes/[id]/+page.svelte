<script lang="ts">
  import { page } from '$app/stores';
  import { goto } from '$app/navigation';
  import { onDestroy, onMount } from 'svelte';
  import PageHeader from '$lib/components/ui/PageHeader.svelte';
  import Card from '$lib/components/ui/Card.svelte';
  import Tabs from '$lib/components/ui/Tabs.svelte';
  import Button from '$lib/components/ui/Button.svelte';
  import LoadingState from '$lib/components/ui/LoadingState.svelte';
  import KPICard from '$lib/components/kpis/KPICard.svelte';
  import AcompanhantesManager from '$lib/components/clientes/AcompanhantesManager.svelte';
  import ClienteViagensCard from '$lib/components/clientes/ClienteViagensCard.svelte';
  import ClienteContatosCard from '$lib/components/clientes/ClienteContatosCard.svelte';
  import { construirLinkWhatsApp } from '$lib/whatsapp';
  import {
    ArrowLeft,
    Award,
    Calendar,
    Cake,
    Edit,
    FileText,
    Globe,
    Mail,
    MapPin,
    Phone,
    Send,
    ShoppingCart,
    Ticket,
    User,
    Whatsapp,
    Wallet,
    Users,
    Clock,
    AlertCircle,
    CheckCircle
  } from '$lib/icons';
  import { toast } from '$lib/stores/ui';
  import { parseISODateParts, todayISODateLocal } from '$lib/date';
  import { formatDate as formatDateValue } from '$lib/utils/formatters';
  import { toUserMessage } from '$lib/utils/errors';
  import { apiGet, isCanceledApiError } from '$lib/services/api';

  type ClienteDetalhe = {
    id: string;
    nome: string;
    cpf: string | null;
    documento_formatado: string;
    rg: string | null;
    telefone: string | null;
    whatsapp: string | null;
    email: string | null;
    nascimento: string | null;
    genero: string | null;
    nacionalidade: string | null;
    tipo_pessoa: string | null;
    tipo_cliente: string | null;
    classificacao: string | null;
    cep: string | null;
    endereco: string | null;
    numero: string | null;
    complemento: string | null;
    bairro: string | null;
    cidade: string | null;
    estado: string | null;
    notas: string | null;
    observacoes: string | null;
    tags: string[] | null;
    ativo: boolean;
    active: boolean;
    status: 'ativo' | 'inativo' | 'prospect';
    ultima_compra: string | null;
    total_gasto: number;
    total_viagens: number;
    total_orcamentos: number;
    acompanhantes_count: number;
  };

  type HistoricoVenda = {
    id: string;
    data_lancamento: string | null;
    data_embarque: string | null;
    destino_nome: string;
    destino_cidade_nome: string;
    valor_total: number;
    valor_taxas: number;
    origem_vinculo?: 'titular' | 'passageiro';
  };

  type HistoricoOrcamento = {
    id: string;
    data_orcamento: string | null;
    status: string | null;
    valor: number | null;
    produto_nome?: string | null;
  };

  type HistoricoClienteResponse = {
    vendas?: HistoricoVenda[] | null;
    orcamentos?: HistoricoOrcamento[] | null;
  };

  const clienteId = $page.params.id;
  const BRL_CURRENCY_FORMATTER = new Intl.NumberFormat('pt-BR', {
    style: 'currency',
    currency: 'BRL'
  });

  let cliente: ClienteDetalhe | null = null;
  let historicoVendas: HistoricoVenda[] = [];
  let historicoOrcamentos: HistoricoOrcamento[] = [];
  let loading = true;
  let errorMessage: string | null = null;
  let showAvisoModal = false;
  let ModalAvisoClienteComponent:
    | typeof import('$lib/components/modais/ModalAvisoCliente.svelte').default
    | null = null;
  let modalAvisoLoadPromise: Promise<boolean> | null = null;
  let loadController: AbortController | null = null;
  let loadSeq = 0;
  // Fase 5.4: recarrega "Contatos enviados" depois de enviar um aviso pela ficha.
  let versaoContatos = 0;
  let abaAtiva = 'resumo';
  let semAcessoViagens = false;
  let semAcessoContatos = false;
  $: abas = [
    { key: 'resumo', label: 'Resumo do cliente' },
    { key: 'acompanhantes', label: 'Acompanhantes' },
    { key: 'vendas', label: 'Histórico de vendas' },
    { key: 'orcamentos', label: 'Histórico de orçamentos' },
    ...(!semAcessoViagens ? [{ key: 'viagens', label: 'Viagens' }] : []),
    ...(!semAcessoContatos ? [{ key: 'contatos', label: 'Contatos enviados' }] : []),
    { key: 'notas', label: 'Notas e contexto' }
  ];
  $: if (
    (abaAtiva === 'viagens' && semAcessoViagens) ||
    (abaAtiva === 'contatos' && semAcessoContatos)
  ) {
    abaAtiva = 'resumo';
  }

  $: totalGasto = historicoVendas.reduce((acc, item) => acc + Number(item.valor_total || 0), 0);
  $: ticketMedio = historicoVendas.length > 0 ? totalGasto / historicoVendas.length : 0;
  $: statusCliente = String(cliente?.status || '').toLowerCase();
  $: clienteAtivo = statusCliente === 'ativo';
  $: clienteEmNegociacao = historicoOrcamentos.length > 0 && historicoVendas.length === 0;
  $: clienteComHistorico = historicoVendas.length > 0;
  $: clienteInicial = !clienteComHistorico && !clienteEmNegociacao;
  // Fase 5.4: atalhos de contato (só abrem o app de telefone, e-mail ou WhatsApp).
  $: linkWhatsApp = construirLinkWhatsApp(cliente?.whatsapp || cliente?.telefone || null);
  $: telefoneDigitos = String(cliente?.telefone || cliente?.whatsapp || '').replace(/[^\d+]/g, '');

  function formatCurrency(value: number | null | undefined) {
    return BRL_CURRENCY_FORMATTER.format(Number(value || 0));
  }

  function formatDate(value: string | null | undefined) {
    return formatDateValue(value);
  }

  function calculateAge(value: string | null | undefined) {
    const today = parseISODateParts(todayISODateLocal());
    const birth = parseISODateParts(value);
    if (!today || !birth) return null;

    let age = today.year - birth.year;
    const monthDiff = today.month - birth.month;
    if (monthDiff < 0 || (monthDiff === 0 && today.day < birth.day)) {
      age -= 1;
    }
    return age;
  }

  function getStatusBadge(status: string | null | undefined) {
    const styles: Record<string, string> = {
      ativo: 'bg-green-100 text-green-700',
      inativo: 'bg-red-100 text-red-700',
      prospect: 'bg-blue-100 text-blue-700',
      aprovado: 'bg-green-100 text-green-700',
      pendente: 'bg-amber-100 text-amber-700',
      rejeitado: 'bg-red-100 text-red-700',
      fechado: 'bg-emerald-100 text-emerald-700'
    };

    return styles[String(status || '').toLowerCase()] || 'bg-slate-100 text-slate-700';
  }

  function getStatusLabel(status: string | null | undefined) {
    const key = String(status || '').toLowerCase();
    const labels: Record<string, string> = {
      ativo: 'Ativo',
      inativo: 'Inativo',
      prospect: 'Prospect',
      aprovado: 'Aprovado',
      pendente: 'Pendente',
      rejeitado: 'Rejeitado',
      fechado: 'Convertido em Venda'
    };
    return labels[key] || String(status || '-');
  }

  async function carregarCliente() {
    loadController?.abort();
    const controller = new AbortController();
    loadController = controller;
    const seq = ++loadSeq;
    loading = true;
    errorMessage = null;

    try {
      const [clientePayload, historicoPayload] = await Promise.all([
        apiGet<ClienteDetalhe>(`/api/v1/clientes/${clienteId}`, undefined, controller.signal),
        apiGet<HistoricoClienteResponse>(
          '/api/v1/clientes/historico',
          { cliente_id: clienteId },
          controller.signal
        )
      ]);

      if (seq !== loadSeq) return;
      cliente = clientePayload;
      historicoVendas = Array.isArray(historicoPayload?.vendas) ? historicoPayload.vendas : [];
      historicoOrcamentos = Array.isArray(historicoPayload?.orcamentos)
        ? historicoPayload.orcamentos
        : [];
    } catch (error: unknown) {
      if (isCanceledApiError(error)) return;
      errorMessage = toUserMessage(error, 'Erro ao carregar cliente.');
      toast.error(errorMessage);
    } finally {
      if (seq === loadSeq) loading = false;
    }
  }

  async function ensureModalAvisoLoaded() {
    if (ModalAvisoClienteComponent) return true;
    if (modalAvisoLoadPromise) return modalAvisoLoadPromise;

    modalAvisoLoadPromise = import('$lib/components/modais/ModalAvisoCliente.svelte')
      .then((module) => {
        ModalAvisoClienteComponent = module.default;
        return true;
      })
      .catch((err) => {
        toast.error(toUserMessage(err, 'Erro ao carregar aviso ao cliente.'));
        return false;
      })
      .finally(() => {
        modalAvisoLoadPromise = null;
      });

    return modalAvisoLoadPromise;
  }

  async function abrirAvisoCliente() {
    showAvisoModal = await ensureModalAvisoLoaded();
  }

  onMount(() => {
    void carregarCliente();
  });

  onDestroy(() => {
    loadSeq += 1;
    loadController?.abort();
  });
</script>

<svelte:head>
  <title>{cliente?.nome || 'Cliente'} | Clientes | VTUR</title>
</svelte:head>

{#if loading}
  <LoadingState />
{:else if errorMessage}
  <div class="py-12 text-center">
    <p role="alert" class="mb-4 text-red-600">{errorMessage}</p>
    <Button variant="secondary" on:click={() => goto('/clientes')}>
      <ArrowLeft size={16} class="mr-2" />
      Voltar para clientes
    </Button>
  </div>
{:else if !cliente}
  <div class="py-12 text-center">
    <p class="mb-4 text-slate-500">Cliente não encontrado ou sem permissão de acesso.</p>
    <Button variant="secondary" on:click={() => goto('/clientes')}>
      <ArrowLeft size={16} class="mr-2" />
      Voltar para Clientes
    </Button>
  </div>
{:else if cliente}
  <PageHeader
    title={cliente.nome}
    subtitle="Visao consolidada de cadastro, historico comercial, orcamentos e relacionamento do cliente."
    breadcrumbs={[{ label: 'Clientes', href: '/clientes' }, { label: cliente.nome }]}
    actions={[
      {
        label: 'Editar',
        href: `/clientes/${clienteId}/editar`,
        variant: 'primary',
        icon: Edit
      },
      {
        label: 'Enviar Aviso',
        onClick: abrirAvisoCliente,
        variant: 'secondary',
        icon: Send
      },
      {
        label: 'Nova Venda',
        href: `/vendas/nova?cliente=${clienteId}`,
        variant: 'primary',
        icon: ShoppingCart
      }
    ]}
  />

  <div class="mb-6 flex flex-wrap items-center justify-between gap-3">
    <div>
      <p class="text-xs font-semibold tracking-[0.14em] text-slate-400 uppercase">
        Painel executivo
      </p>
      <p class="text-sm text-slate-500">
        Resumo do relacionamento com foco em histórico, negociação, reativação e valor da carteira.
      </p>
    </div>
  </div>

  <div class="vtur-kpi-grid vtur-kpi-grid-5 mb-6">
    <div class="vtur-kpi-card">
      <div
        class="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-indigo-50 text-indigo-500"
      >
        <Wallet size={18} />
      </div>
      <div class="min-w-0 flex-1">
        <p class="text-xs font-medium text-slate-500 sm:text-sm">Total em vendas</p>
        <p class="truncate text-lg font-bold text-slate-900 sm:text-2xl">
          {formatCurrency(totalGasto)}
        </p>
      </div>
    </div>
    <div class="vtur-kpi-card">
      <div
        class="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-slate-100 text-slate-500"
      >
        <Calendar size={18} />
      </div>
      <div class="min-w-0 flex-1">
        <p class="text-xs font-medium text-slate-500 sm:text-sm">Última compra</p>
        <p class="truncate text-lg font-bold text-slate-900 sm:text-2xl">
          {formatDate(cliente.ultima_compra)}
        </p>
      </div>
    </div>
    <div class="vtur-kpi-card">
      <div
        class="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-teal-50 text-teal-500"
      >
        <ShoppingCart size={18} />
      </div>
      <div class="min-w-0 flex-1">
        <p class="text-xs font-medium text-slate-500 sm:text-sm">Viagens vinculadas</p>
        <p class="text-lg font-bold text-slate-900 sm:text-2xl">{historicoVendas.length}</p>
      </div>
    </div>
    <div class="vtur-kpi-card">
      <div
        class="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-emerald-50 text-emerald-500"
      >
        <Ticket size={18} />
      </div>
      <div class="min-w-0 flex-1">
        <p class="text-xs font-medium text-slate-500 sm:text-sm">Ticket médio</p>
        <p class="truncate text-lg font-bold text-slate-900 sm:text-2xl">
          {formatCurrency(ticketMedio)}
        </p>
      </div>
    </div>
    <div class="vtur-kpi-card">
      <div
        class="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-amber-50 text-amber-500"
      >
        <FileText size={18} />
      </div>
      <div class="min-w-0 flex-1">
        <p class="text-xs font-medium text-slate-500 sm:text-sm">Orçamentos</p>
        <p class="text-lg font-bold text-slate-900 sm:text-2xl">{historicoOrcamentos.length}</p>
      </div>
    </div>
  </div>

  <div
    class="rounded-vtur-xl shadow-vtur-lg mb-6 border border-slate-200 bg-white px-5 py-4 text-sm text-slate-600"
  >
    Este cliente reúne <strong>{historicoVendas.length}</strong> venda(s),
    <strong>{historicoOrcamentos.length}</strong>
    orçamento(s) e <strong>{cliente.acompanhantes_count}</strong> acompanhante(s), permitindo leitura
    rápida de recorrência, negociação e potencial de reativação.
  </div>

  <Tabs items={abas} bind:activeKey={abaAtiva} idPrefix="cliente" mobileDropdown className="mb-6" />
  <div
    id="cliente-panel-resumo"
    role="tabpanel"
    aria-labelledby="cliente-tab-resumo"
    hidden={abaAtiva !== 'resumo'}
  >
    <Card title="Resumo do cliente" color="clientes">
      <div class="space-y-4">
        {#if linkWhatsApp || telefoneDigitos || cliente.email}
          <div
            class="flex flex-wrap justify-end gap-4"
            aria-label="Falar com o cliente"
            role="group"
          >
            {#if linkWhatsApp}
              <a
                href={linkWhatsApp}
                target="_blank"
                rel="noopener noreferrer"
                class="inline-flex items-center gap-1.5 rounded-lg border border-emerald-200 bg-emerald-50 px-3 py-1.5 text-sm font-medium text-emerald-800 transition-colors hover:bg-emerald-100 focus-visible:outline-2 focus-visible:outline-emerald-600"
              >
                <Whatsapp size={15} aria-hidden="true" /> WhatsApp
              </a>
            {/if}
            {#if telefoneDigitos}
              <a
                href={`tel:${telefoneDigitos}`}
                class="inline-flex items-center gap-1.5 rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-sm font-medium text-slate-700 transition-colors hover:bg-slate-50 focus-visible:outline-2 focus-visible:outline-blue-500"
              >
                <Phone size={15} aria-hidden="true" /> Ligar
              </a>
            {/if}
            {#if cliente.email}
              <a
                href={`mailto:${cliente.email}`}
                class="inline-flex items-center gap-1.5 rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-sm font-medium text-slate-700 transition-colors hover:bg-slate-50 focus-visible:outline-2 focus-visible:outline-blue-500"
              >
                <Mail size={15} aria-hidden="true" /> E-mail
              </a>
            {/if}
          </div>
        {/if}

        <div class="space-y-4 text-sm" aria-label="Dados do cliente">
          <div class="grid grid-cols-2 gap-x-4 gap-y-3 lg:grid-cols-4" aria-label="Dados pessoais">
            <div class="flex min-w-0 items-start gap-3">
              <div
                class="bg-clientes-100 flex h-10 w-10 shrink-0 items-center justify-center rounded-full"
              >
                <User size={18} class="text-clientes-600" aria-hidden="true" />
              </div>
              <div class="min-w-0">
                <p class="text-sm text-slate-500">Nome</p>
                <p class="font-medium break-words text-slate-900">{cliente.nome}</p>
              </div>
            </div>
            <div class="flex min-w-0 items-start gap-3">
              <div
                class="bg-clientes-100 flex h-10 w-10 shrink-0 items-center justify-center rounded-full"
              >
                <FileText size={18} class="text-clientes-600" aria-hidden="true" />
              </div>
              <div class="min-w-0">
                <p class="text-sm text-slate-500">CPF/CNPJ</p>
                <p class="font-medium text-slate-900">{cliente.documento_formatado || '-'}</p>
              </div>
            </div>
            <div class="flex min-w-0 items-start gap-3">
              <div
                class="bg-clientes-100 flex h-10 w-10 shrink-0 items-center justify-center rounded-full"
              >
                <Cake size={18} class="text-clientes-600" aria-hidden="true" />
              </div>
              <div class="min-w-0">
                <p class="text-sm text-slate-500">Nascimento</p>
                <p class="font-medium text-slate-900">
                  {formatDate(cliente.nascimento)}
                  {#if calculateAge(cliente.nascimento)}
                    <span class="ml-1 text-slate-500"
                      >({calculateAge(cliente.nascimento)} anos)</span
                    >
                  {/if}
                </p>
              </div>
            </div>
            <div class="flex min-w-0 items-start gap-3">
              <div
                class="bg-clientes-100 flex h-10 w-10 shrink-0 items-center justify-center rounded-full"
              >
                <Globe size={18} class="text-clientes-600" aria-hidden="true" />
              </div>
              <div class="min-w-0">
                <p class="text-sm text-slate-500">Gênero / Nacionalidade</p>
                <p class="font-medium break-words text-slate-900">
                  {[cliente.genero, cliente.nacionalidade].filter(Boolean).join(' · ') || '-'}
                </p>
              </div>
            </div>
          </div>
          <div
            class="grid grid-cols-2 gap-x-4 gap-y-3 lg:grid-cols-4"
            aria-label="Contatos e classificação do cliente"
          >
            <div class="flex min-w-0 items-start gap-3">
              <div
                class="bg-clientes-100 flex h-10 w-10 shrink-0 items-center justify-center rounded-full"
              >
                <Phone size={18} class="text-clientes-600" aria-hidden="true" />
              </div>
              <div class="min-w-0">
                <p class="text-sm text-slate-500">Telefone</p>
                <p class="font-medium text-slate-900">{cliente.telefone || '-'}</p>
              </div>
            </div>
            <div class="flex min-w-0 items-start gap-3">
              <div
                class="bg-clientes-100 flex h-10 w-10 shrink-0 items-center justify-center rounded-full"
              >
                <Whatsapp size={18} class="text-clientes-600" aria-hidden="true" />
              </div>
              <div class="min-w-0">
                <p class="text-sm text-slate-500">WhatsApp</p>
                <p class="font-medium text-slate-900">{cliente.whatsapp || '-'}</p>
              </div>
            </div>
            <div class="flex min-w-0 items-start gap-3">
              <div
                class="bg-clientes-100 flex h-10 w-10 shrink-0 items-center justify-center rounded-full"
              >
                <Mail size={18} class="text-clientes-600" aria-hidden="true" />
              </div>
              <div class="min-w-0">
                <p class="text-sm text-slate-500">E-mail</p>
                <p class="font-medium break-words text-slate-900">{cliente.email || '-'}</p>
              </div>
            </div>
            <div class="flex min-w-0 items-start gap-3">
              <div
                class="bg-clientes-100 flex h-10 w-10 shrink-0 items-center justify-center rounded-full"
              >
                <Award size={18} class="text-clientes-600" aria-hidden="true" />
              </div>
              <div class="min-w-0">
                <p class="text-sm text-slate-500">Classificação</p>
                <p class="font-medium break-words text-slate-900">{cliente.classificacao || '-'}</p>
              </div>
            </div>
          </div>
        </div>
      </div>
      <div class="mt-5 flex items-start gap-3 border-t border-slate-100 pt-4">
        <div
          class="bg-clientes-100 flex h-10 w-10 shrink-0 items-center justify-center rounded-full"
        >
          <MapPin size={18} class="text-clientes-600" aria-hidden="true" />
        </div>
        <div class="min-w-0 space-y-2">
          <h4 class="text-sm font-semibold text-slate-800">Endereço e tags</h4>
          <p class="min-w-0 text-sm break-words text-slate-700" aria-label="Endereço do cliente">
            {[
              `${cliente.endereco || 'Endereço não informado'}${cliente.numero ? `, ${cliente.numero}` : ''}`,
              cliente.complemento,
              cliente.bairro,
              [cliente.cidade, cliente.estado].filter(Boolean).join('/'),
              cliente.cep ? `CEP: ${cliente.cep}` : ''
            ]
              .filter(Boolean)
              .join(' · ')}
          </p>
          <div class="flex flex-wrap items-center gap-2" aria-label="Tags do cliente">
            <span class="text-sm text-slate-500">Tags:</span>
            {#if cliente.tags && cliente.tags.length > 0}
              <div class="flex flex-wrap gap-2">
                {#each cliente.tags as tag}
                  <span
                    class="bg-clientes-100 text-clientes-700 rounded-full px-3 py-1 text-xs font-medium"
                    >{tag}</span
                  >
                {/each}
              </div>
            {:else}
              <span class="text-sm text-slate-500">Nenhuma tag cadastrada.</span>
            {/if}
          </div>
        </div>
      </div>
    </Card>
  </div>

  <div
    id="cliente-panel-acompanhantes"
    role="tabpanel"
    aria-labelledby="cliente-tab-acompanhantes"
    hidden={abaAtiva !== 'acompanhantes'}
  >
    <AcompanhantesManager
      {clienteId}
      editable={false}
      title="Acompanhantes"
      subtitle="Consulta dos acompanhantes associados ao cliente."
    />
  </div>

  <div
    id="cliente-panel-vendas"
    role="tabpanel"
    aria-labelledby="cliente-tab-vendas"
    hidden={abaAtiva !== 'vendas'}
  >
    <Card title="Histórico de vendas" color="clientes">
      {#if historicoVendas.length > 0}
        <div class="overflow-x-visible md:overflow-x-auto">
          <table class="table-mobile-cards w-full text-sm">
            <thead class="bg-slate-50">
              <tr>
                <th class="px-4 py-3 text-left font-semibold text-slate-600">Lancamento</th>
                <th class="px-4 py-3 text-left font-semibold text-slate-600">Destino</th>
                <th class="px-4 py-3 text-left font-semibold text-slate-600">Embarque</th>
                <th class="px-4 py-3 text-right font-semibold text-slate-600">Valor</th>
                <th class="px-4 py-3 text-right font-semibold text-slate-600">Taxas</th>
                <th class="px-4 py-3 text-left font-semibold text-slate-600">Vinculo</th>
              </tr>
            </thead>
            <tbody class="divide-y divide-slate-200">
              {#each historicoVendas as venda}
                <tr
                  class="cursor-pointer transition-colors hover:bg-slate-50"
                  on:click={() => goto(`/vendas/${venda.id}`)}
                >
                  <td class="px-4 py-3 text-slate-700">{formatDate(venda.data_lancamento)}</td>
                  <td class="px-4 py-3">
                    <div class="font-medium text-slate-900">{venda.destino_nome || '-'}</div>
                    <div class="text-xs text-slate-500">
                      {venda.destino_cidade_nome || 'Sem cidade'}
                    </div>
                  </td>
                  <td class="px-4 py-3 text-slate-700">{formatDate(venda.data_embarque)}</td>
                  <td class="px-4 py-3 text-right font-medium text-slate-900"
                    >{formatCurrency(venda.valor_total)}</td
                  >
                  <td class="px-4 py-3 text-right text-slate-700"
                    >{formatCurrency(venda.valor_taxas)}</td
                  >
                  <td class="px-4 py-3">
                    <span
                      class={`inline-flex rounded-full px-2.5 py-1 text-xs font-semibold ${venda.origem_vinculo === 'passageiro' ? 'bg-amber-100 text-amber-700' : 'bg-blue-100 text-blue-700'}`}
                    >
                      {venda.origem_vinculo === 'passageiro' ? 'Passageiro' : 'Titular'}
                    </span>
                  </td>
                </tr>
              {/each}
            </tbody>
          </table>
        </div>
      {:else}
        <div
          class="rounded-vtur-lg border border-dashed border-slate-300 bg-slate-50 px-5 py-8 text-center text-sm text-slate-500"
        >
          Nenhuma venda vinculada a este cliente.
        </div>
      {/if}
    </Card>
  </div>

  <div
    id="cliente-panel-orcamentos"
    role="tabpanel"
    aria-labelledby="cliente-tab-orcamentos"
    hidden={abaAtiva !== 'orcamentos'}
  >
    <Card title="Histórico de orçamentos" color="clientes">
      {#if historicoOrcamentos.length > 0}
        <div class="overflow-x-visible md:overflow-x-auto">
          <table class="table-mobile-cards w-full text-sm">
            <thead class="bg-slate-50">
              <tr>
                <th class="px-4 py-3 text-left font-semibold text-slate-600">Data</th>
                <th class="px-4 py-3 text-left font-semibold text-slate-600">Status</th>
                <th class="px-4 py-3 text-left font-semibold text-slate-600">Produto</th>
                <th class="px-4 py-3 text-right font-semibold text-slate-600">Valor</th>
              </tr>
            </thead>
            <tbody class="divide-y divide-slate-200">
              {#each historicoOrcamentos as orcamento}
                <tr
                  class="cursor-pointer transition-colors hover:bg-slate-50"
                  on:click={() => goto(`/orcamentos/${orcamento.id}`)}
                >
                  <td class="px-4 py-3 text-slate-700">{formatDate(orcamento.data_orcamento)}</td>
                  <td class="px-4 py-3">
                    <span
                      class={`inline-flex rounded-full px-2.5 py-1 text-xs font-semibold ${getStatusBadge(orcamento.status)}`}
                    >
                      {getStatusLabel(orcamento.status)}
                    </span>
                  </td>
                  <td class="px-4 py-3 text-slate-900">{orcamento.produto_nome || '-'}</td>
                  <td class="px-4 py-3 text-right text-slate-900"
                    >{formatCurrency(orcamento.valor)}</td
                  >
                </tr>
              {/each}
            </tbody>
          </table>
        </div>
      {:else}
        <div
          class="rounded-vtur-lg border border-dashed border-slate-300 bg-slate-50 px-5 py-8 text-center text-sm text-slate-500"
        >
          Nenhum orcamento vinculado a este cliente.
        </div>
      {/if}
    </Card>
  </div>

  <div
    id="cliente-panel-viagens"
    role="tabpanel"
    aria-labelledby="cliente-tab-viagens"
    hidden={abaAtiva !== 'viagens'}
  >
    <ClienteViagensCard clienteId={String(clienteId || '')} bind:semAcesso={semAcessoViagens} />
  </div>
  <div
    id="cliente-panel-contatos"
    role="tabpanel"
    aria-labelledby="cliente-tab-contatos"
    hidden={abaAtiva !== 'contatos'}
  >
    <ClienteContatosCard
      clienteId={String(clienteId || '')}
      versao={versaoContatos}
      bind:semAcesso={semAcessoContatos}
    />
  </div>
  <div
    id="cliente-panel-notas"
    role="tabpanel"
    aria-labelledby="cliente-tab-notas"
    hidden={abaAtiva !== 'notas'}
  >
    <Card title="Notas e contexto" color="clientes">
      <p class="text-sm leading-6 text-slate-700">
        {cliente.notas || cliente.observacoes || 'Sem observacoes registradas.'}
      </p>
    </Card>
  </div>

  {#if ModalAvisoClienteComponent}
    <svelte:component
      this={ModalAvisoClienteComponent}
      bind:open={showAvisoModal}
      {clienteId}
      clienteNome={cliente.nome}
      clienteTelefone={cliente.whatsapp || cliente.telefone || ''}
      clienteEmail={cliente.email || ''}
      clienteNascimento={cliente.nascimento || null}
      onClose={() => (showAvisoModal = false)}
      onEnviar={() => {
        toast.success('Aviso preparado com sucesso.');
        versaoContatos += 1;
      }}
    />
  {/if}
{/if}
