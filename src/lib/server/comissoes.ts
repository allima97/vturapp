import type { DataClient } from '$lib/server/data';
/**
 * Cálculo de comissão do servidor — vtur-svelte
 *
 * Replica FIELMENTE a lógica do vtur-app (RelatorioVendasIsland.tsx + comissaoUtils.ts).
 * A lógica de negócio é IDÊNTICA ao frontend do vtur-app:
 *   1. Busca parâmetros, regras e metas da empresa (igual a carregarDadosComissao)
 *   2. Agrega buckets por recibo (igual a commissionAggregates)
 *   3. Calcula pctMetaGeral e aplica regras (igual ao mesmo useMemo)
 */

import type { ReportReceiptRow, ReportVendaRow } from '$lib/server/relatorios';
import {
  calcularPctFixoProduto,
  calcularPctPorRegra,
  hasConciliacaoCommissionRule,
  regraProdutoTemFixo,
  resolveConciliacaoCommissionSelection,
  type ParametrosComissao,
  type Regra,
  type RegraProduto,
  type Tier
} from '$lib/utils/comissao';
import { normalizeTipoPacoteRuleKey } from '$lib/server/tipoPacote';
import {
  buildReadModelCacheKey,
  getCachedReadModel,
  READ_MODEL_TAGS,
  scopeCacheTags
} from '$lib/server/readModelCache';
import { chunkArray, uniqueCleanStrings as uniqueIds } from '$lib/utils/array';
import { toFiniteNumber as toNum } from '$lib/utils/values';

// ---------------------------------------------------------------------------
// Tipos internos
// ---------------------------------------------------------------------------

type RegraPacote = {
  rule_id: string | null;
  fix_meta_nao_atingida: number | null;
  fix_meta_atingida: number | null;
  fix_super_meta: number | null;
};

type TipoProdutoRow = {
  id: string;
  nome?: string | null;
  tipo?: string | null;
  regra_comissionamento?: string | null;
  soma_na_meta?: boolean | null;
  usa_meta_produto?: boolean | null;
  meta_produto_valor?: number | null;
  comissao_produto_meta_pct?: number | null;
  descontar_meta_geral?: boolean | null;
  exibe_kpi_comissao?: boolean | null;
};

type CommissionRuleRow = {
  id?: string | null;
  tipo?: string | null;
  meta_nao_atingida?: number | null;
  meta_atingida?: number | null;
  super_meta?: number | null;
  commission_tier?: Tier[] | null;
};

type RegraProdutoRow = {
  produto_id?: string | null;
  tipo_pacote?: string | null;
  rule_id?: string | null;
  fix_meta_nao_atingida?: number | string | null;
  fix_meta_atingida?: number | string | null;
  fix_super_meta?: number | string | null;
};

type RegraTipoPacoteRow = Omit<RegraProdutoRow, 'produto_id' | 'tipo_pacote'> & {
  nome?: string | null;
};

type MetaVendedorRow = {
  id?: string | null;
  meta_geral?: number | string | null;
};

type MetaProdutoRow = {
  produto_id?: string | null;
  valor?: number | string | null;
};

export type CommissionContext = {
  params: ParametrosComissao;
  regrasMap: Record<string, Regra>;
  regraProdutoMap: Record<string, RegraProduto>;
  regraProdutoPacoteMap: Record<string, Record<string, RegraProduto>>;
  regraTipoPacoteMap: Record<string, RegraPacote>;
  tipoProdutoMap: Record<string, TipoProdutoRow>;
  metaPlanejada: number;
  metaProdutoMap: Record<string, number>;
};

export type ResolvedVendaCommission = {
  valorVenda: number;
  valorComissionavel: number;
  percentual: number;
  valorComissao: number;
  regraId: string | null;
  regraNome: string;
  tipoPacote: string | null;
};

export type ResolvedReceiptCommission = {
  vendaId: string;
  receiptId: string;
  valorComissionavel: number;
  percentual: number;
  percentualComissaoGeral: number;
  percentualSeguro: number;
  valorComissao: number;
  valorComissaoGeral: number;
  valorComissaoSeguro: number;
  regraNome: string;
};

// ---------------------------------------------------------------------------
// Helpers — replicados do vtur-app RelatorioVendasIsland
// ---------------------------------------------------------------------------

function roundMoney(v: number) {
  return Number(v.toFixed(2));
}

const QUERY_IN_BATCH_SIZE = 150;

async function fetchBatched<T>(
  values: string[],
  loader: (batch: string[]) => PromiseLike<{ data: T[] | null; error: unknown }>
) {
  const batchResults = await Promise.all(
    chunkArray(values, QUERY_IN_BATCH_SIZE).map(async (batch) => {
      const { data, error } = await loader(batch);
      return { data: data || [], error };
    })
  );
  const failed = batchResults.find((result) => result.error);
  if (failed) {
    return {
      data: batchResults.flatMap((result) => result.data || []),
      error: failed.error
    };
  }
  return { data: batchResults.flatMap((result) => result.data || []), error: null };
}

function getCommissionPeriod(row: Pick<ReportVendaRow, 'data_venda'>): string {
  const data = String(row.data_venda || '').trim();
  return /^\d{4}-\d{2}/.test(data) ? `${data.slice(0, 7)}-01` : '';
}

function getCommissionGroupKey(row: Pick<ReportVendaRow, 'vendedor_id' | 'data_venda'>): string {
  return `${String(row.vendedor_id || '').trim() || 'sem-vendedor'}::${getCommissionPeriod(row) || 'sem-periodo'}`;
}

function normalizeText(value?: string | null) {
  return String(value || '')
    .normalize('NFD')
    .replace(/\p{Diacritic}/gu, '')
    .toLowerCase()
    .trim();
}

function isMissingSchemaError(error: unknown) {
  const code = String((error as { code?: string })?.code || '').trim();
  const msg = String((error as { message?: string })?.message || '').toLowerCase();
  return (
    code === '42703' ||
    code === '42P01' ||
    (msg.includes('column') && msg.includes('does not exist')) ||
    (msg.includes('relation') && msg.includes('does not exist'))
  );
}

// ---------------------------------------------------------------------------
// hasConciliacaoOverride — IGUAL ao vtur-app (só os 3 campos de valor)
// ---------------------------------------------------------------------------
function hasConciliacaoOverride(r: {
  valor_bruto_override?: number | null;
  valor_meta_override?: number | null;
  valor_liquido_override?: number | null;
}): boolean {
  return (
    r.valor_bruto_override != null ||
    r.valor_meta_override != null ||
    r.valor_liquido_override != null
  );
}

// ---------------------------------------------------------------------------
// Funções de valor — replicadas do vtur-app RelatorioVendasIsland
// ---------------------------------------------------------------------------

function getBrutoRecibo(r: ReportReceiptRow): number {
  if (!r) return 0;
  if (hasConciliacaoOverride(r)) {
    return Math.max(0, toNum(r.valor_bruto_override ?? r.valor_total ?? 0));
  }
  return Math.max(0, toNum(r.valor_total ?? 0) - toNum(r.valor_rav ?? 0));
}

function getBrutoSemRav(r: ReportReceiptRow): number {
  if (!r) return 0;
  return getBrutoRecibo(r);
}

