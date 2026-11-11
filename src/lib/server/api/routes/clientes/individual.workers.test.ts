/// <reference types="@cloudflare/vitest-pool-workers" />
import { applyD1Migrations, env } from 'cloudflare:test';
import { beforeAll, expect, it, vi } from 'vitest';
import { createDataClient } from '$lib/server/data/query';
import type { RequestEvent } from '@sveltejs/kit';

const state = vi.hoisted(() => ({
  client: null as ReturnType<typeof createDataClient> | null,
  userId: '11111111-1111-4111-8111-111111111111',
  individual: true
}));

vi.mock('$lib/server/v1', () => ({
  getAdminClient: () => state.client,
  requireAuthenticatedUser: async () => ({ id: state.userId }),
  resolveUserScope: async () => ({
    userId: state.userId,
    isAdmin: false,
    isMaster: false,
    isFinanceiro: false,
    isGestor: false,
    isVendedor: true,
    usoIndividual: state.individual,
    companyId: null,
    companyIds: [],
    permissoes: {}
  }),
  isUuid: (id: string) => /^[0-9a-f]{8}-(?:[0-9a-f]{4}-){3}[0-9a-f]{12}$/i.test(id),
  ensureModuloAccess: vi.fn(),
  resolveScopedCompanyIds: (_scope: unknown, requested?: string | null) =>
    requested ? ['00000000-0000-0000-0000-000000000000'] : [],
  resolveScopedCompanyId: () => null,
  resolveScopedVendedorIds: async () => [state.userId],
  resolveAccessibleClientIds: async (
    client: ReturnType<typeof createDataClient>,
    params: { companyIds: string[]; vendedorIds: string[] }
  ) => {
    const result = await client.rpc('accessible_client_ids', {
      p_company_ids: params.companyIds,
      p_vendedor_ids: params.vendedorIds
    });
    if (result.error) throw result.error;
    return (result.data as Array<{ cliente_id: string }>).map((row) => row.cliente_id);
  },
  sanitizePostgrestSearchTerm: (value: string | null) => value || '',
  parseIntSafe: (value: string | null, fallback: number) =>
    Number.parseInt(value || '', 10) || fallback,
  fetchRankingVendedoresByCompanyIds: async () => [],
  normalizeText: (value: string) => value.toLowerCase(),
  logServerError: vi.fn(),
  toErrorResponse: (err: unknown) => {
    const error = err as { status?: number; message?: string; body?: { message?: string } };
    return new Response(error.body?.message || error.message || JSON.stringify(err), {
      status: error.status || 500
    });
  }
}));
vi.mock('$lib/server/auditLog', () => ({ registrarLog: vi.fn() }));
vi.mock('$lib/server/persistentRateLimit', () => ({
  checkPersistentRateLimit: async () => ({ allowed: true })
}));
vi.mock('$lib/config/destinosGeograficos', () => ({
  fornecedoresGeograficosAtivos: false,
  revisaoRoteiroAtiva: false,
  modulosOperacionaisGeograficosAtivos: false,
  campoGeografico: () => ({})
}));

import { handleClientesCreatePost } from './create';
import { handleClientesGet } from './root';
import { handleClientesListGet } from './list';
import { handleClientesResolveImportPost } from './resolve-import';
import { handleClientesAvisosHistoryGet } from './avisos-history';
import { handleClientesAvisosSendGet, handleClientesAvisosSendPost } from './avisos-send';
import {
  handleClientesIdAcompanhantesGet,
  handleClientesIdAcompanhantesPost
} from './id-acompanhantes';
import {
  handleClientesIdAcompanhantesAcompanhanteIdPatch,
  handleClientesIdAcompanhantesAcompanhanteIdDelete
} from './id-acompanhantes-acompanhanteId';
import { handleOrcamentosClienteCreatePost } from '../orcamentos/cliente-create';
import { ensureClienteAccess } from '$lib/server/clientes';
import type { UserScope } from '$lib/server/v1';
import { resolveAccessibleClientIds as resolveRealAccessibleClientIds } from '../../../v1';

