/// <reference types="@cloudflare/vitest-pool-workers" />
import { applyD1Migrations, env } from 'cloudflare:test';
import { beforeAll, expect, it, vi } from 'vitest';
import type { RequestEvent } from '@sveltejs/kit';

const state = vi.hoisted(() => ({
  companyId: '11111111-1111-4111-8111-111111111111' as string | null,
  userId: '33333333-3333-4333-8333-333333333333',
  usoIndividual: false,
  allowed: true
}));

vi.mock('$lib/server/v1', () => ({
  getAdminClient: () => ({}),
  requireAuthenticatedUser: async () => ({ id: state.userId }),
  resolveUserScope: async () => ({
    companyId: state.companyId,
    usoIndividual: state.usoIndividual
  }),
  ensureModuloAccess: () => {
    if (!state.allowed) throw { status: 403, message: 'Acesso negado.' };
  },
  isUuid: (value: string) => /^[0-9a-f]{8}-(?:[0-9a-f]{4}-){3}[0-9a-f]{12}$/i.test(value),
  logServerError: vi.fn(),
  toErrorResponse: (err: { status?: number; message?: string }) =>
    new Response(err.message || 'Erro', { status: err.status || 500 })
}));

import { handlePassagensDelete, handlePassagensGet, handlePassagensPost } from './root';

const companyA = '11111111-1111-4111-8111-111111111111';
const companyB = '22222222-2222-4222-8222-222222222222';
const userA = '33333333-3333-4333-8333-333333333333';
const userB = '44444444-4444-4444-8444-444444444444';
const existingId = '55555555-5555-4555-8555-555555555555';
const payload = {
  localizador: 'ABC123',
  emissao: '',
  trechos: [
    {
      companhia: 'Companhia Exemplo',
      voo: 'XY 123',
      origem: 'AAA',
      destino: 'BBB',
      saida: '2026-11-12T15:00',
      chegada: '2026-11-12T16:19',
      status: 'HK',
      duracao: '01:19',
      classe: 'W'
    }
  ],
  passageiros: [{ nome: 'Pessoa Exemplo', bilhete: '', status: '', assentos: ['17D'] }]
};

function event(path: string, method = 'GET', body?: object): RequestEvent {
  const url = new URL(`https://vtur.app${path}`);
  return {
    url,
    request: new Request(url, {
      method,
      headers: { origin: url.origin, 'content-type': 'application/json' },
      body: body === undefined ? undefined : JSON.stringify(body)
    }),
    platform: { env: { DB: env.DB } },
    params: {}
  } as RequestEvent;
}

beforeAll(async () => {
  await applyD1Migrations(
    env.DB,
    env.TEST_MIGRATIONS.filter((item) => item.name < '0028_')
  );
  await env.DB.batch([
    env.DB.prepare(
      'INSERT INTO legado_companies (id, nome_empresa, nome_fantasia, cnpj) VALUES (?, ?, ?, ?)'
    ).bind(companyA, 'A', 'A', '11111111111111'),
    env.DB.prepare(
      'INSERT INTO legado_companies (id, nome_empresa, nome_fantasia, cnpj) VALUES (?, ?, ?, ?)'
    ).bind(companyB, 'B', 'B', '22222222222222'),
    env.DB.prepare('INSERT INTO legado_users (id, email) VALUES (?, ?)').bind(
      userA,
      'user@example.test'
    ),
    env.DB.prepare('INSERT INTO legado_users (id, email) VALUES (?, ?)').bind(
      userB,
      'other@example.test'
    ),
    env.DB.prepare(
      'INSERT INTO passagens (id, company_id, created_by, localizador, dados) VALUES (?, ?, ?, ?, ?)'
    ).bind(existingId, companyA, userA, payload.localizador, JSON.stringify(payload))
  ]);
  const migration = env.TEST_MIGRATIONS.find((item) => item.name.startsWith('0028_'));
  if (!migration) throw new Error('Migração 0028 não encontrada.');
  await applyD1Migrations(env.DB, [migration]);
});

