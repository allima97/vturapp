import { describe, it, expect } from 'vitest';
import { parseImportedRoteiroAereo } from './roteiroAereoImport';

const EXAMPLE_REXTUR_CONNECTION = `Sua Escolha
Fechar
Cia\tVoo\tSaída\tChegada\tOrigem\tDestino(s)\tEsc\tEquip.\tTipo\tClasse\t \tFamília\tBagagem\tTotal\t 
GOL(G3)
GOL(G3)
	
G3 1378
	
G3 9180
11/06/2026 - 18:55
12/06/2026 - 00:25
11/06/2026 - 20:05
12/06/2026 - 03:10
São Paulo - guarulhos
Rio de Janeiro - galeão
Rio de Janeiro - galeão
Maceió - zumbi dos palmares
0
0
7M8
738
OW
OW
J
 	 	 
J
 	 	 
 	LIGHT	
	
R$ 2722,74

R$ 2722,74

Reservar`;

const EXAMPLE_REXTUR_DIRECT = `Sua Escolha
Fechar
Cia\tVoo\tSaída\tChegada\tOrigem\tDestino(s)\tEsc\tEquip.\tTipo\tClasse\t \tFamília\tBagagem\tTotal\t 
GOL(G3)
	
G3 1672
11/06/2026 - 22:45
12/06/2026 - 01:45
São Paulo - guarulhos
Maceió - zumbi dos palmares
0
738
OW
U
 	 	 
 	LIGHT 	
	
R$ 1394,33

R$ 1394,33`;

describe('parseImportedRoteiroAereo - formato REXTUR', () => {
  it('extrai voo com troca de aeronave (conexão)', () => {
    const result = parseImportedRoteiroAereo(EXAMPLE_REXTUR_CONNECTION, new Date(2026, 0, 1));
    expect(result).toHaveLength(2);

    expect(result[0].cia_aerea).toBe('Gol');
    expect(result[0].data_voo).toBe('2026-06-11');
    expect(result[0].hora_saida).toBe('18:55');
    expect(result[0].aeroporto_saida).toBe('GRU');
    expect(result[0].hora_chegada).toBe('20:05');
    expect(result[0].aeroporto_chegada).toBe('GIG');
    expect(result[0].tipo_voo).toBe('1 escala');
    expect(result[0].trecho).toBe('São Paulo - Maceió');
    expect(result[0].classe_reserva).toBe('G3');
    expect(result[0].valor_total).toBe(1361.37);

    expect(result[1].cia_aerea).toBe('Gol');
    expect(result[1].data_voo).toBe('2026-06-12');
    expect(result[1].hora_saida).toBe('00:25');
    expect(result[1].aeroporto_saida).toBe('GIG');
    expect(result[1].hora_chegada).toBe('03:10');
    expect(result[1].aeroporto_chegada).toBe('MCZ');
    expect(result[1].tipo_voo).toBe('1 escala');
    expect(result[1].trecho).toBe('São Paulo - Maceió');
    expect(result[1].classe_reserva).toBe('G3');
    expect(result[1].valor_total).toBe(1361.37);
  });

  it('extrai voo direto', () => {
    const result = parseImportedRoteiroAereo(EXAMPLE_REXTUR_DIRECT, new Date(2026, 0, 1));
    expect(result).toHaveLength(1);

    expect(result[0].cia_aerea).toBe('Gol');
    expect(result[0].data_voo).toBe('2026-06-11');
    expect(result[0].hora_saida).toBe('22:45');
    expect(result[0].aeroporto_saida).toBe('GRU');
    expect(result[0].hora_chegada).toBe('01:45');
    expect(result[0].aeroporto_chegada).toBe('MCZ');
    expect(result[0].tipo_voo).toBe('Voo direto');
    expect(result[0].trecho).toBe('São Paulo - Maceió');
    expect(result[0].classe_reserva).toBe('G3');
    expect(result[0].valor_total).toBe(1394.33);
  });
});
