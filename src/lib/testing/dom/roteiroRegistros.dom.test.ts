import { afterEach, expect, it, vi } from 'vitest';
import { flushSync, mount, unmount } from 'svelte';

const mocks = vi.hoisted(() => ({
  fetch: vi.fn(),
  post: vi.fn(),
  salvar: vi.fn(),
  error: vi.fn()
}));
vi.mock('$app/stores', async () => {
  const { readable } = await import('svelte/store');
  return {
    page: readable({
      params: { id: 'roteiro-1' },
      url: new URL('https://vtur.app/orcamentos/roteiros/roteiro-1')
    })
  };
});
vi.mock('$app/navigation', () => ({ goto: vi.fn() }));
vi.mock('$lib/config/destinosGeograficos', async (original) => ({
  ...(await original<typeof import('$lib/config/destinosGeograficos')>()),
  revisaoRoteiroAtiva: true,
  roteiroGeograficoAtivo: true
}));
vi.mock('$lib/services/session', () => ({ ensureServerSessionCookie: vi.fn() }));
vi.mock('$lib/services/api', async (original) => ({
  ...(await original<typeof import('$lib/services/api')>()),
  apiFetch: mocks.fetch,
  apiPost: mocks.post
}));
vi.mock('$lib/features/roteiros/salvarComConfirmacao', () => ({
  salvarRoteiroComConfirmacao: mocks.salvar
}));
vi.mock('$lib/stores/ui', () => ({
  toast: { error: mocks.error, success: vi.fn(), warning: vi.fn() }
}));
vi.mock('$lib/security/url', async (original) => ({
  ...(await original<typeof import('$lib/security/url')>()),
  safeOpenNewTab: vi.fn(() => true)
}));
import Page from '../../../routes/(app)/orcamentos/roteiros/[id]/+page.svelte';

afterEach(() => {
  vi.restoreAllMocks();
  vi.resetAllMocks();
  vi.unstubAllGlobals();
  document.body.replaceChildren();
});

it('mantém ids de dias, hotéis e passeios entre salvamentos e renova na duplicação', async () => {
  const dia = crypto.randomUUID();
  const hotel = crypto.randomUUID();
  const passeio = crypto.randomUUID();
  mocks.fetch.mockImplementation(async (url: string) => {
    if (url === '/api/v1/roteiros/roteiro-1')
      return {
        roteiro: {
          nome: 'Viagem',
          revisao: '',
          dias: [
            {
              id: dia,
              ordem: 0,
              cidade: 'Roma',
              cidade_id: 'geonames:1',
              cidade_modo_geografico: false,
              descricao: 'Chegada'
            }
          ],
          hoteis: [
            { id: hotel, ordem: 0, cidade: 'Roma', cidade_id: 'geonames:1', hotel: 'Centro' }
          ],
          passeios: [
            { id: passeio, ordem: 0, cidade: 'Roma', cidade_id: 'geonames:1', passeio: 'Fórum' }
          ],
          opcionais: []
        }
      };
    return {};
  });
  mocks.salvar.mockResolvedValueOnce({ revisao: 'primeira' }).mockResolvedValueOnce({
    revisao: 'segunda'
  });
  mocks.post.mockResolvedValue({ id: 'copia' });
  vi.spyOn(window, 'confirm').mockReturnValue(true);
  const target = document.createElement('div');
  document.body.appendChild(target);
  const app = mount(Page, { target });
  await vi.waitFor(() => expect(target.querySelector('#rot-dur')).toBeTruthy());
  const button = (text: string) =>
    [...target.querySelectorAll('button')].find((item) => item.textContent?.includes(text))!;
  button('Salvar roteiro').click();
  await vi.waitFor(() => expect(mocks.salvar).toHaveBeenCalledTimes(1));
  const primeira = mocks.salvar.mock.calls[0][0];
  const ids = (campo: 'dias' | 'hoteis' | 'passeios') =>
    primeira[campo].map((item: { id: string }) => item.id);
  expect(ids('dias')).toEqual([dia]);
  expect(ids('hoteis')).toEqual([hotel]);
  expect(ids('passeios')).toEqual([passeio]);
  await vi.waitFor(() => expect(button('Salvar roteiro').disabled).toBe(false));
  button('Salvar roteiro').click();
  await vi.waitFor(() => expect(mocks.salvar).toHaveBeenCalledTimes(2));
  expect(mocks.salvar.mock.calls[1][0]).toMatchObject({
    revisao: 'primeira',
    dias: [{ id: dia }],
    hoteis: [{ id: hotel }],
    passeios: [{ id: passeio }]
  });
  await vi.waitFor(() => expect(button('Duplicar roteiro').disabled).toBe(false));
  button('Duplicar roteiro').click();
  await vi.waitFor(() => expect(mocks.post).toHaveBeenCalled());
  const copia = mocks.post.mock.calls[0][1];
  for (const campo of ['dias', 'hoteis', 'passeios'] as const) {
    const novos = copia[campo].map((item: { id: string }) => item.id);
    expect(novos).toHaveLength(ids(campo).length);
    expect(novos.some((id: string) => ids(campo).includes(id))).toBe(false);
  }
  expect(mocks.error).not.toHaveBeenCalled();
  await unmount(app);
});

