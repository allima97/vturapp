import type { QueryResult } from "./types";

function missing(name: string): QueryResult {
  return {
    data: null,
    error: {
      message: `could not find the function public.${name}`,
      code: "PGRST202",
      details: null,
      hint: null,
    },
  };
}

function ok<T>(data: T): QueryResult<T> {
  return { data, error: null };
}

function ids(value: unknown) {
  const source = Array.isArray(value) ? value : [];
  return source.map((item) => String(item || "").trim()).filter(Boolean);
}

function placeholders(values: string[]) {
  return values.map(() => "?").join(", ");
}

async function accessibleClientIds(
  db: D1Database,
  args: Record<string, unknown>,
) {
  const companies = ids(args.p_company_ids);
  const sellers = ids(args.p_vendedor_ids);
  if (companies.length === 0 && sellers.length === 0) return ok([]);
  const parts: string[] = [];
  const binds: unknown[] = [];
  if (sellers.length === 0 && companies.length > 0) {
    parts.push(
      `SELECT id AS cliente_id FROM legado_clientes WHERE company_id IN (${placeholders(companies)})`,
    );
    binds.push(...companies);
  }
  if (sellers.length > 0) {
    parts.push(
      `SELECT id AS cliente_id FROM legado_clientes WHERE created_by IN (${placeholders(sellers)})`,
    );
    binds.push(...sellers);
  }
  const saleFilters = ["cancelada = 0", "cliente_id IS NOT NULL"];
  if (companies.length > 0) {
    saleFilters.push(`company_id IN (${placeholders(companies)})`);
    binds.push(...companies);
  }
  if (sellers.length > 0) {
    saleFilters.push(`vendedor_id IN (${placeholders(sellers)})`);
    binds.push(...sellers);
  }
  if (companies.length > 0 || sellers.length > 0) {
    parts.push(
      `SELECT cliente_id FROM legado_vendas WHERE ${saleFilters.join(" AND ")}`,
    );
  }
  const rows = await db
    .prepare(parts.join(" UNION "))
    .bind(...binds)
    .all<{ cliente_id: string }>();
  return ok(rows.results || []);
}

async function companyClienteIds(
  db: D1Database,
  args: Record<string, unknown>,
) {
  const companies = ids(args.p_company_ids);
  if (companies.length === 0) return ok([]);
  const marks = placeholders(companies);
  const sql = `
    SELECT id AS cliente_id FROM legado_clientes WHERE company_id IN (${marks})
    UNION
    SELECT c.id AS cliente_id
    FROM legado_clientes c
    WHERE c.created_by IN (SELECT u.id FROM legado_users u WHERE u.company_id IN (${marks}))
      AND (c.company_id IS NULL OR c.company_id IN (${marks}))
    UNION
    SELECT cliente_id FROM legado_vendas
    WHERE company_id IN (${marks}) AND cancelada = 0 AND cliente_id IS NOT NULL
  `;
  const rows = await db
    .prepare(sql)
    .bind(...companies, ...companies, ...companies, ...companies)
    .all<{ cliente_id: string }>();
  return ok(rows.results || []);
}

async function canAccessCliente(db: D1Database, args: Record<string, unknown>) {
  const clienteId = String(args.p_cliente_id || "");
  const companies = ids(args.p_company_ids);
  const sellers = ids(args.p_vendedor_ids);
  const companySql = companies.length
    ? ` AND company_id IN (${placeholders(companies)})`
    : "";
  const sellerSql = sellers.length
    ? ` AND created_by IN (${placeholders(sellers)})`
    : "";
  const saleSeller = sellers.length
    ? ` AND vendedor_id IN (${placeholders(sellers)})`
    : "";
  const sql = `
    SELECT 1 AS ok FROM legado_clientes
    WHERE id = ?1 ${companySql} ${sellerSql}
    UNION
    SELECT 1 AS ok FROM legado_vendas
    WHERE cliente_id = ?1 AND cancelada = 0 ${companySql} ${saleSeller}
    UNION
    SELECT 1 AS ok
    FROM legado_viagem_passageiros vp
    JOIN legado_viagens vi ON vi.id = vp.viagem_id
    JOIN legado_vendas v2 ON v2.id = vi.venda_id
    WHERE vp.cliente_id = ?1 AND v2.cancelada = 0
      ${companies.length ? ` AND v2.company_id IN (${placeholders(companies)})` : ""}
      ${sellers.length ? ` AND v2.vendedor_id IN (${placeholders(sellers)})` : ""}
    LIMIT 1
  `;
  const binds = [
    clienteId,
    ...companies,
    ...sellers,
    clienteId,
    ...companies,
    ...sellers,
    clienteId,
    ...companies,
    ...sellers,
  ];
  const row = await db
    .prepare(sql)
    .bind(...binds)
    .first<{ ok: number }>();
  return ok(Boolean(row?.ok));
}

