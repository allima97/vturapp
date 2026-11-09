/// <reference types="@cloudflare/vitest-pool-workers" />
import { applyD1Migrations, env } from 'cloudflare:test';
import { beforeAll, expect, it, vi } from 'vitest';
import { createDataClient } from '$lib/server/data/query';
import { VERSAO_ROTEIRO_IDENTIDADE } from '$lib/roteiroProtocolo';

const state = vi.hoisted(() => ({
  client: null as ReturnType<typeof createDataClient> | null,
  scope: {
    userId: 'owner',
    isAdmin: false,
    isGestor: false,
    isMaster: false,
    companyId: null as string | null
  }
}));
vi.mock('$lib/server/v1', async (original) => ({
  ...(await original<typeof import('$lib/server/v1')>()),
  getAdminClient: () => state.client,
  requireAuthenticatedUser: async () => ({ id: 'owner' }),
  resolveUserScope: async () => state.scope,
  ensureModuloAccess: () => undefined,
  isUuid: () => true
}));
vi.mock('$lib/config/destinosGeograficos', () => ({
  roteiroGeograficoAtivo: true,
  revisaoRoteiroAtiva: false,
  fornecedoresGeograficosAtivos: false
}));
import { handleRoteirosSavePost } from './save';
import { handleRoteirosIdGet } from './id';
import { handleRoteirosPost } from './root';

beforeAll(async () => {
  await applyD1Migrations(env.DB, env.TEST_MIGRATIONS);
  await env.GEO_TEST.batch([
    env.GEO_TEST.prepare(
      'CREATE TABLE place (id INTEGER PRIMARY KEY, name TEXT NOT NULL, country_code TEXT NOT NULL, admin1 TEXT NOT NULL, admin2 TEXT NOT NULL, population INTEGER NOT NULL, feature_class TEXT NOT NULL, feature_code TEXT NOT NULL)'
    ),
    env.GEO_TEST.prepare(
      "INSERT INTO place VALUES (1, 'Rome', 'IT', '', '', 1, 'P', 'PPL'), (2, 'Rome', 'US', '', '', 1, 'P', 'PPL'), (3, 'Italy', 'IT', '', '', 0, 'A', 'PCLI'), (4, 'United States', 'US', '', '', 0, 'A', 'PCLI')"
    ),
    env.GEO_TEST.prepare(
      'CREATE TABLE alternate_name (id INTEGER PRIMARY KEY, place_id INTEGER NOT NULL, language TEXT NOT NULL, name TEXT NOT NULL, preferred INTEGER NOT NULL, short INTEGER NOT NULL, colloquial INTEGER NOT NULL, historic INTEGER NOT NULL)'
    ),
    env.GEO_TEST.prepare("INSERT INTO alternate_name VALUES (1, 1, 'pt', 'Roma', 1, 0, 0, 0)")
  ]);
  state.client = createDataClient({
    db: env.DB,
    r2: env.R2,
    secret: 'segredo-de-teste-com-32-caracteres',
    origin: 'https://vtur.app',
    headers: new Headers()
  });
});

it('mantém a deduplicação legada de dias quando a revisão está desligada', async () => {
  const dia = { cidade_id: 'geonames:1', cidade: 'Roma', descricao: 'Mesmo dia' };
  const response = await handleRoteirosSavePost({
    request: new Request('https://vtur.app/api/v1/roteiros/save', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        versao_identidade: VERSAO_ROTEIRO_IDENTIDADE,
        nome: 'Viagem',
        dias: [dia, dia]
      })
    }),
    platform: { env: { DB: env.DB, GEO_DB: env.GEO_TEST } }
  } as Parameters<typeof handleRoteirosSavePost>[0]);
  expect(response.status).toBe(200);
  const { id } = await response.json<{ id: string }>();
  const rows = await env.DB.prepare(
    'SELECT cidade_id, descricao, ordem FROM legado_roteiro_dia WHERE roteiro_id = ?'
  )
    .bind(id)
    .all();
  expect(rows.results).toEqual([{ cidade_id: 'geonames:1', descricao: 'Mesmo dia', ordem: 0 }]);
});

