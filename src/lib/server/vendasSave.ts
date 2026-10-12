import type { SupabaseClient } from "@supabase/supabase-js";
import { normalizeText } from "$lib/normalizeText";
import {
  isRankingEligibleUser,
  isUuid,
  type UserScope,
} from "$lib/server/v1";
import { cleanStringSet, uniqueCleanStrings } from "$lib/utils/array";
import { isEquipeVturNome } from "$lib/conciliacao/baixaRac";
import {
  compareISODate,
  todayISODateLocal,
  toISODateLocal as formatISODateLocal,
} from "$lib/date";
import { invalidateCatalogReadModels, invalidateSalesReadModels } from "$lib/server/readModelCache";

const ISO_DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/;

type ReciboInput = {
  numero_recibo?: string | null;
  numero_reserva?: string | null;
};

type AssignableSellerRow = {
  id?: string | null;
  company_id?: string | null;
  nome_completo?: string | null;
  email?: string | null;
  active?: boolean | null;
  uso_individual?: boolean | null;
  participa_ranking?: boolean | null;
  user_types?: { name?: string | null } | null;
};

type VendaReciboLookupRow = {
  id?: string | null;
  numero_recibo?: string | null;
  numero_recibo_normalizado?: string | null;
  numero_reserva?: string | null;
  venda_id?: string | null;
};

type VendaIdRow = {
  id?: string | null;
};

type VendaClienteLookupRow = {
  id?: string | null;
  cliente_id?: string | null;
};

type ProdutoDestinoLookupRow = {
  id?: string | null;
  nome?: string | null;
  destino?: string | null;
  tipo_produto?: string | null;
};

type TipoProdutoLookupRow = {
  id?: string | null;
  nome?: string | null;
  tipo?: string | null;
  ativo?: boolean | null;
};

type LookupClient = Pick<SupabaseClient, "from">;
type MutationClient = Pick<SupabaseClient, "from" | "rpc">;

type PagamentoParcelaInput = {
  valor?: unknown;
  [key: string]: unknown;
};

type PagamentoInput = {
  parcelas?: PagamentoParcelaInput[] | null;
  valor_bruto?: unknown;
  desconto_valor?: unknown;
  valor_total?: unknown;
  parcelas_qtd?: unknown;
  parcelas_valor?: unknown;
  [key: string]: unknown;
};

type VendaInput = {
  data_venda?: unknown;
  data_lancamento?: unknown;
  destino_cidade_id?: unknown;
  data_embarque?: unknown;
  data_final?: unknown;
  desconto_comercial_aplicado?: unknown;
  desconto_comercial_valor?: unknown;
  valor_total_bruto?: unknown;
  valor_total_pago?: unknown;
  valor_total?: unknown;
  valor_taxas?: unknown;
  valor_nao_comissionado?: unknown;
  produto_id?: unknown;
  status?: unknown;
  cancelada?: unknown;
  notas?: unknown;
};

function collapseSpaces(value?: string | null) {
  return String(value || "")
    .replace(/\s+/g, " ")
    .trim();
}

export function toNullableNumber(value: unknown) {
  if (value === null || value === undefined || value === "") return null;
  const raw = String(value)
    .trim()
    .replace(/[^\d,.-]/g, "");
  const normalized = raw.includes(",")
    ? raw.replace(/\./g, "").replace(",", ".")
    : raw;
  const parsed = Number(normalized);
  return Number.isFinite(parsed) ? parsed : null;
}

export function toNumber(value: unknown, fallback = 0) {
  const parsed = toNullableNumber(value);
  return parsed == null ? fallback : parsed;
}

export function toNullableString(value: unknown) {
  const parsed = String(value || "").trim();
  return parsed || null;
}

export function toISODateLocal(date: Date) {
  return formatISODateLocal(date);
}

export function isISODate(value?: string | null) {
  return ISO_DATE_PATTERN.test(String(value || "").trim());
}

