/// <reference types="@cloudflare/vitest-pool-workers" />
import { applyD1Migrations, env } from 'cloudflare:test';
import { beforeAll, expect, it, vi } from 'vitest';

const state = vi.hoisted(() => ({ permitido: true, modulo: null as string | null }));
vi.mock('$lib/server/v1', async (original) => ({
  ...(await original<typeof import('$lib/server/v1')>()),
  getAdminClient: () => ({}),
  isUuid: (value: string) =>
    /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value),
  requireAuthenticatedUser: async () => ({ id: 'owner' }),
  resolveUserScope: async () => ({ userId: 'owner' }),
  ensureModuloAccess: (_scope: unknown, modulos: string[]) => {
    if (!state.permitido || (state.modulo && !modulos.includes(state.modulo)))
      throw { status: 403, body: { message: 'Sem acesso.' } };
  }
}));
import {
  handleProdutosCidadesGeograficasGet,
  handleVendasCidadesGeograficasGet
} from './cidades-geograficas';

beforeAll(async () => {
  await applyD1Migrations(env.DB, env.TEST_MIGRATIONS);
  await env.GEO_TEST.batch([
    env.GEO_TEST.prepare(
      'CREATE TABLE place (id INTEGER PRIMARY KEY, name TEXT NOT NULL, country_code TEXT NOT NULL, admin1 TEXT NOT NULL, admin2 TEXT NOT NULL, population INTEGER NOT NULL, feature_class TEXT NOT NULL, feature_code TEXT NOT NULL)'
    ),
    env.GEO_TEST.prepare(
      "INSERT INTO place VALUES (1, 'Rome', 'IT', '', '', 100, 'P', 'PPL'), (2, 'Rome', 'US', '', '', 50, 'P', 'PPL'), (3, 'Italy', 'IT', '', '', 0, 'A', 'PCLI'), (4, 'United States', 'US', '', '', 0, 'A', 'PCLI')"
    ),
    env.GEO_TEST.prepare(
      'CREATE TABLE alternate_name (id INTEGER PRIMARY KEY, place_id INTEGER NOT NULL, language TEXT NOT NULL, name TEXT NOT NULL, preferred INTEGER NOT NULL, short INTEGER NOT NULL, colloquial INTEGER NOT NULL, historic INTEGER NOT NULL)'
    ),
    env.GEO_TEST.prepare(
      "INSERT INTO alternate_name VALUES (1, 1, 'pt', 'Roma', 1, 0, 0, 0), (2, 2, 'pt', 'Roma', 1, 0, 0, 0)"
    ),
    env.GEO_TEST.prepare(
      'CREATE TABLE search_name (place_id INTEGER NOT NULL, normalized TEXT NOT NULL, priority INTEGER NOT NULL, PRIMARY KEY (normalized, place_id)) WITHOUT ROWID'
    ),
    env.GEO_TEST.prepare("INSERT INTO search_name VALUES (1, 'roma', 1), (2, 'roma', 1)"),
    env.GEO_TEST.prepare(
      'CREATE TABLE short_search (prefix TEXT NOT NULL, rank INTEGER NOT NULL, place_id INTEGER NOT NULL, PRIMARY KEY (prefix, rank)) WITHOUT ROWID'
    )
  ]);
});

function event(query: string, geo = true) {
  return {
    url: new URL(`https://vtur.app/api/v1/vendas/cidades-geograficas?${query}`),
    platform: { env: { DB: env.DB, GEO_DB: geo ? env.GEO_TEST : undefined } }
  } as Parameters<typeof handleVendasCidadesGeograficasGet>[0];
}

