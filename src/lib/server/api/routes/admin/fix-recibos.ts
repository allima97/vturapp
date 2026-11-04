// Migrado para Hono de src/routes/api/v1/admin/fix-recibos/+server.ts — corpo IDÊNTICO ao original
// (só nome/assinatura do handler e caminhos de import mudaram). Ver src/lib/server/api/app.ts.
import { json } from '@sveltejs/kit';
import type { RequestEvent } from '@sveltejs/kit';
import { findEquipeVturVendedor } from '$lib/conciliacao/baixaRac';
import { calcularValorVendaReal } from '$lib/conciliacao/business';
import {
  getAdminClient,
  isRankingEligibleUser,
  isUuid,
  logServerError,
  requireAuthenticatedUser,
  resolveUserScope,
  sanitizePostgrestSearchTerm,
  toErrorResponse
} from '$lib/server/v1';
import { NO_STORE_HEADERS } from '$lib/server/httpCache';
import { readJsonBodyLimited, rejectCrossOriginRequest } from '$lib/server/requestGuards';
import { invalidateSalesReadModels } from '$lib/server/readModelCache';
import { cleanStringSet, chunkArray } from '$lib/utils/array';

const MAX_DOC_VARIANTS = 200;
const MAX_FIX_BODY_BYTES = 16 * 1024;
const MONEY_EPS = 0.009;

type AdminClient = ReturnType<typeof getAdminClient>;

type FixReciboUserRow = {
  id?: string | null;
  nome_completo?: string | null;
  email?: string | null;
  company_id?: string | null;
  active?: boolean | null;
  uso_individual?: boolean | null;
  participa_ranking?: boolean | null;
  user_types?: { name?: string | null }[] | { name?: string | null } | null;
};

type FixReciboConcRow = {
  id?: string | null;
  documento?: string | null;
  status?: string | null;
  descricao?: string | null;
  movimento_data?: string | null;
  valor_lancamentos?: number | null;
  valor_descontos?: number | null;
  valor_abatimentos?: number | null;
  valor_venda_real?: number | null;
  venda_id?: string | null;
  venda_recibo_id?: string | null;
  ranking_vendedor_id?: string | null;
  company_id?: string | null;
};

type FixReciboVendaRelation = {
  id?: string | null;
  company_id?: string | null;
  vendedor_id?: string | null;
  data_venda?: string | null;
};

type FixReciboCandidateRow = {
  id?: string | null;
  venda_id?: string | null;
  numero_recibo?: string | null;
  numero_recibo_normalizado?: string | null;
  numero_reserva?: string | null;
  data_venda?: string | null;
  valor_total?: number | null;
  valor_taxas?: number | null;
  produto_id?: string | null;
  vendas?: FixReciboVendaRelation[] | FixReciboVendaRelation | null;
};

type FixReciboCandidateItem = {
  id: string | null | undefined;
  venda_id: string | null | undefined;
  numero_recibo: string | null | undefined;
  numero_recibo_normalizado: string | null | undefined;
  numero_reserva: string | null | undefined;
  data_venda: string | null;
  valor_total: number;
  valor_taxas: number;
  company_id: string | null | undefined;
  vendedor_id: string | null;
  vendedor_nome: string;
};

type FixReciboBody = {
  action?: string;
  id?: string;
  vendedor_id?: string;
  venda_recibo_id?: string;
  valor_lancamentos?: number | string | null;
  valor_venda_real?: number | string | null;
};

function adminJson(body: unknown, init?: ResponseInit) {
  const headers = new Headers(init?.headers);
  for (const [key, value] of Object.entries(NO_STORE_HEADERS)) headers.set(key, value);
  return json(body, { ...init, headers });
}

function requireAdmin(scope: Awaited<ReturnType<typeof resolveUserScope>>) {
  if (!scope.isAdmin) {
    return adminJson({ error: 'Somente ADMIN pode usar a correção de recibos.' }, { status: 403 });
  }
  return null;
}

