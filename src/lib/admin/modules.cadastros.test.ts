import { expect, it } from 'vitest';
import { MAPA_MODULOS, MODULOS_ADMIN_PERMISSOES } from './modules';

it('esconde países e estados da configuração de permissão e conserva as chaves', () => {
  expect(MAPA_MODULOS.Paises).toBe('cadastros_paises');
  expect(MAPA_MODULOS.Subdivisoes).toBe('cadastros_estados');
  expect(MODULOS_ADMIN_PERMISSOES).not.toContain('Paises');
  expect(MODULOS_ADMIN_PERMISSOES).not.toContain('Subdivisoes');
  expect(MODULOS_ADMIN_PERMISSOES).toContain('Cidades');
});
