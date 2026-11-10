import { expect, it } from 'vitest';
import { flagsGeograficasAtivas, roteiroGeograficoAtivo } from './destinosGeograficos';

it('liga todas as flags no build de produção ou de staging', () => {
  expect(flagsGeograficasAtivas({})).toBe(false);
  expect(flagsGeograficasAtivas({ PUBLIC_GEONAMES_ATIVO: '1' })).toBe(false);
  expect(flagsGeograficasAtivas({ PUBLIC_DEPLOY_ENV: 'production' })).toBe(false);
  expect(flagsGeograficasAtivas({ PUBLIC_DEPLOY_ENV: 'staging' })).toBe(false);
  expect(flagsGeograficasAtivas({ PUBLIC_DEPLOY_ENV: 'geo', PUBLIC_GEONAMES_ATIVO: '1' })).toBe(
    false
  );
  expect(
    flagsGeograficasAtivas({ PUBLIC_DEPLOY_ENV: 'production', PUBLIC_GEONAMES_ATIVO: '1' })
  ).toBe(true);
  expect(
    flagsGeograficasAtivas({ PUBLIC_DEPLOY_ENV: 'staging', PUBLIC_GEONAMES_ATIVO: 'true' })
  ).toBe(true);
  expect(roteiroGeograficoAtivo).toBe(false);
});