function numberChanged(a: unknown, b: unknown) {
  const left = Number(a || 0);
  const right = Number(b || 0);
  return Math.abs(left - right) > MONEY_EPS;
}

function moneyEquals(a: unknown, b: unknown) {
  return Math.abs(Number(a || 0) - Number(b || 0)) <= MONEY_EPS;
}

function documentKey(value?: string | null) {
  const raw = String(value || '').trim();
  const digits = raw.replace(/\D/g, '');
  if (!digits) return raw.toLowerCase();
  return digits.length >= 10 ? digits.slice(-10) : digits.padStart(10, '0');
}

function candidateDocumentKeys(row: {
  numero_recibo?: string | null;
  numero_recibo_normalizado?: string | null;
  numero_reserva?: string | null;
}) {
  const keys = new Set<string>();
  for (const value of [row?.numero_recibo, row?.numero_recibo_normalizado, row?.numero_reserva]) {
    const key = documentKey(value);
    if (key) keys.add(key);
  }
  return keys;
}

function onlyDigits(value?: string | null) {
  return String(value || '').replace(/\D/g, '');
}

function normalizeReceiptNumber(value?: string | null) {
  return String(value || '')
    .trim()
    .toUpperCase()
    .replace(/[^A-Z0-9]/g, '');
}

function collectUniqueUuidValues(values: unknown[]) {
  const ids = new Set<string>();
  for (const value of values) {
    const id = String(value || '').trim();
    if (isUuid(id)) ids.add(id);
  }
  return Array.from(ids);
}

function stripLeadingZeros(value?: string | null) {
  return String(value || '').replace(/^0+/, '') || String(value || '');
}

function reciboCoreDigits(value?: string | null) {
  const digits = onlyDigits(value);
  if (!digits) return '';
  return digits.length >= 10 ? digits.slice(-10) : digits.padStart(10, '0');
}

function extractReciboPrefix(value?: string | null) {
  const raw = String(value || '').trim();
  const prefixMatch = raw.match(/^(\d{4})\D+/);
  if (prefixMatch?.[1]) return prefixMatch[1];
  const digits = onlyDigits(raw);
  return digits.length >= 14 ? digits.slice(0, 4) : '';
}

function numeroReciboMatches(left?: string | null, right?: string | null) {
  const leftCompact = normalizeReceiptNumber(left);
  const rightCompact = normalizeReceiptNumber(right);
  if (leftCompact && rightCompact && leftCompact === rightCompact) return true;

  const leftDigits = onlyDigits(left);
  const rightDigits = onlyDigits(right);
  if (!leftDigits || !rightDigits) return false;
  if (leftDigits === rightDigits) return true;

  const leftCore = reciboCoreDigits(leftDigits);
  const rightCore = reciboCoreDigits(rightDigits);
  if (leftCore && rightCore && leftCore === rightCore) return true;

  const leftSignificantCore = stripLeadingZeros(leftCore);
  const rightSignificantCore = stripLeadingZeros(rightCore);
  if (!leftSignificantCore || !rightSignificantCore || leftSignificantCore !== rightSignificantCore) return false;

  const leftPrefix = extractReciboPrefix(left);
  const rightPrefix = extractReciboPrefix(right);
  if (leftPrefix && rightPrefix) return leftPrefix === rightPrefix;
  return true;
}

function candidateMatchesVariant(row: FixReciboCandidateRow, variant: string) {
  return (
    numeroReciboMatches(variant, row?.numero_recibo) ||
    numeroReciboMatches(variant, row?.numero_recibo_normalizado) ||
    numeroReciboMatches(variant, row?.numero_reserva)
  );
}

function buildDocumentSearchPatterns(input: string) {
  const patterns = new Set<string>();

  for (const variant of normalizeDocumentVariants(input)) {
    const safeVariant = sanitizePostgrestSearchTerm(variant, 80);
    if (safeVariant.length >= 5) patterns.add(`%${safeVariant}%`);

    const core = reciboCoreDigits(variant);
    const significantCore = stripLeadingZeros(core);
    const prefix = extractReciboPrefix(variant);

    if (core.length >= 5) patterns.add(`%${core}%`);
    if (significantCore.length >= 5) patterns.add(`%${significantCore}%`);
    if (prefix && core.length >= 5) patterns.add(`${prefix}%${core}`);
    if (prefix && significantCore.length >= 5) patterns.add(`${prefix}%${significantCore}`);
  }

  return Array.from(patterns).slice(0, 40);
}