it('preserva identidades em dias homônimos, hotéis, passeios e opcionais ao criar, duplicar e editar', async () => {
  const body = {
    versao_identidade: VERSAO_ROTEIRO_IDENTIDADE,
    nome: 'Viagem',
    dias: [
      { cidade: 'Roma', cidade_id: 'geonames:1', percurso: 'Visita', descricao: 'Passeio' },
      { cidade: 'Roma', cidade_id: 'geonames:2', percurso: 'Visita', descricao: 'Passeio' }
    ],
    hoteis: [{ cidade: 'Roma', cidade_id: 'geonames:1', hotel: 'Hotel' }],
    passeios: [{ cidade: 'Roma', cidade_id: 'geonames:2', passeio: 'Museu' }],
    opcionais: [
      { cidade: 'Roma', cidade_id: 'geonames:1', passeios: [{ nome: 'Tour', descricao: '' }] }
    ]
  };
  let roteiroId = '';
  for (let attempt = 0; attempt < 3; attempt++) {
    const response = await handleRoteirosSavePost({
      request: new Request('https://vtur.app/api/v1/roteiros/save', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify(attempt === 2 ? { ...body, id: roteiroId } : body)
      }),
      platform: { env: { DB: env.DB, GEO_DB: env.GEO_TEST } }
    } as Parameters<typeof handleRoteirosSavePost>[0]);
    expect(response.status).toBe(200);
    const result = await response.json<{ id: string }>();
    roteiroId = result.id;
    const read = await handleRoteirosIdGet({
      params: { id: result.id }
    } as Parameters<typeof handleRoteirosIdGet>[0]);
    expect(read.status).toBe(200);
    expect(await read.json()).toMatchObject({
      roteiro: {
        dias: [
          { cidade: 'Roma, Italy', cidade_id: 'geonames:1' },
          { cidade: 'Rome, United States', cidade_id: 'geonames:2' }
        ],
        hoteis: [{ cidade: 'Roma, Italy', cidade_id: 'geonames:1' }],
        passeios: [{ cidade: 'Rome, United States', cidade_id: 'geonames:2' }],
        opcionais: [{ ...body.opcionais[0], cidade: 'Roma, Italy' }]
      }
    });
  }
});

it('mantém a identidade dos dias no salvamento simplificado', async () => {
  const response = await handleRoteirosPost({
    request: new Request('https://vtur.app/api/v1/roteiros', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        versao_identidade: VERSAO_ROTEIRO_IDENTIDADE,
        nome: 'Viagem',
        dias: [{ cidade: 'Roma', cidade_id: 'geonames:1', descricao: 'Dia' }]
      })
    }),
    platform: { env: { DB: env.DB, GEO_DB: env.GEO_TEST } },
    locals: {
      dados: state.client,
      safeGetSession: async () => ({ session: { id: 'sessao' }, user: { id: 'owner' } })
    }
  } as never);
  expect(response.status).toBe(200);
  const result = await response.json<{ id: string }>();
  const dia = await env.DB.prepare(
    'SELECT cidade, cidade_id FROM legado_roteiro_dia WHERE roteiro_id = ?'
  )
    .bind(result.id)
    .first();
  expect(dia).toEqual({ cidade: 'Roma, Italy', cidade_id: 'geonames:1' });
});

