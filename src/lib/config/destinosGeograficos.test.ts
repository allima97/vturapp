import { expect, it } from 'vitest';
import { flagsGeograficasAtivas, roteiroGeograficoAtivo } from './destinosGeograficos';

it('liga todas as flags só no build de staging', () => {
  expect(flagsGeograficasAtivas({})).toBe(false);
  expect(flagsGeograficasAtivas({ PUBLIC_GEONAMES_ATIVO: '1' })).toBe(false);
  expect(flagsGeograficasAtivas({ PUBLIC_DEPLOY_ENV: 'staging' })).toBe(false);
  expect(
    flagsGeograficasAtivas({ PUBLIC_DEPLOY_ENV: 'production', PUBLIC_GEONAMES_ATIVO: '1' })
  ).toBe(false);
  expect(flagsGeograficasAtivas({ PUBLIC_DEPLOY_ENV: 'staging', PUBLIC_GEONAMES_ATIVO: '1' })).toBe(
    true
  );
  expect(roteiroGeograficoAtivo).toBe(false);
});
