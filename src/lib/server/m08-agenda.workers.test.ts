/**
 * Suíte Y — M08: Agenda e tarefas (Workers / D1 real)
 *
 * Empresa dedicada: EMPRESA_Y = 23.
 * Testa criação, edição, conclusão, listagem e validações.
 */

import { describe, it, expect, beforeAll, vi } from 'vitest';
import { env } from 'cloudflare:test';
import { applyD1Migrations } from 'cloudflare:test';

vi.mock('$lib/brand', () => ({ default: '' }));

import { getDb } from '$lib/server/db/client';
import {
  criarEvento,
  editarEvento,
  excluirItem,
  listarEventos,
  obterItem,
  criarTarefa,
  editarTarefa,
  concluirTarefa,
  listarTarefas,
  AgendaError,
} from '$lib/server/agenda-m08/service';

const EMPRESA_Y = 23;
const USER_Y1 = 'user-y1';
const USER_Y2 = 'user-y2';

describe('Suíte Y — M08: Agenda e tarefas', () => {
  let db: ReturnType<typeof getDb>;

  beforeAll(async () => {
    const MIGRATIONS = (env as unknown as Record<string, unknown>).TEST_MIGRATIONS as Parameters<
      typeof applyD1Migrations
    >[1];
    await applyD1Migrations(env.DB, MIGRATIONS);
    db = getDb(env.DB);

    await db.run(
      `INSERT OR IGNORE INTO empresas (id, nome, cnpj, criado_em, atualizado_em)
       VALUES (${EMPRESA_Y}, 'Empresa Y', NULL, '2026-01-01', '2026-01-01')`
    );
    for (const uid of [USER_Y1, USER_Y2]) {
      await db.run(
        `INSERT OR IGNORE INTO user (id, name, email, email_verified, created_at, updated_at)
         VALUES ('${uid}', 'User ${uid}', '${uid}@test.com', 1, 1735689600, 1735689600)`
      );
    }
  });

  // ── Eventos ────────────────────────────────────────────────────────────────

  it('Y1. criarEvento — retorna item com tipo=evento e allDay=true', async () => {
    const item = await criarEvento(db, EMPRESA_Y, USER_Y1, {
      titulo: 'Reunião de equipe',
      startDate: '2026-03-10',
    });
    expect(item.id).toBeGreaterThan(0);
    expect(item.tipo).toBe('evento');
    expect(item.titulo).toBe('Reunião de equipe');
    expect(item.startDate).toBe('2026-03-10');
    expect(item.endDate).toBe('2026-03-10'); // default = startDate
    expect(item.allDay).toBe(true);
  });

  it('Y2. criarEvento com horário — allDay=false', async () => {
    const item = await criarEvento(db, EMPRESA_Y, USER_Y1, {
      titulo: 'Check-in aeroporto',
      startDate: '2026-03-15',
      endDate: '2026-03-15',
      startAt: '08:00',
      endAt: '10:00',
      allDay: false,
    });
    expect(item.allDay).toBe(false);
    expect(item.startAt).toBe('08:00');
    expect(item.endAt).toBe('10:00');
  });

  it('Y3. editarEvento — atualiza titulo; preserva endDate', async () => {
    const original = await criarEvento(db, EMPRESA_Y, USER_Y1, {
      titulo: 'Evento antigo',
      startDate: '2026-04-01',
    });
    const atualizado = await editarEvento(db, EMPRESA_Y, original.id, {
      titulo: 'Evento atualizado',
    });
    expect(atualizado.titulo).toBe('Evento atualizado');
    expect(atualizado.endDate).toBe('2026-04-01');
  });

  it('Y4. listarEventos — filtra por range de datas', async () => {
    // Cria eventos dentro do range e fora dele para validar o filtro
    await criarEvento(db, EMPRESA_Y, USER_Y1, { titulo: 'Reunião mar', startDate: '2026-03-10' });
    await criarEvento(db, EMPRESA_Y, USER_Y1, { titulo: 'Check-in mar', startDate: '2026-03-15' });
    await criarEvento(db, EMPRESA_Y, USER_Y2, { titulo: 'Evento de maio', startDate: '2026-05-20' });
    const jan = await listarEventos(db, EMPRESA_Y, { inicio: '2026-03-01', fim: '2026-03-31' });
    expect(jan.some((e) => e.startDate?.startsWith('2026-03'))).toBe(true);
    expect(jan.every((e) => (e.startDate ?? '') >= '2026-03-01')).toBe(true);
    expect(jan.every((e) => (e.startDate ?? '') <= '2026-03-31')).toBe(true);
  });

  it('Y5. listarEventos — filtra por userId (isolamento de visualizador)', async () => {
    const apenas_y1 = await listarEventos(db, EMPRESA_Y, { userId: USER_Y1 });
    expect(apenas_y1.every((e) => e.userId === USER_Y1)).toBe(true);
  });

  it('Y6. excluirItem — evento removido; obterItem lança NAO_ENCONTRADO', async () => {
    const item = await criarEvento(db, EMPRESA_Y, USER_Y1, {
      titulo: 'Para excluir',
      startDate: '2026-06-01',
    });
    await excluirItem(db, EMPRESA_Y, item.id);
    await expect(obterItem(db, EMPRESA_Y, item.id)).rejects.toThrow(AgendaError);
  });

  // ── Tarefas ────────────────────────────────────────────────────────────────

  it('Y7. criarTarefa — status=pendente, prioridade=normal por default', async () => {
    const tarefa = await criarTarefa(db, EMPRESA_Y, USER_Y1, {
      titulo: 'Enviar proposta',
    });
    expect(tarefa.tipo).toBe('tarefa');
    expect(tarefa.status).toBe('pendente');
    expect(tarefa.prioridade).toBe('normal');
    expect(tarefa.done).toBe(false);
  });

  it('Y8. criarTarefa com vencimento e prioridade', async () => {
    const tarefa = await criarTarefa(db, EMPRESA_Y, USER_Y1, {
      titulo: 'Pagamento urgente',
      vencimento: '2026-03-31',
      prioridade: 'urgente',
    });
    expect(tarefa.vencimento).toBe('2026-03-31');
    expect(tarefa.prioridade).toBe('urgente');
  });

  it('Y9. editarTarefa — atualiza status', async () => {
    const tarefa = await criarTarefa(db, EMPRESA_Y, USER_Y2, {
      titulo: 'Tarefa em progresso',
    });
    const atualizada = await editarTarefa(db, EMPRESA_Y, tarefa.id, {
      status: 'em_andamento',
    });
    expect(atualizada.status).toBe('em_andamento');
  });

  it('Y10. concluirTarefa — done=true, status=concluida', async () => {
    const tarefa = await criarTarefa(db, EMPRESA_Y, USER_Y1, {
      titulo: 'Concluir relatório',
    });
    const concluida = await concluirTarefa(db, EMPRESA_Y, tarefa.id);
    expect(concluida.done).toBe(true);
    expect(concluida.status).toBe('concluida');
  });

  it('Y11. listarTarefas — exclui concluídas por padrão', async () => {
    const tarefa = await criarTarefa(db, EMPRESA_Y, USER_Y1, {
      titulo: 'Tarefa ativa para filtro',
    });
    // Cria e conclui outra
    const outra = await criarTarefa(db, EMPRESA_Y, USER_Y1, {
      titulo: 'Concluída para filtro',
    });
    await concluirTarefa(db, EMPRESA_Y, outra.id);

    const ativas = await listarTarefas(db, EMPRESA_Y, { userId: USER_Y1 });
    expect(ativas.some((t) => t.id === tarefa.id)).toBe(true);
    expect(ativas.some((t) => t.id === outra.id)).toBe(false);
  });

  it('Y12. listarTarefas com incluirConcluidas=true — retorna todas', async () => {
    // Cria e conclui uma tarefa dentro deste teste (storage isolado por teste)
    const tarefaAtiva = await criarTarefa(db, EMPRESA_Y, USER_Y1, { titulo: 'Tarefa ativa Y12' });
    const tarefaConclui = await criarTarefa(db, EMPRESA_Y, USER_Y1, { titulo: 'Concluída Y12' });
    await concluirTarefa(db, EMPRESA_Y, tarefaConclui.id);

    const todas = await listarTarefas(db, EMPRESA_Y, { userId: USER_Y1, incluirConcluidas: true });
    const haConcluida = todas.some((t) => t.status === 'concluida');
    expect(haConcluida).toBe(true);
    expect(todas.some((t) => t.id === tarefaAtiva.id)).toBe(true);
  });

  // ── Validações ─────────────────────────────────────────────────────────────

  it('Y13. criarEvento titulo vazio — VALIDACAO', async () => {
    await expect(
      criarEvento(db, EMPRESA_Y, USER_Y1, { titulo: '', startDate: '2026-01-01' })
    ).rejects.toThrow(AgendaError);
  });

  it('Y14. criarEvento data inválida — VALIDACAO', async () => {
    await expect(
      criarEvento(db, EMPRESA_Y, USER_Y1, { titulo: 'Teste', startDate: '01/01/2026' })
    ).rejects.toThrow(AgendaError);
  });

  it('Y15. criarTarefa prioridade inválida — VALIDACAO', async () => {
    await expect(
      criarTarefa(db, EMPRESA_Y, USER_Y1, { titulo: 'T', prioridade: 'critica' as never })
    ).rejects.toThrow(AgendaError);
  });
});
