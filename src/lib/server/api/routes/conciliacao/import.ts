// Migrado para Hono de src/routes/api/v1/conciliacao/import/+server.ts — corpo IDÊNTICO ao original
// (só o nome/assinatura do handler e caminhos de import relativos mudaram). Ver src/lib/server/api/app.ts.
import type { RequestEvent } from '@sveltejs/kit';
import { json } from "@sveltejs/kit";
import type { SupabaseClient } from "@supabase/supabase-js";
import {
  ensureModuloAccess,
  fetchRankingVendedoresByCompanyIds,
  getAdminClient,
  requireAuthenticatedUser,
  resolveScopedCompanyId,
  resolveUserScope,
  toErrorResponse,
} from "$lib/server/v1";
import type { ConciliacaoLinhaInput } from "../../../../../routes/api/v1/conciliacao/_types";
import {
  isConciliacaoImportavel,
  normalizeConciliacaoDescricaoKey,
  buildConciliacaoMetrics,
  resolveConciliacaoStatus,
} from "$lib/conciliacao/business";
import { diagnosticarLacunasCronologicas } from "$lib/server/conciliacaoReconcile";
import { NO_STORE_HEADERS } from "$lib/server/httpCache";
import { readJsonBodyLimited, rejectCrossOriginRequest } from "$lib/server/requestGuards";
import { invalidateSalesReadModels } from "$lib/server/readModelCache";
import { findEquipeVturVendedor } from "$lib/conciliacao/baixaRac";
import { chunkArray, uniqueCleanStrings } from "$lib/utils/array";
import { toUserMessage } from "$lib/utils/errors";

const MAX_CONCILIACAO_IMPORT_BODY_BYTES = 8 * 1024 * 1024;

// ---------------------------------------------------------------------------
// Helpers de número de recibo
// ---------------------------------------------------------------------------

function normalizeNumeroRecibo(value: string) {
  return String(value || "")
    .toUpperCase()
    .replace(/[^A-Z0-9]/g, "");
}

function onlyDigits(value?: string | null) {
  return String(value ?? "").replace(/\D+/g, "");
}

function reciboCoreDigits(value?: string | null) {
  const digits = onlyDigits(value);
  if (!digits) return "";
  return digits.length >= 10 ? digits.slice(-10) : digits;
}

function stripLeadingZeros(value?: string | null) {
  const raw = String(value ?? "").replace(/^0+/, "");
  return raw || "0";
}

function extractReciboPrefix(value?: string | null) {
  const raw = String(value ?? "").trim();
  if (!raw) return "";
  const prefixMatch = raw.match(/^(\d{4})\D+/);
  if (prefixMatch?.[1]) return prefixMatch[1];
  const digits = onlyDigits(raw);
  return digits.length >= 14 ? digits.slice(0, 4) : "";
}