it('reverte criação e edição completas se falhar a última inserção', async () => {
  const send = (payload: Record<string, unknown>) =>
    handleRoteirosSavePost({
      request: new Request('https://vtur.app/api/v1/roteiros/save', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ versao_identidade: VERSAO_ROTEIRO_IDENTIDADE, ...payload })
      }),
      platform: { env: { DB: env.DB, GEO_DB: env.GEO_TEST } }
    } as Parameters<typeof handleRoteirosSavePost>[0]);
  const body = (nome: string, valor: string) => ({
    nome,
    opcionais: [{ cidade_id: 'geonames:1', cidade: 'Roma', passeios: [] }],
    dias: [{ cidade_id: 'geonames:1', descricao: valor }],
    hoteis: [{ cidade_id: 'geonames:1', hotel: valor }],
    passeios: [{ cidade_id: 'geonames:2', passeio: valor }],
    transportes: [{ trecho: valor }],
    investimentos: [{ tipo: valor }],
    pagamentos: [{ servico: valor }]
  });
  const initial = await send(body('Original', 'Original'));
  expect(initial.status).toBe(200);
  const { id } = await initial.json<{ id: string }>();
  const tabelas = [
    'roteiro_personalizado',
    'roteiro_dia',
    'roteiro_hotel',
    'roteiro_passeio',
    'roteiro_transporte',
    'roteiro_investimento',
    'roteiro_pagamento'
  ];
  const snapshot = async () =>
    Promise.all(
      tabelas.map(async (table) => {
        const key = table === 'roteiro_personalizado' ? 'id' : 'roteiro_id';
        return (
          await env.DB.prepare(`SELECT * FROM legado_${table} WHERE ${key} = ?`).bind(id).all()
        ).results;
      })
    );
  const original = await snapshot();
  expect(original.map((rows) => rows.length)).toEqual([1, 1, 1, 1, 1, 1, 1]);
  await env.DB.prepare(
    "CREATE TRIGGER teste_falha_pagamento BEFORE INSERT ON legado_roteiro_pagamento WHEN NEW.servico = 'Falhar' BEGIN SELECT RAISE(ABORT, 'falha de teste'); END"
  ).run();
  try {
    expect((await send({ ...body('Alterado', 'Falhar'), id })).status).toBe(500);
    expect(await snapshot()).toEqual(original);
    expect((await send(body('Não criar', 'Falhar'))).status).toBe(500);
    expect(
      await env.DB.prepare(
        "SELECT count(*) AS total FROM legado_roteiro_personalizado WHERE nome = 'Não Criar'"
      ).first()
    ).toEqual({ total: 0 });
  } finally {
    await env.DB.prepare('DROP TRIGGER teste_falha_pagamento').run();
  }
});

it('remove todas as coleções enviadas vazias no salvamento completo', async () => {
  const send = (payload: Record<string, unknown>) =>
    handleRoteirosSavePost({
      request: new Request('https://vtur.app/api/v1/roteiros/save', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ versao_identidade: VERSAO_ROTEIRO_IDENTIDADE, ...payload })
      }),
      platform: { env: { DB: env.DB, GEO_DB: env.GEO_TEST } }
    } as Parameters<typeof handleRoteirosSavePost>[0]);
  const response = await send({
    nome: 'Viagem',
    dias: [{ cidade_id: 'geonames:1', descricao: 'Dia' }],
    hoteis: [{ cidade_id: 'geonames:1', hotel: 'Hotel' }],
    passeios: [{ cidade_id: 'geonames:1', passeio: 'Passeio' }],
    transportes: [{ trecho: 'Trecho' }],
    investimentos: [{ tipo: 'Investimento' }],
    pagamentos: [{ servico: 'Pagamento' }]
  });
  expect(response.status).toBe(200);
  const { id } = await response.json<{ id: string }>();
  const edited = await send({
    id,
    nome: 'Viagem',
    dias: [],
    hoteis: [],
    passeios: [],
    transportes: [],
    investimentos: [],
    pagamentos: []
  });
  expect(edited.status).toBe(200);
  for (const table of [
    'roteiro_dia',
    'roteiro_hotel',
    'roteiro_passeio',
    'roteiro_transporte',
    'roteiro_investimento',
    'roteiro_pagamento'
  ]) {
    expect(
      await env.DB.prepare(`SELECT count(*) AS total FROM legado_${table} WHERE roteiro_id = ?`)
        .bind(id)
        .first()
    ).toEqual({ total: 0 });
  }
});

