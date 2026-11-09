import { expect, it, vi } from 'vitest';

vi.mock('$lib/config/destinosGeograficos', () => ({
  modulosOperacionaisGeograficosAtivos: false
}));

import { complementoDestinoOperacional } from './destinoOperacional';

it('ignora a ausência de identidade e recusa um id enquanto a flag está desligada', async () => {
  expect(await complementoDestinoOperacional({ destino: 'Paris' })).toEqual({
    ok: true,
    campos: {}
  });
  expect(await complementoDestinoOperacional({ cidade: '', destino_geografico_id: '' })).toEqual({
    ok: true,
    campos: {}
  });
  const recusado = await complementoDestinoOperacional({
    destino: 'Paris',
    destino_geografico_id: 'geonames:1'
  });
  expect(recusado).toEqual({
    ok: false,
    status: 400,
    error: 'Destino geográfico ainda não está disponível.'
  });
});

it('não altera outros campos do registro quando a identidade está ausente', async () => {
  const registro = {
    destino: 'Maceió',
    endereco: 'Rua do CEP',
    cep: '57000-000',
    cidade_id: '11111111-1111-4111-8111-111111111111'
  };
  const resultado = await complementoDestinoOperacional(
    registro,
    undefined,
    undefined,
    undefined,
    'destino'
  );
  expect(resultado).toEqual({ ok: true, campos: {} });
  expect(registro).toMatchObject({ endereco: 'Rua do CEP', cep: '57000-000' });
});
