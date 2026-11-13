import { afterEach, expect, it, vi } from 'vitest';
import { flushSync, mount, unmount } from 'svelte';

vi.mock('$lib/services/api', async (original) => ({
  ...(await original<typeof import('$lib/services/api')>()),
  apiFetch: vi
    .fn()
    .mockResolvedValue({ items: [], logo_esquerdo: 'vtur', individual: true, company_id: null }),
  apiGet: vi.fn().mockResolvedValue({ items: [], prefs: { hidden: [] } })
}));

import { permissoes } from '$lib/stores/permissoes';
import Parametros from '../../../routes/(app)/parametros/+page.svelte';
import Vouchers from '../../../routes/(app)/operacao/vouchers/+page.svelte';
import VoucherAssets from '../../../routes/(app)/parametros/vouchers/+page.svelte';
import Personalizar from '../../../routes/(app)/perfil/personalizar/+page.svelte';

async function carregarPermissoes(modulos: string[], userType = 'Consultor Individual') {
  const rows = modulos.map((modulo) => ({ modulo, permissao: 'delete', ativo: true }));
  await permissoes.init({
    auth: {
      getUser: async () => ({ data: { user: { id: 'usuario', email: 'teste@example.com' } } }),
      getSession: async () => ({ data: { session: null } })
    },
    from: (table: string) => ({
      select: () => ({
        eq: () =>
          table === 'users'
            ? {
                single: async () => ({
                  data: { uso_individual: true, user_types: { name: userType } },
                  error: null
                })
              }
            : Promise.resolve({ data: table === 'modulo_acesso' ? rows : [], error: null })
      })
    })
  });
}

afterEach(() => {
  document.body.replaceChildren();
});

it('oferece acesso direto aos parâmetros de vouchers para conta individual autorizada', async () => {
  await carregarPermissoes(['operacao_vouchers']);
  const target = document.createElement('div');
  document.body.appendChild(target);
  const app = mount(Vouchers, { target });
  try {
    flushSync();
    expect(target.querySelector('a[href="/parametros/vouchers"]')?.textContent).toContain(
      'Parâmetros de Vouchers'
    );
  } finally {
    await unmount(app);
  }
  const settings = mount(VoucherAssets, { target });
  try {
    await vi.waitFor(() => {
      expect(target.querySelector('#voucher-logo-esquerdo')).not.toBeNull();
      expect(target.querySelector('#voucher-provider')?.hasAttribute('disabled')).toBe(false);
    });
  } finally {
    await unmount(settings);
  }
});

it('mostra o atalho em Parâmetros e permite reexibir o item no menu personalizado', async () => {
  await carregarPermissoes(['operacao_vouchers']);
  const target = document.createElement('div');
  document.body.appendChild(target);
  const app = mount(Parametros, { target });
  try {
    flushSync();
    expect(target.querySelector('a[href="/parametros/vouchers"]')?.textContent).toContain(
      'Vouchers'
    );
  } finally {
    await unmount(app);
  }
  const personalizar = mount(Personalizar, { target });
  try {
    await vi.waitFor(() => {
      const heading = [...target.querySelectorAll('h3')].find(
        (element) => element.textContent?.trim() === 'Parâmetros'
      );
      expect(heading?.closest('.vtur-card')?.textContent).toContain('Vouchers');
    });
  } finally {
    await unmount(personalizar);
  }
});

it('não oferece o atalho a usuário sem permissão nem a administrador de sistema', async () => {
  for (const [modules, role] of [
    [[], 'Consultor Individual'],
    [['operacao_vouchers'], 'Admin']
  ] as const) {
    await carregarPermissoes([...modules], role);
    const target = document.createElement('div');
    document.body.appendChild(target);
    const app = mount(Vouchers, { target });
    try {
      flushSync();
      expect(target.querySelector('a[href="/parametros/vouchers"]')).toBeNull();
    } finally {
      await unmount(app);
      target.remove();
    }
  }
});