it('preserva registros existentes, compartilha por empresa e bloqueia quem não tem vínculo', async () => {
  state.companyId = companyA;
  expect(
    await (await handlePassagensGet(event(`/api/v1/passagens?id=${existingId}`))).json()
  ).toMatchObject({ item: { id: existingId, ...payload } });
  const created = await handlePassagensPost(event('/api/v1/passagens', 'POST', payload));
  expect(created.status, await created.clone().text()).toBe(201);
  const { id } = await created.json<{ id: string }>();
  const detail = await handlePassagensGet(event(`/api/v1/passagens?id=${id}`));
  expect(await detail.json()).toMatchObject({ item: { ...payload, id } });
  state.userId = userB;
  expect((await handlePassagensGet(event(`/api/v1/passagens?id=${id}`))).status).toBe(200);
  state.userId = userA;

  state.companyId = companyB;
  expect((await handlePassagensGet(event(`/api/v1/passagens?id=${id}`))).status).toBe(404);
  const list = await handlePassagensGet(event('/api/v1/passagens'));
  expect(await list.json()).toEqual({ items: [], hasMore: false });
  expect((await handlePassagensDelete(event(`/api/v1/passagens?id=${id}`, 'DELETE'))).status).toBe(
    404
  );
  expect(
    (await handlePassagensPost(event('/api/v1/passagens', 'POST', { ...payload, id }))).status
  ).toBe(404);

  state.companyId = null;
  expect((await handlePassagensGet(event('/api/v1/passagens'))).status).toBe(403);
  expect((await handlePassagensPost(event('/api/v1/passagens', 'POST', payload))).status).toBe(403);
  expect((await handlePassagensDelete(event(`/api/v1/passagens?id=${id}`, 'DELETE'))).status).toBe(
    403
  );
  state.companyId = companyA;
  state.allowed = false;
  expect((await handlePassagensGet(event(`/api/v1/passagens?id=${id}`))).status).toBe(403);
  state.allowed = true;
  expect(
    (await handlePassagensPost(event('/api/v1/passagens', 'POST', { ...payload, passageiros: [] })))
      .status
  ).toBe(400);
  expect(
    (
      await handlePassagensPost(
        event('/api/v1/passagens', 'POST', { ...payload, emissao: '2026-02-30' })
      )
    ).status
  ).toBe(400);
  const updated = {
    ...payload,
    id,
    localizador: 'DEF456',
    trechos: [
      { ...payload.trechos[0], cidadeOrigem: 'Cidade Exemplo', cidadeDestino: 'Outra Cidade' }
    ]
  };
  expect((await handlePassagensPost(event('/api/v1/passagens', 'POST', updated))).status).toBe(200);
  expect(
    await (await handlePassagensGet(event(`/api/v1/passagens?id=${id}`))).json()
  ).toMatchObject({
    item: { id, localizador: 'DEF456', trechos: updated.trechos }
  });
  expect((await handlePassagensDelete(event(`/api/v1/passagens?id=${id}`, 'DELETE'))).status).toBe(
    200
  );
  expect((await handlePassagensGet(event(`/api/v1/passagens?id=${id}`))).status).toBe(404);
});

it('permite contas individuais sem empresa e isola passagens mesmo com empresa associada', async () => {
  state.userId = userA;
  state.companyId = null;
  state.usoIndividual = true;
  const created = await handlePassagensPost(event('/api/v1/passagens', 'POST', payload));
  expect(created.status, await created.clone().text()).toBe(201);
  const { id } = await created.json<{ id: string }>();
  const list = await handlePassagensGet(event('/api/v1/passagens'));
  expect(await list.json()).toMatchObject({ items: [{ id }] });
  expect((await handlePassagensGet(event(`/api/v1/passagens?id=${id}`))).status).toBe(200);
  expect(
    (
      await handlePassagensPost(
        event('/api/v1/passagens', 'POST', { ...payload, id, localizador: 'DEF456' })
      )
    ).status
  ).toBe(200);

  state.userId = userB;
  expect(await (await handlePassagensGet(event('/api/v1/passagens'))).json()).toEqual({
    items: [],
    hasMore: false
  });
  expect((await handlePassagensGet(event(`/api/v1/passagens?id=${id}`))).status).toBe(404);
  expect(
    (await handlePassagensPost(event('/api/v1/passagens', 'POST', { ...payload, id }))).status
  ).toBe(404);
  expect((await handlePassagensDelete(event(`/api/v1/passagens?id=${id}`, 'DELETE'))).status).toBe(
    404
  );

  state.userId = userA;
  state.companyId = companyA;
  expect((await handlePassagensGet(event(`/api/v1/passagens?id=${id}`))).status).toBe(200);
  expect((await handlePassagensGet(event(`/api/v1/passagens?id=${existingId}`))).status).toBe(404);
  state.usoIndividual = false;
  expect((await handlePassagensGet(event(`/api/v1/passagens?id=${id}`))).status).toBe(404);
  state.usoIndividual = true;
  state.allowed = false;
  expect((await handlePassagensGet(event(`/api/v1/passagens?id=${id}`))).status).toBe(403);
  state.allowed = true;
  expect((await handlePassagensDelete(event(`/api/v1/passagens?id=${id}`, 'DELETE'))).status).toBe(
    200
  );
  expect((await handlePassagensGet(event(`/api/v1/passagens?id=${id}`))).status).toBe(404);
});