it('salva hotéis com cidades confirmadas depois de adicionar outra linha', async () => {
  mocks.fetch.mockImplementation(async (url: string) => {
    if (url === '/api/v1/roteiros/roteiro-1')
      return { roteiro: { nome: 'Viagem', revisao: '', dias: [], hoteis: [], passeios: [] } };
    if (url.includes('/destinos-geograficos/busca'))
      return {
        items: [{ id: 'geonames:1', nome: 'Roma', label: 'Roma, Itália', origem: 'geonames' }],
        podeHaverMais: false
      };
    if (url.includes('/destinos-geograficos/detalhes')) return new Promise(() => {});
    return {};
  });
  mocks.salvar.mockResolvedValue({ revisao: 'nova' });
  const target = document.createElement('div');
  document.body.appendChild(target);
  const app = mount(Page, { target });
  await vi.waitFor(() => expect(target.querySelector('#rot-dur')).toBeTruthy());
  const button = (text: string) =>
    [...target.querySelectorAll('button')].find((item) => item.textContent?.includes(text))!;
  button('Hotéis').click();
  flushSync();
  button('Adicionar hotel').click();
  flushSync();
  const input = target.querySelector<HTMLInputElement>('#hotel-cidade-0')!;
  input.value = 'Roma';
  input.dispatchEvent(new Event('input', { bubbles: true }));
  await vi.waitFor(() => expect(button('Roma, Itália')).toBeTruthy());
  button('Roma, Itália').click();
  flushSync();
  button('Adicionar hotel').click();
  flushSync();
  button('Salvar roteiro').click();
  await vi.waitFor(() => expect(mocks.salvar).toHaveBeenCalledTimes(1));
  expect(mocks.salvar.mock.calls[0][0].hoteis[0]).toMatchObject({
    cidade: 'Roma, Itália',
    cidade_id: 'geonames:1'
  });
  expect(mocks.error).not.toHaveBeenCalled();
  await unmount(app);
});

