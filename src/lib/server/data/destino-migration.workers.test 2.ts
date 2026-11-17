/// <reference types="@cloudflare/vitest-pool-workers" />
import { applyD1Migrations, env } from 'cloudflare:test';
import { expect, it } from 'vitest';
import { createDataClient } from './query';

it('preserva registros existentes e permite acessar identidades após a migração', async () => {
  const migrations = env.TEST_MIGRATIONS;
  const migration = migrations.find((item) => item.name.startsWith('0020_'));
  if (!migration) throw new Error('Migração 0020 não encontrada.');
  await applyD1Migrations(
    env.DB,
    migrations.filter((item) => !item.name.startsWith('0020_'))
  );
  const roteiro = crypto.randomUUID();
  const owner = crypto.randomUUID();
  const dia = crypto.randomUUID();
  const hotel = crypto.randomUUID();
  const passeio = crypto.randomUUID();
  const opcional = crypto.randomUUID();
  await env.DB.batch([
    env.DB.prepare(
      "INSERT INTO legado_roteiro_personalizado (id, created_by, nome, opcionais) VALUES (?, ?, 'Viagem', '[]')"
    ).bind(roteiro, owner),
    env.DB.prepare(
      "INSERT INTO legado_roteiro_dia (id, created_by, roteiro_id, cidade, descricao) VALUES (?, ?, ?, 'Roma', 'Dia 1')"
    ).bind(dia, owner, roteiro),
    env.DB.prepare(
      "INSERT INTO legado_roteiro_hotel (id, roteiro_id, cidade, hotel) VALUES (?, ?, 'Roma', 'Hotel')"
    ).bind(hotel, roteiro),
    env.DB.prepare(
      "INSERT INTO legado_roteiro_passeio (id, roteiro_id, cidade, passeio) VALUES (?, ?, 'Roma', 'Passeio')"
    ).bind(passeio, roteiro),
    env.DB.prepare(
      "INSERT INTO catalogo_opcionais (id, cidade, cidade_chave, nome) VALUES (?, 'Roma', 'roma', 'Passeio')"
    ).bind(opcional)
  ]);
  await applyD1Migrations(env.DB, [migration]);

  const client = createDataClient({
    db: env.DB,
    r2: env.R2,
    secret: 'segredo-de-teste-com-32-caracteres',
    origin: 'http://localhost',
    headers: new Headers()
  });
  for (const [table, id] of [
    ['roteiro_dia', dia],
    ['roteiro_hotel', hotel],
    ['roteiro_passeio', passeio]
  ]) {
    const before = await client.from(table).select('cidade, cidade_id').eq('id', id).single();
    expect(before.error).toBeNull();
    expect(before.data).toMatchObject({ cidade: 'Roma', cidade_id: null });
    const write = await client
      .from(table)
      .update({ cidade_id: 'geonames:3169070' })
      .eq('id', id)
      .select('cidade, cidade_id')
      .single();
    expect(write.error).toBeNull();
    expect(write.data).toMatchObject({ cidade: 'Roma', cidade_id: 'geonames:3169070' });
    const all = await client.from(table).select('*').eq('id', id).single();
    expect(all.error).toBeNull();
    expect(all.data).toMatchObject({ cidade_id: 'geonames:3169070' });
  }
  expect(
    await env.DB.prepare(
      'SELECT cidade, cidade_chave, cidade_id FROM catalogo_opcionais WHERE id = ?'
    )
      .bind(opcional)
      .first()
  ).toEqual({ cidade: 'Roma', cidade_chave: 'roma', cidade_id: null });
  const plan = await env.DB.prepare(
    'EXPLAIN QUERY PLAN SELECT id FROM catalogo_opcionais WHERE cidade_id = ? ORDER BY nome, id'
  )
    .bind('geonames:3169070')
    .all<{ detail: string }>();
  expect(plan.results.some((row) => row.detail.includes('catalogo_opcionais_cidade_id_idx'))).toBe(
    true
  );
  expect((await env.DB.prepare('PRAGMA foreign_key_check').all()).results).toEqual([]);
});