export function normalizeReceiptDisplay(value?: string | null): string {
  const raw = String(value ?? "").trim();
  if (!raw) return "";
  if (/[A-Za-z]/.test(raw)) return raw;
  const digits = raw.replace(/\D+/g, "");
  if (digits.length === 14) {
    return `${digits.slice(0, 4)}-${digits.slice(4)}`;
  }
  return raw;
}

export function normalizeReceiptKey(value?: string | null): string {
  return String(value ?? "")
    .trim()
    .toUpperCase()
    .replace(/[^A-Z0-9]/g, "");
}

function normalizeReservaKey(value?: string | null) {
  return normalizeText(collapseSpaces(value || "")).replace(/\s+/g, "");
}

function sanitizeLabel(value?: string | null) {
  return collapseSpaces(normalizeText(value || ""));
}

function normalizeLabel(value: unknown) {
  return normalizeText(collapseSpaces(String(value || "")), {
    collapseWhitespace: true,
    trim: true,
  });
}

function isValeViagemLabel(value: unknown) {
  const label = normalizeLabel(value);
  return label.includes("vale viagem") || label.includes("valeviagem");
}

function toUuidOrNull(value: unknown) {
  const id = toNullableString(value);
  return id && isUuid(id) ? id : null;
}

async function fetchProdutosDestinoByIds(client: LookupClient, ids: string[]) {
  const validIds = uniqueCleanStrings(ids).filter(isUuid);
  const produtos = new Map<string, ProdutoDestinoLookupRow>();
  if (validIds.length === 0) return produtos;

  const { data, error } = await client
    .from("produtos")
    .select("id, nome, destino, tipo_produto")
    .in("id", validIds);
  if (error) throw error;

  for (const row of (data || []) as ProdutoDestinoLookupRow[]) {
    const id = toUuidOrNull(row?.id);
    if (id) produtos.set(id, row);
  }
  return produtos;
}

async function fetchTipoProdutosByIds(client: LookupClient, ids: string[]) {
  const validIds = uniqueCleanStrings(ids).filter(isUuid);
  const tipos = new Map<string, TipoProdutoLookupRow>();
  if (validIds.length === 0) return tipos;

  const { data, error } = await client
    .from("tipo_produtos")
    .select("id, nome, tipo, ativo")
    .in("id", validIds);
  if (error) throw error;

  for (const row of (data || []) as TipoProdutoLookupRow[]) {
    const id = toUuidOrNull(row?.id);
    if (id) tipos.set(id, row);
  }
  return tipos;
}

async function resolveValeViagemTipoId(client: LookupClient, preferredIds: string[]) {
  const preferredTipos = await fetchTipoProdutosByIds(client, preferredIds);
  const preferredMatch = Array.from(preferredTipos.values()).find(
    (row) => isValeViagemLabel(row?.nome) || isValeViagemLabel(row?.tipo),
  );
  const preferredId = toUuidOrNull(preferredMatch?.id);
  if (preferredId) return preferredId;

  const { data, error } = await client
    .from("tipo_produtos")
    .select("id, nome, tipo, ativo")
    .order("nome", { ascending: true })
    .limit(500);
  if (error) throw error;

  const match = ((data || []) as TipoProdutoLookupRow[]).find(
    (row) =>
      row?.ativo !== false &&
      (isValeViagemLabel(row?.nome) || isValeViagemLabel(row?.tipo)),
  );
  return toUuidOrNull(match?.id);
}

async function findValeViagemProduto(client: LookupClient, tipoProdutoId: string) {
  const { data, error } = await client
    .from("produtos")
    .select("id, nome, destino, tipo_produto")
    .eq("tipo_produto", tipoProdutoId)
    .limit(100);
  if (error) throw error;

  const match = ((data || []) as ProdutoDestinoLookupRow[]).find(
    (row) => isValeViagemLabel(row?.nome) || isValeViagemLabel(row?.destino),
  );
  return toUuidOrNull(match?.id);
}

