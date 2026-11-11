import { afterEach, describe, expect, it, vi } from 'vitest';
import { getCachedReadModel, invalidateReadModelCache } from './readModelCache';

afterEach(() => {
  invalidateReadModelCache();
  vi.useRealTimers();
  vi.restoreAllMocks();
});

describe('cache de modelos de leitura', () => {
  it('não compartilha uma operação pendente entre requisições', async () => {
    let finishFirst!: (value: string) => void;
    const first = getCachedReadModel({
      key: 'relatorios',
      loader: () => new Promise<string>((resolve) => (finishFirst = resolve))
    });
    const second = getCachedReadModel({
      key: 'relatorios',
      loader: async () => 'segunda requisição'
    });
    const result = await Promise.race([
      second,
      new Promise<string>((resolve) => setTimeout(() => resolve('bloqueada'), 50))
    ]);
    expect(result).toBe('segunda requisição');
    finishFirst('primeira requisição');
    await first;
    expect(await getCachedReadModel({ key: 'relatorios', loader: async () => 'terceira' })).toBe(
      'segunda requisição'
    );
  });

  it('aguarda revalidação dentro da requisição e reutiliza seu resultado', async () => {
    vi.useFakeTimers();
    const loader = vi.fn().mockResolvedValueOnce('inicial').mockResolvedValueOnce('atualizado');
    const options = { key: 'relatorios', loader, ttlMs: 1_000, staleTtlMs: 10_000 };
    expect(await getCachedReadModel(options)).toBe('inicial');
    vi.advanceTimersByTime(1_001);
    expect(await getCachedReadModel(options)).toBe('atualizado');
    expect(await getCachedReadModel(options)).toBe('atualizado');
    expect(loader).toHaveBeenCalledTimes(2);
  });

  it('não reintroduz resultado após invalidação durante a consulta', async () => {
    let finish!: (value: string) => void;
    const pending = getCachedReadModel({
      key: 'relatorios',
      loader: () => new Promise<string>((resolve) => (finish = resolve))
    });
    invalidateReadModelCache();
    finish('antigo');
    expect(await pending).toBe('antigo');
    expect(await getCachedReadModel({ key: 'relatorios', loader: async () => 'novo' })).toBe(
      'novo'
    );
  });

  it('registra falha e usa o resultado anterior apenas na janela permitida', async () => {
    vi.useFakeTimers();
    const log = vi.spyOn(console, 'error').mockImplementation(() => {});
    const options = { key: 'relatorios', loader: vi.fn(), ttlMs: 1_000, staleTtlMs: 3_000 };
    options.loader.mockResolvedValueOnce('inicial');
    expect(await getCachedReadModel(options)).toBe('inicial');
    vi.advanceTimersByTime(1_001);
    options.loader.mockRejectedValueOnce(new Error('banco indisponível'));
    expect(await getCachedReadModel(options)).toBe('inicial');
    expect(log).toHaveBeenCalledOnce();
    vi.advanceTimersByTime(2_000);
    options.loader.mockRejectedValueOnce(new Error('banco indisponível'));
    await expect(getCachedReadModel(options)).rejects.toThrow('banco indisponível');
  });
});