function getTaxasEfetivas(r: ReportReceiptRow): number {
  if (!r) return 0;
  return Math.max(0, toNum(r.valor_taxas ?? 0));
}

function getLiquidoComissionavel(r: ReportReceiptRow): number {
  if (!r) return 0;
  if (r.valor_liquido_override != null) {
    return Math.max(0, toNum(r.valor_liquido_override || 0));
  }
  return Math.max(0, getBrutoSemRav(r) - getTaxasEfetivas(r));
}

function getFatorComissionavelRecibo(r: ReportReceiptRow): number {
  if (!r) return 0;
  const bruto = getBrutoRecibo(r);
  if (bruto <= 0) return 0;
  const brutoComissionavel =
    r.valor_comissionavel != null ? toNum(r.valor_comissionavel) : bruto;
  if (!Number.isFinite(brutoComissionavel)) return 1;
  return Math.max(0, Math.min(1, brutoComissionavel / bruto));
}

function getLiquidoBaseComissaoRecibo(r: ReportReceiptRow): number {
  return getLiquidoComissionavel(r) * getFatorComissionavelRecibo(r);
}

function getMetaRecibo(r: ReportReceiptRow, params: ParametrosComissao): number {
  if (!r) return 0;
  const metaBase =
    r.valor_meta_override != null
      ? Math.max(0, toNum(r.valor_meta_override || 0))
      : (() => {
          const liquido = getLiquidoComissionavel(r);
          return params.foco_valor === 'liquido'
            ? liquido
            : params.usar_taxas_na_meta
            ? getBrutoRecibo(r)
            : liquido;
        })();
  return metaBase * getFatorComissionavelRecibo(r);
}

function isSeguroRecibo(r: ReportReceiptRow): boolean {
  if (!r) return false;
  const tipo = normalizeText(r.tipo_produtos?.tipo);
  const nome = normalizeText(r.tipo_produtos?.nome);
  return tipo.includes('seguro') || nome.includes('seguro');
}

// ---------------------------------------------------------------------------
// Lookup de produto — equivalente a getProdutoPorId do vtur-app
// ---------------------------------------------------------------------------

function getProduto(context: CommissionContext, receipt: ReportReceiptRow): TipoProdutoRow | null {
  if (!receipt) return null;

  // 1. Tenta pelo id do tipo_produtos inline (join direto)
  const inlineId = String(receipt.tipo_produtos?.id || '').trim();
  if (inlineId && context.tipoProdutoMap[inlineId]) return context.tipoProdutoMap[inlineId];

  // 2. Tenta pelo produto_id do recibo (quando produto_id FK aponta direto para tipo_produtos)
  const produtoId = String(receipt.produto_id || '').trim();
  if (produtoId && context.tipoProdutoMap[produtoId]) return context.tipoProdutoMap[produtoId];

  // 3. Tenta pelo tipo_produto do produto_resolvido (equiv. a prodMap.get(reciboProdutoId)?.tipo_produto no vtur-app)
  const prodResolvidoTipoId = String(receipt.produto_resolvido?.tipo_produto || '').trim();
  if (prodResolvidoTipoId && context.tipoProdutoMap[prodResolvidoTipoId]) {
    return context.tipoProdutoMap[prodResolvidoTipoId];
  }

  // 4. Usa inline se disponível (dados do join, mesmo sem estar no map)
  if (inlineId) {
    return {
      id: inlineId,
      nome: receipt.tipo_produtos?.nome ?? null,
      tipo: receipt.tipo_produtos?.tipo ?? null,
      regra_comissionamento: receipt.tipo_produtos?.regra_comissionamento ?? null,
      soma_na_meta: receipt.tipo_produtos?.soma_na_meta ?? null,
      usa_meta_produto: receipt.tipo_produtos?.usa_meta_produto ?? null,
      meta_produto_valor: receipt.tipo_produtos?.meta_produto_valor ?? null,
      comissao_produto_meta_pct: receipt.tipo_produtos?.comissao_produto_meta_pct ?? null,
      descontar_meta_geral: receipt.tipo_produtos?.descontar_meta_geral ?? null,
      exibe_kpi_comissao: receipt.tipo_produtos?.exibe_kpi_comissao ?? null
    };
  }

  // 5. Ultimo fallback: cria produto sintético a partir do produto_resolvido para não perder o recibo
  if (prodResolvidoTipoId) {
    const fromMap = context.tipoProdutoMap[prodResolvidoTipoId];
    if (fromMap) return fromMap;
  }

  return null;
}

// ---------------------------------------------------------------------------
// Lookup de regra — equivalente a getRegraProduto do vtur-app
// ---------------------------------------------------------------------------

function getProdId(receipt: ReportReceiptRow): string {
  if (!receipt) return '';
  // Mesma prioridade do vtur-app: produto_comissao_id || produto_tipo_id || produto_id
  // produto_comissao_id = tipo_produtos?.id (join inline)
  // produto_tipo_id     = produto_resolvido?.tipo_produto (FK tipo via produto resolvido)
  // produto_id          = produto_id direto do recibo
  return (
    String(receipt.tipo_produtos?.id || '').trim() ||
    String(receipt.produto_resolvido?.tipo_produto || '').trim() ||
    String(receipt.produto_id || '').trim()
  );
}

function getRegraProduto(
  context: CommissionContext,
  prodId: string,
  produto: TipoProdutoRow | null
): RegraProduto | undefined {
  const direct = context.regraProdutoMap[prodId];
  if (direct) return direct;
  if (produto) {
    // Tenta pelo id do tipo se diferente do prodId
    const tipoId = produto.id !== prodId ? produto.id : null;
    if (tipoId) return context.regraProdutoMap[tipoId];
  }
  return undefined;
}

function getRegraProdutoPacote(
  context: CommissionContext,
  prodId: string,
  tipoPacote: string | null,
  produto: TipoProdutoRow | null
): RegraProduto | undefined {
  const key = normalizeTipoPacoteRuleKey(tipoPacote || '');
  if (!key) return undefined;
  const direct = context.regraProdutoPacoteMap[prodId]?.[key];
  if (direct) return direct;
  if (produto && produto.id !== prodId) {
    return context.regraProdutoPacoteMap[produto.id]?.[key];
  }
  return undefined;
}

function regraPacoteTemConfiguracao(regra?: RegraPacote | RegraProduto | null): boolean {
  return Boolean(regra && (regra.rule_id || regraProdutoTemFixo(regra as RegraProduto)));
}

type RegraPacoteResolvida = {
  origem: 'tipo_pacote' | 'produto_pacote';
  regra: RegraProduto;
};

// Replica exatamente getRegraPacote do vtur-app:
// PRIORIDADE: tipo_pacote (empresa) > produto_pacote (específico)
function getRegraPacote(
  context: CommissionContext,
  prodId: string,
  tipoPacote: string | null,
  produto: TipoProdutoRow | null
): RegraPacoteResolvida | null {
  const key = normalizeTipoPacoteRuleKey(tipoPacote || '');
  if (!key) return null;

  const regraTipoPacote = context.regraTipoPacoteMap[key];
  if (regraPacoteTemConfiguracao(regraTipoPacote)) {
    return {
      origem: 'tipo_pacote',
      regra: {
        produto_id: prodId,
        rule_id: regraTipoPacote?.rule_id || null,
        fix_meta_nao_atingida: regraTipoPacote?.fix_meta_nao_atingida ?? null,
        fix_meta_atingida: regraTipoPacote?.fix_meta_atingida ?? null,
        fix_super_meta: regraTipoPacote?.fix_super_meta ?? null
      }
    };
  }

  const regraProdutoPacote = getRegraProdutoPacote(context, prodId, key, produto) || null;
  return regraPacoteTemConfiguracao(regraProdutoPacote)
    ? { origem: 'produto_pacote', regra: regraProdutoPacote! }
    : null;
}

