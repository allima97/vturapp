/// <reference types="@cloudflare/vitest-pool-workers" />

import { beforeAll, describe, expect, it } from "vitest";
import { applyD1Migrations, env } from "cloudflare:test";
import { createDataClient } from "$lib/server/data/query";

describe("cliente de dados D1", () => {
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

  it("grava e le uma linha do catalogo legado", async () => {
    const id = crypto.randomUUID();
    const inserted = await client()
      .from("admin_avisos_templates")
      .insert({
        id,
        nome: "Aviso",
        assunto: "Assunto",
        mensagem: "Texto",
        sender_key: "sistema",
      })
      .select("id, nome, ativo")
      .single();

    expect(inserted.error).toBeNull();
    expect(inserted.data).toMatchObject({ id, nome: "Aviso", ativo: false });

    const listed = await client()
      .from("admin_avisos_templates")
      .select("id")
      .eq("id", id);
    expect(listed.error).toBeNull();
    expect(listed.data).toEqual([expect.objectContaining({ id })]);
  });

  it("resolve clientes acessiveis com a regra de escopo", async () => {
    const companyId = crypto.randomUUID();
    const clienteId = crypto.randomUUID();
    await client()
      .from("companies")
      .insert({
        id: companyId,
        nome_empresa: "Agencia",
        nome_fantasia: "Agencia",
        cnpj: companyId.replace(/-/g, "").slice(0, 14),
        active: true,
      });
    await client()
      .from("clientes")
      .insert({ id: clienteId, nome: "Ana", company_id: companyId });

    const result = await client().rpc("accessible_client_ids", {
      p_company_ids: [companyId],
      p_vendedor_ids: [],
    });

    expect(result.error).toBeNull();
    expect(result.data).toEqual(
      expect.arrayContaining([{ cliente_id: clienteId }]),
    );
  });
});