async function gestorBase(db: D1Database, userId: string) {
  const row = await db
    .prepare(
      `
    WITH RECURSIVE links(gestor_id, gestor_base_id, path, depth) AS (
      SELECT gestor_id, gestor_base_id, '|' || gestor_id || '|', 1
      FROM legado_gestor_equipe_compartilhada
      WHERE gestor_id = ?1
      UNION ALL
      SELECT next.gestor_id, next.gestor_base_id, links.path || next.gestor_id || '|', links.depth + 1
      FROM legado_gestor_equipe_compartilhada AS next
      JOIN links ON next.gestor_id = links.gestor_base_id
      WHERE links.depth < 10 AND instr(links.path, '|' || next.gestor_id || '|') = 0
    )
    SELECT gestor_base_id FROM links ORDER BY depth DESC LIMIT 1
  `,
    )
    .bind(userId)
    .first<{ gestor_base_id: string }>();
  return row?.gestor_base_id || userId;
}

async function markDirty(db: D1Database, companyId: unknown, date: unknown) {
  const company = String(companyId || "");
  const rawDate = String(date || "");
  if (!company || !rawDate) return ok(null);
  const month = `${rawDate.slice(0, 7)}-01`;
  await db
    .prepare(
      `
    INSERT INTO legado_ranking_read_model_status (id, modelo, company_id, mes, status, dirty_at, last_error)
    VALUES (?1, 'recibo_contribuicoes_v4', ?2, ?3, 'dirty', strftime('%Y-%m-%dT%H:%M:%fZ','now'), NULL)
    ON CONFLICT (modelo, company_id, mes) DO UPDATE SET
      status = 'dirty',
      dirty_at = strftime('%Y-%m-%dT%H:%M:%fZ','now'),
      last_error = NULL
  `,
    )
    .bind(crypto.randomUUID(), company, month)
    .run();
  return ok(null);
}

async function syncChildren(db: D1Database, args: Record<string, unknown>) {
  const vendaId = String(args.p_venda_id || "");
  const companyId = args.p_company_id ? String(args.p_company_id) : null;
  const clienteId = args.p_cliente_id ? String(args.p_cliente_id) : null;
  const vendedorId = args.p_vendedor_id ? String(args.p_vendedor_id) : null;
  const userId = args.p_user_id ? String(args.p_user_id) : null;
  const recibos = Array.isArray(args.p_recibos)
    ? (args.p_recibos as Array<Record<string, unknown>>)
    : [];
  const pagamentos = Array.isArray(args.p_pagamentos)
    ? (args.p_pagamentos as Array<Record<string, unknown>>)
    : [];
  if (recibos.some((recibo) => !String(recibo.numero_recibo || "").trim())) {
    return {
      data: null,
      error: {
        message: "RECIBO_INVALIDO",
        code: "P0001",
        details: null,
        hint: null,
      },
    };
  }

  const statements: D1PreparedStatement[] = [
    db
      .prepare(
        `DELETE FROM legado_vendas_recibos_rateio WHERE venda_recibo_id IN (SELECT id FROM legado_vendas_recibos WHERE venda_id = ?1)`,
      )
      .bind(vendaId),
    db
      .prepare(`DELETE FROM legado_vendas_recibos_notas WHERE venda_id = ?1`)
      .bind(vendaId),
    db
      .prepare(
        `DELETE FROM legado_vendas_recibos_complementares WHERE venda_id = ?1`,
      )
      .bind(vendaId),
    db
      .prepare(
        `DELETE FROM legado_viagem_passageiros WHERE viagem_id IN (SELECT id FROM legado_viagens WHERE venda_id = ?1)`,
      )
      .bind(vendaId),
    db.prepare(`DELETE FROM legado_viagens WHERE venda_id = ?1`).bind(vendaId),
    db
      .prepare(`DELETE FROM legado_vendas_pagamentos WHERE venda_id = ?1`)
      .bind(vendaId),
    db
      .prepare(`DELETE FROM legado_vendas_recibos WHERE venda_id = ?1`)
      .bind(vendaId),
  ];

  const reciboColumns = [
    "id",
    "venda_id",
    "produto_id",
    "numero_recibo",
    "valor_total",
    "valor_taxas",
    "data_inicio",
    "data_fim",
    "produto_resolvido_id",
    "numero_reserva",
    "tipo_pacote",
    "valor_rav",
    "valor_du",
    "data_venda",
    "numero_recibo_normalizado",
    "destino_cidade_id",
  ];
  for (const recibo of recibos) {
    const id = String(recibo.id || crypto.randomUUID());
    const values = reciboColumns.map((column) => {
      if (column === "id") return id;
      if (column === "venda_id") return vendaId;
      const value = recibo[column];
      return value == null
        ? null
        : typeof value === "object"
          ? JSON.stringify(value)
          : value;
    });
    statements.push(
      db
        .prepare(
          `INSERT INTO legado_vendas_recibos (${reciboColumns.join(", ")}) VALUES (${reciboColumns.map(() => "?").join(", ")})`,
        )
        .bind(...values),
    );
    const passageiros = Array.isArray(recibo.passageiros)
      ? (recibo.passageiros as Array<Record<string, unknown>>)
      : [];
    if (passageiros.length > 0) {
      const viagemId = crypto.randomUUID();
      statements.push(
        db
          .prepare(
            `
        INSERT INTO legado_viagens (id, venda_id, company_id, cliente_id, recibo_id, responsavel_user_id, data_inicio, data_fim, status)
        VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, 'aberta')
      `,
          )
          .bind(
            viagemId,
            vendaId,
            companyId,
            clienteId,
            id,
            userId || vendedorId,
            recibo.data_inicio ?? null,
            recibo.data_fim ?? null,
          ),
      );
      for (const passageiro of passageiros) {
        statements.push(
          db
            .prepare(
              `
          INSERT INTO legado_viagem_passageiros (id, viagem_id, cliente_id, company_id, papel, created_by)
          VALUES (?1, ?2, ?3, ?4, ?5, ?6)
        `,
            )
            .bind(
              crypto.randomUUID(),
              viagemId,
              passageiro.cliente_id ?? passageiro.id ?? null,
              companyId,
              passageiro.papel ?? "passageiro",
              userId,
            ),
        );
      }
    }
  }

  const pagamentoColumns = [
    "id",
    "venda_id",
    "forma_pagamento_id",
    "company_id",
    "forma_nome",
    "operacao",
    "plano",
    "valor_bruto",
    "desconto_valor",
    "valor_total",
    "parcelas",
    "parcelas_qtd",
    "parcelas_valor",
    "vencimento_primeira",
    "paga_comissao",
    "observacoes",
    "venda_recibo_id",
  ];
  for (const pagamento of pagamentos) {
    const values = pagamentoColumns.map((column) => {
      if (column === "id") return String(pagamento.id || crypto.randomUUID());
      if (column === "venda_id") return vendaId;
      if (column === "company_id") return pagamento.company_id ?? companyId;
      const value = pagamento[column];
      if (column === "paga_comissao")
        return value === false || value === 0 ? 0 : 1;
      return value == null
        ? null
        : typeof value === "object"
          ? JSON.stringify(value)
          : value;
    });
    statements.push(
      db
        .prepare(
          `INSERT INTO legado_vendas_pagamentos (${pagamentoColumns.join(", ")}) VALUES (${pagamentoColumns.map(() => "?").join(", ")})`,
        )
        .bind(...values),
    );
  }

  await db.batch(statements);
  return ok({ ok: true });
}

