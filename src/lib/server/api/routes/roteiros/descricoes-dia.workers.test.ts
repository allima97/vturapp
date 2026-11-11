/// <reference types="@cloudflare/vitest-pool-workers" />
import { applyD1Migrations, env } from 'cloudflare:test';
import { beforeAll, expect, it, vi } from 'vitest';
import { createDataClient } from '$lib/server/data/query';

const ids = vi.hoisted(() => ({
  empresaA: '11111111-1111-4111-8111-111111111111',
  empresaB: '22222222-2222-4222-8222-222222222222',
  cidade: '33333333-3333-4333-8333-333333333333',
  cidadeSolta: '44444444-4444-4444-8444-444444444444',
  personalizado: '55555555-5555-4555-8555-555555555555'
}));

const state = vi.hoisted(() => ({
  client: null as ReturnType<typeof createDataClient> | null,
  scope: {
    userId: 'owner',
    isAdmin: false,
    companyIds: [] as string[]
  }
}));

vi.mock('$lib/server/v1', async (original) => ({
  ...(await original<typeof import('$lib/server/v1')>()),
  getAdminClient: () => state.client,
  requireAuthenticatedUser: async () => ({ id: 'owner' }),
  resolveUserScope: async () => state.scope,
  ensureModuloAccess: () => undefined,
  isUuid: (value: string) => /^[0-9a-f-]{36}$/i.test(value)
}));

import { handleRoteirosDescricoesDiaGet } from './descricoes-dia';

function event(query: string) {
  return {
    url: new URL(`https://vtur.app/api/v1/roteiros/descricoes-dia?${query}`),
    platform: { env: { DB: env.DB } }
  } as Parameters<typeof handleRoteirosDescricoesDiaGet>[0];
}

beforeAll(async () => {
  await applyD1Migrations(env.DB, env.TEST_MIGRATIONS);
  const roteiro = crypto.randomUUID();
  const circuito = crypto.randomUUID();
  const diaCircuito = crypto.randomUUID();
  const diaPersonalizado = crypto.randomUUID();
  await env.DB.batch([
    env.DB.prepare(
      'INSERT INTO legado_companies (id, nome_empresa, nome_fantasia, cnpj) VALUES (?, ?, ?, ?)'
    ).bind(ids.empresaA, 'Empresa A', 'Empresa A', '111'),
    env.DB.prepare(
      'INSERT INTO legado_companies (id, nome_empresa, nome_fantasia, cnpj) VALUES (?, ?, ?, ?)'
    ).bind(ids.empresaB, 'Empresa B', 'Empresa B', '222'),
    env.DB.prepare(
      "INSERT INTO legado_roteiro_personalizado (id, created_by, nome, opcionais) VALUES (?, 'owner', 'Viagem', '[]')"
    ).bind(roteiro),
    env.DB.prepare(
      'INSERT INTO legado_cidades (id, nome, destino_geografico_id) VALUES (?, ?, ?)'
    ).bind(ids.cidade, 'Roma, Lácio, Itália', 'geonames:3169070'),
    env.DB.prepare('INSERT INTO legado_cidades (id, nome) VALUES (?, ?)').bind(
      ids.cidadeSolta,
      'Roma'
    ),
    env.DB.prepare(
      "INSERT INTO legado_roteiro_dia (id, created_by, company_id, roteiro_id, cidade, cidade_id, descricao, created_at) VALUES (?, 'owner', ?, ?, 'Roma, Lácio, Itália', 'geonames:3169070', 'Visita à Sagrada Família', '2026-01-02T00:00:00Z')"
    ).bind(crypto.randomUUID(), ids.empresaA, roteiro),
    env.DB.prepare(
      "INSERT INTO legado_roteiro_dia (id, created_by, company_id, roteiro_id, cidade, cidade_id, descricao, created_at) VALUES (?, 'owner', ?, ?, 'Roma, Lácio, Itália', 'geonames:3169070', 'visita a sagrada familia', '2026-03-01T00:00:00Z')"
    ).bind(crypto.randomUUID(), ids.empresaA, roteiro),
    env.DB.prepare(
      "INSERT INTO legado_roteiro_dia (id, created_by, company_id, roteiro_id, cidade, cidade_id, descricao, created_at) VALUES (?, 'outro', ?, ?, 'Roma', 'geonames:3169070', 'Texto de outra empresa', '2026-04-01T00:00:00Z')"
    ).bind(crypto.randomUUID(), ids.empresaB, roteiro),
    env.DB.prepare(
      "INSERT INTO legado_roteiro_dia (id, created_by, company_id, roteiro_id, cidade, descricao, created_at) VALUES (?, 'owner', ?, ?, 'Roma', 'Passeio antigo sem identidade', '2026-05-01T00:00:00Z')"
    ).bind(crypto.randomUUID(), ids.empresaA, roteiro),
    env.DB.prepare(
      "INSERT INTO legado_roteiro_dia (id, created_by, company_id, roteiro_id, cidade, cidade_id, descricao, created_at) VALUES (?, 'owner', ?, ?, 'Personalizada', ?, 'Passeio do destino próprio', '2026-06-01T00:00:00Z')"
    ).bind(crypto.randomUUID(), ids.empresaA, roteiro, `personalizado:${ids.personalizado}`),
    env.DB.prepare("INSERT INTO legado_circuitos (id, nome) VALUES (?, 'Clássico')").bind(circuito),
    env.DB.prepare(
      "INSERT INTO legado_circuito_dias (id, circuito_id, dia_numero, descricao, created_at) VALUES (?, ?, 1, 'Tarde de praia', '2026-02-01T00:00:00Z')"
    ).bind(diaCircuito, circuito),
    env.DB.prepare(
      'INSERT INTO legado_circuito_dias_cidades (id, circuito_dia_id, cidade_id) VALUES (?, ?, ?)'
    ).bind(crypto.randomUUID(), diaCircuito, ids.cidade),
    env.DB.prepare(
      "INSERT INTO legado_circuito_dias (id, circuito_id, dia_numero, descricao) VALUES (?, ?, 2, 'Dia solto do circuito')"
    ).bind(diaPersonalizado, circuito),
    env.DB.prepare(
      'INSERT INTO legado_circuito_dias_cidades (id, circuito_dia_id, cidade_id) VALUES (?, ?, ?)'
    ).bind(crypto.randomUUID(), diaPersonalizado, ids.cidadeSolta)
  ]);
  state.client = createDataClient({
    db: env.DB,
    r2: env.R2,
    secret: 'segredo-de-teste-com-32-caracteres',
    origin: 'http://localhost',
    headers: new Headers()
  });
});

