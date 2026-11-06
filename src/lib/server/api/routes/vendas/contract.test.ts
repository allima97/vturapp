/**
 * Testes de CONTRATO das rotas migradas para Hono (Fase 2).
 *
 * Chamam o +server.ts real de cada rota (a mesma porta de entrada que o
 * SvelteKit usa). Os snapshots abaixo foram gerados rodando estes testes
 * contra a implementação ANTIGA (antes da migração) e continuam passando com
 * a implementação Hono — ou seja: mesmo status, mesmo corpo JSON e mesmos
 * headers (exceto x-request-id e server-timing, que o Hono acrescenta).
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  scope: null as Record<string, unknown> | null,
  kpisResult: null as unknown,
  kpisError: null as unknown,
  kpisCalls: [] as unknown[],
  sale: null as Record<string, unknown> | null,
  updateResult: { data: null as unknown, error: null as unknown },
  updateCalls: [] as unknown[],
  invalidateCalls: 0
}));

vi.mock('$lib/server/v1', async (importOriginal) => {
  const actual = await importOriginal<typeof import('$lib/server/v1')>();
  return {
    ...actual,
    getAdminClient: () => ({
      from: (table: string) => ({
        update: (values: unknown) => {
          mocks.updateCalls.push({ table, values: { ...(values as object), updated_at: '<ts>' } });
          const chain = {
            eq: () => chain,
            select: () => chain,
            single: async () => mocks.updateResult
          };
          return chain;
        }
      })
    }),
    resolveUserScope: async () => mocks.scope,
    resolveScopedVendedorIds: async () => [],
    fetchVendedorIdsByCompanyIds: async () => [],
    resolveAccessibleClientIds: async () => []
  };
});

vi.mock('$lib/server/vendas-kpis', () => ({
  fetchVendasKpiReciboContributions: async (_client: unknown, params: unknown) => {
    mocks.kpisCalls.push(params);
    if (mocks.kpisError) throw mocks.kpisError;
    return { agg: mocks.kpisResult };
  }
}));

vi.mock('$lib/server/readModelRebuild', () => ({
  getPlatformExecutionContext: () => null
}));

vi.mock('$lib/server/salesScope', () => ({
  fetchSaleForScope: async () => mocks.sale
}));

vi.mock('$lib/server/readModelCache', async (importOriginal) => {
  const actual = await importOriginal<typeof import('$lib/server/readModelCache')>();
  return {
    ...actual,
    invalidateSalesReadModels: () => {
      mocks.invalidateCalls += 1;
    }
  };
});

import { GET as healthGET } from '../../../../../routes/api/v1/health/+server';
import { GET as kpisGET } from '../../../../../routes/api/v1/vendas/kpis/+server';
import { PATCH as statusPATCH } from '../../../../../routes/api/v1/vendas/status/+server';

const ORIGIN = 'https://vturapp.test';
const ADMIN_COMPANY = '11111111-1111-4111-8111-111111111111';
const SALE_ID = '22222222-2222-4222-8222-222222222222';

const adminScope = {
  userId: 'u-admin',
  nome: 'Admin',
  email: 'a@x',
  tipoNome: 'ADMIN',
  usoIndividual: false,
  papel: 'ADMIN',
  companyId: ADMIN_COMPANY,
  companyIds: [ADMIN_COMPANY],
  permissoes: {},
  isAdmin: true,
  isMaster: false,
  isFinanceiro: false,
  isGestor: false,
  isVendedor: false
};

const vendedorSemAcesso = {
  ...adminScope,
  userId: 'u-vend',
  tipoNome: 'VENDEDOR',
  papel: 'VENDEDOR',
  isAdmin: false,
  isVendedor: true,
  permissoes: {}
};

function makeEvent(path: string, init: RequestInit & { authenticated?: boolean } = {}) {
  const { authenticated = true, ...requestInit } = init;
  const request = new Request(`${ORIGIN}${path}`, requestInit);
  return {
    request,
    url: new URL(request.url),
    params: {},
    platform: undefined,
    locals: {
      safeGetSession: async () =>
        authenticated
          ? { session: { access_token: 't' }, user: { id: 'u-1' } }
          : { session: null, user: null }
    },
    getClientAddress: () => '127.0.0.1'
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
  } as any;
}

async function contract(res: Response) {
  const headers: Record<string, string> = {};
  res.headers.forEach((value, key) => {
    if (key === 'x-request-id' || key === 'server-timing') return;
    headers[key] = value;
  });
  const text = await res.text();
  let body: unknown = text;
  try {
    body = JSON.parse(text);
  } catch {
    // corpo não-JSON
  }
  if (body && typeof body === 'object' && 'ts' in (body as object)) {
    (body as Record<string, unknown>).ts = '<ts>';
  }
  return { status: res.status, headers, body };
}

beforeEach(() => {
  mocks.scope = adminScope;
  mocks.kpisResult = { totalVendas: 1234.5, qtdVendas: 3 };
  mocks.kpisError = null;
  mocks.kpisCalls = [];
  mocks.sale = { id: SALE_ID, company_id: ADMIN_COMPANY, vendedor_id: 'v1' };
  mocks.updateResult = {
    data: { id: SALE_ID, status: 'confirmada', updated_at: '2026-09-24T00:00:00Z' },
    error: null
  };
  mocks.updateCalls = [];
  mocks.invalidateCalls = 0;
});

describe('GET /api/v1/health', () => {
  it('contrato', async () => {
    expect(await contract(await healthGET(makeEvent('/api/v1/health')))).toMatchInlineSnapshot(`
      {
        "body": {
          "ok": true,
          "ts": "<ts>",
        },
        "headers": {
          "cache-control": "no-store",
          "content-length": "43",
          "content-type": "application/json",
          "vary": "Cookie",
          "x-content-type-options": "nosniff",
        },
        "status": 200,
      }
    `);
  });
});

describe('GET /api/v1/vendas/kpis', () => {
  it('sem sessão → 401', async () => {
    const res = await kpisGET(makeEvent('/api/v1/vendas/kpis', { authenticated: false }));
    expect(await contract(res)).toMatchInlineSnapshot(`
      {
        "body": {
          "error": "Erro ao calcular KPIs de vendas.",
        },
        "headers": {
          "cache-control": "no-store",
          "content-length": "44",
          "content-type": "application/json",
          "vary": "Cookie",
          "x-content-type-options": "nosniff",
        },
        "status": 401,
      }
    `);
  });

  it('vendedor sem módulo Vendas → 403', async () => {
    mocks.scope = vendedorSemAcesso;
    const res = await kpisGET(makeEvent('/api/v1/vendas/kpis?inicio=2026-09-01&fim=2026-09-30'));
    expect(await contract(res)).toMatchInlineSnapshot(`
      {
        "body": {
          "error": "Erro ao calcular KPIs de vendas.",
        },
        "headers": {
          "cache-control": "no-store",
          "content-length": "44",
          "content-type": "application/json",
          "vary": "Cookie",
          "x-content-type-options": "nosniff",
        },
        "status": 403,
      }
    `);
  });

  it('admin → 200 com kpis e parâmetros repassados ao cálculo', async () => {
    const res = await kpisGET(
      makeEvent(`/api/v1/vendas/kpis?inicio=2026-09-01&fim=2026-09-30&empresa_id=${ADMIN_COMPANY}`)
    );
    expect(await contract(res)).toMatchInlineSnapshot(`
      {
        "body": {
          "kpis": {
            "qtdVendas": 3,
            "totalVendas": 1234.5,
          },
        },
        "headers": {
          "cache-control": "private, max-age=30, stale-while-revalidate=120",
          "content-length": "45",
          "content-type": "application/json",
          "vary": "Cookie",
          "x-content-type-options": "nosniff",
        },
        "status": 200,
      }
    `);
    expect(mocks.kpisCalls).toMatchInlineSnapshot(`
      [
        {
          "accessibleClientIds": [],
          "companyIds": [
            "11111111-1111-4111-8111-111111111111",
          ],
          "dataFim": "2026-09-30",
          "dataInicio": "2026-09-01",
          "vendedorIds": [],
        },
      ]
    `);
  });

  it('erro no cálculo → 500 com mensagem padrão', async () => {
    mocks.kpisError = new Error('boom');
    const res = await kpisGET(makeEvent('/api/v1/vendas/kpis?inicio=2026-09-01&fim=2026-09-30'));
    expect(await contract(res)).toMatchInlineSnapshot(`
      {
        "body": {
          "code": "",
          "details": "",
          "error": "Erro ao calcular KPIs de vendas.",
          "hint": "",
          "message": "boom",
        },
        "headers": {
          "cache-control": "no-store",
          "content-length": "94",
          "content-type": "application/json",
          "vary": "Cookie",
          "x-content-type-options": "nosniff",
        },
        "status": 500,
      }
    `);
  });
});

describe('PATCH /api/v1/vendas/status', () => {
  const patch = (query: string, body: unknown, headers: Record<string, string> = {}) =>
    statusPATCH(
      makeEvent(`/api/v1/vendas/status${query}`, {
        method: 'PATCH',
        headers: { 'content-type': 'application/json', ...headers },
        body: JSON.stringify(body)
      })
    );

  it('origem de outro site → 403', async () => {
    const res = await patch(`?id=${SALE_ID}`, { status: 'x' }, { origin: 'https://evil.test' });
    expect(await contract(res)).toMatchInlineSnapshot(`
      {
        "body": {
          "error": "Origem invalida.",
        },
        "headers": {
          "cache-control": "no-store",
          "content-length": "28",
          "content-type": "application/json",
          "vary": "Cookie",
          "x-content-type-options": "nosniff",
        },
        "status": 403,
      }
    `);
  });

  it('id inválido → 400', async () => {
    expect(await contract(await patch('?id=abc', { status: 'x' }))).toMatchInlineSnapshot(`
      {
        "body": {
          "error": "ID invalido.",
          "success": false,
        },
        "headers": {
          "cache-control": "no-store",
          "content-length": "40",
          "content-type": "application/json",
          "vary": "Cookie",
          "x-content-type-options": "nosniff",
        },
        "status": 400,
      }
    `);
  });

  it('status vazio → 400', async () => {
    expect(await contract(await patch(`?id=${SALE_ID}`, { status: '  ' }))).toMatchInlineSnapshot(`
      {
        "body": {
          "error": "Status obrigatorio.",
          "success": false,
        },
        "headers": {
          "cache-control": "no-store",
          "content-length": "47",
          "content-type": "application/json",
          "vary": "Cookie",
          "x-content-type-options": "nosniff",
        },
        "status": 400,
      }
    `);
  });

  it('venda fora do escopo → 404', async () => {
    mocks.sale = null;
    expect(await contract(await patch(`?id=${SALE_ID}`, { status: 'confirmada' })))
      .toMatchInlineSnapshot(`
      {
        "body": {
          "error": "Venda nao encontrada.",
          "success": false,
        },
        "headers": {
          "cache-control": "no-store",
          "content-length": "49",
          "content-type": "application/json",
          "vary": "Cookie",
          "x-content-type-options": "nosniff",
        },
        "status": 404,
      }
    `);
  });

  it('sucesso → 200, grava status e invalida cache', async () => {
    const res = await patch(`?id=${SALE_ID}`, { status: 'confirmada' });
    expect(await contract(res)).toMatchInlineSnapshot(`
      {
        "body": {
          "item": {
            "id": "22222222-2222-4222-8222-222222222222",
            "status": "confirmada",
            "updated_at": "2026-09-24T00:00:00Z",
          },
          "success": true,
        },
        "headers": {
          "cache-control": "no-store",
          "content-length": "127",
          "content-type": "application/json",
          "vary": "Cookie",
          "x-content-type-options": "nosniff",
        },
        "status": 200,
      }
    `);
    expect(mocks.updateCalls).toMatchInlineSnapshot(`
      [
        {
          "table": "vendas",
          "values": {
            "status": "confirmada",
            "updated_at": "<ts>",
          },
        },
      ]
    `);
    expect(mocks.invalidateCalls).toBe(1);
  });
});
