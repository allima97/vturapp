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
  allowed: true
}));
vi.mock('$lib/server/v1', () => ({
  getAdminClient: () => state.client,
  requireAuthenticatedUser: async () => ({ id: state.userId }),
  resolveUserScope: async () => ({
    userId: state.userId,
    isAdmin: false,
    isMaster: false,
    isGestor: false,
    isVendedor: true,
    usoIndividual: state.individual,
    companyId: state.companyId,
    companyIds: state.companyId ? [state.companyId] : []
  }),
  ensureModuloAccess: () => {
    if (!state.allowed) throw { status: 403, message: 'Acesso negado.' };
  },
  resolveScopedCompanyIds: (scope: { companyIds: string[] }, requested?: string | null) =>
    requested && !scope.companyIds.includes(requested)
      ? ['no-match']
      : requested
        ? [requested]
        : scope.companyIds.length
          ? scope.companyIds
          : ['no-match'],
  resolveScopedCompanyId: (scope: { companyId: string | null }, requested?: string | null) =>
    requested && requested !== scope.companyId ? null : scope.companyId,
  isUuid: (id: string) => /^[0-9a-f]{8}-(?:[0-9a-f]{4}-){3}[0-9a-f]{12}$/i.test(id),
  toErrorResponse: (err: { status?: number; message?: string }) =>
    new Response(err.message || JSON.stringify(err), { status: err.status || 500 })
}));
import {
  handleVoucherAssetsGet,
  handleVoucherAssetsPost,
  handleVoucherAssetsPatch,
  handleVoucherAssetsDelete,
  handleVoucherSettingsPatch
} from './root';

const owner = '11111111-1111-4111-8111-111111111111';
const other = '22222222-2222-4222-8222-222222222222';
const company = '33333333-3333-4333-8333-333333333333';
const existing = '44444444-4444-4444-8444-444444444444';

function event(path: string, method = 'GET', body?: FormData | object): RequestEvent {
  const url = new URL(`https://vtur.app${path}`);
  const form = body instanceof FormData;
  return {
    url,
    request: new Request(url, {
      method,
      headers: { origin: url.origin, ...(form ? {} : { 'content-type': 'application/json' }) },
      body: body === undefined ? undefined : form ? body : JSON.stringify(body)
    }),
    platform: { env: { DB: env.DB } },
    params: {}
  } as RequestEvent;
}

function upload() {
  const form = new FormData();
  form.set('provider', 'special_tours');
  form.set('asset_kind', 'logo');
  form.set(
    'file',
    new File([new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])], 'logo.png', {
      type: 'image/png'
    })
  );
  return form;
}

beforeAll(async () => {
  await applyD1Migrations(
    env.DB,
    env.TEST_MIGRATIONS.filter((item) => item.name < '0030_' && !item.name.endsWith(' 2.sql'))
  );
  await env.DB.batch([
    env.DB.prepare(
      'INSERT INTO legado_companies (id, nome_empresa, nome_fantasia, cnpj) VALUES (?, ?, ?, ?)'
    ).bind(company, 'A', 'A', '11111111111111'),
    env.DB.prepare('INSERT INTO legado_users (id, nome_completo) VALUES (?, ?)').bind(owner, 'A'),
    env.DB.prepare('INSERT INTO legado_users (id, nome_completo) VALUES (?, ?)').bind(other, 'B'),
    env.DB.prepare(
      'INSERT INTO legado_voucher_assets (id, company_id, created_by, provider, asset_kind, storage_bucket, storage_path, ativo) VALUES (?, ?, ?, ?, ?, ?, ?, 1)'
    ).bind(existing, company, owner, 'special_tours', 'logo', 'voucher-assets', 'logo-antigo.png')
  ]);
  const migration = env.TEST_MIGRATIONS.find((item) => item.name.startsWith('0030_'));
  if (!migration) throw new Error('Migração 0030 não encontrada.');
  await applyD1Migrations(env.DB, [migration]);
  state.client = createDataClient({
    db: env.DB,
    r2: env.R2,
    secret: 'segredo-de-teste-com-32-caracteres',
    origin: 'https://vtur.app',
    headers: new Headers()
  });
});

it('preserva assets empresariais ao migrar', async () => {
  expect(
    await env.DB.prepare('SELECT company_id, storage_path FROM legado_voucher_assets WHERE id = ?')
      .bind(existing)
      .first()
  ).toEqual({ company_id: company, storage_path: 'logo-antigo.png' });
  expect((await env.DB.prepare('PRAGMA foreign_key_check').all()).results).toEqual([]);
});

