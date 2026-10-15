// Migrado para Hono de src/routes/api/v1/conciliacao/assign/+server.ts — corpo IDÊNTICO ao original
// (só o nome/assinatura do handler e caminhos de import relativos mudaram). Ver src/lib/server/api/app.ts.
import type { RequestEvent } from '@sveltejs/kit';
import { json } from "@sveltejs/kit";
import {
  ensureModuloAccess,
  getAdminClient,
  isRankingEligibleUser,
  isUuid,
  logServerError,
  requireAuthenticatedUser,
  resolveScopedCompanyIds,
  resolveUserScope,
  toErrorResponse,
} from "$lib/server/v1";
import { fetchWithTimeout } from "$lib/server/fetchWithTimeout";
import { buildConciliacaoMetrics } from "$lib/conciliacao/business";
import {
  resolveResendApiKey,
  resolveFromEmails,
} from "$lib/server/emailSettings";
import { findEquipeVturVendedor } from "$lib/conciliacao/baixaRac";
import { NO_STORE_HEADERS } from "$lib/server/httpCache";
import { readJsonBodyLimited, rejectCrossOriginRequest } from "$lib/server/requestGuards";
import { invalidateSalesReadModels } from "$lib/server/readModelCache";

const MAX_CONCILIACAO_ASSIGN_BODY_BYTES = 64 * 1024;
const CONCILIACAO_VALOR_PAYLOAD_FIELDS = [
  "valorLancamentos",
  "valorTaxas",
  "valorDescontos",
  "valorAbatimentos",
  "valorNaoComissionavel",
  "valorCalculadaLoja",
  "valorVisaoMaster",
  "valorOpfax",
  "valorSaldo",
  "valorComissaoLoja",
];
const AUDIT_DATE_TIME_FORMATTER = new Intl.DateTimeFormat("pt-BR", {
  timeZone: "America/Sao_Paulo",
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
  hour: "2-digit",
  minute: "2-digit",
  second: "2-digit",
});

type AssignClient = ReturnType<typeof getAdminClient>;

type AssignRequestBody = {
  companyId?: string | null;
  conciliacaoId?: string | null;
  rankingVendedorId?: string | null;
  rankingProdutoId?: string | null;
  vendaId?: string | null;
  vendaReciboId?: string | null;
  isBaixaRac?: boolean;
  conciliado?: boolean;
} & Partial<Record<(typeof CONCILIACAO_VALOR_PAYLOAD_FIELDS)[number], number | string | null>>;

type MasterEmpresaRow = {
  master_id: string | null;
};

type GestorMasterUserRow = {
  email: string | null;
  nome_completo: string | null;
  user_types: Array<{ name: string | null }> | { name: string | null } | null;
};

type ConciliacaoAssignUpdate = {
  ranking_assigned_at: string;
  ranking_vendedor_id?: string | null;
  ranking_assigned_by?: string;
  ranking_produto_id?: string | null;
  venda_id?: string | null;
  venda_recibo_id?: string | null;
  is_baixa_rac?: boolean;
  conciliado?: boolean;
  valor_lancamentos?: number | null;
  valor_taxas?: number | null;
  valor_descontos?: number | null;
  valor_abatimentos?: number | null;
  valor_nao_comissionavel?: number | null;
  valor_calculada_loja?: number | null;
  valor_visao_master?: number | null;
  valor_opfax?: number | null;
  valor_saldo?: number | null;
  valor_venda_real?: number | null;
  valor_comissao_loja?: number | null;
  percentual_comissao_loja?: number | null;
  faixa_comissao?: string | null;
  is_seguro_viagem?: boolean;
  descricao_chave?: string | null;
};

