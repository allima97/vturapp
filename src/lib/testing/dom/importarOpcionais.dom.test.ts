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
    api.post.mockResolvedValue({ importados: 2, ignorados: 0 });
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
    textarea.value = 'Passeio\n\nDescrição\n\nOutro passeio\n\nOutra descrição';
    textarea.dispatchEvent(new Event('input', { bubbles: true }));
    flushSync();
    button('Analisar e conferir').click();
    flushSync();
    button('Salvar passeios').click();
    flushSync();
    expect(api.post).not.toHaveBeenCalled();
    expect(target.textContent).toContain('Selecione e confirme a cidade');
    const input = target.querySelector<HTMLInputElement>('#import-cidade-unica')!;
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
    button('Salvar passeios').click();
    await tick();
    flushSync();
    expect(api.post).toHaveBeenCalledWith('/api/v1/opcionais/importar', {
      items: [
        { cidade: 'Barcelona, Catalunha, Espanha', nome: 'Passeio', descricao: 'Descrição' },
        {
          cidade: 'Barcelona, Catalunha, Espanha',
          nome: 'Outro passeio',
          descricao: 'Outra descrição'
        }
      ]
    });
    expect(onImported).toHaveBeenCalledOnce();
    expect(target.textContent).toContain('2 passeio(s) importado(s)');
    await unmount(component);
  });

  it('rejeita texto com cabeçalhos de cidade e não oferece múltiplas cidades', async () => {
    const target = document.createElement('div');
    const component = mount(ImportarOpcionais, { target, props: { onImported: vi.fn() } });
    flushSync();
    expect(target.querySelector('input[type="radio"]')).toBeNull();
    const textarea = target.querySelector('textarea')!;
    textarea.value = '## Lisboa\nPasseio\nDescrição\n## Porto\nOutro\nDescrição';
    textarea.dispatchEvent(new Event('input', { bubbles: true }));
    flushSync();
    [...target.querySelectorAll('button')]
      .find((button) => button.textContent?.includes('Analisar e conferir'))!
      .click();
    flushSync();
    expect(target.querySelector('[role="alert"]')?.textContent).toContain('remova a cidade');
    expect(
      [...target.querySelectorAll('button')].some((button) =>
        button.textContent?.includes('Salvar passeios')
      )
    ).toBe(false);
    await unmount(component);
  });

  it('mostra a cidade antes do texto e preserva a escolha ao analisar novamente', async () => {
    vi.useFakeTimers();
    api.fetch.mockReset().mockResolvedValue({
      items: [{ id: 'geonames:1', nome: 'Roma', label: 'Roma, Itália', origem: 'geonames' }],
      podeHaverMais: false
    });
    api.post.mockReset().mockResolvedValue({ importados: 1, ignorados: 0 });
    const target = document.createElement('div');
    const component = mount(ImportarOpcionais, {
      target,
      props: { onImported: vi.fn(), geografico: true }
    });
    flushSync();
    const button = (text: string) =>
      [...target.querySelectorAll('button')].find((item) => item.textContent?.includes(text))!;
    const city = target.querySelector<HTMLInputElement>('#import-cidade-unica')!;
    const textarea = target.querySelector<HTMLTextAreaElement>('#texto-importar-opcionais')!;
    expect(city.compareDocumentPosition(textarea) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    expect(button('Salvar passeios')).toBeUndefined();
    city.value = 'Roma';
    city.dispatchEvent(new Event('input', { bubbles: true }));
    await vi.advanceTimersByTimeAsync(300);
    await tick();
    flushSync();
    button('Roma, Itália').click();
    textarea.value = 'Museu\n\nVisita guiada';
    textarea.dispatchEvent(new Event('input', { bubbles: true }));
    flushSync();
    button('Analisar e conferir').click();
    flushSync();
    expect(city.value).toBe('Roma, Itália');
    expect(button('Salvar passeios')).toBeDefined();
    city.value = 'Outra cidade';
    city.dispatchEvent(new Event('input', { bubbles: true }));
    flushSync();
    button('Salvar passeios').click();
    expect(api.post).not.toHaveBeenCalled();
    city.value = 'Roma';
    city.dispatchEvent(new Event('input', { bubbles: true }));
    await vi.advanceTimersByTimeAsync(300);
    await tick();
    flushSync();
    button('Roma, Itália').click();
    textarea.value = 'Parque\n\nCaminhada';
    textarea.dispatchEvent(new Event('input', { bubbles: true }));
    flushSync();
    expect(button('Salvar passeios')).toBeUndefined();
    button('Analisar e conferir').click();
    flushSync();
    button('Salvar passeios').click();
    await tick();
    expect(api.post).toHaveBeenCalledWith('/api/v1/opcionais/importar', {
      items: [
        { cidade: 'Roma, Itália', cidade_id: 'geonames:1', nome: 'Parque', descricao: 'Caminhada' }
      ]
    });
    await unmount(component);
  });
});