it('mantém principal e filhos coerentes em salvamentos completos simultâneos', async () => {
  const id = crypto.randomUUID();
  await env.DB.prepare(
    "INSERT INTO legado_roteiro_personalizado (id, created_by, nome, opcionais) VALUES (?, 'owner', 'Original', '[]')"
  )
    .bind(id)
    .run();
  const save = (valor: string) =>
    handleRoteirosSavePost({
      request: new Request('https://vtur.app/api/v1/roteiros/save', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          versao_identidade: VERSAO_ROTEIRO_IDENTIDADE,
          id,
          nome: valor,
          dias: [{ cidade_id: 'geonames:1', descricao: valor }],
          hoteis: [{ cidade_id: 'geonames:1', hotel: valor }],
          pagamentos: [{ servico: valor }]
        })
      }),
      platform: { env: { DB: env.DB, GEO_DB: env.GEO_TEST } }
    } as Parameters<typeof handleRoteirosSavePost>[0]);
  const results = await Promise.all([save('Primeiro'), save('Segundo')]);
  expect(results.map((response) => response.status)).toEqual([200, 200]);
  const principal = await env.DB.prepare(
    'SELECT nome FROM legado_roteiro_personalizado WHERE id = ?'
  )
    .bind(id)
    .first<{ nome: string }>();
  for (const [table, column] of [
    ['roteiro_dia', 'descricao'],
    ['roteiro_hotel', 'hotel'],
    ['roteiro_pagamento', 'servico']
  ]) {
    expect(
      (
        await env.DB.prepare(`SELECT ${column} AS valor FROM legado_${table} WHERE roteiro_id = ?`)
          .bind(id)
          .all()
      ).results
    ).toEqual([{ valor: principal?.nome }]);
  }
});

it('substitui os dias no salvamento simplificado e aceita descrição vazia', async () => {
  const id = crypto.randomUUID();
  await env.DB.batch([
    env.DB.prepare('INSERT INTO legado_cidades (id, nome) VALUES (?, ?)').bind(
      crypto.randomUUID(),
      'Cidade legada'
    ),
    env.DB.prepare(
      "INSERT INTO legado_roteiro_personalizado (id, created_by, nome, opcionais) VALUES (?, 'owner', 'Original', '[]')"
    ).bind(id),
    env.DB.prepare(
      "INSERT INTO legado_roteiro_dia (id, roteiro_id, created_by, cidade, descricao) VALUES (?, ?, 'owner', 'Antiga', 'Anterior')"
    ).bind(crypto.randomUUID(), id)
  ]);
  const response = await handleRoteirosPost({
    request: new Request('https://vtur.app/api/v1/roteiros', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        versao_identidade: VERSAO_ROTEIRO_IDENTIDADE,
        id,
        nome: 'Viagem alterada',
        dias: [{ cidade_id: 'geonames:2' }, { cidade: 'Cidade legada', descricao: 'Livre' }]
      })
    }),
    platform: { env: { DB: env.DB, GEO_DB: env.GEO_TEST } },
    locals: {
      dados: state.client,
      safeGetSession: async () => ({ session: { id: 'sessao' }, user: { id: 'owner' } })
    }
  } as never);
  expect(response.status).toBe(200);
  expect(
    await env.DB.prepare('SELECT nome FROM legado_roteiro_personalizado WHERE id = ?')
      .bind(id)
      .first()
  ).toEqual({ nome: 'Viagem Alterada' });
  expect(
    (
      await env.DB.prepare(
        'SELECT cidade, cidade_id, descricao FROM legado_roteiro_dia WHERE roteiro_id = ? ORDER BY ordem'
      )
        .bind(id)
        .all()
    ).results
  ).toEqual([
    { cidade: 'Rome, United States', cidade_id: 'geonames:2', descricao: '' },
    { cidade: 'Cidade legada', cidade_id: null, descricao: 'Livre' }
  ]);
});