// ---------------------------------------------------------------------------
// Busca de dados do servidor
// ---------------------------------------------------------------------------

async function fetchParametros(
  client: DataClient,
  companyIds: string[]
): Promise<ParametrosComissao> {
  const defaultParams: ParametrosComissao = {
    usar_taxas_na_meta: true,
    foco_valor: 'bruto',
    foco_faturamento: 'bruto',
    conciliacao_sobrepoe_vendas: false,
    conciliacao_regra_ativa: false,
    conciliacao_tipo: 'GERAL',
    conciliacao_meta_nao_atingida: null,
    conciliacao_meta_atingida: null,
    conciliacao_super_meta: null,
    conciliacao_tiers: [],
    conciliacao_faixas_loja: []
  };

  const ids = uniqueIds(companyIds);
  if (ids.length === 0) return defaultParams;

  // Usa o primeiro company_id — igual ao vtur-app que usa um único objeto
  const { data } = await client
    .from('parametros_comissao')
    .select(
      'usar_taxas_na_meta, foco_valor, foco_faturamento, conciliacao_sobrepoe_vendas, conciliacao_regra_ativa, conciliacao_tipo, conciliacao_meta_nao_atingida, conciliacao_meta_atingida, conciliacao_super_meta, conciliacao_tiers, conciliacao_faixas_loja'
    )
    .eq('company_id', ids[0])
    .limit(1)
    .maybeSingle();

  if (!data) return defaultParams;

  return {
    usar_taxas_na_meta: Boolean(data.usar_taxas_na_meta ?? true),
    foco_valor: data.foco_valor === 'liquido' ? 'liquido' : 'bruto',
    foco_faturamento: data.foco_faturamento === 'liquido' ? 'liquido' : 'bruto',
    conciliacao_sobrepoe_vendas: Boolean(data.conciliacao_sobrepoe_vendas),
    conciliacao_regra_ativa: Boolean(data.conciliacao_regra_ativa),
    conciliacao_tipo: data.conciliacao_tipo === 'ESCALONAVEL' ? 'ESCALONAVEL' : 'GERAL',
    conciliacao_meta_nao_atingida:
      data.conciliacao_meta_nao_atingida != null ? Number(data.conciliacao_meta_nao_atingida) : null,
    conciliacao_meta_atingida:
      data.conciliacao_meta_atingida != null ? Number(data.conciliacao_meta_atingida) : null,
    conciliacao_super_meta:
      data.conciliacao_super_meta != null ? Number(data.conciliacao_super_meta) : null,
    conciliacao_tiers: Array.isArray(data.conciliacao_tiers) ? (data.conciliacao_tiers as Tier[]) : [],
    conciliacao_faixas_loja: Array.isArray(data.conciliacao_faixas_loja)
      ? (data.conciliacao_faixas_loja as ParametrosComissao['conciliacao_faixas_loja'])
      : []
  };
}

async function fetchRegras(client: DataClient, companyIds: string[]): Promise<Record<string, Regra>> {
  const scopedCompanyIds = uniqueIds(companyIds);
  const selectWithCompany =
    'id, company_id, tipo, meta_nao_atingida, meta_atingida, super_meta, commission_tier (faixa, de_pct, ate_pct, inc_pct_meta, inc_pct_comissao)';
  const selectWithoutCompany =
    'id, tipo, meta_nao_atingida, meta_atingida, super_meta, commission_tier (faixa, de_pct, ate_pct, inc_pct_meta, inc_pct_comissao)';
  const baseQuery = (selectClause: string) =>
    client
      .from('commission_rule')
      .select(selectClause)
      .eq('ativo', true)
      .order('nome', { ascending: true })
      .limit(1000);

  let data: CommissionRuleRow[] | null = null;
  let error: unknown = null;

  if (scopedCompanyIds.length === 0) {
    const result = await baseQuery(selectWithCompany);
    data = result.data as unknown as CommissionRuleRow[] | null;
    error = result.error;
  } else {
    const rowsById = new Map<string, CommissionRuleRow>();

    const globalResult = await baseQuery(selectWithCompany).is('company_id', null);
    error = globalResult.error;
    for (const row of (globalResult.data || []) as unknown as CommissionRuleRow[]) {
      if (row?.id) rowsById.set(String(row.id), row);
    }

    if (!error) {
      const companyRuleResults = await Promise.all(
        chunkArray(scopedCompanyIds, QUERY_IN_BATCH_SIZE).map((batch) =>
          baseQuery(selectWithCompany).in('company_id', batch)
        )
      );
      const failed = companyRuleResults.find((result) => result.error);
      error = failed?.error || null;
      if (!error) {
        for (const batchResult of companyRuleResults) {
          for (const row of (batchResult.data || []) as unknown as CommissionRuleRow[]) {
            if (row?.id) rowsById.set(String(row.id), row);
          }
        }
      }
    }

    data = Array.from(rowsById.values());
  }

  if (error && isMissingSchemaError(error)) {
    const fallback = await baseQuery(selectWithoutCompany);

    data = fallback.data as unknown as CommissionRuleRow[] | null;
    error = fallback.error;
  }

  if (error && !isMissingSchemaError(error)) throw error;

  const map: Record<string, Regra> = {};
  for (const rule of data || []) {
    if (!rule.id) continue;
    map[rule.id] = {
      id: rule.id,
      tipo: String(rule.tipo || 'GERAL').toUpperCase() === 'ESCALONAVEL' ? 'ESCALONAVEL' : 'GERAL',
      meta_nao_atingida: rule.meta_nao_atingida ?? 0,
      meta_atingida: rule.meta_atingida ?? rule.meta_nao_atingida ?? 0,
      super_meta: rule.super_meta ?? rule.meta_atingida ?? rule.meta_nao_atingida ?? 0,
      commission_tier: Array.isArray(rule.commission_tier) ? (rule.commission_tier as Tier[]) : []
    };
  }
  return map;
}

// vtur-app busca product_commission_rule SEM FILTRO por produto_id (busca tudo)
async function fetchRegraProdutoMap(
  client: DataClient
): Promise<Record<string, RegraProduto>> {
  const { data, error } = await client
    .from('product_commission_rule')
    .select('produto_id, rule_id, fix_meta_nao_atingida, fix_meta_atingida, fix_super_meta')
    .limit(5000);

  if (error && !isMissingSchemaError(error)) throw error;

  const map: Record<string, RegraProduto> = {};
  for (const row of (data || []) as unknown as RegraProdutoRow[]) {
    const produtoId = String(row.produto_id || '').trim();
    if (!produtoId) continue;
    map[produtoId] = {
      produto_id: produtoId,
      rule_id: String(row.rule_id || '').trim() || null,
      fix_meta_nao_atingida: row.fix_meta_nao_atingida != null ? Number(row.fix_meta_nao_atingida) : null,
      fix_meta_atingida: row.fix_meta_atingida != null ? Number(row.fix_meta_atingida) : null,
      fix_super_meta: row.fix_super_meta != null ? Number(row.fix_super_meta) : null
    };
  }
  return map;
}

