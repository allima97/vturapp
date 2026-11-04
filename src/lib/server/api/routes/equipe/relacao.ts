// Migrado para Hono de src/routes/api/v1/equipe/relacao/+server.ts — corpo IDÊNTICO ao original
// (só nome/assinatura do handler e caminhos de import mudaram). Ver src/lib/server/api/app.ts.
import type { RequestEvent } from '@sveltejs/kit';
import { json } from '@sveltejs/kit';
import { readJsonBodyLimited, rejectCrossOriginRequest } from '$lib/server/requestGuards';
import {
  getAdminClient,
  requireAuthenticatedUser,
  isUuid,
  logServerError,
  resolveUserScope
} from '$lib/server/v1';
import { NO_STORE_HEADERS } from '$lib/server/httpCache';

const MAX_EQUIPE_RELACAO_BODY_BYTES = 16 * 1024;
const errorResponse = (message: string, status: number) =>
  json({ error: message }, { status, headers: NO_STORE_HEADERS });

type ScopedUserRow = {
  id?: string | null;
  company_id?: string | null;
};

export const handleEquipeRelacaoPost = async (event: RequestEvent) => {
  try {
    const { request, locals } = event;
    const originError = rejectCrossOriginRequest(request);
    if (originError) return originError;
    const bodyResult = await readJsonBodyLimited(request, MAX_EQUIPE_RELACAO_BODY_BYTES);
    if (!bodyResult.ok) return bodyResult.response;

    const user = await requireAuthenticatedUser(event);
    const client = locals.dados;
    const adminClient = getAdminClient();
    const scope = await resolveUserScope(adminClient, user.id);

    const body =
      bodyResult.data && typeof bodyResult.data === 'object'
        ? (bodyResult.data as Record<string, unknown>)
        : {};
    const gestorId = String(body.gestor_id || "").trim();
    const vendedorId = String(body.vendedor_id || "").trim();
    const ativo = body.ativo === true;

    if (!isUuid(gestorId) || !isUuid(vendedorId)) {
      return errorResponse("Gestor ou vendedor invalido.", 400);
    }
    if (!scope.isAdmin && !scope.isMaster && !scope.isGestor) {
      return errorResponse("Sem permissao para atualizar equipe.", 403);
    }

    const { data: scopedUsers, error: scopedErr } = await adminClient
      .from("users")
      .select("id, company_id")
      .in("id", [gestorId, vendedorId]);
    if (scopedErr) throw scopedErr;

    const byId = new Map<string, ScopedUserRow>();
    for (const row of (scopedUsers || []) as ScopedUserRow[]) {
      byId.set(String(row.id), row);
    }
    const gestor = byId.get(gestorId);
    const vendedor = byId.get(vendedorId);
    if (!gestor || !vendedor) {
      return errorResponse("Gestor ou vendedor nao encontrado.", 404);
    }
    if (!scope.isAdmin) {
      const gestorCompanyId = String(gestor.company_id || "");
      const vendedorCompanyId = String(vendedor.company_id || "");
      if (!scope.companyIds.includes(gestorCompanyId) || !scope.companyIds.includes(vendedorCompanyId)) {
        return errorResponse("Equipe fora do seu escopo.", 403);
      }
    }
    if (scope.isGestor && !scope.isAdmin && !scope.isMaster && gestorId !== user.id) {
      return errorResponse("Gestor so pode alterar a propria equipe.", 403);
    }

    const { data, error } = await client.rpc("set_gestor_vendedor_relacao", {
      p_gestor_id: gestorId,
      p_vendedor_id: vendedorId,
      p_ativo: ativo,
    });

    if (error) {
      logServerError("[equipe/relacao] falha na RPC", error);
      return errorResponse("Erro ao atualizar equipe.", 400);
    }

    return json(data || { ok: true, ativo }, { headers: NO_STORE_HEADERS });
  } catch (error: unknown) {
    logServerError("[equipe/relacao] falha ao atualizar equipe", error);
    return errorResponse("Erro ao atualizar equipe.", 500);
  }
};