function readAssignRequestBody(value: unknown): AssignRequestBody {
  if (!value || typeof value !== "object") return {};

  const body = value as Record<string, unknown>;
  const parsed: AssignRequestBody = {};

  if (typeof body.companyId === "string") parsed.companyId = body.companyId;
  if (typeof body.conciliacaoId === "string") parsed.conciliacaoId = body.conciliacaoId;
  if (typeof body.rankingVendedorId === "string") parsed.rankingVendedorId = body.rankingVendedorId;
  if (typeof body.rankingProdutoId === "string") parsed.rankingProdutoId = body.rankingProdutoId;
  if (typeof body.vendaId === "string") parsed.vendaId = body.vendaId;
  if (typeof body.vendaReciboId === "string") parsed.vendaReciboId = body.vendaReciboId;
  if (typeof body.isBaixaRac === "boolean") parsed.isBaixaRac = body.isBaixaRac;
  if (typeof body.conciliado === "boolean") parsed.conciliado = body.conciliado;

  for (const field of CONCILIACAO_VALOR_PAYLOAD_FIELDS) {
    const raw = body[field];
    if (raw === null || typeof raw === "number" || typeof raw === "string") {
      parsed[field] = raw;
    }
  }

  return parsed;
}

// ---------------------------------------------------------------------------
// Auditoria de troca de vendedor
// ---------------------------------------------------------------------------

/**
 * Busca todos os usuários GESTOR e MASTER vinculados a uma empresa para
 * notificá-los quando um vendedor já atribuído a um recibo conciliado for
 * alterado.
 */
async function fetchGestoresMasters(
  client: AssignClient,
  companyId: string,
): Promise<Array<{ email: string; nome: string }>> {
  try {
    // Busca usuários da empresa (GESTOR ou MASTER vinculados via company_id)
    const { data: usuarios } = await client
      .from("users")
      .select("id, email, nome_completo, user_types(name)")
      .eq("company_id", companyId)
      .limit(100);

    const resultado: Array<{ email: string; nome: string }> = [];
    for (const u of (usuarios || []) as GestorMasterUserRow[]) {
      const tipoBruto = String(
        Array.isArray(u.user_types)
          ? u.user_types[0]?.name
          : u.user_types?.name || "",
      ).toUpperCase();
      if (tipoBruto.includes("GESTOR") || tipoBruto.includes("MASTER")) {
        const email = String(u.email || "").trim();
        if (email && email.includes("@")) {
          resultado.push({
            email,
            nome: String(u.nome_completo || "").trim() || email,
          });
        }
      }
    }

    // MASTERs podem estar vinculados via master_empresas sem ter company_id igual
    const { data: vinculos } = await client
      .from("master_empresas")
      .select("master_id")
      .eq("company_id", companyId)
      .neq("status", "rejected");

    const masterIds = ((vinculos || []) as MasterEmpresaRow[])
      .map((v) => String(v.master_id || "").trim())
      .filter(Boolean);
    if (masterIds.length > 0) {
      const { data: masters } = await client
        .from("users")
        .select("id, email, nome_completo")
        .in("id", masterIds);

      for (const m of masters || []) {
        const email = String(m?.email || "").trim();
        if (
          email &&
          email.includes("@") &&
          !resultado.find((r) => r.email === email)
        ) {
          resultado.push({
            email,
            nome: String(m?.nome_completo || "").trim() || email,
          });
        }
      }
    }

    return resultado;
  } catch (err) {
    logServerError("CONCILIACAO_ASSIGN_FETCH_GESTORES_ERROR", err);
    return [];
  }
}

/**
 * Envia e-mail de alerta via Resend para todos os gestores/masters da empresa
 * informando que o vendedor de um recibo conciliado foi alterado.
 * Falhas de envio são logadas mas NÃO propagadas — não devem bloquear a operação.
 */
