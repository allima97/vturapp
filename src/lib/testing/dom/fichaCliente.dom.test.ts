/** Fase 5.4: ficha completa do cliente — viagens e contatos enviados (APIs existentes). */
import { afterEach, describe, expect, it, vi } from 'vitest';
import { flushSync, mount, unmount } from 'svelte';

const nav = vi.hoisted(() => ({ goto: vi.fn(async () => {}) }));
vi.mock('$app/navigation', () => ({ goto: nav.goto }));

import ClienteViagensCard from '$lib/components/clientes/ClienteViagensCard.svelte';
import ContatosHarness from './harness/ContatosHarness.svelte';

let app: ReturnType<typeof mount> | null = null;
let target: HTMLElement | null = null;

function responder(status: number, body: unknown) {
  const f = vi.fn(
    async (_url: string) =>
      new Response(JSON.stringify(body), {
        status,
        headers: { 'content-type': 'application/json' }
      })
  );
  vi.stubGlobal('fetch', f);
  return f;
}

function montar(C: any, props: Record<string, unknown>) {
  target = document.createElement('div');
  document.body.appendChild(target);
  app = mount(C, { target, props });
  flushSync();
}

afterEach(() => {
  if (app) unmount(app);
  target?.remove();
  app = null;
  vi.unstubAllGlobals();
  nav.goto.mockClear();
});

describe('ficha do cliente: viagens', () => {
  it('lista as viagens da API do cliente com link e status', async () => {
    const f = responder(200, {
      items: [
        {
          id: 'v1',
          destino: 'Lisboa',
          origem: 'São Paulo',
          data_inicio: '2026-10-01',
          data_fim: '2026-10-10',
          status: 'confirmada'
        },
        {
          id: 'v2',
          destino: 'Rio',
          origem: '',
          data_inicio: '2026-01-05',
          data_fim: null,
          status: 'concluida'
        }
      ]
    });
    montar(ClienteViagensCard, { clienteId: 'c1' });
    await vi.waitFor(() => expect(document.querySelectorAll('li a')).toHaveLength(2));
    expect(String(f.mock.calls[0][0])).toContain('/api/v1/viagens/cliente/c1');
    const links = [...document.querySelectorAll('li a')];
    expect(links[0].getAttribute('href')).toBe('/operacao/viagens/v1');
    expect(links[0].textContent).toContain('Confirmada');
    expect(links[1].textContent).toContain('Concluída');
  });

  it('sem acesso a Viagens (403): o quadro some e a tela NÃO vai para "acesso negado"', async () => {
    responder(403, { error: 'Sem acesso a Viagens.' });
    montar(ClienteViagensCard, { clienteId: 'c2' });
    await vi.waitFor(() => expect(document.body.textContent).not.toContain('Viagens'));
    expect(nav.goto).not.toHaveBeenCalled();
  });
});

describe('ficha do cliente: contatos enviados', () => {
  it('mostra canal e assunto; recarrega quando um aviso é enviado', async () => {
    const f = responder(200, {
      items: [
        {
          id: 'a1',
          canal: 'whatsapp',
          assunto: 'Aniversário',
          mensagem: 'Parabéns!',
          status: 'enviado',
          destinatario: '5511999',
          created_at: '2026-09-20T13:00:00Z'
        }
      ]
    });
    montar(ContatosHarness, {});
    await vi.waitFor(() => expect(document.body.textContent).toContain('WhatsApp · Aniversário'));
    expect(String(f.mock.calls[0][0])).toContain('/api/v1/clientes/avisos/history?cliente_id=c3');
    expect(f).toHaveBeenCalledTimes(1);
    document.getElementById('enviar-aviso')!.click();
    flushSync();
    await vi.waitFor(() => expect(f).toHaveBeenCalledTimes(2));
  });
});