it('retorna vínculo por identidade sem criar ou conciliar cidades homônimas', async () => {
  const vinculada = crypto.randomUUID();
  const legada = crypto.randomUUID();
  await env.DB.batch([
    env.DB.prepare(
      "INSERT INTO legado_cidades (id, nome, destino_geografico_id) VALUES (?, 'Roma', 'geonames:1')"
    ).bind(vinculada),
    env.DB.prepare(
      "INSERT INTO legado_cidades (id, nome, estado_nome, pais_nome) VALUES (?, 'Roma', 'Texas', 'Estados Unidos')"
    ).bind(legada)
  ]);
  const before = await env.DB.prepare('SELECT count(*) AS total FROM legado_cidades').first();
  const result = await handleVendasCidadesGeograficasGet(event('q=Roma'));
  expect(result.status).toBe(200);
  expect(await result.json()).toMatchObject({
    items: [
      { id: 'geonames:1', label: 'Roma, Italy', cidade_interna_id: vinculada },
      { id: 'geonames:2', label: 'Roma, United States', cidade_interna_id: null }
    ],
    cidades_legadas: [
      { id: legada, label: 'Roma, Texas, Estados Unidos', pais_nome: 'Estados Unidos' }
    ],
    legadas_pode_haver_mais: false
  });
  expect(await env.DB.prepare('SELECT count(*) AS total FROM legado_cidades').first()).toEqual(
    before
  );
});

it('autoriza produtos separadamente e recupera cidades salvas por UUID sem GeoNames', async () => {
  const id = crypto.randomUUID();
  await env.DB.prepare(
    "INSERT INTO legado_cidades (id, nome, estado_nome, pais_nome) VALUES (?, 'Roma', 'Texas', 'Estados Unidos')"
  )
    .bind(id)
    .run();
  state.modulo = 'Produtos';
  try {
    const busca = await handleProdutosCidadesGeograficasGet(event('q=Roma'));
    expect(busca.status).toBe(200);
    expect(
      (await busca.json<{ cidades_legadas: { id: string }[] }>()).cidades_legadas
    ).toContainEqual(expect.objectContaining({ id }));
    expect((await handleVendasCidadesGeograficasGet(event('q=Roma'))).status).toBe(403);
    const detalhe = await handleProdutosCidadesGeograficasGet(event(`id=${id}`, false));
    expect(detalhe.status).toBe(200);
    expect(await detalhe.json()).toMatchObject({ id, label: 'Roma, Texas, Estados Unidos' });
    expect((await handleProdutosCidadesGeograficasGet(event('id=invalido'))).status).toBe(400);
    expect(
      (await handleProdutosCidadesGeograficasGet(event(`id=${crypto.randomUUID()}`))).status
    ).toBe(404);
    state.modulo = 'vendas';
    expect((await handleProdutosCidadesGeograficasGet(event('q=Roma'))).status).toBe(403);
  } finally {
    state.modulo = null;
  }
});

it('recusa acesso não autorizado e erros de entrada ou ausência da base', async () => {
  state.permitido = false;
  try {
    expect((await handleVendasCidadesGeograficasGet(event('q=Roma'))).status).toBe(403);
  } finally {
    state.permitido = true;
  }
  expect((await handleVendasCidadesGeograficasGet(event(`q=${'a'.repeat(201)}`))).status).toBe(400);
  for (const offset of ['-1', '1.5', '10001', '00']) {
    expect(
      (await handleVendasCidadesGeograficasGet(event(`q=Roma&offset_legadas=${offset}`))).status
    ).toBe(400);
  }
  for (const query of [
    'q=Roma&exata=2',
    'q=Roma&exata=1&pais=Brasil',
    'q=Roma&pais=BR',
    'q=Roma&offset_geografico=8',
    'q=Roma&exata=1&offset_geografico=10001'
  ]) {
    expect((await handleVendasCidadesGeograficasGet(event(query))).status).toBe(400);
  }
  expect((await handleVendasCidadesGeograficasGet(event('q=Roma', false))).status).toBe(503);
  const curto = await handleVendasCidadesGeograficasGet(event('q=R'));
  expect(await curto.json()).toEqual({
    items: [],
    podeHaverMais: false,
    cidades_legadas: [],
    legadas_pode_haver_mais: false
  });
});

