import { describe, expect, it } from 'vitest';
import { buildOpcionaisHtml, parseRoteiroOpcionais } from './roteiroOpcionais';

const exemplo = [
  { cidade: 'Barcelona', passeios: [{ nome: 'Bairro Gótico', descricao: 'Passeio e jantar\nPraça Reial' }, { nome: 'Flamenco', descricao: 'Espetáculo tradicional' }] },
  { cidade: 'Paris', passeios: [{ nome: 'Rio Sena', descricao: 'Cruzeiro noturno' }] },
];
describe('opcionais do roteiro', () => {
  it('preserva cidades, passeios, descrições e ordem ao salvar e recarregar', () => {
    expect(parseRoteiroOpcionais(JSON.parse(JSON.stringify(exemplo)))).toEqual(exemplo);
    expect(parseRoteiroOpcionais([])).toEqual([]);
  });
  it('rejeita conteúdo inválido em vez de apagar silenciosamente os opcionais', () => {
    for (const value of [null, {}, [{ cidade: '', passeios: [] }], [{ cidade: 'Roma', passeios: [{ nome: '', descricao: 'Texto' }] }]]) {
      expect(() => parseRoteiroOpcionais(value)).toThrow();
    }
  });
  it('gera PDF agrupado por cidade sem campos de data e escapa conteúdo', () => {
    const escape = (s: string) => s.replace(/</g, '&lt;').replace(/>/g, '&gt;');
    const html = buildOpcionaisHtml(exemplo, escape);
    expect(html.indexOf('Barcelona')).toBeLessThan(html.indexOf('Paris'));
    expect(html).toContain('Passeio e jantar<br>Praça Reial');
    expect(html).not.toContain('Data');
    expect(buildOpcionaisHtml([{ cidade: '<script>', passeios: [{ nome: '<img>', descricao: '<iframe>' }] }], escape)).not.toContain('<script>');
    expect(buildOpcionaisHtml([], escape)).toBe('');
    expect(buildOpcionaisHtml([{ cidade: 'Roma', passeios: [] }], escape)).toBe('');
  });
});