async function ensureValeViagemProduto(params: {
  client: LookupClient;
  tipoProdutoId: string;
  companyId?: string | null;
  userId?: string | null;
}) {
  const existingId = await findValeViagemProduto(params.client, params.tipoProdutoId);
  if (existingId) return existingId;

  const insertPayload = {
    nome: "Vale Viagem",
    destino: "Vale Viagem",
    tipo_produto: params.tipoProdutoId,
    cidade_id: null,
    todas_as_cidades: true,
    ativo: true,
    valor_neto: 0,
    margem: null,
    valor_venda: 0,
    moeda: "BRL",
    cambio: 1,
    valor_em_reais: 0,
  };

  const { data, error } = await params.client
    .from("produtos")
    .insert(insertPayload)
    .select("id")
    .single();
  if (error) throw error;

  const id = toUuidOrNull((data as { id?: string | null } | null)?.id);
  if (!id) throw new Error("VALE_VIAGEM_PRODUTO_INVALIDO");

  invalidateCatalogReadModels({
    companyIds: params.companyId ? [params.companyId] : undefined,
    userId: params.userId,
  });
  return id;
}

function reciboIndicaValeViagem(
  recibo: Record<string, unknown>,
  valeTipoId?: string | null,
) {
  const tipoId = toUuidOrNull(recibo?.produto_id) || toUuidOrNull(recibo?.tipo_produto_id);
  return (
    (valeTipoId && tipoId === valeTipoId) ||
    isValeViagemLabel(recibo?.produto_nome) ||
    isValeViagemLabel(recibo?.tipo_nome) ||
    isValeViagemLabel(recibo?.nome_produto)
  );
}

function resolveValeViagemRecibos(
  recibos: Array<ReciboInput & Record<string, unknown>>,
  valeProdutoId: string,
  valeTipoId?: string | null,
) {
  return recibos.map((recibo) => {
    if (!reciboIndicaValeViagem(recibo, valeTipoId)) return recibo;
    return {
      ...recibo,
      produto_id:
        toUuidOrNull(recibo?.produto_id) ||
        toUuidOrNull(recibo?.tipo_produto_id) ||
        valeTipoId ||
        "",
      produto_resolvido_id: valeProdutoId,
      produto_nome: toNullableString(recibo?.produto_nome) || "Vale Viagem",
    };
  });
}

async function normalizeVendaRecibosProdutos(
  client: LookupClient,
  recibos: Array<ReciboInput & Record<string, unknown>>,
) {
  const produtoIdCandidates = uniqueCleanStrings([
    ...recibos.map((recibo) => String(recibo?.produto_id || "")),
    ...recibos.map((recibo) => String(recibo?.tipo_produto_id || "")),
  ]).filter(isUuid);
  const produtoResolvidoIds = recibos
    .map((recibo) => toUuidOrNull(recibo?.produto_resolvido_id))
    .filter(Boolean) as string[];

  const [tiposById, produtosById] = await Promise.all([
    fetchTipoProdutosByIds(client, produtoIdCandidates),
    fetchProdutosDestinoByIds(client, [
      ...produtoIdCandidates,
      ...produtoResolvidoIds,
    ]),
  ]);

  return recibos.map((recibo) => {
    const produtoId =
      toUuidOrNull(recibo?.produto_id) || toUuidOrNull(recibo?.tipo_produto_id);
    const produtoResolvidoId = toUuidOrNull(recibo?.produto_resolvido_id);

    if (produtoId && tiposById.has(produtoId)) {
      return {
        ...recibo,
        produto_id: produtoId,
        produto_resolvido_id: produtoResolvidoId || null,
      };
    }

    const produtoReal =
      (produtoId ? produtosById.get(produtoId) : null) ||
      (produtoResolvidoId ? produtosById.get(produtoResolvidoId) : null) ||
      null;
    const produtoRealId = toUuidOrNull(produtoReal?.id);
    const tipoProdutoId = toUuidOrNull(produtoReal?.tipo_produto);

    if (produtoRealId && tipoProdutoId) {
      return {
        ...recibo,
        produto_id: tipoProdutoId,
        produto_resolvido_id: produtoRealId,
      };
    }

    throw new Error("RECIBO_INVALIDO");
  });
}

