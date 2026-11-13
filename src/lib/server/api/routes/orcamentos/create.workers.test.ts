/// <reference types="@cloudflare/vitest-pool-workers" />
import { applyD1Migrations, env } from 'cloudflare:test';
import { beforeAll, expect, it, vi } from 'vitest';
import { createDataClient } from '$lib/server/data/query';

const state = vi.hoisted(() => ({
  client: null as ReturnType<typeof createDataClient> | null,
  userId: crypto.randomUUID(),
  isAdmin: true
}));

vi.mock('$lib/server/v1', async (original) => ({
  ...(await original<typeof import('$lib/server/v1')>()),
  getAdminClient: () => state.client,
  requireAuthenticatedUser: async () => ({ id: state.userId }),
  resolveUserScope: async () => ({
    userId: state.userId,
    isAdmin: state.isAdmin,
    companyIds: []
  }),
  resolveScopedCompanyIds: () => [],
  parseUuidList: () => [],
  fetchVendedorIdsByCompanyIds: async () => [],
  ensureModuloAccess: () => undefined,
  isUuid: (value: string) => /^[0-9a-f-]{36}$/i.test(value)
}));

import { handleOrcamentosCreatePost } from './create';
import { handleOrcamentosIdGet } from './id';

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

it('retorna itens, segmentos e configurações próprias apenas para prévia autorizada', async () => {
  const ownerId = state.userId;
  const otherId = crypto.randomUUID();
  const quoteId = crypto.randomUUID();
  const itemId = crypto.randomUUID();
  await env.DB.batch([
    env.DB.prepare('INSERT INTO legado_users (id, email) VALUES (?, ?), (?, ?)').bind(
      ownerId,
      'owner@example.test',
      otherId,
      'other@example.test'
    ),
    env.DB.prepare(
      "INSERT INTO legado_quote (id, created_by, client_name, status, status_negociacao, currency, raw_json) VALUES (?, ?, 'Cliente', 'pendente', 'novo', 'BRL', '{}')"
    ).bind(quoteId, ownerId),
    env.DB.prepare(
      "INSERT INTO legado_quote_item (id, quote_id, item_type, title, currency, raw) VALUES (?, ?, 'circuito', 'Viagem', 'BRL', '{}')"
    ).bind(itemId, quoteId),
    env.DB.prepare(
      "INSERT INTO legado_quote_item_segment (id, quote_item_id, segment_type, data) VALUES (?, ?, 'circuit_day', ?)"
    ).bind(crypto.randomUUID(), itemId, JSON.stringify({ titulo: 'Roma' })),
    env.DB.prepare(
      'INSERT INTO legado_quote_print_settings (id, owner_user_id, consultor_nome) VALUES (?, ?, ?), (?, ?, ?)'
    ).bind(crypto.randomUUID(), ownerId, 'Consultor', crypto.randomUUID(), otherId, 'Outro')
  ]);
  const event = (preview = false) => {
    const url = new URL(
      `https://vtur.app/api/v1/orcamentos/${quoteId}${preview ? '?preview_pdf=1' : ''}`
    );
    return {
      request: new Request(url),
      url,
      params: { id: quoteId }
    } as Parameters<typeof handleOrcamentosIdGet>[0];
  };

  state.isAdmin = false;
  try {
    const response = await handleOrcamentosIdGet(event(true));
    expect(response.status).toBe(200);
    expect(await response.json()).toMatchObject({
      client_name: 'Cliente',
      pdf_settings: { consultor_nome: 'Consultor' },
      itens: [
        { title: 'Viagem', segments: [{ segment_type: 'circuit_day', data: { titulo: 'Roma' } }] }
      ]
    });
    const normal = await handleOrcamentosIdGet(event());
    expect(await normal.json()).not.toHaveProperty('pdf_settings');
    state.userId = otherId;
    expect((await handleOrcamentosIdGet(event(true))).status).toBe(404);
    state.isAdmin = true;
    const adminResponse = await handleOrcamentosIdGet(event(true));
    expect(adminResponse.status).toBe(200);
    expect(await adminResponse.json()).toMatchObject({
      pdf_settings: { consultor_nome: 'Outro' }
    });
  } finally {
    state.userId = ownerId;
    state.isAdmin = true;
  }
});
