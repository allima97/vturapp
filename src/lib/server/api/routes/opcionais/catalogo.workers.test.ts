/// <reference types="@cloudflare/vitest-pool-workers" />
import { applyD1Migrations, env } from 'cloudflare:test';
import { beforeAll, describe, expect, it, vi } from 'vitest';

const state = vi.hoisted(() => ({ userId: '', cadastros: 4, orcamentos: 0 }));
vi.mock('$lib/server/v1', async (importOriginal) => ({
  ...(await importOriginal<typeof import('$lib/server/v1')>()),
  getAdminClient: () => ({}),
  requireAuthenticatedUser: async () => ({ id: state.userId }),
  resolveUserScope: async () => state,
  isUuid: (value: string) => /^[0-9a-f]{8}-[0-9a-f-]{27}$/i.test(value),
  ensureModuloAccess: (_scope: unknown, modules: string[], level: number) => {
    if (
      !(modules.includes('Cadastros') && state.cadastros >= level) &&
      !(modules.includes('Orcamentos') && state.orcamentos >= level)
    ) {
      throw { status: 403, body: { message: 'Sem permissão.' } };
    }
  }
}));

import { handleOpcionaisDelete, handleOpcionaisGet, handleOpcionaisPost } from './root';
import { handleOpcionaisImportarPost } from './importar';

function event(method: string, query = '', body?: unknown, geo = false, db = env.DB) {
  const url = new URL(`https://vtur.app/api/v1/opcionais${query}`);
  return {
    url,
    request: new Request(url, {
      method,
      headers: { origin: 'https://vtur.app', 'content-type': 'application/json' },
      body: body === undefined ? undefined : JSON.stringify(body)
    }),
    platform: { env: { DB: db, GEO_DB: geo ? env.GEO_TEST : undefined } }
  } as never;
}