function firstRelation<T>(value: T | T[] | null | undefined): T | null {
  if (Array.isArray(value)) return value[0] || null;
  return value || null;
}

async function insertFixAudit(params: {
  client: AdminClient;
  companyId: string;
  conciliacaoReciboId: string;
  vendaId?: string | null;
  vendaReciboId?: string | null;
  numeroRecibo?: string | null;
  field: string;
  oldValue?: number | null;
  newValue?: number | null;
  changedByUserId: string;
}) {
  try {
    await params.client.from('conciliacao_recibo_changes').insert({
      company_id: params.companyId,
      conciliacao_recibo_id: params.conciliacaoReciboId,
      venda_id: params.vendaId || null,
      venda_recibo_id: params.vendaReciboId || null,
      numero_recibo: params.numeroRecibo || null,
      field: params.field,
      old_value: params.oldValue ?? null,
      new_value: params.newValue ?? null,
      actor: 'user',
      changed_by: params.changedByUserId
    });
  } catch (err) {
    logServerError('[admin/fix-recibos] falha ao gravar auditoria', err, {
      field: params.field,
      conciliacao_recibo_id: params.conciliacaoReciboId,
      numero_recibo: params.numeroRecibo || null
    });
  }
}

function normalizeDocumentVariants(input: string) {
  const values = String(input || '')
    .split(/[,\n;\t]+/)
    .map((item) => item.trim())
    .filter(Boolean);

  const variants = new Set<string>();

  for (const value of values) {
    variants.add(value);

    const normalized = normalizeReceiptNumber(value);
    if (normalized) variants.add(normalized);

    const digits = value.replace(/\D/g, '');
    if (!digits) continue;

    variants.add(digits);

    const core10 = digits.length >= 10 ? digits.slice(-10) : digits.padStart(10, '0');
    variants.add(core10);
    variants.add(`5630-${core10}`);
    variants.add(`5630${core10}`);

    const core6 = digits.length >= 6 ? digits.slice(-6) : digits.padStart(6, '0');
    variants.add(core6);
    variants.add(`5630-0000${core6}`);
  }

  return Array.from(variants).slice(0, MAX_DOC_VARIANTS);
}

async function searchUsers(event: RequestEvent, scope: Awaited<ReturnType<typeof resolveUserScope>>) {
  const client = getAdminClient();
  const term = sanitizePostgrestSearchTerm(event.url.searchParams.get('busca_usuario'), 60);
  if (!term || term.length < 2) {
    return adminJson({ usuarios: [] });
  }

  const searchExpression = `nome_completo.ilike.%${term}%,email.ilike.%${term}%`;
  let query = client
    .from('users')
    .select('id, nome_completo, email, company_id, active, uso_individual, participa_ranking, user_types(name)')
    .or(searchExpression)
    .limit(15);

  const companyId = String(event.url.searchParams.get('empresa_id') || '').trim();
  if (isUuid(companyId)) query = query.eq('company_id', companyId);

  const { data, error } = await query;
  if (error) throw error;

  const scopedCompanySet = cleanStringSet(scope.companyIds);
  return adminJson({
    usuarios: (data || [])
      .filter((row: any) => scope.isAdmin || scopedCompanySet.has(String(row.company_id || '').trim()))
      .filter(isRankingEligibleUser)
      .map((row: any) => ({
        id: row.id,
        nome_completo: row.nome_completo || row.email || row.id,
        email: row.email || null,
        company_id: row.company_id || null
      }))
  });
}

