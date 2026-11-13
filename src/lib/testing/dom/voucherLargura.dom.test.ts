import { afterEach, expect, it, vi } from 'vitest';
import { flushSync, mount, unmount } from 'svelte';
import { readable } from 'svelte/store';

vi.mock('$app/stores', () => ({
  page: readable({ url: new URL('https://example.test/operacao/vouchers/novo') })
}));
vi.mock('$app/navigation', () => ({ goto: vi.fn() }));
vi.mock('svelte/transition', async (importOriginal) => ({
  ...(await importOriginal<typeof import('svelte/transition')>()),
  fade: () => ({ duration: 0 }),
  slide: () => ({ duration: 0 })
}));
vi.mock('$lib/services/api', () => ({
  apiGet: vi.fn().mockResolvedValue({ company_id: 'empresa' }),
  apiPost: vi.fn(),
  apiFetch: vi.fn(),
  isCanceledApiError: () => false
}));

import NovoVoucher from '../../../routes/(app)/operacao/vouchers/novo/+page.svelte';
import ListaVouchers from '../../../routes/(app)/operacao/vouchers/+page.svelte';
import VoucherEditorModal from '$lib/components/modais/VoucherEditorModal.svelte';
import { apiGet, apiPost } from '$lib/services/api';
import { buildVoucherPreviewDocument } from '$lib/vouchers/preview';
import type { VoucherAssetRecord, VoucherRecord } from '$lib/vouchers/types';

afterEach(() => {
  document.body.replaceChildren();
});

it('usa toda a largura disponível para fornecedor, etapas e formulário', async () => {
  const target = document.createElement('div');
  document.body.appendChild(target);
  const app = mount(NovoVoucher, { target });
  await vi.waitFor(() => expect(target.textContent).toContain('Escolha o fornecedor do voucher'));

  const fornecedor = [...target.querySelectorAll('section')].find((section) =>
    section.textContent?.includes('Escolha o fornecedor do voucher')
  );
  const conteudo = fornecedor?.parentElement;
  expect(conteudo?.classList.contains('w-full')).toBe(true);
  expect([...conteudo!.classList].some((name) => name.startsWith('max-w-'))).toBe(false);
  expect(conteudo?.textContent).toContain('Dia a Dia');
  expect(conteudo?.querySelector('#voucher-nome')).not.toBeNull();
  await unmount(app);
});

it('salva um voucher sem exigir empresa no formulário', async () => {
  vi.spyOn(window, 'scrollTo').mockImplementation(() => {});
  vi.mocked(apiPost).mockResolvedValueOnce({ success: true });
  const target = document.createElement('div');
  document.body.appendChild(target);
  const app = mount(NovoVoucher, { target });
  await vi.waitFor(() => expect(target.querySelector('#voucher-nome')).not.toBeNull());
  for (const [selector, value] of [
    ['#voucher-nome', 'Viagem individual'],
    ['#voucher-data-inicio', '2027-01-01']
  ]) {
    const input = target.querySelector<HTMLInputElement>(selector)!;
    input.value = value;
    input.dispatchEvent(new Event('input', { bubbles: true }));
  }
  flushSync();
  for (let i = 0; i < 3; i++) {
    const next = [...target.querySelectorAll('button')].find((button) =>
      button.textContent?.includes('Próxima Etapa')
    );
    expect(next).toBeTruthy();
    next!.click();
    flushSync();
  }
  const save = [...target.querySelectorAll('button')].find((button) =>
    button.textContent?.includes('Salvar Rascunho')
  );
  expect(save).toBeTruthy();
  save!.click();
  await vi.waitFor(() =>
    expect(apiPost).toHaveBeenCalledWith(
      '/api/v1/vouchers',
      expect.objectContaining({ nome: 'Viagem individual' })
    )
  );
  await unmount(app);
});

it('carrega a lista mesmo sem empresa no contexto', async () => {
  vi.mocked(apiGet).mockImplementation(async (path) =>
    path === '/api/v1/user/context'
      ? { company_id: null }
      : { items: [{ id: 'voucher', nome: 'Voucher individual', provider: 'special_tours' }] }
  );
  const target = document.createElement('div');
  document.body.appendChild(target);
  const app = mount(ListaVouchers, { target });
  await vi.waitFor(() => expect(target.textContent).toContain('Voucher individual'));
  expect(apiGet).toHaveBeenCalledWith('/api/v1/vouchers', undefined, expect.any(AbortSignal));
  await unmount(app);
});

it('permite informar a cidade de um hotel importado sem cidade', async () => {
  const target = document.createElement('div');
  document.body.appendChild(target);
  const voucher: VoucherRecord = {
    id: 'voucher',
    company_id: null,
    provider: 'special_tours',
    nome: 'Viagem',
    status: 'rascunho',
    data_inicio: '2027-01-01',
    ativo: true,
    voucher_hoteis: [{ cidade: '', hotel: 'Hotel Exemplo', ordem: 0 }]
  };
  const app = mount(VoucherEditorModal, { target, props: { open: true, voucher } });
  flushSync();
  for (let i = 0; i < 2; i++) {
    const next = [...document.querySelectorAll('button')].find((button) =>
      button.textContent?.includes('Próxima Etapa')
    );
    expect(next).toBeTruthy();
    next!.click();
    flushSync();
  }
  expect(document.body.textContent).toContain('Cidade não informada');
  const hotelButton = [...document.querySelectorAll('button')].find((button) =>
    button.textContent?.includes('Hotel Exemplo')
  );
  expect(hotelButton).toBeTruthy();
  hotelButton!.click();
  flushSync();
  const city = document.querySelector<HTMLInputElement>('#voucher-modal-hotel-cidade-0')!;
  expect(city).toBeTruthy();
  city.value = 'Lisboa';
  city.dispatchEvent(new Event('input', { bubbles: true }));
  flushSync();
  expect(document.body.textContent).toContain('Lisboa');
  await unmount(app);
});

it.each([
  ['special_tours', '120px', '78px'],
  ['sato_tours', '120px', '78px'],
  ['europamundo', '180px', '100px']
] as const)(
  'aplica as mesmas dimensões e alinhamento aos logos no voucher %s',
  (provider, width, height) => {
    const voucher: VoucherRecord = {
      id: 'voucher',
      company_id: null,
      provider,
      nome: 'Viagem',
      status: 'rascunho',
      ativo: true,
      voucher_dias: [],
      voucher_hoteis: []
    };
    const assets = [
      { provider, asset_kind: 'logo', preview_url: '/logo.png', ativo: true },
      { provider: 'empresa', asset_kind: 'logo', preview_url: '/empresa.png', ativo: true }
    ] as VoucherAssetRecord[];
    const parsed = new DOMParser().parseFromString(
      buildVoucherPreviewDocument(voucher, assets, 'empresa'),
      'text/html'
    );
    const style = parsed.querySelector('style')!;
    document.head.appendChild(style);
    const target = document.createElement('div');
    target.innerHTML = parsed.querySelector('main')!.innerHTML;
    document.body.appendChild(target);
    try {
      const logos = [...target.querySelectorAll<HTMLImageElement>('.voucher-header-logo img')];
      expect(logos).toHaveLength(2);
      expect(getComputedStyle(target.querySelector('.voucher-header')!).alignItems).toBe('center');
      for (const logo of logos) {
        const css = getComputedStyle(logo);
        expect(css.width).toBe(width);
        expect(css.height).toBe(height);
        expect(css.objectFit).toBe('contain');
        expect(getComputedStyle(logo.parentElement!).alignItems).toBe('center');
      }
    } finally {
      style.remove();
      target.remove();
    }
  }
);
