// Migrado para Hono de src/routes/api/v1/conciliacao/lookup/+server.ts — corpo IDÊNTICO ao original
// (só o nome/assinatura do handler e caminhos de import relativos mudaram). Ver src/lib/server/api/app.ts.
import type { RequestEvent } from '@sveltejs/kit';
import { json } from '@sveltejs/kit';
import { ensureModuloAccess, getAdminClient, requireAuthenticatedUser, resolveScopedCompanyIds, resolveUserScope, toErrorResponse } from '$lib/server/v1';
import { NO_STORE_HEADERS } from '$lib/server/httpCache';
import { readJsonBodyLimited, rejectCrossOriginRequest } from '$lib/server/requestGuards';
import { cleanStringSet, chunkArray, uniqueCleanStrings } from '$lib/utils/array';

const MAX_CONCILIACAO_LOOKUP_BODY_BYTES = 256 * 1024;
const MAX_LOOKUP_DOCUMENTOS = 500;

function normalizeNumeroRecibo(value: string) {
  return String(value || '').toUpperCase().replace(/[^A-Z0-9]/g, '');
}

function onlyDigits(value?: string | null) {
  return String(value ?? '').replace(/\D+/g, '');
}

function reciboCoreDigits(value?: string | null) {
  const digits = onlyDigits(value);
  if (!digits) return '';
  return digits.length >= 10 ? digits.slice(-10) : digits;
}

function stripLeadingZeros(value?: string | null) {
  const raw = String(value ?? '').replace(/^0+/, '');
  return raw || '0';
}

function extractReciboPrefix(value?: string | null) {
  const raw = String(value ?? '').trim();
  if (!raw) return '';
  const prefixMatch = raw.match(/^(\d{4})\D+/);
  if (prefixMatch?.[1]) return prefixMatch[1];
  const digits = onlyDigits(raw);
  return digits.length >= 14 ? digits.slice(0, 4) : '';
}

function numeroReciboMatches(left?: string | null, right?: string | null) {
  const leftCompact = normalizeNumeroRecibo(String(left || ''));
  const rightCompact = normalizeNumeroRecibo(String(right || ''));
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
  if (!leftSignificantCore || !rightSignificantCore || leftSignificantCore !== rightSignificantCore) {
    return false;
  }

  const leftPrefix = extractReciboPrefix(left);
  const rightPrefix = extractReciboPrefix(right);
  if (leftPrefix && rightPrefix) return leftPrefix === rightPrefix;
  return true;
}

function matches(a: number, b: number) {
  return Math.abs(a - b) <= 0.01;
}

type ReciboCandidate = {
  id: string;
  venda_id: string;
  vendedor_id: string | null;
  numero_recibo: string | null;
  valor_total: number | null;
  valor_taxas: number | null;
};

type LookupClient = ReturnType<typeof getAdminClient>;

type ReciboCandidateRow = {
  id?: string | null;
  venda_id?: string | null;
  numero_recibo?: string | null;
  valor_total?: number | null;
  valor_taxas?: number | null;
};

type VendaScopeRow = {
  id?: string | null;
  company_id?: string | null;
  vendedor_id?: string | null;
};

type LookupRequestBody = {
  companyId?: string | null;
  documentos?: Array<{
    documento?: string | null;
    valor_lancamentos?: number | null;
    valor_taxas?: number | null;
  }>;
};

function readLookupRequestBody(value: unknown): LookupRequestBody {
  if (!value || typeof value !== 'object') return {};

  const body = value as Record<string, unknown>;
  const parsed: LookupRequestBody = {};

  if (typeof body.companyId === 'string') parsed.companyId = body.companyId;

  if (Array.isArray(body.documentos)) {
    parsed.documentos = body.documentos
      .filter((item): item is Record<string, unknown> => Boolean(item) && typeof item === 'object')
      .map((item) => ({
        documento: typeof item.documento === 'string' ? item.documento : null,
        valor_lancamentos: typeof item.valor_lancamentos === 'number' ? item.valor_lancamentos : null,
        valor_taxas: typeof item.valor_taxas === 'number' ? item.valor_taxas : null
      }));
  }

  return parsed;
}

