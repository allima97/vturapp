/// <reference types="@cloudflare/vitest-pool-workers" />
import { applyD1Migrations, env } from 'cloudflare:test';
import { beforeAll, expect, it, vi } from 'vitest';
import { createDataClient } from '$lib/server/data/query';
import type { RequestEvent } from '@sveltejs/kit';

const state = vi.hoisted(() => ({
  client: null as ReturnType<typeof createDataClient> | null,
  userId: '11111111-1111-4111-8111-111111111111',
  companyId: null as string | null,
  individual: true,
  admin: false
}));

vi.mock('$lib/server/v1', () => ({
  getAdminClient: () => state.client,
  requireAuthenticatedUser: async () => ({ id: state.userId }),
  resolveUserScope: async () => ({
    userId: state.userId,
    isAdmin: state.admin,
    isVendedor: !state.admin,
    usoIndividual: state.individual,
    companyId: state.companyId,
    companyIds: state.companyId ? [state.companyId] : []
  }),
  ensureModuloAccess: vi.fn(),
  resolveScopedCompanyIds: (scope: { companyIds: string[]; isAdmin: boolean }) =>
    scope.isAdmin ? [] : scope.companyIds.length ? scope.companyIds : ['no-match'],
  isUuid: (id: string) => /^[0-9a-f]{8}-(?:[0-9a-f]{4}-){3}[0-9a-f]{12}$/i.test(id),
  logServerError: vi.fn(),
  toErrorResponse: (err: { message?: string }) =>
    new Response(err.message || JSON.stringify(err), { status: 500 })
}));
vi.mock('$lib/config/destinosGeograficos', () => ({
  fornecedoresGeograficosAtivos: false,
  revisaoRoteiroAtiva: false,
  modulosOperacionaisGeograficosAtivos: false,
  campoGeografico: () => ({})
}));

import { handleVouchersGet, handleVouchersPost } from './root';
import { handleVouchersCreatePost } from './create';
import { handleVouchersIdGet, handleVouchersIdPatch, handleVouchersIdDelete } from './id';
import { handleVouchersDeleteDelete } from './delete';

const owner = '11111111-1111-4111-8111-111111111111';
const other = '22222222-2222-4222-8222-222222222222';
const company = '33333333-3333-4333-8333-333333333333';
const oldVoucher = '44444444-4444-4444-8444-444444444444';
const day = '55555555-5555-4555-8555-555555555555';
const hotel = '66666666-6666-4666-8666-666666666666';

function event(path: string, method = 'GET', body?: object, id?: string): RequestEvent {
  const url = new URL(`https://vtur.app${path}`);
  return {
    url,
    request: new Request(url, {
      method,
      headers: { origin: url.origin, 'content-type': 'application/json' },
      body: body === undefined ? undefined : JSON.stringify(body)
    }),
    platform: { env: { DB: env.DB } },
    params: id ? { id } : {}
  } as RequestEvent;
}

beforeAll(async () => {
  await applyD1Migrations(
    env.DB,
    env.TEST_MIGRATIONS.filter((item) => item.name < '0029_' && !item.name.endsWith(' 2.sql'))
  );
  await env.DB.batch([
    env.DB.prepare(
      'INSERT INTO legado_companies (id, nome_empresa, nome_fantasia, cnpj) VALUES (?, ?, ?, ?)'
    ).bind(company, 'A', 'A', '11111111111111'),
    env.DB.prepare('INSERT INTO legado_users (id, nome_completo) VALUES (?, ?)').bind(owner, 'A'),
    env.DB.prepare('INSERT INTO legado_users (id, nome_completo) VALUES (?, ?)').bind(other, 'B'),
    env.DB.prepare(
      'INSERT INTO legado_vouchers (id, company_id, created_by, provider, nome, extra_data) VALUES (?, ?, ?, ?, ?, ?)'
    ).bind(oldVoucher, company, owner, 'special_tours', 'Existente', '{}'),
    env.DB.prepare(
      'INSERT INTO legado_voucher_dias (id, voucher_id, dia_numero, descricao, destino_geografico_id) VALUES (?, ?, 1, ?, ?)'
    ).bind(day, oldVoucher, 'Dia', 'destino'),
    env.DB.prepare(
      'INSERT INTO legado_voucher_hoteis (id, voucher_id, cidade, hotel, destino_geografico_id) VALUES (?, ?, ?, ?, ?)'
    ).bind(hotel, oldVoucher, 'Cidade', 'Hotel', 'destino')
  ]);
  const migration = env.TEST_MIGRATIONS.find((item) => item.name.startsWith('0029_'));
  if (!migration) throw new Error('Migração 0029 não encontrada.');
  await applyD1Migrations(env.DB, [migration]);
  state.client = createDataClient({
    db: env.DB,
    r2: env.R2,
    secret: 'segredo-de-teste-com-32-caracteres',
    origin: 'https://vtur.app',
    headers: new Headers()
  });
});