async function setRelacao(db: D1Database, args: Record<string, unknown>) {
  const gestorId = String(args.p_gestor_id || "");
  const vendedorId = String(args.p_vendedor_id || "");
  const ativo = args.p_ativo === false || args.p_ativo === 0 ? 0 : 1;
  const existing = await db
    .prepare(
      "SELECT id, company_id FROM legado_gestor_vendedor WHERE gestor_id = ?1 AND vendedor_id = ?2",
    )
    .bind(gestorId, vendedorId)
    .first<{ id: string; company_id: string | null }>();
  if (existing) {
    await db
      .prepare("UPDATE legado_gestor_vendedor SET ativo = ?1 WHERE id = ?2")
      .bind(ativo, existing.id)
      .run();
  } else {
    const gestor = await db
      .prepare("SELECT company_id FROM legado_users WHERE id = ?1")
      .bind(gestorId)
      .first<{ company_id: string | null }>();
    await db
      .prepare(
        `
      INSERT INTO legado_gestor_vendedor (id, gestor_id, vendedor_id, company_id, ativo, pode_modificar)
      VALUES (?1, ?2, ?3, ?4, ?5, 1)
    `,
      )
      .bind(
        crypto.randomUUID(),
        gestorId,
        vendedorId,
        gestor?.company_id ?? null,
        ativo,
      )
      .run();
  }
  return ok({ ok: true, ativo: Boolean(ativo) });
}

export async function runRpc(
  db: D1Database,
  name: string,
  args: Record<string, unknown>,
): Promise<QueryResult> {
  try {
    switch (name) {
      case "accessible_client_ids":
        return accessibleClientIds(db, args);
      case "company_cliente_ids":
        return companyClienteIds(db, args);
      case "can_access_cliente_by_vendedor_scope":
        return canAccessCliente(db, args);
      case "gestor_equipe_base_id":
        return ok(await gestorBase(db, String(args.uid || "")));
      case "gestor_equipe_vendedor_ids": {
        const base = await gestorBase(db, String(args.uid || ""));
        const rows = await db
          .prepare(
            "SELECT vendedor_id FROM legado_gestor_vendedor WHERE gestor_id = ?1 AND ativo = 1",
          )
          .bind(base)
          .all<{ vendedor_id: string }>();
        return ok(rows.results || []);
      }
      case "fn_mark_ranking_read_model_dirty":
        return markDirty(db, args.p_company_id, args.p_date);
      case "sync_venda_children":
        return syncChildren(db, args);
      case "set_gestor_vendedor_relacao":
        return setRelacao(db, args);
      case "check_security_rate_limit":
        return missing(name);
      default:
        return missing(name);
    }
  } catch (error) {
    return {
      data: null,
      error: {
        message: error instanceof Error ? error.message : "falha na rotina",
        code: "P0001",
        details: null,
        hint: null,
      },
    };
  }
}
