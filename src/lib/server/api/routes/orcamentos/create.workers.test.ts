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
  normalizeText: (value: unknown) => String(value ?? '').toLowerCase(),
  isUuid: (value: string) => /^[0-9a-f-]{36}$/i.test(value)
}));

import { handleOrcamentosCreatePost } from './create';
import { handleOrcamentosIdGet, handleOrcamentosIdPatch } from './id';
import { handleOrcamentosListGet } from './list';
import { handleOrcamentosSavePost } from './save';

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
        valid_until: '2027-07-15',
        itens: [
          {
            title: 'Hotel',
            item_type: 'hotel',
            city_name: 'Roma',
            quantity: 2,
            unit_price: 150,
            total_amount: 300,
            start_date: '2027-08-11',
            end_date: '2027-08-13',
            raw: {
              detalhes_orcamento: {
                categoria: '4 estrelas',
                adultos: 2,
                criancas: 0,
                tipo_apartamento: 'Duplo',
                quantidade_apartamentos: 2,
                regime: 'Café da manhã'
              }
            }
          }
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
  expect(JSON.parse(quote!.raw_json)).toEqual({ valid_until: '2027-07-15' });
  const url = new URL(`https://vtur.app/api/v1/orcamentos/${data.id}`);
  const detail = await handleOrcamentosIdGet({
    url,
    params: { id: data.id },
    request: new Request(url)
  } as Parameters<typeof handleOrcamentosIdGet>[0]);
  expect(await detail.json()).toMatchObject({ valid_until: '2027-07-15' });
  const listUrl = new URL('https://vtur.app/api/v1/orcamentos/list');
  const list = await handleOrcamentosListGet({
    url: listUrl,
    request: new Request(listUrl)
  } as Parameters<typeof handleOrcamentosListGet>[0]);
  expect(await list.json()).toEqual(
    expect.arrayContaining([expect.objectContaining({ id: data.id, data_validade: '2027-07-15' })])
  );
  const items = await env.DB.prepare(
    'SELECT title, currency, raw, total_amount, start_date, end_date FROM legado_quote_item WHERE quote_id = ?'
  )
    .bind(data.id)
    .all<{ title: string; currency: string; raw: string; total_amount: number }>();
  expect(items.results).toHaveLength(1);
  expect(items.results[0]).toMatchObject({
    title: 'Hotel',
    currency: expected,
    total_amount: 300
  });
  expect(items.results[0]).toMatchObject({ start_date: '2027-08-11', end_date: '2027-08-13' });
  expect(JSON.parse(items.results[0].raw)).toEqual({
    detalhes_orcamento: {
      categoria: '4 estrelas',
      adultos: 2,
      criancas: 0,
      tipo_apartamento: 'Duplo',
      quantidade_apartamentos: 2,
      regime: 'Café da manhã'
    }
  });
});

it('preserva os trechos aéreos estruturados ao criar orçamento', async () => {
  const segmento = {
    tipo_voo: 'Internacional',
    trecho: 'GRU → FCO',
    cia_aerea: 'LATAM Airlines',
    numero_voo: 'LA 8120',
    data_voo: '2027-08-10',
    hora_saida: '17:50',
    aeroporto_saida: 'GRU',
    data_fim: '2027-08-11',
    hora_chegada: '10:15',
    aeroporto_chegada: 'FCO',
    classe_reserva: 'Econômica',
    tarifa_nome: 'FULL'
  };
  const response = await handleOrcamentosCreatePost({
    request: new Request('https://vtur.app/api/v1/orcamentos/create', {
      method: 'POST',
      headers: { origin: 'https://vtur.app', 'content-type': 'application/json' },
      body: JSON.stringify({
        client_name: 'Cliente de teste',
        valid_until: '2027-07-15',
        itens: [
          {
            title: 'Passagem Aérea Ida e Volta',
            item_type: 'passagem',
            quantity: 1,
            unit_price: 6500,
            total_amount: 6500,
            start_date: '2027-08-10',
            end_date: '2027-08-11',
            raw: {
              detalhes_orcamento: {
                categoria: 'Econômica',
                adultos: 1,
                criancas: 0
              },
              aereo_import: { segmentos: [segmento] }
            }
          }
        ]
      })
    }),
    platform: { env: { DB: env.DB } }
  } as Parameters<typeof handleOrcamentosCreatePost>[0]);

  expect(response.status).toBe(201);
  const { data } = await response.json<{ data: { id: string } }>();
  const item = await env.DB.prepare('SELECT raw FROM legado_quote_item WHERE quote_id = ?')
    .bind(data.id)
    .first<{ raw: string }>();
  expect(JSON.parse(item!.raw)).toMatchObject({
    aereo_import: { segmentos: [segmento] },
    detalhes_orcamento: {
      adultos: 1,
      adultos_valor: 6500,
      criancas: 0,
      criancas_valor: 0,
      infant: null,
      infant_valor: 0
    }
  });
});

