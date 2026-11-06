// Migrado para Hono de src/routes/api/v1/operacao/sac/+server.ts — corpo IDÊNTICO ao original
// (só nome/assinatura do handler e caminhos de import mudaram). Ver src/lib/server/api/app.ts.
import type { RequestEvent } from '@sveltejs/kit';
import { json } from '@sveltejs/kit';
import { readJsonBodyLimited, rejectCrossOriginRequest } from '$lib/server/requestGuards';
import {
  ensureModuloAccess,
  getAdminClient,
  isUuid,
  requireAuthenticatedUser,
  resolveScopedCompanyIds,
  resolveUserScope,
  toErrorResponse
} from '$lib/server/v1';
import { DYNAMIC_READ_HEADERS, NO_STORE_HEADERS } from '$lib/server/httpCache';
import { cleanStringSet } from '$lib/utils/array';

const MAX_SAC_BODY_BYTES = 64 * 1024;

type JsonBody = Record<string, unknown>;
type SacRow = {
  recibo?: string | null;
  tour?: string | null;
  motivo?: string | null;
  contratante_pax?: string | null;
  responsavel?: string | null;
};
type ExistingSacRow = {
  company_id?: string | null;
};

export async function handleOperacaoSacGet(event: RequestEvent) {
  try {
    const client = getAdminClient();
    const user = await requireAuthenticatedUser(event);
    const scope = await resolveUserScope(client, user.id);

    if (!scope.isAdmin) {
      ensureModuloAccess(
        scope,
        ['operacao_controle_sac', 'controle_sac', 'operacao'],
        1,
        'Sem acesso ao Controle SAC.'
      );
    }

    const { searchParams } = event.url;
    const status = String(searchParams.get('status') || '').trim();
    const inicio = String(searchParams.get('inicio') || '').trim();
    const fim = String(searchParams.get('fim') || '').trim();
    const q = String(searchParams.get('q') || '').trim();

    let query = client
      .from('sac_controle')
      .select(
        'id, company_id, recibo, tour, data_solicitacao, motivo, contratante_pax, ok_quando, status, responsavel, prazo, created_at, updated_at'
      )
      .order('created_at', { ascending: false })
      .limit(500);

    if (scope.companyId && !scope.isAdmin) query = query.eq('company_id', scope.companyId);
    if (status && status !== 'all') query = query.eq('status', status);
    if (inicio) query = query.gte('data_solicitacao', inicio);
    if (fim) query = query.lte('data_solicitacao', fim);

    const { data, error: queryError } = await query;
    if (queryError) throw queryError;

    let items = data || [];
    if (q) {
      const qLower = q.toLowerCase();
      items = items.filter((item: SacRow) =>
        [item.recibo, item.tour, item.motivo, item.contratante_pax, item.responsavel]
          .join(' ')
          .toLowerCase()
          .includes(qLower)
      );
    }

    return json({ items }, { headers: DYNAMIC_READ_HEADERS });
  } catch (err) {
    return toErrorResponse(err, 'Erro ao carregar registros SAC.');
  }
}