export async function resolveVendaDestinoProduto(params: {
  client: LookupClient;
  venda: VendaInput & { destino_id?: unknown };
  recibos: Array<ReciboInput & Record<string, unknown>>;
  companyId?: string | null;
  userId?: string | null;
}) {
  const destinoSolicitadoId = toUuidOrNull(params.venda?.destino_id);
  const produtoResolvidoIds = params.recibos
    .map((recibo) => toUuidOrNull(recibo?.produto_resolvido_id))
    .filter(Boolean) as string[];

  const produtosById = await fetchProdutosDestinoByIds(params.client, [
    destinoSolicitadoId || "",
    ...produtoResolvidoIds,
  ]);

  if (destinoSolicitadoId && produtosById.has(destinoSolicitadoId)) {
    const produtoDestino = produtosById.get(destinoSolicitadoId);
    const tipoDestinoId = toUuidOrNull(produtoDestino?.tipo_produto);
    const destinoValeViagem =
      isValeViagemLabel(produtoDestino?.nome) ||
      isValeViagemLabel(produtoDestino?.destino) ||
      params.recibos.some((recibo) => reciboIndicaValeViagem(recibo, tipoDestinoId));
    return {
      destinoId: destinoSolicitadoId,
      recibos: await normalizeVendaRecibosProdutos(
        params.client,
        destinoValeViagem
        ? resolveValeViagemRecibos(params.recibos, destinoSolicitadoId, tipoDestinoId)
        : params.recibos,
      ),
    };
  }

  const primeiroProdutoRealId = produtoResolvidoIds.find((id) => produtosById.has(id));
  if (primeiroProdutoRealId) {
    const produtoDestino = produtosById.get(primeiroProdutoRealId);
    const tipoDestinoId = toUuidOrNull(produtoDestino?.tipo_produto);
    const destinoValeViagem =
      isValeViagemLabel(produtoDestino?.nome) ||
      isValeViagemLabel(produtoDestino?.destino) ||
      params.recibos.some((recibo) => reciboIndicaValeViagem(recibo, tipoDestinoId));
    return {
      destinoId: primeiroProdutoRealId,
      recibos: await normalizeVendaRecibosProdutos(
        params.client,
        destinoValeViagem
        ? resolveValeViagemRecibos(params.recibos, primeiroProdutoRealId, tipoDestinoId)
        : params.recibos,
      ),
    };
  }

  const tipoCandidates = uniqueCleanStrings([
    destinoSolicitadoId || "",
    ...params.recibos.map((recibo) => String(recibo?.produto_id || "")),
    ...params.recibos.map((recibo) => String(recibo?.tipo_produto_id || "")),
  ]).filter(isUuid);
  const tiposById = await fetchTipoProdutosByIds(params.client, tipoCandidates);
  const tipoValePreferido = Array.from(tiposById.values()).find(
    (row) => isValeViagemLabel(row?.nome) || isValeViagemLabel(row?.tipo),
  );
  let valeTipoId = toUuidOrNull(tipoValePreferido?.id);
  const payloadIndicaValeViagem =
    (destinoSolicitadoId &&
      tiposById.has(destinoSolicitadoId) &&
      (isValeViagemLabel(tiposById.get(destinoSolicitadoId)?.nome) ||
        isValeViagemLabel(tiposById.get(destinoSolicitadoId)?.tipo))) ||
    params.recibos.some((recibo) => reciboIndicaValeViagem(recibo, valeTipoId));

  if (payloadIndicaValeViagem) {
    valeTipoId = valeTipoId || await resolveValeViagemTipoId(params.client, tipoCandidates);
    if (!valeTipoId) throw new Error("VALE_VIAGEM_TIPO_NAO_ENCONTRADO");

    const valeProdutoId = await ensureValeViagemProduto({
      client: params.client,
      tipoProdutoId: valeTipoId,
      companyId: params.companyId,
      userId: params.userId,
    });

    return {
      destinoId: valeProdutoId,
      recibos: await normalizeVendaRecibosProdutos(
        params.client,
        resolveValeViagemRecibos(params.recibos, valeProdutoId, valeTipoId),
      ),
    };
  }

  throw new Error("DESTINO_INVALIDO");
}

