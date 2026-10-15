// Migrado para Hono de src/routes/api/v1/conciliacao/update-valores/+server.ts — corpo IDÊNTICO ao original
// (só o nome/assinatura do handler e caminhos de import relativos mudaram). Ver src/lib/server/api/app.ts.
import { json, type RequestEvent } from "@sveltejs/kit";
import {
  getAdminClient,
  requireAuthenticatedUser,
  resolveScopedCompanyIds,
  resolveUserScope,
  toErrorResponse,
  isUuid,
} from "$lib/server/v1";
import { NO_STORE_HEADERS } from "$lib/server/httpCache";
import { readJsonBodyLimited, rejectCrossOriginRequest } from "$lib/server/requestGuards";
import { invalidateSalesReadModels } from "$lib/server/readModelCache";
import { cleanStringSet } from "$lib/utils/array";

// Espelha: vtur-app/src/pages/api/v1/conciliacao/update-valores.ts
// Permite que Gestor/Master atualizem campos de valor de um registro de conciliacao_recibos.

const ALLOWED_FIELDS = [
  "valor_lancamentos",
  "valor_taxas",
  "valor_descontos",
  "valor_abatimentos",
  "valor_calculada_loja",
  "valor_visao_master",
  "valor_opfax",
  "valor_saldo",
  "valor_nao_comissionavel",
] as const;

const MAX_UPDATE_VALORES_BODY_BYTES = 16 * 1024;

type UpdateValoresBody = {
  conciliacaoId?: string | null;
  companyId?: string | null;
  valores?: Partial<Record<(typeof ALLOWED_FIELDS)[number], number | string | null>>;
};

function readUpdateValoresBody(value: unknown): UpdateValoresBody {
  if (!value || typeof value !== "object") return {};

  const body = value as Record<string, unknown>;
  const parsed: UpdateValoresBody = {};

  if (typeof body.conciliacaoId === "string") parsed.conciliacaoId = body.conciliacaoId;
  if (typeof body.companyId === "string") parsed.companyId = body.companyId;

  if (body.valores && typeof body.valores === "object") {
    const valores = body.valores as Record<string, unknown>;
    const parsedValores: Partial<Record<(typeof ALLOWED_FIELDS)[number], number | string | null>> = {};

    for (const field of ALLOWED_FIELDS) {
      const raw = valores[field];
      if (raw === null || typeof raw === "number" || typeof raw === "string") {
        parsedValores[field] = raw;
      }
    }

    parsed.valores = parsedValores;
  }

  return parsed;
}

export async function handleConciliacaoUpdateValoresPost(event: RequestEvent) {
  try {
    const originError = rejectCrossOriginRequest(event.request);
    if (originError) return originError;
    const bodyResult = await readJsonBodyLimited(event.request, MAX_UPDATE_VALORES_BODY_BYTES);
    if (!bodyResult.ok) return bodyResult.response;

    const client = getAdminClient();
    const user = await requireAuthenticatedUser(event);
    const scope = await resolveUserScope(client, user.id);

    // Apenas Gestor, Master ou Admin podem editar valores de conciliação
    if (
      !scope.isAdmin &&
      scope.papel !== "GESTOR" &&
      scope.papel !== "MASTER" &&
      scope.papel !== "FINANCEIRO"
    ) {
      return json(
        {
          error: "Sem permissão. Apenas Financeiro, Gestor ou Master podem editar valores.",
        },
        { status: 403, headers: NO_STORE_HEADERS },
      );
    }

    const body = readUpdateValoresBody(bodyResult.data);

    const conciliacaoId = String(body?.conciliacaoId || "").trim();
    if (!isUuid(conciliacaoId)) {
      return json(
        { error: "Registro de conciliação inválido." },
        { status: 400, headers: NO_STORE_HEADERS },
      );
    }

    const valores = body?.valores;
    if (!valores || typeof valores !== "object") {
      return json(
        { error: "Nenhum valor fornecido para atualizar." },
        { status: 400, headers: NO_STORE_HEADERS },
      );
    }

    // Construir payload seguro — apenas campos numéricos conhecidos
    const updatePayload: Record<string, number | null> = {};
    for (const field of ALLOWED_FIELDS) {
      if (Object.prototype.hasOwnProperty.call(valores, field)) {
        const raw = valores[field];
        if (raw === null || raw === undefined) {
          updatePayload[field] = null;
        } else {
          const num = Number(raw);
          if (!Number.isFinite(num)) {
            return json(
              { error: `Valor inválido para o campo ${field}.` },
              { status: 400, headers: NO_STORE_HEADERS },
            );
          }
          updatePayload[field] = num;
        }
      }
    }

    if (Object.keys(updatePayload).length === 0) {
      return json(
        { error: "Nenhum campo editável encontrado no payload." },
        { status: 400, headers: NO_STORE_HEADERS },
      );
    }

    const requestedCompanyId = String(body?.companyId || "").trim();
    const allowedCompanyIds = resolveScopedCompanyIds(
      scope,
      isUuid(requestedCompanyId) ? requestedCompanyId : null,
    );
    const allowedCompanySet = cleanStringSet(allowedCompanyIds);

    // Verificar que o registro pertence ao escopo permitido. Para Admin, a empresa
    // é inferida do próprio registro quando não vier explicitamente no payload.
    const { data: existing, error: existErr } = await client
      .from("conciliacao_recibos")
      .select("id, company_id")
      .eq("id", conciliacaoId)
      .maybeSingle();

    if (existErr) throw existErr;
    if (!existing) {
      return json(
        { error: "Registro não encontrado ou sem permissão." },
        { status: 404, headers: NO_STORE_HEADERS },
      );
    }

    const companyId = String(existing.company_id || "").trim();
    if (!companyId || (!scope.isAdmin && !allowedCompanySet.has(companyId))) {
      return json(
        { error: "Registro não encontrado ou sem permissão." },
        { status: 404, headers: NO_STORE_HEADERS },
      );
    }

    const { data: updated, error: updateErr } = await client
      .from("conciliacao_recibos")
      .update({ ...updatePayload, updated_at: new Date().toISOString() })
      .eq("id", conciliacaoId)
      .eq("company_id", companyId)
      .select("id, company_id, documento, movimento_data, status, descricao, valor_lancamentos, valor_taxas, valor_descontos, valor_abatimentos, valor_venda_real, valor_comissao_loja, percentual_comissao_loja, valor_nao_comissionavel, venda_id, venda_recibo_id, ranking_vendedor_id, ranking_produto_id, updated_at")
      .maybeSingle();

    if (updateErr) throw updateErr;

    invalidateSalesReadModels({ companyIds: [companyId], userId: user.id });

    return json({ ok: true, item: updated }, { headers: NO_STORE_HEADERS });
  } catch (err) {
    return toErrorResponse(err, "Erro ao atualizar valores da conciliação.");
  }
}