it('reverte criação e edição simplificadas se uma inserção de dia falhar', async () => {
  const id = crypto.randomUUID();
  await env.DB.batch([
    env.DB.prepare(
      "INSERT INTO legado_roteiro_personalizado (id, created_by, nome, opcionais) VALUES (?, 'owner', 'Original', '[]')"
    ).bind(id),
    env.DB.prepare(
      "INSERT INTO legado_roteiro_dia (id, roteiro_id, created_by, cidade, cidade_id, descricao) VALUES (?, ?, 'owner', 'Roma', 'geonames:1', 'Original')"
    ).bind(crypto.randomUUID(), id),
    env.DB.prepare(
      "CREATE TRIGGER teste_falha_dia BEFORE INSERT ON legado_roteiro_dia WHEN NEW.descricao = 'Falhar' BEGIN SELECT RAISE(ABORT, 'falha de teste'); END"
    )
  ]);
  const send = (roteiroId?: string) =>
    handleRoteirosPost({
      request: new Request('https://vtur.app/api/v1/roteiros', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          versao_identidade: VERSAO_ROTEIRO_IDENTIDADE,
          id: roteiroId,
          nome: 'Alterado',
          dias: [
            { cidade_id: 'geonames:1', descricao: 'Novo' },
            { cidade_id: 'geonames:2', descricao: 'Falhar' }
          ]
        })
      }),
      platform: { env: { DB: env.DB, GEO_DB: env.GEO_TEST } },
      locals: {
        dados: state.client,
        safeGetSession: async () => ({ session: { id: 'sessao' }, user: { id: 'owner' } })
      }
    } as never);
  try {
    expect((await send(id)).status).toBe(500);
    expect((await send()).status).toBe(500);
    expect(
      await env.DB.prepare('SELECT nome FROM legado_roteiro_personalizado WHERE id = ?')
        .bind(id)
        .first()
    ).toEqual({ nome: 'Original' });
    expect(
      (
        await env.DB.prepare(
          'SELECT cidade, cidade_id, descricao FROM legado_roteiro_dia WHERE roteiro_id = ?'
        )
          .bind(id)
          .all()
      ).results
    ).toEqual([{ cidade: 'Roma', cidade_id: 'geonames:1', descricao: 'Original' }]);
    expect(
      await env.DB.prepare(
        "SELECT count(*) AS total FROM legado_roteiro_personalizado WHERE nome = 'Alterado'"
      ).first()
    ).toEqual({ total: 0 });
  } finally {
    await env.DB.prepare('DROP TRIGGER teste_falha_dia').run();
  }
});

it('não altera os dias de outro proprietário no salvamento simplificado', async () => {
  const id = crypto.randomUUID();
  await env.DB.batch([
    env.DB.prepare(
      "INSERT INTO legado_roteiro_personalizado (id, created_by, nome, opcionais) VALUES (?, 'other', 'Protegido', '[]')"
    ).bind(id),
    env.DB.prepare(
      "INSERT INTO legado_roteiro_dia (id, roteiro_id, created_by, cidade, cidade_id, descricao) VALUES (?, ?, 'other', 'Roma', 'geonames:1', 'Original')"
    ).bind(crypto.randomUUID(), id)
  ]);
  const response = await handleRoteirosPost({
    request: new Request('https://vtur.app/api/v1/roteiros', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        versao_identidade: VERSAO_ROTEIRO_IDENTIDADE,
        id,
        nome: 'Invasão',
        dias: [{ cidade_id: 'geonames:2', descricao: 'Substituição' }]
      })
    }),
    platform: { env: { DB: env.DB, GEO_DB: env.GEO_TEST } },
    locals: {
      dados: state.client,
      safeGetSession: async () => ({ session: { id: 'sessao' }, user: { id: 'owner' } })
    }
  } as never);
  expect(response.status).toBe(404);
  expect(
    await env.DB.prepare('SELECT cidade_id, descricao FROM legado_roteiro_dia WHERE roteiro_id = ?')
      .bind(id)
      .first()
  ).toEqual({ cidade_id: 'geonames:1', descricao: 'Original' });
});

it.each([
  { campo: 'transportes', tabela: 'transporte', item: { trecho: 'Novo' } },
  { campo: 'investimentos', tabela: 'investimento', item: { tipo: 'Novo' } },
  { campo: 'pagamentos', tabela: 'pagamento', item: { servico: 'Novo' } }
])('informa falha ao excluir $campo e não insere substitutos', async ({ campo, tabela, item }) => {
  const id = crypto.randomUUID();
  const itemId = crypto.randomUUID();
  await env.DB.batch([
    env.DB.prepare(
      "INSERT INTO legado_roteiro_personalizado (id, created_by, nome, opcionais) VALUES (?, 'owner', 'Original', '[]')"
    ).bind(id),
    env.DB.prepare(`INSERT INTO legado_roteiro_${tabela} (id, roteiro_id) VALUES (?, ?)`).bind(
      itemId,
      id
    ),
    env.DB.prepare(
      `CREATE TRIGGER teste_falha_exclusao BEFORE DELETE ON legado_roteiro_${tabela} BEGIN SELECT RAISE(ABORT, 'falha de exclusão de teste'); END`
    )
  ]);
  try {
    for (const itens of [[], [item]]) {
      const response = await handleRoteirosSavePost({
        request: new Request('https://vtur.app/api/v1/roteiros/save', {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({
            versao_identidade: VERSAO_ROTEIRO_IDENTIDADE,
            id,
            nome: 'Alterado',
            [campo]: itens
          })
        }),
        platform: { env: { DB: env.DB, GEO_DB: env.GEO_TEST } }
      } as Parameters<typeof handleRoteirosSavePost>[0]);
      expect(response.status).toBe(500);
      const rows = await env.DB.prepare(
        `SELECT id FROM legado_roteiro_${tabela} WHERE roteiro_id = ?`
      )
        .bind(id)
        .all();
      expect(rows.results).toEqual([{ id: itemId }]);
    }
  } finally {
    await env.DB.prepare('DROP TRIGGER teste_falha_exclusao').run();
  }
});

