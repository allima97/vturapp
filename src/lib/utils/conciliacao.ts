export type ConciliacaoTier = {
  faixa: 'PRE' | 'POS';
  de_pct: number;
  ate_pct: number;
  inc_pct_meta: number;
  inc_pct_comissao: number;
};

export type ConciliacaoTipoRegra = 'GERAL' | 'ESCALONAVEL';
export type ConciliacaoBandMode = 'CONCILIACAO' | 'PRODUTO_DIFERENCIADO';

export type ConciliacaoBandRule = {
  faixa_loja: string;
  nome: string;
  percentual_min: number | null;
  percentual_max: number | null;
  ordem: number;
  ativo: boolean;
  tipo_calculo: ConciliacaoBandMode;
  tipo: ConciliacaoTipoRegra;
  meta_nao_atingida: number | null;
  meta_atingida: number | null;
  super_meta: number | null;
  tiers: ConciliacaoTier[];
};

export type ParametrosConciliacaoShape = {
  usar_taxas_na_meta?: boolean;
  foco_valor?: 'bruto' | 'liquido';
  modo_corporativo?: boolean;
  politica_cancelamento?: 'cancelar_venda' | 'estornar_recibos';
  foco_faturamento?: 'bruto' | 'liquido';
  conciliacao_sobrepoe_vendas?: boolean;
  conciliacao_regra_ativa?: boolean;
  conciliacao_tipo?: ConciliacaoTipoRegra;
  conciliacao_meta_nao_atingida?: number | null;
  conciliacao_meta_atingida?: number | null;
  conciliacao_super_meta?: number | null;
  conciliacao_tiers?: ConciliacaoTier[] | null;
  conciliacao_faixas_loja?: ConciliacaoBandRule[] | null;
  mfa_obrigatorio?: boolean;
  exportacao_pdf?: boolean;
  exportacao_excel?: boolean;
};

const DEFAULT_BAND_DEFINITIONS = [
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
] as const;

const PT_BR_COLLATOR = new Intl.Collator('pt-BR');

