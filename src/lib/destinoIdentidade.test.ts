import { describe, expect, it } from 'vitest';
import { destinoIdValido } from './destinoIdentidade';

describe('identidade de destinos', () => {
  it('aceita apenas identificadores canônicos e seguros', () => {
    for (const id of [
      'geonames:3169070',
      'geonames:999999999999999',
      'personalizado:550e8400-e29b-41d4-a716-446655440000',
      'personalizado:550E8400-E29B-41D4-A716-446655440000'
    ])
      expect(destinoIdValido(id)).toBe(true);
    for (const id of [
      null,
      '',
      'Roma',
      'geonames:0',
      'geonames:01',
      'geonames:1000000000000000',
      'GEONAMES:1',
      'personalizado:550e8400-e29b-11d4-a716-446655440000'
    ])
      expect(destinoIdValido(id)).toBe(false);
  });
});
