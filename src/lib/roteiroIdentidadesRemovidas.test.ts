import { expect, it } from 'vitest';
import {
  confirmacaoCorresponde,
  identificarRemocoes,
  identificarRemocoesOpcionais
} from './roteiroIdentidadesRemovidas';

it('conta reduções por identidade e coleção sem comparar nomes homônimos', () => {
  const removidas = identificarRemocoes(
    {
      dias: ['geonames:1', 'geonames:1', 'geonames:2'],
      hoteis: ['geonames:1']
    },
    {
      dias: ['geonames:1', 'geonames:2', 'geonames:3'],
      hoteis: [null]
    }
  );
  expect(removidas).toEqual([
    { colecao: 'dias', cidade_id: 'geonames:1', quantidade: 1 },
    { colecao: 'hoteis', cidade_id: 'geonames:1', quantidade: 1 }
  ]);
  expect(confirmacaoCorresponde(removidas, removidas)).toBe(true);
  expect(confirmacaoCorresponde(removidas.slice(0, 1), removidas)).toBe(false);
  expect(confirmacaoCorresponde([...removidas, removidas[0]], removidas)).toBe(false);
  expect(confirmacaoCorresponde([...removidas].reverse(), removidas)).toBe(false);
});

it('não considera alteradas coleções que não foram enviadas', () => {
  expect(identificarRemocoes({ dias: ['geonames:1'] }, {})).toEqual([]);
});

it('detecta trocas entre grupos identificados e ignora reordenação', () => {
  const anteriores = [
    { registro_id: 'a', cidade_id: 'geonames:1' },
    { registro_id: 'b', cidade_id: 'geonames:2' }
  ];
  expect(identificarRemocoesOpcionais(anteriores, [...anteriores].reverse())).toEqual([]);
  expect(
    identificarRemocoesOpcionais(anteriores, [
      { registro_id: 'a', cidade_id: 'geonames:2' },
      { registro_id: 'b', cidade_id: 'geonames:1' }
    ])
  ).toEqual([
    { colecao: 'opcionais', cidade_id: 'geonames:1', quantidade: 1 },
    { colecao: 'opcionais', cidade_id: 'geonames:2', quantidade: 1 }
  ]);
});

it('trata grupos legados por contagem sem usar grupos identificados para ocultar perdas', () => {
  expect(
    identificarRemocoesOpcionais(
      [
        { registro_id: 'a', cidade_id: 'geonames:1' },
        { cidade_id: 'geonames:1' },
        { cidade_id: 'geonames:2' }
      ],
      [
        { registro_id: 'a', cidade_id: 'geonames:2' },
        { registro_id: 'novo', cidade_id: 'geonames:1' }
      ]
    )
  ).toEqual([
    { colecao: 'opcionais', cidade_id: 'geonames:1', quantidade: 1 },
    { colecao: 'opcionais', cidade_id: 'geonames:2', quantidade: 1 }
  ]);
  expect(
    identificarRemocoesOpcionais(
      [{ registro_id: 'a', cidade_id: 'geonames:1' }],
      [{ cidade_id: 'geonames:1' }]
    )
  ).toEqual([{ colecao: 'opcionais', cidade_id: 'geonames:1', quantidade: 1 }]);
});