export function calcularStatusPeriodo(
  inicio?: string | null,
  fim?: string | null,
) {
  if (!inicio) return "pendente";
  const hoje = todayISODateLocal();

  if (fim && compareISODate(fim, hoje) < 0) return "concluida";
  if (compareISODate(inicio, hoje) > 0) return "confirmada";
  if (fim && compareISODate(hoje, fim) > 0) return "concluida";
  return "em_viagem";
}

export async function ensureAssignableActiveSeller(
  client: LookupClient,
  scope: UserScope,
  vendedorId: string,
) {
  const { data, error } = await client
    .from("users")
    .select(
      "id, company_id, nome_completo, email, active, uso_individual, participa_ranking, user_types(name)",
    )
    .eq("id", vendedorId)
    .maybeSingle();
  if (error) throw error;

  const vendedor = data as AssignableSellerRow | null;
  if (!vendedor?.id) return "Vendedor informado nao encontrado.";
  if (!Boolean(vendedor?.active)) return "Vendedor informado esta inativo.";
  if (isEquipeVturNome(vendedor?.nome_completo))
    return "Equipe vtur nao pode receber vendas ou recibos.";
  if (!isRankingEligibleUser(vendedor))
    return "Usuario informado nao pode receber venda.";

  const vendedorCompanyId = String(vendedor?.company_id || "").trim() || null;

  if (scope.isAdmin) return null;
  if (scope.isVendedor && vendedorId !== scope.userId)
    return "Vendedor nao pode atribuir venda para outro usuario.";
  const scopedCompanySet = cleanStringSet(scope.companyIds);

  if (scope.isMaster) {
    if (Boolean(vendedor?.uso_individual))
      return "Master so pode atribuir vendas para usuarios corporativos ativos.";
    if (!vendedorCompanyId || !scopedCompanySet.has(vendedorCompanyId)) {
      return "Vendedor fora do escopo das empresas do master.";
    }
    return null;
  }

  if (scope.isFinanceiro) {
    if (Boolean(vendedor?.uso_individual))
      return "Financeiro so pode editar vendas de usuarios corporativos ativos.";
    if (!vendedorCompanyId || !scopedCompanySet.has(vendedorCompanyId)) {
      return "Vendedor fora do escopo das empresas do financeiro.";
    }
    return null;
  }

  if (!scope.companyId || vendedorCompanyId !== scope.companyId)
    return "Vendedor fora do escopo da empresa atual.";

  if (scope.isGestor) {
    if (Boolean(vendedor?.uso_individual))
      return "Gestor so pode atribuir vendas para equipe corporativa ativa.";
    return null;
  }

  if (vendedorId !== scope.userId)
    return "Sem permissao para atribuir venda para outro usuario.";
  return null;
}

function isConsolidadoraRecibo(numeroRecibo?: string | null): boolean {
  const key = normalizeReceiptKey(numeroRecibo);
  return key === "REXTUR" || key.includes("REXTUR");
}

// ── helpers para validação sem join PostgREST ────────────────────────────────

async function fetchCancelledVendaIds(
  client: LookupClient,
  companyId?: string | null,
): Promise<Set<string>> {
  let query = client
    .from("vendas")
    .select("id")
    .eq("cancelada", true)
    .limit(2000);
  if (companyId) query = query.eq("company_id", companyId);
  const { data } = await query;
  const ids = new Set<string>();
  for (const row of (data || []) as VendaIdRow[]) {
    if (row?.id) ids.add(String(row.id));
  }
  return ids;
}

async function fetchClienteIdsByVendaIds(
  client: LookupClient,
  vendaIds: string[],
): Promise<Map<string, string>> {
  const map = new Map<string, string>();
  if (!vendaIds.length) return map;
  const { data } = await client
    .from("vendas")
    .select("id, cliente_id")
    .in("id", vendaIds);
  for (const row of (data || []) as VendaClienteLookupRow[]) {
    if (row?.id && row?.cliente_id) {
      map.set(String(row.id), String(row.cliente_id));
    }
  }
  return map;
}

