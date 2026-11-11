/// <reference types="@cloudflare/vitest-pool-workers" />
import { applyD1Migrations, env } from 'cloudflare:test';
import { beforeAll, describe, expect, it } from 'vitest';
import {
  buscarCidadesCadastro,
  cidadeCadastrada,
  prepararCidadesGeograficasRoteiro,
  validarCidadesRoteiro
} from './cidades-busca';

describe('cidades cadastradas para roteiros', () => {
  beforeAll(async () => {
    const migrations = (
      env as unknown as { TEST_MIGRATIONS: Parameters<typeof applyD1Migrations>[1] }
    ).TEST_MIGRATIONS;
    await applyD1Migrations(env.DB, migrations);
    await env.DB.batch([
      env.DB.prepare(
        'INSERT INTO legado_cidades (id, nome, estado_nome, pais_nome) VALUES (?, ?, ?, ?)'
      ).bind(crypto.randomUUID(), 'Roma', 'Lácio', 'Itália'),
      env.DB.prepare(
        'INSERT INTO legado_cidades (id, nome, estado_nome, pais_nome) VALUES (?, ?, ?, ?)'
      ).bind(crypto.randomUUID(), 'Roma', 'Texas', 'Estados Unidos')
    ]);
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

  it('busca nomes completos e distingue cidades homônimas', async () => {
    expect(await buscarCidadesCadastro(env.DB, 'Roma', 20)).toEqual([
      'Roma, Lácio, Itália',
      'Roma, Texas, Estados Unidos'
    ]);
    expect(await cidadeCadastrada(env.DB, 'Roma')).toBe(false);
    expect(await cidadeCadastrada(env.DB, 'Roma, Lácio, Itália')).toBe(true);
    expect(await cidadeCadastrada(env.DB, 'Roma, Lácio, Estados Unidos')).toBe(false);
  });

  it('inclui estado e país dos cadastros associados à subdivisão', async () => {
    const pais = crypto.randomUUID();
    const estado = crypto.randomUUID();
    await env.DB.batch([
      env.DB.prepare('INSERT INTO legado_paises (id, nome, codigo_iso) VALUES (?, ?, ?)').bind(
        pais,
        'Portugal',
        'PT'
      ),
      env.DB.prepare(
        'INSERT INTO legado_subdivisoes (id, pais_id, codigo_admin1, nome) VALUES (?, ?, ?, ?)'
      ).bind(estado, pais, 'LIS', 'Lisboa'),
      env.DB.prepare('INSERT INTO legado_cidades (id, nome, subdivisao_id) VALUES (?, ?, ?)').bind(
        crypto.randomUUID(),
        'Lisboa',
        estado
      )
    ]);
    expect(await buscarCidadesCadastro(env.DB, 'Lisboa', 20)).toContain('Lisboa, Lisboa, Portugal');
    expect(await cidadeCadastrada(env.DB, 'Lisboa, Lisboa, Portugal')).toBe(true);
    expect(await cidadeCadastrada(env.DB, 'Lisboa')).toBe(false);
  });

  it('valida cidades de todas as abas antes de salvar, inclusive valores antigos', async () => {
    expect(
      await validarCidadesRoteiro(env.DB, {
        dias: [{ cidade: 'Roma, Lácio, Itália' }],
        hoteis: [{ cidade: 'Roma, Texas, Estados Unidos' }],
        passeios: [{ cidade: 'Roma' }]
      })
    ).toContain('Passeios, item 1');
    expect(await validarCidadesRoteiro(env.DB, { opcionais: [{ cidade: 'Roma' }] })).toContain(
      'Opcionais, item 1'
    );
    expect(
      await validarCidadesRoteiro(env.DB, {
        dias: [{ cidade: 'Roma, Lácio, Itália' }],
        hoteis: [{ cidade: '' }],
        passeios: [{ cidade: null }]
      })
    ).toBeNull();
  });

  it('não aceita identidades geográficas antes da ativação e validação no servidor', async () => {
    expect(
      await validarCidadesRoteiro(env.DB, {
        opcionais: [{ cidade: 'Roma, Lácio, Itália', cidade_id: 'geonames:3169070' }]
      })
    ).toContain('ainda não está disponível');
  });

  it('prepara todas as abas por identidade e ignora rótulos enviados pelo cliente', async () => {
    const body = {
      nome: 'Viagem',
      dias: [{ cidade: 'Falso', cidade_id: 'geonames:1', descricao: 'Dia' }],
      hoteis: [{ cidade: 'Falso', cidade_id: 'geonames:2', hotel: 'Hotel' }],
      passeios: [{ cidade: 'Falso', cidade_id: 'geonames:1', passeio: 'Museu' }],
      opcionais: [
        { cidade: 'Falso', cidade_id: 'geonames:2', passeios: [{ nome: 'Tour', descricao: '' }] },
        { cidade: 'Roma, Lácio, Itália', passeios: [] }
      ]
    };
    const resultado = await prepararCidadesGeograficasRoteiro(env.DB, env.GEO_TEST, body);
    expect(resultado).toEqual({
      ok: true,
      body: {
        nome: 'Viagem',
        dias: [{ cidade: 'Roma, Italy', cidade_id: 'geonames:1', descricao: 'Dia' }],
        hoteis: [{ cidade: 'Rome, United States', cidade_id: 'geonames:2', hotel: 'Hotel' }],
        passeios: [{ cidade: 'Roma, Italy', cidade_id: 'geonames:1', passeio: 'Museu' }],
        opcionais: [
          {
            cidade: 'Rome, United States',
            cidade_id: 'geonames:2',
            passeios: [{ nome: 'Tour', descricao: '' }]
          },
          { cidade: 'Roma, Lácio, Itália', passeios: [] }
        ]
      }
    });
    expect(body.dias[0].cidade).toBe('Falso');
  });

  it('normaliza IDs personalizados e valida referências', async () => {
    const id = crypto.randomUUID();
    await env.DB.prepare(
      'INSERT INTO destinos_personalizados (id, nome, nome_normalizado, referencia_geonames_id) VALUES (?, ?, ?, ?)'
    )
      .bind(id, 'Bairro', 'bairro', 1)
      .run();
    expect(
      await prepararCidadesGeograficasRoteiro(env.DB, env.GEO_TEST, {
        dias: [{ cidade: '', cidade_id: `personalizado:${id.toUpperCase()}` }]
      })
    ).toEqual({
      ok: true,
      body: { dias: [{ cidade: 'Bairro, Roma, Italy', cidade_id: `personalizado:${id}` }] }
    });
  });

  it('rejeita ID inválido, ausente e base indisponível sem alterar os dados originais', async () => {
    const body = {
      dias: [{ cidade: 'Falso', cidade_id: 'geonames:1' }],
      hoteis: [{ cidade: 'Falso', cidade_id: 'geonames:999' }]
    };
    expect(await prepararCidadesGeograficasRoteiro(env.DB, env.GEO_TEST, body)).toMatchObject({
      ok: false,
      status: 400,
      error: expect.stringContaining('Hotéis, item 1')
    });
    expect(body.dias[0].cidade).toBe('Falso');
    expect(await prepararCidadesGeograficasRoteiro(env.DB, undefined, body)).toMatchObject({
      ok: false,
      status: 503
    });
    expect(
      await prepararCidadesGeograficasRoteiro(env.DB, env.GEO_TEST, {
        passeios: [{ cidade: 'Roma', cidade_id: 'geonames:01' }]
      })
    ).toMatchObject({ ok: false, status: 400, error: expect.stringContaining('Passeios, item 1') });
    expect(
      await prepararCidadesGeograficasRoteiro(env.DB, env.GEO_TEST, {
        dias: [{ cidade: 'Roma' }]
      })
    ).toMatchObject({
      ok: false,
      status: 400,
      error: expect.stringContaining('não é salvo só com o nome da cidade')
    });
  });
});
