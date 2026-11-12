import { describe, expect, it } from 'vitest';
import { explicitarIdentidadeCidade } from './roteiroProtocolo';

describe('protocolo de identidade de roteiro', () => {
  it('mantém identidades e declara campos legados ou vazios como nulos', () => {
    expect(explicitarIdentidadeCidade({ cidade: 'Roma', cidade_id: 'geonames:1' })).toEqual({
      cidade: 'Roma',
      cidade_id: 'geonames:1'
    });
    const legado: { cidade: string; cidade_id?: string | null } = { cidade: 'Antiga' };
    expect(explicitarIdentidadeCidade(legado)).toEqual({
      cidade: 'Antiga',
      cidade_id: null
    });
    expect(explicitarIdentidadeCidade({ cidade: '', cidade_id: null })).toEqual({
      cidade: '',
      cidade_id: null
    });
  });
});