async function searchDocuments(event: RequestEvent) {
  const client = getAdminClient();
  const docs = String(event.url.searchParams.get('docs') || '').trim();
  const docVariants = normalizeDocumentVariants(docs);
  const docPatterns = buildDocumentSearchPatterns(docs);
  if (docVariants.length === 0) {
    return adminJson({
      docs_pesquisados: [],
      conciliacao_rows: [],
      resumo: { linhas_encontradas: 0 }
    });
  }

  let query = client
    .from('conciliacao_recibos')
    .select(
      'id, documento, status, descricao, movimento_data, valor_lancamentos, valor_descontos, valor_abatimentos, valor_venda_real, venda_id, venda_recibo_id, ranking_vendedor_id, company_id'
    )
    .in('documento', docVariants)
    .order('movimento_data', { ascending: true });

  const companyId = String(event.url.searchParams.get('empresa_id') || '').trim();
  if (isUuid(companyId)) query = query.eq('company_id', companyId);

  const { data: rows, error } = await query;
  if (error) throw error;

  const rowMap = new Map<string, FixReciboConcRow>();
  for (const row of (rows || []) as FixReciboConcRow[]) {
    if (row?.id) rowMap.set(String(row.id), row);
  }

  if (docPatterns.length > 0) {
    let fuzzyQuery = client
      .from('conciliacao_recibos')
      .select(
        'id, documento, status, descricao, movimento_data, valor_lancamentos, valor_descontos, valor_abatimentos, valor_venda_real, venda_id, venda_recibo_id, ranking_vendedor_id, company_id'
      )
      .or(docPatterns.map((pattern) => `documento.ilike.${pattern}`).join(','))
      .order('movimento_data', { ascending: true })
      .limit(100);

    if (isUuid(companyId)) fuzzyQuery = fuzzyQuery.eq('company_id', companyId);

    const { data: fuzzyRows, error: fuzzyError } = await fuzzyQuery;
    if (fuzzyError) throw fuzzyError;

    for (const row of (fuzzyRows || []) as FixReciboConcRow[]) {
      if (!docVariants.some((variant) => numeroReciboMatches(variant, row?.documento))) continue;
      if (row?.id) rowMap.set(String(row.id), row);
    }
  }

  const foundRows = Array.from(rowMap.values()).sort((left, right) =>
    String(left?.movimento_data || '').localeCompare(String(right?.movimento_data || ''))
  );

  const companyIdSet = new Set<string>();
  for (const row of foundRows) {
    const rowCompanyId = String(row.company_id || '').trim();
    if (isUuid(rowCompanyId)) companyIdSet.add(rowCompanyId);
  }
  const companyIds = Array.from(companyIdSet);

  let candidatos: FixReciboCandidateRow[] = [];
  if (companyIds.length > 0) {
    const candidateMap = new Map<string, FixReciboCandidateRow>();
    const normalizedVariantSet = new Set<string>();
    for (const variant of docVariants) {
      const normalized = normalizeReceiptNumber(variant);
      if (normalized) normalizedVariantSet.add(normalized);
      if (normalizedVariantSet.size >= MAX_DOC_VARIANTS) break;
    }
    const normalizedVariants = Array.from(normalizedVariantSet);
    const candidateSelect =
      'id, venda_id, numero_recibo, numero_recibo_normalizado, numero_reserva, data_venda, valor_total, valor_taxas, produto_id, vendas!inner(id, company_id, vendedor_id, data_venda)';

    const [
      { data: exactRows, error: exactError },
      { data: normalizedRows, error: normalizedError },
      { data: reservaRows, error: reservaError }
    ] =
      await Promise.all([
        client
          .from('vendas_recibos')
          .select(candidateSelect)
          .in('numero_recibo', docVariants)
          .limit(100),
        normalizedVariants.length > 0
          ? client
              .from('vendas_recibos')
              .select(candidateSelect)
              .in('numero_recibo_normalizado', normalizedVariants)
              .limit(100)
          : Promise.resolve({ data: [], error: null }),
        client
          .from('vendas_recibos')
          .select(candidateSelect)
          .in('numero_reserva', docVariants)
          .limit(100)
      ]);
    if (exactError) throw exactError;
    if (normalizedError) throw normalizedError;
    if (reservaError) throw reservaError;
    for (const row of [
      ...((exactRows || []) as FixReciboCandidateRow[]),
      ...((normalizedRows || []) as FixReciboCandidateRow[]),
      ...((reservaRows || []) as FixReciboCandidateRow[])
    ]) {
      if (row?.id) candidateMap.set(String(row.id), row);
    }

    const candidateFilters = docPatterns
      .flatMap((pattern) => [
        `numero_recibo.ilike.${pattern}`,
        `numero_recibo_normalizado.ilike.${pattern}`,
        `numero_reserva.ilike.${pattern}`
      ])
      .slice(0, 90);
    if (candidateFilters.length > 0) {
      const { data: fuzzyCandidates, error: fuzzyCandidateError } = await client
        .from('vendas_recibos')
        .select(candidateSelect)
        .or(candidateFilters.join(','))
        .limit(150);
      if (fuzzyCandidateError) throw fuzzyCandidateError;

      for (const row of (fuzzyCandidates || []) as FixReciboCandidateRow[]) {
        if (!docVariants.some((variant) => candidateMatchesVariant(row, variant))) continue;
        if (row?.id) candidateMap.set(String(row.id), row);
      }
    }

    const companySet = new Set(companyIds);
    candidatos = Array.from(candidateMap.values()).filter((row) => {
      const venda = firstRelation<FixReciboVendaRelation>(row.vendas);
      return companySet.has(String(venda?.company_id || '').trim());
    });
  }

  const candidatoVendedorIds = collectUniqueUuidValues(
    candidatos.map((row) => firstRelation<FixReciboVendaRelation>(row.vendas)?.vendedor_id),
  );

  const vendedorIds = collectUniqueUuidValues(
    [
      ...foundRows.map((row) => row.ranking_vendedor_id),
      ...candidatoVendedorIds
    ],
  );
  const vendedorNomes = new Map<string, string>();
  if (vendedorIds.length > 0) {
    for (const vendedorBatch of chunkArray(vendedorIds)) {
      const { data: usersRows, error: usersError } = await client
        .from('users')
        .select('id, nome_completo, email')
        .in('id', vendedorBatch);
      if (usersError) throw usersError;
      for (const row of (usersRows || []) as FixReciboUserRow[]) {
        vendedorNomes.set(String(row.id), String(row.nome_completo || row.email || row.id));
      }
    }
  }

  const candidatosPorDocumento = new Map<string, FixReciboCandidateItem[]>();
  for (const row of candidatos) {
    const venda = firstRelation<FixReciboVendaRelation>(row.vendas);
    const vendedorId = String(venda?.vendedor_id || '').trim();
    const item: FixReciboCandidateItem = {
      id: row.id,
      venda_id: row.venda_id,
      numero_recibo: row.numero_recibo,
      numero_recibo_normalizado: row.numero_recibo_normalizado,
      numero_reserva: row.numero_reserva,
      data_venda: row.data_venda || venda?.data_venda || null,
      valor_total: Number(row.valor_total || 0),
      valor_taxas: Number(row.valor_taxas || 0),
      company_id: venda?.company_id || null,
      vendedor_id: vendedorId || null,
      vendedor_nome: vendedorNomes.get(vendedorId) || vendedorId || '(sem vendedor)'
    };
    for (const key of candidateDocumentKeys(row)) {
      const bucket = candidatosPorDocumento.get(key) || [];
      if (!bucket.some((candidate) => candidate.id === item.id)) bucket.push(item);
      candidatosPorDocumento.set(key, bucket);
    }
  }

  const conciliacaoRows = foundRows.map((row) => ({
    ...row,
    ranking_vendedor_nome:
      vendedorNomes.get(String(row.ranking_vendedor_id || '')) ||
      row.ranking_vendedor_id ||
      '(sem vendedor)',
    candidatos: candidatosPorDocumento.get(documentKey(row.documento)) || []
  }));

  return adminJson({
    docs_pesquisados: docVariants,
    conciliacao_rows: conciliacaoRows,
    resumo: { linhas_encontradas: conciliacaoRows.length }
  });
}