it('não atualiza nem substitui filhos se o proprietário mudar após a autorização inicial', async () => {
  const id = crypto.randomUUID();
  const itemId = crypto.randomUUID();
  await env.DB.batch([
    env.DB.prepare(
      "INSERT INTO legado_roteiro_personalizado (id, created_by, nome, opcionais) VALUES (?, 'owner', 'Original', '[]')"
    ).bind(id),
    env.DB.prepare(
      "INSERT INTO legado_roteiro_pagamento (id, roteiro_id, servico) VALUES (?, ?, 'Original')"
    ).bind(itemId, id)
  ]);
  if (!state.client) throw new Error('Cliente de teste indisponível.');
  const client = state.client;
  const from = client.from.bind(client);
  let alterouProprietario = false;
  const spy = vi.spyOn(client, 'from').mockImplementation((table) => {
    const query = from(table);
    if (table === 'roteiro_personalizado' && !alterouProprietario) {
      const maybeSingle = query.maybeSingle.bind(query);
      query.maybeSingle = async () => {
        const result = await maybeSingle();
        await env.DB.prepare(
          "UPDATE legado_roteiro_personalizado SET created_by = 'other' WHERE id = ?"
        )
          .bind(id)
          .run();
        alterouProprietario = true;
        return result;
      };
    }
    return query;
  });
  try {
    const response = await handleRoteirosSavePost({
      request: new Request('https://vtur.app/api/v1/roteiros/save', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          versao_identidade: VERSAO_ROTEIRO_IDENTIDADE,
          id,
          nome: 'Alterado',
          pagamentos: [{ servico: 'Novo' }]
        })
      }),
      platform: { env: { DB: env.DB, GEO_DB: env.GEO_TEST } }
    } as Parameters<typeof handleRoteirosSavePost>[0]);
    expect(alterouProprietario).toBe(true);
    expect(response.status).toBe(404);
    expect(
      await env.DB.prepare('SELECT nome, created_by FROM legado_roteiro_personalizado WHERE id = ?')
        .bind(id)
        .first()
    ).toEqual({ nome: 'Original', created_by: 'other' });
    expect(
      (
        await env.DB.prepare(
          'SELECT id, servico FROM legado_roteiro_pagamento WHERE roteiro_id = ?'
        )
          .bind(id)
          .all()
      ).results
    ).toEqual([{ id: itemId, servico: 'Original' }]);
  } finally {
    spy.mockRestore();
  }
});