async function fetchReciboCandidates(params: {
  client: LookupClient;
  numero: string;
  companyIds: string[];
}): Promise<ReciboCandidate[]> {
  const { client, numero, companyIds } = params;
  if (companyIds.length === 0) return [];

  const numeroNormalizado = normalizeNumeroRecibo(numero);
  const token = stripLeadingZeros(reciboCoreDigits(numero));
  const byId = new Map<string, ReciboCandidate>();

  const [normResp, exactResp, fuzzyResp] = await Promise.all([
    numeroNormalizado
      ? client
          .from('vendas_recibos')
          .select('id, venda_id, numero_recibo, valor_total, valor_taxas')
          .eq('numero_recibo_normalizado', numeroNormalizado)
          .limit(30)
      : Promise.resolve({ data: [] as ReciboCandidateRow[] }),
    numero
      ? client
          .from('vendas_recibos')
          .select('id, venda_id, numero_recibo, valor_total, valor_taxas')
          .eq('numero_recibo', numero)
          .limit(30)
      : Promise.resolve({ data: [] as ReciboCandidateRow[] }),
    token && token.length >= 5
      ? client
          .from('vendas_recibos')
          .select('id, venda_id, numero_recibo, valor_total, valor_taxas')
          .ilike('numero_recibo', `%${token}%`)
          .limit(50)
      : Promise.resolve({ data: [] as ReciboCandidateRow[] })
  ]);

  for (const row of [...(normResp?.data || []), ...(exactResp?.data || []), ...(fuzzyResp?.data || [])]) {
    const id = String(row?.id || '').trim();
    const vendaId = String(row?.venda_id || '').trim();
    if (!id || !vendaId) continue;
    if (!numeroReciboMatches(numero, row?.numero_recibo)) continue;
    byId.set(id, {
      id,
      venda_id: vendaId,
      vendedor_id: null,
      numero_recibo: row?.numero_recibo ?? null,
      valor_total: row?.valor_total ?? null,
      valor_taxas: row?.valor_taxas ?? null
    });
  }

  const candidates = Array.from(byId.values());
  if (candidates.length === 0) return [];

  const vendaIds = uniqueCleanStrings(candidates.map((row) => row.venda_id));
  const companySet = cleanStringSet(companyIds);
  const vendas: VendaScopeRow[] = [];
  for (const batch of chunkArray(vendaIds)) {
    const { data, error } = await client
      .from('vendas')
      .select('id, company_id, vendedor_id')
      .in('id', batch);
    if (error) throw error;
    vendas.push(...(data || []));
  }

  const vendaMap = new Map<string, { company_id: string | null; vendedor_id: string | null }>();
  for (const row of vendas || []) {
    const id = String(row?.id || '').trim();
    if (!id) continue;
    const companyId = String(row?.company_id || '').trim();
    if (!companySet.has(companyId)) continue;
    vendaMap.set(id, {
      company_id: companyId || null,
      vendedor_id: String(row?.vendedor_id || '').trim() || null
    });
  }

  return candidates
    .filter((row) => Boolean(vendaMap.get(row.venda_id)?.company_id))
    .map((row) => ({
      ...row,
      vendedor_id: vendaMap.get(row.venda_id)?.vendedor_id || null
    }));
}

async function findReciboByNumero(params: {
  client: LookupClient;
  companyIds: string[];
  numero: string;
  valorLancamento?: number | null;
  valorTaxas?: number | null;
}) {
  const numero = String(params.numero || '').trim();
  if (!numero) return null;
  if (!Array.isArray(params.companyIds) || params.companyIds.length === 0) return null;

  const rows = await fetchReciboCandidates({
    client: params.client,
    numero,
    companyIds: params.companyIds
  });

  if (rows.length === 0) return null;

  const targetTotal = Number(params.valorLancamento || 0);
  const targetTaxas = Number(params.valorTaxas || 0);

  const reciboExato = rows.find((item) => String(item.numero_recibo || '').trim() === numero);
  if (reciboExato) return { recibo: reciboExato };

  const compativeis = rows.filter((item) => numeroReciboMatches(numero, item.numero_recibo));
  if (compativeis.length === 0) return null;

  const ranked = [...compativeis].sort((a, b) => {
    const aTotalDiff = Math.abs(Number(a.valor_total || 0) - targetTotal);
    const bTotalDiff = Math.abs(Number(b.valor_total || 0) - targetTotal);
    if (aTotalDiff !== bTotalDiff) return aTotalDiff - bTotalDiff;
    const aTaxDiff = Math.abs(Number(a.valor_taxas || 0) - targetTaxas);
    const bTaxDiff = Math.abs(Number(b.valor_taxas || 0) - targetTaxas);
    return aTaxDiff - bTaxDiff;
  });

  const porValor = ranked.filter((item) => (params.valorLancamento == null ? true : matches(Number(item.valor_total || 0), targetTotal)));
  const porTaxas = porValor.filter((item) => (params.valorTaxas == null ? true : matches(Number(item.valor_taxas || 0), targetTaxas)));

  const escolhido =
    (porTaxas.length === 1 ? porTaxas[0] : null) ||
    (porValor.length === 1 ? porValor[0] : null) ||
    (ranked.length === 1 ? ranked[0] : null);

  return escolhido ? { recibo: escolhido } : null;
}