it('permite gerenciar logos individuais sem expor arquivos entre usuários ou empresas', async () => {
  state.userId = owner;
  const response = await handleVoucherAssetsPost(event('/api/v1/voucher-assets', 'POST', upload()));
  expect(response.status, await response.clone().text()).toBe(200);
  const { item } = await response.json<{
    item: { id: string; company_id: string | null; storage_path: string; preview_url: string };
  }>();
  expect(item.company_id).toBeNull();
  expect(item.storage_path).toContain(`individual/${owner}/`);
  expect(item.preview_url).toContain('/api/arquivos/assinado/');
  const requestedCompany = upload();
  requestedCompany.set('company_id', company);
  expect(
    (await handleVoucherAssetsPost(event('/api/v1/voucher-assets', 'POST', requestedCompany)))
      .status
  ).toBe(403);
  expect(await env.R2.head(`arquivos/voucher-assets/${item.storage_path}`)).not.toBeNull();
  const items = await (
    await handleVoucherAssetsGet(event('/api/v1/voucher-assets'))
  ).json<{ items: { id: string }[]; individual: boolean; company_id: string | null }>();
  expect(items.items.map((row) => row.id)).toEqual([item.id]);
  expect(items.individual).toBe(true);
  expect(items.company_id).toBeNull();
  const update = new FormData();
  update.set('id', item.id);
  update.set('label', 'Logo editado');
  update.set(
    'file',
    new File([new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])], 'novo.png', {
      type: 'image/png'
    })
  );
  const updated = await handleVoucherAssetsPatch(event('/api/v1/voucher-assets', 'PATCH', update));
  expect(updated.status, await updated.clone().text()).toBe(200);
  const updatedItem = (await updated.json<{ item: { storage_path: string } }>()).item;
  expect(updatedItem.storage_path).not.toBe(item.storage_path);
  expect(await env.R2.head(`arquivos/voucher-assets/${item.storage_path}`)).toBeNull();
  expect(await env.R2.head(`arquivos/voucher-assets/${updatedItem.storage_path}`)).not.toBeNull();
  state.userId = other;
  expect(
    (
      await (
        await handleVoucherAssetsGet(event('/api/v1/voucher-assets'))
      ).json<{ items: unknown[] }>()
    ).items
  ).toEqual([]);
  expect(
    (await handleVoucherAssetsPatch(event('/api/v1/voucher-assets', 'PATCH', update))).status
  ).toBe(404);
  expect(
    (await handleVoucherAssetsDelete(event(`/api/v1/voucher-assets?id=${item.id}`, 'DELETE')))
      .status
  ).toBe(404);
  state.userId = owner;
  state.individual = false;
  state.companyId = company;
  expect(
    (
      await (
        await handleVoucherAssetsGet(event('/api/v1/voucher-assets'))
      ).json<{ items: { id: string }[] }>()
    ).items.map((row) => row.id)
  ).toEqual([existing]);
  expect(
    (await handleVoucherAssetsDelete(event(`/api/v1/voucher-assets?id=${item.id}`, 'DELETE')))
      .status
  ).toBe(404);
  state.individual = true;
  state.companyId = null;
  expect(
    (await handleVoucherAssetsDelete(event(`/api/v1/voucher-assets?id=${item.id}`, 'DELETE')))
      .status
  ).toBe(200);
  expect(await env.R2.head(`arquivos/voucher-assets/${updatedItem.storage_path}`)).toBeNull();
});

it('salva escolha pessoal, valida opções e exige permissão', async () => {
  state.userId = owner;
  const set = await handleVoucherSettingsPatch(
    event('/api/v1/voucher-assets/settings', 'PATCH', { logo_esquerdo: 'operadora' })
  );
  expect(set.status).toBe(200);
  expect(
    (
      await (
        await handleVoucherAssetsGet(event('/api/v1/voucher-assets'))
      ).json<{ logo_esquerdo: string }>()
    ).logo_esquerdo
  ).toBe('operadora');
  state.userId = other;
  expect(
    (
      await (
        await handleVoucherAssetsGet(event('/api/v1/voucher-assets'))
      ).json<{ logo_esquerdo: string }>()
    ).logo_esquerdo
  ).toBe('vtur');
  expect(
    (
      await handleVoucherSettingsPatch(
        event('/api/v1/voucher-assets/settings', 'PATCH', { logo_esquerdo: 'invalido' })
      )
    ).status
  ).toBe(400);
  state.allowed = false;
  expect(
    (
      await handleVoucherSettingsPatch(
        event('/api/v1/voucher-assets/settings', 'PATCH', { logo_esquerdo: 'empresa' })
      )
    ).status
  ).toBe(403);
  state.allowed = true;
});