// vtur-app busca product_commission_rule_pacote SEM FILTRO por produto_id (busca tudo)
async function fetchRegraProdutoPacoteMap(
  client: DataClient
): Promise<Record<string, Record<string, RegraProduto>>> {
  const { data, error } = await client
    .from('product_commission_rule_pacote')
    .select('produto_id, tipo_pacote, rule_id, fix_meta_nao_atingida, fix_meta_atingida, fix_super_meta')
    .limit(5000);

  if (error && !isMissingSchemaError(error)) throw error;

  const map: Record<string, Record<string, RegraProduto>> = {};
  for (const row of (data || []) as unknown as RegraProdutoRow[]) {
    const produtoId = String(row.produto_id || '').trim();
    const key = normalizeTipoPacoteRuleKey(String(row.tipo_pacote || ''));
    if (!produtoId || !key) continue;
    if (!map[produtoId]) map[produtoId] = {};
    map[produtoId][key] = {
      produto_id: produtoId,
      rule_id: String(row.rule_id || '').trim() || null,
      fix_meta_nao_atingida: row.fix_meta_nao_atingida != null ? Number(row.fix_meta_nao_atingida) : null,
      fix_meta_atingida: row.fix_meta_atingida != null ? Number(row.fix_meta_atingida) : null,
      fix_super_meta: row.fix_super_meta != null ? Number(row.fix_super_meta) : null
    };
  }
  return map;
}

async function fetchRegraTipoPacoteMap(client: DataClient): Promise<Record<string, RegraPacote>> {
  const { data, error } = await client
    .from('tipo_pacotes')
    .select('nome, rule_id, fix_meta_nao_atingida, fix_meta_atingida, fix_super_meta')
    .eq('ativo', true)
    .limit(500);

  if (error && !isMissingSchemaError(error)) throw error;

  const map: Record<string, RegraPacote> = {};
  for (const row of (data || []) as unknown as RegraTipoPacoteRow[]) {
    const key = normalizeTipoPacoteRuleKey(String(row.nome || ''));
    if (!key) continue;
    map[key] = {
      rule_id: String(row.rule_id || '').trim() || null,
      fix_meta_nao_atingida: row.fix_meta_nao_atingida != null ? Number(row.fix_meta_nao_atingida) : null,
      fix_meta_atingida: row.fix_meta_atingida != null ? Number(row.fix_meta_atingida) : null,
      fix_super_meta: row.fix_super_meta != null ? Number(row.fix_super_meta) : null
    };
  }
  return map;
}

// vtur-app busca tipo_produtos SEM FILTRO (busca todos os tipos de produto)
async function fetchTipoProdutoMap(
  client: DataClient
): Promise<Record<string, TipoProdutoRow>> {
  const tryFetch = async (cols: string) => {
    return client.from('tipo_produtos').select(cols).order('nome', { ascending: true }).limit(2000);
  };

  const fullCols =
    'id, nome, tipo, regra_comissionamento, soma_na_meta, usa_meta_produto, meta_produto_valor, comissao_produto_meta_pct, descontar_meta_geral, exibe_kpi_comissao';
  let { data, error } = await tryFetch(fullCols);
  if (error && isMissingSchemaError(error)) {
    ({ data, error } = await tryFetch(
      'id, nome, tipo, regra_comissionamento, soma_na_meta, usa_meta_produto, meta_produto_valor, comissao_produto_meta_pct, descontar_meta_geral'
    ));
  }
  if (error && isMissingSchemaError(error)) {
    ({ data, error } = await tryFetch('id, nome, tipo'));
  }
  if (error) throw error;

  const map: Record<string, TipoProdutoRow> = {};
  for (const row of (data || []) as unknown as TipoProdutoRow[]) {
    if (!row.id) continue;
    map[String(row.id)] = row as TipoProdutoRow;
  }
  return map;
}

async function fetchMetas(
  client: DataClient,
  vendedorIds: string[],
  periodo: string
): Promise<{ metaPlanejada: number; metaProdutoMap: Record<string, number> }> {
  const ids = uniqueIds(vendedorIds);
  if (ids.length === 0 || !periodo) return { metaPlanejada: 0, metaProdutoMap: {} };

  const { data: metasData, error: metasErr } = await fetchBatched<MetaVendedorRow>(ids, (batch) =>
    client
      .from('metas_vendedor')
      .select('id, meta_geral')
      .eq('scope', 'vendedor')
      .eq('ativo', true)
      .eq('periodo', periodo)
      .in('vendedor_id', batch)
      .limit(2000)
  );

  if (metasErr && !isMissingSchemaError(metasErr)) throw metasErr;

  const metas = metasData || [];
  const metaPlanejada = metas.reduce((acc, m) => acc + toNum(m.meta_geral), 0);
  const metaIds = uniqueIds(metas.map((m) => String(m.id || '')));

  if (metaIds.length === 0) return { metaPlanejada, metaProdutoMap: {} };

  const { data: prodData, error: prodErr } = await fetchBatched<MetaProdutoRow>(metaIds, (batch) =>
    client
      .from('metas_vendedor_produto')
      .select('produto_id, valor')
      .in('meta_vendedor_id', batch)
      .limit(5000)
  );

  if (prodErr && !isMissingSchemaError(prodErr)) throw prodErr;

  const metaProdutoMap: Record<string, number> = {};
  for (const row of prodData || []) {
    if (!row.produto_id) continue;
    metaProdutoMap[row.produto_id] = (metaProdutoMap[row.produto_id] || 0) + toNum(row.valor);
  }

  return { metaPlanejada, metaProdutoMap };
}

// ---------------------------------------------------------------------------
// fetchCommissionContext — busca tudo que o vtur-app busca em carregarDadosComissao
// ---------------------------------------------------------------------------

export async function fetchCommissionContext(
  client: DataClient,
  params: {
    companyIds?: string[];
    vendedorIds?: string[];
    periodo?: string; // YYYY-MM-01
    rows?: ReportVendaRow[];
  } = {}
): Promise<CommissionContext> {
  const companyIds = uniqueIds(params.companyIds || []);
  const vendedorIds = uniqueIds(params.vendedorIds || []);
  const periodo = params.periodo || '';

  return getCachedReadModel<CommissionContext>({
    key: buildReadModelCacheKey('commission-context', {
      companyIds,
      vendedorIds,
      periodo
    }),
    tags: [
      READ_MODEL_TAGS.comissoes,
      READ_MODEL_TAGS.metas,
      READ_MODEL_TAGS.users,
      ...scopeCacheTags({ companyIds, vendedorIds })
    ],
    ttlMs: 120_000,
    staleTtlMs: 600_000,
    loader: async () => {
      // vtur-app busca tipo_produtos, regras de produto e pacote SEM filtro (busca tudo)
      const [
        fetchedParams,
        regrasMap,
        tipoProdutoMap,
        regraProdutoMap,
        regraProdutoPacoteMap,
        regraTipoPacoteMap,
        metasResult
      ] = await Promise.all([
        fetchParametros(client, companyIds),
        fetchRegras(client, companyIds),
        fetchTipoProdutoMap(client),
        fetchRegraProdutoMap(client),
        fetchRegraProdutoPacoteMap(client),
        fetchRegraTipoPacoteMap(client),
        fetchMetas(client, vendedorIds, periodo)
      ]);

      return {
        params: fetchedParams,
        regrasMap,
        tipoProdutoMap,
        regraProdutoMap,
        regraProdutoPacoteMap,
        regraTipoPacoteMap,
        metaPlanejada: metasResult.metaPlanejada,
        metaProdutoMap: metasResult.metaProdutoMap
      };
    }
  });
}

