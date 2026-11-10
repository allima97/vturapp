/**
 * Utilitários de Comissão — vtur-svelte
 *
 * Portabilizado FIELMENTE do vtur-app (src/lib/comissaoUtils.ts).
 * NÃO alterar a lógica de negócio sem sincronizar com o vtur-app.
 *
 * REGRAS DE NEGÓCIO CORE:
 *  - Regras GERAL: percentuais fixos por faixa de meta (pctMeta < 100 / 100-120 / ≥120)
 *  - Regras ESCALONAVEL: faixas PRE (pré-meta) e POS (pós-meta) com incrementos
 *  - Faixas de conciliação: MENOR_10 / MAIOR_OU_IGUAL_10 / SEGURO_32_35 / SEM_COMISSAO
 *  - Produto com fix_meta_atingida > 0 sobrescreve qualquer regra
 *  - Tipo de pacote com rule_id sobrescreve regra padrão da empresa
 */

// ---------------------------------------------------------------------------
// TIPOS (portabilizados do vtur-app comissaoUtils.ts)
// ---------------------------------------------------------------------------

const BRL_CURRENCY_FORMATTER = new Intl.NumberFormat('pt-BR', {
  style: 'currency',
  currency: 'BRL'
});
const PT_BR_COLLATOR = new Intl.Collator('pt-BR');

export type Tier = {
  faixa: 'PRE' | 'POS';
  de_pct: number;
  ate_pct: number;
  inc_pct_meta: number;
  inc_pct_comissao: number;
};

export type Regra = {
  id: string;
  tipo: 'GERAL' | 'ESCALONAVEL';
  meta_nao_atingida: number | null;
  meta_atingida: number | null;
  super_meta: number | null;
  commission_tier?: Tier[];
};

export type RegraProduto = {
  produto_id: string;
  rule_id: string | null;
  fix_meta_nao_atingida: number | null;
  fix_meta_atingida: number | null;
  fix_super_meta: number | null;
};

export const LEGACY_CONCILIACAO_COMMISSION_BAND_KEYS = [
  'MENOR_10',
  'MAIOR_OU_IGUAL_10',
  'SEGURO_32_35'
] as const;

export type ConciliacaoCommissionBandKey = (typeof LEGACY_CONCILIACAO_COMMISSION_BAND_KEYS)[number];

export type ConciliacaoCommissionBandId = string;

export type ConciliacaoCommissionBandMode = 'CONCILIACAO' | 'PRODUTO_DIFERENCIADO';

export type ConciliacaoCommissionBandRule = {
  faixa_loja: ConciliacaoCommissionBandId;
  nome: string;
  percentual_min: number | null;
  percentual_max: number | null;
  ordem: number;
  ativo: boolean;
  tipo_calculo: ConciliacaoCommissionBandMode;
  tipo: 'GERAL' | 'ESCALONAVEL';
  meta_nao_atingida: number | null;
  meta_atingida: number | null;
  super_meta: number | null;
  tiers: Tier[];
};

export type ParametrosComissao = {
  usar_taxas_na_meta: boolean;
  foco_valor?: 'bruto' | 'liquido';
  foco_faturamento?: 'bruto' | 'liquido';
  conciliacao_sobrepoe_vendas?: boolean;
  conciliacao_regra_ativa?: boolean;
  conciliacao_tipo?: 'GERAL' | 'ESCALONAVEL';
  conciliacao_meta_nao_atingida?: number | null;
  conciliacao_meta_atingida?: number | null;
  conciliacao_super_meta?: number | null;
  conciliacao_tiers?: Tier[] | null;
  conciliacao_faixas_loja?: ConciliacaoCommissionBandRule[] | null;
};

export type ConciliacaoCommissionSelection =
  | {
      kind: 'CONCILIACAO';
      bandKey: ConciliacaoCommissionBandId;
      rule: Regra;
    }
  | {
      kind: 'PRODUTO_DIFERENCIADO';
      bandKey: ConciliacaoCommissionBandId;
      rule: null;
    }
  | {
      kind: 'NONE';
      bandKey: ConciliacaoCommissionBandId;
      rule: null;
    };

// Tipo legado compatível com o store de comissões
export type StatusComissao = 'PENDENTE' | 'PROCESSANDO' | 'PAGA' | 'CANCELADA';