it('preserva o escopo de empresa para gestores e acesso administrativo ao editar', async () => {
  const companyId = crypto.randomUUID();
  const otherCompanyId = crypto.randomUUID();
  const ownCompanyRoteiro = crypto.randomUUID();
  const otherCompanyRoteiro = crypto.randomUUID();
  await env.DB.batch([
    env.DB.prepare(
      'INSERT INTO legado_companies (id, nome_empresa, nome_fantasia, cnpj) VALUES (?, ?, ?, ?)'
    ).bind(companyId, 'Empresa 1', 'Empresa 1', companyId),
    env.DB.prepare(
      'INSERT INTO legado_companies (id, nome_empresa, nome_fantasia, cnpj) VALUES (?, ?, ?, ?)'
    ).bind(otherCompanyId, 'Empresa 2', 'Empresa 2', otherCompanyId),
    env.DB.prepare(
      "INSERT INTO legado_roteiro_personalizado (id, created_by, company_id, nome, opcionais) VALUES (?, 'other', ?, 'Original', '[]')"
    ).bind(ownCompanyRoteiro, companyId),
    env.DB.prepare(
      "INSERT INTO legado_roteiro_personalizado (id, created_by, company_id, nome, opcionais) VALUES (?, 'other', ?, 'Original', '[]')"
    ).bind(otherCompanyRoteiro, otherCompanyId)
  ]);
  const save = (id: string) =>
    handleRoteirosSavePost({
      request: new Request('https://vtur.app/api/v1/roteiros/save', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ versao_identidade: VERSAO_ROTEIRO_IDENTIDADE, id, nome: 'Alterado' })
      }),
      platform: { env: { DB: env.DB, GEO_DB: env.GEO_TEST } }
    } as Parameters<typeof handleRoteirosSavePost>[0]);
  try {
    state.scope.isGestor = true;
    state.scope.companyId = companyId;
    expect((await save(ownCompanyRoteiro)).status).toBe(200);
    expect((await save(otherCompanyRoteiro)).status).toBe(404);
    state.scope.isAdmin = true;
    expect((await save(otherCompanyRoteiro)).status).toBe(200);
  } finally {
    state.scope.isGestor = false;
    state.scope.isAdmin = false;
    state.scope.companyId = null;
  }
});

it('rejeita clientes antigos e versões desconhecidas antes de qualquer alteração', async () => {
  const id = crypto.randomUUID();
  await env.DB.batch([
    env.DB.prepare(
      "INSERT INTO legado_roteiro_personalizado (id, created_by, nome, opcionais) VALUES (?, 'owner', 'Original', ?)"
    ).bind(id, JSON.stringify([{ cidade: 'Roma', cidade_id: 'geonames:1', passeios: [] }])),
    env.DB.prepare(
      "INSERT INTO legado_roteiro_dia (id, created_by, roteiro_id, cidade, cidade_id, descricao) VALUES (?, 'owner', ?, 'Roma', 'geonames:1', 'Dia')"
    ).bind(crypto.randomUUID(), id)
  ]);
  for (const versao of [undefined, 0, 1, '2', VERSAO_ROTEIRO_IDENTIDADE + 1]) {
    const body = {
      id,
      nome: 'Não deve alterar',
      dias: [],
      opcionais: [],
      versao_identidade: versao
    };
    const request = () =>
      new Request('https://vtur.app/api/v1/roteiros', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify(body)
      });
    const regular = await handleRoteirosSavePost({
      request: request(),
      platform: { env: { DB: env.DB, GEO_DB: env.GEO_TEST } }
    } as Parameters<typeof handleRoteirosSavePost>[0]);
    const simple = await handleRoteirosPost({
      request: request(),
      platform: { env: { DB: env.DB, GEO_DB: env.GEO_TEST } },
      locals: {
        dados: state.client,
        safeGetSession: async () => ({ session: { id: 'sessao' }, user: { id: 'owner' } })
      }
    } as never);
    for (const response of [regular, simple]) {
      expect(response.status).toBe(409);
      expect(await response.json()).toMatchObject({
        error: expect.stringContaining('Recarregue a página')
      });
    }
  }
  const roteiro = await env.DB.prepare(
    'SELECT nome, opcionais FROM legado_roteiro_personalizado WHERE id = ?'
  )
    .bind(id)
    .first<{ nome: string; opcionais: string }>();
  expect(roteiro?.nome).toBe('Original');
  expect(JSON.parse(roteiro?.opcionais ?? 'null')).toEqual([
    { cidade: 'Roma', cidade_id: 'geonames:1', passeios: [] }
  ]);
  expect(
    await env.DB.prepare('SELECT cidade_id FROM legado_roteiro_dia WHERE roteiro_id = ?')
      .bind(id)
      .first()
  ).toEqual({ cidade_id: 'geonames:1' });
});