it('permite salvar hotel após sair do itinerário durante validação de cidade salva', async () => {
  mocks.fetch.mockImplementation(async (url: string) => {
    if (url === '/api/v1/roteiros/roteiro-1')
      return {
        roteiro: {
          nome: 'Viagem',
          revisao: '',
          dias: [{ ordem: 0, cidade: 'Barcelona, Espanha', cidade_id: 'geonames:2' }],
          hoteis: [],
          passeios: []
        }
      };
    if (url.includes('/destinos-geograficos/busca'))
      return {
        items: [{ id: 'geonames:1', nome: 'Roma', label: 'Roma, Itália', origem: 'geonames' }],
        podeHaverMais: false
      };
    if (url.includes('/destinos-geograficos/detalhes')) return new Promise(() => {});
    return {};
  });
  mocks.salvar.mockResolvedValue({ revisao: 'nova' });
  const target = document.createElement('div');
  document.body.appendChild(target);
  const app = mount(Page, { target });
  await vi.waitFor(() => expect(target.querySelector('#rot-dur')).toBeTruthy());
  const button = (text: string) =>
    [...target.querySelectorAll('button')].find((item) => item.textContent?.includes(text))!;
  button('Hotéis').click();
  flushSync();
  button('Adicionar hotel').click();
  flushSync();
  const input = target.querySelector<HTMLInputElement>('#hotel-cidade-0')!;
  input.value = 'Roma';
  input.dispatchEvent(new Event('input', { bubbles: true }));
  await vi.waitFor(() => expect(button('Roma, Itália')).toBeTruthy());
  button('Roma, Itália').click();
  flushSync();
  button('Salvar roteiro').click();
  await vi.waitFor(() => expect(mocks.salvar).toHaveBeenCalledTimes(1));
  expect(mocks.salvar.mock.calls[0][0]).toMatchObject({
    dias: [{ cidade_id: 'geonames:2' }],
    hoteis: [{ cidade_id: 'geonames:1' }]
  });
  await unmount(app);
});

it('abre a aba e o dia com cidade não confirmada e permite corrigir antes de salvar', async () => {
  mocks.fetch.mockImplementation(async (url: string) => {
    if (url === '/api/v1/roteiros/roteiro-1')
      return { roteiro: { nome: 'Viagem', revisao: '', dias: [], hoteis: [], passeios: [] } };
    if (url.includes('/destinos-geograficos/busca'))
      return {
        items: [{ id: 'geonames:1', nome: 'Roma', label: 'Roma, Itália', origem: 'geonames' }],
        podeHaverMais: false
      };
    return {};
  });
  mocks.salvar.mockResolvedValue({ revisao: 'nova' });
  const target = document.createElement('div');
  document.body.appendChild(target);
  const app = mount(Page, { target });
  await vi.waitFor(() => expect(target.querySelector('#rot-dur')).toBeTruthy());
  const button = (text: string) =>
    [...target.querySelectorAll('button')].find((item) => item.textContent?.includes(text))!;
  button('Adicionar dia').click();
  flushSync();
  let input = target.querySelector<HTMLInputElement>('#dia-cidade-0')!;
  input.value = 'Roma';
  input.dispatchEvent(new Event('input', { bubbles: true }));
  flushSync();
  button('Hotéis').click();
  flushSync();
  const confirmar = vi.spyOn(window, 'confirm');
  button('Duplicar roteiro').click();
  expect(mocks.post).not.toHaveBeenCalled();
  expect(confirmar).not.toHaveBeenCalled();
  expect(mocks.error).toHaveBeenCalledWith(
    'Confirme a cidade em Itinerário, item 1, antes de continuar.'
  );
  button('Hotéis').click();
  flushSync();
  button('Salvar roteiro').click();
  await vi.waitFor(() =>
    expect(mocks.error).toHaveBeenCalledWith(
      'Confirme a cidade em Itinerário, item 1, antes de continuar.'
    )
  );
  expect(mocks.salvar).not.toHaveBeenCalled();
  input = target.querySelector<HTMLInputElement>('#dia-cidade-0')!;
  await vi.waitFor(() => {
    expect(input.closest('details')?.open).toBe(true);
    expect(document.activeElement).toBe(input);
  });
  input.dispatchEvent(new Event('input', { bubbles: true }));
  await vi.waitFor(() => expect(button('Roma, Itália')).toBeTruthy());
  button('Roma, Itália').click();
  flushSync();
  button('Salvar roteiro').click();
  await vi.waitFor(() => expect(mocks.salvar).toHaveBeenCalledTimes(1));
  expect(mocks.salvar.mock.calls[0][0].dias[0].cidade_id).toBe('geonames:1');
  await unmount(app);
});