const owner = '11111111-1111-4111-8111-111111111111';
const other = '22222222-2222-4222-8222-222222222222';
const input = { nome: 'Cliente teste', cpf: '52998224725', telefone: '11912345678' };

function event(path: string, method = 'GET', body?: object): RequestEvent {
  const url = new URL(`https://vtur.app${path}`);
  return {
    url,
    request: new Request(url, {
      method,
      headers: { origin: url.origin, 'content-type': 'application/json' },
      body: body === undefined ? undefined : JSON.stringify(body)
    }),
    params: {}
  } as RequestEvent;
}

beforeAll(async () => {
  await applyD1Migrations(env.DB, env.TEST_MIGRATIONS);
  await env.DB.batch([
    env.DB.prepare(
      'INSERT INTO legado_users (id, nome_completo, uso_individual, active) VALUES (?, ?, 1, 1)'
    ).bind(owner, 'Usuário A'),
    env.DB.prepare(
      'INSERT INTO legado_users (id, nome_completo, uso_individual, active) VALUES (?, ?, 1, 1)'
    ).bind(other, 'Usuário B')
  ]);
  state.client = createDataClient({
    db: env.DB,
    r2: env.R2,
    secret: 'segredo-de-teste-com-32-caracteres',
    origin: 'https://vtur.app',
    headers: new Headers()
  });
});

it('cria, lista e autoriza apenas o proprietário individual; rejeita empresa arbitrária', async () => {
  state.userId = owner;
  expect((await handleClientesGet(event('/api/v1/clientes'))).status).toBe(200);
  expect((await handleClientesListGet(event('/api/v1/clientes/list'))).status).toBe(200);
  const created = await handleClientesCreatePost(event('/api/v1/clientes/create', 'POST', input));
  expect(created.status, await created.clone().text()).toBe(200);
  const result = await created.json<{ data: { id: string; company_id: string | null } }>();
  expect(result.data.company_id).toBeNull();
  const stored = await env.DB.prepare('SELECT created_by FROM legado_clientes WHERE id = ?')
    .bind(result.data.id)
    .first<{ created_by: string }>();
  expect(stored?.created_by).toBe(owner);
  const list = await handleClientesGet(event('/api/v1/clientes'));
  expect(
    (await list.json<{ items: Array<{ id: string }> }>()).items.map((item) => item.id)
  ).toContain(result.data.id);
  const mainList = await handleClientesListGet(event('/api/v1/clientes/list'));
  expect(mainList.status, await mainList.clone().text()).toBe(200);
  expect(
    (await mainList.json<{ items: Array<{ id: string }> }>()).items.map((item) => item.id)
  ).toContain(result.data.id);
  const scope: UserScope = {
    userId: owner,
    nome: null,
    email: null,
    tipoNome: 'Vendedor',
    papel: 'VENDEDOR',
    permissoes: {},
    isAdmin: false,
    isMaster: false,
    isVendedor: true,
    isGestor: false,
    isFinanceiro: false,
    usoIndividual: true,
    companyId: null,
    companyIds: []
  };
  await expect(ensureClienteAccess(state.client!, scope, result.data.id)).resolves.toBeTruthy();
  const withCompanyFilter = await state.client!.rpc('can_access_cliente_by_vendedor_scope', {
    p_cliente_id: result.data.id,
    p_company_ids: ['33333333-3333-4333-8333-333333333333'],
    p_vendedor_ids: [owner]
  });
  expect(withCompanyFilter.error).toBeNull();
  expect(withCompanyFilter.data).toBe(false);
  state.userId = other;
  const otherList = await handleClientesGet(event('/api/v1/clientes'));
  expect(
    (await otherList.json<{ items: Array<{ id: string }> }>()).items.map((item) => item.id)
  ).not.toContain(result.data.id);
  const otherMainList = await handleClientesListGet(event('/api/v1/clientes/list'));
  expect(otherMainList.status, await otherMainList.clone().text()).toBe(200);
  expect(
    (await otherMainList.json<{ items: Array<{ id: string }> }>()).items.map((item) => item.id)
  ).not.toContain(result.data.id);
  await expect(
    ensureClienteAccess(state.client!, { ...scope, userId: other }, result.data.id)
  ).rejects.toMatchObject({ status: 403 });
  expect(
    (
      await handleClientesCreatePost(
        event('/api/v1/clientes/create', 'POST', {
          ...input,
          company_id: '33333333-3333-4333-8333-333333333333'
        })
      )
    ).status
  ).toBe(403);
  state.individual = false;
  expect(
    (await handleClientesCreatePost(event('/api/v1/clientes/create', 'POST', input))).status
  ).toBe(400);
  state.individual = true;
});

