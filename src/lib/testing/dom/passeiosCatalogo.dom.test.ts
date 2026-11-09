import { beforeEach, describe, expect, it, vi } from 'vitest';
import { flushSync, mount, unmount } from 'svelte';

const fetchCatalogo = vi.hoisted(() => vi.fn());
const fetchCidades = vi.hoisted(() => vi.fn());
vi.mock('$lib/services/api', () => ({
  apiFetch: fetchCatalogo,
  apiGet: fetchCidades
}));

import Harness from './harness/RoteiroServicosHarness.svelte';
import { newPasseio } from '../../../routes/(app)/orcamentos/roteiros/[id]/_components/tipos';

beforeEach(() => {
  vi.resetAllMocks();
  fetchCidades.mockResolvedValue([]);
});

describe('sugestões de passeios do catálogo', () => {
  it('consulta por ID e limpa a identidade ao alterar manualmente a cidade', async () => {
    fetchCatalogo.mockImplementation(async (_url, { query }) => ({
      items: query.cidade_id
        ? [{ id: '1', cidade: 'Roma', cidade_id: query.cidade_id, nome: 'Coliseu', descricao: '' }]
        : [],
      hasMore: false
    }));
    const target = document.createElement('div');
    let get: () => unknown = () => ({ passeios: [] });
    const app = mount(Harness, {
      target,
      props: {
        expose: (value) => {
          get = value;
        },
        passeiosIniciais: [{ ...newPasseio(0), cidade: 'Roma, Itália', cidade_id: 'geonames:1' }]
      }
    });
    flushSync();
    target.querySelectorAll('details')[1].querySelector('summary')!.click();
    await vi.waitFor(() =>
      expect(fetchCatalogo).toHaveBeenCalledWith(
        '/api/v1/opcionais',
        expect.objectContaining({ query: { cidade_id: 'geonames:1', pagina: 1 } })
      )
    );
    await vi.waitFor(() =>
      expect(target.querySelector('datalist option')?.getAttribute('value')).toBe('Coliseu')
    );
    const input = target.querySelectorAll<HTMLInputElement>('input[placeholder="Cidade"]')[1];
    input.value = 'Roma, Texas';
    input.dispatchEvent(new Event('input', { bubbles: true }));
    flushSync();
    expect(get()).toMatchObject({ passeios: [{ cidade_id: undefined }] });
    await unmount(app);
  });

  it('carrega todas as páginas do catálogo da cidade e mostra os nomes como sugestões', async () => {
    fetchCatalogo
      .mockResolvedValueOnce({
        items: [{ id: '1', cidade: 'Lisboa', nome: 'Belém', descricao: '' }],
        hasMore: true
      })
      .mockResolvedValueOnce({
        items: [{ id: '2', cidade: 'Lisboa', nome: 'Sintra', descricao: '' }],
        hasMore: false
      });

    const target = document.createElement('div');
    const app = mount(Harness, { target, props: { expose: () => {} } });
    flushSync();
    const passeios = [...target.querySelectorAll<HTMLDetailsElement>('details')];
    passeios[1].querySelector('summary')!.click();

    const cidade = target.querySelectorAll<HTMLInputElement>('input[placeholder="Cidade"]')[1];
    cidade.value = 'Lisboa';
    cidade.dispatchEvent(new Event('input', { bubbles: true }));
    flushSync();

    await vi.waitFor(() => expect(fetchCatalogo).toHaveBeenCalledTimes(2), { timeout: 2000 });
    expect(fetchCatalogo).toHaveBeenNthCalledWith(
      1,
      '/api/v1/opcionais',
      expect.objectContaining({
        query: { cidade: 'Lisboa', pagina: 1 },
        noCache: true
      })
    );
    expect(fetchCatalogo).toHaveBeenNthCalledWith(
      2,
      '/api/v1/opcionais',
      expect.objectContaining({
        query: { cidade: 'Lisboa', pagina: 2 },
        noCache: true
      })
    );

    await vi.waitFor(() => {
      expect(
        [...target.querySelectorAll<HTMLOptionElement>('datalist option')].map(
          (option) => option.value
        )
      ).toEqual(['Belém', 'Sintra']);
    });
    expect(target.textContent).not.toContain('Carregando sugestões da cidade...');
    await unmount(app);
  });

  it('exibe erro no campo quando não consegue carregar o catálogo', async () => {
    fetchCatalogo.mockRejectedValue(new Error('Catálogo indisponível'));

    const target = document.createElement('div');
    const app = mount(Harness, { target, props: { expose: () => {} } });
    flushSync();
    const passeios = [...target.querySelectorAll<HTMLDetailsElement>('details')];
    passeios[1].querySelector('summary')!.click();

    const cidade = target.querySelectorAll<HTMLInputElement>('input[placeholder="Cidade"]')[1];
    cidade.value = 'Lisboa';
    cidade.dispatchEvent(new Event('input', { bubbles: true }));
    flushSync();

    await vi.waitFor(() => expect(target.textContent).toContain('Catálogo indisponível'), {
      timeout: 2000
    });
    await unmount(app);
  });
});