export interface Comissao {
  id: string;
  vendedor_id: string;
  vendedor?: string;
  valor_comissao: number;
  status: StatusComissao;
  [key: string]: unknown;
}

export interface RegraComissao extends Regra {
  nome: string;
  descricao?: string;
  ativo: boolean;
  tiers?: Tier[];
}

export type TierComissao = Tier;

// ---------------------------------------------------------------------------
// CONSTANTES INTERNAS
// ---------------------------------------------------------------------------

type DefaultBandDefinition = {
  faixa_loja: ConciliacaoCommissionBandKey;
  nome: string;
  percentual_min: number | null;
  percentual_max: number | null;
  ordem: number;
  tipo_calculo: ConciliacaoCommissionBandMode;
};

const DEFAULT_BAND_DEFINITIONS: DefaultBandDefinition[] = [
  {
    faixa_loja: 'MENOR_10',
    nome: 'Menor que 10%',
    percentual_min: null,
    percentual_max: 9.9999,
    ordem: 10,
    tipo_calculo: 'CONCILIACAO'
  },
  {
    faixa_loja: 'MAIOR_OU_IGUAL_10',
    nome: 'Igual ou maior que 10%',
    percentual_min: 10,
    percentual_max: 31.9999,
    ordem: 20,
    tipo_calculo: 'CONCILIACAO'
  },
  {
    faixa_loja: 'SEGURO_32_35',
    nome: 'Igual ou maior que 32%',
    percentual_min: 32,
    percentual_max: null,
    ordem: 30,
    tipo_calculo: 'PRODUTO_DIFERENCIADO'
  }
];

// ---------------------------------------------------------------------------
// HELPERS INTERNOS
// ---------------------------------------------------------------------------

