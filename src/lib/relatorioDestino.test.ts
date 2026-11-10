import { expect, it } from 'vitest';
import { chaveDestinoRelatorio } from './relatorioDestino';

it('agrupa pelo nome enquanto a flag está desligada e separa homônimos quando há identidade', () => {
  expect(chaveDestinoRelatorio('Roma', 'geonames:1', false)).toEqual({
    chave: 'Roma',
    destino: 'Roma'
  });
  expect(chaveDestinoRelatorio('  ', null, true)).toEqual({
    chave: 'Destino nao informado',
    destino: 'Destino nao informado'
  });
  expect(chaveDestinoRelatorio('Roma', 'geonames:1', true).chave).toBe('geo:geonames:1');
  expect(chaveDestinoRelatorio('Roma', 'geonames:13', true).chave).not.toBe(
    chaveDestinoRelatorio('Roma', 'geonames:1', true).chave
  );
  expect(chaveDestinoRelatorio('Roma', 'geonames:1', true).destino).toBe('Roma');
});
