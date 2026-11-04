import type { DataClient } from '$lib/dataClientTypes';
import { browserData as dadosBrowser } from '$lib/db/browserData';
import { normalizeText } from '$lib/normalizeText';

type NumeroLookup = {
  numero_recibo?: string | null;
  numero_reserva?: string | null;
  cliente_id?: string | null;
};

export type Duplicidade =
  | { tipo: "recibo"; valor: string }
  | { tipo: "reserva"; valor: string; recibos_relacionados?: ReciboRelacionado[] };

export type ReciboRelacionado = {
  id: string;
  venda_id: string;
  numero_recibo: string;
  numero_reserva: string;
  cliente_id: string;
};

type VendaIdRow = {
  id?: string | null;
};

type VendaClienteLookupRow = {
  id?: string | null;
  cliente_id?: string | null;
};

type ExistingReciboRow = {
  id?: string | null;
  numero_recibo?: string | null;
  numero_reserva?: string | null;
  venda_id?: string | null;
};

type QueryResultRow = Record<string, unknown>;

type MinimalQuery<T extends QueryResultRow> = PromiseLike<{
  data: T[] | null;
  error?: Error | null;
}> & {
  eq(column: string, value: unknown): MinimalQuery<T>;
  neq(column: string, value: unknown): MinimalQuery<T>;
  in(column: string, values: readonly string[]): MinimalQuery<T>;
  limit(count: number): MinimalQuery<T>;
};

type MinimalDadosFrom = {
  select<T extends QueryResultRow>(columns: string): MinimalQuery<T>;
};

type MinimalDataClient = {
  from(table: string): MinimalDadosFrom;
};

function asMinimalClient(sb: DataClient): MinimalDataClient {
  return sb as unknown as MinimalDataClient;
}

function normalizeNumero(valor?: string | null) {
  if (!valor) return "";
  return normalizeText(valor, { trim: true, collapseWhitespace: true }).replace(/\s+/g, "");
}

function uniqueNonEmpty(values: string[]) {
  const out: string[] = [];
  const seen = new Set<string>();
  for (const v of values) {
    const norm = normalizeNumero(v);
    if (!norm) continue;
    if (seen.has(norm)) continue;
    seen.add(norm);
    out.push(norm);
  }
  return out;
}

