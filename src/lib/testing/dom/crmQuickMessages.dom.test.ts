import { afterEach, expect, it, vi } from 'vitest';
import { flushSync, mount, unmount } from 'svelte';

const api = vi.hoisted(() => ({ get: vi.fn() }));
vi.mock('$lib/services/api', async (importOriginal) => ({
  ...(await importOriginal<typeof import('$lib/services/api')>()),
  apiGet: api.get
}));

import Page from '../../../routes/(app)/parametros/crm/+page.svelte';

afterEach(() => {
  api.get.mockReset();
  document.body.replaceChildren();
});

it('permite abrir a personalização e exibe todos os textos rápidos', async () => {
  const messageTemplates = Array.from({ length: 10 }, (_, index) => ({
    id: `message-${index + 1}`,
    nome: `Aviso ${index + 1}`,
    titulo: `Aviso ${index + 1}`,
    corpo: `Mensagem de aviso ${index + 1}`,
    categoria: 'Aniversário',
    ativo: true
  }));
  api.get.mockResolvedValue({
    userId: 'user-1',
    userRole: '',
    isAdmin: false,
    currentCompanyId: null,
    categories: [{ id: 'category-1', nome: 'Aniversário', icone: '', sort_order: 1 }],
    themes: [
      {
        id: 'theme-1',
        nome: 'Tema de aniversário',
        categoria: 'Aniversário',
        categoria_id: 'category-1',
        asset_url: '',
        greeting_text: null,
        mensagem_max_linhas: 6,
        mensagem_max_palavras: 50,
        assinatura_max_linhas: 2,
        assinatura_max_palavras: 20,
        scope: null,
        ativo: true
      }
    ],
    messages: messageTemplates,
    signature: null,
    settings: null,
    themeLogoColumnsAvailable: false
  });

  const target = document.createElement('div');
  document.body.appendChild(target);
  const app = mount(Page, { target });

  try {
    await vi.waitFor(() => expect(target.querySelector('#crm-tema-etapa1')).not.toBeNull());

    const categorySelect = target.querySelector('#crm-tema-etapa1');
    if (!(categorySelect instanceof HTMLSelectElement)) {
      throw new Error('O seletor de tema não foi renderizado.');
    }
    categorySelect.value = 'aniversario';
    categorySelect.dispatchEvent(new Event('change', { bubbles: true }));
    flushSync();

    const themeSelect = target.querySelector('#crm-template-etapa1');
    if (!(themeSelect instanceof HTMLSelectElement)) {
      throw new Error('O seletor de template não foi renderizado.');
    }
    themeSelect.value = 'theme-1';
    themeSelect.dispatchEvent(new Event('change', { bubbles: true }));
    flushSync();

    const customizeButton = [...target.querySelectorAll('button')].find((button) =>
      button.textContent?.includes('Personalizar cartão')
    )!;
    expect(customizeButton.disabled).toBe(false);
    customizeButton.click();
    flushSync();
    expect(target.textContent).toContain('Personalização opcional');

    const messagesAccordion = [...target.querySelectorAll('button')].find((button) =>
      button.textContent?.includes('Escolha um texto rápido ou edite manualmente')
    )!;
    messagesAccordion.click();
    flushSync();

    expect(target.textContent).toContain('Texto rápido (10)');
    const visibleTemplates = [...target.querySelectorAll('button')]
      .map((button) => button.textContent?.trim())
      .filter((text) => messageTemplates.some((template) => template.nome === text));
    expect(visibleTemplates).toHaveLength(10);
  } finally {
    await unmount(app);
  }
});