it('atualiza imediatamente os IDs acessíveis para usuários sem empresa', async () => {
  const params = { companyIds: [], vendedorIds: [owner] };
  const before = await resolveRealAccessibleClientIds(state.client!, params);
  const newId = '44444444-4444-4444-8444-444444444444';
  expect(before).not.toContain(newId);
  await env.DB.prepare('INSERT INTO legado_clientes (id, nome, created_by) VALUES (?, ?, ?)')
    .bind(newId, 'Novo cliente', owner)
    .run();
  await expect(resolveRealAccessibleClientIds(state.client!, params)).resolves.toContain(newId);
});

it('permite gerenciar acompanhantes de cliente individual sem empresa e protege acesso', async () => {
  state.userId = owner;
  const clienteId = crypto.randomUUID();
  await env.DB.prepare('INSERT INTO legado_clientes (id, nome, created_by) VALUES (?, ?, ?)')
    .bind(clienteId, 'Cliente individual', owner)
    .run();
  const request = (method: string, body?: object, acompanhanteId?: string) => {
    const result = event(`/api/v1/clientes/${clienteId}/acompanhantes`, method, body);
    result.params = { id: clienteId, ...(acompanhanteId ? { acompanhanteId } : {}) };
    return result;
  };
  const created = await handleClientesIdAcompanhantesPost(
    request('POST', { nome_completo: 'Acompanhante' })
  );
  expect(created.status, await created.clone().text()).toBe(200);
  const result = await created.json<{ item: { id: string; company_id: string | null } }>();
  expect(result.item.company_id).toBeNull();
  const list = await handleClientesIdAcompanhantesGet(request('GET'));
  expect(await list.json()).toMatchObject({ items: [{ id: result.item.id, company_id: null }] });
  state.userId = other;
  expect((await handleClientesIdAcompanhantesGet(request('GET'))).status).toBe(403);
  expect(
    (await handleClientesIdAcompanhantesPost(request('POST', { nome_completo: 'Outro' }))).status
  ).toBe(403);
  expect(
    (
      await handleClientesIdAcompanhantesAcompanhanteIdPatch(
        request('PATCH', { nome_completo: 'Outro' }, result.item.id)
      )
    ).status
  ).toBe(403);
  expect(
    (
      await handleClientesIdAcompanhantesAcompanhanteIdDelete(
        request('DELETE', undefined, result.item.id)
      )
    ).status
  ).toBe(403);
  state.userId = owner;
  const updated = await handleClientesIdAcompanhantesAcompanhanteIdPatch(
    request('PATCH', { nome_completo: 'Nome atualizado' }, result.item.id)
  );
  expect(updated.status, await updated.clone().text()).toBe(200);
  expect(await updated.json()).toMatchObject({ item: { nome_completo: 'Nome Atualizado' } });
  const removed = await handleClientesIdAcompanhantesAcompanhanteIdDelete(
    request('DELETE', undefined, result.item.id)
  );
  expect(removed.status, await removed.clone().text()).toBe(200);
  expect(await (await handleClientesIdAcompanhantesGet(request('GET'))).json()).toEqual({
    items: []
  });
});

