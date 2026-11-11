/// <reference types="@cloudflare/vitest-pool-workers" />
import { applyD1Migrations, env } from 'cloudflare:test';
import { beforeAll, expect, it, vi } from 'vitest';
import type { RequestEvent } from '@sveltejs/kit';

const state = vi.hoisted(() => ({
  companyId: '11111111-1111-4111-8111-111111111111' as string | null,
  userId: '33333333-3333-4333-8333-333333333333',
  allowed: true
}));

vi.mock('$lib/server/v1', () => ({
  getAdminClient: () => ({}),
  requireAuthenticatedUser: async () => ({ id: state.userId }),
  resolveUserScope: async () => ({ companyId: state.companyId }),
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
  await applyD1Migrations(env.DB, env.TEST_MIGRATIONS);
  await env.DB.batch([
    env.DB.prepare(
      'INSERT INTO legado_companies (id, nome_empresa, nome_fantasia, cnpj) VALUES (?, ?, ?, ?)'
    ).bind(companyA, 'A', 'A', '11111111111111'),
    env.DB.prepare(
      'INSERT INTO legado_companies (id, nome_empresa, nome_fantasia, cnpj) VALUES (?, ?, ?, ?)'
    ).bind(companyB, 'B', 'B', '22222222222222'),
    env.DB.prepare('INSERT INTO legado_users (id, email) VALUES (?, ?)').bind(
      state.userId,
      'user@example.test'
    )
  ]);
});

it('restringe leitura e edição à empresa e bloqueia usuário sem empresa', async () => {
  state.companyId = companyA;
  const created = await handlePassagensPost(event('/api/v1/passagens', 'POST', payload));
  expect(created.status, await created.clone().text()).toBe(201);
  const { id } = await created.json<{ id: string }>();
  const detail = await handlePassagensGet(event(`/api/v1/passagens?id=${id}`));
  expect(await detail.json()).toMatchObject({ item: { ...payload, id } });

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
  const updated = { ...payload, id, localizador: 'DEF456' };
  expect((await handlePassagensPost(event('/api/v1/passagens', 'POST', updated))).status).toBe(200);
  expect(
    await (await handlePassagensGet(event(`/api/v1/passagens?id=${id}`))).json()
  ).toMatchObject({
    item: { id, localizador: 'DEF456' }
  });
  expect((await handlePassagensDelete(event(`/api/v1/passagens?id=${id}`, 'DELETE'))).status).toBe(
    200
  );
  expect((await handlePassagensGet(event(`/api/v1/passagens?id=${id}`))).status).toBe(404);
});
