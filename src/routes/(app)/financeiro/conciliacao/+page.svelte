<script lang="ts">
  import { onDestroy, onMount } from 'svelte';
  import PageHeader from '$lib/components/ui/PageHeader.svelte';
  import Card from '$lib/components/ui/Card.svelte';
  import Button from '$lib/components/ui/Button.svelte';
  import FileInput from '$lib/components/ui/FileInput.svelte';
  import FileDropzone from '$lib/components/ui/FileDropzone.svelte';
  import Dialog from '$lib/components/ui/Dialog.svelte';
  import DataTable from '$lib/components/ui/DataTable.svelte';
  import LoadingState from '$lib/components/ui/LoadingState.svelte';
  import AbaAlteracoes from './_components/AbaAlteracoes.svelte';
  import AbaExecucoes from './_components/AbaExecucoes.svelte';
  import AbaRegistros from './_components/AbaRegistros.svelte';
  import JanelaAuditoriaVinculos from './_components/JanelaAuditoriaVinculos.svelte';
  import FieldCheckbox from '$lib/components/ui/form/FieldCheckbox.svelte';
  import { BottomSheet, FieldInput, FieldSelect, FieldTextarea } from '$lib/components/ui';
  import { toast } from '$lib/stores/ui';
  import { buildConciliacaoMetrics } from '$lib/conciliacao/business';
  import { parseConciliacaoImportFile, parseConciliacaoImportText } from '$lib/conciliacao/importParser';
  import { extractRexturFromText } from '$lib/conciliacao/facialRexturExtractor';
  import { todayISODateLocal } from '$lib/date';
  import {
    auditExpectedActual,
    auditIssueBorderClass,
    auditSeverityClass,
    auditSeverityLabel,
    exigeRanking,
    formatCurrency,
    formatDate,
    formatDateTime,
    formatDocumentoConciliacao,
    formatMoney,
    formatPercent,
    formatPtBrInput,
    getDiffModalSeverity,
    getImportDiffSeverity,
    resolveMetaDifLabel,
    statusImportLabel,
  } from './_components/formatters';
  import type {
    ConciliacaoChange,
    ConciliacaoExecution,
    ConciliacaoItem,
    ConciliacaoOperationLog,
    ConciliacaoSummary,
    DetalheRateioInfo,
    EmpresaOption,
    ImportLookupMatch,
    ImportPreviewRow,
    ProdutoOption,
    VendedorOption,
    VinculoAuditResult,
  } from './_components/types';
  import { toUserMessage } from '$lib/utils/errors';
  import { apiGet, apiPost, isCanceledApiError } from '$lib/services/api';
  import type { ConciliacaoLinhaInput } from '../../../api/v1/conciliacao/_types';
  import {
    AlertCircle,
    Calendar,
    CheckCircle,
    Clock3,
    FileText,
    Database,
    Download,
    FileClock,
    GitBranch,
    Loader2,
    RefreshCcw,
    Save,
    Pencil,
    ShieldAlert,
    SlidersHorizontal,
    Upload,
    Users
  } from '$lib/icons';

  let activeTab = 'visao_geral';
  let activeKpiView: 'visao_geral' | 'conciliados' | 'pendentes' | 'pendentes_ranking' | 'baixa_rac' | 'execucoes' = 'visao_geral';
  let loading = true;
  let running = false;
  let fixingVinculos = false;
  let vinculosAuditOpen = false;
  let vinculosAuditLoading = false;
  let vinculosAuditApplying = false;
  let vinculosAuditResult: VinculoAuditResult | null = null;
  let vinculosAuditScope: 'global' | 'recibo' = 'global';
  let vinculosAuditConciliacaoId: string | null = null;
  let saving = false;
  let importing = false;
  let reverting = false;
  let optionsLoading = false;
  let registrosLoading = false;
  let changesLoading = false;
  let executionsLoading = false;
  let operationMessage = '';
  let operationLogs: ConciliacaoOperationLog[] = [];

  let summary: ConciliacaoSummary = {
    total: 0,
    efetivados: 0,
    pendentes: 0,
    semRanking: 0,
    baixaRac: 0,
    totalValor: 0,
    timeline: [],
    lacunaCronologica: null
  };
  let registros: ConciliacaoItem[] = [];
  let changes: ConciliacaoChange[] = [];
  let executions: ConciliacaoExecution[] = [];
  let vendedores: VendedorOption[] = [];
  let produtosMeta: ProdutoOption[] = [];
  let empresas: EmpresaOption[] = [];
  let empresaId = '';

  let monthFilter = currentMonth();
  let dayFilter = '';
  let searchQuery = '';
  let showPendingOnly = false;
  let showOnlyConciliated = false;
  let rankingStatus: 'all' | 'pending' | 'assigned' | 'system' = 'all';
  let showBaixaRac = false;

  let vgFiltroDocumento = '';
  let vgFiltroVendedor = 'all';
  let vgFiltroStatus = 'all';
  let vgFiltroMes = 'all';
  let vgFiltroDia = 'all';
  let vgFiltroReciboEncontrado = 'all';
  let vgFiltroRanking = 'all';
  let vgFiltroConciliado = 'all';
  $: vgFiltroDocumentoNormalizado = vgFiltroDocumento.trim().toLowerCase();

  let selectedRow: ConciliacaoItem | null = null;
  let showDetailsDialog = false;
  let rankingVendedorId = '';
  let rankingProdutoId = '';
  let isBaixaRac = false;
  let marcadoConciliado = false;
  let detailsReadOnly = true;
  let detalheRateioInfo: DetalheRateioInfo | null = null;
  let detalheRateioLoading = false;

  let detalheValorLancamentos = '';
  let detalheValorTaxas = '';
  let detalheValorDescontos = '';
  let detalheValorAbatimentos = '';
  let detalheValorNaoComissionavel = '';
  let detalheValorCalculadaLoja = '';
  let detalheValorVisaoMaster = '';
  let detalheValorOpfax = '';
  let detalheValorSaldo = '';
  let detalheValorVendaReal = '';
  let detalheValorComissaoLoja = '';
  let detalhePercentualComissaoLoja = '';
  let detalheFaixaComissao = '';

  let importText = '';
  let importMode: 'movimento' | 'rextur' = 'movimento';
  let importFallbackDate = '';
  let importFileName = '';
  let importFiles: FileList | undefined = undefined;
  let importIgnored = 0;
  let importRowsTotal = 0;
  let importAutoLinked = 0;
  let importLookupMatches: Record<string, ImportLookupMatch | null> = {};
  let importPreparedRows: ImportPreviewRow[] = [];
  let importPreview: ImportPreviewRow[] = [];
  let importLookupSignature = '';
  let importLookupLoading = false;
  let importDiferencasModalOpen = false;
  let importDiferencas: Array<{ documento: string; movimento_data: string; valor_importacao: number; valor_sistema: number; taxas_importacao: number; taxas_sistema: number; diff_total: number; diff_taxas: number; severidade: 'warning' | 'critical' }> = [];
  let importDiferencasConfirmadas = false;
  let importParseError = '';
  let importParseCacheKey = '';
  let importParseCacheResult: { linhas: ConciliacaoLinhaInput[]; ignored: number } | null = null;

  // Dias sem movimento
  let diasSemMovimento: string[] = [];
  let semMovimentoModalOpen = false;
  let semMovimentoData = '';
  let semMovimentoObservacao = '';
  let semMovimentoLoading = false;
  let showFilterSheet = false;
  let loadAllRequestSeq = 0;
  let contextRequestSeq = 0;
  let contextAbortController: AbortController | null = null;
  let summaryRequestSeq = 0;
  let summaryAbortController: AbortController | null = null;
  let registrosRequestSeq = 0;
  let registrosAbortController: AbortController | null = null;
  let optionsRequestSeq = 0;
  let optionsAbortController: AbortController | null = null;
  let changesRequestSeq = 0;
  let changesAbortController: AbortController | null = null;
  let executionsRequestSeq = 0;
  let executionsAbortController: AbortController | null = null;
  let detalheRateioRequestSeq = 0;
  let detalheRateioAbortController: AbortController | null = null;
  let diasSemMovimentoRequestSeq = 0;
  let diasSemMovimentoAbortController: AbortController | null = null;

  $: rankingStatusOptions = [
    { value: 'all', label: 'Todos' },
    { value: 'pending', label: 'Pendentes' },
    { value: 'assigned', label: 'Atribuídos' },
    { value: 'system', label: 'Vinculados ao sistema' }
  ];

  $: vendedorOptions = vendedores.map((vendedor) => ({
    value: vendedor.id,
    label: vendedor.nome_completo
  }));

  $: produtoOptions = produtosMeta.map((produto) => ({
    value: produto.id,
    label: produto.nome
  }));

  $: empresaOptions = empresas.map((empresa) => ({
    value: empresa.id,
    label: empresa.nome
  }));

  $: canSelectEmpresa = empresaOptions.length > 1;

  const recordColumns = [
    { key: 'documento', label: 'Documento', sortable: true, width: '140px' },
    {
      key: 'movimento_data',
      label: 'Data',
      sortable: true,
      width: '110px',
      formatter: (value: string) => formatDate(value)
    },
    {
      key: 'descricao',
      label: 'Descrição / Status',
      formatter: (_: unknown, row: ConciliacaoItem) =>
        `<div class="flex flex-col gap-1"><span class="font-medium text-slate-900">${escapeHtml(row.descricao || 'Sem descrição')}</span><span class="text-xs text-slate-500">${escapeHtml(row.status_label || row.status || '-')}</span></div>`
    },
    {
      key: 'valor_calculada_loja',
      label: 'Valor Loja',
      sortable: true,
      align: 'right' as const,
      width: '130px',
      formatter: (value: number) => formatCurrency(value)
    },
    {
      key: 'percentual_comissao_loja',
      label: '% Loja',
      sortable: true,
      width: '90px',
      formatter: (value: number | null) => formatPercent(value)
    },
    {
      key: 'faixa_comissao',
      label: 'Faixa',
      width: '130px',
      formatter: (value: string | null) => `<span class="text-xs font-semibold text-slate-700">${escapeHtml(value || 'SEM_COMISSAO')}</span>`
    },
    {
      key: 'conciliado',
      label: 'Situação',
      width: '150px',
      formatter: (_: unknown, row: ConciliacaoItem) => buildSituacaoCell(row)
    }
  ];

  const changeColumns = [
    { key: 'numero_recibo', label: 'Recibo', sortable: true, width: '140px' },
    { key: 'field', label: 'Campo', sortable: true, width: '140px' },
    { key: 'old_value', label: 'Antes', align: 'right' as const, formatter: (value: number | null) => formatCurrency(value) },
    { key: 'new_value', label: 'Depois', align: 'right' as const, formatter: (value: number | null) => formatCurrency(value) },
    { key: 'changed_at', label: 'Alterado em', sortable: true, width: '160px', formatter: (value: string) => formatDateTime(value) },
    {
      key: 'reverted_at',
      label: 'Status',
      width: '120px',
      formatter: (value: string | null) =>
        value
          ? '<span class="rounded-full bg-slate-100 px-2 py-1 text-xs font-semibold text-slate-600">Revertido</span>'
          : '<span class="rounded-full bg-amber-100 px-2 py-1 text-xs font-semibold text-amber-700">Pendente</span>'
    }
  ];

  const executionColumns = [
    { key: 'created_at', label: 'Data', sortable: true, width: '160px', formatter: (value: string) => formatDateTime(value) },
    { key: 'actor', label: 'Origem', width: '100px' },
    { key: 'checked', label: 'Lidos', sortable: true, width: '90px' },
    { key: 'reconciled', label: 'Conciliados', sortable: true, width: '110px' },
    { key: 'still_pending', label: 'Pendentes', sortable: true, width: '100px' },
    {
      key: 'status',
      label: 'Status',
      width: '120px',
      formatter: (value: string) =>
        value === 'success'
          ? '<span class="rounded-full bg-green-100 px-2 py-1 text-xs font-semibold text-green-700">Sucesso</span>'
          : '<span class="rounded-full bg-red-100 px-2 py-1 text-xs font-semibold text-red-700">Erro</span>'
    }
  ];

  $: filteredRecords = registros.filter((row) => {
    if (showOnlyConciliated && !row.conciliado) return false;
    if (showPendingOnly && row.conciliado) return false;
    if (showBaixaRac && !row.is_baixa_rac) return false;
    if (searchQuery) {
      const haystack = [row.documento, row.numero_reserva, row.descricao, row.status, row.ranking_vendedor?.nome_completo, row.ranking_produto?.nome]
        .join(' ')
        .toLowerCase();
      if (!haystack.includes(searchQuery.toLowerCase())) return false;
    }
    return true;
  });

  $: registrosPendentes = filteredRecords.filter((row) => !row.conciliado);
  $: registrosConciliados = filteredRecords.filter((row) => row.conciliado);
  $: registrosBaixaRac = filteredRecords.filter(
    (row) => Boolean(row.is_baixa_rac) || String(row.ranking_vendedor_id || '') === 'BAIXA_RAC'
  );
  $: registrosPendentesRanking = filteredRecords.filter((row) => {
    const status = String(row.status || '').toUpperCase();
    const exigeRanking = status === 'BAIXA' || status === 'OPFAX';
    return exigeRanking && !String(row.ranking_vendedor_id || '').trim();
  });
  $: alteracoesPendentes = changes.filter((item) => !item.reverted_at);

  $: visaoGeralRows = registros.map((row) => {
    const vendedorNome =
      row.ranking_vendedor?.nome_completo ||
      vendedores.find((item) => item.id === row.ranking_vendedor_id)?.nome_completo ||
      null;
    const statusLabel = statusImportLabel(row.status);
    const exige = exigeRanking(row.status);
    return {
      ...row,
      _vendedor_nome: vendedorNome,
      _status_label: statusLabel,
      _recibo_encontrado: Boolean(row.venda_recibo_id),
      _ranking_ok: exige ? Boolean(String(row.ranking_vendedor_id || '').trim()) : null,
      _mes: String(row.movimento_data || '').slice(0, 7)
    };
  });

  $: vgStatusOptions = Array.from(
    new Set(visaoGeralRows.map((row) => row._status_label).filter((value): value is string => Boolean(value)))
  ).sort();
  $: vgVendedorOptions = Array.from(
    new Set(visaoGeralRows.map((row) => row._vendedor_nome).filter((value): value is string => Boolean(value)))
  ).sort();
  $: vgMesOptions = Array.from(new Set(visaoGeralRows.map((row) => row._mes).filter(Boolean))).sort().reverse();
  $: vgDiaOptions = Array.from(
    new Set(
      visaoGeralRows
        .filter((row) => vgFiltroMes === 'all' || row._mes === vgFiltroMes)
        .map((row) => String(row.movimento_data || ''))
        .filter(Boolean)
    )
  )
    .sort()
    .reverse();

  $: vgStatusSelectOptions = [
    { value: 'all', label: 'Todos' },
    ...vgStatusOptions.map((item) => ({ value: String(item || ''), label: String(item || '') })).filter((item) => item.value)
  ];
  $: vgVendedorSelectOptions = [
    { value: 'all', label: 'Todos' },
    ...vgVendedorOptions
      .map((item) => ({ value: String(item || ''), label: String(item || '') }))
      .filter((item) => item.value)
  ];
  $: vgMesSelectOptions = [
    { value: 'all', label: 'Todos' },
    ...vgMesOptions.map((item) => ({ value: String(item || ''), label: String(item || '') })).filter((item) => item.value)
  ];
  $: vgDiaSelectOptions = [
    { value: 'all', label: 'Todos do mês' },
    ...vgDiaOptions.map((item) => ({ value: String(item || ''), label: formatDate(item) })).filter((item) => item.value)
  ];

  $: visaoGeralFiltrados = visaoGeralRows.filter((row) => {
    if (
      vgFiltroDocumentoNormalizado &&
      ![row.documento, row.numero_reserva].join(' ').toLowerCase().includes(vgFiltroDocumentoNormalizado)
    ) return false;
    if (vgFiltroVendedor !== 'all' && row._vendedor_nome !== vgFiltroVendedor) return false;
    if (vgFiltroStatus !== 'all' && row._status_label !== vgFiltroStatus) return false;
    if (vgFiltroMes !== 'all' && row._mes !== vgFiltroMes) return false;
    if (vgFiltroDia !== 'all' && String(row.movimento_data || '') !== vgFiltroDia) return false;

    if (vgFiltroReciboEncontrado !== 'all') {
      if (vgFiltroReciboEncontrado === 'sim' && !row._recibo_encontrado) return false;
      if (vgFiltroReciboEncontrado === 'nao' && row._recibo_encontrado) return false;
    }

    if (vgFiltroRanking !== 'all') {
      if (vgFiltroRanking === 'sim' && row._ranking_ok !== true) return false;
      if (vgFiltroRanking === 'nao' && row._ranking_ok !== false) return false;
    }

    if (vgFiltroConciliado !== 'all') {
      if (vgFiltroConciliado === 'sim' && !row.conciliado) return false;
      if (vgFiltroConciliado === 'nao' && row.conciliado) return false;
    }

    return true;
  });

  function normalizeRexturLocalizador(value?: string | null) {
    return String(value || '')
      .trim()
      .replace(/^REXTUR[\s-]*/i, '')
      .toUpperCase();
  }

  function clearImportState() {
    importFiles = undefined;
    importText = '';
    importFileName = '';
    importFallbackDate = '';
    importIgnored = 0;
    importRowsTotal = 0;
    importAutoLinked = 0;
    importLookupMatches = {};
    importLookupSignature = '';
    importPreparedRows = [];
    importPreview = [];
    importDiferencasConfirmadas = false;
    importDiferencas = [];
    importParseError = '';
    importParseCacheKey = '';
    importParseCacheResult = null;
  }

  function setImportMode(mode: 'movimento' | 'rextur') {
    if (importMode === mode) return;
    importMode = mode;
    clearImportState();
  }

  function parseRexturConciliacaoImportText(text: string, fallbackDate?: string | null) {
    const raw = String(text || '').trim();
    if (!raw) return { linhas: [] as ConciliacaoLinhaInput[], ignored: 0 };

    const result = extractRexturFromText(raw);
    const movimentoData = fallbackDate || todayISODateLocal();
    const linhas = result.contratos.map((contrato) => {
      const localizador = normalizeRexturLocalizador(contrato.reserva_numero || contrato.contrato_numero);
      const passageiro = String(contrato.contratante?.nome || contrato.passageiros?.[0]?.nome || '').trim();
      const destino = String(contrato.destino || contrato.produto_principal || '').trim();
      const valorTotal = Number(contrato.total_pago ?? contrato.total_bruto ?? 0);
      const valorTaxas = Math.max(0, Number(contrato.taxas_embarque || 0));
      const valorRav = Math.max(0, Number(contrato.taxa_du || 0));

      return {
        documento: 'REXTUR',
        numero_reserva: localizador || null,
        movimento_data: movimentoData,
        status: 'BAIXA',
        descricao: ['BAIXA REXTUR', localizador ? `LOC ${localizador}` : '', passageiro, destino].filter(Boolean).join(' - '),
        valor_lancamentos: Number.isFinite(valorTotal) ? valorTotal : 0,
        valor_taxas: valorTaxas || null,
        valor_descontos: null,
        valor_abatimentos: null,
        valor_nao_comissionavel: valorRav || null,
        valor_comissao_loja: valorRav || null,
        percentual_comissao_loja: null,
        origem: 'rextur',
        raw: { localizador, origem: 'rextur' }
      } satisfies ConciliacaoLinhaInput;
    });

    return { linhas, ignored: 0 };
  }

  function parseImportTextForPreview() {
    const cacheKey = `${importMode}::${importFallbackDate || ''}::${importText}`;
    if (importParseCacheResult && importParseCacheKey === cacheKey) {
      return importParseCacheResult;
    }

    let result: { linhas: ConciliacaoLinhaInput[]; ignored: number };
    if (importMode !== 'rextur') {
      importParseError = '';
      result = parseConciliacaoImportText(importText, null);
    } else {
      try {
        importParseError = '';
        result = parseRexturConciliacaoImportText(importText, importFallbackDate || todayISODateLocal());
      } catch (error: unknown) {
        importParseError = toUserMessage(error, 'Não foi possível ler a Reserva Fácil Rextur.');
        result = { linhas: [] as ConciliacaoLinhaInput[], ignored: 0 };
      }
    }

    importParseCacheKey = cacheKey;
    importParseCacheResult = result;
    return result;
  }

  $: {
    // Keep this dependency explicit so the preview recomputes when lookup matches arrive.
    const _lookupMatches = importLookupMatches;

    const parsed = parseImportTextForPreview();
    importIgnored = parsed.ignored;

    const signature = parsed.linhas
      .map((row) => `${String(row.documento || '').trim()}::${String(row.numero_reserva || '').trim()}::${String(row.descricao || '').trim()}::${Number(row.valor_lancamentos || 0)}::${Number(row.valor_taxas || 0)}`)
      .join('|');

    if (!signature) {
      importLookupSignature = '';
      if (Object.keys(importLookupMatches).length > 0) importLookupMatches = {};
      if (importPreparedRows.length > 0) importPreparedRows = [];
    } else if (signature !== importLookupSignature) {
      // Text changed — full rebuild from scratch (discards manual edits, as expected for a new file)
      importLookupSignature = signature;
      if (importMode === 'movimento') {
        void loadImportLookup(parsed.linhas);
      } else {
        importLookupMatches = {};
      }
      importPreparedRows = buildImportPreviewRows(parsed.linhas, importFallbackDate || null);
    } else if (importPreparedRows.length > 0) {
      // Same text, lookup data updated — merge lookup results WITHOUT overwriting manual vendedor assignments
      importPreparedRows = importPreparedRows.map((row) => {
        const documento = String(row.documento || '').trim();
        const lookup = documento ? importLookupMatches[documento] : null;
        if (!lookup) return row;

        const rankingVendedorId = row.ranking_vendedor_id || lookup.vendedor_id || null;
        const temDiferenca = Boolean(lookup.diff_total != null || lookup.diff_taxas != null);

        return {
          ...row,
          ranking_vendedor_id: rankingVendedorId,
          venda_id: row.venda_id || lookup.venda_id || null,
          venda_recibo_id: row.venda_recibo_id || lookup.venda_recibo_id || null,
          sistema_valor_total: lookup.sistema_valor_total ?? null,
          sistema_valor_taxas: lookup.sistema_valor_taxas ?? null,
          tem_diferenca: temDiferenca,
          diff_total: lookup.diff_total ?? null,
          diff_taxas: lookup.diff_taxas ?? null,
          vendedor_ranking: resolveImportVendedorLabel(rankingVendedorId, row.status)
        };
      });
    } else {
      importPreparedRows = buildImportPreviewRows(parsed.linhas, importFallbackDate || null);
    }

    importRowsTotal = importPreparedRows.length;
    importAutoLinked = importPreparedRows.filter((row) => Boolean(row.ranking_vendedor_id)).length;
    importPreview = importPreparedRows;
  }

  async function loadUserContext() {
    const requestSeq = ++contextRequestSeq;
    contextAbortController?.abort();
    const controller = new AbortController();
    contextAbortController = controller;
    try {
      const data = await apiGet<{
        company_id?: string | null;
        company_ids?: string[];
        empresas?: EmpresaOption[];
      }>('/api/v1/user/context', undefined, controller.signal, 60_000);
      if (requestSeq !== contextRequestSeq) return;

      const nextEmpresas = Array.isArray(data.empresas)
        ? data.empresas
            .map((empresa) => ({
              id: String(empresa?.id || '').trim(),
              nome: String(empresa?.nome || 'Empresa sem nome').trim() || 'Empresa sem nome'
            }))
            .filter((empresa) => empresa.id)
        : [];

      empresas = nextEmpresas;
      const currentCompany = String(data.company_id || '').trim();
      empresaId = currentCompany || nextEmpresas[0]?.id || '';
    } catch (error: unknown) {
      if (isCanceledApiError(error)) return;
      if (requestSeq !== contextRequestSeq) return;
      empresas = [];
      empresaId = '';
      toast.error(toUserMessage(error, 'Erro ao carregar empresas do usuário.'));
    } finally {
      if (requestSeq === contextRequestSeq && contextAbortController === controller) {
        contextAbortController = null;
      }
    }
  }

  async function handleEmpresaChange() {
    clearImportState();
    selectedRow = null;
    showDetailsDialog = false;
    await loadAll();
  }

  onMount(async () => {
    loadOperationLogs();
    await loadUserContext();
    await loadAll();
  });

  onDestroy(() => {
    contextAbortController?.abort();
    summaryAbortController?.abort();
    registrosAbortController?.abort();
    optionsAbortController?.abort();
    changesAbortController?.abort();
    executionsAbortController?.abort();
    detalheRateioAbortController?.abort();
    diasSemMovimentoAbortController?.abort();
  });

  $: busyTitle = running
    ? 'Executando conciliação'
    : fixingVinculos
      ? 'Corrigindo vínculos'
      : importing
        ? 'Importando conciliação'
          : importLookupLoading
            ? 'Buscando usuários nas vendas'
          : loading
            ? 'Carregando registros'
            : operationMessage
              ? 'Processando'
              : '';

  $: busyMessage = running
    ? 'O sistema está comparando recibos, vendas e taxas para marcar vínculos automaticamente.'
    : fixingVinculos
      ? 'Verificando e corrigindo vínculos incorretos entre registros de conciliação e recibos de venda.'
      : importing
        ? 'O arquivo está sendo gravado e os registros existentes serão atualizados quando necessário.'
        : importLookupLoading
          ? 'Estamos procurando vendedores e recibos correspondentes no sistema para preencher o ranking automaticamente.'
          : loading
            ? 'Aguarde enquanto o sistema busca os dados da tabela.'
            : operationMessage;

  $: showBusyNotice = Boolean(busyTitle && (loading || running || fixingVinculos || importing || importLookupLoading || operationMessage));

  async function loadAll() {
    const requestSeq = ++loadAllRequestSeq;
    loading = true;
    operationMessage = 'Atualizando dados da conciliação financeira.';
    try {
      if (empresas.length > 0 && !empresaId) {
        throw new Error('Selecione uma empresa para carregar a conciliação.');
      }
      await Promise.all([loadSummary(), loadRegistros()]);
      if (requestSeq !== loadAllRequestSeq) return;
      void Promise.allSettled([loadOptions(), loadChanges(), loadExecutions(), loadDiasSemMovimento()]);
    } catch (err: unknown) {
      if (isCanceledApiError(err)) return;
      if (requestSeq !== loadAllRequestSeq) return;
      toast.error(toUserMessage(err, 'Erro ao atualizar dados da conciliação.'));
    } finally {
      if (requestSeq === loadAllRequestSeq) {
        loading = false;
        operationMessage = '';
      }
    }
  }

  async function loadSummary() {
    const requestSeq = ++summaryRequestSeq;
    summaryAbortController?.abort();
    const controller = new AbortController();
    summaryAbortController = controller;
    try {
      const data = await apiGet<{
        total?: number | null;
        efetivados?: number | null;
        pendentes?: number | null;
        semRanking?: number | null;
        baixaRac?: number | null;
        totalValor?: number | null;
        timeline?: Array<{ date: string; value: number }>;
        lacuna_cronologica?: ConciliacaoSummary['lacunaCronologica'];
      }>('/api/v1/conciliacao/summary', {
        mes: monthFilter || undefined,
        company_id: empresaId || undefined
      }, controller.signal, 60_000);
      if (requestSeq !== summaryRequestSeq) return;
      summary = {
        total: Number(data.total || 0),
        efetivados: Number(data.efetivados || 0),
        pendentes: Number(data.pendentes || 0),
        semRanking: Number(data.semRanking || 0),
        baixaRac: Number(data.baixaRac || 0),
        totalValor: Number(data.totalValor || 0),
        timeline: Array.isArray(data.timeline) ? data.timeline : [],
        lacunaCronologica: data.lacuna_cronologica || null
      };
    } catch (err) {
      if (isCanceledApiError(err)) return;
      throw err;
    } finally {
      if (requestSeq === summaryRequestSeq && summaryAbortController === controller) {
        summaryAbortController = null;
      }
    }
  }

  async function loadRegistros() {
    const requestSeq = ++registrosRequestSeq;
    registrosAbortController?.abort();
    const controller = new AbortController();
    registrosAbortController = controller;
    registrosLoading = true;
    try {
      const data = await apiGet<ConciliacaoItem[]>('/api/v1/conciliacao/list', {
        company_id: empresaId || undefined,
        month: monthFilter || undefined,
        day: dayFilter || undefined,
        pending: showPendingOnly ? '1' : undefined,
        baixa_rac: showBaixaRac ? '1' : undefined,
        ranking_status: rankingStatus !== 'all' ? rankingStatus : undefined
      }, controller.signal, 60_000);
      if (requestSeq !== registrosRequestSeq) return;
      registros = Array.isArray(data) ? data : [];
    } catch (err) {
      if (isCanceledApiError(err)) return;
      throw err;
    } finally {
      if (requestSeq === registrosRequestSeq) {
        registrosLoading = false;
        if (registrosAbortController === controller) {
          registrosAbortController = null;
        }
      }
    }
  }

  async function loadOptions() {
    const requestSeq = ++optionsRequestSeq;
    optionsAbortController?.abort();
    const controller = new AbortController();
    optionsAbortController = controller;
    optionsLoading = true;
    try {
      const data = await apiGet<{
        vendedores?: VendedorOption[];
        produtosMeta?: ProdutoOption[];
      }>('/api/v1/conciliacao/options', {
        company_id: empresaId || undefined
      }, controller.signal, 60_000);
      if (requestSeq !== optionsRequestSeq) return;
      vendedores = Array.isArray(data.vendedores) ? data.vendedores : [];
      produtosMeta = Array.isArray(data.produtosMeta) ? data.produtosMeta : [];
    } catch (err) {
      if (isCanceledApiError(err)) return;
      throw err;
    } finally {
      if (requestSeq === optionsRequestSeq) {
        optionsLoading = false;
        if (optionsAbortController === controller) {
          optionsAbortController = null;
        }
      }
    }
  }

  async function loadChanges() {
    const requestSeq = ++changesRequestSeq;
    changesAbortController?.abort();
    const controller = new AbortController();
    changesAbortController = controller;
    changesLoading = true;
    try {
      const data = await apiGet<ConciliacaoChange[]>('/api/v1/conciliacao/changes', {
        company_id: empresaId || undefined,
        month: monthFilter || undefined
      }, controller.signal, 60_000);
      if (requestSeq !== changesRequestSeq) return;
      changes = Array.isArray(data) ? data : [];
    } catch (err) {
      if (isCanceledApiError(err)) return;
      throw err;
    } finally {
      if (requestSeq === changesRequestSeq) {
        changesLoading = false;
        if (changesAbortController === controller) {
          changesAbortController = null;
        }
      }
    }
  }

  async function loadExecutions() {
    const requestSeq = ++executionsRequestSeq;
    executionsAbortController?.abort();
    const controller = new AbortController();
    executionsAbortController = controller;
    executionsLoading = true;
    try {
      const data = await apiGet<ConciliacaoExecution[]>('/api/v1/conciliacao/executions', {
        company_id: empresaId || undefined,
        limit: 20
      }, controller.signal, 60_000);
      if (requestSeq !== executionsRequestSeq) return;
      executions = Array.isArray(data) ? data : [];
    } catch (err) {
      if (isCanceledApiError(err)) return;
      throw err;
    } finally {
      if (requestSeq === executionsRequestSeq) {
        executionsLoading = false;
        if (executionsAbortController === controller) {
          executionsAbortController = null;
        }
      }
    }
  }

  function loadOperationLogs() {
    try {
      const raw = localStorage.getItem('vtur.conciliacao.operationLogs');
      const parsed = raw ? JSON.parse(raw) : [];
      operationLogs = Array.isArray(parsed) ? parsed.slice(0, 20) : [];
    } catch {
      operationLogs = [];
    }
  }

  function persistOperationLogs(nextLogs: ConciliacaoOperationLog[]) {
    operationLogs = nextLogs.slice(0, 20);
    try {
      localStorage.setItem('vtur.conciliacao.operationLogs', JSON.stringify(operationLogs));
    } catch {
      // localStorage pode estar indisponível em navegação privada; o log continua na sessão atual.
    }
  }

  function clearOperationLogs() {
    persistOperationLogs([]);
  }

  function addOperationLog(params: {
    action: string;
    status: 'success' | 'error';
    message: string;
    data?: Record<string, unknown>;
  }) {
    const data = params.data || {};
    persistOperationLogs([
      {
        id: `${Date.now()}-${Math.random().toString(36).slice(2)}`,
        created_at: new Date().toISOString(),
        action: params.action,
        status: params.status,
        message: params.message,
        month: monthFilter || '-',
        checked: Number(data.checked || data.total || 0),
        reconciled: Number(data.reconciled || data.reconciliados || 0),
        recalculated: Number(data.recalculated || 0),
        recalculatedChecked: Number(data.recalculatedChecked || 0),
        updatedTaxes: Number(data.updatedTaxes || 0),
        duplicateGroups: Number(data.duplicateGroups || 0),
        duplicatesRemoved: Number(data.duplicatesRemoved || 0),
        updateErrors: Number(data.updateErrors || 0)
      },
      ...operationLogs
    ]);
  }

  async function abrirImportacao() {
    activeTab = 'importacao';
  }

  async function aplicarKpiView(mode: 'visao_geral' | 'conciliados' | 'pendentes' | 'pendentes_ranking' | 'baixa_rac' | 'execucoes') {
    activeKpiView = mode;
    operationMessage =
      mode === 'execucoes'
        ? 'Aguarde enquanto o sistema busca os dados da tabela.'
        : 'Atualizando o recorte de registros da conciliação.';

    try {
      if (mode === 'execucoes') {
        activeTab = 'execucoes';
        await loadExecutions();
        return;
      }

      if (mode === 'visao_geral') {
        activeTab = 'visao_geral';
        showOnlyConciliated = false;
        showPendingOnly = false;
        showBaixaRac = false;
        rankingStatus = 'all';
        await loadRegistros();
        return;
      }

      activeTab = 'registros';
      showOnlyConciliated = mode === 'conciliados';
      showPendingOnly = mode === 'pendentes';
      showBaixaRac = mode === 'baixa_rac';
      rankingStatus = mode === 'pendentes_ranking' ? 'pending' : 'all';
      await loadRegistros();
    } finally {
      operationMessage = '';
    }
  }

  function onTabClick(key: string) {
    if (key === 'visao_geral') {
      activeTab = 'visao_geral';
      showPendingOnly = false;
      showBaixaRac = false;
      rankingStatus = 'all';
      return;
    }

    if (key === 'pendentes') {
      activeTab = 'registros';
      showPendingOnly = true;
      showBaixaRac = false;
      return;
    }

    if (key === 'baixa_rac') {
      activeTab = 'registros';
      showBaixaRac = true;
      showPendingOnly = false;
      return;
    }

    activeTab = key;
    if (key === 'registros') {
      showPendingOnly = false;
      showBaixaRac = false;
    }
  }

  async function openDetails(row: ConciliacaoItem) {
    selectedRow = row;
    rankingVendedorId = row.ranking_vendedor_id || '';
    rankingProdutoId = row.ranking_produto_id || '';
    isBaixaRac = Boolean(row.is_baixa_rac);
    marcadoConciliado = Boolean(row.conciliado);
    detailsReadOnly = true;
    detalheRateioInfo = null;
    fillDetailsForm(row);
    showDetailsDialog = true;
    await loadDetalheRateioInfo(row);
  }

  async function loadDetalheRateioInfo(row: ConciliacaoItem) {
    const requestSeq = ++detalheRateioRequestSeq;
    detalheRateioAbortController?.abort();
    const controller = new AbortController();
    detalheRateioAbortController = controller;
    const vendaReciboId = String(row?.venda_recibo_id || '').trim();
    if (!vendaReciboId) {
      detalheRateioInfo = null;
      if (detalheRateioAbortController === controller) {
        detalheRateioAbortController = null;
      }
      return;
    }

    detalheRateioLoading = true;
    try {
      const data = await apiGet<{
        rateio?: {
          ativo?: boolean | null;
          vendedor_destino_nome?: string | null;
          percentual_destino?: number | null;
        } | null;
      }>('/api/v1/conciliacao/rateio-info', {
        company_id: empresaId || undefined,
        venda_recibo_id: vendaReciboId,
        conciliacao_recibo_id: String(row.id || '')
      }, controller.signal, 60_000);
      if (requestSeq !== detalheRateioRequestSeq) return;
      const rateio = data?.rateio;

      if (!rateio || rateio.ativo === false) {
        detalheRateioInfo = null;
        return;
      }

      const vendedorDestinoNome = String(rateio.vendedor_destino_nome || '').trim();
      const percentualDestino = Number(rateio.percentual_destino || 0);
      if (!vendedorDestinoNome || !Number.isFinite(percentualDestino) || percentualDestino <= 0) {
        detalheRateioInfo = null;
        return;
      }

      detalheRateioInfo = {
        vendedor_destino_nome: vendedorDestinoNome,
        percentual_destino: percentualDestino
      };
    } catch {
      if (controller.signal.aborted) return;
      if (requestSeq !== detalheRateioRequestSeq) return;
      detalheRateioInfo = null;
    } finally {
      if (requestSeq === detalheRateioRequestSeq) {
        detalheRateioLoading = false;
        if (detalheRateioAbortController === controller) {
          detalheRateioAbortController = null;
        }
      }
    }
  }

  function enableDetailsEdit() {
    detailsReadOnly = false;
  }

  async function saveAssignment() {
    if (!selectedRow) return;
    saving = true;
    try {
      await apiPost('/api/v1/conciliacao/assign', {
        conciliacaoId: selectedRow.id,
        rankingVendedorId: rankingVendedorId || null,
        rankingProdutoId: rankingProdutoId || null,
        vendaId: selectedRow.venda_id || null,
        vendaReciboId: selectedRow.venda_recibo_id || null,
        isBaixaRac,
        conciliado: marcadoConciliado,
        valorLancamentos: parsePtBrNullable(detalheValorLancamentos),
        valorTaxas: parsePtBrNullable(detalheValorTaxas),
        valorDescontos: parsePtBrNullable(detalheValorDescontos),
        valorAbatimentos: parsePtBrNullable(detalheValorAbatimentos),
        valorNaoComissionavel: parsePtBrNullable(detalheValorNaoComissionavel),
        valorCalculadaLoja: parsePtBrNullable(detalheValorCalculadaLoja),
        valorVisaoMaster: parsePtBrNullable(detalheValorVisaoMaster),
        valorOpfax: parsePtBrNullable(detalheValorOpfax),
        valorSaldo: parsePtBrNullable(detalheValorSaldo),
        valorComissaoLoja: parsePtBrNullable(detalheValorComissaoLoja)
      });
      toast.success('Atribuição salva com sucesso.');
      detailsReadOnly = true;
      showDetailsDialog = false;
      await Promise.all([loadRegistros(), loadSummary(), loadChanges()]);
    } catch (error: unknown) {
      toast.error(toUserMessage(error, 'Erro ao salvar atribuição.'));
    } finally {
      saving = false;
    }
  }

  async function runAutoConciliacao(reciboId?: string) {
    running = true;
    const actionLabel = reciboId ? 'Forçar recálculo do recibo' : 'Conciliar pendentes';
    operationMessage = reciboId
      ? 'Reprocessando vínculo e valores do recibo selecionado.'
      : 'Executando conciliação automática dos recibos pendentes.';
    try {
      const data = await apiPost<{
        updateErrors?: number | null;
        reconciled?: number | null;
        reconciliados?: number | null;
        recalculated?: number | null;
        updatedTaxes?: number | null;
        duplicatesRemoved?: number | null;
      }>('/api/v1/conciliacao/run', {
        companyId: empresaId || undefined,
        limit: reciboId ? 1 : 100,
        conciliacaoReciboId: reciboId || null
      }, undefined, 90_000);
      const erros = Number(data.updateErrors || 0);
      const reconciled = Number(data.reconciled || data.reconciliados || 0);
      const recalculated = Number(data.recalculated || 0);
      const updatedTaxes = Number(data.updatedTaxes || 0);
      const duplicatesRemoved = Number(data.duplicatesRemoved || 0);
      const duplicateText = duplicatesRemoved > 0 ? `, ${duplicatesRemoved} duplicados removidos` : '';
      addOperationLog({
        action: actionLabel,
        status: erros > 0 ? 'error' : 'success',
        message:
          erros > 0
            ? `Concluído com falhas: ${erros} falha(s).`
            : 'Executado com sucesso.',
        data
      });
      toast[erros > 0 ? 'error' : 'success'](
        erros > 0
          ? `Conciliação concluída com falhas: ${reconciled} conciliados, ${recalculated} recalculados, ${updatedTaxes} taxas atualizadas${duplicateText}, ${erros} falhas.`
          : `Conciliação executada: ${reconciled} conciliados, ${recalculated} recalculados, ${updatedTaxes} taxas atualizadas${duplicateText}.`
      );
      await Promise.all([loadRegistros(), loadSummary(), loadExecutions(), loadChanges()]);
    } catch (error: unknown) {
      const message = toUserMessage(error, 'Erro ao executar conciliação.');
      addOperationLog({
        action: actionLabel,
        status: 'error',
        message
      });
      toast.error(message);
    } finally {
      running = false;
      operationMessage = '';
    }
  }

  async function forceRecalculateMonth() {
    if (!monthFilter) {
      toast.error('Selecione um mês para recalcular.');
      return;
    }

    running = true;
    operationMessage = 'Forçando recálculo dos recibos da conciliação no mês selecionado.';
    try {
      const data = await apiPost<{
        recalculated?: number | null;
        recalculatedChecked?: number | null;
        updateErrors?: number | null;
        duplicatesRemoved?: number | null;
      }>('/api/v1/conciliacao/run', {
        companyId: empresaId || undefined,
        recalculateAllMonth: true,
        recalculateMonth: monthFilter
      }, undefined, 90_000);
      const recalculated = Number(data.recalculated || 0);
      const scanned = Number(data.recalculatedChecked || 0);
      const erros = Number(data.updateErrors || 0);
      const duplicatesRemoved = Number(data.duplicatesRemoved || 0);
      const duplicateText = duplicatesRemoved > 0 ? `, ${duplicatesRemoved} duplicados removidos` : '';
      addOperationLog({
        action: 'Recalcular mês',
        status: erros > 0 ? 'error' : 'success',
        message:
          erros > 0
            ? `Concluído com falhas: ${erros} falha(s).`
            : 'Executado com sucesso.',
        data
      });
      toast[erros > 0 ? 'error' : 'success'](
        erros > 0
          ? `Recálculo concluído com falhas: ${scanned} verificados, ${recalculated} recalculados${duplicateText}, ${erros} falhas.`
          : `Recálculo concluído: ${scanned} verificados, ${recalculated} recalculados${duplicateText}.`
      );
      await Promise.all([loadRegistros(), loadSummary(), loadExecutions(), loadChanges()]);
    } catch (error: unknown) {
      const message = toUserMessage(error, 'Erro ao forçar recálculo.');
      addOperationLog({
        action: 'Recalcular mês',
        status: 'error',
        message
      });
      toast.error(message);
    } finally {
      running = false;
      operationMessage = '';
    }
  }

  async function cleanupDuplicateRows() {
    if (!monthFilter) {
      toast.error('Selecione um mês para sanear duplicados.');
      return;
    }

    running = true;
    operationMessage = 'Saneando recibos duplicados da conciliação no mês selecionado.';
    try {
      const data = await apiPost<{
        duplicatesRemoved?: number | null;
        duplicateGroups?: number | null;
      }>('/api/v1/conciliacao/run', {
        companyId: empresaId || undefined,
        cleanupDuplicatesOnly: true,
        recalculateMonth: monthFilter
      }, undefined, 90_000);
      const duplicatesRemoved = Number(data.duplicatesRemoved || 0);
      const duplicateGroups = Number(data.duplicateGroups || 0);
      addOperationLog({
        action: 'Sanear duplicados',
        status: 'success',
        message: `Saneamento concluído: ${duplicateGroups} grupo(s), ${duplicatesRemoved} duplicado(s) removido(s).`,
        data
      });
      toast.success(`Saneamento concluído: ${duplicateGroups} grupo(s), ${duplicatesRemoved} duplicado(s) removido(s).`);
      await Promise.all([loadRegistros(), loadSummary(), loadChanges()]);
    } catch (error: unknown) {
      const message = toUserMessage(error, 'Erro ao sanear duplicados.');
      addOperationLog({
        action: 'Sanear duplicados',
        status: 'error',
        message
      });
      toast.error(message);
    } finally {
      running = false;
      operationMessage = '';
    }
  }

  async function runFixVinculosAudit(options: { conciliacaoId?: string | null; apply?: boolean } = {}) {
    if (running || fixingVinculos || vinculosAuditLoading || vinculosAuditApplying) return;

    const apply = Boolean(options.apply);
    const conciliacaoId = options.conciliacaoId ?? vinculosAuditConciliacaoId ?? null;
    vinculosAuditScope = conciliacaoId ? 'recibo' : 'global';
    vinculosAuditConciliacaoId = conciliacaoId || null;
    if (!apply) {
      vinculosAuditResult = null;
      vinculosAuditOpen = true;
    }

    fixingVinculos = true;
    vinculosAuditLoading = !apply;
    vinculosAuditApplying = apply;
    operationMessage = apply
      ? 'Corrigindo vínculos críticos apontados pela auditoria.'
      : conciliacaoId
        ? 'Auditando vínculo do recibo selecionado.'
        : 'Auditando vínculos da conciliação no mês selecionado.';

    try {
      const data = await apiPost<VinculoAuditResult & {
        incorretos?: number | null;
      }>('/api/v1/conciliacao/fix-vinculos', {
        companyId: empresaId || undefined,
        dryRun: !apply,
        limit: conciliacaoId ? 1 : 2000,
        month: conciliacaoId ? null : monthFilter || null,
        conciliacaoReciboId: conciliacaoId
      });
      vinculosAuditResult = data;
      const checked = Number(data.checked || 0);
      const critical = Number(data.critical || data.incorretos || 0);
      const warnings = Number(data.warnings || 0);
      const corrigiveis = Number(data.corrigiveis || 0);
      const corrigidos = Number(data.corrigidos || 0);

      addOperationLog({
        action: apply ? 'Corrigir vínculos críticos' : 'Auditar vínculos',
        status: 'success',
        message: apply
          ? `Corrigidos ${corrigidos} vínculo(s) crítico(s).`
          : `Verificados ${checked}: ${critical} crítico(s), ${warnings} alerta(s), ${corrigiveis} corrigível(is).`,
        data
      });

      if (apply) {
        toast.success(`Corrigidos ${corrigidos} vínculo(s) crítico(s). Rode a conciliação para reprocessar.`);
        await Promise.all([loadRegistros(), loadSummary(), loadChanges()]);
      } else if (critical === 0 && warnings === 0) {
        toast.success(`Auditoria concluída: ${checked} registro(s), nenhum problema encontrado.`);
      } else {
        toast.warning(`Auditoria concluída: ${critical} crítico(s), ${warnings} alerta(s).`);
      }
    } catch (error: unknown) {
      const message = toUserMessage(error, 'Erro ao auditar vínculos.');
      addOperationLog({
        action: apply ? 'Corrigir vínculos críticos' : 'Auditar vínculos',
        status: 'error',
        message
      });
      toast.error(message);
    } finally {
      fixingVinculos = false;
      vinculosAuditLoading = false;
      vinculosAuditApplying = false;
      operationMessage = '';
    }
  }

  async function revertPendingChanges() {
    reverting = true;
    operationMessage = 'Revertendo alterações pendentes da conciliação.';
    try {
      const data = await apiPost<{
        reverted?: number | null;
      }>('/api/v1/conciliacao/revert', {
        companyId: empresaId || undefined,
        revertAll: true,
        limit: 500
      });
      toast.success(`Alterações revertidas: ${Number(data.reverted || 0)} recibos atualizados.`);
      await Promise.all([loadRegistros(), loadChanges()]);
    } catch (error: unknown) {
      toast.error(toUserMessage(error, 'Erro ao reverter alterações.'));
    } finally {
      reverting = false;
      operationMessage = '';
    }
  }

  async function importPreviewRows() {
    if (importPreparedRows.length === 0) {
      toast.error('Nenhuma linha válida para importar.');
      return;
    }
    const missingMovimentoData = importPreparedRows.some((row) => !String(row.movimento_data || '').trim());
    if (missingMovimentoData) {
      toast.error('Informe a data do movimento antes de importar.');
      return;
    }

    // Se há diferenças e o usuário ainda não confirmou, abre o modal
    const diferencasPreview = importPreparedRows.filter((row) => row.tem_diferenca);
    if (diferencasPreview.length > 0 && !importDiferencasConfirmadas) {
      importDiferencas = diferencasPreview.map((row) => {
        const valorSistema = row.sistema_valor_total ?? Number(row.valor_lancamentos || 0) - (row.diff_total || 0);
        const taxasSistema = row.sistema_valor_taxas ?? Number(row.valor_taxas || 0) - (row.diff_taxas || 0);

        return {
          documento: row.documento,
          movimento_data: String(row.movimento_data || ''),
          valor_importacao: Number(row.valor_lancamentos || 0),
          valor_sistema: valorSistema,
          taxas_importacao: Number(row.valor_taxas || 0),
          taxas_sistema: taxasSistema,
          diff_total: row.diff_total || 0,
          diff_taxas: row.diff_taxas || 0,
          severidade: getImportDiffSeverity(row) === 'critical' ? 'critical' : 'warning'
        };
      });
      importDiferencasModalOpen = true;
      return;
    }

    importing = true;
    operationMessage = 'Importando arquivo e atualizando registros de conciliação.';
    try {
      const data = await apiPost<{
        importados?: number | null;
        duplicados?: number | null;
        tem_diferenca?: boolean | null;
        diferencas?: Array<{
          documento: string;
          movimento_data: string;
          valor_importacao: number;
          diff_total: number;
          diff_taxas: number;
          valor_sistema: number;
          taxas_importacao: number;
          taxas_sistema: number;
          [key: string]: unknown;
        }> | null;
        status_cronologico?: {
          ok?: boolean | null;
          aviso?: string | null;
        } | null;
      }>('/api/v1/conciliacao/import', {
        companyId: empresaId || undefined,
        linhas: importPreparedRows.map((row) => ({
          documento: row.documento,
          numero_reserva: row.numero_reserva || null,
          movimento_data: row.movimento_data,
          status: row.status,
          descricao: row.descricao,
          valor_lancamentos: row.valor_lancamentos,
          valor_taxas: row.valor_taxas,
          valor_descontos: row.valor_descontos,
          valor_abatimentos: row.valor_abatimentos,
          valor_nao_comissionavel: row.valor_nao_comissionavel,
          valor_saldo: row.valor_saldo,
          valor_comissao_loja: row.valor_comissao_loja,
          percentual_comissao_loja: row.percentual_comissao_loja,
          faixa_comissao: row.faixa_comissao,
          ranking_vendedor_id: row.ranking_vendedor_id,
          ranking_produto_id: row.ranking_produto_id,
          venda_id: row.venda_id,
          venda_recibo_id: row.venda_recibo_id,
          origem: row.origem || (importMode === 'rextur' ? 'rextur' : importFileName ? `arquivo:${importFileName}` : 'arquivo')
        }))
      });
      const statusCronologico = data.status_cronologico || null;
      if (statusCronologico?.aviso) {
        if (statusCronologico.ok === false) {
          toast.error(statusCronologico.aviso);
        } else {
          toast.success(statusCronologico.aviso);
        }
      }

      // Se o backend retornou diferenças adicionais (não detectadas no preview)
      const diferencasImportacao = data.diferencas ?? [];
      if (data.tem_diferenca && diferencasImportacao.length > 0 && !importDiferencasConfirmadas) {
        importDiferencas = diferencasImportacao.map((diff) => ({
          ...diff,
          severidade: getDiffModalSeverity(diff) === 'critical' ? 'critical' : 'warning'
        }));
        importDiferencasModalOpen = true;
        importing = false;
        operationMessage = '';
        return;
      }

      toast.success(
        `Importação concluída: ${Number(data.importados || 0)} importados, ${Number(data.duplicados || 0)} duplicados.`
      );
      clearImportState();
      await Promise.all([loadRegistros(), loadSummary()]);
      activeTab = 'registros';
    } catch (error: unknown) {
      toast.error(toUserMessage(error, 'Erro ao importar conciliação.'));
    } finally {
      importing = false;
      operationMessage = '';
    }
  }

  async function handleFileChange() {
    if (importMode === 'rextur') return;
    const file = importFiles?.[0];
    if (!file) return;
    importFileName = file.name;
    try {
      const parsed = await parseConciliacaoImportFile(file, null);
      importText = parsed.text;
      importFallbackDate = parsed.movimentoData || '';
      if (importFallbackDate) {
        applyImportMovimentoDate(importFallbackDate);
      }
      if (!parsed.linhas.length) {
        toast.error('Arquivo lido, mas nenhuma linha operacional foi identificada.');
      }
    } catch (error: unknown) {
      importText = '';
      importIgnored = 0;
      importRowsTotal = 0;
      importAutoLinked = 0;
      importLookupMatches = {};
      importLookupSignature = '';
      importParseError = '';
      toast.error(toUserMessage(error, 'Não foi possível ler o arquivo selecionado.'));
    }
  }

  function onInlineFileChange(event: Event) {
    const target = event.currentTarget as HTMLInputElement | null;
    importFiles = target?.files ?? undefined;
    void handleFileChange();
  }

  async function loadDiasSemMovimento() {
    const requestSeq = ++diasSemMovimentoRequestSeq;
    diasSemMovimentoAbortController?.abort();
    const controller = new AbortController();
    diasSemMovimentoAbortController = controller;
    try {
      const data = await apiGet<{ dias?: Array<{ data?: string | null }> }>('/api/v1/conciliacao/sem-movimento', {
        companyId: empresaId || undefined
      }, controller.signal, 60_000);
      if (requestSeq !== diasSemMovimentoRequestSeq) return;
      diasSemMovimento = (data.dias || []).map((d) => String(d.data || '')).filter(Boolean);
    } catch (err) {
      if (isCanceledApiError(err)) return;
      if (requestSeq !== diasSemMovimentoRequestSeq) return;
      diasSemMovimento = [];
    } finally {
      if (requestSeq === diasSemMovimentoRequestSeq && diasSemMovimentoAbortController === controller) {
        diasSemMovimentoAbortController = null;
      }
    }
  }

  async function marcarSemMovimento() {
    if (!semMovimentoData) {
      toast.error('Informe a data.');
      return;
    }
    semMovimentoLoading = true;
    try {
      await apiPost('/api/v1/conciliacao/sem-movimento', {
        companyId: empresaId || undefined,
        data: semMovimentoData,
        observacao: semMovimentoObservacao
      });
      toast.success(`Dia ${formatDate(semMovimentoData)} marcado como sem movimento.`);
      semMovimentoModalOpen = false;
      semMovimentoData = '';
      semMovimentoObservacao = '';
      await loadDiasSemMovimento();
      await loadSummary();
    } catch (error: unknown) {
      toast.error(toUserMessage(error, 'Erro ao marcar dia sem movimento.'));
    } finally {
      semMovimentoLoading = false;
    }
  }

  async function loadImportLookup(rows: ConciliacaoLinhaInput[]) {
    const docs = rows
      .map((row) => ({
        documento: String(row.documento || '').trim(),
        valor_lancamentos: row.valor_lancamentos ?? null,
        valor_taxas: row.valor_taxas ?? null
      }))
      .filter((row) => row.documento);

    if (docs.length === 0) {
      importLookupMatches = {};
      return;
    }

    importLookupLoading = true;
    try {
      const data = await apiPost<{ matches?: Record<string, ImportLookupMatch | null> }>('/api/v1/conciliacao/lookup', {
        companyId: empresaId || undefined,
        documentos: docs
      });
      importLookupMatches = data?.matches && typeof data.matches === 'object' ? data.matches : {};
    } catch {
      importLookupMatches = {};
    } finally {
      importLookupLoading = false;
    }
  }

  function buildImportPreviewRows(rows: ConciliacaoLinhaInput[], fallbackDate: string | null): ImportPreviewRow[] {
    return rows.map((row) => {
      const hydratedRow = row as ConciliacaoLinhaInput & {
        venda_id?: string | null;
        venda_recibo_id?: string | null;
      };
      const metrics = buildConciliacaoMetrics({
        descricao: row.descricao,
        valorLancamentos: row.valor_lancamentos,
        valorTaxas: row.valor_taxas,
        valorDescontos: row.valor_descontos,
        valorAbatimentos: row.valor_abatimentos,
        valorNaoComissionavel: row.valor_nao_comissionavel,
        valorSaldo: row.valor_saldo,
        valorOpfax: row.valor_opfax,
        valorCalculadaLoja: row.valor_calculada_loja,
        valorVisaoMaster: row.valor_visao_master,
        valorComissaoLoja: row.valor_comissao_loja,
        percentualComissaoLoja: row.percentual_comissao_loja
      });

      const documento = String(row.documento || '').trim();
      const lookup = documento ? importLookupMatches[documento] : null;
      const rankingVendedorId = String(row.ranking_vendedor_id || lookup?.vendedor_id || '').trim() || null;
      const vendaId = String(hydratedRow.venda_id || lookup?.venda_id || '').trim() || null;
      const vendaReciboId = String(hydratedRow.venda_recibo_id || lookup?.venda_recibo_id || '').trim() || null;
      const temDiferenca = Boolean(lookup?.diff_total != null || lookup?.diff_taxas != null);

      return {
        documento,
        numero_reserva: String(row.numero_reserva || '').trim() || null,
        movimento_data: fallbackDate || row.movimento_data || null,
        status: row.status || null,
        descricao: row.descricao || null,
        vendedor_ranking: resolveImportVendedorLabel(rankingVendedorId, row.status),
        meta_dif: resolveMetaDifLabel(metrics.percentualComissaoLoja, row.ranking_produto_id ? 'Sim' : 'Não'),
        valor_lancamentos: row.valor_lancamentos ?? null,
        valor_taxas: row.valor_taxas ?? null,
        valor_descontos: row.valor_descontos ?? null,
        valor_abatimentos: row.valor_abatimentos ?? null,
        valor_nao_comissionavel: row.valor_nao_comissionavel ?? null,
        valor_venda_real: metrics.valorVendaReal,
        valor_comissao_loja: metrics.valorComissaoLoja,
        valor_saldo: row.valor_saldo ?? null,
        percentual_comissao_loja: metrics.percentualComissaoLoja,
        faixa_comissao: metrics.faixaComissao,
        ranking_vendedor_id: rankingVendedorId,
        ranking_produto_id: String(row.ranking_produto_id || '').trim() || null,
        venda_id: vendaId,
        venda_recibo_id: vendaReciboId,
        sistema_valor_total: lookup?.sistema_valor_total ?? null,
        sistema_valor_taxas: lookup?.sistema_valor_taxas ?? null,
        tem_diferenca: temDiferenca,
        diff_total: lookup?.diff_total ?? null,
        diff_taxas: lookup?.diff_taxas ?? null,
        origem: String(row.origem || '').trim() || null
      };
    });
  }

  function applyImportMovimentoDate(value: string) {
    const movimentoData = String(value || '').trim() || null;
    importPreparedRows = importPreparedRows.map((row) => ({
      ...row,
      movimento_data: movimentoData
    }));
    importPreview = importPreparedRows;
  }

  function handleImportMovimentoDateChange() {
    applyImportMovimentoDate(importFallbackDate);
  }

  function resolveImportVendedorLabel(rankingVendedorId: string | null, status?: string | null) {
    if (rankingVendedorId) {
      const found = vendedores.find((vendedor) => vendedor.id === rankingVendedorId);
      return found?.nome_completo || 'Vendedor atribuído';
    }

    const statusUpper = String(status || '').toUpperCase();
    if (statusUpper === 'ESTORNO' || statusUpper === 'OPFAX') return 'Ignorado';
    return 'Pendente';
  }

  function linhaExigeAtribuicao(row: ImportPreviewRow) {
    return String(row.status || '').toUpperCase() === 'BAIXA';
  }

  function parsePtBrNumberInput(value: string) {
    const raw = String(value || '').trim();
    if (!raw) return 0;
    const cleaned = raw
      .replace(/R\$/gi, '')
      .replace(/\s+/g, '')
      .replace(/\.(?=\d{3}(\D|$))/g, '')
      .replace(',', '.');
    const parsed = Number(cleaned);
    return Number.isFinite(parsed) ? parsed : 0;
  }

  function parsePtBrNullable(value: string) {
    const raw = String(value || '').trim();
    if (!raw) return null;
    return parsePtBrNumberInput(raw);
  }

  function fillDetailsForm(row: ConciliacaoItem) {
    detalheValorLancamentos = formatPtBrInput(row.valor_lancamentos);
    detalheValorTaxas = formatPtBrInput(row.valor_taxas);
    detalheValorDescontos = formatPtBrInput(row.valor_descontos);
    detalheValorAbatimentos = formatPtBrInput(row.valor_abatimentos);
    detalheValorNaoComissionavel = formatPtBrInput(row.valor_nao_comissionavel);
    detalheValorCalculadaLoja = formatPtBrInput(row.valor_calculada_loja);
    detalheValorVisaoMaster = formatPtBrInput(row.valor_visao_master);
    detalheValorOpfax = formatPtBrInput(row.valor_opfax);
    detalheValorSaldo = formatPtBrInput(row.valor_saldo);

    detalheValorVendaReal = formatPtBrInput(row.valor_venda_real);
    detalheValorComissaoLoja = formatPtBrInput(row.valor_comissao_loja);
    detalhePercentualComissaoLoja = formatPtBrInput(row.percentual_comissao_loja);
    detalheFaixaComissao = String(row.faixa_comissao || '');
  }

  function recalculateDetailMetrics() {
    const metrics = buildConciliacaoMetrics({
      descricao: selectedRow?.descricao,
      valorLancamentos: parsePtBrNullable(detalheValorLancamentos),
      valorTaxas: parsePtBrNullable(detalheValorTaxas),
      valorDescontos: parsePtBrNullable(detalheValorDescontos),
      valorAbatimentos: parsePtBrNullable(detalheValorAbatimentos),
      valorNaoComissionavel: parsePtBrNullable(detalheValorNaoComissionavel),
      valorCalculadaLoja: parsePtBrNullable(detalheValorCalculadaLoja),
      valorVisaoMaster: parsePtBrNullable(detalheValorVisaoMaster),
      valorOpfax: parsePtBrNullable(detalheValorOpfax),
      valorSaldo: parsePtBrNullable(detalheValorSaldo),
      valorComissaoLoja: parsePtBrNullable(detalheValorComissaoLoja),
      percentualComissaoLoja: parsePtBrNullable(detalhePercentualComissaoLoja)
    });

    detalheValorVendaReal = formatPtBrInput(metrics.valorVendaReal);
    detalheValorComissaoLoja = formatPtBrInput(metrics.valorComissaoLoja);
    detalhePercentualComissaoLoja = formatPtBrInput(metrics.percentualComissaoLoja);
    detalheFaixaComissao = String(metrics.faixaComissao || '');
  }

  function updateImportRow(index: number, patch: Partial<ImportPreviewRow>) {
    importPreparedRows = importPreparedRows.map((row, rowIndex) => {
      if (rowIndex !== index) return row;
      const next = { ...row, ...patch };
      const metrics = buildConciliacaoMetrics({
        descricao: next.descricao,
        valorLancamentos: next.valor_lancamentos,
        valorTaxas: next.valor_taxas,
        valorDescontos: next.valor_descontos,
        valorAbatimentos: next.valor_abatimentos,
        valorNaoComissionavel: next.valor_nao_comissionavel,
        valorSaldo: next.valor_saldo,
        valorComissaoLoja: next.valor_comissao_loja,
        percentualComissaoLoja: next.percentual_comissao_loja
      });
      return {
        ...next,
        valor_venda_real: metrics.valorVendaReal,
        valor_comissao_loja: metrics.valorComissaoLoja,
        percentual_comissao_loja: metrics.percentualComissaoLoja,
        faixa_comissao: metrics.faixaComissao,
        vendedor_ranking: resolveImportVendedorLabel(next.ranking_vendedor_id || null, next.status)
      };
    });
  }

  function setImportMoneyField(index: number, field: keyof ImportPreviewRow, value: string) {
    updateImportRow(index, { [field]: parsePtBrNumberInput(value) } as Partial<ImportPreviewRow>);
  }

  function handleImportVendedorChange(index: number, event: Event) {
    const target = event.currentTarget as HTMLSelectElement | null;
    updateImportRow(index, { ranking_vendedor_id: String(target?.value || '') || null });
  }

  function handleImportProdutoChange(index: number, event: Event) {
    const target = event.currentTarget as HTMLSelectElement | null;
    const value = String(target?.value || '').trim();
    const row = importPreparedRows[index];
    const pct = row?.percentual_comissao_loja ?? 0;
    updateImportRow(index, { ranking_produto_id: value || null, meta_dif: resolveMetaDifLabel(pct, value ? 'Sim' : 'Não') });
  }

  function handleImportMoneyChange(index: number, field: keyof ImportPreviewRow, event: Event) {
    const target = event.currentTarget as HTMLInputElement | null;
    setImportMoneyField(index, field, String(target?.value || '0'));
  }

  function exportRows() {
    if (filteredRecords.length === 0) {
      toast.error('Nenhum registro para exportar.');
      return;
    }
    const headers = ['Documento', 'Data', 'Status', 'Descricao', 'Valor Loja', 'Taxas', '% Loja', 'Faixa', 'Conciliado'];
    const rows = filteredRecords.map((row) => [
      row.documento,
      row.movimento_data || '',
      row.status_label || row.status || '',
      (row.descricao || '').replace(/;/g, ','),
      String(Number(row.valor_calculada_loja || 0).toFixed(2)).replace('.', ','),
      String(Number(row.valor_taxas || 0).toFixed(2)).replace('.', ','),
      String(Number(row.percentual_comissao_loja || 0).toFixed(2)).replace('.', ','),
      row.faixa_comissao || '',
      row.conciliado ? 'Sim' : 'Nao'
    ]);
    const csv = [headers.join(';'), ...rows.map((row) => row.join(';'))].join('\n');
    const blob = new Blob(['\uFEFF' + csv], { type: 'text/csv;charset=utf-8;' });
    const link = document.createElement('a');
    link.href = URL.createObjectURL(blob);
    link.download = `conciliacao_${todayISODateLocal()}.csv`;
    link.click();
  }

  function currentMonth() {
    return todayISODateLocal().slice(0, 7);
  }

  function escapeHtml(value: string) {
    return value
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#039;');
  }

  function buildSituacaoCell(row: ConciliacaoItem) {
    const chips = [];
    chips.push(
      row.conciliado
        ? '<span class="rounded-full bg-green-100 px-2 py-1 text-xs font-semibold text-green-700">Conciliado</span>'
        : '<span class="rounded-full bg-amber-100 px-2 py-1 text-xs font-semibold text-amber-700">Pendente</span>'
    );
    if (row.ranking_vendedor?.nome_completo) {
      chips.push(`<span class="rounded-full bg-blue-100 px-2 py-1 text-xs font-semibold text-blue-700">${escapeHtml(row.ranking_vendedor.nome_completo)}</span>`);
    } else if (!row.venda_id) {
      chips.push('<span class="rounded-full bg-red-100 px-2 py-1 text-xs font-semibold text-red-700">Sem ranking</span>');
    }
    if (row.is_baixa_rac) {
      chips.push('<span class="rounded-full bg-slate-100 px-2 py-1 text-xs font-semibold text-slate-700">Baixa RAC</span>');
    }
    return `<div class="flex flex-wrap gap-1">${chips.join('')}</div>`;
  }

