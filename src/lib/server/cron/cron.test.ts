/**
 * Suíte O — F5-02: Tarefas Agendadas / Idempotência
 *
 * Prova que:
 *  O1. handleScheduled despacha CRON_FIVE_MIN corretamente
 *  O2. handleScheduled despacha CRON_NIGHTLY corretamente
 *  O3. schedule desconhecido retorna handled=false (sem throw)
 *  O4. múltiplas invocações do mesmo cron não acumulam estado (idempotência)
 *  O5. handler não faz nenhuma escrita D1 (sem side effects nesta fase)
 *  O6. handler não envia e-mail/push (sem side effects nesta fase)
 *  O7. CRON_FIVE_MIN e CRON_NIGHTLY batem com wrangler.toml
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import {
  handleScheduled,
  CRON_FIVE_MIN,
  CRON_NIGHTLY,
  type ScheduledEnv,
} from './index';

// ── Mocks ─────────────────────────────────────────────────────────────────────

/** Cria um ScheduledEvent mínimo com o cron fornecido */
function makeEvent(cron: string): ScheduledEvent {
  return {
    cron,
    scheduledTime: Date.now(),
    noRetry: () => undefined,
    type: 'scheduled',
    waitUntil: () => undefined,
    passThroughOnException: () => undefined,
  } as unknown as ScheduledEvent;
}

/** Env mínimo — DB e KV não devem ser chamados nesta fase */
function makeEnv(): ScheduledEnv {
  return {
    DB: {
      prepare: vi.fn().mockReturnThis(),
      run: vi.fn(),
      first: vi.fn(),
      all: vi.fn(),
      exec: vi.fn(),
      batch: vi.fn(),
      dump: vi.fn(),
    } as unknown as D1Database,
    KV_BINDING: {
      get: vi.fn(),
      put: vi.fn(),
      delete: vi.fn(),
      list: vi.fn(),
      getWithMetadata: vi.fn(),
    } as unknown as KVNamespace,
  };
}

function makeCtx(): ExecutionContext {
  return {
    waitUntil: vi.fn(),
    passThroughOnException: vi.fn(),
  } as unknown as ExecutionContext;
}

// ── Suíte O ───────────────────────────────────────────────────────────────────

describe('Suíte O — F5-02: cron scheduled handler', () => {
  let consoleSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    consoleSpy = vi.spyOn(console, 'log').mockImplementation(() => undefined);
    vi.spyOn(console, 'warn').mockImplementation(() => undefined);
  });

  afterEach(() => {
    consoleSpy.mockRestore();
  });

  // O1 ──────────────────────────────────────────────────────────────────────
  it('O1. CRON_FIVE_MIN é despachado e retorna handled=true', async () => {
    const result = await handleScheduled(makeEvent(CRON_FIVE_MIN), makeEnv(), makeCtx());
    expect(result.schedule).toBe(CRON_FIVE_MIN);
    expect(result.handled).toBe(true);
    expect(result.note).toContain('ADR-007');
  });

  // O2 ──────────────────────────────────────────────────────────────────────
  it('O2. CRON_NIGHTLY é despachado e retorna handled=true', async () => {
    const result = await handleScheduled(makeEvent(CRON_NIGHTLY), makeEnv(), makeCtx());
    expect(result.schedule).toBe(CRON_NIGHTLY);
    expect(result.handled).toBe(true);
    expect(result.note).toContain('ADR-007');
  });

  // O3 ──────────────────────────────────────────────────────────────────────
  it('O3. schedule desconhecido retorna handled=false sem lançar erro', async () => {
    const result = await handleScheduled(makeEvent('0 0 * * 0'), makeEnv(), makeCtx());
    expect(result.handled).toBe(false);
    expect(result.note).toMatch(/não reconhecido/);
  });

  // O4 ──────────────────────────────────────────────────────────────────────
  it('O4. múltiplas invocações produzem o mesmo resultado (idempotência)', async () => {
    const env = makeEnv();
    const ctx = makeCtx();
    const r1 = await handleScheduled(makeEvent(CRON_FIVE_MIN), env, ctx);
    const r2 = await handleScheduled(makeEvent(CRON_FIVE_MIN), env, ctx);
    const r3 = await handleScheduled(makeEvent(CRON_FIVE_MIN), env, ctx);
    expect(r1).toEqual(r2);
    expect(r2).toEqual(r3);
  });

  // O5 ──────────────────────────────────────────────────────────────────────
  it('O5. nenhuma escrita D1 é executada (sem side effects esta fase)', async () => {
    const env = makeEnv();
    await handleScheduled(makeEvent(CRON_FIVE_MIN), env, makeCtx());
    await handleScheduled(makeEvent(CRON_NIGHTLY), env, makeCtx());
    expect(env.DB.prepare).not.toHaveBeenCalled();
    expect(env.DB.batch).not.toHaveBeenCalled();
    expect(env.DB.exec).not.toHaveBeenCalled();
  });

  // O6 ──────────────────────────────────────────────────────────────────────
  it('O6. nenhuma escrita KV é executada (sem push/notificação esta fase)', async () => {
    const env = makeEnv();
    await handleScheduled(makeEvent(CRON_FIVE_MIN), env, makeCtx());
    await handleScheduled(makeEvent(CRON_NIGHTLY), env, makeCtx());
    expect(env.KV_BINDING.put).not.toHaveBeenCalled();
    expect(env.KV_BINDING.delete).not.toHaveBeenCalled();
  });

  // O7 ──────────────────────────────────────────────────────────────────────
  it('O7. CRON_FIVE_MIN e CRON_NIGHTLY batem com wrangler.toml', () => {
    // Lidos do wrangler.toml: crons = ["*/5 * * * *", "7 6 * * *"]
    expect(CRON_FIVE_MIN).toBe('*/5 * * * *');
    expect(CRON_NIGHTLY).toBe('7 6 * * *');
  });
});
