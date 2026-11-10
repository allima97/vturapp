import { describe, expect, it } from 'vitest';
import { chaveNomeOpcional, parseImportacaoOpcionais } from './importarOpcionais';
import { chaveCidadeOpcional } from './catalogoOpcionais';

describe('importação de opcionais', () => {
  it('normaliza chaves ausentes sem falhar', () => {
    expect(chaveCidadeOpcional(null)).toBe('');
    expect(chaveNomeOpcional(undefined)).toBe('');
  });

  it('interpreta cidades, nomes, descrições e anotações do modelo', () => {
    const texto = `## Barcelona, Catalunha, Espanha (aqui é a cidade)
#### Passeio Gótico (aqui é o nome do passeio)
##### Primeira descrição. (aqui é a descrição do passeio)
#### Flamenco
##### Outra descrição.
## Madrid, Comunidade de Madrid, Espanha (aqui é a cidade)
#### Roteiro de Tapas
##### Uma descrição.
Mais uma linha.`;
    expect(parseImportacaoOpcionais(texto, 'arquivo')).toEqual([
      {
        cidadeOriginal: 'Barcelona, Catalunha, Espanha',
        passeios: [
          { nome: 'Passeio Gótico', descricao: 'Primeira descrição.' },
          { nome: 'Flamenco', descricao: 'Outra descrição.' }
        ]
      },
      {
        cidadeOriginal: 'Madrid, Comunidade de Madrid, Espanha',
        passeios: [{ nome: 'Roteiro de Tapas', descricao: 'Uma descrição.\nMais uma linha.' }]
      }
    ]);
  });
  it('aceita passeios sem cidade para cidade selecionada', () => {
    expect(parseImportacaoOpcionais('#### Passeio\n##### Descrição', 'cidade')).toEqual([
      { cidadeOriginal: '', passeios: [{ nome: 'Passeio', descricao: 'Descrição' }] }
    ]);
  });
  it('preserva parágrafos de descrições com várias linhas', () => {
    const result = parseImportacaoOpcionais(
      '#### Passeio\n##### Primeiro parágrafo.\n\nSegundo parágrafo.',
      'cidade'
    );
    expect(result[0].passeios[0].descricao).toBe('Primeiro parágrafo.\n\nSegundo parágrafo.');
  });
  it('rejeita cidade no modo único e texto que possa ser perdido', () => {
    expect(() => parseImportacaoOpcionais('## Lisboa\n#### Tour', 'cidade')).toThrow(
      'remova a cidade'
    );
    expect(() => parseImportacaoOpcionais('#### Tour', 'arquivo')).toThrow('cidade antes');
    expect(() => parseImportacaoOpcionais('Texto solto\n#### Tour', 'cidade')).toThrow('Linha 1');
    expect(() => parseImportacaoOpcionais('#### Tour\n####', 'cidade')).toThrow('Linha 2');
    expect(() => parseImportacaoOpcionais('## Lisboa', 'arquivo')).toThrow('Nenhum passeio');
  });
  it('rejeita mais de 100 passeios', () => {
    expect(() =>
      parseImportacaoOpcionais(
        Array.from({ length: 101 }, (_, i) => `#### Passeio ${i}`).join('\n'),
        'cidade'
      )
    ).toThrow('até 100');
  });
});
