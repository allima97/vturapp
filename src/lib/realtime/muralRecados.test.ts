import { describe, expect, it, vi } from 'vitest';
import { assinarRecadosDaEmpresa } from './muralRecados';

function fakeClient() {
  const handlers: Array<(p: unknown) => void> = [];
  const canal: any = {
    filtros: [] as unknown[],
    on(tipo: string, filtro: unknown, cb: (p: unknown) => void) {
      canal.filtros.push([tipo, filtro]);
      handlers.push(cb);
      return canal;
    },
    subscribe(cb: (s: string) => void) {
      cb('SUBSCRIBED');
      return canal;
    }
  };
  const client = { channel: vi.fn(() => canal), removeChannel: vi.fn(async () => 'ok') };
  return { client, canal, disparar: () => handlers.forEach((h) => h({})) };
}

describe('recados em tempo real', () => {
  it('escuta só os recados da empresa e agrupa mudanças seguidas numa busca', async () => {
    vi.useFakeTimers();
    const { client, canal, disparar } = fakeClient();
    const onMudanca = vi.fn();
    const onStatus = vi.fn();
    const parar = assinarRecadosDaEmpresa(client as any, 'emp-1', onMudanca, onStatus);
    expect(canal.filtros).toEqual([
      [
        'postgres_changes',
        { event: '*', schema: 'public', table: 'mural_recados', filter: 'company_id=eq.emp-1' }
      ]
    ]);
    expect(onStatus).toHaveBeenCalledWith('SUBSCRIBED');
    disparar();
    disparar();
    disparar();
    vi.advanceTimersByTime(299);
    expect(onMudanca).not.toHaveBeenCalled();
    vi.advanceTimersByTime(1);
    expect(onMudanca).toHaveBeenCalledTimes(1);
    parar();
    expect(client.removeChannel).toHaveBeenCalledWith(canal);
    vi.useRealTimers();
  });

  it('sem cliente, sem empresa ou sem suporte a canal: não faz nada', () => {
    expect(() => assinarRecadosDaEmpresa(null, 'x', () => {})()).not.toThrow();
    const { client } = fakeClient();
    assinarRecadosDaEmpresa(client as any, '', () => {})();
    expect(client.channel).not.toHaveBeenCalled();
    expect(() => assinarRecadosDaEmpresa({} as any, 'x', () => {})()).not.toThrow();
  });
});