it('permite busca exata com país e paginação sem criar referências', async () => {
  await env.GEO_TEST.batch([
    ...Array.from({ length: 10 }, (_, index) =>
      env.GEO_TEST.prepare("INSERT INTO place VALUES (?, 'X', 'BR', '', '', ?, 'P', 'PPL')").bind(
        index + 10,
        100 - index
      )
    ),
    ...Array.from({ length: 10 }, (_, index) =>
      env.GEO_TEST.prepare("INSERT INTO search_name VALUES (?, 'x', 0)").bind(index + 10)
    )
  ]);
  const before = await env.DB.prepare('SELECT count(*) AS total FROM legado_cidades').first();
  const result = await handleVendasCidadesGeograficasGet(event('q=Roma&exata=1&pais=US'));
  expect(result.status).toBe(200);
  const payload = await result.json<{ items: { id: string }[]; podeHaverMais: boolean }>();
  expect(payload.items.map((item) => item.id)).toEqual(['geonames:2']);
  expect(payload.podeHaverMais).toBe(false);
  const next = await handleVendasCidadesGeograficasGet(
    event('q=Roma&exata=1&pais=US&offset_geografico=1')
  );
  expect((await next.json<{ items: unknown[] }>()).items).toEqual([]);
  const firstPage = await handleVendasCidadesGeograficasGet(event('q=X&exata=1&pais=BR'));
  const page = await firstPage.json<{ items: { id: string }[]; podeHaverMais: boolean }>();
  expect(page.items).toHaveLength(8);
  expect(page.podeHaverMais).toBe(true);
  const secondPage = await handleVendasCidadesGeograficasGet(
    event('q=X&exata=1&pais=BR&offset_geografico=8')
  );
  const secondPayload = await secondPage.json<{
    items: { id: string }[];
    podeHaverMais: boolean;
  }>();
  expect(secondPayload.items).toHaveLength(2);
  expect(secondPayload.podeHaverMais).toBe(false);
  expect(page.items.map((item) => item.id)).not.toContain(secondPayload.items[0].id);
  expect(await env.DB.prepare('SELECT count(*) AS total FROM legado_cidades').first()).toEqual(
    before
  );
});

it('limita resultados legados, informa truncamento e trata caracteres especiais literalmente', async () => {
  await env.DB.batch([
    ...Array.from({ length: 9 }, (_, i) =>
      env.DB.prepare('INSERT INTO legado_cidades (id, nome) VALUES (?, ?)').bind(
        crypto.randomUUID(),
        `Teste ${i}`
      )
    ),
    env.DB.prepare('INSERT INTO legado_cidades (id, nome) VALUES (?, ?)').bind(
      crypto.randomUUID(),
      'Te% cidade'
    )
  ]);
  const result = await handleVendasCidadesGeograficasGet(event('q=Teste'));
  expect(result.status).toBe(200);
  const payload = await result.json<{
    cidades_legadas: { id: string }[];
    legadas_pode_haver_mais: boolean;
  }>();
  expect(payload.cidades_legadas).toHaveLength(8);
  expect(payload.legadas_pode_haver_mais).toBe(true);
  const second = await handleVendasCidadesGeograficasGet(event('q=Teste&offset_legadas=8'));
  const next = await second.json<{
    cidades_legadas: { id: string }[];
    legadas_pode_haver_mais: boolean;
  }>();
  expect(next.cidades_legadas).toHaveLength(1);
  expect(next.legadas_pode_haver_mais).toBe(false);
  expect(payload.cidades_legadas.map((item) => item.id)).not.toContain(next.cidades_legadas[0].id);

  const literal = await handleVendasCidadesGeograficasGet(event('q=Te%25'));
  expect(literal.status).toBe(200);
  const filtered = await literal.json<{ cidades_legadas: { nome: string }[] }>();
  expect(filtered.cidades_legadas.map((item) => item.nome)).toEqual(['Te% cidade']);
});