</script>

<svelte:head>
  <title>Conciliação | VTUR</title>
</svelte:head>

<PageHeader
  title="Conciliação financeira"
  subtitle="Importe arquivo, concilie e audite recibos, ranking e alterações."
  color="financeiro"
  breadcrumbs={[{ label: 'Financeiro', href: '/financeiro' }, { label: 'Conciliação' }]}
/>

<Card color="financeiro" class="mb-4">
  <div class="grid gap-3 md:grid-cols-2 xl:grid-cols-6">
    <Button type="button" variant="unstyled" class_name="!flex min-h-[74px] flex-col! items-center! justify-center! gap-1 rounded-xl border p-3 text-center transition {activeKpiView === 'visao_geral' ? 'border-orange-300 bg-orange-50 ring-1 ring-orange-200' : 'border-slate-200 bg-slate-50 hover:border-orange-200 hover:bg-orange-50/50'}" on:click={() => aplicarKpiView('visao_geral')}>
      <p class="text-xs {activeKpiView === 'visao_geral' ? 'font-semibold text-orange-700' : 'text-slate-500'}">Visão geral</p>
      <p class="text-lg font-semibold {activeKpiView === 'visao_geral' ? 'text-orange-700' : 'text-slate-900'}">{registros.length}</p>
    </Button>
    <Button type="button" variant="unstyled" class_name="!flex min-h-[74px] flex-col! items-center! justify-center! gap-1 rounded-xl border p-3 text-center transition {activeKpiView === 'conciliados' ? 'border-orange-300 bg-orange-50 ring-1 ring-orange-200' : 'border-slate-200 bg-slate-50 hover:border-orange-200 hover:bg-orange-50/50'}" on:click={() => aplicarKpiView('conciliados')}>
      <p class="text-xs {activeKpiView === 'conciliados' ? 'font-semibold text-orange-700' : 'text-slate-500'}">Conciliados</p>
      <p class="text-lg font-semibold {activeKpiView === 'conciliados' ? 'text-orange-700' : 'text-slate-900'}">{summary.efetivados}</p>
    </Button>
    <Button type="button" variant="unstyled" class_name="!flex min-h-[74px] flex-col! items-center! justify-center! gap-1 rounded-xl border p-3 text-center transition {activeKpiView === 'pendentes' ? 'border-orange-300 bg-orange-50 ring-1 ring-orange-200' : 'border-slate-200 bg-slate-50 hover:border-orange-200 hover:bg-orange-50/50'}" on:click={() => aplicarKpiView('pendentes')}>
      <p class="text-xs {activeKpiView === 'pendentes' ? 'font-semibold text-orange-700' : 'text-slate-500'}">Pendentes conciliação</p>
      <p class="text-lg font-semibold {activeKpiView === 'pendentes' ? 'text-orange-700' : 'text-slate-900'}">{summary.pendentes}</p>
    </Button>
    <Button type="button" variant="unstyled" class_name="!flex min-h-[74px] flex-col! items-center! justify-center! gap-1 rounded-xl border p-3 text-center transition {activeKpiView === 'pendentes_ranking' ? 'border-orange-300 bg-orange-50 ring-1 ring-orange-200' : 'border-slate-200 bg-slate-50 hover:border-orange-200 hover:bg-orange-50/50'}" on:click={() => aplicarKpiView('pendentes_ranking')}>
      <p class="text-xs {activeKpiView === 'pendentes_ranking' ? 'font-semibold text-orange-600' : 'text-slate-500'}">Pendentes ranking</p>
      <p class="text-lg font-semibold {activeKpiView === 'pendentes_ranking' ? 'text-orange-700' : 'text-slate-900'}">{summary.semRanking}</p>
    </Button>
    <Button type="button" variant="unstyled" class_name="!flex min-h-[74px] flex-col! items-center! justify-center! gap-1 rounded-xl border p-3 text-center transition {activeKpiView === 'baixa_rac' ? 'border-orange-300 bg-orange-50 ring-1 ring-orange-200' : 'border-slate-200 bg-slate-50 hover:border-orange-200 hover:bg-orange-50/50'}" on:click={() => aplicarKpiView('baixa_rac')}>
      <p class="text-xs {activeKpiView === 'baixa_rac' ? 'font-semibold text-orange-600' : 'text-slate-500'}">Baixa RAC</p>
      <p class="text-lg font-semibold {activeKpiView === 'baixa_rac' ? 'text-orange-700' : 'text-slate-900'}">{summary.baixaRac}</p>
    </Button>
    <Button type="button" variant="unstyled" class_name="!flex min-h-[74px] flex-col! items-center! justify-center! gap-1 rounded-xl border p-3 text-center transition {activeKpiView === 'execucoes' ? 'border-orange-300 bg-orange-50 ring-1 ring-orange-200' : 'border-slate-200 bg-slate-50 hover:border-orange-200 hover:bg-orange-50/50'}" on:click={() => aplicarKpiView('execucoes')}>
      <p class="text-xs {activeKpiView === 'execucoes' ? 'font-semibold text-orange-600' : 'text-slate-500'}">Execuções</p>
      <p class="text-lg font-semibold {activeKpiView === 'execucoes' ? 'text-orange-700' : 'text-slate-900'}">{executions.length}</p>
    </Button>
  </div>
  <div class="mt-3 flex flex-wrap gap-2">
    {#if canSelectEmpresa}
      <FieldSelect
        id="conciliacao-empresa"
        label="Empresa"
        bind:value={empresaId}
        options={empresaOptions}
        placeholder={null}
        class_name="w-full md:w-72"
        on:change={handleEmpresaChange}
      />
    {/if}
    <Button variant="secondary" size="sm" class_name="h-9 rounded-lg px-3!" on:click={abrirImportacao}>
      <Upload size={14} class="mr-1.5" />
      Importar
    </Button>
    <Button variant="secondary" size="sm" class_name="h-9 rounded-lg px-3!" on:click={exportRows}>
      <Download size={14} class="mr-1.5" />
      Exportar
    </Button>
    <Button color="financeiro" size="sm" class_name="h-9 rounded-lg px-3!" on:click={() => runAutoConciliacao()} disabled={running} loading={running}>
      <RefreshCcw size={14} class="mr-1.5" />Conciliar pendentes
    </Button>
    <div class="flex items-center gap-1">
      <FieldInput
        id="month-filter-input"
        label="Mês"
        srLabel
        type="month"
        bind:value={monthFilter}
        class_name="w-[150px]"
      />
    </div>
    <Button variant="secondary" size="sm" class_name="h-9 rounded-lg px-3!" on:click={cleanupDuplicateRows} disabled={running || !monthFilter} loading={running}>
      <Database size={14} class="mr-1.5" />
      Sanear duplicados
    </Button>
    <Button variant="secondary" size="sm" class_name="h-9 rounded-lg px-3!" on:click={forceRecalculateMonth} disabled={running || !monthFilter} loading={running}>
      <RefreshCcw size={14} class="mr-1.5" />
      Recalcular mês
    </Button>
    <Button variant="secondary" size="sm" class_name="h-9 rounded-lg px-3!" on:click={() => runFixVinculosAudit()} disabled={running || fixingVinculos} loading={fixingVinculos} title="Audita vínculos entre registros de conciliação e recibos de venda">
      <ShieldAlert size={14} class="mr-1.5" />
      Auditar vínculos
    </Button>
    <Button variant="secondary" size="sm" class_name="h-9 rounded-lg px-3!" on:click={loadAll} disabled={loading} loading={loading}>
      <RefreshCcw size={14} class="mr-1.5" />
      Atualizar
    </Button>
  </div>
</Card>

{#if showBusyNotice}
  <Card color="financeiro" class="mb-4">
    <LoadingState title={busyTitle} message={busyMessage} compact={true} />
  </Card>
{/if}

{#if summary.lacunaCronologica}
  <Card color="financeiro" class="mb-4">
    <div class="flex flex-col gap-3 rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-amber-900 md:flex-row md:items-start md:justify-between">
      <div class="flex-1">
        <div class="flex items-center gap-2 text-sm font-semibold">
          <ShieldAlert size={18} />
          Conciliação bloqueada por dias faltantes
        </div>
        <p class="mt-1 text-sm">{summary.lacunaCronologica.aviso}</p>
        {#if summary.lacunaCronologica.dias_faltantes?.length}
          <p class="mt-2 text-xs font-semibold">
            Dias faltantes: {summary.lacunaCronologica.dias_faltantes.map((dia) => formatDate(dia)).join(', ')}
          </p>
        {/if}
        {#if diasSemMovimento.length > 0}
          <p class="mt-1 text-xs text-amber-700">
            Dias sem movimento: {diasSemMovimento.map((dia) => formatDate(dia)).join(', ')}
          </p>
        {/if}
      </div>
      <div class="flex flex-col gap-2">
        <Button variant="secondary" size="xs" on:click={abrirImportacao}>
          <Upload size={14} class="mr-2" />
          Importar dias faltantes
        </Button>
        <Button variant="outline" size="xs" color="orange" on:click={() => { semMovimentoModalOpen = true; }}>
          <Calendar size={14} class="mr-2" />
          Marcar sem movimento
        </Button>
      </div>
    </div>
  </Card>
{/if}

<Card title="Log da conciliação" color="financeiro" class="mb-4">
  <div class="mb-3 flex flex-wrap items-center justify-between gap-2">
    <p class="text-sm text-slate-600">
      Registro local das ações executadas nesta tela. Use para conferir se o saneamento de duplicados rodou.
    </p>
    <Button variant="secondary" size="xs" on:click={clearOperationLogs} disabled={operationLogs.length === 0}>
      Limpar log
    </Button>
  </div>

  {#if operationLogs.length === 0}
    <div class="rounded-xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm text-slate-600">
      Nenhuma ação de conciliação registrada nesta tela ainda.
    </div>
  {:else}
    <div class="overflow-x-auto rounded-2xl border border-slate-200 bg-white">
      <table class="table-mobile-cards min-w-[1120px] w-full text-sm">
        <thead class="bg-slate-50 text-slate-700">
          <tr>
            <th class="px-3 py-2 text-center">Quando</th>
            <th class="px-3 py-2 text-center">Ação</th>
            <th class="px-3 py-2 text-center">Mês</th>
            <th class="px-3 py-2 text-right">Grupos duplicados</th>
            <th class="px-3 py-2 text-right">Duplicados removidos</th>
            <th class="px-3 py-2 text-right">Checados</th>
            <th class="px-3 py-2 text-right">Conciliados</th>
            <th class="px-3 py-2 text-right">Recalculados</th>
            <th class="px-3 py-2 text-right">Taxas atualizadas</th>
            <th class="px-3 py-2 text-center">Status</th>
            <th class="px-3 py-2 text-left">Mensagem</th>
          </tr>
        </thead>
        <tbody>
          {#each operationLogs as item}
            <tr class="border-t border-slate-100">
              <td class="px-3 py-2">{formatDateTime(item.created_at)}</td>
              <td class="px-3 py-2">{item.action}</td>
              <td class="px-3 py-2">{item.month}</td>
              <td class="px-3 py-2 text-right">{item.duplicateGroups}</td>
              <td class="px-3 py-2 text-right font-semibold {item.duplicatesRemoved > 0 ? 'text-orange-700' : 'text-slate-700'}">{item.duplicatesRemoved}</td>
              <td class="px-3 py-2 text-right">{item.checked || item.recalculatedChecked}</td>
              <td class="px-3 py-2 text-right">{item.reconciled}</td>
              <td class="px-3 py-2 text-right">{item.recalculated}</td>
              <td class="px-3 py-2 text-right">{item.updatedTaxes}</td>
              <td class="px-3 py-2">
                <span class="rounded-full px-2 py-1 text-xs font-semibold {item.status === 'success' ? 'bg-green-100 text-green-700' : 'bg-red-100 text-red-700'}">
                  {item.status === 'success' ? 'OK' : 'Erro'}
                </span>
              </td>
              <td class="px-3 py-2">{item.message}</td>
            </tr>
          {/each}
        </tbody>
      </table>
    </div>
  {/if}
</Card>

{#if activeTab === 'importacao'}
  <Card title="Importar conciliação" color="financeiro" class="mb-6">
    <div class="space-y-3">
      <div class="flex flex-wrap gap-2">
        <Button
          variant={importMode === 'movimento' ? 'selected' : 'secondary'}
          color="financeiro"
          size="sm"
          on:click={() => setImportMode('movimento')}
        >
          Movimento
        </Button>
        <Button
          variant={importMode === 'rextur' ? 'selected' : 'secondary'}
          color="financeiro"
          size="sm"
          on:click={() => setImportMode('rextur')}
        >
          Rextur
        </Button>
      </div>

      {#if importMode === 'movimento'}
        <FileDropzone
          accept=".txt,.xls,.xlsx"
          icon={FileText}
          title="Clique para escolher o arquivo"
          bind:files={importFiles}
          on:change={() => void handleFileChange()}
        />
      {:else}
        <div class="rounded-xl border border-orange-200 bg-orange-50 px-4 py-3 text-sm text-orange-900">
          Cole a Reserva Fácil Rextur abaixo. A conciliação será criada com recibo <strong>REXTUR</strong> e reserva igual ao localizador, sem cadastro de CPF.
        </div>
      {/if}
      <div class="grid gap-3 md:grid-cols-[minmax(220px,280px)_1fr]">
        <FieldInput
          id="conciliacao-import-movimento-date"
          label="Data do movimento"
          type="date"
          bind:value={importFallbackDate}
          helper={importMode === 'rextur' ? 'Data de baixa da reserva Rextur.' : 'Se o arquivo não trouxer a data, informe aqui antes de importar.'}
          class_name="w-full"
          on:change={handleImportMovimentoDateChange}
        />
        {#if importPreparedRows.length > 0 && !importFallbackDate}
          <div class="rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800">
            A data do movimento não foi reconhecida no arquivo. Informe a data acima para aplicar em todas as linhas do preview.
          </div>
        {/if}
      </div>
      <div class="grid gap-3 md:grid-cols-2 xl:grid-cols-7">
        <div class="rounded-xl border border-slate-200 bg-slate-50 p-3"><p class="text-xs text-slate-500">Linhas reconhecidas</p><p class="text-base font-semibold">{importRowsTotal}</p></div>
        <div class="rounded-xl border border-slate-200 bg-slate-50 p-3"><p class="text-xs text-slate-500">Importáveis</p><p class="text-base font-semibold">{importPreparedRows.length}</p></div>
        <div class="rounded-xl border border-slate-200 bg-slate-50 p-3"><p class="text-xs text-slate-500">Ignoradas</p><p class="text-base font-semibold">{importIgnored}</p></div>
        <div class="rounded-xl border border-slate-200 bg-slate-50 p-3"><p class="text-xs text-slate-500">Atribuídas auto</p><p class="text-base font-semibold">{importAutoLinked}</p></div>
        <div class="rounded-xl border border-slate-200 bg-slate-50 p-3"><p class="text-xs text-slate-500">Arquivo</p><p class="text-sm font-semibold">{importFileName || '-'}</p></div>
        <div class="rounded-xl border border-slate-200 bg-slate-50 p-3"><p class="text-xs text-slate-500">Data movimento</p><p class="text-sm font-semibold">{formatDate(importFallbackDate)}</p></div>
        <div class="rounded-xl border border-slate-200 bg-slate-50 p-3"><p class="text-xs text-slate-500">Pendentes atribuição</p><p class="text-base font-semibold">{importPreparedRows.filter((row) => exigeRanking(row.status) && !row.ranking_vendedor_id).length}</p></div>
      </div>

      {#if importLookupLoading}
        <LoadingState
          title="Buscando usuários nas vendas"
          message="Estamos procurando vendedores e recibos correspondentes para preencher o ranking automaticamente."
          compact={true}
        />
      {/if}

      <FieldTextarea
        id="conciliacao-paste"
        label={importMode === 'rextur' ? 'Reserva Fácil Rextur' : 'Conteúdo do extrato (opcional)'}
        bind:value={importText}
        rows={importMode === 'rextur' ? 8 : 5}
        class_name="w-full"
      />

      {#if importParseError}
        <div class="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
          {importParseError}
        </div>
      {/if}

      {#if importPreparedRows.length === 0}
        <div class="rounded-xl border border-dashed border-slate-200 px-4 py-10 text-sm text-slate-500">
          {importMode === 'rextur' ? 'Cole o conteúdo da Reserva Fácil Rextur para carregar o preview.' : 'Selecione um arquivo para carregar o preview de importação.'}
        </div>
      {:else}
        <div class="overflow-x-auto rounded-2xl border border-slate-200 bg-white">
          <table class="table-mobile-cards min-w-[2100px] w-full text-sm">
            <thead class="bg-slate-50 text-slate-700">
              <tr>
                <th class="px-3 py-2 text-center">Data</th>
                <th class="px-3 py-2 text-center">Documento</th>
                <th class="px-3 py-2 text-center">Status</th>
                <th class="px-3 py-2 text-center">Descrição</th>
                <th class="px-3 py-2 text-center">Vendedor ranking</th>
                <th class="px-3 py-2 text-center">Meta dif.</th>
                <th class="px-3 py-2 text-right">Lançamentos</th>
                <th class="px-3 py-2 text-right">Taxas</th>
                <th class="px-3 py-2 text-right">Descontos</th>
                <th class="px-3 py-2 text-right">Abatimentos</th>
                <th class="px-3 py-2 text-right">Não comissionável</th>
                <th class="px-3 py-2 text-right">Venda real</th>
                <th class="px-3 py-2 text-right">Comissão loja</th>
                <th class="px-3 py-2 text-right">% loja</th>
              </tr>
            </thead>
            <tbody>
              {#each importPreparedRows as row, index}
                {@const diffSeverity = getImportDiffSeverity(row)}
                <tr class="border-t border-slate-100 {diffSeverity === 'critical' ? 'bg-red-50' : diffSeverity === 'warning' ? 'bg-orange-50' : ''}">
                  <td class="px-3 py-2">{formatDate(row.movimento_data)}</td>
                  <td class="px-3 py-2">
                    {formatDocumentoConciliacao(row)}
                    {#if row.tem_diferenca}
                      <span
                        class="ml-1 inline-flex items-center rounded-sm px-1.5 py-0.5 text-xs font-semibold {diffSeverity === 'critical' ? 'bg-red-200 text-red-800' : 'bg-orange-200 text-orange-800'}"
                        title={diffSeverity === 'critical' ? 'Diferença de 10% ou mais entre importação e venda cadastrada' : 'Diferença menor que 10% entre importação e venda cadastrada'}
                      >!</span>
                    {/if}
                  </td>
                  <td class="px-3 py-2">{statusImportLabel(row.status)}</td>
                  <td class="px-3 py-2">{row.descricao || '-'}</td>
                  <td class="px-3 py-2">
                    {#if exigeRanking(row.status)}
                      <FieldSelect
                        id={`import-vendedor-${index}`}
                        label="Vendedor"
                        srLabel
                        value={row.ranking_vendedor_id || ''}
                        options={vendedores.map((vendedor) => ({ value: vendedor.id, label: vendedor.nome_completo }))}
                        placeholder="Selecione..."
                        class_name="w-[210px]"
                        on:change={(event) => handleImportVendedorChange(index, event)}
                      />
                    {:else}
                      <span class="text-slate-500">Ignorado</span>
                    {/if}
                  </td>
                  <td class="px-3 py-2">
                    {#if exigeRanking(row.status) && produtosMeta.length > 0}
                      <FieldSelect
                        id={`import-produto-${index}`}
                        label="Produto diferenciado"
                        srLabel
                        value={row.ranking_produto_id || ''}
                        options={[
                          { value: '', label: 'Não' },
                          ...produtosMeta.map((produto) => ({ value: produto.id, label: produto.nome }))
                        ]}
                        placeholder={null}
                        class_name="w-[170px]"
                        on:change={(event) => handleImportProdutoChange(index, event)}
                      />
                    {:else}
                      <span>{row.meta_dif || '-'}</span>
                    {/if}
                  </td>
                  <td class="px-3 py-2"><FieldInput label="Lançamentos" srLabel class_name="w-[130px]" value={String(row.valor_lancamentos ?? 0).replace('.', ',')} on:change={(event) => handleImportMoneyChange(index, 'valor_lancamentos', event)} /></td>
                  <td class="px-3 py-2"><FieldInput label="Taxas" srLabel class_name="w-[130px]" value={String(row.valor_taxas ?? 0).replace('.', ',')} on:change={(event) => handleImportMoneyChange(index, 'valor_taxas', event)} /></td>
                  <td class="px-3 py-2"><FieldInput label="Descontos" srLabel class_name="w-[130px]" value={String(row.valor_descontos ?? 0).replace('.', ',')} on:change={(event) => handleImportMoneyChange(index, 'valor_descontos', event)} /></td>
                  <td class="px-3 py-2"><FieldInput label="Abatimentos" srLabel class_name="w-[130px]" value={String(row.valor_abatimentos ?? 0).replace('.', ',')} on:change={(event) => handleImportMoneyChange(index, 'valor_abatimentos', event)} /></td>
                  <td class="px-3 py-2"><FieldInput label="Não comissionável" srLabel class_name="w-[150px]" value={String(row.valor_nao_comissionavel ?? 0).replace('.', ',')} on:change={(event) => handleImportMoneyChange(index, 'valor_nao_comissionavel', event)} /></td>
                  <td class="px-3 py-2 text-right">{formatMoney(row.valor_venda_real)}</td>
                  <td class="px-3 py-2"><FieldInput label="Comissão loja" srLabel class_name="w-[130px]" value={String(row.valor_comissao_loja ?? 0).replace('.', ',')} on:change={(event) => handleImportMoneyChange(index, 'valor_comissao_loja', event)} /></td>
                  <td class="px-3 py-2 text-right">{formatPercent(row.percentual_comissao_loja)}</td>
                </tr>
              {/each}
            </tbody>
          </table>
        </div>
      {/if}

      <div class="flex flex-wrap gap-2">
        <Button color="financeiro" on:click={importPreviewRows} disabled={importPreparedRows.length === 0} loading={importing}><Upload size={16} class="mr-2" />Importar</Button>
        <Button variant="secondary" on:click={clearImportState}>Limpar</Button>
      </div>
    </div>
  </Card>
{:else if activeTab === 'visao_geral'}
  <!-- Mobile: botão de filtros -->
  <div class="mb-4 sm:hidden">
    <Button variant="secondary" class_name="w-full" on:click={() => (showFilterSheet = true)}>
      <SlidersHorizontal size={16} class="mr-2" />
      Filtros
      {#if vgFiltroDocumento || vgFiltroVendedor !== 'all' || vgFiltroStatus !== 'all' || vgFiltroMes !== 'all' || vgFiltroDia !== 'all' || vgFiltroReciboEncontrado !== 'all' || vgFiltroRanking !== 'all' || vgFiltroConciliado !== 'all'}
        <span class="ml-2 inline-flex h-2 w-2 rounded-full bg-financeiro-500"></span>
      {/if}
    </Button>
  </div>

  <Card title="Visão geral" color="financeiro" class="mb-6">
    <div class="hidden sm:grid mb-3 grid gap-3 md:grid-cols-2 xl:grid-cols-8">
      <FieldInput id="vg-documento" label="Recibo" type="text" bind:value={vgFiltroDocumento} placeholder="Buscar..." class_name="w-full" />
      <FieldSelect id="vg-status" label="Status" bind:value={vgFiltroStatus} options={vgStatusSelectOptions} class_name="w-full" />
      <FieldSelect id="vg-vendedor" label="Vendedor ranking" bind:value={vgFiltroVendedor} options={vgVendedorSelectOptions} class_name="w-full" />
      <FieldSelect id="vg-mes" label="Mês" bind:value={vgFiltroMes} options={vgMesSelectOptions} class_name="w-full" />
      <FieldSelect id="vg-dia" label="Dia" bind:value={vgFiltroDia} options={vgDiaSelectOptions} class_name="w-full" />
      <FieldSelect id="vg-recibo-encontrado" label="Recibo encontrado" bind:value={vgFiltroReciboEncontrado} options={[{ value: 'all', label: 'Todos' }, { value: 'sim', label: 'Sim' }, { value: 'nao', label: 'Não' }]} class_name="w-full" />
      <FieldSelect id="vg-ranking" label="Ranking" bind:value={vgFiltroRanking} options={[{ value: 'all', label: 'Todos' }, { value: 'sim', label: 'Sim' }, { value: 'nao', label: 'Não' }]} class_name="w-full" />
      <FieldSelect id="vg-conciliado" label="Conciliado" bind:value={vgFiltroConciliado} options={[{ value: 'all', label: 'Todos' }, { value: 'sim', label: 'Sim' }, { value: 'nao', label: 'Não' }]} class_name="w-full" />
    </div>

    <div class="hidden sm:flex mb-3 flex-wrap items-center gap-2 text-sm text-slate-600">
      <span><strong>{visaoGeralFiltrados.length}</strong> de <strong>{visaoGeralRows.length}</strong> registro(s)</span>
      <Button
        variant="secondary"
        size="xs"
        on:click={() => {
          vgFiltroDocumento = '';
          vgFiltroVendedor = 'all';
          vgFiltroStatus = 'all';
          vgFiltroMes = 'all';
          vgFiltroDia = 'all';
          vgFiltroReciboEncontrado = 'all';
          vgFiltroRanking = 'all';
          vgFiltroConciliado = 'all';
        }}
      >
        Limpar
      </Button>
    </div>

    <BottomSheet bind:open={showFilterSheet} title="Filtrar Visão Geral">
      <div class="space-y-4">
        <FieldInput id="vg-documento-mobile" label="Recibo" type="text" bind:value={vgFiltroDocumento} placeholder="Buscar..." class_name="w-full" />
        <FieldSelect id="vg-status-mobile" label="Status" bind:value={vgFiltroStatus} options={vgStatusSelectOptions} class_name="w-full" />
        <FieldSelect id="vg-vendedor-mobile" label="Vendedor ranking" bind:value={vgFiltroVendedor} options={vgVendedorSelectOptions} class_name="w-full" />
        <FieldSelect id="vg-mes-mobile" label="Mês" bind:value={vgFiltroMes} options={vgMesSelectOptions} class_name="w-full" />
        <FieldSelect id="vg-dia-mobile" label="Dia" bind:value={vgFiltroDia} options={vgDiaSelectOptions} class_name="w-full" />
        <FieldSelect id="vg-recibo-encontrado-mobile" label="Recibo encontrado" bind:value={vgFiltroReciboEncontrado} options={[{ value: 'all', label: 'Todos' }, { value: 'sim', label: 'Sim' }, { value: 'nao', label: 'Não' }]} class_name="w-full" />
        <FieldSelect id="vg-ranking-mobile" label="Ranking" bind:value={vgFiltroRanking} options={[{ value: 'all', label: 'Todos' }, { value: 'sim', label: 'Sim' }, { value: 'nao', label: 'Não' }]} class_name="w-full" />
        <FieldSelect id="vg-conciliado-mobile" label="Conciliado" bind:value={vgFiltroConciliado} options={[{ value: 'all', label: 'Todos' }, { value: 'sim', label: 'Sim' }, { value: 'nao', label: 'Não' }]} class_name="w-full" />
      </div>
      <Button variant="primary" class_name="w-full mt-2" on:click={() => (showFilterSheet = false)}>
        Aplicar filtros
      </Button>
    </BottomSheet>

    {#if registrosLoading || loading}
      <LoadingState />
    {:else}
    <div class="overflow-x-auto rounded-2xl border border-slate-200 bg-white">
      <table class="table-mobile-cards min-w-[2050px] w-full text-sm">
        <thead class="bg-slate-50 text-slate-700">
          <tr>
            <th class="px-3 py-2 text-center">Data</th>
            <th class="px-3 py-2 text-center">Documento</th>
            <th class="px-3 py-2 text-center">Status</th>
            <th class="px-3 py-2 text-center">Recibo encontrado</th>
            <th class="px-3 py-2 text-center">Vendedor ranking</th>
            <th class="px-3 py-2 text-center">Ranking</th>
            <th class="px-3 py-2 text-center">Meta dif.</th>
            <th class="px-3 py-2 text-right">Lançamentos</th>
            <th class="px-3 py-2 text-right">Taxas (arq)</th>
            <th class="px-3 py-2 text-right">Descontos</th>
            <th class="px-3 py-2 text-right">Abatimentos</th>
            <th class="px-3 py-2 text-right">Não comissionável</th>
            <th class="px-3 py-2 text-right">Venda real</th>
            <th class="px-3 py-2 text-right">Comissão loja</th>
            <th class="px-3 py-2 text-right">% loja</th>
            <th class="px-3 py-2 text-right">Total (sist)</th>
            <th class="px-3 py-2 text-right">Taxas (sist)</th>
            <th class="px-3 py-2 text-right">Diff total</th>
            <th class="px-3 py-2 text-right">Diff taxas</th>
            <th class="px-3 py-2 text-center">Conciliado</th>
          </tr>
        </thead>
        <tbody>
          {#each visaoGeralFiltrados as row}
            <tr class="cursor-pointer border-t border-slate-100 hover:bg-slate-50" on:click={() => openDetails(row)}>
              <td class="px-3 py-2">{formatDate(row.movimento_data)}</td>
              <td class="px-3 py-2">{formatDocumentoConciliacao(row)}</td>
              <td class="px-3 py-2">{statusImportLabel(row.status)}</td>
              <td class="px-3 py-2">{row.venda_recibo_id ? 'Sim' : 'Não'}</td>
              <td class="px-3 py-2">{row.ranking_vendedor?.nome_completo || 'Não atribuído'}</td>
              <td class="px-3 py-2">{exigeRanking(row.status) ? (row.ranking_vendedor_id ? 'OK' : 'Pendente') : '-'}</td>
              <td class="px-3 py-2">{resolveMetaDifLabel(row.percentual_comissao_loja, row.ranking_produto?.nome)}</td>
              <td class="px-3 py-2 text-right">{formatMoney(row.valor_lancamentos)}</td>
              <td class="px-3 py-2 text-right">{formatMoney(row.valor_taxas)}</td>
              <td class="px-3 py-2 text-right">{formatMoney(row.valor_descontos)}</td>
              <td class="px-3 py-2 text-right">{formatMoney(row.valor_abatimentos)}</td>
              <td class="px-3 py-2 text-right">{formatMoney(row.valor_nao_comissionavel)}</td>
              <td class="px-3 py-2 text-right">{formatMoney(row.valor_venda_real)}</td>
              <td class="px-3 py-2 text-right">{formatMoney(row.valor_comissao_loja)}</td>
              <td class="px-3 py-2 text-right">{formatPercent(row.percentual_comissao_loja)}</td>
              <td class="px-3 py-2 text-right">{formatMoney(row.sistema_valor_total)}</td>
              <td class="px-3 py-2 text-right">{formatMoney(row.sistema_valor_taxas)}</td>
              <td class="px-3 py-2 text-right">{formatMoney(row.diff_total)}</td>
              <td class="px-3 py-2 text-right">{formatMoney(row.diff_taxas)}</td>
              <td class="px-3 py-2">{row.conciliado ? 'Sim' : 'Não'}</td>
            </tr>
          {/each}
        </tbody>
      </table>
    </div>
    {/if}
  </Card>
{:else if activeTab === 'registros'}
  <AbaRegistros {filteredRecords} {registrosLoading} {loading} {openDetails} />
{:else if activeTab === 'alteracoes'}
  <AbaAlteracoes {changes} {alteracoesPendentes} {changesLoading} {reverting} {loadChanges} {revertPendingChanges} />
{:else if activeTab === 'execucoes'}
  <AbaExecucoes {executions} {executionsLoading} {loadExecutions} />
{/if}

<Dialog
  bind:open={showDetailsDialog}
  title="Detalhes da conciliação"
  color="financeiro"
  showConfirm={!detailsReadOnly}
  confirmText="Salvar"
  onConfirm={saveAssignment}
  loading={saving}
  maxWidth="840px"
>
  {#if selectedRow}
    <div class="space-y-5">
      <div class="rounded-2xl border border-slate-200 bg-white px-4 py-4">
        <p class="text-xs font-semibold uppercase tracking-[0.14em] text-slate-500">Resumo da conciliação</p>
        <div class="mt-3 grid grid-cols-2 gap-3 text-sm md:grid-cols-3">
          <div>
            <p class="text-slate-500">Documento</p>
            <p class="font-medium text-slate-900">{formatDocumentoConciliacao(selectedRow)}</p>
          </div>
          <div>
            <p class="text-slate-500">Recibo vinculado</p>
            <p class="font-medium text-slate-900">{selectedRow.recibo_numero || '-'}</p>
          </div>
          <div>
            <p class="text-slate-500">Cliente da venda</p>
            <p class="font-medium text-slate-900">{selectedRow.venda_cliente_nome || '-'}</p>
          </div>
          <div>
            <p class="text-slate-500">Vendedor da venda</p>
            <p class="font-medium text-slate-900">{selectedRow.venda_vendedor_nome || '-'}</p>
          </div>
          <div>
            <p class="text-slate-500">Vendedor dividido</p>
            <p class="font-medium text-slate-900">
              {#if detalheRateioLoading}
                Consultando...
              {:else}
                {detalheRateioInfo?.vendedor_destino_nome || '-'}
              {/if}
            </p>
          </div>
          <div>
            <p class="text-slate-500">% dividido</p>
            <p class="font-medium text-slate-900">
              {#if detalheRateioLoading}
                Consultando...
              {:else if detalheRateioInfo}
                {Number(detalheRateioInfo.percentual_destino || 0).toFixed(2)}%
              {:else}
                -
              {/if}
            </p>
          </div>
          <div>
            <p class="text-slate-500">Data</p>
            <p class="font-medium text-slate-900">{formatDate(selectedRow.movimento_data)}</p>
          </div>
          <div>
            <p class="text-slate-500">Status</p>
            <p class="font-medium text-slate-900">{selectedRow.status_label || selectedRow.status}</p>
          </div>
          <div>
            <p class="text-slate-500">Valor loja</p>
            <p class="font-medium text-slate-900">{formatCurrency(selectedRow.valor_calculada_loja)}</p>
          </div>
          <div>
            <p class="text-slate-500">% loja</p>
            <p class="font-medium text-slate-900">{formatPercent(selectedRow.percentual_comissao_loja)}</p>
          </div>
          <div>
            <p class="text-slate-500">Match total</p>
            <p class="font-medium text-slate-900">{selectedRow.match_total == null ? '-' : selectedRow.match_total ? 'Sim' : 'Não'}</p>
          </div>
          <div>
            <p class="text-slate-500">Match taxas</p>
            <p class="font-medium text-slate-900">{selectedRow.match_taxas == null ? '-' : selectedRow.match_taxas ? 'Sim' : 'Não'}</p>
          </div>
          <div>
            <p class="text-slate-500">Dif. total</p>
            <p class="font-medium text-slate-900">{formatCurrency(selectedRow.diff_total)}</p>
          </div>
          <div>
            <p class="text-slate-500">Dif. taxas</p>
            <p class="font-medium text-slate-900">{formatCurrency(selectedRow.diff_taxas)}</p>
          </div>
          <div>
            <p class="text-slate-500">Conciliado</p>
            <p class="font-medium text-slate-900">{selectedRow.conciliado ? 'Sim' : 'Não'}</p>
          </div>
        </div>
      </div>

      <div class="grid gap-4 md:grid-cols-2">
        <div class="rounded-2xl border border-slate-200 bg-white px-4 py-4 md:col-span-2">
          <div class="mb-3 flex items-center justify-between gap-2">
            <p class="text-xs font-semibold uppercase tracking-[0.14em] text-slate-500">Campos da importação</p>
            {#if detailsReadOnly}
              <span class="rounded-full bg-slate-100 px-2 py-1 text-xs font-semibold text-slate-600">Modo visual</span>
            {:else}
              <span class="rounded-full bg-amber-100 px-2 py-1 text-xs font-semibold text-amber-700">Modo edição</span>
            {/if}
          </div>
          <div class="grid gap-3 md:grid-cols-3">
            <FieldInput id="conciliacao-valor-lancamentos" label="Valor lançamentos" bind:value={detalheValorLancamentos} disabled={detailsReadOnly} on:input={recalculateDetailMetrics} />
            <FieldInput id="conciliacao-valor-taxas" label="Valor taxas" bind:value={detalheValorTaxas} disabled={detailsReadOnly} on:input={recalculateDetailMetrics} />
            <FieldInput id="conciliacao-valor-descontos" label="Valor descontos" bind:value={detalheValorDescontos} disabled={detailsReadOnly} on:input={recalculateDetailMetrics} />
            <FieldInput id="conciliacao-valor-abatimentos" label="Valor abatimentos" bind:value={detalheValorAbatimentos} disabled={detailsReadOnly} on:input={recalculateDetailMetrics} />
            <FieldInput id="conciliacao-valor-nao-comissionavel" label="Valor não comissionável" bind:value={detalheValorNaoComissionavel} disabled={detailsReadOnly} on:input={recalculateDetailMetrics} />
            <FieldInput id="conciliacao-valor-saldo" label="Valor saldo" bind:value={detalheValorSaldo} disabled={detailsReadOnly} on:input={recalculateDetailMetrics} />
            <FieldInput id="conciliacao-valor-calculada-loja" label="Valor calculada loja" bind:value={detalheValorCalculadaLoja} disabled={detailsReadOnly} on:input={recalculateDetailMetrics} />
            <FieldInput id="conciliacao-valor-visao-master" label="Valor visão master" bind:value={detalheValorVisaoMaster} disabled={detailsReadOnly} on:input={recalculateDetailMetrics} />
            <FieldInput id="conciliacao-valor-opfax" label="Valor OPFAX" bind:value={detalheValorOpfax} disabled={detailsReadOnly} on:input={recalculateDetailMetrics} />
            <FieldInput id="conciliacao-valor-venda-real" label="Valor venda real" bind:value={detalheValorVendaReal} disabled={true} />
            <FieldInput id="conciliacao-valor-comissao-loja" label="Valor comissão loja" bind:value={detalheValorComissaoLoja} disabled={detailsReadOnly} on:input={recalculateDetailMetrics} />
            <FieldInput id="conciliacao-percentual-comissao-loja" label="% comissão loja" bind:value={detalhePercentualComissaoLoja} disabled={true} />
          </div>
          <div class="mt-3">
            <FieldInput id="conciliacao-faixa-comissao" label="Faixa de comissão" bind:value={detalheFaixaComissao} disabled={true} />
          </div>
        </div>

        <FieldSelect
          id="conciliacao-vendedor"
          label="Vendedor de ranking"
          bind:value={rankingVendedorId}
          options={vendedorOptions}
          class_name="w-full"
          disabled={detailsReadOnly}
        />
        <FieldSelect
          id="conciliacao-produto"
          label="Produto para meta"
          bind:value={rankingProdutoId}
          options={produtoOptions}
          class_name="w-full"
          disabled={detailsReadOnly}
        />
      </div>

      <div class="grid gap-3 md:grid-cols-2">
        <FieldCheckbox label="Marcar como conciliado" bind:checked={marcadoConciliado} color="financeiro" align="center" class_name="rounded-xl border border-slate-200 bg-slate-50 px-3 py-3" disabled={detailsReadOnly} />
        <FieldCheckbox label="Marcar como Baixa RAC" bind:checked={isBaixaRac} color="financeiro" align="center" class_name="rounded-xl border border-slate-200 bg-slate-50 px-3 py-3" disabled={detailsReadOnly} />
      </div>

      <div class="flex flex-wrap gap-2 border-t border-slate-200 pt-4">
        <Button variant="secondary" on:click={() => selectedRow && runAutoConciliacao(selectedRow.id)} disabled={running} loading={running}>
          Forçar recálculo do recibo
        </Button>
        <Button variant="secondary" on:click={() => selectedRow && runFixVinculosAudit({ conciliacaoId: selectedRow.id })} disabled={running || fixingVinculos} loading={vinculosAuditLoading && vinculosAuditScope === 'recibo'}>
          <ShieldAlert size={16} class="mr-2" />
          Auditar vínculo
        </Button>
        <div class="rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 text-sm text-slate-600">
          Última checagem: {formatDateTime(selectedRow.last_checked_at)}
        </div>
      </div>
    </div>
  {/if}

  <svelte:fragment slot="actions">
    {#if detailsReadOnly}
      <Button variant="primary" on:click={enableDetailsEdit} disabled={saving || running}>
        <Pencil size={16} class="mr-2" />
        Editar
      </Button>
    {/if}
  </svelte:fragment>
</Dialog>

<JanelaAuditoriaVinculos
  bind:vinculosAuditOpen
  {vinculosAuditScope}
  {vinculosAuditLoading}
  {vinculosAuditApplying}
  {vinculosAuditResult}
  {vinculosAuditConciliacaoId}
  {runFixVinculosAudit}
/>

<!-- Modal: Confirmação de diferenças na importação -->
<Dialog bind:open={importDiferencasModalOpen} title="Diferenças detectadas na importação" maxWidth="lg">
  <div class="space-y-4">
    <p class="text-sm text-slate-600">
      Foram detectadas diferenças entre os valores do arquivo importado e as vendas já cadastradas no sistema.
      Isso pode indicar erro na leitura do arquivo ou divergência real. Confira abaixo:
    </p>
    <div class="overflow-x-auto rounded-xl border border-slate-200">
      <table class="w-full text-sm table-mobile-cards">
        <thead class="bg-slate-50 text-slate-700">
          <tr>
            <th class="px-3 py-2 text-left">Documento</th>
            <th class="px-3 py-2 text-right">Valor importação</th>
            <th class="px-3 py-2 text-right">Valor sistema</th>
            <th class="px-3 py-2 text-right">Diferença</th>
            <th class="px-3 py-2 text-right">Taxas importação</th>
            <th class="px-3 py-2 text-right">Taxas sistema</th>
            <th class="px-3 py-2 text-right">Diferença</th>
          </tr>
        </thead>
        <tbody>
          {#each importDiferencas as diff}
            {@const diffSeverity = diff.severidade || getDiffModalSeverity(diff)}
            <tr class="border-t border-slate-100 {diffSeverity === 'critical' ? 'bg-red-50' : 'bg-orange-50'}">
              <td class="px-3 py-2 font-medium">{diff.documento}</td>
              <td class="px-3 py-2 text-right">{formatCurrency(diff.valor_importacao)}</td>
              <td class="px-3 py-2 text-right">{formatCurrency(diff.valor_sistema)}</td>
              <td class="px-3 py-2 text-right font-semibold {diff.diff_total > 0 ? 'text-green-700' : diff.diff_total < 0 ? 'text-red-700' : ''}">{diff.diff_total > 0 ? '+' : ''}{formatCurrency(diff.diff_total)}</td>
              <td class="px-3 py-2 text-right">{formatCurrency(diff.taxas_importacao)}</td>
              <td class="px-3 py-2 text-right">{formatCurrency(diff.taxas_sistema)}</td>
              <td class="px-3 py-2 text-right font-semibold {diff.diff_taxas > 0 ? 'text-green-700' : diff.diff_taxas < 0 ? 'text-red-700' : ''}">{diff.diff_taxas > 0 ? '+' : ''}{formatCurrency(diff.diff_taxas)}</td>
            </tr>
          {/each}
        </tbody>
      </table>
    </div>
    <p class="text-xs text-slate-500">
      Se confirmar, o sistema usará os valores do arquivo importado e sobrescreverá os valores da venda cadastrada.
    </p>
  </div>
  <svelte:fragment slot="actions">
    <Button variant="secondary" on:click={() => { importDiferencasModalOpen = false; importDiferencasConfirmadas = false; }}>Corrigir / Cancelar</Button>
    <Button color="financeiro" on:click={() => { importDiferencasModalOpen = false; importDiferencasConfirmadas = true; importPreviewRows(); }}>
      Confirmar importação
    </Button>
  </svelte:fragment>
</Dialog>

<!-- Modal: Marcar dia sem movimento -->
<Dialog bind:open={semMovimentoModalOpen} title="Marcar dia sem movimento" maxWidth="sm">
  <div class="space-y-4">
    <p class="text-sm text-slate-600">
      Use esta opção quando não houve movimento de caixa em um dia específico.
      Uma vez marcado, não será possível importar arquivo para esta data.
    </p>
    <FieldInput
      id="sem-movimento-data"
      label="Data"
      type="date"
      bind:value={semMovimentoData}
      class_name="w-full"
    />
    <FieldTextarea
      id="sem-movimento-obs"
      label="Observação (opcional)"
      bind:value={semMovimentoObservacao}
      rows={2}
      class_name="w-full"
    />
    {#if diasSemMovimento.length > 0}
      <div class="rounded-xl border border-slate-200 bg-slate-50 px-3 py-2">
        <p class="text-xs font-semibold text-slate-600 mb-1">Dias já marcados:</p>
        <p class="text-xs text-slate-500">{diasSemMovimento.map((d) => formatDate(d)).join(', ')}</p>
      </div>
    {/if}
  </div>
  <svelte:fragment slot="actions">
    <Button variant="secondary" on:click={() => { semMovimentoModalOpen = false; semMovimentoData = ''; semMovimentoObservacao = ''; }}>Cancelar</Button>
    <Button color="financeiro" on:click={marcarSemMovimento} disabled={semMovimentoLoading} loading={semMovimentoLoading}>
      Marcar sem movimento
    </Button>
  </svelte:fragment>
</Dialog>