it('preserva vouchers existentes e seus dias e hotéis durante a migração', async () => {
  expect(
    await env.DB.prepare('SELECT company_id FROM legado_vouchers WHERE id = ?')
      .bind(oldVoucher)
      .first()
  ).toEqual({ company_id: company });
  expect(
    await env.DB.prepare('SELECT destino_geografico_id FROM legado_voucher_dias WHERE id = ?')
      .bind(day)
      .first()
  ).toEqual({ destino_geografico_id: 'destino' });
  expect(
    await env.DB.prepare('SELECT destino_geografico_id FROM legado_voucher_hoteis WHERE id = ?')
      .bind(hotel)
      .first()
  ).toEqual({ destino_geografico_id: 'destino' });
  expect((await env.DB.prepare('PRAGMA foreign_key_check').all()).results).toEqual([]);
});

it('permite criar, listar, editar e excluir somente os próprios vouchers individuais', async () => {
  state.userId = owner;
  const created = await handleVouchersPost(
    event('/api/v1/vouchers', 'POST', { nome: 'Individual', company_id: company })
  );
  expect(created.status, await created.clone().text()).toBe(200);
  const { item } = await created.json<{ item: { id: string } }>();
  expect(
    await env.DB.prepare('SELECT company_id, created_by FROM legado_vouchers WHERE id = ?')
      .bind(item.id)
      .first()
  ).toEqual({ company_id: null, created_by: owner });
  expect(
    (
      await handleVouchersPost(
        event('/api/v1/vouchers', 'POST', { nome: 'Viagem inválida', viagem_id: oldVoucher })
      )
    ).status
  ).toBe(403);
  state.companyId = company;
  expect(
    (
      await (
        await handleVouchersGet(event(`/api/v1/vouchers?company_id=${company}`))
      ).json<{ items: { id: string }[] }>()
    ).items.map((row) => row.id)
  ).toEqual([item.id]);
  state.companyId = null;
  const listed = await handleVouchersGet(event('/api/v1/vouchers'));
  expect(listed.status, await listed.clone().text()).toBe(200);
  expect((await listed.json<{ items: { id: string }[] }>()).items.map((row) => row.id)).toEqual([
    item.id
  ]);
  expect((await handleVouchersIdGet(event('/detail', 'GET', undefined, item.id))).status).toBe(200);
  expect(
    (await handleVouchersIdPatch(event('/detail', 'PATCH', { nome: 'Editado' }, item.id))).status
  ).toBe(200);
  state.userId = other;
  expect(
    (await (await handleVouchersGet(event('/api/v1/vouchers'))).json<{ items: unknown[] }>()).items
  ).toEqual([]);
  expect((await handleVouchersIdGet(event('/detail', 'GET', undefined, item.id))).status).toBe(403);
  expect(
    (await handleVouchersIdPatch(event('/detail', 'PATCH', { nome: 'Outro' }, item.id))).status
  ).toBe(403);
  expect(
    (await handleVouchersIdDelete(event('/detail', 'DELETE', undefined, item.id))).status
  ).toBe(403);
  expect(
    (await handleVouchersDeleteDelete(event(`/api/v1/vouchers/delete?id=${item.id}`, 'DELETE')))
      .status
  ).toBe(403);
  state.userId = owner;
  expect(
    (await handleVouchersIdDelete(event('/detail', 'DELETE', undefined, item.id))).status
  ).toBe(200);
  const legacy = await handleVouchersCreatePost(
    event('/api/v1/vouchers/create', 'POST', { nome: 'Legado' })
  );
  expect(legacy.status, await legacy.clone().text()).toBe(200);
  const legacyItem = (await legacy.json<{ item: { id: string; company_id: string | null } }>())
    .item;
  expect(legacyItem.company_id).toBeNull();
  expect(
    (
      await handleVouchersDeleteDelete(
        event(`/api/v1/vouchers/delete?id=${legacyItem.id}`, 'DELETE')
      )
    ).status
  ).toBe(200);
});

it('mantém isolamento empresarial e acesso administrativo', async () => {
  state.individual = false;
  state.companyId = company;
  state.userId = other;
  expect((await handleVouchersIdGet(event('/detail', 'GET', undefined, oldVoucher))).status).toBe(
    200
  );
  expect(
    (
      await (await handleVouchersGet(event('/api/v1/vouchers'))).json<{ items: { id: string }[] }>()
    ).items.map((row) => row.id)
  ).toContain(oldVoucher);
  state.companyId = null;
  expect((await handleVouchersIdGet(event('/detail', 'GET', undefined, oldVoucher))).status).toBe(
    403
  );
  expect(
    (await handleVouchersPost(event('/api/v1/vouchers', 'POST', { nome: 'Sem empresa' }))).status
  ).toBe(400);
  state.admin = true;
  expect((await handleVouchersIdGet(event('/detail', 'GET', undefined, oldVoucher))).status).toBe(
    200
  );
});
