/// <reference types="@cloudflare/vitest-pool-workers" />
import { applyD1Migrations, env } from 'cloudflare:test';
import { beforeAll, expect, it, vi } from 'vitest';
import { createDataClient } from '$lib/server/data/query';

const state = vi.hoisted(() => ({
  client: null as ReturnType<typeof createDataClient> | null,
  companyId: crypto.randomUUID(),
  permit: true
}));
vi.mock('$lib/config/destinosGeograficos', () => ({
  fornecedoresGeograficosAtivos: true,
  revisaoRoteiroAtiva: false,
  modulosOperacionaisGeograficosAtivos: false,
  campoGeografico: () => ({})
}));
vi.mock('$lib/server/v1', async (original) => ({
  ...(await original<typeof import('$lib/server/v1')>()),
  getAdminClient: () => state.client,
  requireAuthenticatedUser: async () => ({ id: 'owner' }),
  resolveUserScope: async () => ({ userId: 'owner', companyId: state.companyId, isAdmin: false }),
  resolveScopedCompanyIds: () => [state.companyId],
  ensureModuloAccess: () => {
    if (!state.permit) throw { status: 403, body: { message: 'Sem acesso.' } };
  },
  isUuid: (value: string) => /^[0-9a-f-]{36}$/i.test(value)
}));
vi.mock('$lib/server/readModelCache', () => ({
  invalidateCatalogReadModels: vi.fn(),
  buildReadModelCacheKey: vi.fn(),
  getCachedReadModel: vi.fn(),
  READ_MODEL_TAGS: { catalog: 'catalog' },
  scopeCacheTags: vi.fn()
}));
import { handleFornecedoresCreatePost } from './create';
import { handleFornecedoresIdGet, handleFornecedoresIdPut } from './id';
import { criarDestinoPersonalizado } from '$lib/server/destinosPersonalizados';

const payload = {
  nome_completo: 'Fornecedor',
  nome_fantasia: 'Fantasia',
  localizacao: 'exterior',
  cidade: 'Forjada',
  estado: 'Forjado',
  telefone: '1',
  whatsapp: '2',
  telefone_emergencia: '3',
  responsavel: 'Responsável',
  principais_servicos: 'Passeios'
};

function event(method: string, body?: unknown, id = '', geo = true) {
  const url = new URL(`https://vtur.app/api/v1/fornecedores/${id || 'create'}`);
  return {
    url,
    params: { id },
    request: new Request(url, {
      method,
      headers: { origin: 'https://vtur.app', 'content-type': 'application/json' },
      body: body === undefined ? undefined : JSON.stringify(body)
    }),
    platform: { env: { DB: env.DB, GEO_DB: geo ? env.GEO_TEST : undefined } }
  } as Parameters<typeof handleFornecedoresIdPut>[0];
}

beforeAll(async () => {
  await applyD1Migrations(env.DB, env.TEST_MIGRATIONS);
  await env.DB.prepare(
    "INSERT INTO legado_companies (id, nome_empresa, nome_fantasia, cnpj) VALUES (?, 'Empresa', 'Empresa', '123')"
  )
    .bind(state.companyId)
    .run();
  await env.GEO_TEST.batch([
    env.GEO_TEST.prepare(
      'CREATE TABLE place (id INTEGER PRIMARY KEY, name TEXT NOT NULL, country_code TEXT NOT NULL, admin1 TEXT NOT NULL, admin2 TEXT NOT NULL, population INTEGER NOT NULL, feature_class TEXT NOT NULL, feature_code TEXT NOT NULL)'
    ),
    env.GEO_TEST.prepare(
      "INSERT INTO place VALUES (1, 'Rome', 'IT', '07', '', 10, 'P', 'PPL'), (2, 'Rome', 'US', 'TX', '', 10, 'P', 'PPL'), (3, 'Lazio', 'IT', '07', '', 0, 'A', 'ADM1'), (4, 'Texas', 'US', 'TX', '', 0, 'A', 'ADM1'), (5, 'No Region', 'XX', '', '', 1, 'P', 'PPL')"
    ),
    env.GEO_TEST.prepare(
      'CREATE TABLE alternate_name (id INTEGER PRIMARY KEY, place_id INTEGER NOT NULL, language TEXT NOT NULL, name TEXT NOT NULL, preferred INTEGER NOT NULL, short INTEGER NOT NULL, colloquial INTEGER NOT NULL, historic INTEGER NOT NULL)'
    ),
    env.GEO_TEST.prepare(
      "INSERT INTO alternate_name VALUES (1, 1, 'pt', 'Roma', 1, 0, 0, 0), (2, 2, 'pt', 'Roma', 1, 0, 0, 0), (3, 3, 'pt', 'Lácio', 1, 0, 0, 0)"
    )
  ]);
  state.client = createDataClient({
    db: env.DB,
    r2: env.R2,
    secret: 'segredo-de-teste-com-32-caracteres',
    origin: 'https://vtur.app',
    headers: new Headers()
  });
});