describe('catálogo global de opcionais no D1', () => {
  beforeAll(async () => {
    const migrations = (
      env as unknown as { TEST_MIGRATIONS: Parameters<typeof applyD1Migrations>[1] }
    ).TEST_MIGRATIONS;
    await applyD1Migrations(env.DB, migrations);
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
  });

  it('compartilha por cidade, protege escrita e preserva cópia de roteiro', async () => {
    const owner = crypto.randomUUID();
    const other = crypto.randomUUID();
    await env.DB.batch([
      env.DB.prepare('INSERT INTO legado_users (id, email) VALUES (?, ?)').bind(
        owner,
        `${owner}@test.com`
      ),
      env.DB.prepare('INSERT INTO legado_users (id, email) VALUES (?, ?)').bind(
        other,
        `${other}@test.com`
      )
    ]);
    state.userId = owner;
    state.cadastros = 4;
    const first = await handleOpcionaisPost(
      event('POST', '', {
        cidade: 'Lisboa, Lisboa, Portugal',
        nome: 'Belém',
        descricao: 'Passeio pelo bairro'
      })
    );
    expect(first.status).toBe(200);
    const { item } = (await first.json()) as {
      item: { id: string; cidade: string; nome: string; descricao: string };
    };
    const otherCity = await handleOpcionaisPost(
      event('POST', '', {
        cidade: 'Lisboa, Ohio, Estados Unidos',
        nome: 'Outro',
        descricao: ''
      })
    );
    expect(otherCity.status).toBe(200);
    const nomeBusca = await handleOpcionaisGet(event('GET', '?nome=bel%C3%A9m'));
    expect(await nomeBusca.json()).toMatchObject({ items: [item], hasMore: false });
    for (const termo of ['portugal', 'Belém', 'bairro']) {
      const resultado = await handleOpcionaisGet(event('GET', `?q=${encodeURIComponent(termo)}`));
      expect(await resultado.json()).toMatchObject({ items: [item], hasMore: false });
    }
    expect(await (await handleOpcionaisGet(event('GET', '?q=%25'))).json()).toMatchObject({
      items: []
    });
    const nomeCidadeBusca = await handleOpcionaisGet(
      event('GET', '?cidade=Lisboa%2C%20Ohio%2C%20Estados%20Unidos&nome=Bel%C3%A9m')
    );
    expect(await nomeCidadeBusca.json()).toMatchObject({ items: [] });
    expect(await (await handleOpcionaisGet(event('GET', '?nome=%25'))).json()).toMatchObject({
      items: []
    });
    const snapshot = { nome: item.nome, descricao: item.descricao };
    const roteiroId = crypto.randomUUID();
    await env.DB.prepare(
      'INSERT INTO legado_roteiro_personalizado (id, created_by, nome, opcionais) VALUES (?, ?, ?, ?)'
    )
      .bind(
        roteiroId,
        owner,
        'Roteiro',
        JSON.stringify([{ cidade: item.cidade, passeios: [snapshot] }])
      )
      .run();

    state.userId = other;
    state.cadastros = 0;
    state.orcamentos = 1;
    const list = await handleOpcionaisGet(
      event('GET', '?cidade=LISBOA%2C%20%20LISBOA%2C%20PORTUGAL')
    );
    expect(list.status).toBe(200);
    expect(await list.json()).toMatchObject({ items: [item], hasMore: false });
    expect(
      (await handleOpcionaisPost(event('POST', '', { ...item, nome: 'Modificado' }))).status
    ).toBe(403);
    expect((await handleOpcionaisDelete(event('DELETE', `?id=${item.id}`))).status).toBe(403);
    state.orcamentos = 0;
    expect((await handleOpcionaisGet(event('GET'))).status).toBe(403);

    state.cadastros = 4;
    const updated = await handleOpcionaisPost(
      event('POST', '', { ...item, nome: 'Passeio alterado' })
    );
    expect(updated.status).toBe(200);
    const deleted = await handleOpcionaisDelete(event('DELETE', `?id=${item.id}`));
    expect(deleted.status).toBe(200);
    expect((await handleOpcionaisDelete(event('DELETE', `?id=${item.id}`))).status).toBe(404);
    expect(
      await handleOpcionaisGet(event('GET', '?cidade=Lisboa%2C%20Lisboa%2C%20Portugal')).then((r) =>
        r.json()
      )
    ).toMatchObject({ items: [] });
    const roteiro = await env.DB.prepare(
      'SELECT opcionais FROM legado_roteiro_personalizado WHERE id = ?'
    )
      .bind(roteiroId)
      .first<{ opcionais: string }>();
    expect(JSON.parse(roteiro?.opcionais || 'null')).toEqual([
      { cidade: item.cidade, passeios: [{ nome: 'Belém', descricao: 'Passeio pelo bairro' }] }
    ]);
  });

  it('valida campos e paginação', async () => {
    state.cadastros = 4;
    expect(
      (await handleOpcionaisPost(event('POST', '', { cidade: '', nome: 'Passeio', descricao: '' })))
        .status
    ).toBe(400);
    expect(
      (await handleOpcionaisPost(event('POST', '', { cidade: 'Lisboa', nome: '', descricao: '' })))
        .status
    ).toBe(400);
    expect((await handleOpcionaisGet(event('GET', '?pagina=-1'))).status).toBe(400);
  });

  it('grava e consulta opcionais pela identidade validada sem misturar homônimos', async () => {
    state.cadastros = 4;
    state.userId = crypto.randomUUID();
    await env.DB.prepare('INSERT INTO legado_users (id, email) VALUES (?, ?)')
      .bind(state.userId, `${state.userId}@test.com`)
      .run();
    const first = await handleOpcionaisPost(
      event(
        'POST',
        '',
        {
          cidade_id: 'geonames:1',
          cidade: 'Outro nome',
          nome: 'Coliseu',
          descricao: ''
        },
        true
      )
    );
    expect(first.status).toBe(200);
    const { item } = await first.json<{
      item: { id: string; cidade: string; cidade_id: string };
    }>();
    expect(item).toMatchObject({ cidade_id: 'geonames:1', cidade: 'Roma, Italy' });
    const second = await handleOpcionaisPost(
      event(
        'POST',
        '',
        {
          cidade_id: 'geonames:2',
          cidade: 'Roma, Italy',
          nome: 'Coliseu',
          descricao: ''
        },
        true
      )
    );
    expect(second.status).toBe(200);
    expect(
      await (await handleOpcionaisGet(event('GET', '?cidade_id=geonames%3A1'))).json()
    ).toMatchObject({ items: [item] });
    expect(
      await (await handleOpcionaisGet(event('GET', '?q=Roma%2C%20Italy'))).json()
    ).toMatchObject({ items: [item] });
    expect(
      await (
        await handleOpcionaisGet(event('GET', '?cidade_id=geonames%3A2&q=Roma%2C%20Italy'))
      ).json()
    ).toMatchObject({ items: [] });
    expect(
      await (await handleOpcionaisGet(event('GET', '?cidade=Roma%2C%20Italy'))).json()
    ).toMatchObject({ items: [] });
    expect((await handleOpcionaisGet(event('GET', '?cidade_id=geonames%3A01'))).status).toBe(400);
    expect(
      (
        await handleOpcionaisPost(
          event('POST', '', { ...item, cidade_id: undefined, nome: 'Novo', descricao: '' })
        )
      ).status
    ).toBe(409);
    expect(
      (await handleOpcionaisPost(event('POST', '', { ...item, nome: 'Novo', descricao: '' }, true)))
        .status
    ).toBe(200);
    expect(
      (
        await handleOpcionaisPost(
          event('POST', '', { cidade_id: 'geonames:999', nome: 'X', descricao: '' }, true)
        )
      ).status
    ).toBe(400);
    expect(
      (
        await handleOpcionaisPost(
          event('POST', '', { cidade_id: 'geonames:1', nome: 'X', descricao: '' })
        )
      ).status
    ).toBe(503);
  });

  it('impede que uma edição legada concorrente apague uma identidade recém-vinculada', async () => {
    state.cadastros = 4;
    state.userId = crypto.randomUUID();
    await env.DB.prepare('INSERT INTO legado_users (id, email) VALUES (?, ?)')
      .bind(state.userId, `${state.userId}@test.com`)
      .run();
    const id = crypto.randomUUID();
    await env.DB.prepare(
      'INSERT INTO catalogo_opcionais (id, cidade, cidade_chave, nome, descricao) VALUES (?, ?, ?, ?, ?)'
    )
      .bind(id, 'Roma', 'roma', 'Original', '')
      .run();
    const db = new Proxy(env.DB, {
      get(target, property) {
        if (property === 'prepare') {
          return (sql: string) => {
            const statement = target.prepare(sql);
            if (!sql.startsWith('UPDATE catalogo_opcionais')) return statement;
            return new Proxy(statement, {
              get(prepared, key) {
                if (key === 'bind') {
                  return (...values: unknown[]) => {
                    const bound = prepared.bind(...values);
                    return new Proxy(bound, {
                      get(query, method) {
                        if (method === 'first') {
                          return async () => {
                            await env.DB.prepare(
                              "UPDATE catalogo_opcionais SET cidade_id = 'geonames:1', nome = 'Vinculado' WHERE id = ?"
                            )
                              .bind(id)
                              .run();
                            return query.first();
                          };
                        }
                        const value = Reflect.get(query, method, query);
                        return typeof value === 'function' ? value.bind(query) : value;
                      }
                    });
                  };
                }
                const value = Reflect.get(prepared, key, prepared);
                return typeof value === 'function' ? value.bind(prepared) : value;
              }
            });
          };
        }
        const value = Reflect.get(target, property, target);
        return typeof value === 'function' ? value.bind(target) : value;
      }
    });
    const response = await handleOpcionaisPost(
      event('POST', '', { id, cidade: 'Roma', nome: 'Edição antiga', descricao: '' }, false, db)
    );
    expect(response.status).toBe(409);
    expect(
      await env.DB.prepare('SELECT cidade_id, nome FROM catalogo_opcionais WHERE id = ?')
        .bind(id)
        .first()
    ).toEqual({ cidade_id: 'geonames:1', nome: 'Vinculado' });
    expect(
      (
        await handleOpcionaisPost(
          event('POST', '', {
            id: crypto.randomUUID(),
            cidade: 'Roma',
            nome: 'Ausente',
            descricao: ''
          })
        )
      ).status
    ).toBe(404);
  });

  it('importa por identidade sem mesclar homônimos ou confiar nos rótulos enviados', async () => {
    state.cadastros = 4;
    state.userId = crypto.randomUUID();
    await env.DB.prepare('INSERT INTO legado_users (id, email) VALUES (?, ?)')
      .bind(state.userId, `${state.userId}@test.com`)
      .run();
    const nome = `Museu ${crypto.randomUUID()}`;
    const items = [
      { cidade_id: 'geonames:1', cidade: 'Nome incorreto', nome, descricao: 'A' },
      { cidade_id: 'geonames:1', cidade: 'Outra tradução', nome, descricao: 'B' },
      { cidade_id: 'geonames:2', cidade: 'Nome incorreto', nome, descricao: 'C' }
    ];
    const response = await handleOpcionaisImportarPost(event('POST', '', { items }, true));
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ importados: 2, ignorados: 1 });
    const rows = await env.DB.prepare(
      'SELECT cidade_id, cidade, descricao FROM catalogo_opcionais WHERE nome = ? ORDER BY cidade_id'
    )
      .bind(nome)
      .all();
    expect(rows.results).toEqual([
      { cidade_id: 'geonames:1', cidade: 'Roma, Italy', descricao: 'A' },
      { cidade_id: 'geonames:2', cidade: 'Rome, United States', descricao: 'C' }
    ]);
    expect(
      await (await handleOpcionaisImportarPost(event('POST', '', { items }, true))).json()
    ).toEqual({ importados: 0, ignorados: 3 });
    expect((await handleOpcionaisImportarPost(event('POST', '', { items }))).status).toBe(503);
    const invalidName = `Inválido ${crypto.randomUUID()}`;
    const invalid = [
      { cidade_id: 'geonames:1', cidade: '', nome: invalidName, descricao: '' },
      { cidade_id: 'geonames:999', cidade: '', nome: 'X', descricao: '' }
    ];
    expect(
      (await handleOpcionaisImportarPost(event('POST', '', { items: invalid }, true))).status
    ).toBe(400);
    expect(
      await env.DB.prepare('SELECT count(*) AS total FROM catalogo_opcionais WHERE nome = ?')
        .bind(invalidName)
        .first()
    ).toEqual({ total: 0 });
  });

  it('pagina resultados por cidade sem misturar localidades', async () => {
    state.cadastros = 4;
    const city = `Cidade ${crypto.randomUUID()}`;
    const statements = Array.from({ length: 101 }, (_, index) =>
      env.DB.prepare(
        'INSERT INTO catalogo_opcionais (id, cidade, cidade_chave, nome, descricao) VALUES (?, ?, ?, ?, ?)'
      ).bind(crypto.randomUUID(), city, city.toLowerCase(), `Passeio ${index}`, '')
    );
    await env.DB.batch(statements);
    const query = `?cidade=${encodeURIComponent(city)}`;
    const page1 = (await (await handleOpcionaisGet(event('GET', query))).json()) as {
      items: Array<{ id: string }>;
      hasMore: boolean;
    };
    const page2 = (await (await handleOpcionaisGet(event('GET', `${query}&pagina=2`))).json()) as {
      items: Array<{ id: string }>;
      hasMore: boolean;
    };
    expect(page1.items).toHaveLength(100);
    expect(page1.hasMore).toBe(true);
    expect(page2.items).toHaveLength(1);
    expect(page2.hasMore).toBe(false);
    expect(page1.items.map((row) => row.id)).not.toContain(page2.items[0].id);
  });

  it('importa em lote e ignora duplicados por cidade sem alterar descrições existentes', async () => {
    const user = crypto.randomUUID();
    await env.DB.prepare('INSERT INTO legado_users (id, email) VALUES (?, ?)')
      .bind(user, `${user}@test.com`)
      .run();
    state.userId = user;
    state.cadastros = 4;
    const cidade = `Cidade ${crypto.randomUUID()}`;
    const original = { cidade, nome: 'PASSEIO ÁRVORE', descricao: 'Original' };
    expect((await handleOpcionaisPost(event('POST', '', original))).status).toBe(200);
    const items = [
      { ...original, nome: 'passeio árvore', descricao: 'Não substituir' },
      { cidade, nome: 'Museu', descricao: 'Primeiro' },
      { cidade, nome: 'museu', descricao: 'Duplicado' },
      { cidade: `${cidade} região B`, nome: 'Museu', descricao: 'Outra cidade' }
    ];
    const response = await handleOpcionaisImportarPost(event('POST', '', { items }));
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ importados: 2, ignorados: 2 });
    const rows = await env.DB.prepare(
      'SELECT cidade, nome, descricao FROM catalogo_opcionais WHERE cidade_chave = ? ORDER BY nome'
    )
      .bind(cidade.toLowerCase())
      .all();
    expect(rows.results).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ nome: 'PASSEIO ÁRVORE', descricao: 'Original' }),
        expect.objectContaining({ nome: 'Museu', descricao: 'Primeiro' })
      ])
    );
    const repeated = await handleOpcionaisImportarPost(event('POST', '', { items }));
    expect(await repeated.json()).toEqual({ importados: 0, ignorados: 4 });
    state.cadastros = 1;
    expect((await handleOpcionaisImportarPost(event('POST', '', { items }))).status).toBe(403);
    state.cadastros = 4;
    expect(
      (
        await handleOpcionaisImportarPost(
          event('POST', '', { items: [original, { cidade, nome: '', descricao: '' }] })
        )
      ).status
    ).toBe(400);
  });

  it('não grava parte do lote quando ocorre erro no banco', async () => {
    state.userId = crypto.randomUUID();
    state.cadastros = 4;
    const cidade = `Cidade ${crypto.randomUUID()}`;
    const response = await handleOpcionaisImportarPost(
      event('POST', '', {
        items: [
          { cidade, nome: 'Passeio A', descricao: '' },
          { cidade, nome: 'Passeio B', descricao: '' }
        ]
      })
    );
    expect(response.status).toBe(500);
    const count = await env.DB.prepare(
      'SELECT count(*) AS total FROM catalogo_opcionais WHERE cidade_chave = ?'
    )
      .bind(cidade.toLowerCase())
      .first<{ total: number }>();
    expect(count?.total).toBe(0);
  });
});
