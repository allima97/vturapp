/// <reference types="@cloudflare/vitest-pool-workers" />

import { applyD1Migrations, env } from 'cloudflare:test';
import { expect, it, vi } from 'vitest';
import { createDataClient } from '$lib/server/data/query';

const state = vi.hoisted(() => ({ client: null as unknown, userId: '' }));
vi.mock('$lib/server/v1', async (importOriginal) => ({
  ...(await importOriginal<typeof import('$lib/server/v1')>()),
  getAdminClient: () => state.client,
  requireAuthenticatedUser: async () => ({ id: state.userId }),
  resolveUserScope: async () => ({})
}));

import {
  handleProfileSignatureGet,
  handleProfileSignaturePatch
} from '../api/routes/profile/signature';

it('preserva preferências e compartilhamentos ao permitir usuário sem empresa', async () => {
  const migrations = (
    env as unknown as { TEST_MIGRATIONS: Parameters<typeof applyD1Migrations>[1] }
  ).TEST_MIGRATIONS;
  const migration = migrations.find((item) => item.name.startsWith('0017_'));
  expect(migration).toBeDefined();
  await applyD1Migrations(
    env.DB,
    migrations.filter((item) => !item.name.startsWith('0017_'))
  );

  const company = crypto.randomUUID();
  const owner = crypto.randomUUID();
  const recipient = crypto.randomUUID();
  const preference = crypto.randomUUID();
  const share = crypto.randomUUID();
  await env.DB.batch([
    env.DB.prepare(
      'INSERT INTO legado_companies (id, nome_empresa, nome_fantasia, cnpj) VALUES (?, ?, ?, ?)'
    ).bind(company, 'Empresa', 'Empresa', company.replace(/-/g, '').slice(0, 14)),
    env.DB.prepare('INSERT INTO legado_users (id, email) VALUES (?, ?)').bind(owner, 'a@test.com'),
    env.DB.prepare('INSERT INTO legado_users (id, email) VALUES (?, ?)').bind(
      recipient,
      'b@test.com'
    ),
    env.DB.prepare(
      'INSERT INTO legado_minhas_preferencias (id, company_id, created_by, nome) VALUES (?, ?, ?, ?)'
    ).bind(preference, company, owner, 'Hotel'),
    env.DB.prepare(
      'INSERT INTO legado_minhas_preferencias_shares (id, company_id, preferencia_id, shared_by, shared_with, status) VALUES (?, ?, ?, ?, ?, ?)'
    ).bind(share, company, preference, owner, recipient, 'accepted')
  ]);
  if (!migration) throw new Error('Migração 0017 não encontrada');
  await applyD1Migrations(env.DB, [migration]);

  const savedShare = await env.DB.prepare(
    'SELECT preferencia_id, shared_by, shared_with, status FROM legado_minhas_preferencias_shares WHERE id = ?'
  )
    .bind(share)
    .first();
  expect(savedShare).toMatchObject({
    preferencia_id: preference,
    shared_by: owner,
    shared_with: recipient,
    status: 'accepted'
  });
  const client = createDataClient({
    db: env.DB,
    r2: env.R2,
    secret: 'segredo-de-teste-com-32-caracteres',
    origin: 'http://localhost',
    headers: new Headers()
  });
  const personal = await client
    .from('minhas_preferencias')
    .insert({ company_id: null, created_by: owner, nome: 'Pousada' })
    .select('id, company_id, created_by, nome')
    .single();
  expect(personal.error).toBeNull();
  expect(personal.data).toMatchObject({ company_id: null, created_by: owner, nome: 'Pousada' });
  expect((await env.DB.prepare('PRAGMA foreign_key_check').all()).results).toEqual([]);
  await env.DB.prepare('DELETE FROM legado_minhas_preferencias WHERE id = ?')
    .bind(preference)
    .run();
  expect(
    await env.DB.prepare('SELECT id FROM legado_minhas_preferencias_shares WHERE id = ?')
      .bind(share)
      .first()
  ).toBeNull();

  state.client = client;
  state.userId = owner;
  const signatureEvent = (method: string, signature?: string) =>
    ({
      request: new Request('https://vtur.app/api/v1/profile/signature', {
        method,
        headers: { origin: 'https://vtur.app', 'content-type': 'application/json' },
        body: signature === undefined ? undefined : JSON.stringify({ signature })
      })
    }) as never;
  expect((await handleProfileSignaturePatch(signatureEvent('PATCH', 'Ana Silva'))).status).toBe(
    200
  );
  const created = await client
    .from('quote_print_settings')
    .select('id')
    .eq('owner_user_id', owner)
    .single();
  expect(created.error).toBeNull();
  await client.from('quote_print_settings').update({ telefone: '123' }).eq('id', created.data.id);
  expect((await handleProfileSignaturePatch(signatureEvent('PATCH', 'Ana Santos'))).status).toBe(
    200
  );
  const updated = await client
    .from('quote_print_settings')
    .select('id, consultor_nome, telefone')
    .eq('owner_user_id', owner)
    .single();
  expect(updated.error).toBeNull();
  expect(updated.data).toMatchObject({
    id: created.data.id,
    consultor_nome: 'Ana Santos',
    telefone: '123'
  });
  const response = await handleProfileSignatureGet(signatureEvent('GET'));
  expect(response.status).toBe(200);
  expect(await response.json()).toMatchObject({ signature: 'Ana Santos' });
});
