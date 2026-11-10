import { afterEach, describe, expect, it, vi } from 'vitest';
import { flushSync, mount, tick, unmount } from 'svelte';

const api = vi.hoisted(() => ({ get: vi.fn(), post: vi.fn(), fetch: vi.fn() }));
vi.mock('$lib/services/api', () => ({
  apiGet: api.get,
  apiPost: api.post,
  apiFetch: api.fetch
}));
import ImportarOpcionais from '../../../routes/(app)/cadastros/opcionais/ImportarOpcionais.svelte';

afterEach(() => {
  vi.useRealTimers();
  vi.clearAllMocks();
});

describe('prévia da importação', () => {
  it.each(['md', 'txt'])('carrega e analisa arquivo .%s', async (extensao) => {
    const target = document.createElement('div');
    const component = mount(ImportarOpcionais, { target, props: { onImported: vi.fn() } });
    flushSync();
    const input = target.querySelector<HTMLInputElement>('#arquivo-opcionais')!;
    const conteudo = '#### Passeio\n##### Descrição';
    Object.defineProperty(input, 'files', {
      configurable: true,
      value: [
        {
          name: `passeios.${extensao}`,
          size: new TextEncoder().encode(conteudo).length,
          arrayBuffer: async () => new TextEncoder().encode(conteudo).buffer
        }
      ]
    });
    input.dispatchEvent(new Event('change', { bubbles: true }));
    await tick();
    flushSync();
    expect(target.querySelector('textarea')?.value).toBe(conteudo);
    [...target.querySelectorAll('button')]
      .find((button) => button.textContent?.includes('Analisar e conferir'))!
      .click();
    flushSync();
    expect(target.textContent).toContain('Passeio');
    expect(target.textContent).toContain('Descrição');
    expect(api.post).not.toHaveBeenCalled();
    await unmount(component);
  });

  it('rejeita arquivo com extensão não suportada', async () => {
    const target = document.createElement('div');
    const component = mount(ImportarOpcionais, { target, props: { onImported: vi.fn() } });
    flushSync();
    const input = target.querySelector<HTMLInputElement>('#arquivo-opcionais')!;
    Object.defineProperty(input, 'files', {
      configurable: true,
      value: [{ name: 'passeios.pdf', size: 10 }]
    });
    input.dispatchEvent(new Event('change', { bubbles: true }));
    await tick();
    flushSync();
    expect(target.querySelector('[role="alert"]')?.textContent).toContain(
      'Selecione um arquivo .md ou .txt.'
    );
    expect(api.post).not.toHaveBeenCalled();
    await unmount(component);
  });

  it('exige cidade selecionada e envia os passeios após confirmação', async () => {
    vi.useFakeTimers();
    api.get.mockResolvedValue([{ nome: 'Barcelona, Catalunha, Espanha' }]);
    api.post.mockResolvedValue({ importados: 1, ignorados: 0 });
    const target = document.createElement('div');
    const onImported = vi.fn();
    const component = mount(ImportarOpcionais, { target, props: { onImported } });
    flushSync();
    const button = (text: string) => {
      const found = [...target.querySelectorAll('button')].find((item) =>
        item.textContent?.includes(text)
      );
      if (!found) throw new Error(`Botão ausente: ${text}`);
      return found;
    };
    const textarea = target.querySelector('textarea')!;
    textarea.value = '#### Passeio\n##### Descrição';
    textarea.dispatchEvent(new Event('input', { bubbles: true }));
    flushSync();
    button('Analisar e conferir').click();
    flushSync();
    button('Confirmar importação').click();
    flushSync();
    expect(api.post).not.toHaveBeenCalled();
    expect(target.textContent).toContain('Selecione e confirme cada cidade');
    const input = target.querySelector<HTMLInputElement>('#import-cidade-0')!;
    input.dispatchEvent(new Event('focus'));
    input.value = 'Barcelona';
    input.dispatchEvent(new Event('input', { bubbles: true }));
    await vi.advanceTimersByTimeAsync(300);
    await tick();
    flushSync();
    button('Barcelona, Catalunha, Espanha').dispatchEvent(
      new MouseEvent('mousedown', { bubbles: true })
    );
    flushSync();
    button('Confirmar importação').click();
    await tick();
    flushSync();
    expect(api.post).toHaveBeenCalledWith('/api/v1/opcionais/importar', {
      items: [{ cidade: 'Barcelona, Catalunha, Espanha', nome: 'Passeio', descricao: 'Descrição' }]
    });
    expect(onImported).toHaveBeenCalledOnce();
    expect(target.textContent).toContain('1 passeio(s) importado(s)');
    await unmount(component);
  });

  it('exige confirmação independente para cada cidade do arquivo', async () => {
    vi.useFakeTimers();
    api.get.mockImplementation(async (_path: string, query: { q: string }) => [
      { nome: query.q === 'Lisboa' ? 'Lisboa, Portugal' : 'Porto, Portugal' }
    ]);
    api.post.mockResolvedValue({ importados: 2, ignorados: 0 });
    const target = document.createElement('div');
    const component = mount(ImportarOpcionais, { target, props: { onImported: vi.fn() } });
    flushSync();
    const radio = target.querySelector<HTMLInputElement>('input[value="arquivo"]')!;
    radio.checked = true;
    radio.dispatchEvent(new Event('change', { bubbles: true }));
    const textarea = target.querySelector('textarea')!;
    textarea.value = '## Lisboa\n#### Tour A\n##### Texto A\n## Porto\n#### Tour B\n##### Texto B';
    textarea.dispatchEvent(new Event('input', { bubbles: true }));
    flushSync();
    const button = (text: string) => {
      const found = [...target.querySelectorAll('button')].find((item) =>
        item.textContent?.includes(text)
      );
      if (!found) throw new Error(`Botão ausente: ${text}`);
      return found;
    };
    button('Analisar e conferir').click();
    flushSync();
    const selectCity = async (index: number, query: string, city: string) => {
      const input = target.querySelector<HTMLInputElement>(`#import-cidade-${index}`)!;
      input.dispatchEvent(new Event('focus'));
      input.value = query;
      input.dispatchEvent(new Event('input', { bubbles: true }));
      await vi.advanceTimersByTimeAsync(300);
      await tick();
      flushSync();
      button(city).dispatchEvent(new MouseEvent('mousedown', { bubbles: true }));
      flushSync();
    };
    await selectCity(0, 'Lisboa', 'Lisboa, Portugal');
    button('Confirmar importação').click();
    flushSync();
    expect(api.post).not.toHaveBeenCalled();
    await selectCity(1, 'Porto', 'Porto, Portugal');
    button('Confirmar importação').click();
    await tick();
    expect(api.post).toHaveBeenCalledWith('/api/v1/opcionais/importar', {
      items: [
        { cidade: 'Lisboa, Portugal', nome: 'Tour A', descricao: 'Texto A' },
        { cidade: 'Porto, Portugal', nome: 'Tour B', descricao: 'Texto B' }
      ]
    });
    await unmount(component);
  });

  it('envia identidades distintas, exige seleção e invalida alterações posteriores', async () => {
    vi.useFakeTimers();
    api.fetch.mockResolvedValue({
      items: [
        { id: 'geonames:1', nome: 'Roma', label: 'Roma, Itália', origem: 'geonames' },
        { id: 'geonames:2', nome: 'Roma', label: 'Roma, Texas', origem: 'geonames' }
      ],
      podeHaverMais: false
    });
    api.post.mockResolvedValue({ importados: 2, ignorados: 0 });
    const target = document.createElement('div');
    const component = mount(ImportarOpcionais, {
      target,
      props: { onImported: vi.fn(), geografico: true }
    });
    flushSync();
    const radio = target.querySelector<HTMLInputElement>('input[value="arquivo"]')!;
    radio.checked = true;
    radio.dispatchEvent(new Event('change', { bubbles: true }));
    const textarea = target.querySelector('textarea')!;
    textarea.value = '## Roma A\n#### Tour A\n##### Texto A\n## Roma B\n#### Tour B\n##### Texto B';
    textarea.dispatchEvent(new Event('input', { bubbles: true }));
    flushSync();
    const button = (text: string) =>
      [...target.querySelectorAll('button')].find((item) => item.textContent?.includes(text))!;
    button('Analisar e conferir').click();
    flushSync();
    const select = async (index: number, label: string) => {
      const input = target.querySelector<HTMLInputElement>(`#import-cidade-${index}`)!;
      input.value = 'Roma';
      input.dispatchEvent(new Event('input', { bubbles: true }));
      await vi.advanceTimersByTimeAsync(300);
      await tick();
      flushSync();
      button(label).click();
      flushSync();
    };
    await select(0, 'Roma, Itália');
    button('Confirmar importação').click();
    flushSync();
    expect(api.post).not.toHaveBeenCalled();
    await select(1, 'Roma, Texas');
    const input = target.querySelector<HTMLInputElement>('#import-cidade-0')!;
    input.value = 'Outra cidade';
    input.dispatchEvent(new Event('input', { bubbles: true }));
    flushSync();
    button('Confirmar importação').click();
    flushSync();
    expect(api.post).not.toHaveBeenCalled();
    await select(0, 'Roma, Itália');
    button('Confirmar importação').click();
    await tick();
    expect(api.post).toHaveBeenCalledWith('/api/v1/opcionais/importar', {
      items: [
        { cidade: 'Roma, Itália', cidade_id: 'geonames:1', nome: 'Tour A', descricao: 'Texto A' },
        { cidade: 'Roma, Texas', cidade_id: 'geonames:2', nome: 'Tour B', descricao: 'Texto B' }
      ]
    });
    await unmount(component);
  });
});
