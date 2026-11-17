/// <reference types="@cloudflare/vitest-pool-workers" />
import { applyD1Migrations, env } from 'cloudflare:test';
import { expect, it, vi } from 'vitest';
import { createDataClient } from './query';
import { prepararCidadeFornecedor } from '$lib/server/fornecedorCidadeGeografica';

const state = vi.hoisted(() => ({
  client: null as ReturnType<typeof createDataClient> | null,
  companyId: ''
}));
vi.mock('$lib/server/v1', async (original) => ({
  ...(await original<typeof import('$lib/server/v1')>()),
  getAdminClient: () => state.client,
  requireAuthenticatedUser: async () => ({ id: 'owner' }),
  resolveUserScope: async () => ({ userId: 'owner', companyId: state.companyId, isAdmin: false }),
  resolveScopedCompanyIds: () => [state.companyId],
  ensureModuloAccess: () => undefined,
  isUuid: (value: string) => /^[0-9a-f-]{36}$/i.test(value)
}));
import { handleFornecedoresIdGet, handleFornecedoresIdPut } from '../api/routes/fornecedores/id';

it('preserva cadastro existente e não exige a coluna enquanto a flag está desligada', async () => {
  const migration = env.TEST_MIGRATIONS.find((item) => item.name.startsWith('0023_'));
  if (!migration) throw new Error('Migração 0023 não encontrada.');
  await applyD1Migrations(
    env.DB,
    env.TEST_MIGRATIONS.filter((item) => !item.name.startsWith('0023_'))
  );
  const company = crypto.randomUUID();
  const fornecedor = crypto.randomUUID();
  await env.DB.batch([
    env.DB.prepare(
      "INSERT INTO legado_companies (id, nome_empresa, nome_fantasia, cnpj) VALUES (?, 'Empresa', 'Empresa', '123')"
    ).bind(company),
    env.DB.prepare(
      "INSERT INTO legado_fornecedores (id, company_id, localizacao, nome_completo, tipo_faturamento, cidade, estado) VALUES (?, ?, 'brasil', 'Fornecedor', 'pre_pago', 'Recife', 'PE')"
    ).bind(fornecedor, company)
  ]);
  const client = createDataClient({
    db: env.DB,
    r2: env.R2,
    secret: 'segredo-de-teste-com-32-caracteres',
    origin: 'https://vtur.app',
    headers: new Headers()
  });
  state.client = client;
  state.companyId = company;
  const url = new URL(`https://vtur.app/api/v1/fornecedores/${fornecedor}`);
  const payload = {
    nome_completo: 'Fornecedor',
    nome_fantasia: 'Fantasia',
    localizacao: 'exterior',
    cidade: 'Recife',
    estado: 'PE',
    telefone: '1',
    whatsapp: '2',
    telefone_emergencia: '3',
    responsavel: 'Contato',
    principais_servicos: 'Passeios'
  };
  const makeEvent = (method: string, body?: unknown) =>
    ({
      url,
      params: { id: fornecedor },
      request: new Request(url, {
        method,
        headers: { origin: 'https://vtur.app', 'content-type': 'application/json' },
        body: body === undefined ? undefined : JSON.stringify(body)
      }),
      platform: { env: { DB: env.DB } }
    }) as Parameters<typeof handleFornecedoresIdPut>[0];
  expect((await handleFornecedoresIdGet(makeEvent('GET'))).status).toBe(200);
  expect((await handleFornecedoresIdPut(makeEvent('PUT', payload))).status).toBe(200);
  expect(
    (
      await handleFornecedoresIdPut(
        makeEvent('PUT', { ...payload, cidade_geografica_id: 'geonames:1' })
      )
    ).status
  ).toBe(400);
  const before = await client.from('fornecedores').select('*').eq('id', fornecedor).single();
  expect(before.error).toBeNull();
  expect(before.data).toMatchObject({ cidade: 'Recife', estado: 'PE' });
  expect(before.data).not.toHaveProperty('cidade_geografica_id');
  expect(
    await prepararCidadeFornecedor(
      { cidade_geografica_id: 'geonames:1' },
      null,
      env.DB,
      env.GEO_TEST
    )
  ).toMatchObject({ ok: false, status: 400 });
  await applyD1Migrations(env.DB, [migration]);
  expect(
    await env.DB.prepare(
      'SELECT cidade, estado, cidade_geografica_id FROM legado_fornecedores WHERE id = ?'
    )
      .bind(fornecedor)
      .first()
  ).toEqual({ cidade: 'Recife', estado: 'PE', cidade_geografica_id: null });
  expect((await env.DB.prepare('PRAGMA foreign_key_check').all()).results).toEqual([]);
});