// ---------------------------------------------------------------------------
// calcularComissaoRows — replica FIELMENTE commissionAggregates do vtur-app
//
// Recebe um array de rows (vendas) e retorna:
//   - pctMetaGeral
//   - pctByRecibo: Map de receiptId → percentual calculado
// ---------------------------------------------------------------------------

type BucketEntry = {
  prodId: string;
  tipoPacoteKey: string;
  baseCom: number;
  isConciliacao: boolean;
  percentualComissaoLoja: number | null;
  faixaComissao: string | null;
  isSeguro: boolean;
};

export function calcularComissaoRows(
  rows: ReportVendaRow[],
  context: CommissionContext
): {
  pctMetaGeral: number;
  pctByReceiptId: Map<string, number>;
  pctComissaoGeralByReceiptId: Map<string, number>;
  pctSeguroByReceiptId: Map<string, number>;
  regraNomeByReceiptId: Map<string, string>;
} {
  const { params } = context;

  // Passa 1 — acumular base de meta e buckets (igual a recibosElegiveisComissao + commissionAggregates)
  const baseMetaPorProduto: Record<string, number> = {};
  const baseComPorProduto: Record<string, number> = {};
  let baseMetaTotal = 0;

  // bucketKey → BucketEntry (agrega baseCom de múltiplos recibos com mesmo perfil)
  const bucketTotals: Record<string, BucketEntry> = {};
  // receiptId → bucketKey (para depois devolver o pct por recibo)
  const receiptToBucket = new Map<string, string>();

  for (const row of rows) {
    const recibos = (Array.isArray(row.recibos) ? row.recibos : []).filter(
      (r) => !r?.cancelado_por_conciliacao_em
    );

    // Calcula fator comissionável da venda — igual ao vtur-app
    const totalBrutoVendaBase = recibos.reduce((sum, r) => sum + getBrutoRecibo(r), 0);
    const naoComissionado = toNum(row.valor_nao_comissionado || 0);
    const baseComissionavel = Math.max(0, totalBrutoVendaBase - naoComissionado);
    const fatorComissionavel =
      totalBrutoVendaBase > 0 ? Math.max(0, Math.min(1, baseComissionavel / totalBrutoVendaBase)) : 1;

    for (const receipt of recibos) {
      if (!receipt) continue;

      // Injeta valor_comissionavel no recibo para que getFatorComissionavelRecibo funcione
      // igual ao vtur-app que passa valor_comissionavel no objeto
      const reciboComFator = {
        ...receipt,
        valor_comissionavel:
          receipt.valor_comissionavel != null
            ? receipt.valor_comissionavel
            : getBrutoRecibo(receipt) * fatorComissionavel
      };

      const prodId = getProdId(reciboComFator);
      if (!prodId) continue;

      const produto = getProduto(context, reciboComFator);
      if (!produto) continue;

      const liquidoBaseComissao = getLiquidoBaseComissaoRecibo(reciboComFator);
      const valParaMeta = getMetaRecibo(reciboComFator, params);

      baseMetaPorProduto[prodId] = (baseMetaPorProduto[prodId] || 0) + valParaMeta;
      if (produto.soma_na_meta) {
        baseMetaTotal += valParaMeta;
      }
      const baseCom = liquidoBaseComissao;
      baseComPorProduto[prodId] = (baseComPorProduto[prodId] || 0) + baseCom;

      const tipoPacoteKey = normalizeTipoPacoteRuleKey(receipt.tipo_pacote || '');
      const isConciliacao = hasConciliacaoOverride(reciboComFator);
      const percentualComissaoLoja =
        receipt.percentual_comissao_loja != null ? toNum(receipt.percentual_comissao_loja) : null;
      const faixaComissao = receipt.faixa_comissao || null;

      // bucketKey — idêntico ao buildCommissionBucketKey do vtur-app
      const bucketKey = [
        prodId,
        tipoPacoteKey || 'default',
        isConciliacao ? 'conciliacao' : 'base',
        isConciliacao ? (faixaComissao || 'sem-faixa') : 'sem-faixa',
        isConciliacao && percentualComissaoLoja != null
          ? String(percentualComissaoLoja)
          : 'sem-pct-loja'
      ].join('::');

      if (!bucketTotals[bucketKey]) {
        bucketTotals[bucketKey] = {
          prodId,
          tipoPacoteKey,
          baseCom: 0,
          isConciliacao,
          percentualComissaoLoja,
          faixaComissao,
          isSeguro: isSeguroRecibo(reciboComFator)
        };
      }
      bucketTotals[bucketKey].baseCom += baseCom;

      // Guarda o bucketKey deste receipt pelo id ou índice
      const receiptId = String(receipt.id || '').trim();
      if (receiptId) receiptToBucket.set(receiptId, bucketKey);
    }
  }

  const pctMetaGeral =
    context.metaPlanejada > 0 ? (baseMetaTotal / context.metaPlanejada) * 100 : 0;

  // Passa 2 — calcular pct por bucket (idêntico ao forEach de bucketTotals no vtur-app)
  const pctByBucket: Record<string, number> = {};
  const pctComissaoGeralByBucket: Record<string, number> = {};
  const pctSeguroByBucket: Record<string, number> = {};
  const regraNomeByBucket: Record<string, string> = {};

  for (const [bucketKey, bucket] of Object.entries(bucketTotals)) {
    if (bucket.baseCom <= 0) continue;

    const produto = context.tipoProdutoMap[bucket.prodId];
    if (!produto) continue;

    const baseMetaProduto = baseMetaPorProduto[bucket.prodId] || 0;

    // Seleciona regra — igual ao vtur-app
    const regraPacoteSelecionada = getRegraPacote(context, bucket.prodId, bucket.tipoPacoteKey, produto);
    const regraPacote = regraPacoteSelecionada?.regra;
    const regraProdBase = getRegraProduto(context, bucket.prodId, produto);
    let regraProd: RegraProduto | undefined = regraPacote || regraProdBase;

    // ── Caminho conciliação ── (igual ao vtur-app linha 1827)
    if (bucket.isConciliacao && hasConciliacaoCommissionRule(params)) {
      const selection = resolveConciliacaoCommissionSelection(params, {
        faixa_comissao: bucket.faixaComissao,
        percentual_comissao_loja: bucket.percentualComissaoLoja,
        is_seguro_viagem: bucket.isSeguro
      });
      if (selection.kind === 'CONCILIACAO' && selection.rule) {
        const pct = calcularPctPorRegra(selection.rule, pctMetaGeral);
        pctByBucket[bucketKey] = pct;
        pctComissaoGeralByBucket[bucketKey] = pct;
        pctSeguroByBucket[bucketKey] = 0;
        regraNomeByBucket[bucketKey] = 'Conciliação';
        continue;
      }
    }

    // ── Produto diferenciado ── (igual ao vtur-app linha 1842)
    if (produto.regra_comissionamento === 'diferenciado') {
      if (!regraProd) continue;
      const metaProdValor =
        context.metaProdutoMap[bucket.prodId] ||
        context.metaProdutoMap[produto.id] ||
        0;
      const temMetaProd = metaProdValor > 0;
      const pctMetaProd = temMetaProd ? (baseMetaProduto / metaProdValor) * 100 : 0;
      const pctReferencia = temMetaProd ? pctMetaProd : pctMetaGeral;
      const pct = calcularPctFixoProduto(regraProd, pctReferencia);
      pctByBucket[bucketKey] = pct;
      pctComissaoGeralByBucket[bucketKey] = pct;
      pctSeguroByBucket[bucketKey] = 0;
      regraNomeByBucket[bucketKey] = 'Diferenciado';
      continue;
    }

    // ── Regra padrão ── (igual ao vtur-app linha 1856)
    let pct = 0;
    let usouFixo = false;

    if (regraProd && regraProdutoTemFixo(regraProd)) {
      pct = calcularPctFixoProduto(regraProd, pctMetaGeral);
      usouFixo = true;
    } else if (regraProd && !regraProd.rule_id && regraPacote && regraProd === regraPacote) {
      regraProd = regraProdBase;
    }

    if (!usouFixo) {
      const regraId = regraProd?.rule_id;
      const regra = regraId ? context.regrasMap[regraId] : undefined;
      if (!regra) continue;
      pct = calcularPctPorRegra(regra, pctMetaGeral);
      regraNomeByBucket[bucketKey] = regra ? 'Geral' : 'Sem regra';
    } else {
      regraNomeByBucket[bucketKey] = 'Fixo';
    }

    // ── Meta por produto ── (igual ao vtur-app linha 1875)
    let extraPct = 0;
    if (
      produto.usa_meta_produto &&
      toNum(produto.meta_produto_valor) > 0 &&
      toNum(produto.comissao_produto_meta_pct) > 0
    ) {
      const atingiuMetaProd =
        toNum(produto.meta_produto_valor) > 0 &&
        baseMetaProduto >= toNum(produto.meta_produto_valor);
      if (atingiuMetaProd) {
        const baseComProduto = baseComPorProduto[bucket.prodId] || 0;
        if (baseComProduto > 0) {
          const valMetaProd = baseComProduto * (toNum(produto.comissao_produto_meta_pct) / 100);
          const valGeral = baseComProduto * (pct / 100);
          const diffValor =
            produto.descontar_meta_geral === false
              ? valMetaProd
              : Math.max(valMetaProd - valGeral, 0);
          if (diffValor > 0) {
            extraPct = (diffValor / baseComProduto) * 100;
            pct += extraPct;
          }
        }
      }
    }

    pctByBucket[bucketKey] = pct;
    pctComissaoGeralByBucket[bucketKey] = bucket.isSeguro && extraPct > 0 ? pct - extraPct : pct;
    pctSeguroByBucket[bucketKey] = bucket.isSeguro ? extraPct : 0;
  }

  // Passa 3 — mapear receiptId → pct calculado
  const pctByReceiptId = new Map<string, number>();
  const pctComissaoGeralByReceiptId = new Map<string, number>();
  const pctSeguroByReceiptId = new Map<string, number>();
  const regraNomeByReceiptId = new Map<string, string>();

  for (const [receiptId, bucketKey] of receiptToBucket.entries()) {
    const pct = pctByBucket[bucketKey] ?? 0;
    pctByReceiptId.set(receiptId, pct);
    pctComissaoGeralByReceiptId.set(receiptId, pctComissaoGeralByBucket[bucketKey] ?? pct);
    pctSeguroByReceiptId.set(receiptId, pctSeguroByBucket[bucketKey] ?? 0);
    regraNomeByReceiptId.set(receiptId, regraNomeByBucket[bucketKey] ?? 'Sem regra');
  }

  return {
    pctMetaGeral,
    pctByReceiptId,
    pctComissaoGeralByReceiptId,
    pctSeguroByReceiptId,
    regraNomeByReceiptId
  };
}