// ────────────────────────────────────────────────────────────────────────────

export async function ensureReciboReservaUnicos(params: {
  client: LookupClient;
  companyId?: string | null;
  clienteId: string;
  ignoreVendaId?: string | null;
  recibos: ReciboInput[];
}) {
  const { client, companyId, clienteId, ignoreVendaId, recibos } = params;

  // REXTUR: recibos dessa operadora podem se repetir entre vendas
  const recibosParaValidar = recibos.filter(
    (item) => !isConsolidadoraRecibo(item?.numero_recibo),
  );

  const rawReceiptKeys = recibosParaValidar
    .map((item) => normalizeReceiptKey(item?.numero_recibo))
    .filter(Boolean);
  const receiptKeys = uniqueCleanStrings(rawReceiptKeys);
  const recibosReservaParaValidar = recibosParaValidar.filter(
    (item) => !reciboIndicaValeViagem(item as Record<string, unknown>),
  );
  const reservaKeys = uniqueCleanStrings(
    recibosReservaParaValidar.map((item) => normalizeReservaKey(item?.numero_reserva)),
  );

  if (rawReceiptKeys.length !== receiptKeys.length) {
    throw new Error("RECIBO_DUPLICADO");
  }

  // Busca IDs de vendas canceladas para excluir da validação.
  // Usamos consulta separada para não depender de filtragem de join PostgREST
  // (que pode ser instável dependendo da versão do PostgREST/supabase-js).
  const cancelledVendaIds = await fetchCancelledVendaIds(client, companyId);

  if (receiptKeys.length > 0) {
    let query = client
      .from("vendas_recibos")
      .select(
        "id, numero_recibo, numero_recibo_normalizado, venda_id, vendas!inner(company_id)",
      )
      .in("numero_recibo_normalizado", receiptKeys);
    if (companyId) query = query.eq("vendas.company_id", companyId);
    if (ignoreVendaId) query = query.neq("venda_id", ignoreVendaId);
    const { data, error } = await query.limit(50);
    if (error) throw error;
    // Ignora recibos de vendas canceladas — permite reimportar após cancelamento
    const ativos = ((data || []) as VendaReciboLookupRow[]).filter(
      (row) => !cancelledVendaIds.has(String(row?.venda_id || "")),
    );
    if (ativos.length > 0) {
      throw new Error("RECIBO_DUPLICADO");
    }
  }

  if (reservaKeys.length > 0) {
    let query = client
      .from("vendas_recibos")
      .select(
        "id, numero_recibo, numero_reserva, venda_id, vendas!inner(company_id)",
      )
      .in(
        "numero_reserva",
        recibosReservaParaValidar
          .map((item) => toNullableString(item?.numero_reserva))
          .filter(Boolean),
      );
    if (companyId) query = query.eq("vendas.company_id", companyId);
    if (ignoreVendaId) query = query.neq("venda_id", ignoreVendaId);
    const { data, error } = await query;
    if (error) throw error;

    // Ignora recibos de vendas canceladas — permite reimportar após cancelamento
    const dadosAtivos = ((data || []) as VendaReciboLookupRow[]).filter(
      (row) => !cancelledVendaIds.has(String(row?.venda_id || "")),
    );

    // Para reservas precisamos do cliente_id — buscamos as vendas ativas relevantes
    const vendaIds = uniqueCleanStrings(dadosAtivos.map((r) => String(r?.venda_id || "")));
    const clienteIdByVendaId = await fetchClienteIdsByVendaIds(client, vendaIds);

    for (const recibo of recibosReservaParaValidar) {
      const reservaKey = normalizeReservaKey(recibo?.numero_reserva);
      if (!reservaKey) continue;
      const reciboKey = normalizeReceiptKey(recibo?.numero_recibo);
      const conflitos = dadosAtivos.filter(
        (row) => normalizeReservaKey(row?.numero_reserva) === reservaKey,
      );
      const bloqueia = conflitos.some(
        (row) =>
          String(clienteIdByVendaId.get(String(row?.venda_id || "")) || "") === clienteId ||
          normalizeReceiptKey(row?.numero_recibo) === reciboKey,
      );
      if (bloqueia) {
        throw new Error("RESERVA_DUPLICADA");
      }
    }
  }
}