export async function handleAdminFixRecibosGet(event: RequestEvent) {
  try {
    const client = getAdminClient();
    const user = await requireAuthenticatedUser(event);
    const scope = await resolveUserScope(client, user.id);
    const denied = requireAdmin(scope);
    if (denied) return denied;

    if (event.url.searchParams.has('busca_usuario')) {
      return await searchUsers(event, scope);
    }

    return await searchDocuments(event);
  } catch (err) {
    const response = toErrorResponse(err, 'Erro ao buscar dados da correção de recibos.');
    for (const [key, value] of Object.entries(NO_STORE_HEADERS)) response.headers.set(key, value);
    return response;
  }
}

export async function handleAdminFixRecibosPost(event: RequestEvent) {
  try {
    const originError = rejectCrossOriginRequest(event.request);
    if (originError) return originError;

    const bodyResult = await readJsonBodyLimited(event.request, MAX_FIX_BODY_BYTES);
    if (!bodyResult.ok) return bodyResult.response;

    const client = getAdminClient();
    const user = await requireAuthenticatedUser(event);
    const scope = await resolveUserScope(client, user.id);
    const denied = requireAdmin(scope);
    if (denied) return denied;

    const body: FixReciboBody =
      bodyResult.data && typeof bodyResult.data === 'object'
        ? (bodyResult.data as FixReciboBody)
        : {};
    const action = String(body.action || '').trim();
    const id = String(body.id || '').trim();
    if (!isUuid(id)) return adminJson({ error: 'Registro inválido.' }, { status: 400 });

    const { data: registro, error: registroError } = await client
      .from('conciliacao_recibos')
      .select('id, company_id, documento, ranking_vendedor_id, venda_id, venda_recibo_id, valor_lancamentos, valor_taxas, valor_descontos, valor_abatimentos, valor_venda_real')
      .eq('id', id)
      .maybeSingle();
    if (registroError) throw registroError;
    if (!registro) return adminJson({ error: 'Registro não encontrado.' }, { status: 404 });

    const companyId = String(registro.company_id || '').trim();
    if (!isUuid(companyId)) {
      return adminJson({ error: 'Registro sem empresa válida.' }, { status: 422 });
    }

    if (action === 'fix_vendor') {
      const vendedorId = String(body.vendedor_id || '').trim();
      if (!isUuid(vendedorId)) return adminJson({ error: 'Vendedor inválido.' }, { status: 400 });

      const equipeVturVendedor = await findEquipeVturVendedor(client, companyId);
      if (equipeVturVendedor?.id && vendedorId === equipeVturVendedor.id) {
        return adminJson(
          { error: 'Não é permitido atribuir "Equipe vtur" como vendedor de um recibo.' },
          { status: 422 }
        );
      }

      const { data: vendedor, error: vendedorError } = await client
        .from('users')
        .select('id, nome_completo, email, company_id, active, uso_individual, participa_ranking, user_types(name)')
        .eq('id', vendedorId)
        .maybeSingle();
      if (vendedorError) throw vendedorError;
      if (!vendedor || vendedor.company_id !== companyId || !isRankingEligibleUser(vendedor)) {
        return adminJson(
          { error: 'Vendedor fora da empresa do recibo ou inelegível para ranking.' },
          { status: 422 }
        );
      }

      const { data, error } = await client
        .from('conciliacao_recibos')
        .update({
          ranking_vendedor_id: vendedorId,
          ranking_assigned_by: user.id,
          ranking_assigned_at: new Date().toISOString(),
          last_checked_at: new Date().toISOString()
        })
        .eq('id', id)
        .select('id, documento, ranking_vendedor_id, ranking_assigned_by, ranking_assigned_at');
      if (error) throw error;

      await insertFixAudit({
        client,
        companyId,
        conciliacaoReciboId: id,
        vendaId: registro.venda_id,
        vendaReciboId: registro.venda_recibo_id,
        numeroRecibo: registro.documento,
        field: `ranking_vendedor_id:${registro.ranking_vendedor_id || '-'}->${vendedorId}`,
        changedByUserId: user.id
      });

      invalidateSalesReadModels({
        companyIds: [companyId],
        vendedorIds: [
          String(registro.ranking_vendedor_id || '').trim(),
          vendedorId
        ].filter(isUuid),
        userId: user.id
      });
      return adminJson({ ok: true, updated: data });
    }

    if (action === 'fix_link') {
      const vendaReciboId = String(body.venda_recibo_id || '').trim();
      if (!isUuid(vendaReciboId)) return adminJson({ error: 'Recibo de venda inválido.' }, { status: 400 });

      const { data: candidato, error: candidatoError } = await client
        .from('vendas_recibos')
        .select(
          'id, venda_id, numero_recibo, numero_recibo_normalizado, numero_reserva, valor_total, valor_taxas, vendas!inner(id, company_id, vendedor_id, data_venda)'
        )
        .eq('id', vendaReciboId)
        .maybeSingle();
      if (candidatoError) throw candidatoError;
      if (!candidato) return adminJson({ error: 'Recibo de venda não encontrado.' }, { status: 404 });

      const venda = firstRelation<FixReciboVendaRelation>(candidato.vendas);
      if (!venda || String(venda.company_id || '') !== companyId) {
        return adminJson({ error: 'Recibo de venda fora da empresa da conciliação.' }, { status: 422 });
      }

      const registroDocumentKey = documentKey(registro.documento);
      const candidatoKeys = candidateDocumentKeys(candidato);
      if (
        !candidatoKeys.has(registroDocumentKey) &&
        !candidateMatchesVariant(candidato, String(registro.documento || ''))
      ) {
        return adminJson(
          { error: 'O número do recibo selecionado não confere com o documento da conciliação.' },
          { status: 422 }
        );
      }

      let rankingVendedorId = String(venda.vendedor_id || '').trim() || null;
      if (rankingVendedorId) {
        const { data: vendedor, error: vendedorError } = await client
          .from('users')
          .select('id, nome_completo, email, company_id, active, uso_individual, participa_ranking, user_types(name)')
          .eq('id', rankingVendedorId)
          .maybeSingle();
        if (vendedorError) throw vendedorError;
        if (!vendedor || vendedor.company_id !== companyId || !isRankingEligibleUser(vendedor)) {
          rankingVendedorId = null;
        }
      }

      const valorComparacao = calcularValorVendaReal({
        valorLancamentos: Number(registro.valor_lancamentos || 0),
        valorDescontos: Number(registro.valor_descontos || 0),
        valorAbatimentos: Number(registro.valor_abatimentos || 0)
      });
      const sistemaTotal = Number(candidato.valor_total || 0);
      const sistemaTaxas = Number(candidato.valor_taxas || 0);

      const { data, error } = await client
        .from('conciliacao_recibos')
        .update({
          venda_id: candidato.venda_id,
          venda_recibo_id: candidato.id,
          ranking_vendedor_id: rankingVendedorId,
          ranking_assigned_by: null,
          ranking_assigned_at: null,
          sistema_valor_total: sistemaTotal,
          sistema_valor_taxas: sistemaTaxas,
          match_total: moneyEquals(valorComparacao, sistemaTotal),
          match_taxas: moneyEquals(registro.valor_taxas, sistemaTaxas),
          diff_total: Number((valorComparacao - sistemaTotal).toFixed(2)),
          diff_taxas: Number((Number(registro.valor_taxas || 0) - sistemaTaxas).toFixed(2)),
          conciliado: true,
          conciliado_em: new Date().toISOString(),
          last_checked_at: new Date().toISOString()
        })
        .eq('id', id)
        .select('id, documento, venda_id, venda_recibo_id, ranking_vendedor_id, match_total, match_taxas');
      if (error) throw error;

      await insertFixAudit({
        client,
        companyId,
        conciliacaoReciboId: id,
        vendaId: registro.venda_id,
        vendaReciboId: registro.venda_recibo_id,
        numeroRecibo: registro.documento,
        field: `venda_recibo_id:${registro.venda_recibo_id || '-'}->${vendaReciboId}`,
        changedByUserId: user.id
      });

      invalidateSalesReadModels({
        companyIds: [companyId],
        vendedorIds: [
          String(registro.ranking_vendedor_id || '').trim(),
          rankingVendedorId || ''
        ].filter(isUuid),
        userId: user.id
      });
      return adminJson({ ok: true, updated: data });
    }

    if (action === 'fix_valor') {
      const updates: Record<string, number> = {};
      const hasValorLancamentos = body.valor_lancamentos != null && body.valor_lancamentos !== '';
      const hasValorVendaReal = body.valor_venda_real != null && body.valor_venda_real !== '';

      if (hasValorLancamentos) {
        const value = Number(body.valor_lancamentos);
        if (!Number.isFinite(value)) return adminJson({ error: 'valor_lancamentos inválido.' }, { status: 400 });
        updates.valor_lancamentos = value;
      }
      if (hasValorVendaReal) {
        const value = Number(body.valor_venda_real);
        if (!Number.isFinite(value)) return adminJson({ error: 'valor_venda_real inválido.' }, { status: 400 });
        updates.valor_venda_real = value;

        // O ranking canônico calcula a base por:
        // valor_lancamentos - valor_descontos - valor_abatimentos.
        // Portanto, quando o admin informa diretamente o valor que deve entrar
        // no ranking, precisamos manter o bruto compatível para a correção
        // refletir nos relatórios e não apenas no campo informativo.
        if (!hasValorLancamentos) {
          const descontos = Number(registro.valor_descontos || 0);
          const abatimentos = Number(registro.valor_abatimentos || 0);
          updates.valor_lancamentos = value + descontos + abatimentos;
        }
      }
      if (Object.keys(updates).length === 0) {
        return adminJson({ error: 'Nenhum valor informado para atualizar.' }, { status: 400 });
      }

      const { data, error } = await client
        .from('conciliacao_recibos')
        .update({
          ...updates,
          last_checked_at: new Date().toISOString()
        })
        .eq('id', id)
        .select('id, documento, valor_lancamentos, valor_venda_real');
      if (error) throw error;

      const auditWrites = [];
      if (
        Object.prototype.hasOwnProperty.call(updates, 'valor_lancamentos') &&
        numberChanged(registro.valor_lancamentos, updates.valor_lancamentos)
      ) {
        auditWrites.push(
          insertFixAudit({
            client,
            companyId,
            conciliacaoReciboId: id,
            vendaId: registro.venda_id,
            vendaReciboId: registro.venda_recibo_id,
            numeroRecibo: registro.documento,
            field: 'valor_lancamentos',
            oldValue: Number(registro.valor_lancamentos || 0),
            newValue: Number(updates.valor_lancamentos || 0),
            changedByUserId: user.id
          })
        );
      }
      if (
        Object.prototype.hasOwnProperty.call(updates, 'valor_venda_real') &&
        numberChanged(registro.valor_venda_real, updates.valor_venda_real)
      ) {
        auditWrites.push(
          insertFixAudit({
            client,
            companyId,
            conciliacaoReciboId: id,
            vendaId: registro.venda_id,
            vendaReciboId: registro.venda_recibo_id,
            numeroRecibo: registro.documento,
            field: 'valor_venda_real',
            oldValue: Number(registro.valor_venda_real || 0),
            newValue: Number(updates.valor_venda_real || 0),
            changedByUserId: user.id
          })
        );
      }
      await Promise.all(auditWrites);

      invalidateSalesReadModels({ companyIds: [companyId], userId: user.id });
      return adminJson({ ok: true, updated: data });
    }

    return adminJson({ error: `Ação desconhecida: ${action}` }, { status: 400 });
  } catch (err) {
    const response = toErrorResponse(err, 'Erro ao aplicar correção de recibos.');
    for (const [key, value] of Object.entries(NO_STORE_HEADERS)) response.headers.set(key, value);
    return response;
  }
}