function numeroReciboMatches(left?: string | null, right?: string | null) {
  const leftCompact = normalizeNumeroRecibo(String(left || ""));
  const rightCompact = normalizeNumeroRecibo(String(right || ""));
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
  if (
    !leftSignificantCore ||
    !rightSignificantCore ||
    leftSignificantCore !== rightSignificantCore
  ) {
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

function isRexturImportLine(linha: ConciliacaoLinhaInput) {
  return (
    normalizeNumeroRecibo(linha.documento) === "REXTUR" ||
    String(linha.origem || "")
      .toLowerCase()
      .includes("rextur")
  );
}

function normalizeRexturLocalizador(value?: string | null) {
  return String(value || "")
    .trim()
    .replace(/^REXTUR[\s-]*/i, "")
    .toUpperCase()
    .replace(/[^A-Z0-9]/g, "");
}

function shouldUseFallbackDedup(linha: ConciliacaoLinhaInput) {
  return !isRexturImportLine(linha);
}

// ---------------------------------------------------------------------------
// Busca de recibos no sistema (para auto-link de vendedor)
// ---------------------------------------------------------------------------

type ReciboCandidate = {
  id: string;
  venda_id: string;
  vendedor_id: string | null;
  numero_recibo: string | null;
  valor_total: number | null;
  valor_taxas: number | null;
};

type ReciboCandidateLookupRow = {
  id?: string | null;
  venda_id?: string | null;
  numero_recibo?: string | null;
  numero_reserva?: string | null;
  valor_total?: number | null;
  valor_taxas?: number | null;
};

type VendaLookupRow = {
  id?: string | null;
  company_id?: string | null;
  vendedor_id?: string | null;
};

type ConciliacaoDiaSemMovimentoRow = {
  data?: string | null;
};

type ConciliacaoExistenteRow = {
  id?: string | null;
  documento?: string | null;
  numero_reserva?: string | null;
  movimento_data?: string | null;
  descricao?: string | null;
  ranking_vendedor_id?: string | null;
  ranking_produto_id?: string | null;
  venda_id?: string | null;
  venda_recibo_id?: string | null;
};

type ConciliacaoImportBody = {
  companyId?: string | null;
  linhas?: ConciliacaoLinhaInput[];
};

function readConciliacaoLinhaInput(value: unknown): ConciliacaoLinhaInput | null {
  if (!value || typeof value !== "object") return null;

  const row = value as Record<string, unknown>;
  if (typeof row.documento !== "string") return null;

  const parsed: ConciliacaoLinhaInput = {
    documento: row.documento,
  };

  if (typeof row.numero_reserva === "string") parsed.numero_reserva = row.numero_reserva;
  if (typeof row.movimento_data === "string") parsed.movimento_data = row.movimento_data;
  if (typeof row.status === "string") parsed.status = row.status as ConciliacaoLinhaInput["status"];
  if (typeof row.descricao === "string") parsed.descricao = row.descricao;
  if (typeof row.descricao_chave === "string") parsed.descricao_chave = row.descricao_chave;
  if (typeof row.origem === "string") parsed.origem = row.origem;
  if (typeof row.ranking_vendedor_id === "string") parsed.ranking_vendedor_id = row.ranking_vendedor_id;
  if (typeof row.ranking_produto_id === "string") parsed.ranking_produto_id = row.ranking_produto_id;
  if (typeof row.is_seguro_viagem === "boolean") parsed.is_seguro_viagem = row.is_seguro_viagem;
  parsed.raw = row.raw;

  const numericFields = [
    "valor_lancamentos",
    "valor_taxas",
    "valor_descontos",
    "valor_abatimentos",
    "valor_calculada_loja",
    "valor_visao_master",
    "valor_opfax",
    "valor_saldo",
    "valor_venda_real",
    "valor_comissao_loja",
    "percentual_comissao_loja",
    "valor_nao_comissionavel",
  ] as const;

  for (const field of numericFields) {
    const raw = row[field];
    if (raw === null || typeof raw === "number") {
      parsed[field] = raw;
    }
  }

  return parsed;
}

function readConciliacaoImportBody(value: unknown): ConciliacaoImportBody {
  if (!value || typeof value !== "object") return {};

  const body = value as Record<string, unknown>;
  const parsed: ConciliacaoImportBody = {};

  if (typeof body.companyId === "string") parsed.companyId = body.companyId;
  if (Array.isArray(body.linhas)) {
    parsed.linhas = body.linhas
      .map(readConciliacaoLinhaInput)
      .filter((linha): linha is ConciliacaoLinhaInput => Boolean(linha));
  }

  return parsed;
}

type ConciliacaoLinhaLinkInput = ConciliacaoLinhaInput & {
  venda_id?: string | null;
  venda_recibo_id?: string | null;
};

async function fetchReciboCandidates(params: {
  client: SupabaseClient;
  numero: string;
  companyId: string;
}): Promise<ReciboCandidate[]> {
  const { client, numero, companyId } = params;

  const numeroNormalizado = normalizeNumeroRecibo(numero);
  const token = stripLeadingZeros(reciboCoreDigits(numero));
  const byId = new Map<string, ReciboCandidate>();

  const [normResp, exactResp, fuzzyResp] = await Promise.all([
    numeroNormalizado
      ? client
          .from("vendas_recibos")
          .select("id, venda_id, numero_recibo, valor_total, valor_taxas")
          .eq("numero_recibo_normalizado", numeroNormalizado)
          .limit(30)
      : Promise.resolve({ data: [] as ReciboCandidateLookupRow[] }),
    numero
      ? client
          .from("vendas_recibos")
          .select("id, venda_id, numero_recibo, valor_total, valor_taxas")
          .eq("numero_recibo", numero)
          .limit(30)
      : Promise.resolve({ data: [] as ReciboCandidateLookupRow[] }),
    token && token.length >= 5
      ? client
          .from("vendas_recibos")
          .select("id, venda_id, numero_recibo, valor_total, valor_taxas")
          .ilike("numero_recibo", `%${token}%`)
          .limit(50)
      : Promise.resolve({ data: [] as ReciboCandidateLookupRow[] }),
  ]);

  for (const row of [
    ...(normResp?.data || []),
    ...(exactResp?.data || []),
    ...(fuzzyResp?.data || []),
  ]) {
    const id = String(row?.id || "").trim();
    const vendaId = String(row?.venda_id || "").trim();
    if (!id || !vendaId) continue;
    if (!numeroReciboMatches(numero, row?.numero_recibo)) continue;
    byId.set(id, {
      id,
      venda_id: vendaId,
      vendedor_id: null,
      numero_recibo: row?.numero_recibo ?? null,
      valor_total: row?.valor_total ?? null,
      valor_taxas: row?.valor_taxas ?? null,
    });
  }

  const candidates = Array.from(byId.values());
  if (candidates.length === 0) return [];

  const vendaIds = uniqueCleanStrings(candidates.map((row) => row.venda_id));
  const vendaMap = new Map<
    string,
    { company_id: string | null; vendedor_id: string | null }
  >();
  for (const batch of chunkArray(vendaIds)) {
    const { data: vendas } = await client
      .from("vendas")
      .select("id, company_id, vendedor_id")
      .in("id", batch)
      .eq("company_id", companyId);

    for (const row of (vendas || []) as VendaLookupRow[]) {
      const id = String(row?.id || "").trim();
      if (!id) continue;
      vendaMap.set(id, {
        company_id: String(row?.company_id || "").trim() || null,
        vendedor_id: String(row?.vendedor_id || "").trim() || null,
      });
    }
  }

  return candidates
    .filter((row) => Boolean(vendaMap.get(row.venda_id)?.company_id))
    .map((row) => ({
      ...row,
      vendedor_id: vendaMap.get(row.venda_id)?.vendedor_id || null,
    }));
}

async function findReciboByNumero(params: {
  client: SupabaseClient;
  companyId: string;
  numero: string;
  valorLancamento?: number | null;
  valorTaxas?: number | null;
}) {
  const numero = String(params.numero || "").trim();
  if (!numero) return null;
  const rows = await fetchReciboCandidates({
    client: params.client,
    numero,
    companyId: params.companyId,
  });

  if (rows.length === 0) return null;

  const targetTotal = Number(params.valorLancamento || 0);
  const targetTaxas = Number(params.valorTaxas || 0);

  const reciboExato = rows.find(
    (item) => String(item?.numero_recibo || "").trim() === numero,
  );
  if (reciboExato) return { recibo: reciboExato };

  const compativeis = rows.filter((item) =>
    numeroReciboMatches(numero, item?.numero_recibo),
  );
  if (compativeis.length === 0) return null;

  const ranked = [...compativeis].sort((a, b) => {
    const aTotalDiff = Math.abs(Number(a?.valor_total || 0) - targetTotal);
    const bTotalDiff = Math.abs(Number(b?.valor_total || 0) - targetTotal);
    if (aTotalDiff !== bTotalDiff) return aTotalDiff - bTotalDiff;
    const aTaxDiff = Math.abs(Number(a?.valor_taxas || 0) - targetTaxas);
    const bTaxDiff = Math.abs(Number(b?.valor_taxas || 0) - targetTaxas);
    return aTaxDiff - bTaxDiff;
  });

  const porValor = ranked.filter((item) =>
    params.valorLancamento == null
      ? true
      : matches(Number(item?.valor_total || 0), targetTotal),
  );
  const porTaxas = porValor.filter((item) =>
    params.valorTaxas == null
      ? true
      : matches(Number(item?.valor_taxas || 0), targetTaxas),
  );

  const escolhido =
    (porTaxas.length === 1 ? porTaxas[0] : null) ||
    (porValor.length === 1 ? porValor[0] : null) ||
    (ranked.length === 1 ? ranked[0] : null);

  return escolhido ? { recibo: escolhido } : null;
}

async function findRexturReciboByReserva(params: {
  client: SupabaseClient;
  companyId: string;
  reserva?: string | null;
  valorLancamento?: number | null;
  valorTaxas?: number | null;
}) {
  const localizador = normalizeRexturLocalizador(params.reserva);
  if (!localizador) return null;

  const { data: rows } = await params.client
    .from("vendas_recibos")
    .select(
      "id, venda_id, numero_recibo, numero_reserva, valor_total, valor_taxas",
    )
    .eq("numero_recibo", "REXTUR")
    .or(
      `numero_reserva.eq.${localizador},numero_reserva.eq.REXTUR-${localizador},numero_reserva.ilike.${localizador},numero_reserva.ilike.REXTUR-${localizador}`,
    )
    .limit(20);

  const recibos = (rows || [])
    .map((row: ReciboCandidateLookupRow) => ({
      id: String(row?.id || "").trim(),
      venda_id: String(row?.venda_id || "").trim(),
      numero_recibo: row?.numero_recibo ?? null,
      numero_reserva: row?.numero_reserva ?? null,
      valor_total: row?.valor_total ?? null,
      valor_taxas: row?.valor_taxas ?? null,
      vendedor_id: null as string | null,
    }))
    .filter((row) => row.id && row.venda_id);

  if (recibos.length === 0) return null;

  const vendaIds = uniqueCleanStrings(recibos.map((row) => row.venda_id));
  const vendaMap = new Map<string, string | null>();
  for (const batch of chunkArray(vendaIds)) {
    const { data: vendas } = await params.client
      .from("vendas")
      .select("id, company_id, vendedor_id")
      .in("id", batch)
      .eq("company_id", params.companyId);

    for (const venda of (vendas || []) as VendaLookupRow[]) {
      const id = String(venda?.id || "").trim();
      if (id)
        vendaMap.set(
          id,
          String(venda?.vendedor_id || "").trim() || null,
        );
    }
  }

  const candidatos = recibos
    .filter((row) => vendaMap.has(row.venda_id))
    .map((row) => ({
      ...row,
      vendedor_id: vendaMap.get(row.venda_id) || null,
    }));

  if (candidatos.length === 0) return null;
  if (candidatos.length === 1) return { recibo: candidatos[0] };

  const targetTotal = Number(params.valorLancamento || 0);
  const targetTaxas = Number(params.valorTaxas || 0);
  const porValor = candidatos.filter((item) =>
    params.valorLancamento == null
      ? true
      : matches(Number(item?.valor_total || 0), targetTotal),
  );
  const porTaxas = porValor.filter((item) =>
    params.valorTaxas == null
      ? true
      : matches(Number(item?.valor_taxas || 0), targetTaxas),
  );

  const escolhido =
    (porTaxas.length === 1 ? porTaxas[0] : null) ||
    (porValor.length === 1 ? porValor[0] : null);

  return escolhido ? { recibo: escolhido } : null;
}

// ---------------------------------------------------------------------------
// Chaves de deduplicação de importação
// ---------------------------------------------------------------------------

function buildImportKey(
  companyId: string,
  movimentoData?: string | null,
  documento?: string | null,
  descricao?: string | null,
) {
  return [
    companyId,
    String(movimentoData || "").trim(),
    String(documento || "").trim(),
    normalizeConciliacaoDescricaoKey(descricao),
  ].join("::");
}

function buildRexturImportKey(
  companyId: string,
  movimentoData?: string | null,
  documento?: string | null,
  numeroReserva?: string | null,
) {
  return [
    companyId,
    String(movimentoData || "").trim(),
    String(documento || "").trim(),
    normalizeRexturLocalizador(numeroReserva),
  ].join("::");
}

/** Chave sem descrição — usada no fallbackMap para capturar o mesmo recibo
 *  que veio com descrição levemente diferente em importações subsequentes. */
function buildImportFallbackKey(
  companyId: string,
  movimentoData?: string | null,
  documento?: string | null,
) {
  return [
    companyId,
    String(movimentoData || "").trim(),
    String(documento || "").trim(),
  ].join("::");
}

function getLinhaLinkFields(linha: ConciliacaoLinhaInput) {
  const value = linha as ConciliacaoLinhaLinkInput;
  return {
    vendaId: String(value.venda_id || "").trim() || null,
    vendaReciboId: String(value.venda_recibo_id || "").trim() || null,
  };
}

// ---------------------------------------------------------------------------
// Handler principal
// ---------------------------------------------------------------------------

export async function handleConciliacaoImportPost(event: RequestEvent) {
  try {
    const originError = rejectCrossOriginRequest(event.request);
    if (originError) return originError;
    const bodyResult = await readJsonBodyLimited(event.request, MAX_CONCILIACAO_IMPORT_BODY_BYTES);
    if (!bodyResult.ok) return bodyResult.response;

    const client = getAdminClient();
    const user = await requireAuthenticatedUser(event);
    const scope = await resolveUserScope(client, user.id);

    if (!scope.isAdmin && !scope.isMaster && !scope.isFinanceiro && !scope.isGestor) {
      ensureModuloAccess(
        scope,
        ["operacao_conciliacao", "conciliacao"],
        3,
        "Sem permissão para importar conciliação.",
      );
    }

    const body = readConciliacaoImportBody(bodyResult.data);
    const companyId = resolveScopedCompanyId(scope, body?.companyId);

    if (!companyId)
      return json(
        { error: "Selecione uma empresa para importar conciliação." },
        { status: 400, headers: NO_STORE_HEADERS },
      );

    const linhas: ConciliacaoLinhaInput[] = Array.isArray(body?.linhas)
      ? body.linhas
      : [];
    if (linhas.length === 0)
      return json({ error: "Nenhuma linha para importar." }, { status: 400, headers: NO_STORE_HEADERS });

    // Filtra apenas linhas importáveis (BAIXA / OPFAX / ESTORNO)
    const importaveis = linhas.filter((linha) =>
      isConciliacaoImportavel({
        status: linha.status,
        descricao: linha.descricao,
      }),
    );

    if (importaveis.length === 0) {
      return json({
        ok: true,
        importados: 0,
        ignorados: linhas.length,
        message: "Nenhuma linha com status importável (BAIXA/OPFAX/ESTORNO).",
      });
    }

    // ── Validação: todas as linhas precisam ter data de movimento ─────────
    const semDataMovimento = importaveis.filter(
      (linha) => !String(linha.movimento_data || "").trim(),
    );
    if (semDataMovimento.length > 0) {
      return json(
        {
          error:
            "Data do movimento não identificada no arquivo. A importação não grava a data atual como fallback.",
          sem_data_movimento: semDataMovimento.length,
        },
        { status: 400 },
      );
    }

    // ── Validação: datas marcadas como "sem movimento" não podem receber importação ──
    const datasImportaveis = uniqueCleanStrings(
      importaveis.map((linha) => linha.movimento_data),
    );
    let diasSemMovimento: ConciliacaoDiaSemMovimentoRow[] = [];
    try {
      const { data } = await client
        .from("conciliacao_dias_sem_movimento")
        .select("data")
        .eq("company_id", companyId)
        .in("data", datasImportaveis);
      diasSemMovimento = data || [];
    } catch (err: unknown) {
      const msg = toUserMessage(err, String(err || "")).toLowerCase();
      const code =
        typeof err === "object" && err !== null && "code" in err
          ? String(err.code || "").trim()
          : "";
      const isMissing =
        code === "42P01" ||
        msg.includes("does not exist") ||
        msg.includes("could not find") ||
        msg.includes("conciliacao_dias_sem_movimento");
      if (!isMissing) throw err;
    }

    const datasBloqueadas = diasSemMovimento
      .map((row) => String(row?.data || ""))
      .filter(Boolean);
    if (datasBloqueadas.length > 0) {
      const fmt = (d: string) => {
        const [y, m, dia] = d.split("-");
        return `${dia}/${m}/${y}`;
      };
      return json(
        {
          error: `Não é possível importar arquivo(s) para data(s) já marcada(s) como "sem movimento": ${datasBloqueadas.map(fmt).join(", ")}.`,
          datas_bloqueadas: datasBloqueadas,
        },
        { status: 409 },
      );
    }

    // ── Busca registros já existentes (exactMap + fallbackMap) ────────────
    const { data: existentes } = await client
      .from("conciliacao_recibos")
      .select(
        "id, documento, numero_reserva, movimento_data, descricao, ranking_vendedor_id, ranking_produto_id, venda_id, venda_recibo_id",
      )
      .eq("company_id", companyId)
      .in(
        "documento",
        importaveis.map((l) => l.documento),
      )
      .limit(5000);

    // Mapa exato: chave = companyId::data::documento::descricao
    const existentesRows = (existentes || []) as ConciliacaoExistenteRow[];
    const existentesByKey = new Map<string, ConciliacaoExistenteRow>(
      existentesRows.map((row) => [
        buildImportKey(
          companyId,
          row.movimento_data,
          row.documento,
          row.descricao,
        ),
        row,
      ]),
    );

    const existentesRexturByKey = new Map<string, ConciliacaoExistenteRow>();
    for (const row of existentesRows) {
      const reserva = normalizeRexturLocalizador(row?.numero_reserva);
      if (!reserva) continue;
      existentesRexturByKey.set(
        buildRexturImportKey(
          companyId,
          row.movimento_data,
          row.documento,
          reserva,
        ),
        row,
      );
    }

    // Mapa fallback: chave = companyId::data::documento (sem descrição)
    // Usado quando a descrição mudou levemente entre importações (evita duplicatas)
    const existentesByFallbackKey = new Map<string, ConciliacaoExistenteRow[]>();
    for (const row of existentesRows) {
      const fk = buildImportFallbackKey(
        companyId,
        row.movimento_data,
        row.documento,
      );
      const bucket = existentesByFallbackKey.get(fk) || [];
      bucket.push(row);
      existentesByFallbackKey.set(fk, bucket);
    }

    // ── Carrega o ID do vendedor "Equipe vtur" para proteger atribuição ──
    const equipeVturVendedor = await findEquipeVturVendedor(client, companyId);
    const equipeVturId = equipeVturVendedor?.id ?? null;
    const rankingVendedorPermitidos = new Set(
      (await fetchRankingVendedoresByCompanyIds(client, [companyId]))
        .map((row) => String(row?.id || "").trim())
        .filter(Boolean),
    );
    const sanitizeRankingVendedorId = (value?: unknown) => {
      const id = String(value || "").trim() || null;
      if (!id) return null;
      if (equipeVturId && id === equipeVturId) return null;
      return rankingVendedorPermitidos.has(id) ? id : null;
    };

    // ── Build de cada linha a inserir/atualizar ───────────────────────────
    const buildRow = async (l: ConciliacaoLinhaInput) => {
      const statusResolvido = resolveConciliacaoStatus({
        status: l.status,
        descricao: l.descricao,
      });

      const metrics = buildConciliacaoMetrics({
        descricao: l.descricao,
        valorLancamentos: l.valor_lancamentos,
        valorTaxas: l.valor_taxas,
        valorDescontos: l.valor_descontos,
        valorAbatimentos: l.valor_abatimentos,
        valorNaoComissionavel: l.valor_nao_comissionavel,
        valorSaldo: l.valor_saldo,
        valorOpfax: l.valor_opfax,
        valorCalculadaLoja: l.valor_calculada_loja,
        valorVisaoMaster: l.valor_visao_master,
        valorComissaoLoja: l.valor_comissao_loja,
        percentualComissaoLoja: l.percentual_comissao_loja,
      });

      let rankingVendedorId = sanitizeRankingVendedorId(l.ranking_vendedor_id);
      const linkedFields = getLinhaLinkFields(l);
      let vendaId = linkedFields.vendaId;
      let vendaReciboId = linkedFields.vendaReciboId;

      if (!rankingVendedorId || !vendaReciboId || !vendaId) {
        const found = isRexturImportLine(l)
          ? await findRexturReciboByReserva({
              reserva: l.numero_reserva,
              companyId,
              valorLancamento: l.valor_lancamentos ?? null,
              valorTaxas: l.valor_taxas ?? null,
              client,
            })
          : await findReciboByNumero({
              numero: l.documento,
              companyId,
              valorLancamento: l.valor_lancamentos ?? null,
              valorTaxas: l.valor_taxas ?? null,
              client,
            });

        if (found?.recibo) {
          const vendedorIdCandidato =
            String(found.recibo.vendedor_id || "").trim() || null;
          // Nunca atribuir "Equipe vtur" como vendedor de um recibo de conciliação
          const vendedorIdValido =
            sanitizeRankingVendedorId(vendedorIdCandidato);
          rankingVendedorId = rankingVendedorId || vendedorIdValido;
          vendaId =
            vendaId || String(found.recibo.venda_id || "").trim() || null;
          vendaReciboId =
            vendaReciboId || String(found.recibo.id || "").trim() || null;
        }
      }

      return {
        company_id: companyId,
        documento: String(l.documento || "").trim(),
        movimento_data: String(l.movimento_data || "").trim(),
        status: statusResolvido,
        descricao: String(l.descricao || "").trim() || null,
        descricao_chave: metrics.descricaoChave || null,
        valor_lancamentos: l.valor_lancamentos ?? null,
        valor_taxas: l.valor_taxas ?? null,
        valor_descontos: l.valor_descontos ?? null,
        valor_abatimentos: l.valor_abatimentos ?? null,
        valor_nao_comissionavel: l.valor_nao_comissionavel ?? null,
        valor_calculada_loja: l.valor_calculada_loja ?? null,
        valor_visao_master: l.valor_visao_master ?? null,
        valor_opfax: l.valor_opfax ?? null,
        valor_saldo: l.valor_saldo ?? null,
        valor_venda_real: metrics.valorVendaReal,
        valor_comissao_loja: metrics.valorComissaoLoja,
        percentual_comissao_loja: metrics.percentualComissaoLoja,
        faixa_comissao: metrics.faixaComissao,
        is_seguro_viagem: metrics.isSeguroViagem,
        ranking_vendedor_id: rankingVendedorId,
        ranking_produto_id: String(l.ranking_produto_id || "").trim() || null,
        venda_id: vendaId,
        venda_recibo_id: vendaReciboId,
        numero_reserva: normalizeRexturLocalizador(l.numero_reserva) || null,
        origem: String(l.origem || "manual").trim(),
        conciliado: false,
      };
    };

    type ImportRowDraft = Awaited<ReturnType<typeof buildRow>>;
    type ImportRowUpdateValues = Omit<ImportRowDraft, "company_id"> & {
      match_total: null;
      match_taxas: null;
      sistema_valor_total: null;
      sistema_valor_taxas: null;
      diff_total: null;
      diff_taxas: null;
      last_checked_at: null;
      conciliado_em: null;
    };

    const usedExistingIds = new Set<string>();
    const rowsToInsert: ImportRowDraft[] = [];
    const rowsToUpdate: Array<{ id: string; values: ImportRowUpdateValues }> = [];
    const diferencas: Array<{
      documento: string;
      movimento_data: string;
      valor_importacao: number;
      valor_sistema: number;
      taxas_importacao: number;
      taxas_sistema: number;
      diff_total: number;
      diff_taxas: number;
    }> = [];

    for (const l of importaveis) {
      const row = await buildRow(l);

      // Detecta diferenças entre importação e venda existente
      const vendaReciboIdLinked = String(row.venda_recibo_id || "").trim();
      if (vendaReciboIdLinked) {
        const importTotal = Number(l.valor_lancamentos || 0);
        const importTaxas = Number(l.valor_taxas || 0);
        // Tenta obter valores do recibo encontrado em buildRow (via findReciboByNumero)
        // Como não temos acesso direto, buscamos do cache ou fazemos uma busca em batch depois
      }

      // 1ª tentativa: chave exata (inclui descrição normalizada)
      const rexturKey = isRexturImportLine(l)
        ? buildRexturImportKey(
            companyId,
            l.movimento_data,
            l.documento,
            l.numero_reserva,
          )
        : "";
      let existing: ConciliacaoExistenteRow | null =
        (rexturKey ? existentesRexturByKey.get(rexturKey) : null) ||
        existentesByKey.get(
          buildImportKey(companyId, l.movimento_data, l.documento, l.descricao),
        ) ||
        null;

      // 2ª tentativa: chave fallback (sem descrição) — evita duplicatas por variação de descrição
      if (!existing && shouldUseFallbackDedup(l)) {
        const fk = buildImportFallbackKey(
          companyId,
          l.movimento_data,
          l.documento,
        );
        const candidates = (existentesByFallbackKey.get(fk) || []).filter(
          (candidate) => !usedExistingIds.has(String(candidate.id)),
        );
        if (candidates.length > 0) {
          // Prefere o registro com mesmos valores financeiros; fallback: o mais recente (primeiro)
          existing = candidates[0];
        }
      }

      if (existing?.id) {
        usedExistingIds.add(String(existing.id));
        const { company_id: _companyId, ...values } = row;
        rowsToUpdate.push({
          id: String(existing.id),
          values: {
            ...values,
            // Preserva atribuições manuais de vendedor/produto/venda já existentes
            ranking_vendedor_id: sanitizeRankingVendedorId(
              values.ranking_vendedor_id ?? existing.ranking_vendedor_id,
            ),
            ranking_produto_id:
              values.ranking_produto_id ?? existing.ranking_produto_id ?? null,
            venda_id: values.venda_id ?? existing.venda_id ?? null,
            venda_recibo_id:
              values.venda_recibo_id ?? existing.venda_recibo_id ?? null,
            // Reseta estado de conciliação para reprocessamento
            match_total: null,
            match_taxas: null,
            sistema_valor_total: null,
            sistema_valor_taxas: null,
            diff_total: null,
            diff_taxas: null,
            last_checked_at: null,
            conciliado_em: null,
          },
        });
      } else {
        rowsToInsert.push(row);
      }
    }

    // ── Detecção de diferenças: busca valores do sistema para recibos linkados ──
    const allRows = [...rowsToInsert, ...rowsToUpdate.map((u) => u.values)];
    const reciboIdsToCheck = Array.from(
      new Set(
        allRows
          .map((r) => String(r.venda_recibo_id || "").trim())
          .filter(Boolean),
      ),
    );
    if (reciboIdsToCheck.length > 0) {
      const reciboValorMap = new Map<
        string,
        { valor_total: number; valor_taxas: number }
      >();
      for (const batch of chunkArray(reciboIdsToCheck)) {
        const { data: recibosSistema } = await client
          .from("vendas_recibos")
          .select("id, valor_total, valor_taxas")
          .in("id", batch);

        for (const r of recibosSistema || []) {
          const id = String(r?.id || "").trim();
          if (id) {
            reciboValorMap.set(id, {
              valor_total: Number(r?.valor_total || 0),
              valor_taxas: Number(r?.valor_taxas || 0),
            });
          }
        }
      }

      for (const l of importaveis) {
        const documento = String(l.documento || "").trim();
        const reserva = normalizeRexturLocalizador(l.numero_reserva);
        const movimentoData = String(l.movimento_data || "").trim();
        const reciboId = allRows.find((r) => {
          if (String(r.documento || "").trim() !== documento) return false;
          if (String(r.movimento_data || "").trim() !== movimentoData)
            return false;
          if (reserva)
            return normalizeRexturLocalizador(r.numero_reserva) === reserva;
          return true;
        })?.venda_recibo_id;
        if (!reciboId) continue;
        const sistema = reciboValorMap.get(String(reciboId).trim());
        if (!sistema) continue;
        const importTotal = Number(l.valor_lancamentos || 0);
        const importTaxas = Number(l.valor_taxas || 0);
        const diffTotal =
          Math.round((importTotal - sistema.valor_total) * 100) / 100;
        const diffTaxas =
          Math.round((importTaxas - sistema.valor_taxas) * 100) / 100;
        if (Math.abs(diffTotal) > 0.01 || Math.abs(diffTaxas) > 0.01) {
          diferencas.push({
            documento: String(l.documento || "").trim(),
            movimento_data: String(l.movimento_data || "").trim(),
            valor_importacao: importTotal,
            valor_sistema: sistema.valor_total,
            taxas_importacao: importTaxas,
            taxas_sistema: sistema.valor_taxas,
            diff_total: diffTotal,
            diff_taxas: diffTaxas,
          });
        }
      }
    }

    // ── Persist ───────────────────────────────────────────────────────────
    let atualizados = 0;
    for (const item of rowsToUpdate) {
      const { error: updateError } = await client
        .from("conciliacao_recibos")
        .update(item.values)
        .eq("id", item.id)
        .eq("company_id", companyId);
      if (updateError) throw updateError;
      atualizados += 1;
    }

    const BATCH = 100;
    let importados = 0;
    for (let i = 0; i < rowsToInsert.length; i += BATCH) {
      const batch = rowsToInsert.slice(i, i + BATCH);
      const { error: insertError } = await client
        .from("conciliacao_recibos")
        .insert(batch);
      if (insertError) throw insertError;
      importados += batch.length;
    }

    // ── Diagnóstico cronológico pós-importação ────────────────────────────
    // Informa imediatamente ao usuário se ainda há lacunas após o upload,
    // ou seja, se a conciliação ficará bloqueada por dias faltantes.
    const diagnostico = await diagnosticarLacunasCronologicas({
      client,
      companyId,
    });

    const fmt = (d: string) => {
      const [y, m, dia] = d.split("-");
      return `${dia}/${m}/${y}`;
    };

    const temLacuna = diagnostico.diasFaltantes.length > 0;
    const statusCronologico = temLacuna
      ? {
          ok: false,
          fronteira: diagnostico.fronteira,
          dias_faltantes: diagnostico.diasFaltantes,
          dias_bloqueados: diagnostico.diasBloqueados,
          registros_bloqueados: diagnostico.registrosBloqueados,
          aviso:
            `Arquivo salvo com sucesso, mas a conciliação está bloqueada a partir de ${fmt(diagnostico.fronteira!)}. ` +
            `Ainda faltam os arquivos dos dias: ${diagnostico.diasFaltantes.map(fmt).join(", ")}. ` +
            `Importe esses arquivos para liberar ${diagnostico.registrosBloqueados} registro(s) bloqueado(s).`,
        }
      : {
          ok: true,
          fronteira: diagnostico.fronteira,
          dias_faltantes: [],
          dias_bloqueados: [],
          registros_bloqueados: 0,
          aviso: diagnostico.fronteira
            ? `Sequência OK até ${fmt(diagnostico.fronteira)}. Conciliação liberada.`
            : "Primeiro arquivo importado.",
        };

    invalidateSalesReadModels({ companyIds: [companyId], userId: user.id });

    return json(
      {
        ok: true,
        importados,
        atualizados,
        ignorados: linhas.length - importaveis.length,
        duplicados: atualizados,
        status_cronologico: statusCronologico,
        diferencas: diferencas.length > 0 ? diferencas : undefined,
        tem_diferenca: diferencas.length > 0,
      },
      { headers: NO_STORE_HEADERS },
    );
  } catch (err) {
    return toErrorResponse(err, "Erro ao importar conciliação.");
  }
}
