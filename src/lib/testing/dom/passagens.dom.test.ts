import { afterEach, expect, it, vi } from 'vitest';
import { flushSync, mount, unmount } from 'svelte';

const api = vi.hoisted(() => ({ fetch: vi.fn(), url: 'https://example.test/operacao/passagens' }));
vi.mock('$app/stores', () => ({
  page: {
    subscribe: (run: (value: { url: URL }) => void) => {
      run({ url: new URL(api.url) });
      return () => {};
    }
  }
}));
vi.mock('$lib/services/api', async (original) => ({
  ...(await original<typeof import('$lib/services/api')>()),
  apiFetch: api.fetch
}));
import Passagens from '../../../routes/(app)/operacao/passagens/+page.svelte';

function click(target: HTMLElement, label: string) {
  const found = [...target.querySelectorAll('button')].find(
    (item) => item.textContent?.trim() === label
  );
  if (!found) throw new Error(`Botão ${label} não encontrado`);
  found.click();
  flushSync();
}

afterEach(() => {
  api.fetch.mockReset();
  document.body.replaceChildren();
});

it('permite importar, revisar, salvar e abrir comprovante', async () => {
  api.fetch.mockImplementation(async (_path, options) =>
    options.method === 'POST' ? { id: '00000000-0000-4000-8000-000000000001' } : { items: [] }
  );
  const target = document.createElement('div');
  document.body.appendChild(target);
  const app = mount(Passagens, { target });
  await vi.waitFor(() => expect(target.textContent).toContain('Nenhuma passagem salva.'));
  click(target, 'Nova passagem');
  const text = target.querySelector<HTMLTextAreaElement>('#texto-reserva')!;
  text.value =
    'LOC: ABC123\nsegmentos\nCompanhia Exemplo XY 123 12/11/2026 - 15:00 12/11/2026 - 16:19 HK AAA - Aaa BBB - Bbb E90 01:19 W\npassageiros\nADT\tSOBRENOME EXEMPLO\tMARIA\tFeminino\tEmitida\nassentos\nSOBRENOME EXEMPLO/MARIA\t17D';
  text.dispatchEvent(new Event('input', { bubbles: true }));
  flushSync();
  click(target, 'Analisar texto');
  await vi.waitFor(() =>
    expect(target.querySelector<HTMLInputElement>('#passageiro-0')?.value).toBe(
      'SOBRENOME EXEMPLO, MARIA'
    )
  );
  const detalhes = target.querySelector<HTMLDetailsElement>('.trecho-editavel')!;
  expect(detalhes.open).toBe(false);
  detalhes.open = true;
  const origem = target.querySelector<HTMLInputElement>('#origem-0')!;
  origem.value = 'gru';
  origem.dispatchEvent(new Event('input', { bubbles: true }));
  const destino = target.querySelector<HTMLInputElement>('#destino-0')!;
  destino.value = 'lIs';
  destino.dispatchEvent(new Event('input', { bubbles: true }));
  flushSync();
  expect(origem.value).toBe('GRU');
  expect(destino.value).toBe('LIS');
  detalhes.open = false;
  detalhes.open = true;
  expect(origem.value).toBe('GRU');
  expect(target.querySelector<HTMLInputElement>('#assento-0-0')?.value).toBe('17D');
  const cidade = target.querySelector<HTMLInputElement>('#cidade-origem-0')!;
  cidade.value = 'Cidade Exemplo';
  cidade.dispatchEvent(new Event('input', { bubbles: true }));
  const duracao = target.querySelector<HTMLInputElement>('#duracao-0')!;
  duracao.value = '1019';
  duracao.dispatchEvent(new Event('input', { bubbles: true }));
  const tarifa = target.querySelector<HTMLInputElement>('#tarifa-0')!;
  tarifa.value = 'Personalizada';
  tarifa.dispatchEvent(new Event('input', { bubbles: true }));
  flushSync();
  expect(duracao.value).toBe('10:19');
  expect(
    [...target.querySelectorAll('#classe-0-list option')].map((e) => e.getAttribute('value'))
  ).toEqual(['Econômica', 'Econômica Premium', 'Executiva', 'Primeira Classe']);
  expect(
    [...target.querySelectorAll('#tarifa-0-list option')].map((e) => e.getAttribute('value'))
  ).toEqual(['Light', 'Standard', 'FULL', 'Classic']);
  click(target, 'Salvar passagem');
  await vi.waitFor(() =>
    expect(api.fetch).toHaveBeenCalledWith(
      '/api/v1/passagens',
      expect.objectContaining({
        method: 'POST',
        body: expect.objectContaining({
          localizador: 'ABC123',
          trechos: [
            expect.objectContaining({
              cidadeOrigem: 'Cidade Exemplo',
              origem: 'GRU',
              destino: 'LIS',
              duracao: '10:19',
              tarifa: 'Personalizada'
            })
          ],
          passageiros: [
            expect.objectContaining({ nome: 'SOBRENOME EXEMPLO, MARIA', assentos: ['17D'] })
          ]
        })
      })
    )
  );
  await vi.waitFor(() => expect(target.textContent).toContain('Gerar comprovante'));
  await unmount(app);
});

