/// <reference types="@cloudflare/vitest-pool-workers" />

import { beforeAll, describe, expect, it } from 'vitest';
import { applyD1Migrations, env } from 'cloudflare:test';
import { createDataClient } from '$lib/server/data/query';

describe('cliente de dados D1', () => {
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
      secret: 'segredo-de-teste-com-32-caracteres',
      origin: 'http://localhost',
      headers: new Headers()
    });
  }

  it('grava e le uma linha do catalogo legado', async () => {
    const id = crypto.randomUUID();
    const inserted = await client()
      .from('admin_avisos_templates')
      .insert({
        id,
        nome: 'Aviso',
        assunto: 'Assunto',
        mensagem: 'Texto',
        sender_key: 'sistema'
      })
      .select('id, nome, ativo')
      .single();

    expect(inserted.error).toBeNull();
    expect(inserted.data).toMatchObject({ id, nome: 'Aviso', ativo: false });

    const listed = await client().from('admin_avisos_templates').select('id').eq('id', id);
    expect(listed.error).toBeNull();
    expect(listed.data).toEqual([expect.objectContaining({ id })]);
  });

  it('update nao troca a chave primaria da linha', async () => {
    const id = crypto.randomUUID();
    await client()
      .from('admin_avisos_templates')
      .insert({ id, nome: 'Aviso', assunto: 'A', mensagem: 'M', sender_key: 'sistema' });

    const updated = await client()
      .from('admin_avisos_templates')
      .update({ nome: 'Novo' })
      .eq('id', id)
      .select('id, nome')
      .single();

    expect(updated.error).toBeNull();
    expect(updated.data).toMatchObject({ id, nome: 'Novo' });
  });

  it('resolve clientes acessiveis com a regra de escopo', async () => {
    const companyId = crypto.randomUUID();
    const clienteId = crypto.randomUUID();
    await client()
      .from('companies')
      .insert({
        id: companyId,
        nome_empresa: 'Agencia',
        nome_fantasia: 'Agencia',
        cnpj: companyId.replace(/-/g, '').slice(0, 14),
        active: true
      });
    await client().from('clientes').insert({ id: clienteId, nome: 'Ana', company_id: companyId });

    const result = await client().rpc('accessible_client_ids', {
      p_company_ids: [companyId],
      p_vendedor_ids: []
    });

    expect(result.error).toBeNull();
    expect(result.data).toEqual(expect.arrayContaining([{ cliente_id: clienteId }]));
  });
  it('resolve embed pelo nome da coluna FK (cliente:client_id)', async () => {
    const clienteId = crypto.randomUUID();
    const quoteId = crypto.randomUUID();
    await client().from('clientes').insert({ id: clienteId, nome: 'Bia' });
    const userId = crypto.randomUUID();
    const user = await client()
      .from('users')
      .insert({ id: userId, email: `${userId}@t.com` });
    expect(user.error).toBeNull();
    const quote = await client().from('quote').insert({
      id: quoteId,
      client_id: clienteId,
      created_by: userId,
      status: 'draft',
      currency: 'BRL',
      total: 1,
      raw_json: {},
      status_negociacao: 'novo'
    });
    expect(quote.error).toBeNull();

    const result = await client()
      .from('quote')
      .select('id, cliente:client_id (id, nome), quote_item (id, title)')
      .eq('id', quoteId)
      .single();

    expect(result.error).toBeNull();
    expect(result.data).toMatchObject({ cliente: { id: clienteId, nome: 'Bia' } });
  });
  it('resolve hint de coluna FK compartilhada entre tabelas (vendedor:users!vendedor_id)', async () => {
    const result = await client()
      .from('vendas')
      .select('id, vendedor:users!vendedor_id (id)')
      .limit(1);

    expect(result.error).toBeNull();
  });
  it('filtra por coluna de relacao embutida (venda.vendedor_id)', async () => {
    const result = await client()
      .from('viagens')
      .select('id, venda:vendas!inner(id, vendedor_id)')
      .in('venda.vendedor_id', ['nenhum'])
      .limit(5);

    expect(result.error).toBeNull();
    expect(result.data).toEqual([]);
  });
});
