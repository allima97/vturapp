<script lang="ts">
  import { page } from '$app/stores';
  import { goto } from '$app/navigation';
  import { onDestroy, onMount } from 'svelte';
  import { PageHeader, Button, LoadingState } from '$lib/components/ui';
  import EtapaDadosVenda from './_components/EtapaDadosVenda.svelte';
  import EtapaPagamentos from './_components/EtapaPagamentos.svelte';
  import EtapaRecibos from './_components/EtapaRecibos.svelte';
  import EtapaResumo from './_components/EtapaResumo.svelte';
  import EtapasNavegacao from './_components/EtapasNavegacao.svelte';
  import { vendasGeograficasAtivas } from '$lib/config/destinosGeograficos';
  import { criarEstadoCidadeGeografica } from '$lib/features/vendas/cidadeGeograficaEstado';
  import { toast } from '$lib/stores/ui';
  import { toUserMessage } from '$lib/utils/errors';
  import { todayISODateLocal } from '$lib/date';
  import { ArrowLeft } from '$lib/icons';
  import {
    adicionarParcela,
    createPagamento,
    filtrarProdutosPorTipo,
    filtrarProdutosPorTipoCidade,
    gerarParcelas,
    getCidadeImportanceRank,
    getCidadeSearchScore,
    getClienteLabel,
    getSelectValue,
    getValeViagemProdutoVirtual as getValeViagemProdutoVirtualBase,
    isProdutoCompativelCidade as isProdutoCompativelCidadeBase,
    isValeViagemProduto,
    isValeViagemTipo as isValeViagemTipoBase,
    mergeCidadesById,
    mergeClientesById,
    normalizeLookup,
    normalizeText,
    parseMoney,
    produtoMatchesTipo as produtoMatchesTipoBase,
    removerParcela,
    sortCidades,
    valoresDaCalculadora
  } from '$lib/features/vendas/form';
  import { ApiError, apiFetch, apiGet, apiPatch, isCanceledApiError } from '$lib/services/api';
  import { ensureServerSessionCookie } from '$lib/services/session';

  let currentUser: { id: string; can_assign_vendedor?: boolean } | null = null;
  $: canAssignVendedor = currentUser?.can_assign_vendedor ?? false;

  type Option = {
    id: string;
    nome?: string | null;
    pais_nome?: string | null;
    estado?: string | null;
    uf?: string | null;
    sigla?: string | null;
    subdivisao_nome?: string | null;
    subdivisao?: { nome?: string | null; sigla?: string | null } | null;
    label?: string | null;
    grau_importancia?: number | null;
    tipo?: string | null;
    tipo_produto?: string | null;
    cidade_id?: string | null;
    todas_as_cidades?: boolean | null;
    destino?: string | null;
    paga_comissao?: boolean | null;
    permite_desconto?: boolean | null;
    desconto_padrao_pct?: number | null;
    ativo?: boolean | null;
    nome_completo?: string | null;
  };

  type Cliente = {
    id: string;
    nome: string;
    cpf?: string | null;
    telefone?: string | null;
    email?: string | null;
    whatsapp?: string | null;
  };

  type CalculadoraResultado = {
    valorFinal?: string | number | null;
    valorBruto?: string | number | null;
    descontoValor?: string | number | null;
    taxas?: string | number | null;
  };

  type CidadeLookupPayload = Option | null;

  type ProdutoLookupPayload = {
    id: string;
    nome?: string | null;
    cidade_id?: string | null;
    todas_as_cidades?: boolean | null;
    tipo?: string | null;
    tipo_produto?: string | null;
  } | null;

  type ProdutoResolvidoOptionSource = NonNullable<ProdutoLookupPayload>;

  type CadastroBasePayload = {
    user?: { id: string; can_assign_vendedor?: boolean } | null;
    vendedoresEquipe?: Option[] | null;
    clientes?: Cliente[] | null;
    cidades?: Option[] | null;
    produtos?: Option[] | null;
    tipos?: Option[] | null;
    tiposPacote?: Option[] | null;
    formasPagamento?: Option[] | null;
  };

  type PagamentoParcelaPayload = {
    numero?: string | number | null;
    valor?: string | number | null;
    vencimento?: string | null;
  };

  type PagamentoPayload = {
    forma_pagamento_id?: string | null;
    forma_nome?: string | null;
    operacao?: string | null;
    plano?: string | null;
    valor_bruto?: string | number | null;
    desconto_valor?: string | number | null;
    valor_total?: string | number | null;
    parcelas_qtd?: string | number | null;
    parcelas_valor?: string | number | null;
    vencimento_primeira?: string | null;
    paga_comissao?: boolean | null;
    parcelas?: PagamentoParcelaPayload[] | null;
  };

  type ReciboPayload = {
    produto_id?: string | null;
    produto_resolvido_id?: string | null;
    produto_resolvido?: ProdutoResolvidoOptionSource | null;
    tipo_produto_id?: string | null;
    tipo_produtos?: { id?: string | null } | null;
    destino_cidade_id?: string | null;
    numero_recibo?: string | null;
    numero_reserva?: string | null;
    tipo_pacote?: string | null;
    valor_total?: string | number | null;
    valor_taxas?: string | number | null;
    valor_du?: string | number | null;
    valor_rav?: string | number | null;
    data_inicio?: string | null;
    data_fim?: string | null;
    contrato_url?: string | null;
    contrato_path?: string | null;
  };

  type VendaEditPayload = {
    vendedor_id?: string | null;
    cliente_id?: string | null;
    destino_id?: string | null;
    destino_cidade_id?: string | null;
    data_lancamento?: string | null;
    data_venda?: string | null;
    data_embarque?: string | null;
    data_final?: string | null;
    desconto_comercial_aplicado?: boolean | null;
    desconto_comercial_valor?: string | number | null;
    valor_total?: string | number | null;
    valor_total_bruto?: string | number | null;
    valor_total_pago?: string | number | null;
    valor_taxas?: string | number | null;
    valor_nao_comissionado?: string | number | null;
    status?: string | null;
    cancelada?: boolean | null;
    notas?: string | null;
    destino?: ProdutoResolvidoOptionSource | null;
    recibos?: ReciboPayload[] | null;
    pagamentos?: PagamentoPayload[] | null;
    vendedor?: { id?: string | null; nome?: string | null; nome_completo?: string | null } | null;
    cliente?: {
      id?: string | null;
      nome: string;
      cpf?: string | null;
      telefone?: string | null;
      email?: string | null;
      whatsapp?: string | null;
    } | null;
  } | null;

  const vendaId = String($page.params.id || '');
  const today = todayISODateLocal();
  const PT_BR_BASE_COLLATOR = new Intl.Collator('pt-BR', { sensitivity: 'base' });

  let loading = true;
  let saving = false;
  let currentStep = 0;
  let ensuringCidadeId = '';
  let ensuringProdutoId = '';
  let errors: Record<string, string> = {};
  let lastDestinoCidadeId = '';
  let estadoCidadeVenda = criarEstadoCidadeGeografica();

  let clientes: Cliente[] = [];
  let cidades: Option[] = [];
  let produtos: Option[] = [];
  let tipos: Option[] = [];
  let tiposPacote: Option[] = [];
  let formasPagamento: Option[] = [];
  let vendedoresEquipe: Option[] = [];
  let loadController: AbortController | null = null;
  let lookupController: AbortController | null = null;
  let loadSeq = 0;
  let lookupSeq = 0;
  let destroyed = false;

  let venda = {
    vendedor_id: '',
    cliente_id: '',
    destino_id: '',
    destino_cidade_id: '',
    data_lancamento: today,
    data_venda: today,
    data_embarque: '',
    data_final: '',
    desconto_comercial_aplicado: false,
    desconto_comercial_valor: '',
    valor_total: '',
    valor_total_bruto: '',
    valor_total_pago: '',
    valor_taxas: '',
    valor_nao_comissionado: '',
    status: 'pendente',
    cancelada: false,
    notas: ''
  };

  let recibos = [createRecibo(true)];
  let pagamentos = [createPagamento()];

  function createRecibo(principal = false) {
    return {
      principal,
      estadoCidade: criarEstadoCidadeGeografica(),
      usar_cidade_padrao: true,
      destino_cidade_id: '',
      tipo_produto_id: '',
      produto_id: '',
      produto_resolvido_id: '',
      numero_recibo: '',
      numero_reserva: '',
      tipo_pacote: '',
      valor_total: '',
      valor_taxas: '0',
      valor_du: '0',
      valor_rav: '0',
      data_inicio: '',
      data_fim: '',
      contrato_url: '',
      contrato_path: ''
    };
  }

  function isValeViagemTipo(tipoId: string) {
    return isValeViagemTipoBase(tipos, tipoId);
  }

  function getValeViagemProdutoVirtual(tipoId: string): Option | null {
    return getValeViagemProdutoVirtualBase(tipos, tipoId);
  }

  function produtoMatchesTipo(item: Option, tipoId: string) {
    return produtoMatchesTipoBase(tipos, item, tipoId);
  }

  function ensurePrincipalRecibo() {
    if (recibos.length === 0) return;
    if (recibos.some((item) => item.principal)) return;
    recibos = recibos.map((item, index) => ({ ...item, principal: index === 0 }));
  }

  async function loadBase(signal?: AbortSignal) {
    const data = await apiGet<CadastroBasePayload>(
      '/api/v1/vendas/cadastro-base',
      undefined,
      signal
    );
    currentUser = data.user ?? null;
    vendedoresEquipe = data.vendedoresEquipe || [];
    clientes = data.clientes || [];
    cidades = data.cidades || [];
    produtos = data.produtos || [];
    tipos = data.tipos || [];
    tiposPacote = (data.tiposPacote || []).filter((item: Option) => item.ativo !== false);
    formasPagamento = data.formasPagamento || [];
  }

  // Busca os dados brutos da venda via HTTP — não usa nenhum dado de loadBase.
  // Pode ser disparado em paralelo com loadBase().
  async function fetchVendaData(signal?: AbortSignal): Promise<VendaEditPayload> {
    try {
      return await apiFetch<VendaEditPayload>(`/api/v1/vendas/${vendaId}`, {
        redirectOnUnauthorized: false,
        redirectOnForbidden: false,
        signal
      });
    } catch (error) {
      if (isCanceledApiError(error)) return null;
      if (error instanceof ApiError && error.status === 401) {
        toast.error('Sessão expirada. Faça login novamente para continuar.');
        const next = `${$page.url.pathname}${$page.url.search}`;
        await goto(`/auth/login?session_expired=1&next=${encodeURIComponent(next)}`);
        return null;
      }
      if (error instanceof ApiError && error.status === 403) {
        toast.error(error.message || 'Você não tem permissão para editar esta venda.');
        await goto('/vendas');
        return null;
      }
      if (error instanceof ApiError && error.status === 404) {
        toast.error(error.message || 'Venda não encontrada.');
        await goto('/vendas');
        return null;
      }
      throw error;
    }
  }

  // Processa os dados da venda após loadBase() ter populado produtos/cidades/clientes/etc.
  async function processVendaData(data: VendaEditPayload, signal?: AbortSignal) {
    if (destroyed) return;
    if (!data) return;

    const sale = data;
    const destinoProduto = produtoResolvidoToOption(sale?.destino);
    if (destinoProduto) mergeProdutos([destinoProduto]);
    const statusNormalizado =
      String(sale?.status || 'pendente') === 'aberto'
        ? 'pendente'
        : String(sale?.status || 'pendente');

    venda = {
      vendedor_id: String(sale?.vendedor_id || currentUser?.id || ''),
      cliente_id: String(sale?.cliente_id || ''),
      destino_id: String(sale?.destino_id || ''),
      destino_cidade_id: String(
        sale?.destino_cidade_id ||
          produtos.find((item) => String(item.id) === String(sale?.destino_id || ''))?.cidade_id ||
          ''
      ),
      data_lancamento: String(sale?.data_lancamento || '').slice(0, 10) || today,
      data_venda: String(sale?.data_venda || '').slice(0, 10) || today,
      data_embarque: String(sale?.data_embarque || '').slice(0, 10),
      data_final: String(sale?.data_final || '').slice(0, 10),
      desconto_comercial_aplicado: Boolean(sale?.desconto_comercial_aplicado),
      desconto_comercial_valor: String(sale?.desconto_comercial_valor || ''),
      valor_total: String(sale?.valor_total || ''),
      valor_total_bruto: String(sale?.valor_total_bruto || ''),
      valor_total_pago: String(sale?.valor_total_pago || ''),
      valor_taxas: String(sale?.valor_taxas || ''),
      valor_nao_comissionado: String(sale?.valor_nao_comissionado || ''),
      status: statusNormalizado,
      cancelada: Boolean(sale?.cancelada),
      notas: String(sale?.notas || '')
    };

    const recibosData = Array.isArray(sale?.recibos) ? sale.recibos : [];
    if (recibosData.length > 0) {
      mergeProdutos(
        recibosData
          .map((item: ReciboPayload) => produtoResolvidoToOption(item?.produto_resolvido))
          .filter(Boolean) as Option[]
      );

      recibos = recibosData.map((item: ReciboPayload, index: number) => {
        const rawProdutoId = String(item?.produto_id || '').trim();
        const produtoIdEhTipo =
          Boolean(item?.tipo_produtos?.id) ||
          tipos.some((tipo) => String(tipo.id) === rawProdutoId);
        const produtoResolvidoId = String(
          item?.produto_resolvido_id ||
            item?.produto_resolvido?.id ||
            (!produtoIdEhTipo ? rawProdutoId : '') ||
            ''
        );
        const produtoRelacionado =
          produtos.find((p) => String(p.id) === produtoResolvidoId) ||
          produtoResolvidoToOption(item?.produto_resolvido);
        const cidadeReciboId = String(
          item?.destino_cidade_id || produtoRelacionado?.cidade_id || ''
        );
        const tipoProdutoId = String(
          item?.tipo_produto_id ||
            item?.tipo_produtos?.id ||
            produtoRelacionado?.tipo_produto ||
            (produtoIdEhTipo ? rawProdutoId : '') ||
            ''
        );
        return {
          principal: index === 0,
          estadoCidade: criarEstadoCidadeGeografica(),
          usar_cidade_padrao:
            !cidadeReciboId || String(cidadeReciboId) === String(sale?.destino_cidade_id || ''),
          destino_cidade_id: cidadeReciboId,
          tipo_produto_id: tipoProdutoId,
          produto_id: produtoResolvidoId,
          produto_resolvido_id: produtoResolvidoId,
          numero_recibo: String(item?.numero_recibo || ''),
          numero_reserva: String(item?.numero_reserva || ''),
          tipo_pacote: String(item?.tipo_pacote || ''),
          valor_total: String(item?.valor_total || ''),
          valor_taxas: String(item?.valor_taxas || '0'),
          valor_du: String(item?.valor_du || '0'),
          valor_rav: String(item?.valor_rav || '0'),
          data_inicio: String(item?.data_inicio || '').slice(0, 10),
          data_fim: String(item?.data_fim || '').slice(0, 10),
          contrato_url: String(item?.contrato_url || ''),
          contrato_path: String(item?.contrato_path || '')
        };
      });

      const produtosFaltantes = new Set<string>();
      const cidadesFaltantes = new Set<string>();
      for (const r of recibos) {
        if (r.produto_id && !produtos.some((p) => String(p.id) === r.produto_id)) {
          produtosFaltantes.add(r.produto_id);
        }
        if (
          r.destino_cidade_id &&
          !cidades.some((c) => String(c.id) === String(r.destino_cidade_id))
        ) {
          cidadesFaltantes.add(r.destino_cidade_id);
        }
      }
      await Promise.all(Array.from(produtosFaltantes).map((id) => ensureProdutoLoaded(id, signal)));
      await Promise.all(Array.from(cidadesFaltantes).map((id) => ensureCidadeLoaded(id, signal)));
    }

    const paymentsData = Array.isArray(sale?.pagamentos) ? sale.pagamentos : [];
    if (paymentsData.length > 0) {
      pagamentos = paymentsData.map((item: PagamentoPayload) => ({
        forma_pagamento_id: String(item?.forma_pagamento_id || ''),
        forma_nome: String(item?.forma_nome || ''),
        operacao: String(item?.operacao || ''),
        plano: String(item?.plano || ''),
        valor_bruto: String(item?.valor_bruto || ''),
        desconto_valor: String(item?.desconto_valor || ''),
        valor_total: String(item?.valor_total || ''),
        parcelas_qtd: Number(item?.parcelas_qtd || 1),
        parcelas_valor: String(item?.parcelas_valor || ''),
        vencimento_primeira: String(item?.vencimento_primeira || '').slice(0, 10),
        paga_comissao: item?.paga_comissao !== false,
        parcelas: Array.isArray(item?.parcelas)
          ? item.parcelas.map((parcela: PagamentoParcelaPayload, index: number) => ({
              numero: String(parcela?.numero || index + 1),
              valor: String(parcela?.valor || ''),
              vencimento: String(parcela?.vencimento || '').slice(0, 10)
            }))
          : []
      }));
    }

    const saleVendedor = sale.vendedor;
    if (saleVendedor && !vendedoresEquipe.some((v) => String(v.id) === String(saleVendedor.id))) {
      vendedoresEquipe = [
        ...vendedoresEquipe,
        {
          id: String(saleVendedor.id),
          nome_completo: saleVendedor.nome_completo || saleVendedor.nome
        }
      ];
    }

    if (sale.cliente) {
      const clienteId = String(sale.cliente.id);
      if (!clientes.some((c) => String(c.id) === clienteId)) {
        mergeClientes([
          {
            id: clienteId,
            nome: sale.cliente.nome,
            cpf: sale.cliente.cpf,
            telefone: sale.cliente.telefone,
            email: sale.cliente.email,
            whatsapp: sale.cliente.whatsapp
          }
        ]);
      }
    }

    if (venda.destino_id) {
      await ensureProdutoLoaded(venda.destino_id, signal);
      if (!venda.destino_cidade_id) {
        const produtoDestino = produtos.find((p) => String(p.id) === String(venda.destino_id));
        if (produtoDestino?.cidade_id) {
          venda.destino_cidade_id = String(produtoDestino.cidade_id);
        }
      }
      if (venda.destino_cidade_id) {
        await ensureCidadeLoaded(venda.destino_cidade_id, signal);
      }
    }

    ensurePrincipalRecibo();
  }

  onMount(async () => {
    loadController?.abort();
    const controller = new AbortController();
    loadController = controller;
    const seq = ++loadSeq;
    loading = true;
    try {
      await ensureServerSessionCookie();
      // Disparar as duas chamadas HTTP em paralelo: loadBase carrega o catálogo
      // e fetchVendaData busca os dados da venda. A rede não espera — só o
      // processamento da venda aguarda o catálogo estar pronto.
      const [, vendaRaw] = await Promise.all([
        loadBase(controller.signal),
        fetchVendaData(controller.signal)
      ]);
      if (seq !== loadSeq || destroyed) return;
      await processVendaData(vendaRaw, controller.signal);
    } catch (err) {
      if (isCanceledApiError(err)) return;
      toast.error(toUserMessage(err, 'Erro ao carregar dados da venda.'));
    } finally {
      if (seq === loadSeq && !destroyed) loading = false;
    }
  });

  onDestroy(() => {
    destroyed = true;
    loadSeq += 1;
    lookupSeq += 1;
    loadController?.abort();
    lookupController?.abort();
  });

  function addRecibo() {
    recibos = [...recibos, createRecibo(false)];
    ensurePrincipalRecibo();
  }

  function removeRecibo(index: number) {
    if (recibos.length === 1) return;
    recibos = recibos.filter((_, itemIndex) => itemIndex !== index);
    ensurePrincipalRecibo();
  }

  function markReciboPrincipal(index: number) {
    recibos = recibos.map((item, itemIndex) => ({ ...item, principal: itemIndex === index }));
  }

  function getProdutosByTipo(tipoId: string) {
    return filtrarProdutosPorTipo(produtos, tipos, tipoId, venda.destino_cidade_id);
  }

  function getCidadeById(cidadeId: string) {
    return cidades.find((item) => String(item.id) === String(cidadeId)) || null;
  }

  function mergeProdutos(items: Option[]) {
    if (!items.length) return;
    const byId = new Map<string, Option>();
    for (const item of produtos) {
      byId.set(String(item.id), item);
    }
    for (const item of items) {
      const id = String(item?.id || '').trim();
      if (!id) continue;
      const todasAsCidades =
        item.todas_as_cidades === true || (!item.cidade_id && item.todas_as_cidades !== false);
      byId.set(id, { ...(byId.get(id) || {}), ...item, todas_as_cidades: todasAsCidades });
    }
    produtos = Array.from(byId.values()).sort((a, b) =>
      PT_BR_BASE_COLLATOR.compare(String(a.nome || ''), String(b.nome || ''))
    );
  }

  function produtoResolvidoToOption(
    produto: ProdutoResolvidoOptionSource | null | undefined
  ): Option | null {
    const id = String(produto?.id || '').trim();
    if (!id) return null;
    return {
      id,
      nome: produto?.nome || 'Produto',
      cidade_id: produto?.cidade_id || null,
      tipo: produto?.tipo_produto || null,
      tipo_produto: produto?.tipo_produto || null,
      todas_as_cidades:
        produto?.todas_as_cidades === true ||
        (!produto?.cidade_id && produto?.todas_as_cidades !== false)
    };
  }

  function getProdutoById(produtoId: string) {
    return produtos.find((item) => String(item.id) === String(produtoId)) || null;
  }

  function getProdutoRealId(recibo: (typeof recibos)[number]) {
    const produtoId = String(recibo.produto_id || '').trim();
    const tipoId = String(recibo.tipo_produto_id || '').trim();
    if (isValeViagemTipo(tipoId) && produtoId === tipoId) {
      return String(recibo.produto_resolvido_id || '').trim();
    }
    return String(recibo.produto_resolvido_id || produtoId).trim();
  }

  function getProdutoCidadeId(recibo: (typeof recibos)[number]) {
    const produto = getProdutoById(getProdutoRealId(recibo));
    return String(produto?.cidade_id || '').trim();
  }

  function getReciboCidadeId(recibo: (typeof recibos)[number]) {
    const cidadeProduto = getProdutoCidadeId(recibo);
    return recibo.usar_cidade_padrao
      ? String(venda.destino_cidade_id || cidadeProduto || '')
      : String(recibo.destino_cidade_id || cidadeProduto || '');
  }

  function isProdutoCompativelCidade(produto: Option, cidadeId = venda.destino_cidade_id) {
    return isProdutoCompativelCidadeBase(produto, cidadeId);
  }

  function getProdutosByTipoCidade(tipoId: string, cidadeId: string): Option[] {
    return filtrarProdutosPorTipoCidade(produtos, tipos, tipoId, cidadeId);
  }

  function syncReciboTipoProduto(index: number, event?: Event) {
    const recibo = recibos[index];
    if (!recibo) return;
    if (event) {
      recibo.tipo_produto_id = getSelectValue(event);
    }
    if (!isValeViagemTipo(recibo.tipo_produto_id)) {
      const produtoAtual = getProdutoById(recibo.produto_id);
      if (
        recibo.produto_id &&
        (!produtoAtual || !produtoMatchesTipo(produtoAtual, recibo.tipo_produto_id))
      ) {
        recibo.produto_id = '';
        recibo.produto_resolvido_id = '';
        recibos = recibos;
      }
      return;
    }
    const produtosDisponiveis = getProdutosByTipoCidade(
      recibo.tipo_produto_id,
      getReciboCidadeId(recibo)
    );
    const valeViagem = produtosDisponiveis.find((item) => isValeViagemProduto(item)) || null;
    if (!valeViagem?.id) return;
    recibo.produto_id = String(valeViagem.id);
    recibo.produto_resolvido_id = produtos.some((item) => String(item.id) === String(valeViagem.id))
      ? String(valeViagem.id)
      : '';
    recibos = recibos;
  }

  function getProdutosOptionsRecibo(recibo: (typeof recibos)[number]) {
    const selectedId = getProdutoRealId(recibo);
    const filtered = getProdutosByTipoCidade(recibo.tipo_produto_id, getReciboCidadeId(recibo));
    if (isValeViagemTipo(recibo.tipo_produto_id)) {
      const valeViagem =
        filtered.find((item) => isValeViagemProduto(item)) ||
        getValeViagemProdutoVirtual(recibo.tipo_produto_id);
      if (!valeViagem) return filtered;
      const withoutDuplicates = filtered.filter(
        (item) => String(item.id) !== String(valeViagem.id) && !isValeViagemProduto(item)
      );
      return [valeViagem, ...withoutDuplicates];
    }
    if (!selectedId || filtered.some((produto) => String(produto.id) === selectedId))
      return filtered;
    const selected = getProdutoById(selectedId);
    return selected ? [selected, ...filtered] : filtered;
  }

  function syncReciboCidade(index: number, cidadeId: string) {
    const recibo = recibos[index];
    recibo.destino_cidade_id = cidadeId;
    recibos = recibos;
  }

  function toggleReciboCidadePadrao(index: number, checked: boolean) {
    const recibo = recibos[index];
    recibo.usar_cidade_padrao = checked;
    if (checked && vendasGeograficasAtivas) recibo.estadoCidade = criarEstadoCidadeGeografica();
    if (!checked && !recibo.destino_cidade_id) {
      recibo.destino_cidade_id = venda.destino_cidade_id || '';
    }
    syncReciboCidade(index, String(recibo.destino_cidade_id || ''));
  }

  function updateReciboProduto(index: number, event?: Event) {
    const recibo = recibos[index];
    if (event) {
      recibo.produto_id = getSelectValue(event);
    }
    if (
      isValeViagemTipo(recibo.tipo_produto_id) &&
      String(recibo.produto_id) === String(recibo.tipo_produto_id)
    ) {
      recibo.produto_resolvido_id = '';
      recibos = recibos;
      return;
    }
    recibo.produto_resolvido_id = recibo.produto_id;
    const produto = getProdutoById(recibo.produto_id);
    if (produto?.tipo_produto && !recibo.tipo_produto_id) {
      recibo.tipo_produto_id = String(produto.tipo_produto);
    }
    if (!recibo.usar_cidade_padrao && !recibo.destino_cidade_id && produto?.cidade_id) {
      recibo.destino_cidade_id = String(produto.cidade_id);
    }
    recibos = recibos;
  }

  function addPagamento() {
    pagamentos = [...pagamentos, createPagamento()];
  }

  function removePagamento(index: number) {
    if (pagamentos.length === 1) return;
    pagamentos = pagamentos.filter((_, itemIndex) => itemIndex !== index);
  }

  function syncFormaNome(index: number) {
    const forma = formasPagamento.find((item) => item.id === pagamentos[index].forma_pagamento_id);
    pagamentos[index].forma_nome = String(forma?.nome || '');
    pagamentos[index].paga_comissao = forma?.paga_comissao ?? true;
    pagamentos = pagamentos;
  }

  function rebuildParcelas(index: number) {
    const pagamento = pagamentos[index];
    const { parcelas, parcelas_valor } = gerarParcelas(pagamento);
    pagamento.parcelas = parcelas;
    pagamento.parcelas_valor = parcelas_valor;
    pagamentos = pagamentos;
  }

  function addParcela(index: number) {
    const pagamento = pagamentos[index];
    const { parcelas, parcelas_qtd } = adicionarParcela(pagamento.parcelas);
    pagamento.parcelas = parcelas;
    pagamento.parcelas_qtd = parcelas_qtd;
    pagamentos = pagamentos;
  }

  function removeParcela(index: number, parcelaIndex: number) {
    const pagamento = pagamentos[index];
    const { parcelas, parcelas_qtd } = removerParcela(pagamento.parcelas, parcelaIndex);
    pagamento.parcelas = parcelas;
    pagamento.parcelas_qtd = parcelas_qtd;
    pagamentos = pagamentos;
  }

  function getClienteSelecionado() {
    return clientes.find((item) => item.id === venda.cliente_id) || null;
  }

  function mergeClientes(items: Cliente[]) {
    if (!items.length) return;
    clientes = mergeClientesById(clientes, items);
  }

  function mergeCidades(items: Option[]) {
    if (!items.length) return;
    cidades = mergeCidadesById(cidades, items);
  }

  async function ensureCidadeLoaded(cidadeId: string, signal?: AbortSignal) {
    const id = String(cidadeId || '').trim();
    if (!id) return;
    if (cidades.some((item) => String(item.id) === id)) return;
    if (ensuringCidadeId === id) return;
    let seq = lookupSeq;
    if (!signal) {
      lookupController?.abort();
      lookupController = new AbortController();
      signal = lookupController.signal;
      seq = ++lookupSeq;
    }
    ensuringCidadeId = id;
    try {
      const payload = await apiGet<CidadeLookupPayload>(
        '/api/v1/vendas/cidades-busca',
        { id },
        signal
      );
      if (destroyed || seq !== lookupSeq) return;
      if (payload?.id) mergeCidades([payload]);
    } catch (err) {
      if (isCanceledApiError(err)) return;
      // Mantem a tela funcionando mesmo sem prefetch complementar.
    } finally {
      if (ensuringCidadeId === id && !destroyed) ensuringCidadeId = '';
    }
  }

  async function ensureProdutoLoaded(produtoId: string, signal?: AbortSignal) {
    const id = String(produtoId || '').trim();
    if (!id) return;
    if (produtos.some((item) => String(item.id) === id)) return;
    if (ensuringProdutoId === id) return;
    let seq = lookupSeq;
    if (!signal) {
      lookupController?.abort();
      lookupController = new AbortController();
      signal = lookupController.signal;
      seq = ++lookupSeq;
    }
    ensuringProdutoId = id;
    try {
      const payload = await apiGet<ProdutoLookupPayload>(
        `/api/v1/produtos/${encodeURIComponent(id)}`,
        undefined,
        signal
      );
      if (destroyed || seq !== lookupSeq) return;
      if (payload?.id) {
        const todasAsCidades =
          payload.todas_as_cidades === true ||
          (!payload.cidade_id && payload.todas_as_cidades !== false);
        produtos = [
          ...produtos,
          {
            id: String(payload.id),
            nome: payload.nome,
            cidade_id: payload.cidade_id,
            todas_as_cidades: todasAsCidades,
            tipo: payload.tipo,
            tipo_produto: payload.tipo_produto
          }
        ];
      }
    } catch (err) {
      if (isCanceledApiError(err)) return;
      // Mantem a tela funcionando mesmo sem prefetch complementar.
    } finally {
      if (ensuringProdutoId === id && !destroyed) ensuringProdutoId = '';
    }
  }

  function validateStep(step: number) {
    errors = {};

    if (step >= 0) {
      if (vendasGeograficasAtivas && estadoCidadeVenda.pendente)
        errors.destino_cidade_id = 'Selecione uma cidade da lista ou limpe o campo.';
      if (!venda.vendedor_id) errors.vendedor_id = 'Informe o vendedor.';
      if (!venda.cliente_id) errors.cliente_id = 'Informe o cliente.';
      const possuiProdutoLocalPadrao = recibos.some((recibo) => {
        if (!recibo.usar_cidade_padrao) return false;
        const produto = produtos.find((item) => String(item.id) === String(recibo.produto_id));
        return Boolean(produto?.cidade_id) && produto?.todas_as_cidades !== true;
      });
      if (possuiProdutoLocalPadrao && !venda.destino_cidade_id) {
        errors.destino_cidade_id = 'Selecione a cidade padrão da venda.';
      }
      if (!venda.data_venda) errors.data_venda = 'Informe a data da venda.';
      if (!venda.data_embarque) errors.data_embarque = 'Informe a data de embarque.';
      if (!venda.data_final) errors.data_final = 'Informe a data final.';
      if (venda.data_embarque && venda.data_final && venda.data_final < venda.data_embarque) {
        errors.data_final = 'A data final deve ser igual ou posterior ao embarque.';
      }
    }

    if (step >= 1) {
      if (recibos.length === 0) errors.recibos = 'Inclua ao menos um recibo.';
      for (const [index, recibo] of recibos.entries()) {
        const cidadeReciboId = getReciboCidadeId(recibo);
        if (!recibo.tipo_produto_id) errors[`recibo_tipo_${index}`] = 'Obrigatório';
        if (!recibo.produto_id) errors[`recibo_produto_${index}`] = 'Obrigatório';
        if (!cidadeReciboId) errors[`recibo_cidade_${index}`] = 'Selecione a cidade.';
        if (vendasGeograficasAtivas && !recibo.usar_cidade_padrao && recibo.estadoCidade.pendente)
          errors[`recibo_cidade_${index}`] = 'Selecione uma cidade da lista ou limpe o campo.';
        if (!recibo.numero_recibo) errors[`recibo_numero_${index}`] = 'Obrigatório';
        if (!recibo.tipo_pacote) errors[`recibo_pacote_${index}`] = 'Obrigatório';
        if (!recibo.data_inicio) errors[`recibo_inicio_${index}`] = 'Obrigatório';
        if (!recibo.data_fim) errors[`recibo_fim_${index}`] = 'Obrigatório';
        if (recibo.data_inicio && recibo.data_fim && recibo.data_fim < recibo.data_inicio) {
          errors[`recibo_fim_${index}`] = 'Fim deve ser igual ou após início.';
        }
        if (!recibo.valor_total) errors[`recibo_total_${index}`] = 'Obrigatório';
      }
    }

    if (step >= 2) {
      if (pagamentos.length === 0) errors.pagamentos = 'Inclua ao menos um pagamento.';
      for (const [index, pagamento] of pagamentos.entries()) {
        if (!pagamento.forma_pagamento_id && !pagamento.forma_nome) {
          errors[`pagamento_forma_${index}`] = 'Informe a forma de pagamento.';
        }
      }
    }

    return Object.keys(errors).length === 0;
  }

  function goStep(nextStep: number) {
    const bounded = Math.max(0, Math.min(2, nextStep));
    if (bounded > currentStep && !validateStep(currentStep)) {
      toast.error('Revise os campos obrigatórios antes de avançar.');
      return;
    }
    currentStep = bounded;
  }

  function applyValoresCalculadora(resultado: CalculadoraResultado) {
    const valores = valoresDaCalculadora(resultado);
    venda.valor_total = valores.valor_total;
    venda.valor_total_bruto = valores.valor_total_bruto;
    venda.desconto_comercial_aplicado = valores.desconto_comercial_aplicado;
    venda.desconto_comercial_valor = valores.desconto_comercial_valor;
    venda.valor_taxas = valores.valor_taxas;
  }

  async function handleSubmit() {
    if (!validateStep(2)) {
      toast.error('Preencha os campos obrigatórios antes de salvar.');
      return;
    }

    saving = true;

    try {
      const primeiroReciboComProduto =
        recibos.find((item) => getProdutoRealId(item)) || recibos[0] || null;
      const destinoId = primeiroReciboComProduto
        ? getProdutoRealId(primeiroReciboComProduto) || venda.destino_id
        : venda.destino_id;

      const totalRecibos = recibos.reduce((acc, item) => acc + parseMoney(item.valor_total), 0);
      const totalTaxasRecibos = recibos.reduce(
        (acc, item) => acc + parseMoney(item.valor_taxas),
        0
      );
      const totalPago = pagamentos.reduce((acc, item) => acc + parseMoney(item.valor_total), 0);
      const totalNaoComissionado = pagamentos.reduce((acc, item) => {
        return item.paga_comissao === false ? acc + parseMoney(item.valor_total) : acc;
      }, 0);

      const vendaPayload = {
        ...venda,
        destino_id: destinoId,
        valor_total:
          venda.valor_total || String(Math.max(0, totalPago - totalNaoComissionado).toFixed(2)),
        valor_total_bruto: venda.valor_total_bruto || String(totalRecibos.toFixed(2)),
        valor_total_pago: venda.valor_total_pago || String(totalPago.toFixed(2)),
        valor_taxas: venda.valor_taxas || String(totalTaxasRecibos.toFixed(2)),
        valor_nao_comissionado:
          venda.valor_nao_comissionado || String(totalNaoComissionado.toFixed(2))
      };

      const payload = {
        venda: vendaPayload,
        recibos: recibos.map((item) => {
          const { estadoCidade: _estadoCidade, ...dadosRecibo } = item;
          const produtoVirtualValeViagem =
            isValeViagemTipo(item.tipo_produto_id) &&
            String(item.produto_id) === String(item.tipo_produto_id);
          const produtoRealId = produtoVirtualValeViagem ? '' : getProdutoRealId(item);
          const produto = getProdutoById(produtoRealId);
          const tipoProdutoId = item.tipo_produto_id || String(produto?.tipo_produto || '');
          const cidadeReciboId = getReciboCidadeId(item);

          return {
            ...dadosRecibo,
            produto_id: tipoProdutoId,
            destino_cidade_id: cidadeReciboId || null,
            cidade_nome: getCidadeById(cidadeReciboId)?.nome || null,
            produto_nome: produtoVirtualValeViagem ? 'Vale Viagem' : produto?.nome || null,
            produto_resolvido_id: produtoVirtualValeViagem ? null : produtoRealId
          };
        }),
        pagamentos: pagamentos.map((item) => {
          const parcelasQtd = Number(item.parcelas_qtd || item.parcelas.length || 1);
          return {
            ...item,
            parcelas_qtd: parcelasQtd,
            parcelas_valor:
              item.parcelas_valor ||
              (parcelasQtd > 0 ? (parseMoney(item.valor_total) / parcelasQtd).toFixed(2) : ''),
            parcelas: Array.isArray(item.parcelas) && item.parcelas.length > 0 ? item.parcelas : []
          };
        })
      };

      await apiPatch(`/api/v1/vendas/${vendaId}`, payload);

      toast.success('Venda atualizada com sucesso!');
      goto('/vendas');
    } catch (err: unknown) {
      toast.error(toUserMessage(err, 'Erro ao atualizar venda.'));
    } finally {
      saving = false;
    }
  }

  // O $: do modo legado só reage às variáveis escritas nesta linha (não enxerga dentro de
  // getClienteSelecionado()). Por isso a mesma expressão da função fica aqui, idêntica.
  $: clienteSelecionado = clientes.find((item) => item.id === venda.cliente_id) || null;
  $: if (venda.destino_cidade_id) {
    ensureCidadeLoaded(venda.destino_cidade_id);
  }
  $: totalRecibos = recibos.reduce((acc, item) => acc + parseMoney(item.valor_total), 0);
  $: totalTaxas = recibos.reduce((acc, item) => acc + parseMoney(item.valor_taxas), 0);
  $: totalPagamentos = pagamentos.reduce((acc, item) => acc + parseMoney(item.valor_total), 0);
  $: diferencaFinanceira = Number((totalPagamentos - totalRecibos).toFixed(2));
  $: fechamentoFinanceiroOk = Math.abs(diferencaFinanceira) < 0.01;
  $: produtosDestinoFiltrados = produtos.filter((item) => isProdutoCompativelCidade(item));

  $: {
    recibos = recibos.map((recibo) => {
      if (recibo.tipo_produto_id) return recibo;
      if (!recibo.produto_id) return recibo;
      const produto = produtos.find((p) => String(p.id) === String(recibo.produto_id));
      if (!produto) {
        ensureProdutoLoaded(recibo.produto_id);
        return recibo;
      }
      return {
        ...recibo,
        tipo_produto_id: String(produto.tipo_produto || '')
      };
    });
  }
  $: if (venda.destino_cidade_id !== lastDestinoCidadeId) {
    lastDestinoCidadeId = venda.destino_cidade_id;
  }