function normalizeBandId(value: unknown) {
  return String(value ?? '')
    .trim()
    .normalize('NFD')
    .replace(/\p{Diacritic}/gu, '')
    .replace(/[^a-zA-Z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '')
    .toUpperCase();
}

function normalizeBandName(value: unknown) {
  const text = String(value ?? '').trim();
  return text || 'Nova faixa';
}

function parseNullableNumber(value: unknown): number | null {
  if (value == null || value === '') return null;
  const num = Number(value);
  return Number.isFinite(num) ? num : null;
}

function normalizeBandKey(value?: string | null) {
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

function getDefaultBandDefinition(key?: string | null) {
  const normalized = normalizeBandKey(key);
  if (!normalized) return null;
  return DEFAULT_BAND_DEFINITIONS.find((item) => item.faixa_loja === normalized) || null;
}

function sanitizeTier(tier: unknown): ConciliacaoTier | null {
  const value = (tier && typeof tier === 'object' ? tier : {}) as Record<string, unknown>;
  const faixa = String(value.faixa || '')
    .trim()
    .toUpperCase();
  if (faixa !== 'PRE' && faixa !== 'POS') return null;

  const dePct = Number(value.de_pct ?? 0);
  const atePct = Number(value.ate_pct ?? 0);
  const incMeta = Number(value.inc_pct_meta ?? 0);
  const incCom = Number(value.inc_pct_comissao ?? 0);

  if (![dePct, atePct, incMeta, incCom].every(Number.isFinite)) return null;

  return {
    faixa,
    de_pct: dePct,
    ate_pct: atePct,
    inc_pct_meta: incMeta,
    inc_pct_comissao: incCom
  };
}

function sortBandRules(rules: ConciliacaoBandRule[]) {
  return [...rules].sort((left, right) => {
    if (left.ordem !== right.ordem) return left.ordem - right.ordem;
    const leftMin = left.percentual_min ?? Number.NEGATIVE_INFINITY;
    const rightMin = right.percentual_min ?? Number.NEGATIVE_INFINITY;
    if (leftMin !== rightMin) return leftMin - rightMin;
    return PT_BR_COLLATOR.compare(left.nome, right.nome);
  });
}

export function normalizeConciliacaoTipo(value?: string | null): ConciliacaoTipoRegra {
  return String(value || '')
    .trim()
    .toUpperCase() === 'ESCALONAVEL'
    ? 'ESCALONAVEL'
    : 'GERAL';
}

export function sanitizeConciliacaoTiers(value: unknown): ConciliacaoTier[] {
  if (!Array.isArray(value)) return [];
  return value
    .map((tier) => sanitizeTier(tier))
    .filter((tier): tier is ConciliacaoTier => Boolean(tier));
}

export function createEmptyConciliacaoTier(faixa: 'PRE' | 'POS' = 'PRE'): ConciliacaoTier {
  return {
    faixa,
    de_pct: 0,
    ate_pct: 0,
    inc_pct_meta: 0,
    inc_pct_comissao: 0
  };
}

function createBandId() {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return crypto.randomUUID().replace(/-/g, '_').toUpperCase();
  }

  return `FAIXA_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`.toUpperCase();
}

export function createManualConciliacaoBandRule(order: number): ConciliacaoBandRule {
  return {
    faixa_loja: createBandId(),
    nome: `Nova faixa ${order}`,
    percentual_min: null,
    percentual_max: null,
    ordem: order * 10,
    ativo: true,
    tipo_calculo: 'CONCILIACAO',
    tipo: 'GERAL',
    meta_nao_atingida: null,
    meta_atingida: null,
    super_meta: null,
    tiers: []
  };
}

export function createDefaultConciliacaoBandRules(
  params?: ParametrosConciliacaoShape | null
): ConciliacaoBandRule[] {
  const legacyTipo = normalizeConciliacaoTipo(params?.conciliacao_tipo);
  const legacyTiers = sanitizeConciliacaoTiers(params?.conciliacao_tiers);

  return DEFAULT_BAND_DEFINITIONS.map((definition) => ({
    faixa_loja: definition.faixa_loja,
    nome: definition.nome,
    percentual_min: definition.percentual_min,
    percentual_max: definition.percentual_max,
    ordem: definition.ordem,
    ativo:
      definition.tipo_calculo === 'PRODUTO_DIFERENCIADO'
        ? true
        : Boolean(params?.conciliacao_regra_ativa),
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

export function sanitizeConciliacaoBandRules(
  value: unknown,
  params?: ParametrosConciliacaoShape | null
): ConciliacaoBandRule[] {
  const defaults = createDefaultConciliacaoBandRules(params);

  if (!Array.isArray(value) || value.length === 0) {
    return sortBandRules(defaults);
  }

  const sanitized = value
    .map((item, index) => {
      const value = (item && typeof item === 'object' ? item : {}) as Record<string, unknown>;
      const legacyDefinition = getDefaultBandDefinition(
        value.faixa_loja as string | null | undefined
      );
      const normalizedId =
        normalizeBandId(value.faixa_loja as string | null | undefined) ||
        normalizeBandId(value.id as string | null | undefined) ||
        `FAIXA_${index + 1}`;
      const base =
        defaults.find((entry) => normalizeBandId(entry.faixa_loja) === normalizedId) ||
        (legacyDefinition
          ? defaults.find((entry) => entry.faixa_loja === legacyDefinition.faixa_loja)
          : null);
      const tipoCalculo =
        String(value.tipo_calculo || '')
          .trim()
          .toUpperCase() === 'PRODUTO_DIFERENCIADO'
          ? 'PRODUTO_DIFERENCIADO'
          : 'CONCILIACAO';
      const tipo = normalizeConciliacaoTipo(value.tipo as string | null | undefined);
      const tiers = Array.isArray(value.tiers)
        ? value.tiers
            .map(sanitizeTier)
            .filter((tier: ConciliacaoTier | null): tier is ConciliacaoTier => Boolean(tier))
        : base?.tiers || [];

      return {
        faixa_loja: normalizedId,
        nome: normalizeBandName(
          value.nome ?? legacyDefinition?.nome ?? base?.nome ?? value.faixa_loja
        ),
        percentual_min:
          parseNullableNumber(value.percentual_min) ??
          legacyDefinition?.percentual_min ??
          base?.percentual_min ??
          null,
        percentual_max:
          parseNullableNumber(value.percentual_max) ??
          legacyDefinition?.percentual_max ??
          base?.percentual_max ??
          null,
        ordem: Number.isFinite(Number(value.ordem))
          ? Number(value.ordem)
          : (base?.ordem ?? (index + 1) * 10),
        ativo: value.ativo == null ? (base?.ativo ?? true) : Boolean(value.ativo),
        tipo_calculo: tipoCalculo,
        tipo,
        meta_nao_atingida:
          value.meta_nao_atingida != null
            ? Number(value.meta_nao_atingida)
            : (base?.meta_nao_atingida ?? null),
        meta_atingida:
          value.meta_atingida != null ? Number(value.meta_atingida) : (base?.meta_atingida ?? null),
        super_meta:
          value.super_meta != null ? Number(value.super_meta) : (base?.super_meta ?? null),
        tiers
      } satisfies ConciliacaoBandRule;
    })
    .filter((item) => item.nome);

  return sortBandRules(sanitized);
}
