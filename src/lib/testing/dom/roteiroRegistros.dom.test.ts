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
  for (const id of ['rot-nome', 'rot-dur', 'rot-cidades-visitadas']) {
    expect(target.querySelector<HTMLInputElement>(`input#${id}`)).toBeNull();
    expect(target.querySelector(`#${id}`)).toBeTruthy();
  }
  const detailFieldset = target.querySelector<HTMLFieldSetElement>(
    'fieldset[aria-label="Dados detalhados do roteiro"]'
  )!;
  const detailControls = () => [
    ...detailFieldset.querySelectorAll('input, select, textarea, button')
  ];
  expect(detailFieldset.disabled).toBe(true);
  expect(detailControls().length).toBeGreaterThan(0);
  expect(detailControls().every((control) => control.matches(':disabled'))).toBe(true);
  expect(target.textContent).not.toContain('Incluir cabeçalho e rodapé no PDF');
  const actionCount = (label: string) =>
    [...target.querySelectorAll('button')].filter((item) => item.textContent?.includes(label))
      .length;
  expect(actionCount('Visualizar PDF')).toBe(1);
  expect(actionCount('Duplicar roteiro')).toBe(1);
  expect(actionCount('Salvar roteiro')).toBe(1);
  const button = (text: string) =>
    [...target.querySelectorAll('button')].find((item) => item.textContent?.includes(text))!;
  expect(actionCount('Editar')).toBe(1);
  button('Editar').click();
  flushSync();
  expect(detailFieldset.disabled).toBe(false);
  expect(detailControls().some((control) => !control.matches(':disabled'))).toBe(true);
  for (const id of ['rot-nome', 'rot-dur', 'rot-cidades-visitadas']) {
    expect(target.querySelector<HTMLInputElement>(`input#${id}`)?.readOnly).toBe(false);
  }
  button('Concluir edição').click();
  flushSync();
  expect(detailFieldset.disabled).toBe(true);
  for (const id of ['rot-nome', 'rot-dur', 'rot-cidades-visitadas']) {
    expect(target.querySelector<HTMLInputElement>(`input#${id}`)).toBeNull();
    expect(target.querySelector(`#${id}`)).toBeTruthy();
  }
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
  button('Editar').click();
  flushSync();
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
  button('Editar').click();
  flushSync();
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
  button('Editar').click();
  flushSync();
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
          dias: [
            { ordem: 0, cidade: barcelona, percurso: 'Roma - Barcelona', descricao: 'Chegada' },
            { ordem: 1, cidade: 'Paris', percurso: 'Barcelona - Paris', descricao: 'Passeio' }
          ],
          hoteis: [
            {
              ordem: 0,
              cidade: barcelona,
              hotel: 'Hotel Barcelona',
              data_inicio: '2027-01-02',
              data_fim: '2027-01-04',
              noites: 2,
              apto: 'Duplo',
              regime: 'Café',
              endereco: 'Rua Principal'
            },
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
            { ordem: 4, cidade: 'Paris, Texas, Estados Unidos', hotel: 'Hotel Texas' },
            { ordem: 5, cidade: barcelona, hotel: 'Outro Hotel' }
          ],
          passeios: [{ ordem: 0, cidade: barcelona, passeio: 'Sagrada Família' }],
          opcionais: [
            {
              cidade: 'Roma, Lácio, Itália',
              passeios: [
                { nome: 'Fórum', descricao: 'Visita' },
                { nome: 'Museu', descricao: 'Arte' }
              ]
            }
          ],
          transportes: [
            {
              ordem: 0,
              trecho: 'São Paulo - Roma',
              cia_aerea: 'LATAM',
              descricao: 'LA 123',
              aeroporto_saida: 'GRU',
              aeroporto_chegada: 'FCO',
              data_voo: '2027-01-02',
              data_fim: '2027-01-03',
              hora_saida: '23:30',
              hora_chegada: '14:00',
              duracao_voo: '11h30',
              classe_reserva: 'Econômica',
              tarifa_nome: 'Light'
            }
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
  expect([...hotels.querySelectorAll('.roteiro-card-city')].map((el) => el.textContent)).toEqual([
    'Barcelona',
    'Barcelona',
    'Madrid',
    'Paris',
    'Roma',
    'Paris'
  ]);
  expect([...hotels.querySelectorAll('.roteiro-card')].map((el) => el.textContent)).toEqual(
    expect.arrayContaining([
      expect.stringContaining('Hotel Paris'),
      expect.stringContaining('Hotel Texas')
    ])
  );
  const firstHotel = hotels.querySelector('.roteiro-card')!;
  for (const value of ['02-01-2027', '04-01-2027', '2', 'Duplo', 'Café', 'Rua Principal']) {
    expect(firstHotel.textContent).toContain(value);
  }
  expect(hotels.querySelectorAll('.roteiro-card')[1].textContent).toContain('Outro Hotel');
  expect(preview.querySelector('.preview-passeios-section .roteiro-card-city')?.textContent).toBe(
    'Barcelona'
  );
  expect(preview.querySelectorAll('.preview-itinerary-section .roteiro-card')).toHaveLength(2);
  expect(preview.querySelectorAll('.preview-optionals-section .roteiro-card')).toHaveLength(1);
  const optionalTitle = preview.querySelector('.preview-optionals-section h2')!;
  expect(optionalTitle.textContent).toContain('Passeios Opcionais');
  expect(optionalTitle.querySelector('.roteiro-print-subtitle')?.textContent).toBe(
    'Sugestões sem data marcada, não incluídas no valor do roteiro'
  );
  expect(preview.querySelector('.preview-optionals-section .roteiro-card-city')?.textContent).toBe(
    'Roma'
  );
  expect(preview.querySelector('.preview-optionals-section .roteiro-card')?.textContent).toContain(
    'Fórum'
  );
  expect(preview.querySelector('.preview-optionals-section .roteiro-card')?.textContent).toContain(
    'Museu'
  );
  const flight = preview.querySelector('.preview-airfare-section .roteiro-card')!;
  for (const value of [
    'São Paulo',
    'GRU',
    'Roma',
    'FCO',
    'LATAM',
    '02-01-2027',
    '03-01-2027',
    '23:30',
    '14:00',
    '11h30',
    'Econômica',
    'Light'
  ]) {
    expect(flight.textContent).toContain(value);
  }
  expect(flight.querySelector('.roteiro-flight-header span')?.textContent).toBe(
    'TRECHO 1 — sábado, 02 de janeiro de 2027'
  );
  const flightLabel = flight.querySelectorAll('.roteiro-flight-header > span')[1];
  expect(flightLabel.textContent).toBe('Voo  LA 123');
  const flightPlane = flightLabel.querySelector('svg[aria-hidden="true"] path')!;
  expect(flightPlane.getAttribute('transform')).toBe('rotate(-35 12 12)');
  const durationPlane = flight.querySelector(
    '.roteiro-flight-duration svg[aria-hidden="true"] path'
  )!;
  expect(durationPlane.getAttribute('d')).toBe(flightPlane.getAttribute('d'));
  expect(durationPlane.getAttribute('transform')).toBeNull();
  expect(flight.querySelector('.roteiro-flight-arrival-notice')?.textContent).toBe(
    'Chegada no dia seguinte (+1)'
  );
  expect(flight.querySelector('.roteiro-flight-details strong')?.textContent).toBe('LATAM');
  expect(flight.querySelectorAll('.roteiro-flight-place')).toHaveLength(2);
  for (const section of preview.querySelectorAll('.roteiro-print-section')) {
    expect(section.querySelector('thead h2')).toBeTruthy();
  }
  for (const section of [
    '.preview-itinerary-section',
    '.preview-hotels-section',
    '.preview-optionals-section'
  ]) {
    expect(preview.querySelector(`${section} h2 svg`)?.getAttribute('aria-hidden')).toBe('true');
  }
  const flightTitleIcon = preview.querySelector(
    '.preview-airfare-section h2 svg.roteiro-print-title-icon[aria-hidden="true"] path'
  );
  expect(flightTitleIcon?.outerHTML).toBe(flightPlane.outerHTML);
  expect(html).toContain('<h3>Dia 1 - Roma - Barcelona</h3>');
  expect(html).not.toContain(barcelona);
  button('Salvar roteiro').click();
  await vi.waitFor(() => expect(mocks.salvar).toHaveBeenCalledTimes(1));
  expect(mocks.salvar.mock.calls[0][0].hoteis[0].cidade).toBe(barcelona);
  expect(mocks.salvar.mock.calls[0][0].opcionais[0].cidade).toBe('Roma, Lácio, Itália');
  expect(mocks.salvar.mock.calls[0][0].transportes[0].data_fim).toBe('2027-01-03');
  expect(mocks.salvar.mock.calls[0][0].transportes[0].descricao).toBe('LA 123');
  await unmount(app);
});
