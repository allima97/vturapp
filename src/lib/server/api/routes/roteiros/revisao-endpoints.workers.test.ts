/// <reference types="@cloudflare/vitest-pool-workers" />
import { applyD1Migrations, env } from 'cloudflare:test';
import { beforeAll, expect, it, vi } from 'vitest';
import { createDataClient } from '$lib/server/data/query';
import { VERSAO_ROTEIRO_IDENTIDADE } from '$lib/roteiroProtocolo';

const state = vi.hoisted(() => ({ client: null as ReturnType<typeof createDataClient> | null }));
vi.mock('$lib/server/v1', async (original) => ({
  ...(await original<typeof import('$lib/server/v1')>()),
  getAdminClient: () => state.client,
  requireAuthenticatedUser: async () => ({ id: 'owner' }),
  resolveUserScope: async () => ({ userId: 'owner', isAdmin: false }),
  ensureModuloAccess: () => undefined,
  isUuid: (value: string) => /^[0-9a-f-]{36}$/i.test(value)
}));
vi.mock('$lib/config/destinosGeograficos', () => ({
  roteiroGeograficoAtivo: true,
  revisaoRoteiroAtiva: true,
  fornecedoresGeograficosAtivos: false
}));
import { handleRoteirosSavePost } from './save';
import { handleRoteirosPost, handleRoteirosGet, handleRoteirosDelete } from './root';
import { handleRoteirosIdGet } from './id';
import { handleRoteirosDeleteDelete } from './delete';