</script>

<svelte:head>
  <title>Editar Venda | VTUR</title>
</svelte:head>

<PageHeader
  title="Editar Venda"
  subtitle={`Registro ${vendaId.slice(0, 8).toUpperCase()} com fluxo completo de venda, recibos e pagamentos.`}
  breadcrumbs={[{ label: 'Vendas', href: '/vendas' }, { label: 'Editar venda' }]}
/>

{#if loading}
  <LoadingState />
{:else}
  <EtapasNavegacao {currentStep} {goStep} />

  <form class="space-y-6" on:submit|preventDefault={handleSubmit}>
    {#if currentStep === 0}
      <EtapaDadosVenda
        bind:venda
        {errors}
        {canAssignVendedor}
        {vendedoresEquipe}
        {clientes}
        {clienteSelecionado}
        {cidades}
        {mergeClientes}
        {mergeCidades}
        {estadoCidadeVenda}
      />
    {/if}

    {#if currentStep === 1}
      <EtapaRecibos
        bind:recibos
        {errors}
        {cidades}
        {tipos}
        {tiposPacote}
        {addRecibo}
        {removeRecibo}
        {toggleReciboCidadePadrao}
        {getCidadeById}
        {getReciboCidadeId}
        {syncReciboCidade}
        {mergeCidades}
        {syncReciboTipoProduto}
        {getProdutosOptionsRecibo}
        {updateReciboProduto}
      />
    {/if}

    {#if currentStep === 2}
      <EtapaPagamentos
        bind:pagamentos
        {errors}
        {formasPagamento}
        {addPagamento}
        {removePagamento}
        {syncFormaNome}
        {rebuildParcelas}
        {addParcela}
        {removeParcela}
      />

      <EtapaResumo
        bind:venda
        {fechamentoFinanceiroOk}
        {diferencaFinanceira}
        {totalRecibos}
        {totalTaxas}
        {totalPagamentos}
      />
    {/if}

    <div class="flex items-center justify-between gap-3">
      <div class="flex gap-3">
        <Button type="button" variant="secondary" on:click={() => goto('/vendas')}>
          <ArrowLeft size={16} class="mr-2" />Voltar
        </Button>
      </div>
      <div class="flex items-center gap-3">
        {#if currentStep > 0}
          <Button type="button" variant="secondary" on:click={() => goStep(currentStep - 1)}
            >Etapa anterior</Button
          >
        {/if}
        {#if currentStep < 2}
          <Button
            type="button"
            variant="primary"
            color="vendas"
            on:click={() => goStep(currentStep + 1)}>Próxima etapa</Button
          >
        {:else}
          <Button type="submit" variant="primary" color="vendas" loading={saving}
            >Salvar alterações</Button
          >
        {/if}
      </div>
    </div>
  </form>
{/if}