it('abre para edição a passagem indicada pelo comprovante', async () => {
  const id = '00000000-0000-4000-8000-000000000001';
  api.url = `https://example.test/operacao/passagens?editar=${id}`;
  api.fetch.mockImplementation(async (_path, options) =>
    options.query?.id
      ? { item: { id, localizador: 'ABC123', emissao: '', trechos: [], passageiros: [] } }
      : { items: [] }
  );
  const target = document.createElement('div');
  document.body.appendChild(target);
  const app = mount(Passagens, { target });
  await vi.waitFor(() =>
    expect(target.querySelector<HTMLInputElement>('#passagem-localizador')?.value).toBe('ABC123')
  );
  expect(target.textContent).toContain('Editar passagem');
  api.url = 'https://example.test/operacao/passagens';
  await unmount(app);
});

it('recolhe trechos novos e preserva os demais ao remover um trecho', async () => {
  api.fetch.mockResolvedValue({ items: [] });
  const target = document.createElement('div');
  document.body.appendChild(target);
  const app = mount(Passagens, { target });
  await vi.waitFor(() => expect(target.textContent).toContain('Nenhuma passagem salva.'));
  click(target, 'Nova passagem');
  click(target, 'Adicionar trecho');
  click(target, 'Adicionar trecho');
  const detalhes = target.querySelectorAll<HTMLDetailsElement>('.trecho-editavel');
  expect([...detalhes].map((item) => item.open)).toEqual([false, false]);
  detalhes[1].open = true;
  const origem = target.querySelector<HTMLInputElement>('#origem-1')!;
  origem.value = 'lis';
  origem.dispatchEvent(new Event('input', { bubbles: true }));
  flushSync();
  detalhes[0].open = true;
  const remover = [...detalhes[0].querySelectorAll('button')].find(
    (button) => button.textContent?.trim() === 'Remover trecho'
  )!;
  remover.click();
  flushSync();
  expect(target.querySelectorAll('.trecho-editavel')).toHaveLength(1);
  expect(target.querySelector<HTMLInputElement>('#origem-0')?.value).toBe('LIS');
  await unmount(app);
});

it('reordena os trechos preservando os assentos de cada passageiro', async () => {
  api.fetch.mockImplementation(async (_path, options) =>
    options.method === 'POST' ? { id: '00000000-0000-4000-8000-000000000001' } : { items: [] }
  );
  const target = document.createElement('div');
  document.body.appendChild(target);
  const app = mount(Passagens, { target });
  await vi.waitFor(() => expect(target.textContent).toContain('Nenhuma passagem salva.'));
  click(target, 'Nova passagem');
  click(target, 'Adicionar trecho');
  click(target, 'Adicionar trecho');
  click(target, 'Adicionar passageiro');
  for (const [selector, value] of [
    ['#origem-0', 'gru'],
    ['#origem-1', 'lis'],
    ['#assento-0-0', '12A'],
    ['#assento-0-1', '23B']
  ]) {
    const input = target.querySelector<HTMLInputElement>(selector)!;
    input.value = value;
    input.dispatchEvent(new Event('input', { bubbles: true }));
  }
  flushSync();
  const details = target.querySelectorAll<HTMLDetailsElement>('.trecho-editavel');
  details[0].open = true;
  expect(
    details[0].querySelector<HTMLButtonElement>('[aria-label="Mover trecho 1 para cima"]')?.disabled
  ).toBe(true);
  details[0].querySelector<HTMLButtonElement>('[aria-label="Mover trecho 1 para baixo"]')!.click();
  flushSync();
  expect(target.querySelector<HTMLInputElement>('#origem-0')?.value).toBe('LIS');
  expect(target.querySelector<HTMLInputElement>('#origem-1')?.value).toBe('GRU');
  expect(target.querySelector<HTMLInputElement>('#assento-0-0')?.value).toBe('23B');
  expect(target.querySelector<HTMLInputElement>('#assento-0-1')?.value).toBe('12A');
  expect(target.querySelectorAll<HTMLDetailsElement>('.trecho-editavel')[1].open).toBe(true);
  click(target, 'Salvar passagem');
  await vi.waitFor(() =>
    expect(api.fetch).toHaveBeenCalledWith(
      '/api/v1/passagens',
      expect.objectContaining({
        method: 'POST',
        body: expect.objectContaining({
          trechos: [
            expect.objectContaining({ origem: 'LIS' }),
            expect.objectContaining({ origem: 'GRU' })
          ],
          passageiros: [expect.objectContaining({ assentos: ['23B', '12A'] })]
        })
      })
    )
  );
  await unmount(app);
});