export function buildVendaPayload(
  venda: VendaInput,
  vendedorId: string,
  clienteId: string,
  destinoId: string,
  companyId?: string | null,
) {
  const todayIso = todayISODateLocal();
  const dataVendaInput = String(venda?.data_venda || "").trim();
  const dataLancamentoInput = String(venda?.data_lancamento || "").trim();
  if (!isISODate(dataVendaInput)) {
    throw new Error("DATA_VENDA_INVALIDA");
  }

  let dataLancamento = isISODate(dataLancamentoInput)
    ? dataLancamentoInput
    : todayIso;
  let dataVenda = dataVendaInput;
  if (dataLancamento > todayIso) dataLancamento = todayIso;
  if (dataVenda > todayIso) dataVenda = todayIso;
  if (dataVenda > dataLancamento) dataVenda = dataLancamento;

  const rawStatus = toNullableString(venda?.status);
  const normalizedStatus = rawStatus === "aberto" ? "pendente" : rawStatus;

  return {
    vendedor_id: vendedorId,
    cliente_id: clienteId,
    destino_id: destinoId,
    destino_cidade_id: toNullableString(venda?.destino_cidade_id),
    data_lancamento: dataLancamento,
    data_venda: dataVenda,
    data_embarque: toNullableString(venda?.data_embarque),
    data_final: toNullableString(venda?.data_final),
    desconto_comercial_aplicado: Boolean(venda?.desconto_comercial_aplicado),
    desconto_comercial_valor: toNullableNumber(venda?.desconto_comercial_valor),
    valor_total_bruto: toNullableNumber(venda?.valor_total_bruto),
    valor_total_pago: toNullableNumber(venda?.valor_total_pago),
    valor_total: toNullableNumber(venda?.valor_total),
    valor_taxas: toNullableNumber(venda?.valor_taxas),
    valor_nao_comissionado: toNullableNumber(venda?.valor_nao_comissionado),
    produto_id: toNullableString(venda?.produto_id),
    status: normalizedStatus || "pendente",
    cancelada: Boolean(venda?.cancelada),
    notas: toNullableString(venda?.notas),
    ...(companyId ? { company_id: companyId } : {}),
  };
}

function normalizeReciboPayload(item: ReciboInput & Record<string, unknown>, fallbackDataVenda?: string | null) {
  const itemDataVenda = String(item?.data_venda || "").trim();
  const fallbackDataVendaText = String(fallbackDataVenda || "").trim();

  return {
    ...item,
    data_venda: isISODate(itemDataVenda)
      ? itemDataVenda
      : isISODate(fallbackDataVendaText)
        ? fallbackDataVendaText
        : null,
    numero_recibo: normalizeReceiptDisplay(item?.numero_recibo) || null,
    cidade_nome: sanitizeLabel(toNullableString(item?.cidade_nome)) || null,
    produto_nome: sanitizeLabel(toNullableString(item?.produto_nome) || toNullableString(item?.tipo_nome)) || null,
    valor_total: toNullableNumber(item?.valor_total) ?? 0,
    valor_taxas: toNullableNumber(item?.valor_taxas) ?? 0,
    valor_du: toNullableNumber(item?.valor_du) ?? 0,
    valor_rav: toNullableNumber(item?.valor_rav) ?? 0,
  };
}

