/// <reference types="@cloudflare/vitest-pool-workers" />
import { applyD1Migrations, env } from 'cloudflare:test';
import { beforeAll, expect, it, vi } from 'vitest';
import { createDataClient } from '$lib/server/data/query';

const state = vi.hoisted(() => ({
  client: null as ReturnType<typeof createDataClient> | null
}));

vi.mock('$lib/server/v1', async (original) => ({
  ...(await original<typeof import('$lib/server/v1')>()),
  getAdminClient: () => state.client,
  requireAuthenticatedUser: async () => ({ id: 'owner' }),
  resolveUserScope: async () => ({ isAdmin: true, companyIds: [] }),
  ensureModuloAccess: () => undefined,
  isUuid: (value: string) => /^[0-9a-f-]{36}$/i.test(value)
}));

import { handleOrcamentosCreatePost } from './create';

beforeAll(async () => {
  await applyD1Migrations(
    env.DB,
    env.TEST_MIGRATIONS.filter((migration) => !migration.name.endsWith(' 2.sql'))
  );
  state.client = createDataClient({
    db: env.DB,
    r2: env.R2,
    secret: 'segredo-de-teste-com-32-caracteres',
    origin: 'https://vtur.app',
    headers: new Headers()
  });
});

it.each([
  { currency: 'BRL', expected: 'BRL' },
  { currency: 'USD', expected: 'USD' },
  { currency: undefined, expected: 'BRL' }
])('cria orçamento e itens no D1 com moeda $expected', async ({ currency, expected }) => {
  const response = await handleOrcamentosCreatePost({
    request: new Request('https://vtur.app/api/v1/orcamentos/create', {
      method: 'POST',
      headers: { origin: 'https://vtur.app', 'content-type': 'application/json' },
      body: JSON.stringify({
        client_name: 'Cliente de teste',
        status: 'pendente',
        status_negociacao: 'novo',
        currency,
        itens: [
          { title: 'Hotel', item_type: 'hotel', quantity: 2, unit_price: 150, total_amount: 300 }
        ]
      })
    }),
    platform: { env: { DB: env.DB } }
  } as Parameters<typeof handleOrcamentosCreatePost>[0]);

  expect(response.status).toBe(201);
  const { data } = await response.json<{ data: { id: string; total: number } }>();
  expect(data.total).toBe(300);
  const quote = await env.DB.prepare('SELECT currency, raw_json FROM legado_quote WHERE id = ?')
    .bind(data.id)
    .first<{ currency: string; raw_json: string }>();
  expect(quote!.currency).toBe(expected);
  expect(JSON.parse(quote!.raw_json)).toEqual({});
  const items = await env.DB.prepare(
    'SELECT title, currency, raw, total_amount FROM legado_quote_item WHERE quote_id = ?'
  )
    .bind(data.id)
    .all<{ title: string; currency: string; raw: string; total_amount: number }>();
  expect(items.results).toHaveLength(1);
  expect(items.results[0]).toMatchObject({
    title: 'Hotel',
    currency: expected,
    total_amount: 300
  });
  expect(JSON.parse(items.results[0].raw)).toEqual({});
});