it('mostra nomes curtos no PDF sem juntar cidades homônimas nem alterar os dados salvos', async () => {
  const barcelona = 'Barcelona, Província de Barcelona, Catalunha, Espanha';
  mocks.fetch.mockImplementation(async (url: string) => {
    if (url === '/api/v1/roteiros/roteiro-1')
      return {
        roteiro: {
          nome: 'Viagem',
          revisao: '',
          dias: [{ ordem: 0, cidade: barcelona, percurso: 'Roma - Barcelona' }],
          hoteis: [
            { ordem: 0, cidade: barcelona, hotel: 'Hotel Barcelona' },
            {
              ordem: 1,
              cidade: 'Madrid, Provincia de Madrid, Comunidade de Madrid, Espanha',
              hotel: 'Hotel Madrid'
            },
            { ordem: 2, cidade: 'Paris, Ilha de França, França', hotel: 'Hotel Paris' },
            {
              ordem: 3,
              cidade: 'Roma, Città metropolitana di Roma Capitale, Lácio, Itália',
              hotel: 'Hotel Roma'
            },
            { ordem: 4, cidade: 'Paris, Texas, Estados Unidos', hotel: 'Hotel Texas' }
          ],
          passeios: [{ ordem: 0, cidade: barcelona, passeio: 'Sagrada Família' }],
          opcionais: [
            { cidade: 'Roma, Lácio, Itália', passeios: [{ nome: 'Fórum', descricao: 'Visita' }] }
          ]
        }
      };
    return {};
  });
  mocks.salvar.mockResolvedValue({ revisao: 'nova' });
  let blob: Blob | undefined;
  vi.stubGlobal(
    'URL',
    class extends URL {
      static createObjectURL(value: Blob) {
        blob = value;
        return 'blob:https://vtur.app/preview';
      }
      static revokeObjectURL() {}
    }
  );
  const target = document.createElement('div');
  document.body.appendChild(target);
  const app = mount(Page, { target });
  await vi.waitFor(() => expect(target.querySelector('#rot-dur')).toBeTruthy());
  const button = (text: string) =>
    [...target.querySelectorAll('button')].find((item) => item.textContent?.includes(text))!;
  button('Visualizar PDF').click();
  await vi.waitFor(() => expect(blob).toBeDefined());
  const html = await new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result));
    reader.onerror = () => reject(reader.error);
    reader.readAsText(blob!);
  });
  const preview = new DOMParser().parseFromString(html, 'text/html');
  const hotels = preview.querySelector('.preview-hotels-section')!;
  expect([...hotels.querySelectorAll('.preview-group-title')].map((el) => el.textContent)).toEqual([
    'Barcelona',
    'Madrid',
    'Paris',
    'Roma',
    'Paris'
  ]);
  expect([...hotels.querySelectorAll('.preview-group-block')].map((el) => el.textContent)).toEqual(
    expect.arrayContaining([
      expect.stringContaining('Hotel Paris'),
      expect.stringContaining('Hotel Texas')
    ])
  );
  expect(preview.querySelector('.preview-passeios-section .preview-group-title')?.textContent).toBe(
    'Barcelona'
  );
  expect([...preview.querySelectorAll('h3')].map((el) => el.textContent)).toContain('Roma');
  expect(html).toContain('<h3>Dia 1 - Roma - Barcelona</h3>');
  expect(html).not.toContain(barcelona);
  button('Salvar roteiro').click();
  await vi.waitFor(() => expect(mocks.salvar).toHaveBeenCalledTimes(1));
  expect(mocks.salvar.mock.calls[0][0].hoteis[0].cidade).toBe(barcelona);
  expect(mocks.salvar.mock.calls[0][0].opcionais[0].cidade).toBe('Roma, Lácio, Itália');
  await unmount(app);
});
