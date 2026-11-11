/// <reference types="@cloudflare/vitest-pool-workers" />
import { applyD1Migrations, env } from 'cloudflare:test';
import { expect, it } from 'vitest';

it('preserva acompanhantes e vínculos de viagem e permite clientes sem empresa', async () => {
  const migration = env.TEST_MIGRATIONS.find((item) =>
    item.name.startsWith('0026_acompanhantes_empresa_opcional')
  );
  if (!migration) throw new Error('Migração 0026 não encontrada.');
  await applyD1Migrations(
    env.DB,
    env.TEST_MIGRATIONS.filter((item) => item.name < '0026_')
  );
  const company = crypto.randomUUID();
  const user = crypto.randomUUID();
  const cliente = crypto.randomUUID();
  const acompanhante = crypto.randomUUID();
  const viagem = crypto.randomUUID();
  const vinculo = crypto.randomUUID();
  await env.DB.batch([
    env.DB.prepare(
      'INSERT INTO legado_companies (id, nome_empresa, nome_fantasia, cnpj) VALUES (?, ?, ?, ?)'
    ).bind(company, 'Empresa', 'Empresa', '12345678901234'),
    env.DB.prepare('INSERT INTO legado_users (id, email) VALUES (?, ?)').bind(user, 'a@test.com'),
    env.DB.prepare(
      'INSERT INTO legado_clientes (id, nome, company_id, created_by) VALUES (?, ?, ?, ?)'
    ).bind(cliente, 'Cliente', company, user),
    env.DB.prepare(
      'INSERT INTO legado_cliente_acompanhantes (id, cliente_id, company_id, nome_completo, created_by, ativo) VALUES (?, ?, ?, ?, ?, 1)'
    ).bind(acompanhante, cliente, company, 'Acompanhante', user),
    env.DB.prepare(
      'INSERT INTO legado_viagens (id, company_id, cliente_id, status) VALUES (?, ?, ?, ?)'
    ).bind(viagem, company, cliente, 'planejada'),
    env.DB.prepare(
      'INSERT INTO legado_viagem_acompanhantes (id, viagem_id, acompanhante_id, company_id, papel) VALUES (?, ?, ?, ?, ?)'
    ).bind(vinculo, viagem, acompanhante, company, 'Passageiro')
  ]);
  await applyD1Migrations(env.DB, [migration]);
  expect(
    await env.DB.prepare(
      'SELECT cliente_id, company_id, nome_completo FROM legado_cliente_acompanhantes WHERE id = ?'
    )
      .bind(acompanhante)
      .first()
  ).toEqual({ cliente_id: cliente, company_id: company, nome_completo: 'Acompanhante' });
  expect(
    await env.DB.prepare(
      'SELECT viagem_id, acompanhante_id, company_id, papel FROM legado_viagem_acompanhantes WHERE id = ?'
    )
      .bind(vinculo)
      .first()
  ).toEqual({
    viagem_id: viagem,
    acompanhante_id: acompanhante,
    company_id: company,
    papel: 'Passageiro'
  });
  await env.DB.prepare(
    'INSERT INTO legado_cliente_acompanhantes (id, cliente_id, company_id, nome_completo) VALUES (?, ?, NULL, ?)'
  )
    .bind(crypto.randomUUID(), cliente, 'Sem empresa')
    .run();
  expect((await env.DB.prepare('PRAGMA foreign_key_check').all()).results).toEqual([]);
  expect(
    (
      await env.DB.prepare("PRAGMA index_list('legado_viagem_acompanhantes')").all<{
        name: string;
      }>()
    ).results.some((item) => item.name === 'legado_idx_viagem_acompanhantes_viagem')
  ).toBe(true);
  await env.DB.prepare('DELETE FROM legado_cliente_acompanhantes WHERE id = ?')
    .bind(acompanhante)
    .run();
  expect(
    await env.DB.prepare('SELECT id FROM legado_viagem_acompanhantes WHERE id = ?')
      .bind(vinculo)
      .first()
  ).toBeNull();
});