it('cria e edita preservando identidade, nomes confiáveis e proteção contra clientes antigos', async () => {
  const created = await handleFornecedoresCreatePost(
    event('POST', { ...payload, cidade_geografica_id: 'geonames:1' })
  );
  expect(created.status).toBe(201);
  const { data } = await created.json<{ data: { id: string } }>();
  const read = await handleFornecedoresIdGet(event('GET', undefined, data.id));
  expect(await read.json()).toMatchObject({
    data: { cidade: 'Roma', estado: 'Lácio', cidade_geografica_id: 'geonames:1' }
  });
  expect((await handleFornecedoresIdPut(event('PUT', payload, data.id))).status).toBe(409);
  expect(
    (
      await handleFornecedoresIdPut(
        event('PUT', { ...payload, cidade_geografica_id: null }, data.id)
      )
    ).status
  ).toBe(409);
  const update = await handleFornecedoresIdPut(
    event(
      'PUT',
      {
        ...payload,
        cidade_geografica_id: 'geonames:2',
        cidade_geografica_esperada: 'geonames:1'
      },
      data.id
    )
  );
  expect(update.status).toBe(200);
  expect(await update.json()).toMatchObject({
    data: { cidade: 'Roma', estado: 'Texas', cidade_geografica_id: 'geonames:2' }
  });
  for (const anterior of [undefined, 'geonames:1', null]) {
    const body = {
      ...payload,
      cidade_geografica_id: 'geonames:1',
      ...(anterior === undefined ? {} : { cidade_geografica_esperada: anterior })
    };
    expect((await handleFornecedoresIdPut(event('PUT', body, data.id))).status).toBe(409);
  }
  expect(
    await env.DB.prepare('SELECT cidade_geografica_id FROM legado_fornecedores WHERE id = ?')
      .bind(data.id)
      .first()
  ).toEqual({ cidade_geografica_id: 'geonames:2' });
});

it('preserva fornecedores antigos e rejeita identidades inválidas, região ausente e base indisponível', async () => {
  const created = await handleFornecedoresCreatePost(event('POST', payload));
  expect(created.status).toBe(201);
  const { data } = await created.json<{ data: { id: string } }>();
  expect((await handleFornecedoresIdPut(event('PUT', payload, data.id))).status).toBe(200);
  for (const id of ['geonames:0', 'geonames:999', 'geonames:5']) {
    const response = await handleFornecedoresIdPut(
      event(
        'PUT',
        { ...payload, cidade_geografica_id: id, cidade_geografica_esperada: null },
        data.id
      )
    );
    expect(response.status).toBe(400);
  }
  expect(
    (
      await handleFornecedoresIdPut(
        event(
          'PUT',
          { ...payload, cidade_geografica_id: 'geonames:1', cidade_geografica_esperada: null },
          data.id,
          false
        )
      )
    ).status
  ).toBe(503);
  const row = await env.DB.prepare(
    'SELECT cidade, estado, cidade_geografica_id FROM legado_fornecedores WHERE id = ?'
  )
    .bind(data.id)
    .first();
  expect(row).toEqual({ cidade: 'Forjada', estado: 'Forjado', cidade_geografica_id: null });
});

it('nega acesso antes de resolver ou criar vínculo', async () => {
  state.permit = false;
  try {
    expect(
      (
        await handleFornecedoresCreatePost(
          event('POST', { ...payload, cidade_geografica_id: 'geonames:1' })
        )
      ).status
    ).toBe(403);
  } finally {
    state.permit = true;
  }
});

it('resolve destino personalizado pela referência, sem confiar nos textos enviados', async () => {
  const destino = await criarDestinoPersonalizado(env.DB, env.GEO_TEST, 'Praia Azul', 1);
  const response = await handleFornecedoresCreatePost(
    event('POST', { ...payload, cidade_geografica_id: `personalizado:${destino.id.toUpperCase()}` })
  );
  expect(response.status).toBe(201);
  expect(await response.json()).toMatchObject({
    data: {
      cidade: 'Praia Azul',
      estado: 'Lácio',
      cidade_geografica_id: `personalizado:${destino.id}`
    }
  });
});

it('recusa atualização antiga quando outro cliente vinculou uma cidade durante a gravação', async () => {
  const created = await handleFornecedoresCreatePost(event('POST', payload));
  const { data } = await created.json<{ data: { id: string } }>();
  const client = state.client!;
  state.client = {
    ...client,
    from(table: string) {
      const query = client.from(table);
      if (table !== 'fornecedores') return query;
      const update = query.update.bind(query);
      query.update = (values: Record<string, unknown>) => {
        const builder = update(values);
        const commit = builder.maybeSingle.bind(builder);
        builder.maybeSingle = async () => {
          await env.DB.prepare(
            "UPDATE legado_fornecedores SET cidade = 'Roma', estado = 'Lácio', cidade_geografica_id = 'geonames:1' WHERE id = ?"
          )
            .bind(data.id)
            .run();
          return commit();
        };
        return builder;
      };
      return query;
    }
  };
  try {
    const response = await handleFornecedoresIdPut(
      event('PUT', { ...payload, nome_completo: 'Sobrescrito' }, data.id)
    );
    expect(response.status).toBe(409);
    expect(
      await env.DB.prepare(
        'SELECT nome_completo, cidade, estado, cidade_geografica_id FROM legado_fornecedores WHERE id = ?'
      )
        .bind(data.id)
        .first()
    ).toEqual({
      nome_completo: 'Fornecedor',
      cidade: 'Roma',
      estado: 'Lácio',
      cidade_geografica_id: 'geonames:1'
    });
  } finally {
    state.client = client;
  }
});
