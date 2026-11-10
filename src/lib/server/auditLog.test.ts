import { beforeEach, describe, expect, it, vi } from 'vitest';

const inserts: Array<{ table: string; row: Record<string, unknown> }> = [];
let failInsert = false;

vi.mock('$lib/server/v1', () => ({
  getAdminClient: () => ({
    from: (table: string) => ({
      insert: async (row: Record<string, unknown>) => {
        inserts.push({ table, row });
        return failInsert ? { error: new Error('falhou') } : { error: null };
      }
    })
  }),
  logServerError: vi.fn()
}));

import { registrarLog } from './auditLog';

function fakeEvent(headers: Record<string, string> = {}) {
  const tasks: Promise<unknown>[] = [];
  return {
    request: new Request('https://vturapp.test/api/v1/vendas/create', { headers }),
    getClientAddress: () => '10.0.0.1',
    platform: { ctx: { waitUntil: (p: Promise<unknown>) => tasks.push(p) } },
    tasks
  };
}

beforeEach(() => {
  inserts.length = 0;
  failInsert = false;
});

describe('registrarLog', () => {
  it('grava em logs no mesmo formato do vturapp original', async () => {
    const ev = fakeEvent({ 'cf-connecting-ip': '200.1.2.3', 'user-agent': 'Mozilla/5.0 teste' });
    registrarLog(ev, {
      userId: 'u1',
      modulo: 'Vendas',
      acao: 'venda_cancelada',
      detalhes: { id: 'v1' }
    });
    await Promise.all(ev.tasks);
    expect(inserts).toEqual([
      {
        table: 'logs',
        row: {
          user_id: 'u1',
          modulo: 'Vendas',
          acao: 'venda_cancelada',
          detalhes: { id: 'v1' },
          ip: '200.1.2.3',
          user_agent: 'Mozilla/5.0 teste'
        }
      }
    ]);
  });

  it('sem cf-connecting-ip usa o IP do runtime', async () => {
    const ev = fakeEvent();
    registrarLog(ev, { userId: null, modulo: 'Vendas', acao: 'recibo_excluido' });
    await Promise.all(ev.tasks);
    expect(inserts[0].row.ip).toBe('10.0.0.1');
    expect(inserts[0].row.user_agent).toBeNull();
  });

  it('falha ao gravar NUNCA quebra a operação', async () => {
    failInsert = true;
    const ev = fakeEvent();
    expect(() =>
      registrarLog(ev, { userId: 'u1', modulo: 'Vendas', acao: 'venda_criada', detalhes: {} })
    ).not.toThrow();
    await expect(Promise.all(ev.tasks)).resolves.toBeDefined();
  });
});

describe('registrarLog com detalhes montados em background (Fase 3.10)', () => {
  it('aceita função assíncrona e grava o resultado', async () => {
    const ev = fakeEvent();
    registrarLog(ev, {
      userId: 'u1',
      modulo: 'Admin',
      acao: 'modulos_globais_atualizados',
      detalhes: async () => ({ disabled_modules: ['crm'] })
    });
    await Promise.all(ev.tasks);
    expect(inserts).toHaveLength(1);
    expect(inserts[0].row).toMatchObject({
      modulo: 'Admin',
      acao: 'modulos_globais_atualizados',
      detalhes: { disabled_modules: ['crm'] }
    });
  });

  it('se a função falhar, não lança erro e não grava', async () => {
    const ev = fakeEvent();
    expect(() =>
      registrarLog(ev, {
        userId: 'u1',
        modulo: 'Escalas',
        acao: 'escala_dia_salva',
        detalhes: async () => {
          throw new Error('banco fora');
        }
      })
    ).not.toThrow();
    await Promise.all(ev.tasks);
    expect(inserts).toHaveLength(0);
  });
});
