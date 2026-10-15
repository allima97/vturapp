// Migrado para Hono de src/routes/api/v1/conciliacao/run/+server.ts — corpo IDÊNTICO ao original
// (só o nome/assinatura do handler e caminhos de import relativos mudaram). Ver src/lib/server/api/app.ts.
import type { RequestEvent } from '@sveltejs/kit';
import { json } from "@sveltejs/kit";
import {
  ensureModuloAccess,
  getAdminClient,
  requireAuthenticatedUser,
  resolveScopedCompanyId,
  resolveUserScope,
  toErrorResponse,
} from "$lib/server/v1";
import {
  reconcilePendentes,
  diagnosticarLacunasCronologicas,
} from "$lib/server/conciliacaoReconcile";
import { NO_STORE_HEADERS } from "$lib/server/httpCache";
import { readJsonBodyLimited, rejectCrossOriginRequest } from "$lib/server/requestGuards";
import { invalidateSalesReadModels } from "$lib/server/readModelCache";

const MAX_CONCILIACAO_RUN_BODY_BYTES = 32 * 1024;

type ConciliacaoRunBody = {
  companyId?: string;
  limit?: number | string;
  conciliacaoReciboId?: string;
  recalculateMonth?: string;
  recalculateAllMonth?: boolean;
  cleanupDuplicatesOnly?: boolean;
};

function readConciliacaoRunBody(value: unknown): ConciliacaoRunBody {
  if (!value || typeof value !== "object") return {};
  const body = value as Record<string, unknown>;
  const parsed: ConciliacaoRunBody = {};

  if (typeof body.companyId === "string") parsed.companyId = body.companyId;
  if (typeof body.limit === "number" || typeof body.limit === "string") parsed.limit = body.limit;
  if (typeof body.conciliacaoReciboId === "string") parsed.conciliacaoReciboId = body.conciliacaoReciboId;
  if (typeof body.recalculateMonth === "string") parsed.recalculateMonth = body.recalculateMonth;
  if (typeof body.recalculateAllMonth === "boolean") parsed.recalculateAllMonth = body.recalculateAllMonth;
  if (typeof body.cleanupDuplicatesOnly === "boolean") parsed.cleanupDuplicatesOnly = body.cleanupDuplicatesOnly;

  return parsed;
}

export async function handleConciliacaoRunPost(event: RequestEvent) {
  try {
    const originError = rejectCrossOriginRequest(event.request);
    if (originError) return originError;
    const bodyResult = await readJsonBodyLimited(event.request, MAX_CONCILIACAO_RUN_BODY_BYTES);
    if (!bodyResult.ok) return bodyResult.response;

    const client = getAdminClient();
    const user = await requireAuthenticatedUser(event);
    const scope = await resolveUserScope(client, user.id);

    if (!scope.isAdmin && !scope.isMaster && !scope.isFinanceiro && !scope.isGestor) {
      ensureModuloAccess(
        scope,
        ["operacao_conciliacao", "conciliacao"],
        3,
        "Sem permissão para executar conciliação.",
      );
    }

    const body = readConciliacaoRunBody(bodyResult.data);
    const companyId = resolveScopedCompanyId(scope, String(body?.companyId || ""));

    if (!companyId)
      return json(
        { error: "Selecione uma empresa para executar a conciliação." },
        { status: 400, headers: NO_STORE_HEADERS },
      );

    const limit = Math.max(1, Math.min(500, Number(body?.limit || 200)));
    const conciliacaoReciboId =
      String(body?.conciliacaoReciboId || "").trim() || null;
    const recalculateMonth =
      String(body?.recalculateMonth || "").trim() || null;
    const recalculateAllMonth = Boolean(body?.recalculateAllMonth);
    const cleanupDuplicatesOnly = Boolean(body?.cleanupDuplicatesOnly);
    const isTargeted = Boolean(
      conciliacaoReciboId || recalculateAllMonth || cleanupDuplicatesOnly,
    );

    const result = await reconcilePendentes({
      client,
      companyId,
      limit,
      conciliacaoReciboId,
      onlyCurrentMonth: !isTargeted,
      recalculateMonth,
      recalculateAllMonth,
      cleanupDuplicatesOnly,
      actor: "user",
      actorUserId: user.id,
    });

    // O diagnóstico cronológico é útil para a conciliação normal, mas é pesado.
    // Não roda junto com recálculo/saneamento para evitar timeout no Worker.
    const diagnostico =
      !conciliacaoReciboId && !recalculateAllMonth && !cleanupDuplicatesOnly
        ? await diagnosticarLacunasCronologicas({ client, companyId })
        : null;

    // Inclui alerta de bloqueio cronológico na resposta quando há lacunas
    const bloqueio =
      diagnostico && diagnostico.diasFaltantes.length > 0
        ? {
            fronteira_cronologica: diagnostico.fronteira,
            dias_faltantes: diagnostico.diasFaltantes,
            dias_bloqueados: diagnostico.diasBloqueados,
            dias_sem_movimento: diagnostico.diasSemMovimento,
            registros_bloqueados: diagnostico.registrosBloqueados,
            aviso:
              `Conciliação bloqueada a partir de ${diagnostico.fronteira}. ` +
              `Faltam os arquivos dos dias: ${diagnostico.diasFaltantes
                .map((d) => {
                  const [y, m, dia] = d.split("-");
                  return `${dia}/${m}/${y}`;
                })
                .join(", ")}. ` +
              `Importe esses arquivos para liberar ${diagnostico.registrosBloqueados} registro(s) bloqueado(s).`,
          }
        : null;

    invalidateSalesReadModels({ companyIds: [companyId], userId: user.id });

    return json({ ok: true, ...result, ...(bloqueio ? { bloqueio } : {}) }, { headers: NO_STORE_HEADERS });
  } catch (err) {
    return toErrorResponse(err, "Erro ao executar conciliação.");
  }
}