it('associa ao usuário individual clientes criados no orçamento ou importação', async () => {
  state.userId = other;
  const quote = await handleOrcamentosClienteCreatePost(
    event('/api/v1/orcamentos/cliente-create', 'POST', input)
  );
  expect(quote.status, await quote.clone().text()).toBe(200);
  const imported = await handleClientesResolveImportPost(
    event('/api/v1/clientes/resolve-import', 'POST', input)
  );
  expect(imported.status, await imported.clone().text()).toBe(200);
  const body = await imported.json<{ cliente: { id: string }; created: boolean }>();
  expect(body.created).toBe(true);
  const row = await env.DB.prepare(
    'SELECT company_id, created_by FROM legado_clientes WHERE id = ?'
  )
    .bind(body.cliente.id)
    .first<{ company_id: string | null; created_by: string }>();
  expect(row).toEqual({ company_id: null, created_by: other });
  const again = await handleClientesResolveImportPost(
    event('/api/v1/clientes/resolve-import', 'POST', input)
  );
  expect(again.status, await again.clone().text()).toBe(200);
  expect(await again.json()).toMatchObject({ created: false, cliente: { id: body.cliente.id } });
  const list = await handleClientesGet(event('/api/v1/clientes'));
  expect(
    (await list.json<{ items: Array<{ id: string }> }>()).items.map((item) => item.id)
  ).toContain(body.cliente.id);
});

it('rejeita empresa fora do escopo em orçamento e importação', async () => {
  state.userId = other;
  const withCompany = { ...input, company_id: '33333333-3333-4333-8333-333333333333' };
  expect(
    (
      await handleOrcamentosClienteCreatePost(
        event('/api/v1/orcamentos/cliente-create', 'POST', withCompany)
      )
    ).status
  ).toBe(403);
  expect(
    (
      await handleClientesResolveImportPost(
        event('/api/v1/clientes/resolve-import', 'POST', withCompany)
      )
    ).status
  ).toBe(403);
});

it('registra e lista contatos apenas para o proprietário do cliente', async () => {
  state.userId = owner;
  const clienteId = '55555555-5555-4555-8555-555555555555';
  await env.DB.prepare(
    'INSERT INTO legado_clientes (id, nome, created_by, whatsapp) VALUES (?, ?, ?, ?)'
  )
    .bind(clienteId, 'Cliente contato', owner, '11912345678')
    .run();
  const sent = await handleClientesAvisosSendPost(
    event('/api/v1/clientes/avisos/send', 'POST', {
      cliente_id: clienteId,
      canal: 'whatsapp',
      mensagem: 'Olá, {nome}!'
    })
  );
  expect(sent.status, await sent.clone().text()).toBe(200);
  expect(await sent.json()).toMatchObject({ historico_disponivel: true });

  const path = `/api/v1/clientes/avisos/history?cliente_id=${clienteId}`;
  for (const handler of [handleClientesAvisosHistoryGet, handleClientesAvisosSendGet]) {
    const response = await handler(event(path));
    expect(response.status, await response.clone().text()).toBe(200);
    expect(await response.json()).toMatchObject({
      items: [
        { cliente_id: clienteId, canal: 'whatsapp', mensagem: 'Olá, Cliente!', status: 'preparado' }
      ]
    });
  }
  state.userId = other;
  expect((await handleClientesAvisosHistoryGet(event(path))).status).toBe(403);
  expect((await handleClientesAvisosSendGet(event(path))).status).toBe(403);
  expect(
    (
      await handleClientesAvisosSendPost(
        event('/api/v1/clientes/avisos/send', 'POST', {
          cliente_id: clienteId,
          canal: 'whatsapp',
          mensagem: 'Teste'
        })
      )
    ).status
  ).toBe(403);
});