function normalizePagamentoPayload(item: PagamentoInput) {
  const parcelas = Array.isArray(item?.parcelas)
    ? item.parcelas.map((p: PagamentoParcelaInput) => ({
        ...p,
        valor: toNullableNumber(p?.valor) ?? 0,
      }))
    : [];

  return {
    ...item,
    valor_bruto: toNullableNumber(item?.valor_bruto) ?? 0,
    desconto_valor: toNullableNumber(item?.desconto_valor) ?? 0,
    valor_total: toNullableNumber(item?.valor_total) ?? 0,
    parcelas_qtd: toNullableNumber(item?.parcelas_qtd) ?? null,
    parcelas_valor: toNullableNumber(item?.parcelas_valor) ?? 0,
    parcelas,
  };
}

export async function markRankingReadModelDirty(params: {
  client: MutationClient;
  companyId?: string | null;
  dataVenda?: string | null;
}) {
  const companyId = toNullableString(params.companyId);
  const dataVenda = toNullableString(params.dataVenda);
  if (!companyId || !dataVenda || !isISODate(dataVenda)) return;
  const dataVendaIso = dataVenda;

  try {
    const { error } = await params.client.rpc("fn_mark_ranking_read_model_dirty", {
      p_company_id: companyId,
      p_date: dataVendaIso,
    });
    if (!error) return;
  } catch {
    // Ambientes antigos podem não ter a RPC; abaixo gravamos o status diretamente.
  }

  const mes = `${dataVendaIso.slice(0, 7)}-01`;
  try {
    const statusPayload = {
      // v4 = modelo que o dashboard le (ver reciboContribuicoesReadModel.ts)
      modelo: "recibo_contribuicoes_v4",
      company_id: companyId,
      mes,
      status: "dirty",
      dirty_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    };
    const { data: existing, error: existingError } = await params.client
      .from("ranking_read_model_status")
      .select("id")
      .eq("modelo", statusPayload.modelo)
      .eq("company_id", companyId)
      .eq("mes", mes)
      .limit(1)
      .maybeSingle();
    const existingRow = existing as { id?: string | null } | null;

    if (existingError) return;
    if (existingRow?.id) {
      await params.client
        .from("ranking_read_model_status")
        .update(statusPayload)
        .eq("id", existingRow.id);
      return;
    }
    await params.client.from("ranking_read_model_status").insert(statusPayload);
  } catch {
    // A ausência do read model não deve bloquear cadastro de venda.
  }
}

export async function syncVendaChildren(params: {
  client: MutationClient;
  vendaId: string;
  companyId?: string | null;
  clienteId: string;
  vendedorId: string;
  userId: string;
  dataVenda?: string | null;
  recibos: Array<ReciboInput & Record<string, unknown>>;
  pagamentos: PagamentoInput[];
}) {
  const {
    client,
    vendaId,
    companyId,
    clienteId,
    vendedorId,
    userId,
    dataVenda,
    recibos,
    pagamentos,
  } = params;

  const recibosNormalizados = recibos.map((recibo) => normalizeReciboPayload(recibo, dataVenda));
  const pagamentosNormalizados = pagamentos.map(normalizePagamentoPayload);

  const { error } = await client.rpc("sync_venda_children", {
    p_venda_id: vendaId,
    p_company_id: companyId ?? null,
    p_cliente_id: clienteId,
    p_vendedor_id: vendedorId,
    p_user_id: userId,
    p_recibos: recibosNormalizados,
    p_pagamentos: pagamentosNormalizados,
  });

  if (error) {
    if (error.message === "RECIBO_INVALIDO") throw new Error("RECIBO_INVALIDO");
    throw error;
  }

  invalidateSalesReadModels({
    companyIds: companyId ? [companyId] : [],
    vendedorIds: vendedorId ? [vendedorId] : [],
    userId,
  });
  await markRankingReadModelDirty({ client, companyId, dataVenda });
}

export async function closeQuoteIfNeeded(
  client: LookupClient,
  orcamentoId?: string | null,
) {
  const id = String(orcamentoId || "").trim();
  if (!isUuid(id)) return;
  await client
    .from("quote")
    .update({
      status_negociacao: "Fechado",
      updated_at: new Date().toISOString(),
    })
    .eq("id", id);
}
