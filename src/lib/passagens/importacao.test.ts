import { describe, expect, it } from 'vitest';
import { importarTextoPassagem } from './importacao';

describe('importação inicial de passagens', () => {
  it('extrai localizador e segmentos de texto estruturado sem criar passageiros ou bilhetes', () => {
    const resultado = importarTextoPassagem(`LOC: ABC123
segmentos
Companhia Exemplo XY 123 12/11/2026 - 15:00 12/11/2026 - 16:19 HK AAA - Aaa BBB - Bbb E90 01:19
Companhia Outra ZQ 88 12/11/2026 - 17:50 13/11/2026 - 07:15 HK BBB - Bbb CCC - Ccc 781 10:25
passageiros
Nome não reconhecido`);
    expect(resultado.dados.localizador).toBe('ABC123');
    expect(resultado.dados.trechos).toEqual([
      {
        companhia: 'Companhia Exemplo',
        voo: 'XY 123',
        origem: 'AAA',
        destino: 'BBB',
        saida: '2026-11-12T15:00',
        chegada: '2026-11-12T16:19',
        status: 'HK',
        duracao: '01:19',
        classe: ''
      },
      {
        companhia: 'Companhia Outra',
        voo: 'ZQ 88',
        origem: 'BBB',
        destino: 'CCC',
        saida: '2026-11-12T17:50',
        chegada: '2026-11-13T07:15',
        status: 'HK',
        duracao: '10:25',
        classe: ''
      }
    ]);
    expect(resultado.dados.passageiros).toEqual([]);
    expect(resultado.avisos.join(' ')).toContain('campos não reconhecidos');
  });

  it('avisa explicitamente quando o formato não é reconhecido', () => {
    const resultado = importarTextoPassagem('reserva sem formato reconhecido');
    expect(resultado.dados).toEqual({ localizador: '', emissao: '', trechos: [], passageiros: [] });
    expect(resultado.avisos.join(' ')).toContain('Localizador não reconhecido');
    expect(resultado.avisos.join(' ')).toContain('Nenhum trecho reconhecido');
  });

  it('associa passageiros e assentos quando as colunas estão separadas por tabulações', () => {
    const resultado = importarTextoPassagem(`loc\tprazo de emissão\tprazo da reserva
ABC123\t---\t---
segmentos
Companhia Exemplo XY 123 12/11/2026 - 15:00 12/11/2026 - 16:19 HK AAA - Aaa BBB - Bbb E90 01:19 W
passageiros
ADT\tSOBRENOME EXEMPLO\tMARIA\tFeminino\tEmitida
assentos
SOBRENOME EXEMPLO/MARIA\t17D`);
    expect(resultado.dados.localizador).toBe('ABC123');
    expect(resultado.dados.trechos[0].classe).toBe('W');
    expect(resultado.dados.passageiros).toEqual([
      {
        nome: 'SOBRENOME EXEMPLO, MARIA',
        tipo: 'ADT',
        bilhete: '',
        status: 'Emitida',
        assentos: ['17D']
      }
    ]);
  });

  it('reconhece os tipos de passageiro da reserva', () => {
    const resultado = importarTextoPassagem(`passageiros
adt\tSOBRENOME\tADULTO\tX\tEmitida
CHD\tSOBRENOME\tCRIANCA\tX\tEmitida
inf\tSOBRENOME\tBEBE\tX\tEmitida`);
    expect(resultado.dados.passageiros.map((passageiro) => passageiro.tipo)).toEqual([
      'ADT',
      'CHD',
      'INF'
    ]);
  });
});
