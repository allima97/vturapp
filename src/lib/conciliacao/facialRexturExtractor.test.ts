import { describe, expect, it } from 'vitest';
import { extractRexturFromText } from './facialRexturExtractor';

describe('extractRexturFromText', () => {
  it('usa o LOC da seção informações gerais como número da reserva', () => {
    const result = extractRexturFromText(`
      informações gerais
      loc
      prazo de emissão
      prazo da reserva
      consolidador
      filial
      agência
      grupo
      criação
      criado por
      dados adicionais

      FTDYHW
      ----
      ----
      RA
      passageiros
      ADT MARTINS DO NASCIMENTO JOSE Masculino Emitida
      tarifas
      sobrenome/nome moeda câmbio tarifa original tarifa tax. emb. rav total
      MARTINS/JOSE BRL 1,0000 R$ 500,00 R$ 120,00 R$ 40,00 R$ 660,00
      R$ 500,00 R$ 120,00 R$ 40,00 R$ 660,00
      tarifar
    `);

    expect(result.contratos[0].contrato_numero).toBe('REXTUR');
    expect(result.contratos[0].reserva_numero).toBe('FTDYHW');
    expect(result.contratos[0].taxas_embarque).toBe(120);
  });

  it('mantém RC/RAC junto do RAV, fora das taxas, quando a reserva Rextur tem coluna RC', () => {
    const result = extractRexturFromText(`
      Reserva Aérea - GW / NAMD / IB / BYARDM
      passageiros
      ADT FURLANETO FRIAS MOURA ANDRE Masculino Emitida
      ADT FURLANETO FRIAS MOURA IZABELA Feminino Emitida
      tarifas
      sobrenome/nome moeda câmbio tarifa original tarifa tax. emb. rav rc total
      FURLANETO FRIAS MOURA/ANDRE USD 4,9584 US$ 88,30 R$ 437,83 R$ 141,94 R$ 40,00 R$ 196,97 R$ 816,74
      FURLANETO FRIAS MOURA/IZABELA USD 4,9584 US$ 88,30 R$ 437,83 R$ 141,94 R$ 40,00 R$ 196,97 R$ 816,74
      US$ 176,60 R$ 875,66 R$ 283,88 R$ 80,00 R$ 393,94 R$ 1.633,48
      tarifar
    `);

    expect(result.contratos[0].reserva_numero).toBe('BYARDM');
    expect(result.contratos[0].taxas_embarque).toBeCloseTo(283.88, 2);
    expect(result.contratos[0].taxa_du).toBe(80);
    expect(result.contratos[0].rc).toBe(393.94);
    expect(result.contratos[0].total_pago).toBe(1633.48);
  });

  it('também reconhece coluna RAC como equivalente ao RC/RAV', () => {
    const result = extractRexturFromText(`
      Reserva Aérea - GW / NAMD / IB / BYARDM
      passageiros
      ADT FURLANETO FRIAS MOURA ANDRE Masculino Emitida
      tarifas
      sobrenome/nome moeda câmbio tarifa original tarifa tax. emb. rav rac total
      FURLANETO FRIAS MOURA/ANDRE USD 4,9584 US$ 88,30 R$ 437,83 R$ 141,94 R$ 40,00 R$ 196,97 R$ 816,74
      US$ 88,30 R$ 437,83 R$ 141,94 R$ 40,00 R$ 196,97 R$ 816,74
      tarifar
    `);

    expect(result.contratos[0].taxas_embarque).toBeCloseTo(141.94, 2);
    expect(result.contratos[0].taxa_du).toBe(40);
    expect(result.contratos[0].rc).toBe(196.97);
  });
});