export function resolveReceiptCommissions(
  rows: ReportVendaRow[],
  context: CommissionContext
): Map<string, ResolvedReceiptCommission> {
  const { pctByReceiptId, pctComissaoGeralByReceiptId, pctSeguroByReceiptId, regraNomeByReceiptId } =
    calcularComissaoRows(rows, context);
  const resolved = new Map<string, ResolvedReceiptCommission>();

  for (const row of rows) {
    const recibos = (Array.isArray(row.recibos) ? row.recibos : []).filter(
      (r) => !r?.cancelado_por_conciliacao_em
    );

    const totalBrutoVendaBase = recibos.reduce((sum, r) => sum + getBrutoRecibo(r), 0);
    const naoComissionado = toNum(row.valor_nao_comissionado || 0);
    const valorComissionavel = Math.max(0, roundMoney(totalBrutoVendaBase - naoComissionado));
    const fatorComissionavel =
      totalBrutoVendaBase > 0 ? Math.max(0, Math.min(1, valorComissionavel / totalBrutoVendaBase)) : 1;

    for (const receipt of recibos) {
      if (!receipt) continue;
      const receiptId = String(receipt?.id || '').trim();
      if (!receiptId) continue;

      const reciboComFator = {
        ...receipt,
        valor_comissionavel:
          receipt.valor_comissionavel != null
            ? receipt.valor_comissionavel
            : getBrutoRecibo(receipt) * fatorComissionavel
      };

      const baseCom = getLiquidoBaseComissaoRecibo(reciboComFator);
      const percentual = pctByReceiptId.get(receiptId) ?? 0;
      const percentualSeguro = pctSeguroByReceiptId.get(receiptId) ?? 0;
      const percentualComissaoGeral = pctComissaoGeralByReceiptId.get(receiptId) ?? percentual;
      const valorComissao = roundMoney(baseCom * (percentual / 100));
      const valorComissaoSeguro = roundMoney(baseCom * (percentualSeguro / 100));
      const valorComissaoGeral = roundMoney(Math.max(0, valorComissao - valorComissaoSeguro));

      resolved.set(receiptId, {
        vendaId: row.id,
        receiptId,
        valorComissionavel: roundMoney(baseCom),
        percentual: roundMoney(percentual),
        percentualComissaoGeral: roundMoney(percentualComissaoGeral),
        percentualSeguro: roundMoney(percentualSeguro),
        valorComissao,
        valorComissaoGeral,
        valorComissaoSeguro,
        regraNome: regraNomeByReceiptId.get(receiptId) ?? 'Sem regra'
      });
    }
  }

  return resolved;
}

