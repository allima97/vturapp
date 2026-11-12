/// <reference types="@cloudflare/vitest-pool-workers" />
import { env } from 'cloudflare:test';
import { beforeAll, describe, expect, it } from 'vitest';
import {
  getGeoNamesPlace,
  getGeoNamesPlaces,
  labelGeoNamesPlace,
  labelGeoNamesPlaces,
  normalizeGeoName,
  searchGeoNames
} from './geonames';

describe('busca GeoNames', () => {
  beforeAll(async () => {
    await env.DB.batch([
      env.DB.prepare(
        "CREATE TABLE place (id INTEGER PRIMARY KEY, name TEXT NOT NULL, country_code TEXT NOT NULL, admin1 TEXT NOT NULL, admin2 TEXT NOT NULL, population INTEGER NOT NULL, feature_class TEXT NOT NULL, feature_code TEXT NOT NULL DEFAULT '')"
      ),
      env.DB.prepare(
        'CREATE TABLE search_name (place_id INTEGER NOT NULL, normalized TEXT NOT NULL, priority INTEGER NOT NULL, PRIMARY KEY (normalized, place_id)) WITHOUT ROWID'
      ),
      env.DB.prepare(
        'CREATE TABLE short_search (prefix TEXT NOT NULL, rank INTEGER NOT NULL, place_id INTEGER NOT NULL, PRIMARY KEY (prefix, rank)) WITHOUT ROWID'
      ),
      env.DB.prepare(
        'CREATE TABLE alternate_name (id INTEGER PRIMARY KEY, place_id INTEGER NOT NULL, language TEXT NOT NULL, name TEXT NOT NULL, preferred INTEGER NOT NULL, short INTEGER NOT NULL, colloquial INTEGER NOT NULL, historic INTEGER NOT NULL)'
      ),
      env.DB.prepare(
        "INSERT INTO place VALUES (1, 'Rome', 'IT', '07', 'RM', 2300000, 'P', 'PPLA')"
      ),
      env.DB.prepare("INSERT INTO place VALUES (2, 'Rome', 'US', 'GA', '', 37000, 'P', 'PPL')"),
      env.DB.prepare("INSERT INTO place VALUES (3, 'Lazio', 'IT', '07', '', 0, 'A', 'ADM1')"),
      env.DB.prepare(
        "INSERT INTO place VALUES (4, 'São Paulo', 'BR', '27', '', 12000000, 'P', 'PPL')"
      ),
      env.DB.prepare("INSERT INTO place VALUES (5, 'Italy', 'IT', '', '', 0, 'A', 'PCLI')"),
      env.DB.prepare(
        "INSERT INTO place VALUES (6, 'Romeland', 'US', 'GA', '', 9000000, 'P', 'PPL')"
      ),
      env.DB.prepare("INSERT INTO place VALUES (7, 'Par', 'GB', 'ENG', '', 1000, 'P', 'PPL')"),
      env.DB.prepare("INSERT INTO place VALUES (8, 'Paris', 'FR', '11', '', 2000000, 'P', 'PPL')"),
      env.DB.prepare(
        "INSERT INTO place VALUES (9, 'Porto de Galinhas', 'BR', '30', '2607208', 0, 'P', 'PPL')"
      ),
      env.DB.prepare(
        "INSERT INTO place VALUES (10, 'Ipojuca', 'BR', '30', '2607208', 0, 'A', 'ADM2')"
      ),
      env.DB.prepare("INSERT INTO place VALUES (11, 'Pernambuco', 'BR', '30', '', 0, 'A', 'ADM1')"),
      env.DB.prepare("INSERT INTO place VALUES (12, 'Brazil', 'BR', '', '', 0, 'A', 'PCLI')"),
      env.DB.prepare("INSERT INTO place VALUES (13, 'Roma', 'US', 'TX', '', 100000, 'P', 'PPL')"),
      env.DB.prepare(
        "INSERT INTO alternate_name VALUES (1,1,'pt','Roma',1,0,0,0),(2,3,'pt','Lácio',1,0,0,0),(3,5,'pt','Itália',1,0,0,0),(4,1,'en','Rome',1,0,0,0)"
      ),
      env.DB.prepare("INSERT INTO alternate_name VALUES (5,12,'pt','Brasil',1,0,0,0)"),
      env.DB.prepare(
        "INSERT INTO search_name VALUES (1, 'roma', 1), (1, 'rome', 0), (2, 'rome', 0), (3, 'roma', 2), (4, 'sao paulo', 0), (6, 'romeland', 0), (7, 'par', 0), (8, 'paris', 0), (9, 'porto de galinhas', 0), (13, 'roma', 0)"
      ),
      env.DB.prepare(
        "INSERT INTO short_search VALUES ('par', 0, 8), ('par', 1, 7), ('pari', 0, 8), ('sa', 0, 4), ('sao', 0, 4)"
      )
    ]);
  });

  it('distinguishes homonyms and ignores administrative regions', async () => {
    expect(await searchGeoNames(env.DB, 'Rome')).toEqual([
      expect.objectContaining({ id: 1, countryCode: 'IT', admin1: '07' }),
      expect.objectContaining({ id: 2, countryCode: 'US', admin1: 'GA' }),
      expect.objectContaining({ id: 6, countryCode: 'US', admin1: 'GA' })
    ]);
    expect((await searchGeoNames(env.DB, 'Roma')).map((place) => place.id)).toEqual([1, 13]);
  });

  it('normalizes accents and spaces and applies a result limit', async () => {
    expect(normalizeGeoName('  SÃO   Paulo ')).toBe('sao paulo');
    expect(normalizeGeoName('दिल्ली')).toBe('दलल');
    expect((await searchGeoNames(env.DB, 'SÃO   Pa')).map((place) => place.id)).toEqual([4]);
    expect(await searchGeoNames(env.DB, 'Rome', 1)).toHaveLength(1);
    expect((await searchGeoNames(env.DB, 'par', 1))[0].id).toBe(8);
    expect((await searchGeoNames(env.DB, 'pari', 1))[0].id).toBe(8);
    expect(await searchGeoNames(env.DB, 'R')).toEqual([]);
    await expect(searchGeoNames(env.DB, 'Roma', 0)).rejects.toThrow('Limite');
  });

  it('formats translated city, region and country with stable identity', async () => {
    const [rome] = await searchGeoNames(env.DB, 'Roma');
    expect(await labelGeoNamesPlace(env.DB, rome, 'pt-BR')).toMatchObject({
      id: 1,
      label: 'Roma, Lácio, Itália',
      districtName: null,
      regionName: 'Lácio',
      countryName: 'Itália'
    });
    expect(await labelGeoNamesPlace(env.DB, rome, 'en-US')).toMatchObject({
      id: 1,
      label: 'Rome, Lácio, Itália'
    });
    expect(await labelGeoNamesPlace(env.DB, rome, 'es')).toMatchObject({
      id: 1,
      label: 'Roma, Lácio, Itália'
    });
    await expect(labelGeoNamesPlace(env.DB, rome, 'invalid-language')).rejects.toThrow('Idioma');
    const [porto] = await searchGeoNames(env.DB, 'porto de galinhas');
    expect(await labelGeoNamesPlace(env.DB, porto, 'pt-BR')).toMatchObject({
      id: 9,
      label: 'Porto de Galinhas, Ipojuca, Pernambuco, Brasil',
      districtName: 'Ipojuca',
      regionName: 'Pernambuco',
      countryName: 'Brasil'
    });
    const texas = (await searchGeoNames(env.DB, 'Roma'))[1];
    expect(await labelGeoNamesPlace(env.DB, texas, 'pt')).toMatchObject({
      regionName: null,
      districtName: null,
      countryName: 'US'
    });
  });

  it('supports exact short names, country filters and pagination without cache truncation', async () => {
    expect(
      (await searchGeoNames(env.DB, 'par', 8, { exact: true })).map((place) => place.id)
    ).toEqual([7]);
    expect(
      (await searchGeoNames(env.DB, 'Rome', 8, { countryCode: 'us' })).map((place) => place.id)
    ).toEqual([2, 6]);
    expect(
      (await searchGeoNames(env.DB, 'Rome', 1, { offset: 1 })).map((place) => place.id)
    ).toEqual([2]);
    await expect(searchGeoNames(env.DB, 'par', 8, { countryCode: 'FR' })).rejects.toThrow('exata');
    await expect(searchGeoNames(env.DB, 'Rome', 8, { offset: -1 })).rejects.toThrow('Deslocamento');
  });

  it('formats multiple destinations together without changing labels or order', async () => {
    const rome = (await searchGeoNames(env.DB, 'Roma'))[0];
    const porto = (await searchGeoNames(env.DB, 'porto de galinhas'))[0];
    const expected = await Promise.all(
      [porto, rome, porto].map((place) => labelGeoNamesPlace(env.DB, place, 'pt'))
    );
    expect(await labelGeoNamesPlaces(env.DB, [porto, rome, porto], 'pt')).toEqual(expected);
    expect(await labelGeoNamesPlaces(env.DB, [], 'pt')).toEqual([]);
    await expect(labelGeoNamesPlaces(env.DB, [rome], '!')).rejects.toThrow('Idioma');
    await expect(labelGeoNamesPlaces(env.DB, Array(21).fill(rome), 'pt')).rejects.toThrow(
      'Quantidade'
    );
    expect((await getGeoNamesPlaces(env.DB, [1, 1, 3, 999])).map((p) => p.id)).toEqual([1]);
    await expect(getGeoNamesPlaces(env.DB, [0])).rejects.toThrow('ID');
    await expect(labelGeoNamesPlaces(env.DB, [{ ...rome, id: 999 }], 'pt')).rejects.toThrow(
      'não está disponível'
    );
  });

  it('handles the maximum batch with distinct administrative labels', async () => {
    const statements = Array.from({ length: 20 }, (_, index) => {
      const base = 1000 + index * 4;
      const country = `T${index}`;
      return [
        env.DB.prepare("INSERT INTO place VALUES (?, ?, ?, '01', '02', 1, 'P', 'PPL')").bind(
          base,
          `Cidade ${index}`,
          country
        ),
        env.DB.prepare("INSERT INTO place VALUES (?, ?, ?, '01', '02', 0, 'A', 'ADM2')").bind(
          base + 1,
          `Município ${index}`,
          country
        ),
        env.DB.prepare("INSERT INTO place VALUES (?, ?, ?, '01', '', 0, 'A', 'ADM1')").bind(
          base + 2,
          `Região ${index}`,
          country
        ),
        env.DB.prepare("INSERT INTO place VALUES (?, ?, ?, '', '', 0, 'A', 'PCLI')").bind(
          base + 3,
          `País ${index}`,
          country
        )
      ];
    }).flat();
    await env.DB.batch(statements);
    const ids = Array.from({ length: 20 }, (_, index) => 1000 + index * 4);
    const places = await getGeoNamesPlaces(env.DB, ids);
    const labels = await labelGeoNamesPlaces(env.DB, places, 'pt');
    expect(labels).toHaveLength(20);
    expect(labels[0].label).toBe('Cidade 0, Município 0, Região 0, País 0');
    expect(labels[19].label).toBe('Cidade 19, Município 19, Região 19, País 19');
  });

  it('uses the bounded prefix index for short suggestions', async () => {
    const plan = await env.DB.prepare(
      'EXPLAIN QUERY PLAN SELECT p.id FROM short_search s JOIN place p ON p.id = s.place_id WHERE s.prefix = ? ORDER BY s.rank LIMIT ?'
    )
      .bind('par', 8)
      .all<{ detail: string }>();
    expect(plan.results.some((row) => row.detail.includes('SEARCH s USING PRIMARY KEY'))).toBe(
      true
    );
    expect(plan.results.some((row) => row.detail.includes('SCAN s'))).toBe(false);
  });

  it('resolves and validates stable locality IDs', async () => {
    expect(await getGeoNamesPlace(env.DB, 1)).toMatchObject({ name: 'Rome', countryCode: 'IT' });
    expect(await getGeoNamesPlace(env.DB, 3)).toBeNull();
    expect(await getGeoNamesPlace(env.DB, 999)).toBeNull();
    await expect(getGeoNamesPlace(env.DB, -1)).rejects.toThrow('ID GeoNames');
  });
});