it('lista descrições da mesma identidade, ignora texto solto e respeita a empresa', async () => {
  state.scope = { userId: 'owner', isAdmin: false, companyIds: [ids.empresaA] };
  const response = await handleRoteirosDescricoesDiaGet(event('cidade_id=geonames:3169070'));
  expect(response.status).toBe(200);
  const body = await response.json<{
    total: number;
    itens: Array<{ texto: string; usos: number }>;
  }>();
  expect(body.total).toBe(2);
  expect(body.itens).toEqual([
    { texto: 'visita a sagrada familia', usos: 2 },
    { texto: 'Tarde de praia', usos: 1 }
  ]);
  const busca = await handleRoteirosDescricoesDiaGet(event('cidade_id=geonames:3169070&q=Sagrada'));
  expect(await busca.json()).toMatchObject({
    total: 2,
    filtrados: 1,
    itens: [{ texto: 'visita a sagrada familia', usos: 2 }]
  });
  const proprio = await handleRoteirosDescricoesDiaGet(
    event(`cidade_id=personalizado:${ids.personalizado}`)
  );
  expect(await proprio.json()).toMatchObject({
    itens: [{ texto: 'Passeio do destino próprio', usos: 1 }]
  });
  expect((await handleRoteirosDescricoesDiaGet(event('cidade_id=Roma'))).status).toBe(400);
});

it('não devolve descrição de outra empresa', async () => {
  state.scope = { userId: 'owner', isAdmin: false, companyIds: [ids.empresaB] };
  const response = await handleRoteirosDescricoesDiaGet(
    event('cidade_id=geonames:3169070&q=empresa')
  );
  const body = await response.json<{ itens: Array<{ texto: string }> }>();
  expect(body.itens.map((item) => item.texto)).toEqual(['Texto de outra empresa']);
});