it('preserva a validade ao salvar metadados do orçamento em outro fluxo', async () => {
  const quoteId = crypto.randomUUID();
  await env.DB.prepare(
    "INSERT INTO legado_quote (id, created_by, status, status_negociacao, currency, raw_json) VALUES (?, ?, 'pendente', 'novo', 'BRL', ?)"
  )
    .bind(quoteId, state.userId, JSON.stringify({ valid_until: '2027-07-15' }))
    .run();
  const url = new URL('https://vtur.app/api/v1/orcamentos/save');
  const response = await handleOrcamentosSavePost({
    url,
    request: new Request(url, {
      method: 'POST',
      headers: { origin: 'https://vtur.app', 'content-type': 'application/json' },
      body: JSON.stringify({
        quote_id: quoteId,
        client_name: 'Cliente',
        items: [],
        raw_json: { origem: 'teste' }
      })
    }),
    platform: { env: { DB: env.DB } }
  } as Parameters<typeof handleOrcamentosSavePost>[0]);
  expect(response.status).toBe(200);
  const saved = await env.DB.prepare('SELECT raw_json FROM legado_quote WHERE id = ?')
    .bind(quoteId)
    .first<{ raw_json: string }>();
  expect(JSON.parse(saved!.raw_json)).toEqual({ valid_until: '2027-07-15', origem: 'teste' });
});

it('valida os detalhes antes de criar um orçamento', async () => {
  const response = await handleOrcamentosCreatePost({
    request: new Request('https://vtur.app/api/v1/orcamentos/create', {
      method: 'POST',
      headers: { origin: 'https://vtur.app', 'content-type': 'application/json' },
      body: JSON.stringify({
        client_name: 'Cliente',
        itens: [{ title: 'Hotel', item_type: 'hotel' }]
      })
    }),
    platform: { env: { DB: env.DB } }
  } as Parameters<typeof handleOrcamentosCreatePost>[0]);
  expect(response.status).toBe(400);
  expect(await response.json()).toMatchObject({ error: expect.stringContaining('datas') });
});

it('salva e retorna a ordem manual dos itens no orçamento', async () => {
  const create = await handleOrcamentosCreatePost({
    request: new Request('https://vtur.app/api/v1/orcamentos/create', {
      method: 'POST',
      headers: { origin: 'https://vtur.app', 'content-type': 'application/json' },
      body: JSON.stringify({
        client_name: 'Cliente',
        valid_until: '2027-07-15',
        itens: ['Primeiro', 'Segundo'].map((title, order_index) => ({
          title,
          item_type: 'passagem',
          order_index,
          quantity: 1,
          unit_price: 150,
          total_amount: 150,
          start_date: '2027-08-11',
          end_date: '2027-08-13',
          raw: { detalhes_orcamento: { adultos: 1, adultos_valor: 150 } }
        }))
      })
    }),
    platform: { env: { DB: env.DB } }
  } as Parameters<typeof handleOrcamentosCreatePost>[0]);
  expect(create.status).toBe(201);
  const { data } = await create.json<{ data: { id: string } }>();
  const url = new URL(`https://vtur.app/api/v1/orcamentos/${data.id}`);
  const get = () =>
    handleOrcamentosIdGet({
      url,
      params: { id: data.id },
      request: new Request(url)
    } as Parameters<typeof handleOrcamentosIdGet>[0]);
  const original = await (await get()).json<{ itens: Array<Record<string, unknown>> }>();
  expect(original.itens.map((item) => item.title)).toEqual(['Primeiro', 'Segundo']);
  const patch = await handleOrcamentosIdPatch({
    url,
    params: { id: data.id },
    request: new Request(url, {
      method: 'PATCH',
      headers: { origin: 'https://vtur.app', 'content-type': 'application/json' },
      body: JSON.stringify({ itens: [...original.itens].reverse(), valid_until: '2027-07-15' })
    }),
    platform: { env: { DB: env.DB } }
  } as Parameters<typeof handleOrcamentosIdPatch>[0]);
  expect(patch.status).toBe(200);
  const reordered = await (await get()).json<{ itens: Array<Record<string, unknown>> }>();
  expect(reordered.itens.map((item) => [item.title, item.order_index])).toEqual([
    ['Segundo', 0],
    ['Primeiro', 1]
  ]);
});

