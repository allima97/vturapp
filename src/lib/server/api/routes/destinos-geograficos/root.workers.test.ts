/// <reference types="@cloudflare/vitest-pool-workers" />
import { applyD1Migrations, env } from 'cloudflare:test';
import { beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';

const state = vi.hoisted(() => ({
  loggedIn: true,
  read: true,
  write: true,
  modulo: null as string | null
}));
vi.mock('$lib/server/v1', async (importOriginal) => ({
  ...(await importOriginal<typeof import('$lib/server/v1')>()),
  getAdminClient: () => ({}),
  requireAuthenticatedUser: async () => {
    if (!state.loggedIn) throw { status: 401, body: { message: 'Não autenticado.' } };
    return { id: 'user' };
  },
  resolveUserScope: async () => state,
  ensureModuloAccess: (_scope: unknown, modules: string[], level: number) => {
    if (
      !(level === 1 ? state.read : state.write) ||
      (state.modulo && !modules.includes(state.modulo))
    )
      throw { status: 403, body: { message: 'Sem permissão.' } };
  }
}));

import {
  handleDestinoGet,
  handleDestinosBuscaGet,
  handleDestinosExatosGet,
  handleDestinoReferenciaPost,
  handleDestinoPost
} from './root';

function event(
  method: string,
  query = '',
  body?: unknown,
  options: { origin?: string; geo?: boolean } = {}
) {
  const url = new URL(`https://vtur.app/api/v1/destinos-geograficos${query}`);
  return {
    url,
    request: new Request(url, {
      method,
      headers: { origin: options.origin ?? 'https://vtur.app', 'content-type': 'application/json' },
      body: body === undefined ? undefined : JSON.stringify(body)
    }),
    platform: { env: { DB: env.DB, GEO_DB: options.geo === false ? undefined : env.GEO_TEST } }
  } as never;
}

describe('API experimental de destinos', () => {
  beforeAll(async () => {
    await applyD1Migrations(env.DB, env.TEST_MIGRATIONS);
    await env.GEO_TEST.batch([
      env.GEO_TEST.prepare(
        'CREATE TABLE place (id INTEGER PRIMARY KEY, name TEXT NOT NULL, country_code TEXT NOT NULL, admin1 TEXT NOT NULL, admin2 TEXT NOT NULL, population INTEGER NOT NULL, feature_class TEXT NOT NULL, feature_code TEXT NOT NULL)'
      ),
      env.GEO_TEST.prepare(
        "INSERT INTO place VALUES (1, 'Rome', 'IT', '07', '', 10000, 'P', 'PPL'), (2, 'Italy', 'IT', '', '', 0, 'A', 'PCLI')"
      ),
      env.GEO_TEST.prepare(
        'CREATE TABLE alternate_name (id INTEGER PRIMARY KEY, place_id INTEGER NOT NULL, language TEXT NOT NULL, name TEXT NOT NULL, preferred INTEGER NOT NULL, short INTEGER NOT NULL, colloquial INTEGER NOT NULL, historic INTEGER NOT NULL)'
      ),
      env.GEO_TEST.prepare("INSERT INTO alternate_name VALUES (1, 1, 'pt', 'Roma', 1, 0, 0, 0)"),
      env.GEO_TEST.prepare(
        'CREATE TABLE search_name (place_id INTEGER NOT NULL, normalized TEXT NOT NULL, priority INTEGER NOT NULL, PRIMARY KEY (normalized, place_id)) WITHOUT ROWID'
      ),
      env.GEO_TEST.prepare("INSERT INTO search_name VALUES (1, 'roma', 1)"),
      env.GEO_TEST.prepare(
        'CREATE TABLE short_search (prefix TEXT NOT NULL, rank INTEGER NOT NULL, place_id INTEGER NOT NULL, PRIMARY KEY (prefix, rank)) WITHOUT ROWID'
      ),
      env.GEO_TEST.prepare("INSERT INTO short_search VALUES ('ro', 0, 1)")
    ]);
  });
  beforeEach(() => {
    state.loggedIn = true;
    state.read = true;
    state.write = true;
    state.modulo = null;
  });

  it('searches and resolves verified IDs and handles missing resources', async () => {
    const response = await handleDestinosBuscaGet(event('GET', '?q=roma&idioma=pt-BR'));
    expect(response.status).toBe(200);
    expect(await response.json()).toMatchObject({
      items: [{ id: 'geonames:1', nome: 'Roma', label: 'Roma, Italy' }],
      podeHaverMais: false
    });
    const details = await handleDestinoGet(event('GET', '?id=geonames%3A1'));
    expect(await details.json()).toMatchObject({ item: { id: 'geonames:1' } });
    expect((await handleDestinoGet(event('GET', '?id=geonames%3A99'))).status).toBe(404);
    expect((await handleDestinoGet(event('GET', '?id=GEONAMES%3A1'))).status).toBe(400);
    expect((await handleDestinosBuscaGet(event('GET', '?q=roma&limite=20'))).status).toBe(400);
    expect((await handleDestinosBuscaGet(event('GET', '?q=roma&idioma=!'))).status).toBe(400);
    expect(
      (await handleDestinosBuscaGet(event('GET', '?q=roma', undefined, { geo: false }))).status
    ).toBe(503);
    const exatos = await handleDestinosExatosGet(event('GET', '?q=roma&pais=IT'));
    expect(await exatos.json()).toMatchObject({
      items: [{ id: 'geonames:1' }],
      podeHaverMais: false
    });
    const outroPais = await handleDestinosExatosGet(event('GET', '?q=roma&pais=US'));
    expect(await outroPais.json()).toMatchObject({ items: [] });
    expect((await handleDestinosExatosGet(event('GET', '?q=roma&offset=-1'))).status).toBe(400);
    expect((await handleDestinosExatosGet(event('GET', '?q=roma&pais=XYZ'))).status).toBe(400);
  });

  it('creates only valid custom records and reports duplicates', async () => {
    const payload = { nome: 'Praia Azul', referenciaGeoNamesId: 1 };
    const response = await handleDestinoPost(event('POST', '', payload));
    expect(response.status).toBe(201);
    const { item } = await response.json<{ item: { id: string; label: string } }>();
    expect(item.id).toMatch(/^personalizado:/);
    expect(item.label).toBe('Praia Azul, Roma, Italy');
    expect(item).toMatchObject({
      referencia: {
        localidade: 'Roma',
        subdivisao_secundaria: null,
        regiao: null,
        pais: 'Italy',
        codigo_pais: 'IT'
      }
    });
    expect(
      (await handleDestinoGet(event('GET', `?id=${encodeURIComponent(item.id)}`))).status
    ).toBe(200);
    expect((await handleDestinoPost(event('POST', '', payload))).status).toBe(409);
    expect(
      (await handleDestinoPost(event('POST', '', { ...payload, referenciaGeoNamesId: 2 }))).status
    ).toBe(400);
    expect((await handleDestinoPost(event('POST', '', { ...payload, nome: ' ' }))).status).toBe(
      400
    );
    expect(
      (await handleDestinoPost(event('POST', '', payload, { origin: 'https://other.example' })))
        .status
    ).toBe(403);
  });

  it('enforces authentication and permissions', async () => {
    state.loggedIn = false;
    expect((await handleDestinosBuscaGet(event('GET', '?q=roma'))).status).toBe(401);
    state.loggedIn = true;
    state.read = false;
    expect((await handleDestinoGet(event('GET', '?id=geonames%3A1'))).status).toBe(403);
    state.write = false;
    expect(
      (await handleDestinoPost(event('POST', '', { nome: 'A', referenciaGeoNamesId: 1 }))).status
    ).toBe(403);
  });

  it.each(['vendas_consulta', 'vendas', 'vendas_cadastro'])(
    'allows %s to read geographic destinations but not create them',
    async (modulo) => {
      state.modulo = modulo;
      expect((await handleDestinosBuscaGet(event('GET', '?q=roma'))).status).toBe(200);
      expect((await handleDestinosExatosGet(event('GET', '?q=roma'))).status).toBe(200);
      expect((await handleDestinoGet(event('GET', '?id=geonames%3A1'))).status).toBe(200);
      expect(
        (await handleDestinoPost(event('POST', '', { nome: 'A', referenciaGeoNamesId: 1 }))).status
      ).toBe(403);
    }
  );

  it('creates a validated reusable internal city reference without trusting supplied names', async () => {
    state.modulo = 'vendas_cadastro';
    const response = await handleDestinoReferenciaPost(
      event('POST', '', { id: 'geonames:1', nome: 'Cidade adulterada' })
    );
    expect(response.status).toBe(200);
    const { item } = await response.json<{
      item: { id: string; nome: string; destino_geografico_id: string };
    }>();
    expect(item).toMatchObject({
      nome: 'Roma, Italy',
      destino_geografico_id: 'geonames:1'
    });
    const second = await handleDestinoReferenciaPost(event('POST', '', { id: 'geonames:1' }));
    expect(await second.json()).toEqual({ item });
    expect(
      (await handleDestinoReferenciaPost(event('POST', '', { id: 'geonames:999' }))).status
    ).toBe(400);
    expect(
      (await handleDestinoReferenciaPost(event('POST', '', { id: 'geonames:01' }))).status
    ).toBe(400);
    expect(
      (
        await handleDestinoReferenciaPost(
          event('POST', '', { id: 'geonames:1' }, { origin: 'https://other.example' })
        )
      ).status
    ).toBe(403);
    state.write = false;
    expect(
      (await handleDestinoReferenciaPost(event('POST', '', { id: 'geonames:1' }))).status
    ).toBe(403);
    state.write = true;
    expect(
      (await handleDestinoReferenciaPost(event('POST', '', { id: 'geonames:1' }, { geo: false })))
        .status
    ).toBe(503);
  });

  it.each([
    'Produtos',
    'Fornecedores',
    'operacao_viagens',
    'operacao_vouchers',
    'operacao_preferencias',
    'consultoria_online',
    'relatorios_vendas'
  ])('allows %s to read geographic destinations', async (modulo) => {
    state.modulo = modulo;
    expect((await handleDestinosBuscaGet(event('GET', '?q=roma'))).status).toBe(200);
  });

  it.each(['vendas_consulta', 'relatorios_vendas'])(
    'does not allow %s to create internal city references',
    async (modulo) => {
      state.modulo = modulo;
      expect(
        (await handleDestinoReferenciaPost(event('POST', '', { id: 'geonames:1' }))).status
      ).toBe(403);
    }
  );
});