beforeAll(async () => {
  await applyD1Migrations(env.DB, env.TEST_MIGRATIONS);
  await env.GEO_TEST.batch([
    env.GEO_TEST.prepare(
      'CREATE TABLE place (id INTEGER PRIMARY KEY, name TEXT NOT NULL, country_code TEXT NOT NULL, admin1 TEXT NOT NULL, admin2 TEXT NOT NULL, population INTEGER NOT NULL, feature_class TEXT NOT NULL, feature_code TEXT NOT NULL)'
    ),
    env.GEO_TEST.prepare(
      "INSERT INTO place VALUES (1, 'Rome', 'IT', '', '', 1, 'P', 'PPL'), (2, 'Italy', 'IT', '', '', 0, 'A', 'PCLI'), (3, 'Milan', 'IT', '', '', 1, 'P', 'PPL')"
    ),
    env.GEO_TEST.prepare(
      'CREATE TABLE alternate_name (id INTEGER PRIMARY KEY, place_id INTEGER NOT NULL, language TEXT NOT NULL, name TEXT NOT NULL, preferred INTEGER NOT NULL, short INTEGER NOT NULL, colloquial INTEGER NOT NULL, historic INTEGER NOT NULL)'
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

function request(body: Record<string, unknown>) {
  return new Request('https://vtur.app/api/v1/roteiros', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ versao_identidade: VERSAO_ROTEIRO_IDENTIDADE, ...body })
  });
}

function simple(body: Record<string, unknown>) {
  return handleRoteirosPost({
    request: request(body),
    platform: { env: { DB: env.DB, GEO_DB: env.GEO_TEST } },
    locals: {
      dados: state.client,
      safeGetSession: async () => ({ session: { id: 'sessao' }, user: { id: 'owner' } })
    }
  } as never);
}

function complete(body: Record<string, unknown>) {
  return handleRoteirosSavePost({
    request: request(body),
    platform: { env: { DB: env.DB, GEO_DB: env.GEO_TEST } }
  } as Parameters<typeof handleRoteirosSavePost>[0]);
}

it.each(['root', 'delete'] as const)(
  'rejeita exclusão %s com revisão ausente ou antiga e aceita a revisão atual',
  async (route) => {
    const created = await complete({
      nome: 'Viagem',
      dias: [{ cidade_id: 'geonames:1', cidade: 'Rome', descricao: 'Dia' }]
    });
    expect(created.status).toBe(200);
    const { id, revisao } = await created.json<{ id: string; revisao: string }>();
    const excluir = (rev?: string) => {
      const url = new URL(`https://vtur.app/api/v1/roteiros${route === 'delete' ? '/delete' : ''}`);
      url.searchParams.set('id', id);
      if (rev !== undefined) url.searchParams.set('revisao', `r:${rev}`);
      const event = {
        url,
        request: new Request(url, { method: 'DELETE', headers: { origin: 'https://vtur.app' } }),
        locals: {
          dados: state.client,
          safeGetSession: async () => ({ session: { id: 'sessao' }, user: { id: 'owner' } })
        }
      } as never;
      return route === 'delete' ? handleRoteirosDeleteDelete(event) : handleRoteirosDelete(event);
    };
    expect((await excluir()).status).toBe(409);
    const edit = await complete({ id, revisao, nome: 'Alterado' });
    expect(edit.status).toBe(200);
    const next = (await edit.json<{ revisao: string }>()).revisao;
    expect((await excluir(revisao)).status).toBe(409);
    expect(
      await env.DB.prepare('SELECT cidade_id FROM legado_roteiro_dia WHERE roteiro_id = ?')
        .bind(id)
        .first()
    ).toEqual({ cidade_id: 'geonames:1' });
    expect((await excluir(next)).status).toBe(200);
    expect(
      await env.DB.prepare('SELECT id FROM legado_roteiro_personalizado WHERE id = ?')
        .bind(id)
        .first()
    ).toBeNull();
  }
);

it.each(['root', 'delete'] as const)(
  'aceita revisão vazia %s somente para o dono autorizado',
  async (route) => {
    const id = crypto.randomUUID();
    await env.DB.prepare(
      "INSERT INTO legado_roteiro_personalizado (id, created_by, nome, opcionais) VALUES (?, 'other', 'Protegido', '[]')"
    )
      .bind(id)
      .run();
    const url = new URL(`https://vtur.app/api/v1/roteiros${route === 'delete' ? '/delete' : ''}`);
    url.searchParams.set('id', id);
    url.searchParams.set('revisao', 'r:');
    const event = {
      url,
      request: new Request(url, { method: 'DELETE', headers: { origin: 'https://vtur.app' } }),
      locals: {
        dados: state.client,
        safeGetSession: async () => ({ session: { id: 'sessao' }, user: { id: 'owner' } })
      }
    } as never;
    const response =
      route === 'delete'
        ? await handleRoteirosDeleteDelete(event)
        : await handleRoteirosDelete(event);
    expect([404, 409]).toContain(response.status);
    expect(
      await env.DB.prepare('SELECT id FROM legado_roteiro_personalizado WHERE id = ?')
        .bind(id)
        .first()
    ).toEqual({ id });
    await env.DB.prepare(
      "UPDATE legado_roteiro_personalizado SET created_by = 'owner' WHERE id = ?"
    )
      .bind(id)
      .run();
    const allowed =
      route === 'delete'
        ? await handleRoteirosDeleteDelete(event)
        : await handleRoteirosDelete(event);
    expect(allowed.status).toBe(200);
  }
);

it('rejeita conflitos entre lista e editor sem apagar filhos e devolve a nova revisão', async () => {
  const created = await complete({ nome: 'Original', pagamentos: [{ servico: 'Original' }] });
  expect(created.status).toBe(200);
  const { id, revisao } = await created.json<{ id: string; revisao: string }>();
  const details = await handleRoteirosIdGet({ params: { id } } as never);
  expect(await details.json()).toMatchObject({ roteiro: { revisao } });
  const list = await handleRoteirosGet({} as never);
  expect(await list.json()).toMatchObject({ roteiros: [{ id, revisao }] });
  const [a, b] = await Promise.all([
    simple({ id, revisao, nome: 'Lista' }),
    complete({ id, revisao, nome: 'Editor', pagamentos: [{ servico: 'Editor' }] })
  ]);
  expect([a.status, b.status].sort()).toEqual([200, 409]);
  const winner = a.status === 200 ? a : b;
  const { revisao: next } = await winner.json<{ revisao: string }>();
  expect(next).not.toBe(revisao);
  const persisted = await env.DB.prepare(
    'SELECT nome, revisao FROM legado_roteiro_personalizado WHERE id = ?'
  )
    .bind(id)
    .first<{ nome: string; revisao: string }>();
  expect(persisted?.revisao).toBe(next);
  expect(
    await env.DB.prepare('SELECT servico FROM legado_roteiro_pagamento WHERE roteiro_id = ?')
      .bind(id)
      .first()
  ).toEqual({ servico: persisted?.nome === 'Editor' ? 'Editor' : 'Original' });
  expect((await complete({ id, nome: 'Sem revisão', pagamentos: [] })).status).toBe(409);
  const repeat = await complete({ id, nome: 'Atualizado', revisao: next });
  expect(repeat.status).toBe(200);
  expect((await repeat.json<{ revisao: string }>()).revisao).not.toBe(next);
});

it('protege os dias em conflitos do salvamento simplificado e aceita revisão legada vazia', async () => {
  const id = crypto.randomUUID();
  await env.DB.batch([
    env.DB.prepare(
      "INSERT INTO legado_roteiro_personalizado (id, created_by, nome, opcionais) VALUES (?, 'owner', 'Original', '[]')"
    ).bind(id),
    env.DB.prepare(
      "INSERT INTO legado_roteiro_dia (id, roteiro_id, created_by, cidade, descricao) VALUES (?, ?, 'owner', '', 'Original')"
    ).bind(crypto.randomUUID(), id)
  ]);
  const saved = await simple({
    id,
    revisao: '',
    nome: 'Primeiro',
    dias: [{ cidade_id: null, descricao: 'Primeiro' }]
  });
  expect(saved.status).toBe(200);
  const stale = await simple({
    id,
    revisao: '',
    nome: 'Segundo',
    dias: [{ cidade_id: null, descricao: 'Segundo' }]
  });
  expect(stale.status).toBe(409);
  expect(
    (
      await env.DB.prepare('SELECT descricao FROM legado_roteiro_dia WHERE roteiro_id = ?')
        .bind(id)
        .all()
    ).results
  ).toEqual([{ descricao: 'Primeiro' }]);
});

it.each([
  { campo: 'dias', registro: { cidade: 'Roma', descricao: 'Dia' } },
  { campo: 'hoteis', registro: { cidade: 'Roma', hotel: 'Hotel' } },
  { campo: 'passeios', registro: { cidade: 'Roma', passeio: 'Passeio' } },
  { campo: 'opcionais', registro: { cidade: 'Roma', passeios: [] } }
])(
  'recusa $campo sem declaração de identidade antes de alterar o roteiro',
  async ({ campo, registro }) => {
    const id = crypto.randomUUID();
    await env.DB.batch([
      env.DB.prepare(
        "INSERT INTO legado_roteiro_personalizado (id, created_by, nome, opcionais) VALUES (?, 'owner', 'Original', '[]')"
      ).bind(id),
      env.DB.prepare(
        "INSERT INTO legado_roteiro_dia (id, roteiro_id, created_by, cidade, cidade_id, descricao) VALUES (?, ?, 'owner', 'Roma', 'geonames:1', 'Original')"
      ).bind(crypto.randomUUID(), id)
    ]);
    const response = await complete({ id, revisao: '', nome: 'Alterado', [campo]: [registro] });
    expect(response.status).toBe(409);
    expect(await response.json()).toMatchObject({ error: expect.stringContaining('Identidade') });
    expect(
      await env.DB.prepare('SELECT nome, revisao FROM legado_roteiro_personalizado WHERE id = ?')
        .bind(id)
        .first()
    ).toEqual({ nome: 'Original', revisao: '' });
    expect(
      await env.DB.prepare(
        'SELECT cidade_id, descricao FROM legado_roteiro_dia WHERE roteiro_id = ?'
      )
        .bind(id)
        .first()
    ).toEqual({ cidade_id: 'geonames:1', descricao: 'Original' });
  }
);

it('rejeita omissão no salvamento simplificado e aceita identidade nula explícita', async () => {
  const id = crypto.randomUUID();
  await env.DB.batch([
    env.DB.prepare(
      "INSERT INTO legado_roteiro_personalizado (id, created_by, nome, opcionais) VALUES (?, 'owner', 'Original', '[]')"
    ).bind(id),
    env.DB.prepare(
      "INSERT INTO legado_roteiro_dia (id, roteiro_id, created_by, cidade, cidade_id, descricao) VALUES (?, ?, 'owner', 'Roma', 'geonames:1', 'Original')"
    ).bind(crypto.randomUUID(), id)
  ]);
  const rejected = await simple({
    id,
    revisao: '',
    nome: 'Alterado',
    dias: [{ descricao: 'Dia' }]
  });
  expect(rejected.status).toBe(409);
  expect(
    await env.DB.prepare('SELECT cidade_id FROM legado_roteiro_dia WHERE roteiro_id = ?')
      .bind(id)
      .first()
  ).toEqual({ cidade_id: 'geonames:1' });
  const accepted = await simple({
    id,
    revisao: '',
    nome: 'Alterado',
    dias: [{ cidade_id: null, descricao: 'Dia sem cidade' }],
    identidades_removidas_confirmadas: [{ colecao: 'dias', cidade_id: 'geonames:1', quantidade: 1 }]
  });
  expect(accepted.status).toBe(200);
});

it('exige confirmação das perdas reais em cada coleção e verifica a revisão novamente', async () => {
  const colecoes = {
    dias: [
      { cidade: 'Rome', cidade_id: 'geonames:1', descricao: 'Dia 1' },
      { cidade: 'Rome', cidade_id: 'geonames:1', descricao: 'Dia 2' }
    ],
    hoteis: [{ cidade: 'Rome', cidade_id: 'geonames:1', hotel: 'Hotel' }],
    passeios: [{ cidade: 'Rome', cidade_id: 'geonames:1', passeio: 'Passeio' }],
    opcionais: [{ cidade: 'Rome', cidade_id: 'geonames:1', passeios: [] }]
  };
  const created = await complete({ nome: 'Original', ...colecoes });
  const { id, revisao } = await created.json<{ id: string; revisao: string }>();
  const alterado = {
    id,
    revisao,
    nome: 'Alterado',
    dias: [{ cidade_id: null, descricao: 'Sem destino' }],
    hoteis: [],
    passeios: [],
    opcionais: []
  };
  const rejected = await complete(alterado);
  expect(rejected.status).toBe(409);
  const { identidades_removidas: removidas } = await rejected.json<{
    identidades_removidas: { colecao: string; cidade_id: string; quantidade: number }[];
  }>();
  expect(removidas).toEqual([
    { colecao: 'dias', cidade_id: 'geonames:1', quantidade: 2 },
    { colecao: 'hoteis', cidade_id: 'geonames:1', quantidade: 1 },
    { colecao: 'opcionais', cidade_id: 'geonames:1', quantidade: 1 },
    { colecao: 'passeios', cidade_id: 'geonames:1', quantidade: 1 }
  ]);
  expect(
    (await complete({ ...alterado, identidades_removidas_confirmadas: removidas.slice(1) })).status
  ).toBe(409);
  expect(
    await env.DB.prepare('SELECT nome, revisao FROM legado_roteiro_personalizado WHERE id = ?')
      .bind(id)
      .first()
  ).toEqual({ nome: 'Original', revisao });
  const saved = await complete({ ...alterado, identidades_removidas_confirmadas: removidas });
  expect(saved.status).toBe(200);
  expect(
    (await complete({ ...alterado, identidades_removidas_confirmadas: removidas })).status
  ).toBe(409);
  expect(
    (
      await env.DB.prepare('SELECT cidade_id FROM legado_roteiro_dia WHERE roteiro_id = ?')
        .bind(id)
        .all()
    ).results
  ).toEqual([{ cidade_id: null }]);
});

it('preserva identificadores opcionais dos grupos na criação, leitura, edição e duplicação', async () => {
  const grupo = {
    registro_id: crypto.randomUUID(),
    cidade_id: 'geonames:1',
    cidade: 'Rome',
    passeios: [{ nome: 'Passeio', descricao: '' }]
  };
  const legado = { cidade_id: 'geonames:1', cidade: 'Rome', passeios: [] };
  const created = await complete({ nome: 'Original', opcionais: [grupo, legado] });
  expect(created.status).toBe(200);
  const { id, revisao } = await created.json<{ id: string; revisao: string }>();
  const read = async (roteiroId: string) => {
    const response = await handleRoteirosIdGet({ params: { id: roteiroId } } as never);
    expect(response.status).toBe(200);
    return response.json<{ roteiro: { opcionais: { registro_id?: string }[] } }>();
  };
  const inicial = (await read(id)).roteiro.opcionais;
  expect(inicial[0].registro_id).toBe(grupo.registro_id);
  expect(inicial[1].registro_id).toMatch(/^[a-f0-9-]{36}$/);
  expect((await read(id)).roteiro.opcionais).toEqual(inicial);
  const edited = await complete({
    id,
    revisao,
    nome: 'Alterado',
    opcionais: [{ ...legado, registro_id: inicial[1].registro_id }, grupo]
  });
  expect(edited.status).toBe(200);
  expect((await read(id)).roteiro.opcionais.map((item) => item.registro_id)).toEqual([
    inicial[1].registro_id,
    grupo.registro_id
  ]);
  const duplicated = await complete({ nome: 'Cópia', opcionais: [grupo, legado] });
  expect(duplicated.status).toBe(200);
  const copy = await duplicated.json<{ id: string }>();
  expect(copy.id).not.toBe(id);
  const copia = (await read(copy.id)).roteiro.opcionais;
  expect(copia[0].registro_id).toBe(grupo.registro_id);
  expect(copia[1].registro_id).not.toBe(inicial[1].registro_id);
});

it('recusa identificadores de grupo inválidos ou duplicados sem gravar o roteiro', async () => {
  const grupo = {
    registro_id: crypto.randomUUID(),
    cidade_id: 'geonames:1',
    cidade: 'Rome',
    passeios: []
  };
  const created = await complete({ nome: 'Original', opcionais: [grupo] });
  const { id, revisao } = await created.json<{ id: string; revisao: string }>();
  for (const opcionais of [[grupo, { ...grupo }], [{ ...grupo, registro_id: 'inválido' }]]) {
    const response = await complete({ id, revisao, nome: 'Alterado', opcionais });
    expect(response.status).toBe(400);
    expect(await response.json()).toMatchObject({
      error: expect.stringContaining('Identificação do grupo')
    });
  }
  expect(
    await env.DB.prepare('SELECT nome, revisao FROM legado_roteiro_personalizado WHERE id = ?')
      .bind(id)
      .first()
  ).toEqual({ nome: 'Original', revisao });
});

it('exige confirmação para trocas de cidades entre grupos identificados mesmo com as mesmas contagens', async () => {
  const grupos = [
    { registro_id: crypto.randomUUID(), cidade_id: 'geonames:1', cidade: 'Rome', passeios: [] },
    { registro_id: crypto.randomUUID(), cidade_id: 'geonames:3', cidade: 'Milan', passeios: [] }
  ];
  const created = await complete({ nome: 'Original', opcionais: grupos });
  expect(created.status).toBe(200);
  const { id, revisao } = await created.json<{ id: string; revisao: string }>();
  const reordered = await complete({
    id,
    revisao,
    nome: 'Reordenado',
    opcionais: [...grupos].reverse()
  });
  expect(reordered.status).toBe(200);
  const { revisao: novaRevisao } = await reordered.json<{ revisao: string }>();
  const trocados = [
    { ...grupos[0], cidade_id: grupos[1].cidade_id },
    { ...grupos[1], cidade_id: grupos[0].cidade_id }
  ];
  const alteracao = { id, revisao: novaRevisao, nome: 'Trocado', opcionais: trocados };
  const rejected = await complete(alteracao);
  expect(rejected.status).toBe(409);
  const { identidades_removidas } = await rejected.json<{
    identidades_removidas: { colecao: string; cidade_id: string; quantidade: number }[];
  }>();
  expect(identidades_removidas).toEqual([
    { colecao: 'opcionais', cidade_id: 'geonames:1', quantidade: 1 },
    { colecao: 'opcionais', cidade_id: 'geonames:3', quantidade: 1 }
  ]);
  expect(
    await env.DB.prepare('SELECT nome, revisao FROM legado_roteiro_personalizado WHERE id = ?')
      .bind(id)
      .first()
  ).toEqual({ nome: 'Reordenado', revisao: novaRevisao });
  expect(
    (await complete({ ...alteracao, identidades_removidas_confirmadas: identidades_removidas }))
      .status
  ).toBe(200);
  expect(
    (await complete({ ...alteracao, identidades_removidas_confirmadas: identidades_removidas }))
      .status
  ).toBe(409);
});

it('protege grupos legados antes da primeira gravação e preserva os IDs após salvar', async () => {
  const legados = [
    { cidade_id: 'geonames:1', cidade: 'Rome', passeios: [] },
    { cidade_id: 'geonames:3', cidade: 'Milan', passeios: [] }
  ];
  const created = await complete({ nome: 'Original', opcionais: legados });
  expect(created.status).toBe(200);
  const { id, revisao } = await created.json<{ id: string; revisao: string }>();
  const details = await handleRoteirosIdGet({ params: { id } } as never);
  const { roteiro } = await details.json<{
    roteiro: {
      opcionais: { cidade: string; cidade_id: string; registro_id: string; passeios: [] }[];
    };
  }>();
  const identificados = roteiro.opcionais;
  expect(new Set(identificados.map((item) => item.registro_id)).size).toBe(2);
  const savedBefore = await env.DB.prepare(
    'SELECT opcionais FROM legado_roteiro_personalizado WHERE id = ?'
  )
    .bind(id)
    .first<{ opcionais: string }>();
  expect(JSON.parse(savedBefore!.opcionais)).toEqual([
    expect.not.objectContaining({ registro_id: expect.anything() }),
    expect.not.objectContaining({ registro_id: expect.anything() })
  ]);
  const swapped = [
    { ...identificados[0], cidade_id: 'geonames:3' },
    { ...identificados[1], cidade_id: 'geonames:1' }
  ];
  const primeiraTroca = await complete({
    id,
    revisao,
    nome: 'Trocado',
    opcionais: swapped
  });
  expect(primeiraTroca.status).toBe(409);
  expect(await primeiraTroca.json()).toMatchObject({
    identidades_removidas: [
      { colecao: 'opcionais', cidade_id: 'geonames:1', quantidade: 1 },
      { colecao: 'opcionais', cidade_id: 'geonames:3', quantidade: 1 }
    ]
  });
  const removidoAdicionado = await complete({
    id,
    revisao,
    nome: 'Trocado',
    opcionais: [{ ...identificados[0], registro_id: crypto.randomUUID() }, identificados[1]]
  });
  expect(removidoAdicionado.status).toBe(409);
  expect(await removidoAdicionado.json()).toMatchObject({
    identidades_removidas: [{ colecao: 'opcionais', cidade_id: 'geonames:1', quantidade: 1 }]
  });
  const reordenado = await complete({
    id,
    revisao,
    nome: 'Reordenado',
    opcionais: [...identificados].reverse()
  });
  expect(reordenado.status).toBe(200);
  const { revisao: revisaoReordenada } = await reordenado.json<{ revisao: string }>();
  const stale = await complete({ id, revisao, nome: 'Desatualizado', opcionais: identificados });
  expect(stale.status).toBe(409);
  const current = await handleRoteirosIdGet({ params: { id } } as never);
  expect(await current.json()).toMatchObject({
    roteiro: {
      revisao: revisaoReordenada,
      opcionais: [
        { registro_id: identificados[1].registro_id, cidade_id: 'geonames:3' },
        { registro_id: identificados[0].registro_id, cidade_id: 'geonames:1' }
      ]
    }
  });
  const promoted = await complete({
    id,
    revisao: revisaoReordenada,
    nome: 'Original',
    opcionais: identificados
  });
  expect(promoted.status).toBe(200);
  const { revisao: novaRevisao } = await promoted.json<{ revisao: string }>();
  const rejected = await complete({
    id,
    revisao: novaRevisao,
    nome: 'Alterado',
    opcionais: swapped
  });
  expect(rejected.status).toBe(409);
  expect(await rejected.json()).toMatchObject({
    identidades_removidas: [
      { colecao: 'opcionais', cidade_id: 'geonames:1', quantidade: 1 },
      { colecao: 'opcionais', cidade_id: 'geonames:3', quantidade: 1 }
    ]
  });
  const updated = await handleRoteirosIdGet({ params: { id } } as never);
  expect(await updated.json()).toMatchObject({
    roteiro: {
      revisao: novaRevisao,
      opcionais: [
        { registro_id: identificados[0].registro_id, cidade_id: 'geonames:1' },
        { registro_id: identificados[1].registro_id, cidade_id: 'geonames:3' }
      ]
    }
  });
});

it('não altera um roteiro com identificadores de grupo corrompidos no banco', async () => {
  const id = crypto.randomUUID();
  const grupo = {
    registro_id: crypto.randomUUID(),
    cidade_id: 'geonames:1',
    cidade: 'Rome',
    passeios: []
  };
  await env.DB.prepare(
    "INSERT INTO legado_roteiro_personalizado (id, created_by, nome, opcionais) VALUES (?, 'owner', 'Original', ?)"
  )
    .bind(id, JSON.stringify([grupo, grupo]))
    .run();
  const response = await complete({ id, revisao: '', nome: 'Alterado', opcionais: [] });
  expect(response.status).toBe(500);
  expect(
    await env.DB.prepare(
      'SELECT nome, revisao, opcionais FROM legado_roteiro_personalizado WHERE id = ?'
    )
      .bind(id)
      .first()
  ).toEqual({ nome: 'Original', revisao: '', opcionais: JSON.stringify([grupo, grupo]) });
});

it('preserva dias idênticos na criação e edição e exige confirmação para uma remoção real', async () => {
  const duplicado = { cidade_id: 'geonames:1', cidade: 'Rome', descricao: 'Mesmo dia' };
  const created = await complete({
    nome: 'Original',
    dias: [duplicado, duplicado]
  });
  expect(created.status).toBe(200);
  const { id, revisao } = await created.json<{ id: string; revisao: string }>();
  const persisted = () =>
    env.DB.prepare(
      'SELECT cidade_id, descricao, ordem FROM legado_roteiro_dia WHERE roteiro_id = ? ORDER BY ordem'
    )
      .bind(id)
      .all();
  expect((await persisted()).results).toEqual([
    { cidade_id: 'geonames:1', descricao: 'Mesmo dia', ordem: 0 },
    { cidade_id: 'geonames:1', descricao: 'Mesmo dia', ordem: 1 }
  ]);
  const edited = await complete({ id, revisao, nome: 'Alterado', dias: [duplicado, duplicado] });
  expect(edited.status).toBe(200);
  expect((await persisted()).results).toHaveLength(2);
  const { revisao: novaRevisao } = await edited.json<{ revisao: string }>();
  const response = await complete({
    id,
    revisao: novaRevisao,
    nome: 'Alterado',
    dias: [duplicado]
  });
  expect(response.status).toBe(409);
  const confirmation = {
    identidades_removidas: [{ colecao: 'dias', cidade_id: 'geonames:1', quantidade: 1 }]
  };
  expect(await response.json()).toMatchObject(confirmation);
  expect((await persisted()).results).toHaveLength(2);
  const confirmed = await complete({
    id,
    revisao: novaRevisao,
    nome: 'Alterado',
    dias: [duplicado],
    identidades_removidas_confirmadas: confirmation.identidades_removidas
  });
  expect(confirmed.status).toBe(200);
  expect((await persisted()).results).toEqual([
    { cidade_id: 'geonames:1', descricao: 'Mesmo dia', ordem: 0 }
  ]);
});

it('preserva dias idênticos sem identidade geográfica no fluxo versionado', async () => {
  const dia = { cidade_id: null, descricao: 'Dia sem destino' };
  const created = await complete({ nome: 'Original', dias: [dia, dia] });
  expect(created.status).toBe(200);
  const { id, revisao } = await created.json<{ id: string; revisao: string }>();
  const edited = await complete({ id, revisao, nome: 'Alterado', dias: [dia, dia] });
  expect(edited.status).toBe(200);
  const rows = await env.DB.prepare(
    'SELECT cidade_id, descricao, ordem FROM legado_roteiro_dia WHERE roteiro_id = ? ORDER BY ordem'
  )
    .bind(id)
    .all();
  expect(rows.results).toEqual([
    { cidade_id: null, descricao: 'Dia sem destino', ordem: 0 },
    { cidade_id: null, descricao: 'Dia sem destino', ordem: 1 }
  ]);
});

it('não expõe identidades removidas de roteiro fora do escopo', async () => {
  const id = crypto.randomUUID();
  await env.DB.batch([
    env.DB.prepare(
      "INSERT INTO legado_roteiro_personalizado (id, created_by, nome, opcionais) VALUES (?, 'outro', 'Privado', '[]')"
    ).bind(id),
    env.DB.prepare(
      "INSERT INTO legado_roteiro_dia (id, roteiro_id, created_by, cidade, cidade_id, descricao) VALUES (?, ?, 'outro', 'Roma', 'geonames:1', 'Original')"
    ).bind(crypto.randomUUID(), id)
  ]);
  const response = await simple({
    id,
    revisao: '',
    nome: 'Alterado',
    dias: [{ cidade_id: null, descricao: 'Dia' }]
  });
  expect(response.status).toBe(409);
  expect(await response.json()).not.toHaveProperty('identidades_removidas');
});

it('aceita cidades legadas com identidade nula explícita em todas as coleções', async () => {
  await env.DB.prepare('INSERT INTO legado_cidades (id, nome) VALUES (?, ?)')
    .bind(crypto.randomUUID(), 'Cidade Legada')
    .run();
  const response = await complete({
    nome: 'Legado',
    dias: [{ cidade: 'Cidade Legada', cidade_id: null, descricao: 'Dia' }],
    hoteis: [{ cidade: 'Cidade Legada', cidade_id: null, hotel: 'Hotel' }],
    passeios: [{ cidade: 'Cidade Legada', cidade_id: null, passeio: 'Passeio' }],
    opcionais: [{ cidade: 'Cidade Legada', cidade_id: null, passeios: [] }]
  });
  expect(response.status).toBe(200);
  const { id } = await response.json<{ id: string }>();
  const details = await handleRoteirosIdGet({ params: { id } } as never);
  expect(await details.json()).toMatchObject({
    roteiro: {
      dias: [{ cidade: 'Cidade Legada', cidade_id: null }],
      hoteis: [{ cidade: 'Cidade Legada', cidade_id: null }],
      passeios: [{ cidade: 'Cidade Legada', cidade_id: null }],
      opcionais: [{ cidade: 'Cidade Legada', passeios: [] }]
    }
  });
});

it('preserva identidades geográficas em uma edição com revisão válida', async () => {
  const colecoes = {
    dias: [{ cidade: 'Rome', cidade_id: 'geonames:1', descricao: 'Dia' }],
    hoteis: [{ cidade: 'Rome', cidade_id: 'geonames:1', hotel: 'Hotel' }],
    passeios: [{ cidade: 'Rome', cidade_id: 'geonames:1', passeio: 'Passeio' }],
    opcionais: [{ cidade: 'Rome', cidade_id: 'geonames:1', passeios: [] }]
  };
  const created = await complete({ nome: 'Viagem', ...colecoes });
  expect(created.status).toBe(200);
  const { id, revisao } = await created.json<{ id: string; revisao: string }>();
  const carregado = await handleRoteirosIdGet({ params: { id } } as never);
  const { roteiro } = await carregado.json<{ roteiro: { opcionais: typeof colecoes.opcionais } }>();
  const edited = await complete({
    id,
    revisao,
    nome: 'Viagem editada',
    ...colecoes,
    opcionais: roteiro.opcionais
  });
  expect(edited.status).toBe(200);
  const details = await handleRoteirosIdGet({ params: { id } } as never);
  expect(await details.json()).toMatchObject({
    roteiro: {
      dias: [{ cidade_id: 'geonames:1' }],
      hoteis: [{ cidade_id: 'geonames:1' }],
      passeios: [{ cidade_id: 'geonames:1' }],
      opcionais: [{ cidade_id: 'geonames:1' }]
    }
  });
});

it('repete leitura quando um salvamento ocorre entre o roteiro e os filhos', async () => {
  const created = await complete({ nome: 'Original', pagamentos: [{ servico: 'Original' }] });
  const { id, revisao } = await created.json<{ id: string; revisao: string }>();
  if (!state.client) throw new Error('Cliente de teste indisponível.');
  const client = state.client;
  const from = client.from.bind(client);
  let changed = false;
  const spy = vi.spyOn(client, 'from').mockImplementation((table) => {
    const query = from(table);
    if (table === 'roteiro_personalizado' && !changed) {
      const read = query.maybeSingle.bind(query);
      query.maybeSingle = async () => {
        const result = await read();
        changed = true;
        const response = await complete({
          id,
          revisao,
          nome: 'Atualizado',
          pagamentos: [{ servico: 'Atualizado' }]
        });
        expect(response.status).toBe(200);
        return result;
      };
    }
    return query;
  });
  try {
    const response = await handleRoteirosIdGet({ params: { id } } as never);
    expect(response.status).toBe(200);
    expect(await response.json()).toMatchObject({
      roteiro: { nome: 'Atualizado', pagamentos: [{ servico: 'Atualizado' }] }
    });
    expect(changed).toBe(true);
  } finally {
    spy.mockRestore();
  }
});

it('retorna conflito se todas as tentativas de leitura sofrem alterações concorrentes', async () => {
  const created = await complete({ nome: 'Original' });
  const { id } = await created.json<{ id: string }>();
  if (!state.client) throw new Error('Cliente de teste indisponível.');
  const client = state.client;
  const from = client.from.bind(client);
  let reads = 0;
  const spy = vi.spyOn(client, 'from').mockImplementation((table) => {
    const query = from(table);
    if (table === 'roteiro_personalizado') {
      const select = query.select.bind(query);
      query.select = (columns: string) => {
        select(columns);
        if (columns.startsWith('id, nome,')) {
          const read = query.maybeSingle.bind(query);
          query.maybeSingle = async () => {
            const result = await read();
            reads++;
            await env.DB.prepare('UPDATE legado_roteiro_personalizado SET revisao = ? WHERE id = ?')
              .bind(crypto.randomUUID(), id)
              .run();
            return result;
          };
        }
        return query;
      };
    }
    return query;
  });
  try {
    const response = await handleRoteirosIdGet({ params: { id } } as never);
    expect(response.status).toBe(409);
    expect(reads).toBe(3);
    expect(await response.json()).toMatchObject({
      error: expect.stringContaining('Tente carregá-lo novamente')
    });
  } finally {
    spy.mockRestore();
  }
});

it.each([
  { campo: 'dias', tabela: 'roteiro_dia', limite: 100 },
  { campo: 'hoteis', tabela: 'roteiro_hotel', limite: 100 },
  { campo: 'passeios', tabela: 'roteiro_passeio', limite: 100 },
  { campo: 'transportes', tabela: 'roteiro_transporte', limite: 100 },
  { campo: 'investimentos', tabela: 'roteiro_investimento', limite: 50 },
  { campo: 'pagamentos', tabela: 'roteiro_pagamento', limite: 50 }
])(
  'impede leitura truncada e gravação acima do limite de $campo',
  async ({ campo, tabela, limite }) => {
    const id = crypto.randomUUID();
    await env.DB.prepare(
      "INSERT INTO legado_roteiro_personalizado (id, created_by, nome, opcionais) VALUES (?, 'owner', 'Original', '[]')"
    )
      .bind(id)
      .run();
    const insert =
      tabela === 'roteiro_dia'
        ? `INSERT INTO legado_${tabela} (id, roteiro_id, created_by, cidade, descricao) VALUES (?, ?, 'owner', '', '')`
        : `INSERT INTO legado_${tabela} (id, roteiro_id) VALUES (?, ?)`;
    await env.DB.batch(
      Array.from({ length: limite }, () => env.DB.prepare(insert).bind(crypto.randomUUID(), id))
    );
    expect((await handleRoteirosIdGet({ params: { id } } as never)).status).toBe(200);
    await env.DB.prepare(insert).bind(crypto.randomUUID(), id).run();
    const result = await handleRoteirosIdGet({ params: { id } } as never);
    expect(result.status).toBe(422);
    expect(await result.json()).toMatchObject({ error: expect.stringContaining(String(limite)) });
    const excess = Array.from({ length: limite + 1 }, () => ({}));
    expect((await complete({ id, revisao: '', nome: 'Alterado', [campo]: excess })).status).toBe(
      422
    );
    if (campo === 'dias')
      expect((await simple({ id, revisao: '', nome: 'Alterado', dias: excess })).status).toBe(422);
    expect(
      await env.DB.prepare(`SELECT count(*) AS total FROM legado_${tabela} WHERE roteiro_id = ?`)
        .bind(id)
        .first()
    ).toEqual({ total: limite + 1 });
  }
);