export function resolveVendaCommissions(
  rows: ReportVendaRow[],
  context: CommissionContext
): Map<string, ResolvedVendaCommission> {
  const receiptsById = resolveReceiptCommissions(rows, context);
  const resolved = new Map<string, ResolvedVendaCommission>();

  for (const row of rows) {
    const recibos = (Array.isArray(row.recibos) ? row.recibos : []).filter(
      (r) => !r?.cancelado_por_conciliacao_em
    );

    const totalBrutoVendaBase = recibos.reduce((sum, r) => sum + getBrutoRecibo(r), 0);
    const naoComissionado = toNum(row.valor_nao_comissionado || 0);
    const valorComissionavel = Math.max(0, roundMoney(totalBrutoVendaBase - naoComissionado));
    const valorVenda =
      recibos.length > 0
        ? roundMoney(totalBrutoVendaBase)
        : roundMoney(toNum(row.valor_total || row.valor_total_bruto));

    let valorComissao = 0;
    let percentualPonderadoNumerador = 0;
    let percentualPonderadoDenominador = 0;
    const regraNomes = new Set<string>();
    const tipoPacotes = new Set<string>();

    for (const receipt of recibos) {
      if (receipt?.tipo_pacote) tipoPacotes.add(String(receipt.tipo_pacote));
      const receiptId = String(receipt?.id || '').trim();
      const receiptCommission = receiptId ? receiptsById.get(receiptId) : undefined;
      if (!receiptCommission) continue;

      valorComissao += receiptCommission.valorComissao;
      percentualPonderadoNumerador += receiptCommission.percentual * receiptCommission.valorComissionavel;
      percentualPonderadoDenominador += receiptCommission.valorComissionavel;
      regraNomes.add(receiptCommission.regraNome);
    }

    const percentual =
      percentualPonderadoDenominador > 0
        ? roundMoney(percentualPonderadoNumerador / percentualPonderadoDenominador)
        : 0;

    const regraNome =
      regraNomes.size === 0
        ? 'Sem regra'
        : regraNomes.size === 1
          ? Array.from(regraNomes)[0]
          : `Múltiplas regras (${regraNomes.size})`;

    const tipoPacote =
      tipoPacotes.size === 0
        ? null
        : tipoPacotes.size === 1
          ? Array.from(tipoPacotes)[0]
          : 'Multiplos';

    resolved.set(row.id, {
      valorVenda,
      valorComissionavel,
      percentual,
      valorComissao: roundMoney(valorComissao),
      regraId: null,
      regraNome,
      tipoPacote
    });
  }

  return resolved;
}

function groupRowsByVendedorPeriod(rows: ReportVendaRow[]): ReportVendaRow[][] {
  const groups = new Map<string, ReportVendaRow[]>();
  for (const row of rows) {
    const key = getCommissionGroupKey(row);
    const current = groups.get(key) || [];
    current.push(row);
    groups.set(key, current);
  }
  return Array.from(groups.values());
}

export async function resolveGroupedVendaCommissions(
  client: DataClient,
  params: {
    companyIds?: string[];
    rows: ReportVendaRow[];
  }
): Promise<Map<string, ResolvedVendaCommission>> {
  const result = new Map<string, ResolvedVendaCommission>();
  const companyIds = uniqueIds(params.companyIds || []);

  const groupResults = await Promise.all(
    groupRowsByVendedorPeriod(params.rows || []).map(async (groupRows) => {
      const vendedorIds = uniqueIds(groupRows.map((row) => row.vendedor_id));
      const periodo = getCommissionPeriod(groupRows[0]);
      const context = await fetchCommissionContext(client, {
        companyIds,
        vendedorIds,
        periodo,
        rows: groupRows
      });
      return resolveVendaCommissions(groupRows, context);
    })
  );
  for (const groupResolved of groupResults) {
    for (const [vendaId, commission] of groupResolved.entries()) {
      result.set(vendaId, commission);
    }
  }

  return result;
}

export async function resolveGroupedReceiptCommissions(
  client: DataClient,
  params: {
    companyIds?: string[];
    rows: ReportVendaRow[];
  }
): Promise<Map<string, ResolvedReceiptCommission>> {
  const result = new Map<string, ResolvedReceiptCommission>();
  const companyIds = uniqueIds(params.companyIds || []);

  const groupResults = await Promise.all(
    groupRowsByVendedorPeriod(params.rows || []).map(async (groupRows) => {
      const vendedorIds = uniqueIds(groupRows.map((row) => row.vendedor_id));
      const periodo = getCommissionPeriod(groupRows[0]);
      const context = await fetchCommissionContext(client, {
        companyIds,
        vendedorIds,
        periodo,
        rows: groupRows
      });
      return resolveReceiptCommissions(groupRows, context);
    })
  );
  for (const groupResolved of groupResults) {
    for (const [receiptId, commission] of groupResolved.entries()) {
      result.set(receiptId, commission);
    }
  }

  return result;
}

// ---------------------------------------------------------------------------
// resolveVendaCommission — calcula comissão por recibo individual
// Usado na montagem do response do endpoint /relatorios/vendas
// ---------------------------------------------------------------------------

