<script lang="ts">
  import { goto } from '$app/navigation';
  import { page } from '$app/stores';
  import { onDestroy, onMount } from 'svelte';
  import {
    PageHeader,
    Card,
    Button,
    FieldCheckbox,
    FieldInput,
    FieldSelect,
    FieldTextarea,
    FormPanel,
    LoadingState
  } from '$lib/components/ui';
  import CidadeAutocomplete from '$lib/components/vendas/CidadeAutocomplete.svelte';
  import CidadeGeograficaAutocomplete from '$lib/components/vendas/CidadeGeograficaAutocomplete.svelte';
  import { vendasGeograficasAtivas } from '$lib/config/destinosGeograficos';
  import { criarEstadoCidadeGeografica } from '$lib/features/vendas/cidadeGeograficaEstado';
  import ClienteAutocomplete from '$lib/components/vendas/ClienteAutocomplete.svelte';
  import { toast } from '$lib/stores/ui';
  import { toUserMessage } from '$lib/utils/errors';
  import { todayISODateLocal } from '$lib/date';
  import { ArrowLeft, CreditCard, Plus, Receipt, Trash2 } from '$lib/icons';
  import {
    adicionarParcela,
    createPagamento,
    filtrarProdutosPorTipo,
    filtrarProdutosPorTipoCidade,
    formatMoney,
    gerarParcelas,
    getCidadeImportanceRank,
    getCidadeLabel,
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
  import { apiGet, apiPost, isCanceledApiError } from '$lib/services/api';

  type CurrentUserPayload = {
    id: string;
    can_assign_vendedor?: boolean;
    company_id?: string | null;
  };

  let currentUser: CurrentUserPayload | null = null;
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
    company_id?: string | null;
  };

  type Cliente = {
    id: string;
    nome: string;
    cpf?: string | null;
    telefone?: string | null;
    email?: string | null;
    whatsapp?: string | null;
  };

  type CadastroBasePayload = {
    user?: CurrentUserPayload | null;
    vendedoresEquipe?: Option[];
    clientes?: Cliente[];
    cidades?: Option[];
    produtos?: Option[];
    tipos?: Option[];
    tiposPacote?: Option[];
    formasPagamento?: Option[];
    empresas?: Option[];
  };

  type OrcamentoResumoVenda = {
    codigo?: string | null;
    client_id?: string | null;
    cliente?: {
      nome?: string | null;
      email?: string | null;
      telefone?: string | null;
    } | null;
    notes?: string | null;
    observacoes?: string | null;
  };

  type CalculadoraResultado = {
    valorFinal?: string | number | null;
    valorBruto?: string | number | null;
    descontoValor?: string | number | null;
    taxas?: string | number | null;
  };

  const today = todayISODateLocal();

  let loading = true;
  let saving = false;
  let currentStep = 0;
  let ensuringCidadeId = '';
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
  let empresas: Option[] = [];
  let empresaId = '';
  let lastValeViagemBaseSignature = '';
  let loadController: AbortController | null = null;
  let lookupController: AbortController | null = null;
  let loadSeq = 0;
  let lookupSeq = 0;
  let destroyed = false;
  $: canSelectEmpresa = empresas.length > 1;
  $: vendedoresEmpresa = empresaId
    ? vendedoresEquipe.filter(
        (vendedorEquipe) => !vendedorEquipe.company_id || vendedorEquipe.company_id === empresaId
      )
    : vendedoresEquipe;

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
  const vendaStatusOptions = [
    { value: 'pendente', label: 'Pendente' },
    { value: 'confirmada', label: 'Confirmada' },
    { value: 'concluida', label: 'Concluída' },
    { value: 'cancelada', label: 'Cancelada' }
  ];

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
      contrato_path: '',
      vale_viagem_compacto: false
    };
  }

  function isValeViagemTipo(tipoId: string) {
    return isValeViagemTipoBase(tipos, tipoId);
  }

  function getValeViagemProdutoVirtual(tipoId: string): Option | null {
    return getValeViagemProdutoVirtualBase(tipos, tipoId);
  }

  function getProdutoRealId(recibo: (typeof recibos)[number]) {
    const produtoId = String(recibo.produto_id || '').trim();
    const tipoId = String(recibo.tipo_produto_id || '').trim();
    if (isValeViagemTipo(tipoId) && produtoId === tipoId) {
      return String(recibo.produto_resolvido_id || '').trim();
    }
    return String(recibo.produto_resolvido_id || produtoId).trim();
  }

  function isValeViagemRecibo(recibo: (typeof recibos)[number]) {
    return isValeViagemTipo(String(recibo.tipo_produto_id || ''));
  }

  function isValeViagemLinhaCompacta(recibo: (typeof recibos)[number]) {
    return recibo.vale_viagem_compacto === true && isValeViagemRecibo(recibo);
  }

  function getValeViagemBaseRecibo() {
    return (
      recibos.find((item) => isValeViagemRecibo(item) && item.vale_viagem_compacto !== true) || null
    );
  }

  function getValeViagemCamposHerdados(base: (typeof recibos)[number]) {
    return {
      usar_cidade_padrao: base.usar_cidade_padrao,
      destino_cidade_id: base.destino_cidade_id,
      tipo_produto_id: base.tipo_produto_id,
      produto_id: base.produto_id,
      produto_resolvido_id: base.produto_resolvido_id,
      numero_reserva: base.numero_reserva,
      tipo_pacote: base.tipo_pacote,
      valor_taxas: base.valor_taxas,
      valor_du: base.valor_du,
      valor_rav: base.valor_rav,
      data_inicio: base.data_inicio,
      data_fim: base.data_fim,
      contrato_url: base.contrato_url,
      contrato_path: base.contrato_path
    };
  }

  function createValeViagemCompacto(base: (typeof recibos)[number]) {
    return {
      ...createRecibo(false),
      ...getValeViagemCamposHerdados(base),
      numero_recibo: '',
      valor_total: '',
      vale_viagem_compacto: true
    };
  }

  function syncValeViagemCompactos() {
    const base = getValeViagemBaseRecibo();
    if (!base) return;
    const camposHerdados = getValeViagemCamposHerdados(base);
    let changed = false;
    const nextRecibos = recibos.map((item) => {
      if (!isValeViagemLinhaCompacta(item)) return item;
      changed = true;
      return {
        ...item,
        ...camposHerdados,
        numero_recibo: item.numero_recibo,
        valor_total: item.valor_total,
        principal: item.principal,
        vale_viagem_compacto: true
      };
    });
    if (changed) recibos = nextRecibos;
  }

  function getValeViagemBaseSignature() {
    const base = getValeViagemBaseRecibo();
    if (!base) return '';
    return JSON.stringify(getValeViagemCamposHerdados(base));
  }

  function produtoMatchesTipo(item: Option, tipoId: string) {
    return produtoMatchesTipoBase(tipos, item, tipoId);
  }

  function ensurePrincipalRecibo() {
    if (recibos.length === 0) return;
    if (recibos.some((item) => item.principal)) return;
    recibos = recibos.map((item, index) => ({ ...item, principal: index === 0 }));
  }

  onMount(async () => {
    loadController?.abort();
    const controller = new AbortController();
    loadController = controller;
    const seq = ++loadSeq;
    loading = true;
    try {
      const data = await apiGet<CadastroBasePayload>(
        '/api/v1/vendas/cadastro-base',
        undefined,
        controller.signal
      );
      if (seq !== loadSeq || destroyed) return;
      currentUser = data.user ?? null;
      vendedoresEquipe = data.vendedoresEquipe || [];
      clientes = data.clientes || [];
      cidades = data.cidades || [];
      produtos = data.produtos || [];
      tipos = data.tipos || [];
      tiposPacote = (data.tiposPacote || []).filter((item: Option) => item.ativo !== false);
      formasPagamento = data.formasPagamento || [];
      empresas = data.empresas || [];
      empresaId = data.user?.company_id || empresas[0]?.id || '';
      venda.vendedor_id = data.user?.can_assign_vendedor
        ? getDefaultVendedorIdForEmpresa(empresaId) || data.user?.id || ''
        : data.user?.id || '';
    } catch (err) {
      if (isCanceledApiError(err)) return;
      toast.error(toUserMessage(err, 'Erro ao carregar base do cadastro de vendas.'));
      goto('/vendas');
    }

    const orcamentoId = $page.url.searchParams.get('orcamento');
    if (orcamentoId) {
      await carregarOrcamento(orcamentoId, controller.signal, seq);
    }

    if (seq === loadSeq && !destroyed) loading = false;
  });

  async function carregarOrcamento(orcamentoId: string, signal?: AbortSignal, seq = loadSeq) {
    try {
      const orcamento = await apiGet<OrcamentoResumoVenda>(
        `/api/v1/orcamentos/${orcamentoId}/resumo-venda`,
        undefined,
        signal
      );
      if (seq !== loadSeq || destroyed) return;

      if (orcamento.client_id) {
        venda.cliente_id = orcamento.client_id;
        const clienteExistente = clientes.find((c) => c.id === orcamento.client_id);
        if (!clienteExistente && orcamento.cliente) {
          mergeClientes([
            {
              id: orcamento.client_id,
              nome: orcamento.cliente.nome || '',
              email: orcamento.cliente.email || null,
              telefone: orcamento.cliente.telefone || null
            }
          ]);
        }
      }

      if (orcamento.notes || orcamento.observacoes) {
        venda.notas = `Orçamento ${orcamento.codigo}:\n${orcamento.notes || orcamento.observacoes}`;
      }

      toast.success(`Dados do orçamento ${orcamento.codigo} carregados!`);
    } catch (err) {
      if (isCanceledApiError(err)) return;
      toast.warning(toUserMessage(err, 'Não foi possível carregar os dados do orçamento.'));
    }
  }

  onDestroy(() => {
    destroyed = true;
    loadSeq += 1;
    lookupSeq += 1;
    loadController?.abort();
    lookupController?.abort();
  });

  function addRecibo() {
    const valeViagemBase = getValeViagemBaseRecibo();
    recibos = [
      ...recibos,
      valeViagemBase ? createValeViagemCompacto(valeViagemBase) : createRecibo(false)
    ];
    ensurePrincipalRecibo();
  }

  function getDefaultVendedorIdForEmpresa(companyId: string) {
    const vendedores = companyId
      ? vendedoresEquipe.filter(
          (vendedorEquipe) => !vendedorEquipe.company_id || vendedorEquipe.company_id === companyId
        )
      : vendedoresEquipe;
    return vendedores[0]?.id || '';
  }

  function handleEmpresaChange() {
    if (!canAssignVendedor) return;
    const vendedorAtual = vendedoresEquipe.find(
      (vendedorEquipe) => vendedorEquipe.id === venda.vendedor_id
    );
    if (vendedorAtual && (!vendedorAtual.company_id || vendedorAtual.company_id === empresaId))
      return;
    venda.vendedor_id = getDefaultVendedorIdForEmpresa(empresaId);
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

  function getReciboCidadeId(recibo: (typeof recibos)[number]) {
    return recibo.usar_cidade_padrao
      ? venda.destino_cidade_id
      : String(recibo.destino_cidade_id || '');
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
      const produtoAtual = produtos.find((item) => String(item.id) === String(recibo.produto_id));
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
    const filtered = getProdutosByTipoCidade(recibo.tipo_produto_id, getReciboCidadeId(recibo));
    if (!isValeViagemTipo(recibo.tipo_produto_id)) return filtered;
    const valeViagem =
      filtered.find((item) => isValeViagemProduto(item)) ||
      getValeViagemProdutoVirtual(recibo.tipo_produto_id);
    if (!valeViagem) return filtered;
    const withoutDuplicates = filtered.filter(
      (item) => String(item.id) !== String(valeViagem.id) && !isValeViagemProduto(item)
    );
    return [valeViagem, ...withoutDuplicates];
  }

  function syncReciboCidade(index: number, cidadeId: string) {
    const recibo = recibos[index];
    recibo.destino_cidade_id = cidadeId;
    if (recibo.produto_id) {
      const produto = produtos.find((item) => String(item.id) === String(recibo.produto_id));
      if (produto && !isProdutoCompativelCidade(produto, getReciboCidadeId(recibo))) {
        recibo.produto_id = '';
        recibo.produto_resolvido_id = '';
      }
    }
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
      const payload = await apiGet<Option | null>('/api/v1/vendas/cidades-busca', { id }, signal);
      if (destroyed || (!signal && seq !== lookupSeq)) return;
      if (payload?.id) mergeCidades([payload]);
    } catch (err) {
      if (isCanceledApiError(err)) return;
      // Sem impacto funcional; mantemos a tela usavel.
    } finally {
      if (ensuringCidadeId === id && !destroyed) ensuringCidadeId = '';
    }
  }

  function validateStep(step: number) {
    errors = {};

    if (step >= 0) {
      if (vendasGeograficasAtivas && estadoCidadeVenda.pendente)
        errors.destino_cidade_id = 'Selecione uma cidade da lista ou limpe o campo.';
      if (canSelectEmpresa && !empresaId) errors.empresa_id = 'Selecione a empresa.';
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
        const valeViagem = isValeViagemRecibo(recibo);
        if (!recibo.tipo_produto_id) errors[`recibo_tipo_${index}`] = 'Obrigatório';
        if (!recibo.produto_id) errors[`recibo_produto_${index}`] = 'Obrigatório';
        if (!valeViagem && !cidadeReciboId)
          errors[`recibo_cidade_${index}`] = 'Selecione a cidade.';
        if (vendasGeograficasAtivas && !recibo.usar_cidade_padrao && recibo.estadoCidade.pendente)
          errors[`recibo_cidade_${index}`] = 'Selecione uma cidade da lista ou limpe o campo.';
        if (!recibo.numero_recibo) errors[`recibo_numero_${index}`] = 'Obrigatório';
        if (!valeViagem && !recibo.tipo_pacote) errors[`recibo_pacote_${index}`] = 'Obrigatório';
        if (!valeViagem && !recibo.data_inicio) errors[`recibo_inicio_${index}`] = 'Obrigatório';
        if (!valeViagem && !recibo.data_fim) errors[`recibo_fim_${index}`] = 'Obrigatório';
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
    syncValeViagemCompactos();

    saving = true;

    try {
      const primeiroReciboComProduto = recibos.find((item) => getProdutoRealId(item)) || recibos[0];
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
        company_id: empresaId || undefined,
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
          return {
            ...dadosRecibo,
            produto_id: item.tipo_produto_id || item.produto_id,
            destino_cidade_id: getReciboCidadeId(item) || null,
            cidade_nome: getCidadeById(getReciboCidadeId(item))?.nome || null,
            produto_nome: produtoVirtualValeViagem ? 'Vale Viagem' : null,
            produto_resolvido_id: produtoVirtualValeViagem
              ? null
              : item.produto_resolvido_id || item.produto_id
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

      const result = await apiPost<{ venda_id?: string }>('/api/v1/vendas/create', payload);

      toast.success('Venda cadastrada com sucesso!');
      goto('/vendas');
    } catch (err: unknown) {
      toast.error(toUserMessage(err, 'Erro ao salvar venda.'));
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
  $: possuiValeViagemBase = Boolean(getValeViagemBaseRecibo());
  $: {
    const valeViagemBaseSignature = getValeViagemBaseSignature();
    if (valeViagemBaseSignature && valeViagemBaseSignature !== lastValeViagemBaseSignature) {
      lastValeViagemBaseSignature = valeViagemBaseSignature;
      syncValeViagemCompactos();
    } else if (!valeViagemBaseSignature && lastValeViagemBaseSignature) {
      lastValeViagemBaseSignature = '';
    }
  }
  $: if (venda.destino_cidade_id !== lastDestinoCidadeId) {
    lastDestinoCidadeId = venda.destino_cidade_id;
    recibos = recibos.map((recibo) => {
      if (!recibo.usar_cidade_padrao) return recibo;
      if (!recibo.produto_id) return recibo;
      const produto = produtos.find((item) => String(item.id) === String(recibo.produto_id));
      if (!produto || isProdutoCompativelCidade(produto)) return recibo;
      return {
        ...recibo,
        produto_id: '',
        produto_resolvido_id: '',
        principal: false
      };
    });
    ensurePrincipalRecibo();
  }
</script>

<svelte:head>
  <title>Nova Venda | VTUR</title>
</svelte:head>

<PageHeader
  title="Nova Venda"
  subtitle="Fluxo completo com dados da venda, recibos e forma de pagamento."
  breadcrumbs={[{ label: 'Vendas', href: '/vendas' }, { label: 'Nova venda' }]}
/>

{#if loading}
  <LoadingState />
{:else}
  <div class="mb-6 grid grid-cols-1 gap-3 md:grid-cols-3">
    <Button
      type="button"
      variant="unstyled"
      class_name="!flex min-h-[76px] w-full flex-col! items-center! justify-center! gap-1 rounded-xl border px-4 py-3 text-center transition-colors duration-150 {currentStep ===
      0
        ? 'border-vendas-400 bg-vendas-50 text-vendas-700'
        : 'border-slate-200 bg-white text-slate-700 hover:bg-slate-50'}"
      on:click={() => goStep(0)}
    >
      <p class="text-xs font-semibold tracking-wide uppercase opacity-70">Etapa 1</p>
      <p class="font-semibold">Dados da venda</p>
    </Button>
    <Button
      type="button"
      variant="unstyled"
      class_name="!flex min-h-[76px] w-full flex-col! items-center! justify-center! gap-1 rounded-xl border px-4 py-3 text-center transition-colors duration-150 {currentStep ===
      1
        ? 'border-vendas-400 bg-vendas-50 text-vendas-700'
        : 'border-slate-200 bg-white text-slate-700 hover:bg-slate-50'}"
      on:click={() => goStep(1)}
    >
      <p class="text-xs font-semibold tracking-wide uppercase opacity-70">Etapa 2</p>
      <p class="font-semibold">Recibos</p>
    </Button>
    <Button
      type="button"
      variant="unstyled"
      class_name="!flex min-h-[76px] w-full flex-col! items-center! justify-center! gap-1 rounded-xl border px-4 py-3 text-center transition-colors duration-150 {currentStep ===
      2
        ? 'border-vendas-400 bg-vendas-50 text-vendas-700'
        : 'border-slate-200 bg-white text-slate-700 hover:bg-slate-50'}"
      on:click={() => goStep(2)}
    >
      <p class="text-xs font-semibold tracking-wide uppercase opacity-70">Etapa 3</p>
      <p class="font-semibold">Forma de pagamento</p>
    </Button>
  </div>

  <form class="space-y-6" on:submit|preventDefault={handleSubmit}>
    {#if currentStep === 0}
      <FormPanel
        title="Dados da venda"
        description="Preencha as informações básicas da venda"
        class_name="border-green-200"
      >
        <div slot="header-actions"></div>
        <div class="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-4">
          {#if canSelectEmpresa}
            <div>
              <FieldSelect
                label="Empresa *"
                bind:value={empresaId}
                options={[
                  { value: '', label: 'Selecione uma opção' },
                  ...empresas.map((empresa) => ({
                    value: empresa.id,
                    label: empresa.nome || empresa.label || 'Empresa'
                  }))
                ]}
                class_name="w-full"
                error={errors.empresa_id}
                on:change={handleEmpresaChange}
              />
            </div>
          {/if}

          {#if canAssignVendedor}
            <div>
              <FieldSelect
                label="Vendedor *"
                bind:value={venda.vendedor_id}
                options={[
                  { value: '', label: 'Selecione uma opção' },
                  ...vendedoresEmpresa.map((vendedorEquipe) => ({
                    value: vendedorEquipe.id,
                    label: vendedorEquipe.nome_completo || 'Vendedor'
                  }))
                ]}
                class_name="w-full"
                error={errors.vendedor_id}
              />
            </div>
          {/if}

          <div class="md:col-span-2">
            <ClienteAutocomplete
              id="venda-nova-cliente"
              label="Cliente"
              required={true}
              bind:value={venda.cliente_id}
              clients={clientes}
              error={errors.cliente_id}
              on:loaded={(event) => mergeClientes(event.detail)}
            />
            {#if clienteSelecionado}
              <p class="mt-1 text-xs text-slate-500">
                {clienteSelecionado.email ||
                  clienteSelecionado.whatsapp ||
                  clienteSelecionado.telefone ||
                  'Cliente selecionado'}
              </p>
            {/if}
            {#if errors.cliente_id}<p role="alert" class="mt-1 text-xs text-red-600">
                {errors.cliente_id}
              </p>{/if}
          </div>

          <div>
            {#if vendasGeograficasAtivas}
              <CidadeGeograficaAutocomplete
                id="venda-nova-cidade"
                label="Cidade padrão da venda"
                bind:value={venda.destino_cidade_id}
                cities={cidades}
                estado={estadoCidadeVenda}
                error={errors.destino_cidade_id}
                on:loaded={(event) => mergeCidades(event.detail)}
              />
            {:else}
              <CidadeAutocomplete
                id="venda-nova-cidade"
                label="Cidade padrão da venda"
                placeholder="Digite a cidade (ex.: Orlando)"
                bind:value={venda.destino_cidade_id}
                cities={cidades}
                error={errors.destino_cidade_id}
                on:loaded={(event) => mergeCidades(event.detail)}
              />
            {/if}
            <p class="mt-1 text-xs text-slate-500">
              Use esta cidade em todos os recibos por padrão. Você pode trocar em recibos
              específicos na etapa seguinte.
            </p>
          </div>

          <div>
            <FieldInput
              id="venda-nova-data-lancamento"
              label="Lançada em"
              type="date"
              bind:value={venda.data_lancamento}
              class_name="w-full"
            />
          </div>
          <div>
            <FieldInput
              id="venda-nova-data-venda"
              label="Data da venda"
              type="date"
              bind:value={venda.data_venda}
              class_name="w-full"
              error={errors.data_venda}
              required
            />
          </div>
          <div>
            <FieldInput
              id="venda-nova-data-embarque"
              label="Data de embarque"
              type="date"
              bind:value={venda.data_embarque}
              class_name="w-full"
              error={errors.data_embarque}
              required
            />
          </div>
          <div>
            <FieldInput
              id="venda-nova-data-final"
              label="Data final"
              type="date"
              bind:value={venda.data_final}
              min={venda.data_embarque || null}
              class_name="w-full"
              error={errors.data_final}
              required
            />
          </div>
        </div>
      </FormPanel>
    {/if}

    {#if currentStep === 1}
      <FormPanel
        title="Recibos da venda"
        description="Cadastre os recibos relacionados à venda"
        class_name="border-green-200"
      >
        <div class="mb-4 flex items-center justify-between">
          <div>
            <p class="text-sm text-slate-600">
              Cada recibo tem seu próprio produto, cidade, comissionamento e conciliação. A venda
              apenas agrupa a viagem do cliente.
            </p>
            {#if errors.recibos}<p role="alert" class="mt-1 text-xs text-red-600">
                {errors.recibos}
              </p>{/if}
          </div>
          <Button type="button" variant="secondary" on:click={addRecibo}>
            <Plus size={16} class="mr-2" />{possuiValeViagemBase
              ? 'Adicionar Vale Viagem'
              : 'Adicionar recibo'}
          </Button>
        </div>
        {#if possuiValeViagemBase}
          <div
            class="mb-4 rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-800"
          >
            Para Vale Viagem, os novos recibos entram como linhas compactas. O sistema herda os
            dados do recibo base e você preenche apenas número do recibo e valor.
          </div>
        {/if}

        <div class="space-y-4">
          {#each recibos as recibo, index (vendasGeograficasAtivas ? recibo.estadoCidade : index)}
            <div class="rounded-xl border border-slate-200 p-4">
              <div class="mb-3 flex items-center justify-between">
                <div class="flex items-center gap-3">
                  <div class="rounded-lg bg-green-50 p-2 text-green-700"><Receipt size={18} /></div>
                  <p class="font-semibold text-slate-900">Recibo {index + 1}</p>
                </div>
                <div class="flex items-center gap-2">
                  <Button type="button" variant="ghost" on:click={() => removeRecibo(index)}
                    ><Trash2 size={16} /></Button
                  >
                </div>
              </div>

              {#if isValeViagemLinhaCompacta(recibo)}
                <div
                  class="mb-3 rounded-lg border border-emerald-200 bg-emerald-50 px-3 py-2 text-xs text-emerald-800"
                >
                  Linha compacta de Vale Viagem. Tipo, produto, pacote, datas, reserva, taxas e
                  contrato serão gravados com os dados herdados do recibo base.
                </div>
                <div class="grid grid-cols-1 gap-4 md:grid-cols-2">
                  <div>
                    <FieldInput
                      id={`venda-nova-recibo-numero-${index}`}
                      label="Número recibo"
                      bind:value={recibo.numero_recibo}
                      class_name="w-full"
                      error={errors[`recibo_numero_${index}`]}
                      required
                    />
                  </div>
                  <div>
                    <FieldInput
                      money
                      id={`venda-nova-recibo-total-${index}`}
                      label="Valor total"
                      bind:value={recibo.valor_total}
                      class_name="w-full"
                      error={errors[`recibo_total_${index}`]}
                      required
                    />
                  </div>
                </div>
              {:else}
                <div class="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-4">
                  <div
                    class="rounded-lg border border-slate-200 bg-slate-50 p-3 md:col-span-2 xl:col-span-4"
                  >
                    <div class="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
                      <FieldCheckbox
                        label="Usar cidade padrão da venda"
                        checked={recibo.usar_cidade_padrao}
                        on:change={(event) =>
                          toggleReciboCidadePadrao(
                            index,
                            (event.target as HTMLInputElement)?.checked
                          )}
                      />
                      <p class="text-xs text-slate-500">
                        Cidade deste recibo:
                        <strong class="text-slate-700"
                          >{getCidadeLabel(
                            getCidadeById(getReciboCidadeId(recibo)) || {
                              id: '',
                              nome: 'Não informada'
                            }
                          )}</strong
                        >
                      </p>
                    </div>
                    {#if !recibo.usar_cidade_padrao}
                      <div class="mt-3">
                        {#if vendasGeograficasAtivas}
                          <CidadeGeograficaAutocomplete
                            id={`venda-nova-recibo-cidade-${index}`}
                            label="Cidade deste recibo"
                            required={!isValeViagemRecibo(recibo)}
                            bind:value={recibo.destino_cidade_id}
                            cities={cidades}
                            estado={recibo.estadoCidade}
                            error={errors[`recibo_cidade_${index}`]}
                            on:loaded={(event) => mergeCidades(event.detail)}
                            on:select={(event) =>
                              syncReciboCidade(index, String(event.detail?.id || ''))}
                          />
                        {:else}
                          <CidadeAutocomplete
                            id={`venda-nova-recibo-cidade-${index}`}
                            label="Cidade deste recibo"
                            required={!isValeViagemRecibo(recibo)}
                            bind:value={recibo.destino_cidade_id}
                            cities={cidades}
                            error={errors[`recibo_cidade_${index}`]}
                            on:loaded={(event) => mergeCidades(event.detail)}
                            on:select={(event) =>
                              syncReciboCidade(index, String(event.detail?.id || ''))}
                          />
                        {/if}
                      </div>
                    {/if}
                  </div>
                  <div>
                    <FieldSelect
                      id={`venda-nova-recibo-tipo-${index}`}
                      label="Tipo de produto"
                      bind:value={recibo.tipo_produto_id}
                      options={[
                        { value: '', label: 'Selecione uma opção' },
                        ...tipos.map((tipo) => ({
                          value: tipo.id,
                          label: tipo.nome || tipo.tipo || ''
                        }))
                      ]}
                      class_name="w-full"
                      error={errors[`recibo_tipo_${index}`]}
                      required
                      on:change={(event) => syncReciboTipoProduto(index, event)}
                    />
                  </div>
                  <div>
                    <FieldSelect
                      id={`venda-nova-recibo-produto-${index}`}
                      label="Produto"
                      bind:value={recibo.produto_id}
                      options={[
                        { value: '', label: 'Selecione uma opção' },
                        ...getProdutosOptionsRecibo(recibo).map((produto) => ({
                          value: produto.id,
                          label: produto.nome || ''
                        }))
                      ]}
                      class_name="w-full"
                      error={errors[`recibo_produto_${index}`]}
                      required
                      on:change={(event) => updateReciboProduto(index, event)}
                    />
                  </div>
                  <div>
                    <FieldInput
                      id={`venda-nova-recibo-numero-${index}`}
                      label="Número recibo"
                      bind:value={recibo.numero_recibo}
                      class_name="w-full"
                      error={errors[`recibo_numero_${index}`]}
                      required
                    />
                  </div>
                  <div>
                    <FieldInput
                      id={`venda-nova-recibo-reserva-${index}`}
                      label="Reserva"
                      bind:value={recibo.numero_reserva}
                      class_name="w-full"
                    />
                  </div>
                  <div>
                    <FieldSelect
                      id={`venda-nova-recibo-pacote-${index}`}
                      label="Tipo de pacote"
                      bind:value={recibo.tipo_pacote}
                      options={[
                        { value: '', label: 'Selecione uma opção' },
                        ...tiposPacote.map((pacote) => ({
                          value: pacote.nome || pacote.label || '',
                          label: pacote.nome || pacote.label || ''
                        }))
                      ]}
                      class_name="w-full"
                      error={errors[`recibo_pacote_${index}`]}
                      required={!isValeViagemRecibo(recibo)}
                    />
                  </div>
                  <div>
                    <FieldInput
                      id={`venda-nova-recibo-inicio-${index}`}
                      label="Data início"
                      type="date"
                      bind:value={recibo.data_inicio}
                      class_name="w-full"
                      error={errors[`recibo_inicio_${index}`]}
                      required={!isValeViagemRecibo(recibo)}
                    />
                  </div>
                  <div>
                    <FieldInput
                      id={`venda-nova-recibo-fim-${index}`}
                      label="Data fim"
                      type="date"
                      bind:value={recibo.data_fim}
                      min={recibo.data_inicio || null}
                      class_name="w-full"
                      error={errors[`recibo_fim_${index}`]}
                      required={!isValeViagemRecibo(recibo)}
                    />
                  </div>
                  <div>
                    <FieldInput
                      money
                      id={`venda-nova-recibo-total-${index}`}
                      label="Valor total"
                      bind:value={recibo.valor_total}
                      class_name="w-full"
                      error={errors[`recibo_total_${index}`]}
                      required
                    />
                  </div>
                  <div>
                    <FieldInput
                      money
                      id={`venda-nova-recibo-taxas-${index}`}
                      label="Taxas"
                      bind:value={recibo.valor_taxas}
                      class_name="w-full"
                    />
                  </div>
                  <div>
                    <FieldInput
                      money
                      id={`venda-nova-recibo-du-${index}`}
                      label="DU"
                      bind:value={recibo.valor_du}
                      class_name="w-full"
                    />
                  </div>
                  <div>
                    <FieldInput
                      money
                      id={`venda-nova-recibo-rav-${index}`}
                      label="RAV/RAC"
                      bind:value={recibo.valor_rav}
                      class_name="w-full"
                    />
                  </div>
                  <div>
                    <FieldInput
                      id={`venda-nova-recibo-contrato-url-${index}`}
                      label="Contrato (URL)"
                      bind:value={recibo.contrato_url}
                      class_name="w-full"
                    />
                  </div>
                  <div>
                    <FieldInput
                      id={`venda-nova-recibo-contrato-path-${index}`}
                      label="Contrato (Path)"
                      bind:value={recibo.contrato_path}
                      class_name="w-full"
                    />
                  </div>
                </div>
              {/if}
            </div>
          {/each}
        </div>
      </FormPanel>
    {/if}

    {#if currentStep === 2}
      <FormPanel
        title="Pagamentos"
        description="Registre a forma de pagamento e o parcelamento"
        class_name="border-green-200"
      >
        <div class="mb-4 flex items-center justify-between">
          <p class="text-sm text-slate-600">
            Configure forma de pagamento, parcelamento e comissionamento por pagamento.
          </p>
          <Button type="button" variant="secondary" on:click={addPagamento}
            ><Plus size={16} class="mr-2" />Adicionar pagamento</Button
          >
        </div>

        {#if errors.pagamentos}
          <p role="alert" class="mb-3 text-xs text-red-600">{errors.pagamentos}</p>
        {/if}

        <div class="space-y-4">
          {#each pagamentos as pagamento, index}
            <div class="rounded-xl border border-slate-200 p-4">
              <div class="mb-3 flex items-center justify-between">
                <div class="flex items-center gap-3">
                  <div class="rounded-lg bg-green-50 p-2 text-green-700">
                    <CreditCard size={18} />
                  </div>
                  <p class="font-semibold text-slate-900">Pagamento {index + 1}</p>
                </div>
                <Button type="button" variant="ghost" on:click={() => removePagamento(index)}
                  ><Trash2 size={16} /></Button
                >
              </div>

              <div class="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-4">
                <div>
                  <FieldSelect
                    id={`venda-nova-pagamento-forma-${index}`}
                    label="Forma"
                    bind:value={pagamento.forma_pagamento_id}
                    options={[
                      { value: '', label: 'Selecione uma opção' },
                      ...formasPagamento.map((forma) => ({
                        value: forma.id,
                        label: forma.nome || ''
                      }))
                    ]}
                    class_name="w-full"
                    error={errors[`pagamento_forma_${index}`]}
                    required
                    on:change={() => syncFormaNome(index)}
                  />
                  {#if !pagamento.forma_pagamento_id}
                    <FieldInput
                      id={`venda-nova-pagamento-forma-manual-${index}`}
                      bind:value={pagamento.forma_nome}
                      class_name="mt-2 w-full"
                      placeholder="Informe a forma manualmente"
                    />
                  {/if}
                </div>
                <div>
                  <FieldInput
                    id={`venda-nova-pagamento-operacao-${index}`}
                    label="Operação"
                    bind:value={pagamento.operacao}
                    class_name="w-full"
                  />
                </div>
                <div>
                  <FieldInput
                    id={`venda-nova-pagamento-plano-${index}`}
                    label="Plano"
                    bind:value={pagamento.plano}
                    class_name="w-full"
                  />
                </div>
                <div>
                  <FieldInput
                    money
                    id={`venda-nova-pagamento-bruto-${index}`}
                    label="Valor bruto"
                    bind:value={pagamento.valor_bruto}
                    class_name="w-full"
                  />
                </div>
                <div>
                  <FieldInput
                    money
                    id={`venda-nova-pagamento-desconto-${index}`}
                    label="Desconto"
                    bind:value={pagamento.desconto_valor}
                    class_name="w-full"
                  />
                </div>
                <div>
                  <FieldInput
                    money
                    id={`venda-nova-pagamento-total-${index}`}
                    label="Total"
                    bind:value={pagamento.valor_total}
                    class_name="w-full"
                  />
                </div>
                <div>
                  <div class="flex gap-2">
                    <FieldInput
                      id={`venda-nova-pagamento-parcelas-${index}`}
                      label="Qtd. parcelas"
                      type="number"
                      min="1"
                      bind:value={pagamento.parcelas_qtd}
                      class_name="w-full"
                    />
                    <Button
                      type="button"
                      variant="secondary"
                      on:click={() => rebuildParcelas(index)}>Gerar</Button
                    >
                  </div>
                </div>
                <div>
                  <FieldInput
                    money
                    id={`venda-nova-pagamento-valor-parcela-${index}`}
                    label="Valor da parcela"
                    bind:value={pagamento.parcelas_valor}
                    class_name="w-full"
                  />
                </div>
                <div>
                  <FieldInput
                    id={`venda-nova-pagamento-vencimento-${index}`}
                    label="1º vencimento"
                    type="date"
                    bind:value={pagamento.vencimento_primeira}
                    class_name="w-full"
                  />
                </div>
                <div class="flex items-end">
                  <FieldCheckbox
                    label="Paga comissão"
                    bind:checked={pagamento.paga_comissao}
                    color="vendas"
                  />
                </div>
              </div>

              <div class="mt-4 rounded-xl border border-slate-200 p-3">
                <div class="mb-3 flex items-center justify-between">
                  <p class="text-sm font-medium text-slate-700">Parcelas</p>
                  <Button type="button" variant="ghost" on:click={() => addParcela(index)}
                    ><Plus size={16} class="mr-2" />Adicionar parcela</Button
                  >
                </div>
                {#if pagamento.parcelas.length === 0}
                  <p class="text-xs text-slate-500">Nenhuma parcela cadastrada.</p>
                {:else}
                  <div class="space-y-2">
                    {#each pagamento.parcelas as parcela, parcelaIndex}
                      <div class="grid grid-cols-1 gap-2 md:grid-cols-4">
                        <FieldInput
                          bind:value={parcela.numero}
                          class_name="w-full"
                          placeholder="Número"
                        />
                        <FieldInput
                          money
                          bind:value={parcela.valor}
                          class_name="w-full"
                          placeholder="Valor"
                        />
                        <FieldInput
                          type="date"
                          bind:value={parcela.vencimento}
                          class_name="w-full"
                        />
                        <Button
                          type="button"
                          variant="danger"
                          on:click={() => removeParcela(index, parcelaIndex)}>Remover</Button
                        >
                      </div>
                    {/each}
                  </div>
                {/if}
              </div>
            </div>
          {/each}
        </div>
      </FormPanel>

      <FormPanel
        title="Resumo e observações"
        description="Verifique totais e adicione notas"
        class_name="border-green-200"
      >
        <div
          class="mb-4 rounded-xl border px-4 py-3 {fechamentoFinanceiroOk
            ? 'border-green-200 bg-green-50 text-green-700'
            : 'border-amber-200 bg-amber-50 text-amber-700'}"
        >
          {#if fechamentoFinanceiroOk}
            <p class="text-sm font-medium">Recibos e pagamentos estão conciliados.</p>
          {:else}
            <p class="text-sm font-medium">
              Há diferença entre recibos e pagamentos: {formatMoney(diferencaFinanceira)}
            </p>
          {/if}
        </div>

        <div class="grid grid-cols-1 gap-4 lg:grid-cols-4">
          <div class="rounded-xl border border-slate-200 bg-slate-50 p-4">
            <p class="text-xs tracking-wide text-slate-500 uppercase">Total recibos</p>
            <p class="mt-2 text-lg font-semibold text-slate-900">{formatMoney(totalRecibos)}</p>
          </div>
          <div class="rounded-xl border border-slate-200 bg-slate-50 p-4">
            <p class="text-xs tracking-wide text-slate-500 uppercase">Taxas</p>
            <p class="mt-2 text-lg font-semibold text-slate-900">{formatMoney(totalTaxas)}</p>
          </div>
          <div class="rounded-xl border border-slate-200 bg-slate-50 p-4">
            <p class="text-xs tracking-wide text-slate-500 uppercase">Pagamentos</p>
            <p class="mt-2 text-lg font-semibold text-slate-900">{formatMoney(totalPagamentos)}</p>
          </div>
          <div class="rounded-xl border border-slate-200 bg-slate-50 p-4">
            <FieldSelect
              label="Status"
              bind:value={venda.status}
              options={vendaStatusOptions}
              class_name="mt-0"
            />
          </div>
        </div>

        <div class="mt-4 grid grid-cols-1 gap-4 lg:grid-cols-2">
          <FieldInput
            money
            label="Valor total da venda"
            bind:value={venda.valor_total}
            class_name="w-full"
          />
          <FieldInput
            money
            label="Valor total bruto"
            bind:value={venda.valor_total_bruto}
            class_name="w-full"
          />
          <FieldInput
            money
            label="Valor total pago"
            bind:value={venda.valor_total_pago}
            class_name="w-full"
          />
          <FieldInput
            money
            label="Valor não comissionado"
            bind:value={venda.valor_nao_comissionado}
            class_name="w-full"
          />
        </div>

        <div class="mt-4">
          <FieldCheckbox
            id="cancelada"
            label="Venda cancelada"
            bind:checked={venda.cancelada}
            color="vendas"
          />
        </div>

        <FieldTextarea
          id="venda-nova-observacoes"
          label="Observações"
          bind:value={venda.notas}
          rows={4}
          class_name="mt-4 w-full"
          placeholder="Observações internas da venda"
        />
      </FormPanel>

      <div class="flex items-center gap-3">
        <Button type="button" variant="secondary" on:click={() => goto('/vendas')}>
          <ArrowLeft size={16} class="mr-2" />Voltar
        </Button>
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
            >Salvar venda</Button
          >
        {/if}
      </div>
    {/if}
  </form>
{/if}
