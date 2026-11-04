/// <reference types="@cloudflare/vitest-pool-workers" />

import { applyD1Migrations, env } from "cloudflare:test";
import { beforeAll, describe, expect, it } from "vitest";
import { createDataClient } from "$lib/server/data/query";

describe("paridade das rotinas com consumidor", () => {
  beforeAll(async () => {
    const migrations = (
      env as unknown as {
        TEST_MIGRATIONS: Parameters<typeof applyD1Migrations>[1];
      }
    ).TEST_MIGRATIONS;
    await applyD1Migrations(env.DB, migrations);
  });

  function client() {
    return createDataClient({
      db: env.DB,
      r2: env.R2,
      secret: "segredo-de-teste-com-32-caracteres",
      origin: "http://localhost",
      headers: new Headers(),
    });
  }

  it("nao devolve cliente de outra empresa", async () => {
    const companyA = crypto.randomUUID();
    const companyB = crypto.randomUUID();
    const clienteA = crypto.randomUUID();
    const clienteB = crypto.randomUUID();
    await env.DB.batch([
      env.DB.prepare(
        "INSERT INTO legado_companies (id, nome_empresa, nome_fantasia, cnpj, active) VALUES (?, 'A', 'A', ?, 1)",
      ).bind(companyA, companyA.replace(/-/g, "").slice(0, 14)),
      env.DB.prepare(
        "INSERT INTO legado_companies (id, nome_empresa, nome_fantasia, cnpj, active) VALUES (?, 'B', 'B', ?, 1)",
      ).bind(companyB, companyB.replace(/-/g, "").slice(0, 14)),
      env.DB.prepare(
        "INSERT INTO legado_clientes (id, nome, company_id) VALUES (?, 'Ana', ?)",
      ).bind(clienteA, companyA),
      env.DB.prepare(
        "INSERT INTO legado_clientes (id, nome, company_id) VALUES (?, 'Bia', ?)",
      ).bind(clienteB, companyB),
    ]);

    const result = await client().rpc("company_cliente_ids", {
      p_company_ids: [companyA],
    });
    const ids = (result.data as Array<{ cliente_id: string }>).map(
      (row) => row.cliente_id,
    );
    expect(result.error).toBeNull();
    expect(ids).toContain(clienteA);
    expect(ids).not.toContain(clienteB);
  });

  it("a rotina de consultorias coincide com a consulta ao vivo", async () => {
    const company = crypto.randomUUID();
    const typeId = crypto.randomUUID();
    const seller = crypto.randomUUID();
    const other = crypto.randomUUID();
    const openId = crypto.randomUUID();
    const closedId = crypto.randomUUID();
    const otherId = crypto.randomUUID();
    await env.DB.batch([
      env.DB.prepare(
        "INSERT INTO legado_user_types (id, name) VALUES (?, 'VENDEDOR')",
      ).bind(typeId),
      env.DB.prepare(
        "INSERT INTO legado_users (id, nome_completo, email, company_id, user_type_id, active, uso_individual, participa_ranking) VALUES (?, 'Ana', 'ana@example.com', ?, ?, 1, 0, 0)",
      ).bind(seller, company, typeId),
      env.DB.prepare(
        "INSERT INTO legado_users (id, nome_completo, email, company_id, user_type_id, active, uso_individual, participa_ranking) VALUES (?, 'Bia', 'bia@example.com', ?, ?, 1, 0, 0)",
      ).bind(other, crypto.randomUUID(), typeId),
      env.DB.prepare(
        `INSERT INTO legado_consultorias_online
          (id, cliente_nome, data_hora, lembrete, destino, created_by, fechada, lembrete_envios)
         VALUES (?, 'Ana', '2026-11-10T10:00:00.000Z', '1', 'Lisboa', ?, 0, '[]')`,
      ).bind(openId, seller),
      env.DB.prepare(
        `INSERT INTO legado_consultorias_online
          (id, cliente_nome, data_hora, lembrete, destino, created_by, fechada, lembrete_envios)
         VALUES (?, 'Fechada', '2026-11-10T11:00:00.000Z', '1', 'Porto', ?, 1, '[]')`,
      ).bind(closedId, seller),
      env.DB.prepare(
        `INSERT INTO legado_consultorias_online
          (id, cliente_nome, data_hora, lembrete, destino, created_by, fechada, lembrete_envios)
         VALUES (?, 'Outra', '2026-11-10T12:00:00.000Z', '1', 'Roma', ?, 0, '[]')`,
      ).bind(otherId, other),
    ]);

    const inicio = "2026-11-01T00:00:00.000Z";
    const fim = "2026-11-30T23:59:59.000Z";
    const rpc = await client().rpc("rpc_dashboard_consultorias", {
      p_company_id: company,
      p_vendedor_ids: null,
      p_inicio: inicio,
      p_fim: fim,
    });
    const live = await env.DB.prepare(
      `SELECT id FROM legado_consultorias_online
       WHERE fechada = 0 AND data_hora >= ? AND data_hora <= ? AND created_by = ?
       ORDER BY data_hora ASC`,
    )
      .bind(inicio, fim, seller)
      .all<{ id: string }>();

    expect(rpc.error).toBeNull();
    expect((rpc.data as Array<{ id: string }>).map((row) => row.id)).toEqual(
      (live.results || []).map((row) => row.id),
    );
    expect((rpc.data as Array<{ id: string }>).map((row) => row.id)).toEqual([
      openId,
    ]);
  });
});