it('rejeita destino inexistente e indisponibilidade antes de gravar ou alterar o roteiro', async () => {
  const nome = `Roteiro ${crypto.randomUUID()}`;
  const makeEvent = (body: object, geo: boolean) =>
    ({
      request: new Request('https://vtur.app/api/v1/roteiros/save', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ ...body, versao_identidade: VERSAO_ROTEIRO_IDENTIDADE })
      }),
      platform: { env: { DB: env.DB, GEO_DB: geo ? env.GEO_TEST : undefined } }
    }) as Parameters<typeof handleRoteirosSavePost>[0];
  const invalid = {
    nome,
    dias: [{ cidade: 'Inventado', cidade_id: 'geonames:1' }],
    hoteis: [{ cidade: 'Inventado', cidade_id: 'geonames:999' }]
  };
  expect((await handleRoteirosSavePost(makeEvent(invalid, true))).status).toBe(400);
  expect((await handleRoteirosSavePost(makeEvent(invalid, false))).status).toBe(503);
  expect(
    await env.DB.prepare(
      'SELECT count(*) AS total FROM legado_roteiro_personalizado WHERE nome = ?'
    )
      .bind(nome)
      .first()
  ).toEqual({ total: 0 });

  const created = await handleRoteirosSavePost(makeEvent({ nome }, true));
  expect(created.status).toBe(200);
  const { id } = await created.json<{ id: string }>();
  const original = await env.DB.prepare(
    'SELECT nome FROM legado_roteiro_personalizado WHERE id = ?'
  )
    .bind(id)
    .first();
  const failure = await handleRoteirosSavePost(
    makeEvent({ ...invalid, id, nome: 'Não deve alterar' }, true)
  );
  expect(failure.status).toBe(400);
  expect(
    await env.DB.prepare('SELECT nome FROM legado_roteiro_personalizado WHERE id = ?')
      .bind(id)
      .first()
  ).toEqual(original);
});

it('rejeita ID inexistente ou ausência da base antes do salvamento simplificado', async () => {
  const nome = `Roteiro simples ${crypto.randomUUID()}`;
  const makeEvent = (id: string, geo: boolean) =>
    ({
      request: new Request('https://vtur.app/api/v1/roteiros', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          versao_identidade: VERSAO_ROTEIRO_IDENTIDADE,
          nome,
          dias: [{ cidade: 'Falso', cidade_id: id }]
        })
      }),
      platform: { env: { DB: env.DB, GEO_DB: geo ? env.GEO_TEST : undefined } },
      locals: {
        dados: state.client,
        safeGetSession: async () => ({ session: { id: 'sessao' }, user: { id: 'owner' } })
      }
    }) as never;
  expect((await handleRoteirosPost(makeEvent('geonames:999', true))).status).toBe(400);
  expect((await handleRoteirosPost(makeEvent('geonames:1', false))).status).toBe(503);
  expect(
    await env.DB.prepare(
      'SELECT count(*) AS total FROM legado_roteiro_personalizado WHERE nome = ?'
    )
      .bind(nome)
      .first()
  ).toEqual({ total: 0 });
});

it('permite dados legados e geográficos juntos sem associá-los pelo nome', async () => {
  await env.DB.prepare(
    'INSERT INTO legado_cidades (id, nome, estado_nome, pais_nome) VALUES (?, ?, ?, ?)'
  )
    .bind(crypto.randomUUID(), 'Roma', 'Lácio', 'Itália')
    .run();
  const response = await handleRoteirosSavePost({
    request: new Request('https://vtur.app/api/v1/roteiros/save', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        versao_identidade: VERSAO_ROTEIRO_IDENTIDADE,
        nome: 'Viagem mista',
        dias: [
          { cidade: 'Roma, Lácio, Itália', descricao: 'Legado' },
          { cidade: 'Falso', cidade_id: 'geonames:1', descricao: 'Geográfico' }
        ]
      })
    }),
    platform: { env: { DB: env.DB, GEO_DB: env.GEO_TEST } }
  } as Parameters<typeof handleRoteirosSavePost>[0]);
  expect(response.status).toBe(200);
  const { id } = await response.json<{ id: string }>();
  const rows = await env.DB.prepare(
    'SELECT cidade, cidade_id FROM legado_roteiro_dia WHERE roteiro_id = ? ORDER BY ordem'
  )
    .bind(id)
    .all();
  expect(rows.results).toEqual([
    { cidade: 'Roma, Lácio, Itália', cidade_id: null },
    { cidade: 'Roma, Italy', cidade_id: 'geonames:1' }
  ]);
});