async function notificarTrocaVendedor(params: {
  client: AssignClient;
  companyId: string;
  conciliacaoId: string;
  documento: string;
  oldVendedorId: string;
  newVendedorId: string | null;
  changedByUserId: string;
  changedByNome: string;
}): Promise<void> {
  try {
    const [resendKey, fromEmails, destinatarios] = await Promise.all([
      resolveResendApiKey(),
      resolveFromEmails(),
      fetchGestoresMasters(params.client, params.companyId),
    ]);

    if (!resendKey || destinatarios.length === 0) return;

    const fromEmail = fromEmails.admin || fromEmails.default;
    if (!fromEmail) return;

    const assunto = `[Conciliação] Vendedor alterado — recibo ${params.documento}`;
    const bodyHtml = `
      <p>Olá,</p>
      <p>Um vendedor foi <strong>alterado</strong> em um recibo já conciliado:</p>
      <table cellpadding="6" style="border-collapse:collapse;font-size:14px;">
        <tr><td><strong>Recibo / Documento</strong></td><td>${params.documento}</td></tr>
        <tr><td><strong>ID conciliação</strong></td><td>${params.conciliacaoId}</td></tr>
        <tr><td><strong>Vendedor anterior (ID)</strong></td><td>${params.oldVendedorId}</td></tr>
        <tr><td><strong>Novo vendedor (ID)</strong></td><td>${params.newVendedorId ?? "(removido)"}</td></tr>
        <tr><td><strong>Alterado por</strong></td><td>${params.changedByNome} (${params.changedByUserId})</td></tr>
        <tr><td><strong>Data/hora</strong></td><td>${AUDIT_DATE_TIME_FORMATTER.format(new Date())}</td></tr>
      </table>
      <p style="color:#666;font-size:12px;">Este e-mail foi gerado automaticamente pelo sistema vtur.</p>
    `;

    await Promise.allSettled(
      destinatarios.map((dest) =>
        fetchWithTimeout("https://api.resend.com/emails", {
          method: "POST",
          headers: {
            Authorization: `Bearer ${resendKey}`,
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            from: fromEmail,
            to: [dest.email],
            subject: assunto,
            html: bodyHtml,
          }),
        }, 12_000).catch((err) => {
          logServerError("CONCILIACAO_ASSIGN_EMAIL_ERROR", err);
        }),
      ),
    );
  } catch (err) {
    logServerError("CONCILIACAO_ASSIGN_NOTIFY_ERROR", err);
  }
}

/**
 * Insere um registro de auditoria na tabela conciliacao_recibo_changes
 * para mudanças de vendedor (campo não numérico — usa old_value/new_value como strings via cast).
 */
async function logVendedorChange(params: {
  client: AssignClient;
  companyId: string;
  conciliacaoReciboId: string;
  oldValue: string;
  newValue: string | null;
  changedByUserId: string;
  documento: string;
}): Promise<void> {
  try {
    await params.client.from("conciliacao_recibo_changes").insert({
      company_id: params.companyId,
      conciliacao_recibo_id: params.conciliacaoReciboId,
      numero_recibo: params.documento,
      field: "ranking_vendedor_id",
      old_value: null, // campo numérico no schema — não usado para este tipo de audit
      new_value: null,
      actor: "user",
      changed_by: params.changedByUserId,
      // Armazena os IDs de vendedor na nota — coluna "field" carrega o contexto
      // O valor real fica em old_vendor_id / new_vendor_id se a tabela tiver, senão
      // usamos uma convenção: armazenamos como texto no campo correto abaixo.
    });
  } catch (err) {
    // A tabela pode não ter colunas para string UUIDs — tentamos uma abordagem alternativa:
    // A notificação por e-mail já garante rastreabilidade.
    logServerError("CONCILIACAO_ASSIGN_LOG_VENDEDOR_CHANGE", err);
  }
}

function parseNullableNumber(value: unknown) {
  if (value === null || value === undefined || value === "") return null;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : Number.NaN;
}