async function fetchCancelledVendaIdsBrowser(
  sb: DataClient,
  companyId?: string | null,
): Promise<Set<string>> {
  let query = asMinimalClient(sb)
    .from("vendas")
    .select<VendaIdRow>("id")
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

async function fetchClienteIdMapBrowser(
  sb: DataClient,
  vendaIds: string[],
): Promise<Map<string, string>> {
  const map = new Map<string, string>();
  if (!vendaIds.length) return map;
  const { data } = await asMinimalClient(sb)
    .from("vendas")
    .select<VendaClienteLookupRow>("id, cliente_id")
    .in("id", vendaIds);
  for (const row of (data || []) as VendaClienteLookupRow[]) {
    if (row?.id && row?.cliente_id) {
      map.set(String(row.id), String(row.cliente_id));
    }
  }
  return map;
}

export async function findReciboReservaDuplicado(params: {
  client?: DataClient;
  numeros: NumeroLookup[];
  ignoreVendaId?: string | null;
  companyId?: string | null;
}): Promise<Duplicidade | null> {
  const { client, numeros, ignoreVendaId, companyId } = params;
  const sb = client || dadosBrowser;
  const recibos = uniqueNonEmpty(numeros.map((n) => n.numero_recibo || ""));
  const reservas = uniqueNonEmpty(numeros.map((n) => n.numero_reserva || ""));

  const applyFilters = <T extends QueryResultRow>(query: MinimalQuery<T>) => {
    let q = query;
    if (ignoreVendaId) q = q.neq("venda_id", ignoreVendaId);
    return q;
  };

  // Busca IDs de vendas canceladas via consulta separada para evitar
  // dependência de filtragem de join PostgREST (pode ser instável).
  const cancelledVendaIds = await fetchCancelledVendaIdsBrowser(sb, companyId);

  // VALIDAÇÃO DE RECIBOS (mantém comportamento original - não pode duplicar)
  if (recibos.length) {
    let query = asMinimalClient(sb)
      .from("vendas_recibos")
      .select<ExistingReciboRow>("id, numero_recibo, venda_id, vendas!inner(company_id)")
      .in("numero_recibo", recibos);

    if (companyId) {
      query = query.eq("vendas.company_id", companyId);
    }

    const { data, error } = await applyFilters(query.limit(50));
    if (error) throw error;
    // Ignora recibos de vendas canceladas — permite reimportar após cancelamento
    const ativos = ((data || []) as ExistingReciboRow[]).filter(
      (r) => !cancelledVendaIds.has(String(r?.venda_id || ""))
    );
    if (ativos.length) {
      return { tipo: "recibo", valor: String(ativos[0]?.numero_recibo || "") };
    }
  }

  // VALIDAÇÃO DE RESERVAS (NOVA LÓGICA - permite se cliente diferente)
  if (reservas.length) {
    // Busca todos os recibos com essas reservas
    let query = asMinimalClient(sb)
      .from("vendas_recibos")
      .select<ExistingReciboRow>(`
        id,
        numero_recibo,
        numero_reserva,
        venda_id,
        vendas!inner(company_id)
      `)
      .in("numero_reserva", reservas);

    if (companyId) {
      query = query.eq("vendas.company_id", companyId);
    }

    const { data: recibosRaw, error } = await applyFilters(query);
    if (error) throw error;
    // Ignora recibos de vendas canceladas — permite reimportar após cancelamento
    const recibosExistentes = ((recibosRaw || []) as ExistingReciboRow[]).filter(
      (r) => !cancelledVendaIds.has(String(r?.venda_id || ""))
    );

    if (recibosExistentes?.length) {
      // Busca cliente_id das vendas relevantes para verificar conflito de cliente
      const vendaIds = [...new Set<string>(recibosExistentes.map((r) => String(r?.venda_id || "")).filter(Boolean))];
      const clienteIdMap = await fetchClienteIdMapBrowser(sb, vendaIds);

      // Para cada número da requisição, verifica se existe conflito
      for (const numeroAtual of numeros) {
        if (!numeroAtual.numero_reserva) continue;

        const reservaNorm = normalizeNumero(numeroAtual.numero_reserva);
        const reciboNorm = normalizeNumero(numeroAtual.numero_recibo);

        // Busca recibos existentes com esta reserva
        const recibosComMesmaReserva = recibosExistentes.filter(
          (r) => normalizeNumero(r.numero_reserva) === reservaNorm
        );

        if (recibosComMesmaReserva.length === 0) continue;

        // Verifica se tem algum com o mesmo cliente_id
        const mesmoCliente = recibosComMesmaReserva.some(
          (r) => clienteIdMap.get(String(r?.venda_id || "")) === numeroAtual.cliente_id
        );

        // Verifica se tem algum com o mesmo numero_recibo
        const mesmoRecibo = recibosComMesmaReserva.some(
          (r) => normalizeNumero(r.numero_recibo) === reciboNorm
        );

        // BLOQUEIA se for mesmo cliente OU mesmo recibo
        if (mesmoCliente || mesmoRecibo) {
          return {
            tipo: "reserva",
            valor: numeroAtual.numero_reserva
          };
        }

        // PERMITE mas retorna os recibos relacionados para criar vínculo
        // (diferente cliente E diferente recibo = mesma viagem, contratantes diferentes)
        return {
          tipo: "reserva",
          valor: numeroAtual.numero_reserva,
          recibos_relacionados: recibosComMesmaReserva.map((r) => ({
            id: String(r?.id || ""),
            venda_id: String(r?.venda_id || ""),
            numero_recibo: String(r?.numero_recibo || ""),
            numero_reserva: String(r?.numero_reserva || ""),
            cliente_id: String(clienteIdMap.get(String(r?.venda_id || "")) || ""),
          })),
        };
      }
    }
  }

  return null;
}

export async function ensureReciboReservaUnicos(params: {
  client?: DataClient;
  numeros: NumeroLookup[];
  ignoreVendaId?: string | null;
  companyId?: string | null;
}): Promise<ReciboRelacionado[] | null> {
  const duplicado = await findReciboReservaDuplicado(params);

  if (!duplicado) return null;

  // Se tem recibos relacionados, retorna info para criar vínculo
  // (não lança erro - permite a importação)
  if (duplicado.tipo === "reserva" && duplicado.recibos_relacionados) {
    return duplicado.recibos_relacionados;
  }

  // Caso contrário, bloqueia
  const err = new Error(
    duplicado.tipo === "recibo"
      ? "RECIBO_DUPLICADO"
      : "RESERVA_DUPLICADA"
  ) as Error & {
    code?: string;
    duplicado?: Duplicidade;
  };
  err.code = err.message;
  err.duplicado = duplicado;
  throw err;
}