it('cria e edita item de trem com passageiros e trechos', async () => {
  const item = {
    title: 'Roma / Milão',
    item_type: 'trem',
    quantity: 3,
    unit_price: 50,
    total_amount: 150,
    start_date: '2027-08-11',
    end_date: '2027-08-11',
    raw: {
      detalhes_orcamento: { adultos: 2, adultos_valor: 50, criancas: 1, criancas_valor: 50 },
      aereo_import: { segmentos: [{ cia_aerea: 'Trenitalia', aeroporto_saida: 'ROM' }] }
    }
  };
  const create = await handleOrcamentosCreatePost({
    request: new Request('https://vtur.app/api/v1/orcamentos/create', {
      method: 'POST',
      headers: { origin: 'https://vtur.app', 'content-type': 'application/json' },
      body: JSON.stringify({ client_name: 'Cliente', valid_until: '2027-07-15', itens: [item] })
    }),
    platform: { env: { DB: env.DB } }
  } as Parameters<typeof handleOrcamentosCreatePost>[0]);
  expect(create.status).toBe(201);
  const { data } = await create.json<{ data: { id: string } }>();
  const url = new URL(`https://vtur.app/api/v1/orcamentos/${data.id}`);
  const get = () =>
    handleOrcamentosIdGet({
      url,
      params: { id: data.id },
      request: new Request(url)
    } as Parameters<typeof handleOrcamentosIdGet>[0]);
  const original = await (await get()).json<{ itens: Array<Record<string, unknown>> }>();
  expect(original.itens[0]).toMatchObject(item);
  const patch = await handleOrcamentosIdPatch({
    url,
    params: { id: data.id },
    request: new Request(url, {
      method: 'PATCH',
      headers: { origin: 'https://vtur.app', 'content-type': 'application/json' },
      body: JSON.stringify({
        valid_until: '2027-07-15',
        itens: [{ ...original.itens[0], title: 'Roma / Veneza' }]
      })
    }),
    platform: { env: { DB: env.DB } }
  } as Parameters<typeof handleOrcamentosIdPatch>[0]);
  expect(patch.status).toBe(200);
  const updated = await (await get()).json<{ itens: Array<Record<string, unknown>> }>();
  expect(updated.itens[0]).toMatchObject({ ...item, title: 'Roma / Veneza' });
});

it('atualiza detalhes sem perder o item, dados existentes ou segmentos', async () => {
  const quoteId = crypto.randomUUID();
  const itemId = crypto.randomUUID();
  await env.DB.batch([
    env.DB.prepare(
      "INSERT INTO legado_quote (id, created_by, status, status_negociacao, currency, raw_json) VALUES (?, ?, 'pendente', 'novo', 'BRL', ?)"
    ).bind(quoteId, state.userId, JSON.stringify({ roteiro_id: 'preservado' })),
    env.DB.prepare(
      "INSERT INTO legado_quote_item (id, quote_id, item_type, title, currency, raw) VALUES (?, ?, 'hotel', 'Hotel', 'BRL', ?)"
    ).bind(itemId, quoteId, JSON.stringify({ importacao: { preservada: true } })),
    env.DB.prepare(
      "INSERT INTO legado_quote_item_segment (id, quote_item_id, segment_type, data) VALUES (?, ?, 'circuit_day', '{}')"
    ).bind(crypto.randomUUID(), itemId)
  ]);
  const url = new URL(`https://vtur.app/api/v1/orcamentos/${quoteId}`);
  const item = {
    id: itemId,
    title: 'Hotel',
    item_type: 'hotel',
    city_name: 'Roma',
    quantity: 2,
    unit_price: 150,
    total_amount: 300,
    start_date: '2027-08-11',
    end_date: '2027-08-13',
    raw: {
      detalhes_orcamento: {
        categoria: '4 estrelas',
        adultos: 2,
        criancas: 0,
        tipo_apartamento: 'Duplo',
        quantidade_apartamentos: 2,
        regime: 'Café da manhã'
      }
    }
  };
  const patch = (itens: unknown[], valid_until = '2027-07-20') =>
    handleOrcamentosIdPatch({
      url,
      params: { id: quoteId },
      request: new Request(url, {
        method: 'PATCH',
        headers: { origin: 'https://vtur.app', 'content-type': 'application/json' },
        body: JSON.stringify({ total: 300, itens, valid_until })
      }),
      platform: { env: { DB: env.DB } }
    } as Parameters<typeof handleOrcamentosIdPatch>[0]);

  expect((await patch([{ ...item, end_date: '2027-08-10' }])).status).toBe(400);
  expect((await patch([item], '2027-02-30')).status).toBe(400);
  expect((await patch([item])).status).toBe(200);
  const get = await handleOrcamentosIdGet({
    url,
    params: { id: quoteId },
    request: new Request(url)
  } as Parameters<typeof handleOrcamentosIdGet>[0]);
  expect(await get.json()).toMatchObject({
    total: 300,
    valid_until: '2027-07-20',
    itens: [
      {
        id: itemId,
        start_date: '2027-08-11',
        end_date: '2027-08-13',
        raw: { importacao: { preservada: true }, detalhes_orcamento: item.raw.detalhes_orcamento },
        segments: [{ segment_type: 'circuit_day' }]
      }
    ]
  });
  const saved = await env.DB.prepare('SELECT raw_json FROM legado_quote WHERE id = ?')
    .bind(quoteId)
    .first<{ raw_json: string }>();
  expect(JSON.parse(saved!.raw_json)).toEqual({
    roteiro_id: 'preservado',
    valid_until: '2027-07-20'
  });
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