export function resolveVendaCommission(
  row: Pick<
    ReportVendaRow,
    | 'company_id'
    | 'valor_total'
    | 'valor_total_bruto'
    | 'valor_total_pago'
    | 'valor_nao_comissionado'
    | 'desconto_comercial_valor'
    | 'data_venda'
    | 'vendedor_id'
    | 'recibos'
  >,
  context: CommissionContext
): ResolvedVendaCommission {
  const { params } = context;

  const recibos = (Array.isArray(row.recibos) ? row.recibos : []).filter(
    (r) => !r?.cancelado_por_conciliacao_em
  );

  const totalBrutoVendaBase = recibos.reduce((sum, r) => sum + getBrutoRecibo(r), 0);
  const naoComissionado = toNum(row.valor_nao_comissionado || 0);
  const valorComissionavel = Math.max(0, roundMoney(totalBrutoVendaBase - naoComissionado));
  const fatorComissionavel =
    totalBrutoVendaBase > 0 ? Math.max(0, Math.min(1, valorComissionavel / totalBrutoVendaBase)) : 1;

  const valorVenda =
    recibos.length > 0
      ? roundMoney(totalBrutoVendaBase)
      : roundMoney(toNum(row.valor_total || row.valor_total_bruto));

  let valorComissao = 0;
  let percentualPonderadoNumerador = 0;
  let percentualPonderadoDenominador = 0;
  const regraIds = new Set<string>();
  const regraNomes = new Set<string>();
  const tipoPacotes = new Set<string>();

  // Roda o mesmo algoritmo de calcularComissaoRows mas para esta venda isolada
  const baseMetaPorProduto: Record<string, number> = {};
  const baseComPorProduto: Record<string, number> = {};
  let baseMetaTotal = 0;
  const bucketTotals: Record<string, BucketEntry & { receiptIds: string[] }> = {};
  const receiptToBucket = new Map<string, string>();

  for (const receipt of recibos) {
    if (!receipt) continue;

    const reciboComFator = {
      ...receipt,
      valor_comissionavel:
        receipt.valor_comissionavel != null
          ? receipt.valor_comissionavel
          : getBrutoRecibo(receipt) * fatorComissionavel
    };

    const prodId = getProdId(reciboComFator);
    if (!prodId) continue;

    const produto = getProduto(context, reciboComFator);
    if (!produto) continue;

    const liquidoBaseComissao = getLiquidoBaseComissaoRecibo(reciboComFator);
    const valParaMeta = getMetaRecibo(reciboComFator, params);

    baseMetaPorProduto[prodId] = (baseMetaPorProduto[prodId] || 0) + valParaMeta;
    if (produto.soma_na_meta) baseMetaTotal += valParaMeta;
    baseComPorProduto[prodId] = (baseComPorProduto[prodId] || 0) + liquidoBaseComissao;

    const tipoPacoteKey = normalizeTipoPacoteRuleKey(receipt.tipo_pacote || '');
    const isConciliacao = hasConciliacaoOverride(reciboComFator);
    const percentualComissaoLoja =
      receipt.percentual_comissao_loja != null ? toNum(receipt.percentual_comissao_loja) : null;
    const faixaComissao = receipt.faixa_comissao || null;

    const bucketKey = [
      prodId,
      tipoPacoteKey || 'default',
      isConciliacao ? 'conciliacao' : 'base',
      isConciliacao ? (faixaComissao || 'sem-faixa') : 'sem-faixa',
      isConciliacao && percentualComissaoLoja != null
        ? String(percentualComissaoLoja)
        : 'sem-pct-loja'
    ].join('::');

    if (!bucketTotals[bucketKey]) {
      bucketTotals[bucketKey] = {
        prodId,
        tipoPacoteKey,
        baseCom: 0,
        isConciliacao,
        percentualComissaoLoja,
        faixaComissao,
        isSeguro: isSeguroRecibo(reciboComFator),
        receiptIds: []
      };
    }
    bucketTotals[bucketKey].baseCom += liquidoBaseComissao;
    const receiptId = String(receipt.id || '').trim();
    if (receiptId) {
      bucketTotals[bucketKey].receiptIds.push(receiptId);
      receiptToBucket.set(receiptId, bucketKey);
    }
  }

  // pctMetaGeral desta venda (usa metaPlanejada do contexto)
  const pctMetaGeral =
    context.metaPlanejada > 0 ? (baseMetaTotal / context.metaPlanejada) * 100 : 0;

  // Calcula por bucket
  for (const [, bucket] of Object.entries(bucketTotals)) {
    if (bucket.baseCom <= 0) continue;
    const produto = context.tipoProdutoMap[bucket.prodId];
    if (!produto) continue;

    const baseMetaProduto = baseMetaPorProduto[bucket.prodId] || 0;
    const regraPacoteSelecionada = getRegraPacote(context, bucket.prodId, bucket.tipoPacoteKey, produto);
    const regraPacote = regraPacoteSelecionada?.regra;
    const regraProdBase = getRegraProduto(context, bucket.prodId, produto);
    let regraProd: RegraProduto | undefined = regraPacote || regraProdBase;

    if (bucket.isConciliacao && hasConciliacaoCommissionRule(params)) {
      const selection = resolveConciliacaoCommissionSelection(params, {
        faixa_comissao: bucket.faixaComissao,
        percentual_comissao_loja: bucket.percentualComissaoLoja,
        is_seguro_viagem: bucket.isSeguro
      });
      if (selection.kind === 'CONCILIACAO' && selection.rule) {
        const pct = calcularPctPorRegra(selection.rule, pctMetaGeral);
        valorComissao += bucket.baseCom * (pct / 100);
        percentualPonderadoNumerador += pct * bucket.baseCom;
        percentualPonderadoDenominador += bucket.baseCom;
        regraIds.add(selection.rule.id);
        regraNomes.add('Conciliação');
        continue;
      }
    }

    if (produto.regra_comissionamento === 'diferenciado') {
      if (!regraProd) continue;
      const metaProdValor = context.metaProdutoMap[bucket.prodId] || 0;
      const temMetaProd = metaProdValor > 0;
      const pctMetaProd = temMetaProd ? (baseMetaProduto / metaProdValor) * 100 : 0;
      const pctRef = temMetaProd ? pctMetaProd : pctMetaGeral;
      const pct = calcularPctFixoProduto(regraProd, pctRef);
      valorComissao += bucket.baseCom * (pct / 100);
      percentualPonderadoNumerador += pct * bucket.baseCom;
      percentualPonderadoDenominador += bucket.baseCom;
      if (regraProd.rule_id) regraIds.add(regraProd.rule_id);
      regraNomes.add('Diferenciado');
      continue;
    }

    let pct = 0;
    let usouFixo = false;

    if (regraProd && regraProdutoTemFixo(regraProd)) {
      pct = calcularPctFixoProduto(regraProd, pctMetaGeral);
      usouFixo = true;
    } else if (regraProd && !regraProd.rule_id && regraPacote && regraProd === regraPacote) {
      regraProd = regraProdBase;
    }

    if (!usouFixo) {
      const regraId = regraProd?.rule_id;
      const regra = regraId ? context.regrasMap[regraId] : undefined;
      if (!regra) continue;
      pct = calcularPctPorRegra(regra, pctMetaGeral);
      if (regraId) regraIds.add(regraId);
      regraNomes.add('Geral');
    } else {
      regraNomes.add('Fixo');
    }

    if (
      produto.usa_meta_produto &&
      toNum(produto.meta_produto_valor) > 0 &&
      toNum(produto.comissao_produto_meta_pct) > 0
    ) {
      const atingiu = baseMetaProduto >= toNum(produto.meta_produto_valor);
      if (atingiu) {
        const baseComProd = baseComPorProduto[bucket.prodId] || 0;
        if (baseComProd > 0) {
          const valMeta = baseComProd * (toNum(produto.comissao_produto_meta_pct) / 100);
          const valGeral = baseComProd * (pct / 100);
          const diff =
            produto.descontar_meta_geral === false ? valMeta : Math.max(valMeta - valGeral, 0);
          if (diff > 0) pct += (diff / baseComProd) * 100;
        }
      }
    }

    if (pct > 0) {
      valorComissao += bucket.baseCom * (pct / 100);
      percentualPonderadoNumerador += pct * bucket.baseCom;
      percentualPonderadoDenominador += bucket.baseCom;
    }
  }

  // Referência para tipo_pacote — pega do primeiro recibo com tipo_pacote
  for (const receipt of recibos) {
    if (receipt?.tipo_pacote) tipoPacotes.add(String(receipt.tipo_pacote));
  }

  const percentual =
    percentualPonderadoDenominador > 0
      ? roundMoney(percentualPonderadoNumerador / percentualPonderadoDenominador)
      : 0;

  const regraNome =
    regraNomes.size === 0
      ? 'Sem regra'
      : regraNomes.size === 1
        ? Array.from(regraNomes)[0]
        : `Múltiplas regras (${regraNomes.size})`;

  const tipoPacote =
    tipoPacotes.size === 0
      ? null
      : tipoPacotes.size === 1
        ? Array.from(tipoPacotes)[0]
        : 'Multiplos';

  return {
    valorVenda,
    valorComissionavel,
    percentual,
    valorComissao: roundMoney(valorComissao),
    regraId: regraIds.size === 1 ? Array.from(regraIds)[0] : null,
    regraNome,
    tipoPacote
  };
}