export async function handleConciliacaoLookupPost(event: RequestEvent) {
  try {
    const originError = rejectCrossOriginRequest(event.request);
    if (originError) return originError;
    const bodyResult = await readJsonBodyLimited(event.request, MAX_CONCILIACAO_LOOKUP_BODY_BYTES);
    if (!bodyResult.ok) return bodyResult.response;

    const client = getAdminClient();
    const user = await requireAuthenticatedUser(event);
    const scope = await resolveUserScope(client, user.id);

    if (!scope.isAdmin && !scope.isMaster && !scope.isFinanceiro && !scope.isGestor) {
      ensureModuloAccess(scope, ['operacao_conciliacao', 'conciliacao'], 1, 'Sem acesso à Conciliação.');
    }

    const body = readLookupRequestBody(bodyResult.data);
    const companyIds = resolveScopedCompanyIds(scope, body?.companyId || null);
    if (companyIds.length === 0) return json({ error: 'Company invalida.' }, { status: 400, headers: NO_STORE_HEADERS });

    const documentos = Array.isArray(body?.documentos) ? body.documentos.slice(0, MAX_LOOKUP_DOCUMENTOS) : [];
    if (documentos.length === 0) return json({ matches: {} }, { headers: NO_STORE_HEADERS });

    const matches: Record<
      string,
      {
        vendedor_id: string;
        venda_id: string;
        venda_recibo_id: string;
        sistema_valor_total: number | null;
        sistema_valor_taxas: number | null;
        diff_total: number | null;
        diff_taxas: number | null;
      } | null
    > = {};

    for (const item of documentos) {
      const documento = String(item?.documento || '').trim();
      if (!documento) continue;

      const found = await findReciboByNumero({
        numero: documento,
        companyIds,
        valorLancamento: item.valor_lancamentos ?? null,
        valorTaxas: item.valor_taxas ?? null,
        client
      });

      if (!found?.recibo?.vendedor_id) {
        matches[documento] = null;
        continue;
      }

      const sistemaTotal = Number(found.recibo.valor_total || 0);
      const sistemaTaxas = Number(found.recibo.valor_taxas || 0);
      const importTotal = Number(item.valor_lancamentos || 0);
      const importTaxas = Number(item.valor_taxas || 0);

      matches[documento] = {
        vendedor_id: found.recibo.vendedor_id,
        venda_id: found.recibo.venda_id,
        venda_recibo_id: found.recibo.id,
        sistema_valor_total: found.recibo.valor_total,
        sistema_valor_taxas: found.recibo.valor_taxas,
        diff_total: Math.abs(importTotal - sistemaTotal) > 0.01 ? Math.round((importTotal - sistemaTotal) * 100) / 100 : null,
        diff_taxas: Math.abs(importTaxas - sistemaTaxas) > 0.01 ? Math.round((importTaxas - sistemaTaxas) * 100) / 100 : null
      };
    }

    return json(
      { matches, truncated: Array.isArray(body?.documentos) && body.documentos.length > MAX_LOOKUP_DOCUMENTOS },
      { headers: NO_STORE_HEADERS }
    );
  } catch (err) {
    return toErrorResponse(err, 'Erro ao buscar vendedores.');
  }
}
