// Migrado para Hono de src/routes/api/v1/conciliacao/existing/+server.ts — corpo IDÊNTICO ao original
// (só o nome/assinatura do handler e caminhos de import relativos mudaram). Ver src/lib/server/api/app.ts.
import type { RequestEvent } from '@sveltejs/kit';
import { json } from '@sveltejs/kit';
import { ensureModuloAccess, getAdminClient, requireAuthenticatedUser, resolveScopedCompanyIds, resolveUserScope, toErrorResponse } from '$lib/server/v1';
import { NO_STORE_HEADERS } from '$lib/server/httpCache';
import { readJsonBodyLimited, rejectCrossOriginRequest } from '$lib/server/requestGuards';
import { chunkArray, uniqueCleanStrings } from '$lib/utils/array';

const MAX_CONCILIACAO_EXISTING_BODY_BYTES = 256 * 1024;
const MAX_EXISTING_DOCUMENTOS = 1000;

type ExistingRequestBody = {
  companyId?: string | null;
  documentos?: string[];
};

type ExistingConciliacaoRow = {
  id: string;
  documento: string | null;
  numero_reserva: string | null;
  movimento_data: string | null;
  ranking_vendedor_id: string | null;
  ranking_produto_id: string | null;
  venda_id: string | null;
  venda_recibo_id: string | null;
  conciliado: boolean | null;
  valor_lancamentos: number | null;
  valor_taxas: number | null;
  valor_descontos: number | null;
  valor_abatimentos: number | null;
  valor_nao_comissionavel: number | null;
  valor_calculada_loja: number | null;
  valor_visao_master: number | null;
  valor_opfax: number | null;
  valor_saldo: number | null;
};

type ExistingRecord = Omit<ExistingConciliacaoRow, 'id' | 'documento' | 'movimento_data'>;

function readExistingRequestBody(value: unknown): ExistingRequestBody {
  if (!value || typeof value !== 'object') return {};
  const body = value as Record<string, unknown>;
  const parsed: ExistingRequestBody = {};

  if (typeof body.companyId === 'string') {
    parsed.companyId = body.companyId;
  }
  if (Array.isArray(body.documentos)) {
    parsed.documentos = body.documentos
      .filter((item): item is string => typeof item === 'string');
  }

  return parsed;
}

export async function handleConciliacaoExistingPost(event: RequestEvent) {
  try {
    const originError = rejectCrossOriginRequest(event.request);
    if (originError) return originError;
    const bodyResult = await readJsonBodyLimited(event.request, MAX_CONCILIACAO_EXISTING_BODY_BYTES);
    if (!bodyResult.ok) return bodyResult.response;

    const client = getAdminClient();
    const user = await requireAuthenticatedUser(event);
    const scope = await resolveUserScope(client, user.id);

    if (!scope.isAdmin && !scope.isMaster && !scope.isFinanceiro && !scope.isGestor) {
      ensureModuloAccess(scope, ['operacao_conciliacao', 'conciliacao'], 1, 'Sem acesso à Conciliação.');
    }

    const body = readExistingRequestBody(bodyResult.data);
    const companyIds = resolveScopedCompanyIds(scope, body?.companyId || null);
    const companyId = companyIds[0] || null;
    if (!companyId) return json({ error: 'Company invalida.' }, { status: 400, headers: NO_STORE_HEADERS });

    const documentos: string[] = [];
    if (Array.isArray(body?.documentos)) {
      for (const item of body.documentos) {
        const documento = String(item || '').trim();
        if (documento) documentos.push(documento);
        if (documentos.length >= MAX_EXISTING_DOCUMENTOS) break;
      }
    }

    if (documentos.length === 0) return json({ records: {} }, { headers: NO_STORE_HEADERS });

    const rows: ExistingConciliacaoRow[] = [];
    for (const batch of chunkArray(uniqueCleanStrings(documentos))) {
      const { data, error } = await client
        .from('conciliacao_recibos')
        .select(
          'id, documento, numero_reserva, movimento_data, ranking_vendedor_id, ranking_produto_id, venda_id, venda_recibo_id, conciliado, valor_lancamentos, valor_taxas, valor_descontos, valor_abatimentos, valor_nao_comissionavel, valor_calculada_loja, valor_visao_master, valor_opfax, valor_saldo'
        )
        .eq('company_id', companyId)
        .in('documento', batch)
        .order('movimento_data', { ascending: false })
        .limit(Math.min(1000, batch.length * 10));
      if (error) throw error;
      rows.push(...(data || []));
    }

    const records: Record<string, ExistingRecord> = {};

    for (const row of rows) {
      const doc = String(row?.documento || '').trim();
      if (!doc) continue;
      const existing = records[doc];

      const rowHasFinancial =
        Math.abs(Number(row?.valor_lancamentos || 0)) > 0.001 ||
        Math.abs(Number(row?.valor_taxas || 0)) > 0.001;

      if (existing) {
        if (existing.conciliado && !row?.conciliado) continue;
        const existingHasFinancial =
          Math.abs(Number(existing.valor_lancamentos || 0)) > 0.001 ||
          Math.abs(Number(existing.valor_taxas || 0)) > 0.001;
        if (existingHasFinancial && !rowHasFinancial) continue;
        if (!row?.ranking_vendedor_id && !row?.venda_recibo_id && !rowHasFinancial) continue;
      }

      records[doc] = {
        ranking_vendedor_id: row?.ranking_vendedor_id ?? null,
        ranking_produto_id: row?.ranking_produto_id ?? null,
        numero_reserva: row?.numero_reserva ?? null,
        venda_id: row?.venda_id ?? null,
        venda_recibo_id: row?.venda_recibo_id ?? null,
        conciliado: Boolean(row?.conciliado),
        valor_lancamentos: row?.valor_lancamentos ?? null,
        valor_taxas: row?.valor_taxas ?? null,
        valor_descontos: row?.valor_descontos ?? null,
        valor_abatimentos: row?.valor_abatimentos ?? null,
        valor_nao_comissionavel: row?.valor_nao_comissionavel ?? null,
        valor_calculada_loja: row?.valor_calculada_loja ?? null,
        valor_visao_master: row?.valor_visao_master ?? null,
        valor_opfax: row?.valor_opfax ?? null,
        valor_saldo: row?.valor_saldo ?? null
      };
    }

    return json(
      { records, truncated: Array.isArray(body?.documentos) && body.documentos.length > MAX_EXISTING_DOCUMENTOS },
      { headers: NO_STORE_HEADERS }
    );
  } catch (err) {
    return toErrorResponse(err, 'Erro ao buscar registros existentes.');
  }
}
