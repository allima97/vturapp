/// <reference types="@cloudflare/vitest-pool-workers" />
import { applyD1Migrations, env } from 'cloudflare:test';
import { expect, it } from 'vitest';
import { createDataClient } from './query';

it('preserva cidades antigas e permite uma identidade geográfica única por cidade', async () => {
  const migration = env.TEST_MIGRATIONS.find((item) => item.name.startsWith('0021_'));
  if (!migration) throw new Error('Migração 0021 não encontrada.');
  await applyD1Migrations(
    env.DB,
    env.TEST_MIGRATIONS.filter((item) => !item.name.startsWith('0021_'))
  );
  const cidade = crypto.randomUUID();
  const homonima = crypto.randomUUID();
  await env.DB.batch([
    env.DB.prepare(
      "INSERT INTO legado_cidades (id, nome, estado_nome, pais_nome) VALUES (?, 'Roma', 'Lácio', 'Itália')"
    ).bind(cidade),
    env.DB.prepare(
      "INSERT INTO legado_cidades (id, nome, estado_nome, pais_nome) VALUES (?, 'Roma', 'Texas', 'Estados Unidos')"
    ).bind(homonima)
  ]);
  await applyD1Migrations(env.DB, [migration]);
  const client = createDataClient({
    db: env.DB,
    r2: env.R2,
    secret: 'segredo-de-teste-com-32-caracteres',
    origin: 'http://localhost',
    headers: new Headers()
  });
  const existing = await client
    .from('cidades')
    .select('id, nome, estado_nome, pais_nome, destino_geografico_id')
    .eq('id', cidade)
    .single();
  expect(existing.error).toBeNull();
  expect(existing.data).toMatchObject({
    id: cidade,
    nome: 'Roma',
    estado_nome: 'Lácio',
    pais_nome: 'Itália',
    destino_geografico_id: null
  });
  const updated = await client
    .from('cidades')
    .update({ destino_geografico_id: 'geonames:3169070' })
    .eq('id', cidade)
    .select('*')
    .single();
  expect(updated.error).toBeNull();
  expect(updated.data).toMatchObject({ destino_geografico_id: 'geonames:3169070' });
  await expect(
    env.DB.prepare('UPDATE legado_cidades SET destino_geografico_id = ? WHERE id = ?')
      .bind('geonames:3169070', homonima)
      .run()
  ).rejects.toThrow();
  await env.DB.prepare('UPDATE legado_cidades SET destino_geografico_id = ? WHERE id = ?')
    .bind('geonames:999', homonima)
    .run();
  expect((await env.DB.prepare('PRAGMA foreign_key_check').all()).results).toEqual([]);
});