function normalizeBandId(value: unknown): string {
  return String(value ?? '')
    .trim()
    .normalize('NFD')
    .replace(/\p{Diacritic}/gu, '')
    .replace(/[^a-zA-Z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '')
    .toUpperCase();
}

function normalizeBandName(value: unknown): string {
  const text = String(value ?? '').trim();
  return text || 'Nova faixa';
}

function parseNullableNumber(value: unknown): number | null {
  if (value == null || value === '') return null;
  const num = Number(value);
  return Number.isFinite(num) ? num : null;
}

function normalizeBandKey(value?: string | null): ConciliacaoCommissionBandKey | null {
  const normalized = normalizeBandId(value);
  if (!normalized) return null;
  if (normalized === 'MENOR_10') return 'MENOR_10';
  if (normalized === 'MAIOR_OU_IGUAL_10') return 'MAIOR_OU_IGUAL_10';
  if (
    normalized === 'SEGURO_32_35' ||
    normalized === 'MAIOR_OU_IGUAL_32' ||
    normalized === 'MAIOR_OU_IGUAL_35'
  ) {
    return 'SEGURO_32_35';
  }
  return null;
}

function getDefaultBandDefinition(key?: string | null): DefaultBandDefinition | null {
  const normalized = normalizeBandKey(key);
  if (!normalized) return null;
  return DEFAULT_BAND_DEFINITIONS.find((item) => item.faixa_loja === normalized) || null;
}

function sanitizeTier(tier: unknown): Tier | null {
  const t = tier as Record<string, unknown> | null;
  const faixa = String(t?.faixa || '')
    .trim()
    .toUpperCase();
  if (faixa !== 'PRE' && faixa !== 'POS') return null;

  const dePct = Number(t?.de_pct ?? 0);
  const atePct = Number(t?.ate_pct ?? 0);
  const incMeta = Number(t?.inc_pct_meta ?? 0);
  const incCom = Number(t?.inc_pct_comissao ?? 0);
  if (![dePct, atePct, incMeta, incCom].every(Number.isFinite)) return null;

  return {
    faixa: faixa as 'PRE' | 'POS',
    de_pct: dePct,
    ate_pct: atePct,
    inc_pct_meta: incMeta,
    inc_pct_comissao: incCom
  };
}

function hasRuleValues(definition: {
  meta_nao_atingida?: number | null;
  meta_atingida?: number | null;
  super_meta?: number | null;
  tiers?: Tier[] | null;
}): boolean {
  return (
    definition.meta_nao_atingida != null ||
    definition.meta_atingida != null ||
    definition.super_meta != null ||
    (Array.isArray(definition.tiers) && definition.tiers.length > 0)
  );
}

function buildRuleFromDefinition(params: {
  id: string;
  tipo?: 'GERAL' | 'ESCALONAVEL';
  meta_nao_atingida?: number | null;
  meta_atingida?: number | null;
  super_meta?: number | null;
  tiers?: Tier[] | null;
}): Regra | null {
  const tipo = params.tipo === 'ESCALONAVEL' ? 'ESCALONAVEL' : 'GERAL';
  const tiers = Array.isArray(params.tiers)
    ? params.tiers.map(sanitizeTier).filter((item): item is Tier => Boolean(item))
    : [];

  if (!hasRuleValues({ ...params, tiers })) return null;
  if (tipo === 'ESCALONAVEL' && tiers.length === 0 && !hasRuleValues(params)) return null;

  return {
    id: params.id,
    tipo,
    meta_nao_atingida: params.meta_nao_atingida ?? 0,
    meta_atingida: params.meta_atingida ?? params.meta_nao_atingida ?? 0,
    super_meta: params.super_meta ?? params.meta_atingida ?? params.meta_nao_atingida ?? 0,
    commission_tier: tiers
  };
}

function isBandRangeMatch(
  rule: Pick<ConciliacaoCommissionBandRule, 'percentual_min' | 'percentual_max'>,
  percentual?: number | null
): boolean {
  const pct = Number(percentual ?? 0);
  if (!Number.isFinite(pct) || pct <= 0) return false;
  const min = rule.percentual_min;
  const max = rule.percentual_max;
  if (min != null && pct < min) return false;
  if (max != null && pct > max) return false;
  return true;
}

function sortBandRules(rules: ConciliacaoCommissionBandRule[]): ConciliacaoCommissionBandRule[] {
  return [...rules].sort((left, right) => {
    if (left.ordem !== right.ordem) return left.ordem - right.ordem;
    const leftMin = left.percentual_min ?? Number.NEGATIVE_INFINITY;
    const rightMin = right.percentual_min ?? Number.NEGATIVE_INFINITY;
    if (leftMin !== rightMin) return leftMin - rightMin;
    return PT_BR_COLLATOR.compare(left.nome, right.nome);
  });
}

// ---------------------------------------------------------------------------
// FUNÇÕES EXPORTADAS — PORTABILIZADAS FIELMENTE DO vtur-app
// ---------------------------------------------------------------------------

/**
 * Constrói regra de comissão para conciliação a partir de parâmetros legados.
 * Retorna null se conciliacao_regra_ativa === false.
 */
export function buildLegacyConciliacaoRule(params?: ParametrosComissao | null): Regra | null {
  if (!params?.conciliacao_regra_ativa) return null;
  return buildRuleFromDefinition({
    id: 'conciliacao',
    tipo: params.conciliacao_tipo,
    meta_nao_atingida: params.conciliacao_meta_nao_atingida ?? null,
    meta_atingida: params.conciliacao_meta_atingida ?? null,
    super_meta: params.conciliacao_super_meta ?? null,
    tiers: Array.isArray(params.conciliacao_tiers) ? params.conciliacao_tiers : []
  });
}

/** Alias de buildLegacyConciliacaoRule */
export function buildConciliacaoRule(params?: ParametrosComissao | null): Regra | null {
  return buildLegacyConciliacaoRule(params);
}

/**
 * Cria as 3 faixas de conciliação padrão com as regras correspondentes.
 * SEGURO_32_35 é sempre PRODUTO_DIFERENCIADO (sem comissão standard).
 */
export function createDefaultConciliacaoBandRules(
  params?: ParametrosComissao | null
): ConciliacaoCommissionBandRule[] {
  const legacyTipo = params?.conciliacao_tipo === 'ESCALONAVEL' ? 'ESCALONAVEL' : 'GERAL';
  const legacyRule = buildLegacyConciliacaoRule(params);
  const legacyTiers = Array.isArray(params?.conciliacao_tiers)
    ? params!.conciliacao_tiers!.map(sanitizeTier).filter((item): item is Tier => Boolean(item))
    : [];

  return DEFAULT_BAND_DEFINITIONS.map((definition) => ({
    faixa_loja: definition.faixa_loja,
    nome: definition.nome,
    percentual_min: definition.percentual_min,
    percentual_max: definition.percentual_max,
    ordem: definition.ordem,
    ativo: definition.tipo_calculo === 'PRODUTO_DIFERENCIADO' ? true : Boolean(legacyRule),
    tipo_calculo: definition.tipo_calculo,
    tipo: definition.tipo_calculo === 'PRODUTO_DIFERENCIADO' ? 'GERAL' : legacyTipo,
    meta_nao_atingida:
      definition.tipo_calculo === 'PRODUTO_DIFERENCIADO'
        ? null
        : (params?.conciliacao_meta_nao_atingida ?? null),
    meta_atingida:
      definition.tipo_calculo === 'PRODUTO_DIFERENCIADO'
        ? null
        : (params?.conciliacao_meta_atingida ?? null),
    super_meta:
      definition.tipo_calculo === 'PRODUTO_DIFERENCIADO'
        ? null
        : (params?.conciliacao_super_meta ?? null),
    tiers: definition.tipo_calculo === 'PRODUTO_DIFERENCIADO' ? [] : legacyTiers
  }));
}

/**
 * Sanitiza e normaliza a lista de faixas de conciliação.
 * Mescla faixas customizadas com os defaults quando necessário.
 */
export function sanitizeConciliacaoBandRules(
  value: unknown,
  params?: ParametrosComissao | null
): ConciliacaoCommissionBandRule[] {
  const defaults = createDefaultConciliacaoBandRules(params);
  if (!Array.isArray(value) || value.length === 0) {
    return sortBandRules(defaults);
  }

  const sanitized = (value as unknown[])
    .map((item: unknown, index) => {
      const i = item as Record<string, unknown> | null;
      const legacyDefinition = getDefaultBandDefinition(i?.faixa_loja as string);
      const normalizedId =
        normalizeBandId(i?.faixa_loja) || normalizeBandId(i?.id) || `FAIXA_${index + 1}`;
      const base =
        defaults.find((entry) => normalizeBandId(entry.faixa_loja) === normalizedId) ||
        (legacyDefinition
          ? defaults.find((entry) => entry.faixa_loja === legacyDefinition.faixa_loja)
          : null);
      const tipoCalculo =
        String(i?.tipo_calculo || '')
          .trim()
          .toUpperCase() === 'PRODUTO_DIFERENCIADO'
          ? 'PRODUTO_DIFERENCIADO'
          : 'CONCILIACAO';
      const tipo =
        String(i?.tipo || '')
          .trim()
          .toUpperCase() === 'ESCALONAVEL'
          ? 'ESCALONAVEL'
          : 'GERAL';
      const tiers = Array.isArray(i?.tiers)
        ? (i!.tiers as unknown[]).map(sanitizeTier).filter((tier): tier is Tier => Boolean(tier))
        : base?.tiers || [];

      return {
        faixa_loja: normalizedId,
        nome: normalizeBandName(i?.nome ?? legacyDefinition?.nome ?? base?.nome ?? i?.faixa_loja),
        percentual_min:
          parseNullableNumber(i?.percentual_min) ??
          legacyDefinition?.percentual_min ??
          base?.percentual_min ??
          null,
        percentual_max:
          parseNullableNumber(i?.percentual_max) ??
          legacyDefinition?.percentual_max ??
          base?.percentual_max ??
          null,
        ordem: Number.isFinite(Number(i?.ordem))
          ? Number(i!.ordem)
          : (base?.ordem ?? (index + 1) * 10),
        ativo: i?.ativo == null ? (base?.ativo ?? true) : Boolean(i.ativo),
        tipo_calculo: tipoCalculo as ConciliacaoCommissionBandMode,
        tipo: tipo as 'GERAL' | 'ESCALONAVEL',
        meta_nao_atingida:
          i?.meta_nao_atingida != null
            ? Number(i.meta_nao_atingida)
            : (base?.meta_nao_atingida ?? null),
        meta_atingida:
          i?.meta_atingida != null ? Number(i.meta_atingida) : (base?.meta_atingida ?? null),
        super_meta: i?.super_meta != null ? Number(i.super_meta) : (base?.super_meta ?? null),
        tiers
      } satisfies ConciliacaoCommissionBandRule;
    })
    .filter((item) => item.nome);

  return sortBandRules(sanitized);
}

/**
 * Verifica se há faixas de conciliação ativas configuradas.
 */
export function hasConciliacaoBandRules(params?: ParametrosComissao | null): boolean {
  if (!params?.conciliacao_regra_ativa) return false;
  if (
    !Array.isArray(params.conciliacao_faixas_loja) ||
    params.conciliacao_faixas_loja.length === 0
  ) {
    return false;
  }
  return sanitizeConciliacaoBandRules(params.conciliacao_faixas_loja, params).some(
    (item) => item.ativo
  );
}

/**
 * Resolve a chave de faixa de conciliação para um registro.
 *
 * REGRAS DE PRIORIDADE:
 * 1. Se há faixas customizadas → usa range match (percentual_min/max)
 * 2. Se faixa_comissao já está preenchida → usa diretamente
 * 3. Fallback por percentual_comissao_loja:
 *    - is_seguro_viagem ou percentual >= 32% → SEGURO_32_35
 *    - percentual >= 10% → MAIOR_OU_IGUAL_10
 *    - default → MENOR_10
 */
export function resolveConciliacaoBandKey(params: {
  conciliacao_faixas_loja?: ConciliacaoCommissionBandRule[] | null;
  faixa_comissao?: string | null;
  percentual_comissao_loja?: number | null;
  is_seguro_viagem?: boolean | null;
}): ConciliacaoCommissionBandId {
  const customRules = Array.isArray(params.conciliacao_faixas_loja)
    ? sortBandRules(sanitizeConciliacaoBandRules(params.conciliacao_faixas_loja))
    : [];

  if (customRules.length > 0) {
    const matched = customRules.find(
      (item) => item.ativo && isBandRangeMatch(item, params.percentual_comissao_loja)
    );
    if (matched) return matched.faixa_loja;
  }

  const explicitId = normalizeBandId(params.faixa_comissao);
  if (explicitId) {
    const exact = customRules.find((item) => normalizeBandId(item.faixa_loja) === explicitId);
    if (exact) return exact.faixa_loja;

    const legacy = normalizeBandKey(params.faixa_comissao);
    if (legacy) return legacy;
  }

  const percentual = Number(params.percentual_comissao_loja || 0);
  if (params.is_seguro_viagem || percentual >= 32) {
    return 'SEGURO_32_35';
  }
  if (percentual >= 10) {
    return 'MAIOR_OU_IGUAL_10';
  }
  return 'MENOR_10';
}

/**
 * Retorna a regra de comissão completa para a faixa de conciliação
 * correspondente ao percentual e flags do registro.
 */
export function resolveConciliacaoBandRule(
  params: ParametrosComissao | null | undefined,
  options?: {
    faixa_comissao?: string | null;
    percentual_comissao_loja?: number | null;
    is_seguro_viagem?: boolean | null;
  }
): ConciliacaoCommissionBandRule | null {
  if (!params) return null;
  const rules = sanitizeConciliacaoBandRules(params.conciliacao_faixas_loja, params);
  if (rules.length === 0) return null;

  const bandKey = resolveConciliacaoBandKey({
    conciliacao_faixas_loja: params.conciliacao_faixas_loja,
    faixa_comissao: options?.faixa_comissao ?? null,
    percentual_comissao_loja: options?.percentual_comissao_loja ?? null,
    is_seguro_viagem: options?.is_seguro_viagem ?? null
  });

  return (
    rules.find((item) => normalizeBandId(item.faixa_loja) === normalizeBandId(bandKey)) || null
  );
}

/**
 * Resolve qual regra de comissão usar para um registro de conciliação.
 * Retorna: CONCILIACAO (tem regra), PRODUTO_DIFERENCIADO (sem regra padrão) ou NONE (inativo).
 */
export function resolveConciliacaoCommissionSelection(
  params: ParametrosComissao | null | undefined,
  options?: {
    faixa_comissao?: string | null;
    percentual_comissao_loja?: number | null;
    is_seguro_viagem?: boolean | null;
  }
): ConciliacaoCommissionSelection {
  const bandKey = resolveConciliacaoBandKey({
    conciliacao_faixas_loja: params?.conciliacao_faixas_loja ?? null,
    faixa_comissao: options?.faixa_comissao ?? null,
    percentual_comissao_loja: options?.percentual_comissao_loja ?? null,
    is_seguro_viagem: options?.is_seguro_viagem ?? null
  });

  if (!params?.conciliacao_regra_ativa) {
    return { kind: 'NONE', bandKey, rule: null };
  }

  const hasCustomBands =
    Array.isArray(params.conciliacao_faixas_loja) && params.conciliacao_faixas_loja.length > 0;

  if (hasCustomBands) {
    const band = resolveConciliacaoBandRule(params, options);
    if (!band || !band.ativo) {
      return { kind: 'NONE', bandKey, rule: null };
    }
    if (band.tipo_calculo === 'PRODUTO_DIFERENCIADO') {
      return { kind: 'PRODUTO_DIFERENCIADO', bandKey, rule: null };
    }
    const rule = buildRuleFromDefinition({
      id: `conciliacao-${band.faixa_loja.toLowerCase()}`,
      tipo: band.tipo,
      meta_nao_atingida: band.meta_nao_atingida,
      meta_atingida: band.meta_atingida,
      super_meta: band.super_meta,
      tiers: band.tiers
    });
    return rule ? { kind: 'CONCILIACAO', bandKey, rule } : { kind: 'NONE', bandKey, rule: null };
  }

  if (bandKey === 'SEGURO_32_35') {
    return { kind: 'PRODUTO_DIFERENCIADO', bandKey, rule: null };
  }

  const legacyRule = buildLegacyConciliacaoRule(params);
  return legacyRule
    ? { kind: 'CONCILIACAO', bandKey, rule: legacyRule }
    : { kind: 'NONE', bandKey, rule: null };
}

/** Verifica se há alguma regra de comissão ativa para conciliação. */
export function hasConciliacaoCommissionRule(params?: ParametrosComissao | null): boolean {
  if (!params?.conciliacao_regra_ativa) return false;
  return hasConciliacaoBandRules(params) || Boolean(buildLegacyConciliacaoRule(params));
}

/**
 * Calcula o percentual de comissão para um registro de conciliação.
 * @param params Parâmetros da empresa
 * @param pctMeta Percentual de meta atingida (0-200+)
 * @param options Dados do registro de conciliação
 */
export function calcularPctConciliacao(
  params: ParametrosComissao | null | undefined,
  pctMeta: number,
  options?: {
    faixa_comissao?: string | null;
    percentual_comissao_loja?: number | null;
    is_seguro_viagem?: boolean | null;
  }
): number {
  const selection = resolveConciliacaoCommissionSelection(params, options);
  if (selection.kind !== 'CONCILIACAO' || !selection.rule) return 0;
  return calcularPctPorRegra(selection.rule, pctMeta);
}

/**
 * Calcula o percentual de comissão para uma regra ESCALONAVEL.
 *
 * LÓGICA:
 * - pctMeta < 100 → faixa PRE (pré-meta)
 * - pctMeta >= 100 → faixa POS (pós-meta)
 * - Para cada faixa: busca o tier cujo range [de_pct, ate_pct] contém pctMeta
 * - Aplica: base + Math.floor((pctMeta - de_pct) / inc_pct_meta) * (inc_pct_comissao / 100)
 * - Se pctMeta >= 120 e sem tier: usa super_meta
 */
export function calcularPctEscalonavel(regra: Regra, pctMeta: number): number {
  const faixa = pctMeta >= 100 ? 'POS' : 'PRE';
  const base =
    faixa === 'PRE'
      ? (regra.meta_nao_atingida ?? regra.meta_atingida ?? 0)
      : (regra.meta_atingida ?? regra.meta_nao_atingida ?? 0);

  const tier = (regra.commission_tier || [])
    .filter((t) => t.faixa === faixa)
    .find((t) => {
      const valor = Number(pctMeta || 0);
      return valor >= t.de_pct && valor <= t.ate_pct;
    });

  if (!tier) {
    if (pctMeta >= 120) {
      return regra.super_meta ?? base;
    }
    return base;
  }

  const incMeta = Number(tier.inc_pct_meta || 0);
  const incCom = Number(tier.inc_pct_comissao || 0);

  if (incMeta <= 0) {
    return incCom || base;
  }

  const steps = Math.max(0, Math.floor((pctMeta - Number(tier.de_pct)) / incMeta));
  return base + steps * (incCom / 100);
}

/**
 * Calcula o percentual de comissão baseado na regra e no % de meta atingida.
 *
 * Para GERAL:
 *  - pctMeta < 100 → meta_nao_atingida
 *  - 100 <= pctMeta < 120 → meta_atingida
 *  - pctMeta >= 120 → super_meta (com fallback para meta_atingida)
 *
 * Para ESCALONAVEL:
 *  - Delega para calcularPctEscalonavel()
 */
export function calcularPctPorRegra(regra: Regra, pctMeta: number): number {
  if (regra.tipo === 'ESCALONAVEL') {
    return calcularPctEscalonavel(regra, pctMeta);
  }

  if (pctMeta < 100) return regra.meta_nao_atingida ?? 0;
  if (pctMeta >= 120) {
    return regra.super_meta ?? regra.meta_atingida ?? regra.meta_nao_atingida ?? 0;
  }
  return regra.meta_atingida ?? regra.meta_nao_atingida ?? 0;
}

/**
 * Verifica se um tipo de produto tem percentual FIXO configurado.
 * Se true, os valores fix_* devem sobrescrever qualquer regra de comissão.
 */
export function regraProdutoTemFixo(regra?: RegraProduto | null): boolean {
  if (!regra) return false;
  return (
    regra.fix_meta_nao_atingida != null ||
    regra.fix_meta_atingida != null ||
    regra.fix_super_meta != null
  );
}

/**
 * Calcula o percentual FIXO para um produto, baseado no status de meta.
 * Usar somente quando regraProdutoTemFixo() retornar true.
 */
export function calcularPctFixoProduto(regra: RegraProduto, pctMeta: number): number {
  const fixNao =
    regra.fix_meta_nao_atingida ?? regra.fix_meta_atingida ?? regra.fix_super_meta ?? 0;
  const fixAt = regra.fix_meta_atingida ?? regra.fix_meta_nao_atingida ?? regra.fix_super_meta ?? 0;
  const fixSup =
    regra.fix_super_meta ?? regra.fix_meta_atingida ?? regra.fix_meta_nao_atingida ?? 0;

  if (pctMeta < 100) return fixNao;
  if (pctMeta >= 120) return fixSup;
  return fixAt;
}

/**
 * Calcula o desconto comercial aplicado com base nos valores da venda.
 * Retorna 0 se não há desconto identificável.
 */
export function calcularDescontoAplicado(
  totalRecibos: number,
  valorTotalBruto?: number | null,
  valorTotalPago?: number | null
): number {
  const bruto = Number(valorTotalBruto || 0);
  const pago = Number(valorTotalPago || 0);
  if (!Number.isFinite(bruto) || !Number.isFinite(pago) || bruto <= 0 || pago <= 0) {
    return 0;
  }
  const delta = bruto - pago;
  if (delta <= 0) return 0;
  const approx = (a: number, b: number) => Math.abs(a - b) <= 0.5;
  if (approx(totalRecibos, bruto)) return delta;
  if (approx(totalRecibos, pago)) return 0;
  if (totalRecibos > pago + 0.5) return delta;
  return 0;
}

// ---------------------------------------------------------------------------
// FUNÇÕES AUXILIARES (mantidas da versão anterior do svelte)
// ---------------------------------------------------------------------------

/** Calcula valor da comissão: (valorComissionavel × percentual) / 100 */
export function calcularValorComissao(valorComissionavel: number, percentual: number): number {
  if (valorComissionavel <= 0 || percentual <= 0) return 0;
  return parseFloat(((valorComissionavel * percentual) / 100).toFixed(2));
}

/** Calcula valor comissionável: valorVenda − valorNaoComissionado */
export function calcularValorComissionavel(valorVenda: number, valorNaoComissionado = 0): number {
  return Math.max(0, valorVenda - valorNaoComissionado);
}

/**
 * Determina percentual de comissão para uma regra.
 * Usa calcularPctPorRegra() para lógica correta — portabilizada do vtur-app.
 * @deprecated Use calcularPctPorRegra() diretamente com tipo Regra correto.
 */
export function determinarPercentualComissao(
  regra: RegraComissao,
  percentualMetaAtingida = 100
): number {
  if (!regra || !regra.ativo) return 0;
  return calcularPctPorRegra(regra, percentualMetaAtingida);
}

/** Formata o status da comissão para exibição */
export function formatarStatusComissao(status: StatusComissao): string {
  const labels: Record<StatusComissao, string> = {
    PENDENTE: 'Pendente',
    PROCESSANDO: 'Processando',
    PAGA: 'Paga',
    CANCELADA: 'Cancelada'
  };
  return labels[status] || status;
}

/** Retorna classe CSS para badge de status */
export function getStatusComissaoClass(status: StatusComissao): string {
  const classes: Record<StatusComissao, string> = {
    PENDENTE: 'bg-amber-100 text-amber-700',
    PROCESSANDO: 'bg-blue-100 text-blue-700',
    PAGA: 'bg-green-100 text-green-700',
    CANCELADA: 'bg-red-100 text-red-700'
  };
  return classes[status] || 'bg-gray-100 text-gray-700';
}

/** Valida se uma regra de comissão está configurada e ativa */
export function isRegraValida(regra: RegraComissao): boolean {
  if (!regra) return false;
  if (!regra.ativo) return false;
  const temPercentual =
    (regra.meta_nao_atingida || 0) > 0 ||
    (regra.meta_atingida || 0) > 0 ||
    (regra.super_meta || 0) > 0;
  return temPercentual;
}

/** Calcula resumo agregado de comissões */
export function calcularResumoComissoes(comissoes: Comissao[]) {
  return comissoes.reduce(
    (acc, c) => {
      acc.total += c.valor_comissao;
      if (c.status === 'PENDENTE') acc.pendente += c.valor_comissao;
      if (c.status === 'PAGA') acc.pago += c.valor_comissao;
      if (c.status === 'CANCELADA') acc.cancelado += c.valor_comissao;
      return acc;
    },
    { total: 0, pendente: 0, pago: 0, cancelado: 0 }
  );
}

/** Agrupa comissões por vendedor */
export function agruparComissoesPorVendedor(comissoes: Comissao[]) {
  return comissoes.reduce(
    (acc, c) => {
      const key = c.vendedor_id;
      if (!acc[key]) {
        acc[key] = {
          vendedor_id: c.vendedor_id,
          vendedor_nome: c.vendedor || 'Desconhecido',
          comissoes: [],
          total: 0,
          pendente: 0,
          pago: 0
        };
      }
      acc[key].comissoes.push(c);
      acc[key].total += c.valor_comissao;
      if (c.status === 'PENDENTE') acc[key].pendente += c.valor_comissao;
      if (c.status === 'PAGA') acc[key].pago += c.valor_comissao;
      return acc;
    },
    {} as Record<
      string,
      {
        vendedor_id: string;
        vendedor_nome: string;
        comissoes: Comissao[];
        total: number;
        pendente: number;
        pago: number;
      }
    >
  );
}

/** Formata valor monetário em BRL */
export function formatarMoeda(valor: number): string {
  return BRL_CURRENCY_FORMATTER.format(valor);
}

/** Formata percentual com 2 casas decimais */
export function formatarPercentual(valor: number): string {
  return `${valor.toFixed(2)}%`;
}

/** Sanitiza tiers para uso externo */
export function sanitizeConciliacaoTiers(tiers: unknown[]): Tier[] {
  return tiers.map(sanitizeTier).filter((t): t is Tier => t !== null);
}

/** Cria uma band rule manual para faixas customizadas */
export function createManualConciliacaoBandRule(params: {
  faixa_loja: string;
  nome: string;
  percentual_min?: number | null;
  percentual_max?: number | null;
  ordem?: number;
  tipo?: 'GERAL' | 'ESCALONAVEL';
  meta_nao_atingida?: number | null;
  meta_atingida?: number | null;
  super_meta?: number | null;
  tiers?: Tier[];
}): ConciliacaoCommissionBandRule {
  return {
    faixa_loja: normalizeBandId(params.faixa_loja),
    nome: normalizeBandName(params.nome),
    percentual_min: params.percentual_min ?? null,
    percentual_max: params.percentual_max ?? null,
    ordem: params.ordem ?? 10,
    ativo: true,
    tipo_calculo: 'CONCILIACAO',
    tipo: params.tipo ?? 'GERAL',
    meta_nao_atingida: params.meta_nao_atingida ?? null,
    meta_atingida: params.meta_atingida ?? null,
    super_meta: params.super_meta ?? null,
    tiers: params.tiers ?? []
  };
}

/** Normaliza o tipo de conciliação */
export function normalizeConciliacaoTipo(value: unknown): 'GERAL' | 'ESCALONAVEL' {
  return String(value ?? '')
    .trim()
    .toUpperCase() === 'ESCALONAVEL'
    ? 'ESCALONAVEL'
    : 'GERAL';
}
