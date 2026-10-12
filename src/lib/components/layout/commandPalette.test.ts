import { describe, expect, it } from 'vitest';
import { filtrarItens, isAtalhoBusca, normalizarBusca, semRepetidos } from './commandPalette';

const itens = [
  { secao: 'OPERAÇÃO', nome: 'Vendas', href: '/vendas' },
  { secao: 'OPERAÇÃO', nome: 'Clientes', href: '/clientes' },
  { secao: 'FINANCEIRO', nome: 'Vendas / Pagamentos', href: '/vendas' },
  { secao: 'FINANCEIRO', nome: 'Comissionamento', href: '/financeiro/comissoes' },
  { secao: 'CADASTROS', nome: 'Cidades', href: '/cadastros/cidades' },
  { secao: 'OPERAÇÃO', nome: 'Últimas Compras', href: '/operacao/ultimas-compras' },
];

describe('busca rápida (Ctrl+K)', () => {
  it('ignora acentos e maiúsculas', () => {
    expect(normalizarBusca('  ComissÃo ')).toBe('comissao');
    expect(filtrarItens(itens, 'ULTIMAS').map((i) => i.nome)).toEqual(['Últimas Compras']);
    expect(filtrarItens(itens, 'conciliacao').map((i) => i.nome)).toEqual([]);
  });

  it('sem texto mostra o menu inteiro, sem endereços repetidos', () => {
    expect(filtrarItens(itens, '').map((i) => i.href)).toEqual(semRepetidos(itens).map((i) => i.href));
    expect(filtrarItens(itens, '').filter((i) => i.href === '/vendas')).toHaveLength(1);
  });

  it('nome que começa com o texto vem antes; a seção também conta', () => {
    expect(filtrarItens(itens, 'c').map((i) => i.nome).slice(0, 3)).toEqual(['Clientes', 'Comissionamento', 'Cidades']);
    expect(filtrarItens(itens, 'financeiro').map((i) => i.nome)).toEqual(['Comissionamento']);
    expect(filtrarItens(itens, 'financeiro com').map((i) => i.nome)).toEqual(['Comissionamento']);
  });

  it('nada encontrado devolve lista vazia', () => {
    expect(filtrarItens(itens, 'xyz')).toEqual([]);
  });

  it('atalho: Ctrl+K e ⌘K, sem Alt/Shift', () => {
    const base = { key: 'k', ctrlKey: false, metaKey: false, altKey: false, shiftKey: false };
    expect(isAtalhoBusca({ ...base, ctrlKey: true })).toBe(true);
    expect(isAtalhoBusca({ ...base, metaKey: true, key: 'K' })).toBe(true);
    expect(isAtalhoBusca({ ...base })).toBe(false);
    expect(isAtalhoBusca({ ...base, ctrlKey: true, shiftKey: true })).toBe(false);
    expect(isAtalhoBusca({ ...base, ctrlKey: true, key: 'j' })).toBe(false);
  });
});
