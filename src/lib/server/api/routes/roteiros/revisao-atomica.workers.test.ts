/// <reference types="@cloudflare/vitest-pool-workers" />
import { applyD1Migrations, env } from 'cloudflare:test';
import { beforeAll, expect, it } from 'vitest';
import { SalvamentoRoteiroAtomico } from './salvar-completo-atomico';

beforeAll(async () => {
  await applyD1Migrations(env.DB, env.TEST_MIGRATIONS);
});

it('cria roteiro com revisão própria e grava os filhos na mesma transação', async () => {
  const id = crypto.randomUUID();
  const salvamento = new SalvamentoRoteiroAtomico(env.DB, id, { userId: 'owner' }, '');
  salvamento.principal({ nome: 'Viagem', created_by: 'owner', opcionais: [] }, true);
  salvamento.inserir('roteiro_pagamento', [{ servico: 'Pagamento' }]);
  const resultado = await salvamento.executar();
  expect(resultado.atualizado).toBe(true);
  expect(resultado.revisao).toMatch(/^[a-f0-9-]{36}$/);
  expect(
    await env.DB.prepare('SELECT revisao FROM legado_roteiro_personalizado WHERE id = ?')
      .bind(id)
      .first()
  ).toEqual({ revisao: resultado.revisao });
  expect(
    await env.DB.prepare('SELECT servico FROM legado_roteiro_pagamento WHERE roteiro_id = ?')
      .bind(id)
      .first()
  ).toEqual({ servico: 'Pagamento' });
});

it('não altera filhos se o roteiro não está no escopo autorizado', async () => {
  const id = crypto.randomUUID();
  await env.DB.batch([
    env.DB.prepare(
      "INSERT INTO legado_roteiro_personalizado (id, created_by, nome, opcionais) VALUES (?, 'other', 'Original', '[]')"
    ).bind(id),
    env.DB.prepare(
      "INSERT INTO legado_roteiro_pagamento (id, roteiro_id, servico) VALUES (?, ?, 'Original')"
    ).bind(crypto.randomUUID(), id)
  ]);
  const salvamento = new SalvamentoRoteiroAtomico(env.DB, id, { userId: 'owner' }, '');
  salvamento.principal({ nome: 'Alterado' }, false);
  salvamento.excluir('roteiro_pagamento');
  salvamento.inserir('roteiro_pagamento', [{ servico: 'Novo' }]);
  expect(await salvamento.executar()).toEqual({ atualizado: false, revisao: null });
  expect(
    await env.DB.prepare('SELECT nome, revisao FROM legado_roteiro_personalizado WHERE id = ?')
      .bind(id)
      .first()
  ).toEqual({ nome: 'Original', revisao: '' });
  expect(
    (
      await env.DB.prepare('SELECT servico FROM legado_roteiro_pagamento WHERE roteiro_id = ?')
        .bind(id)
        .all()
    ).results
  ).toEqual([{ servico: 'Original' }]);
});

it('permite apenas uma gravação com a mesma revisão e preserva os filhos vencedores', async () => {
  const id = crypto.randomUUID();
  await env.DB.batch([
    env.DB.prepare(
      "INSERT INTO legado_roteiro_personalizado (id, created_by, nome, opcionais) VALUES (?, 'owner', 'Original', '[]')"
    ).bind(id),
    env.DB.prepare(
      "INSERT INTO legado_roteiro_pagamento (id, roteiro_id, servico) VALUES (?, ?, 'Original')"
    ).bind(crypto.randomUUID(), id)
  ]);
  const criar = (nome: string) => {
    const salvamento = new SalvamentoRoteiroAtomico(env.DB, id, { userId: 'owner' }, '');
    salvamento.principal({ nome }, false);
    salvamento.excluir('roteiro_pagamento');
    salvamento.inserir('roteiro_pagamento', [{ servico: nome }]);
    return salvamento.executar();
  };
  const resultados = await Promise.all([criar('Primeiro'), criar('Segundo')]);
  expect(resultados.filter((resultado) => resultado.atualizado)).toHaveLength(1);
  expect(resultados.filter((resultado) => !resultado.atualizado)).toEqual([
    { atualizado: false, revisao: null }
  ]);
  const ganhador = resultados.find((resultado) => resultado.atualizado);
  const roteiro = await env.DB.prepare(
    'SELECT nome, revisao FROM legado_roteiro_personalizado WHERE id = ?'
  )
    .bind(id)
    .first<{ nome: string; revisao: string }>();
  expect(roteiro?.revisao).toBe(ganhador?.revisao);
  expect(roteiro?.revisao).not.toBe('');
  expect(
    (
      await env.DB.prepare('SELECT servico FROM legado_roteiro_pagamento WHERE roteiro_id = ?')
        .bind(id)
        .all()
    ).results
  ).toEqual([{ servico: roteiro?.nome }]);
});

it('reverte a revisão, o roteiro e os filhos se um comando posterior falhar', async () => {
  const id = crypto.randomUUID();
  await env.DB.batch([
    env.DB.prepare(
      "INSERT INTO legado_roteiro_personalizado (id, created_by, nome, opcionais, revisao) VALUES (?, 'owner', 'Original', '[]', 'revisao-original')"
    ).bind(id),
    env.DB.prepare(
      "INSERT INTO legado_roteiro_pagamento (id, roteiro_id, servico) VALUES (?, ?, 'Original')"
    ).bind(crypto.randomUUID(), id),
    env.DB.prepare(
      "CREATE TRIGGER teste_revisao_falha BEFORE INSERT ON legado_roteiro_pagamento BEGIN SELECT RAISE(ABORT, 'falha de teste'); END"
    )
  ]);
  try {
    const salvamento = new SalvamentoRoteiroAtomico(
      env.DB,
      id,
      { userId: 'owner' },
      'revisao-original'
    );
    salvamento.principal({ nome: 'Alterado' }, false);
    salvamento.excluir('roteiro_pagamento');
    salvamento.inserir('roteiro_pagamento', [{ servico: 'Novo' }]);
    await expect(salvamento.executar()).rejects.toThrow('falha de teste');
    expect(
      await env.DB.prepare('SELECT nome, revisao FROM legado_roteiro_personalizado WHERE id = ?')
        .bind(id)
        .first()
    ).toEqual({ nome: 'Original', revisao: 'revisao-original' });
    expect(
      (
        await env.DB.prepare('SELECT servico FROM legado_roteiro_pagamento WHERE roteiro_id = ?')
          .bind(id)
          .all()
      ).results
    ).toEqual([{ servico: 'Original' }]);
  } finally {
    await env.DB.prepare('DROP TRIGGER teste_revisao_falha').run();
  }
});
