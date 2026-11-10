// Migrado para Hono de src/routes/api/v1/viagens/delete/+server.ts — corpo IDÊNTICO ao original
// (só nome/assinatura do handler e caminhos de import mudaram). Ver src/lib/server/api/app.ts.
import { json, type RequestEvent } from '@sveltejs/kit';
import {
  ensureModuloAccess,
  getAdminClient,
  isUuid,
  requireAuthenticatedUser,
  resolveScopedCompanyIds,
  resolveUserScope,
  toErrorResponse
} from '$lib/server/v1';
import { invalidateTripReadModels } from '$lib/server/readModelCache';
import { NO_STORE_HEADERS } from '$lib/server/httpCache';
import { readJsonBodyLimited, rejectCrossOriginRequest } from '$lib/server/requestGuards';
import { cleanStringSet, chunkArray } from '$lib/utils/array';

const MAX_VIAGEM_DELETE_BODY_BYTES = 64 * 1024;

type ViagemDeleteBody = {
  id?: string | null;
  venda_id?: string | null;
  company_id?: string | null;
  empresa_id?: string | null;
};

type ViagemDeleteRow = {
  id: string | null;
  company_id: string | null;
  responsavel_user_id: string | null;
  venda: { vendedor_id: string | null }[] | null;
};

function readViagemDeleteBody(value: unknown): ViagemDeleteBody {
  if (!value || typeof value !== 'object') return {};
  const body = value as Record<string, unknown>;
  return {
    id: typeof body.id === 'string' ? body.id : null,
    venda_id: typeof body.venda_id === 'string' ? body.venda_id : null,
    company_id: typeof body.company_id === 'string' ? body.company_id : null,
    empresa_id: typeof body.empresa_id === 'string' ? body.empresa_id : null
  };
}

function vendedorOwnsViagem(userId: string, viagem: ViagemDeleteRow) {
  const responsavelId = String(viagem.responsavel_user_id || '').trim();
  const vendaRow = Array.isArray(viagem.venda) ? (viagem.venda[0] ?? null) : null;
  const vendedorId = String(vendaRow?.vendedor_id || '').trim();
  return responsavelId === userId || vendedorId === userId;
}

export async function handleViagensDeletePost(event: RequestEvent) {
  try {
    const originError = rejectCrossOriginRequest(event.request);
    if (originError) return originError;
    const bodyResult = await readJsonBodyLimited(event.request, MAX_VIAGEM_DELETE_BODY_BYTES);
    if (!bodyResult.ok) return bodyResult.response;

    const client = getAdminClient();
    const user = await requireAuthenticatedUser(event);
    const scope = await resolveUserScope(client, user.id);

    if (!scope.isAdmin) {
      ensureModuloAccess(
        scope,
        ['operacao_viagens', 'viagens', 'operacao'],
        4,
        'Sem acesso a Viagens.'
      );
    }

    const body = readViagemDeleteBody(bodyResult.data);
    const id = String(body?.id || '').trim();
    const vendaId = String(body?.venda_id || '').trim();

    if (!id && !vendaId) {
      return json({ error: 'Parametros invalidos.' }, { status: 400, headers: NO_STORE_HEADERS });
    }

    // Valida formato dos IDs
    if (id && !isUuid(id))
      return json({ error: 'ID de viagem inválido.' }, { status: 400, headers: NO_STORE_HEADERS });
    if (vendaId && !isUuid(vendaId))
      return json({ error: 'ID de venda inválido.' }, { status: 400, headers: NO_STORE_HEADERS });

    const companyIds = resolveScopedCompanyIds(scope, body?.company_id || body?.empresa_id);

    // ✅ Guard: admin sem company_id explícito não pode deletar sem escopo
    if (companyIds.length === 0) {
      return json(
        { error: 'Informe company_id para excluir viagem.' },
        { status: 400, headers: NO_STORE_HEADERS }
      );
    }

    const affectedQuery = client
      .from('viagens')
      .select(
        'id, company_id, responsavel_user_id, venda_id, venda:vendas!venda_id(id, vendedor_id)'
      );
    const { data: affectedRows } = vendaId
      ? await affectedQuery.eq('venda_id', vendaId)
      : await affectedQuery.eq('id', id);

    if (!affectedRows || affectedRows.length === 0) {
      return json({ error: 'Viagem nao encontrada.' }, { status: 404, headers: NO_STORE_HEADERS });
    }

    const companySet = cleanStringSet(companyIds);
    const scopedAffectedRows = ((affectedRows || []) as ViagemDeleteRow[]).filter((row) => {
      const companyId = String(row.company_id || '').trim();
      if (companySet.size > 0 && !companySet.has(companyId)) return false;
      if (scope.isVendedor && !vendedorOwnsViagem(user.id, row)) return false;
      return true;
    });

    if ((affectedRows || []).length > 0 && scopedAffectedRows.length === 0) {
      return json(
        { error: 'Sem acesso a esta viagem.' },
        { status: 403, headers: NO_STORE_HEADERS }
      );
    }

    const allowedIds = scopedAffectedRows
      .map((row) => String(row.id || '').trim())
      .filter((rowId) => isUuid(rowId));
    if (allowedIds.length === 0) {
      return json({ error: 'Viagem nao encontrada.' }, { status: 404, headers: NO_STORE_HEADERS });
    }

    for (const batch of chunkArray(allowedIds)) {
      const { error: deleteError } = await client.from('viagens').delete().in('id', batch);
      if (deleteError) throw deleteError;
    }

    invalidateTripReadModels({
      companyIds: Array.from(
        new Set(scopedAffectedRows.map((row) => String(row.company_id || '')).filter(Boolean))
      ),
      vendedorIds: Array.from(
        new Set(
          scopedAffectedRows.map((row) => String(row.responsavel_user_id || '')).filter(Boolean)
        )
      ),
      userId: user.id
    });

    return json({ ok: true }, { headers: NO_STORE_HEADERS });
  } catch (err) {
    return toErrorResponse(err, 'Erro ao excluir viagem.');
  }
}