export async function handleOperacaoSacPost(event: RequestEvent) {
  try {
    const originError = rejectCrossOriginRequest(event.request);
    if (originError) return originError;
    const bodyResult = await readJsonBodyLimited(event.request, MAX_SAC_BODY_BYTES);
    if (!bodyResult.ok) return bodyResult.response;

    const client = getAdminClient();
    const user = await requireAuthenticatedUser(event);
    const scope = await resolveUserScope(client, user.id);

    if (!scope.isAdmin) {
      ensureModuloAccess(
        scope,
        ['operacao_controle_sac', 'controle_sac', 'operacao'],
        2,
        'Sem permissão para salvar SAC.'
      );
    }

    const body =
      bodyResult.data && typeof bodyResult.data === 'object' ? (bodyResult.data as JsonBody) : {};
    const {
      id,
      recibo,
      tour,
      data_solicitacao,
      motivo,
      contratante_pax,
      ok_quando,
      status,
      responsavel,
      prazo
    } = body;

    const payload = {
      company_id: scope.companyId,
      recibo: String(recibo || '').trim() || null,
      tour: String(tour || '').trim() || null,
      data_solicitacao: String(data_solicitacao || '').trim() || null,
      motivo: String(motivo || '').trim() || null,
      contratante_pax: String(contratante_pax || '').trim() || null,
      ok_quando: String(ok_quando || '').trim() || null,
      status: String(status || 'aberto').trim(),
      responsavel: String(responsavel || '').trim() || null,
      prazo: String(prazo || '').trim() || null
    };

    let result;
    const idValue = String(id || '').trim();
    if (isUuid(idValue)) {
      const { data: existing, error: existingError } = await client
        .from('sac_controle')
        .select('id, company_id')
        .eq('id', idValue)
        .maybeSingle();
      if (existingError) throw existingError;
      if (!existing)
        return json(
          { error: 'Registro SAC não encontrado.' },
          { status: 404, headers: NO_STORE_HEADERS }
        );
      const existingCompanyId = String((existing as ExistingSacRow)?.company_id || '').trim();
      const allowedCompanyIds = resolveScopedCompanyIds(scope, existingCompanyId || null);
      const allowedCompanySet = cleanStringSet(allowedCompanyIds);
      if (!scope.isAdmin && !allowedCompanySet.has(existingCompanyId)) {
        return json(
          { error: 'Registro SAC fora do escopo da empresa.' },
          { status: 403, headers: NO_STORE_HEADERS }
        );
      }

      const { data, error: updateError } = await client
        .from('sac_controle')
        .update(payload)
        .eq('id', idValue)
        .select('id')
        .single();
      if (updateError) throw updateError;
      result = data;
    } else {
      const { data, error: insertError } = await client
        .from('sac_controle')
        .insert({ ...payload, created_by: scope.userId })
        .select('id')
        .single();
      if (insertError) throw insertError;
      result = data;
    }

    return json({ ok: true, id: result?.id }, { headers: NO_STORE_HEADERS });
  } catch (err) {
    return toErrorResponse(err, 'Erro ao salvar registro SAC.');
  }
}

export async function handleOperacaoSacDelete(event: RequestEvent) {
  try {
    const originError = rejectCrossOriginRequest(event.request);
    if (originError) return originError;

    const client = getAdminClient();
    const user = await requireAuthenticatedUser(event);
    const scope = await resolveUserScope(client, user.id);

    if (!scope.isAdmin) {
      ensureModuloAccess(
        scope,
        ['operacao_controle_sac', 'controle_sac', 'operacao'],
        4,
        'Sem permissão para excluir SAC.'
      );
    }

    const id = String(event.url.searchParams.get('id') || '').trim();
    if (!isUuid(id))
      return json({ error: 'ID inválido.' }, { status: 400, headers: NO_STORE_HEADERS });

    const { data: existing, error: existingError } = await client
      .from('sac_controle')
      .select('id, company_id')
      .eq('id', id)
      .maybeSingle();
    if (existingError) throw existingError;
    if (!existing)
      return json(
        { error: 'Registro SAC não encontrado.' },
        { status: 404, headers: NO_STORE_HEADERS }
      );
    const existingCompanyId = String((existing as ExistingSacRow)?.company_id || '').trim();
    const allowedCompanyIds = resolveScopedCompanyIds(scope, existingCompanyId || null);
    const allowedCompanySet = cleanStringSet(allowedCompanyIds);
    if (!scope.isAdmin && !allowedCompanySet.has(existingCompanyId)) {
      return json(
        { error: 'Registro SAC fora do escopo da empresa.' },
        { status: 403, headers: NO_STORE_HEADERS }
      );
    }

    const { error: deleteError } = await client.from('sac_controle').delete().eq('id', id);
    if (deleteError) throw deleteError;

    return json({ ok: true }, { headers: NO_STORE_HEADERS });
  } catch (err) {
    return toErrorResponse(err, 'Erro ao excluir registro SAC.');
  }
}
