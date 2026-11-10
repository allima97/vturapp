/// <reference types="@cloudflare/vitest-pool-workers" />
import { applyD1Migrations, env } from 'cloudflare:test';
import { beforeAll, describe, expect, it } from 'vitest';
import {
  buscarDestinosPersonalizados,
  criarDestinoPersonalizado,
  obterDestinoPersonalizado,
  rotuloDestinoPersonalizado
} from './destinosPersonalizados';
import { buscarDestinos, buscarDestinosExatos, obterDestino } from './destinosBusca';
import { IdentidadeDestinoInvalida, resolverDestinoParaPersistencia } from './destinoPersistencia';
import { obterOuCriarCidadeGeografica } from './cidadesIdentidade';

declare module 'cloudflare:test' {
  interface ProvidedEnv {
    GEO_TEST: D1Database;
    TEST_MIGRATIONS: Parameters<typeof applyD1Migrations>[1];
  }
}

describe('destinos personalizados', () => {
  beforeAll(async () => {
    await applyD1Migrations(env.DB, env.TEST_MIGRATIONS);
    await env.GEO_TEST.batch([
      env.GEO_TEST.prepare(
        "CREATE TABLE place (id INTEGER PRIMARY KEY, name TEXT NOT NULL, country_code TEXT NOT NULL, admin1 TEXT NOT NULL, admin2 TEXT NOT NULL, population INTEGER NOT NULL, feature_class TEXT NOT NULL, feature_code TEXT NOT NULL DEFAULT '')"
      ),
      env.GEO_TEST.prepare(
        "INSERT INTO place VALUES (1, 'Ipojuca', 'BR', '30', '2607208', 80637, 'P', 'PPL'), (2, 'Pernambuco', 'BR', '30', '', 0, 'A', 'ADM1'), (3, 'Ipojuca', 'XX', '01', '', 10, 'P', 'PPL')"
      ),
      env.GEO_TEST.prepare(
        'CREATE TABLE alternate_name (id INTEGER PRIMARY KEY, place_id INTEGER NOT NULL, language TEXT NOT NULL, name TEXT NOT NULL, preferred INTEGER NOT NULL, short INTEGER NOT NULL, colloquial INTEGER NOT NULL, historic INTEGER NOT NULL)'
      ),
      env.GEO_TEST.prepare(
        "INSERT INTO alternate_name VALUES (1, 1, 'en', 'Ipojuca City', 1, 0, 0, 0)"
      ),
      env.GEO_TEST.prepare(
        'CREATE TABLE search_name (place_id INTEGER NOT NULL, normalized TEXT NOT NULL, priority INTEGER NOT NULL, PRIMARY KEY (normalized, place_id)) WITHOUT ROWID'
      ),
      env.GEO_TEST.prepare(
        'CREATE TABLE short_search (prefix TEXT NOT NULL, rank INTEGER NOT NULL, place_id INTEGER NOT NULL, PRIMARY KEY (prefix, rank)) WITHOUT ROWID'
      ),
      env.GEO_TEST.prepare("INSERT INTO search_name VALUES (1, 'ipojuca', 0), (3, 'ipojuca', 0)"),
      env.GEO_TEST.prepare("INSERT INTO short_search VALUES ('ip', 0, 1), ('ip', 1, 3)")
    ]);
  });

  it('stores a stable custom identity separately from the reference database', async () => {
    const local = await criarDestinoPersonalizado(env.DB, env.GEO_TEST, '  Praia  Azul  ', 1);
    expect(local).toMatchObject({ nome: 'Praia Azul', referenciaGeoNamesId: 1 });
    expect(local.id).toMatch(/^[a-f0-9-]{36}$/);
    expect(await buscarDestinosPersonalizados(env.DB, 'práia')).toEqual([local]);
    expect(await obterDestinoPersonalizado(env.DB, local.id)).toEqual(local);
    expect(await obterDestinoPersonalizado(env.DB, local.id.toUpperCase())).toEqual(local);
    expect(await rotuloDestinoPersonalizado(env.GEO_TEST, local, 'pt-BR')).toBe(
      'Praia Azul, Ipojuca, Pernambuco, BR'
    );
    expect(await env.GEO_TEST.prepare('SELECT count(*) AS total FROM place').first()).toEqual({
      total: 3
    });
    expect(
      await env.GEO_TEST.prepare(
        "SELECT count(*) AS total FROM sqlite_master WHERE name='destinos_personalizados'"
      ).first()
    ).toEqual({ total: 0 });
  });

  it('rejects invalid references, duplicate normalized names and invalid input', async () => {
    await expect(criarDestinoPersonalizado(env.DB, env.GEO_TEST, 'Outro', 2)).rejects.toThrow(
      'referência'
    );
    await expect(criarDestinoPersonalizado(env.DB, env.GEO_TEST, 'Outro', 999)).rejects.toThrow(
      'referência'
    );
    await expect(criarDestinoPersonalizado(env.DB, env.GEO_TEST, ' ', 1)).rejects.toThrow('nome');
    await criarDestinoPersonalizado(env.DB, env.GEO_TEST, 'São Local', 1);
    await expect(criarDestinoPersonalizado(env.DB, env.GEO_TEST, 'sao local', 1)).rejects.toThrow();
    const homonym = await criarDestinoPersonalizado(env.DB, env.GEO_TEST, 'São Local', 3);
    expect(homonym.referenciaGeoNamesId).toBe(3);
    await expect(buscarDestinosPersonalizados(env.DB, 'pr', 0)).rejects.toThrow('Limite');
    await expect(obterDestinoPersonalizado(env.DB, 'inválido')).rejects.toThrow('ID');
    expect(await obterDestinoPersonalizado(env.DB, crypto.randomUUID())).toBeNull();
    expect(
      await rotuloDestinoPersonalizado(
        env.GEO_TEST,
        { ...homonym, referenciaGeoNamesId: 999 },
        'pt'
      )
    ).toBe('São Local (referência geográfica indisponível)');
  });

  it('searches and resolves both source identities without merging homonyms', async () => {
    const custom = await criarDestinoPersonalizado(env.DB, env.GEO_TEST, 'Ipojuca Nova', 1);
    const result = await buscarDestinos(env.DB, env.GEO_TEST, 'ip', 'pt', 2);
    expect(result.items.map((item) => item.id)).toEqual([
      `personalizado:${custom.id}`,
      'geonames:1'
    ]);
    expect(result.podeHaverMais).toBe(true);
    const referencia = {
      localidade: 'Ipojuca',
      subdivisao_secundaria: null,
      regiao: 'Pernambuco',
      pais: 'BR',
      codigo_pais: 'BR'
    };
    expect(result.items[0]).toMatchObject({ nome: 'Ipojuca Nova', referencia });
    expect(result.items[1]).toMatchObject({ nome: 'Ipojuca', referencia });
    const exatos = await buscarDestinosExatos(env.GEO_TEST, 'Ipojuca', 'pt', '', 0);
    expect(exatos.items).toContainEqual(expect.objectContaining({ id: 'geonames:1', referencia }));
    expect(exatos.items).toContainEqual(
      expect.objectContaining({
        id: 'geonames:3',
        referencia: expect.objectContaining({ regiao: null, pais: 'XX', codigo_pais: 'XX' })
      })
    );
    expect(await obterDestino(env.DB, env.GEO_TEST, `personalizado:${custom.id}`, 'pt')).toEqual(
      result.items[0]
    );
    expect(await obterDestino(env.DB, env.GEO_TEST, 'geonames:1', 'pt')).toEqual(result.items[1]);
    expect(await obterDestino(env.DB, env.GEO_TEST, 'geonames:1', 'en')).toMatchObject({
      id: 'geonames:1',
      nome: 'Ipojuca City'
    });
    expect((await obterDestino(env.DB, env.GEO_TEST, 'geonames:3', 'pt'))?.id).toBe('geonames:3');
    expect(await obterDestino(env.DB, env.GEO_TEST, 'geonames:999', 'pt')).toBeNull();
    await expect(obterDestino(env.DB, env.GEO_TEST, 'geonames:01', 'pt')).rejects.toThrow('ID');
    await expect(obterDestino(env.DB, env.GEO_TEST, 'outro:1', 'pt')).rejects.toThrow('ID');
  });

  it('does not resolve invisible results, but reports missing references for visible results', async () => {
    await criarDestinoPersonalizado(env.DB, env.GEO_TEST, 'Zz Primeiro', 1);
    await env.DB.prepare(
      `INSERT INTO destinos_personalizados (id, nome, nome_normalizado, referencia_geonames_id)
       VALUES (?, ?, ?, ?)`
    )
      .bind(crypto.randomUUID(), 'Zz Segundo', 'zz segundo', 999)
      .run();
    const result = await buscarDestinos(env.DB, env.GEO_TEST, 'zz', 'pt', 1);
    expect(result.items.map((item) => item.nome)).toEqual(['Zz Primeiro']);
    expect(result.podeHaverMais).toBe(true);
    const amplo = await buscarDestinos(env.DB, env.GEO_TEST, 'zz', 'pt', 2);
    expect(amplo.items.map((item) => item.nome)).toEqual(['Zz Primeiro', 'Zz Segundo']);
    expect(amplo.podeHaverMais).toBe(false);
    expect(amplo.items[1]).toMatchObject({
      referencia_indisponivel: true,
      label: 'Zz Segundo (referência geográfica indisponível)',
      referencia: { regiao: null, pais: '', codigo_pais: '' }
    });
    expect(await obterDestino(env.DB, env.GEO_TEST, amplo.items[1].id, 'pt')).toEqual(
      amplo.items[1]
    );
    expect(await resolverDestinoParaPersistencia(env.DB, env.GEO_TEST, amplo.items[1].id)).toEqual({
      cidade_id: amplo.items[1].id,
      cidade: 'Zz Segundo (referência geográfica indisponível)'
    });
  });

  it('derives persisted IDs and labels from the selected destination, not caller text', async () => {
    const local = await criarDestinoPersonalizado(env.DB, env.GEO_TEST, 'Praia Segura', 1);
    expect(await resolverDestinoParaPersistencia(env.DB, env.GEO_TEST, 'geonames:1')).toEqual({
      cidade_id: 'geonames:1',
      cidade: 'Ipojuca, Pernambuco, BR'
    });
    expect(await resolverDestinoParaPersistencia(env.DB, env.GEO_TEST, 'geonames:3')).toEqual({
      cidade_id: 'geonames:3',
      cidade: 'Ipojuca, XX'
    });
    expect(
      await resolverDestinoParaPersistencia(
        env.DB,
        env.GEO_TEST,
        `personalizado:${local.id.toUpperCase()}`
      )
    ).toEqual({
      cidade_id: `personalizado:${local.id}`,
      cidade: 'Praia Segura, Ipojuca, Pernambuco, BR'
    });
    await expect(
      resolverDestinoParaPersistencia(env.DB, env.GEO_TEST, 'geonames:01')
    ).rejects.toBeInstanceOf(IdentidadeDestinoInvalida);
    await expect(
      resolverDestinoParaPersistencia(env.DB, env.GEO_TEST, 'geonames:999')
    ).rejects.toThrow('não encontrado');
    await expect(
      resolverDestinoParaPersistencia(env.DB, env.GEO_TEST, `personalizado:${crypto.randomUUID()}`)
    ).rejects.toThrow('não encontrado');
  });

  it('creates stable internal city references only for validated destinations', async () => {
    const first = await obterOuCriarCidadeGeografica(env.DB, env.GEO_TEST, 'geonames:1');
    expect(first).toMatchObject({
      nome: 'Ipojuca, Pernambuco, BR',
      destino_geografico_id: 'geonames:1'
    });
    const parallel = await Promise.all(
      Array.from({ length: 3 }, () =>
        obterOuCriarCidadeGeografica(env.DB, env.GEO_TEST, 'geonames:1')
      )
    );
    expect(parallel.every((city) => city.id === first.id)).toBe(true);
    const homonym = await obterOuCriarCidadeGeografica(env.DB, env.GEO_TEST, 'geonames:3');
    expect(homonym.id).not.toBe(first.id);
    expect(homonym.nome).toBe('Ipojuca, XX');
    const local = await criarDestinoPersonalizado(env.DB, env.GEO_TEST, 'Praia Interna', 1);
    const custom = await obterOuCriarCidadeGeografica(
      env.DB,
      env.GEO_TEST,
      `personalizado:${local.id.toUpperCase()}`
    );
    expect(custom).toMatchObject({
      nome: 'Praia Interna, Ipojuca, Pernambuco, BR',
      destino_geografico_id: `personalizado:${local.id}`
    });
    await expect(
      obterOuCriarCidadeGeografica(env.DB, env.GEO_TEST, 'geonames:999')
    ).rejects.toThrow('não encontrado');
    expect(
      await env.DB.prepare(
        'SELECT count(*) AS total FROM legado_cidades WHERE destino_geografico_id = ?'
      )
        .bind('geonames:1')
        .first()
    ).toEqual({ total: 1 });
  });

  it('acompanha a alteração do nome GeoNames sem trocar a identidade', async () => {
    await env.GEO_TEST.prepare("UPDATE place SET name = 'Ipojuca Alterada' WHERE id = 1").run();
    try {
      expect(await obterDestino(env.DB, env.GEO_TEST, 'geonames:1', 'pt')).toMatchObject({
        id: 'geonames:1',
        nome: 'Ipojuca Alterada',
        origem: 'geonames'
      });
    } finally {
      await env.GEO_TEST.prepare("UPDATE place SET name = 'Ipojuca' WHERE id = 1").run();
    }
  });
});