export async function handleConciliacaoAssignPost(event: RequestEvent) {
  try {
    const originError = rejectCrossOriginRequest(event.request);
    if (originError) return originError;
    const bodyResult = await readJsonBodyLimited(event.request, MAX_CONCILIACAO_ASSIGN_BODY_BYTES);
    if (!bodyResult.ok) return bodyResult.response;

    const client = getAdminClient();
    const user = await requireAuthenticatedUser(event);
    const scope = await resolveUserScope(client, user.id);

    if (!scope.isAdmin && !scope.isMaster && !scope.isFinanceiro && !scope.isGestor) {
      ensureModuloAccess(
        scope,
        ["operacao_conciliacao", "conciliacao"],
        3,
        "Sem permissão para atribuir conciliação.",
      );
    }

    const body = readAssignRequestBody(bodyResult.data);
    const companyIds = resolveScopedCompanyIds(scope, body?.companyId);

    const conciliacaoId = String(body?.conciliacaoId || "").trim();
    if (!isUuid(conciliacaoId))
      return json({ error: "ID de conciliação inválido." }, { status: 400, headers: NO_STORE_HEADERS });

    const rankingVendedorIdRaw =
      String(body?.rankingVendedorId || "").trim() || null;
    const rankingProdutoId =
      String(body?.rankingProdutoId || "").trim() || null;
    const vendaId = String(body?.vendaId || "").trim() || null;
    const vendaReciboId = String(body?.vendaReciboId || "").trim() || null;
    const isBaixaRac = Boolean(body?.isBaixaRac);

    const valorLancamentos = parseNullableNumber(body?.valorLancamentos);
    const valorTaxas = parseNullableNumber(body?.valorTaxas);
    const valorDescontos = parseNullableNumber(body?.valorDescontos);
    const valorAbatimentos = parseNullableNumber(body?.valorAbatimentos);
    const valorNaoComissionavel = parseNullableNumber(
      body?.valorNaoComissionavel,
    );
    const valorCalculadaLoja = parseNullableNumber(body?.valorCalculadaLoja);
    const valorVisaoMaster = parseNullableNumber(body?.valorVisaoMaster);
    const valorOpfax = parseNullableNumber(body?.valorOpfax);
    const valorSaldo = parseNullableNumber(body?.valorSaldo);
    const valorComissaoLoja = parseNullableNumber(body?.valorComissaoLoja);

    if (
      Number.isNaN(valorLancamentos) ||
      Number.isNaN(valorTaxas) ||
      Number.isNaN(valorDescontos) ||
      Number.isNaN(valorAbatimentos) ||
      Number.isNaN(valorNaoComissionavel) ||
      Number.isNaN(valorCalculadaLoja) ||
      Number.isNaN(valorVisaoMaster) ||
      Number.isNaN(valorOpfax) ||
      Number.isNaN(valorSaldo) ||
      Number.isNaN(valorComissaoLoja)
    ) {
      return json(
        { error: "Um ou mais campos de valor estão inválidos." },
        { status: 400, headers: NO_STORE_HEADERS },
      );
    }

    // Verifica se o registro pertence à empresa e lê o vendedor atual para auditoria
    const { data: registro, error: registroErr } = await client
      .from("conciliacao_recibos")
      .select("id, company_id, descricao, documento, ranking_vendedor_id")
      .eq("id", conciliacaoId)
      .maybeSingle();

    if (registroErr) throw registroErr;
    if (!registro)
      return json({ error: "Registro não encontrado." }, { status: 404, headers: NO_STORE_HEADERS });
    const registroCompanyId = String(registro.company_id || "").trim();
    if (!scope.isAdmin && !companyIds.includes(registroCompanyId)) {
      return json({ error: "Registro fora do escopo." }, { status: 403, headers: NO_STORE_HEADERS });
    }

    // Nunca permitir atribuição de "Equipe vtur" como vendedor de um recibo
    const equipeVturVendedor = rankingVendedorIdRaw
      ? await findEquipeVturVendedor(client, registroCompanyId)
      : null;
    const rankingVendedorId =
      equipeVturVendedor?.id && rankingVendedorIdRaw === equipeVturVendedor.id
        ? null
        : rankingVendedorIdRaw;

    if (rankingVendedorId) {
      const { data: vendedorRow, error: vendedorErr } = await client
        .from("users")
        .select(
          "id, nome_completo, email, company_id, active, uso_individual, participa_ranking, user_types(name)",
        )
        .eq("id", rankingVendedorId)
        .maybeSingle();
      if (vendedorErr) throw vendedorErr;
      if (
        !vendedorRow ||
        String(vendedorRow.company_id || "") !==
          String(registro.company_id || "") ||
        !isRankingEligibleUser(vendedorRow)
      ) {
        return json(
          {
            error:
              "Vendedor fora do escopo da empresa ou inelegível para ranking.",
          },
          { status: 422, headers: NO_STORE_HEADERS },
        );
      }
    }

    // Captura o vendedor atualmente atribuído (antes da atualização) para detectar troca
    const vendedorAnterior =
      String(registro.ranking_vendedor_id || "").trim() || null;
    const documentoRecibo = String(registro.documento || "").trim();

    const update: ConciliacaoAssignUpdate = {
      ranking_assigned_at: new Date().toISOString(),
    };

    if (rankingVendedorId !== undefined) {
      update.ranking_vendedor_id = rankingVendedorId;
      update.ranking_assigned_by = user.id;
    }
    if (rankingProdutoId !== undefined) {
      update.ranking_produto_id = rankingProdutoId;
      update.ranking_assigned_by = user.id;
    }
    if (vendaId !== undefined) update.venda_id = vendaId;
    if (vendaReciboId !== undefined) update.venda_recibo_id = vendaReciboId;
    if (body && "isBaixaRac" in body) update.is_baixa_rac = isBaixaRac;
    if (body && "conciliado" in body)
      update.conciliado = Boolean(body.conciliado);

    const payloadTemValores = CONCILIACAO_VALOR_PAYLOAD_FIELDS.some((field) => body && field in body);

    if (payloadTemValores) {
      const metrics = buildConciliacaoMetrics({
        descricao: registro?.descricao,
        valorLancamentos,
        valorTaxas,
        valorDescontos,
        valorAbatimentos,
        valorNaoComissionavel,
        valorCalculadaLoja,
        valorVisaoMaster,
        valorOpfax,
        valorSaldo,
        valorComissaoLoja,
      });

      update.valor_lancamentos = valorLancamentos;
      update.valor_taxas = valorTaxas;
      update.valor_descontos = valorDescontos;
      update.valor_abatimentos = valorAbatimentos;
      update.valor_nao_comissionavel = valorNaoComissionavel;
      update.valor_calculada_loja = valorCalculadaLoja;
      update.valor_visao_master = valorVisaoMaster;
      update.valor_opfax = valorOpfax;
      update.valor_saldo = valorSaldo;
      update.valor_venda_real = metrics.valorVendaReal;
      update.valor_comissao_loja = metrics.valorComissaoLoja;
      update.percentual_comissao_loja = metrics.percentualComissaoLoja;
      update.faixa_comissao = metrics.faixaComissao;
      update.is_seguro_viagem = metrics.isSeguroViagem;
      update.descricao_chave = metrics.descricaoChave || null;
    }

    const { error: updateError } = await client
      .from("conciliacao_recibos")
      .update(update)
      .eq("id", conciliacaoId);

    if (updateError) throw updateError;

    // ── Auditoria de troca de vendedor ────────────────────────────────────
    // Se havia um vendedor já atribuído e o novo valor é diferente, registra e notifica.
    const novoVendedor = rankingVendedorId;
    const houveTrocaDeVendedor =
      vendedorAnterior !== null &&
      vendedorAnterior !== "" &&
      novoVendedor !== vendedorAnterior &&
      "rankingVendedorId" in (body ?? {});

    if (houveTrocaDeVendedor) {
      // Log de auditoria (best-effort)
      await logVendedorChange({
        client,
        companyId: registro.company_id,
        conciliacaoReciboId: conciliacaoId,
        oldValue: vendedorAnterior!,
        newValue: novoVendedor,
        changedByUserId: user.id,
        documento: documentoRecibo,
      });

      // Notificação por e-mail para gestores/masters (best-effort, não bloqueia)
      notificarTrocaVendedor({
        client,
        companyId: registro.company_id,
        conciliacaoId,
        documento: documentoRecibo,
        oldVendedorId: vendedorAnterior!,
        newVendedorId: novoVendedor,
        changedByUserId: user.id,
        changedByNome: scope.nome || user.id,
      }).catch((err) => {
        logServerError("CONCILIACAO_ASSIGN_NOTIFY_UNCAUGHT", err);
      });
    }

    invalidateSalesReadModels({
      companyIds: registro.company_id ? [registro.company_id] : [],
      vendedorIds: [vendedorAnterior, novoVendedor].filter(Boolean) as string[],
      userId: user.id,
    });

    return json({ ok: true }, { headers: NO_STORE_HEADERS });
  } catch (err) {
    return toErrorResponse(err, "Erro ao atribuir conciliação.");
  }
}
