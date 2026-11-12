import { expect, it } from 'vitest';
import { identificarRegistrosLegados } from './roteiroRegistrosLegados';

it('atribui ids determinísticos pela posição, sem gravar e sem colidir', async () => {
  const itens = [{ cidade_id: 'geonames:1' }, { cidade_id: 'geonames:1' }];
  const original = JSON.stringify(itens);
  const primeira = await identificarRegistrosLegados(itens, 'dias', 'roteiro', 'revisao');
  expect(primeira).toEqual(await identificarRegistrosLegados(itens, 'dias', 'roteiro', 'revisao'));
  expect(primeira[0].registro_id).toMatch(
    /^[a-f0-9]{8}-[a-f0-9]{4}-4[a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/
  );
  expect(primeira[0].registro_id).not.toBe(primeira[1].registro_id);
  expect(JSON.stringify(itens)).toBe(original);
  expect(
    (await identificarRegistrosLegados(itens, 'hoteis', 'roteiro', 'revisao'))[0].registro_id
  ).not.toBe(primeira[0].registro_id);
  expect(
    (await identificarRegistrosLegados(itens, 'dias', 'outro', 'revisao'))[0].registro_id
  ).not.toBe(primeira[0].registro_id);
});

it('mantém ids já definidos e rejeita inválidos ou duplicados', async () => {
  const legado = [{ cidade_id: 'geonames:1' }];
  const id = (await identificarRegistrosLegados(legado, 'passeios', 'roteiro', 'revisao'))[0]
    .registro_id;
  const mistos = await identificarRegistrosLegados(
    [...legado, { cidade_id: 'geonames:3', registro_id: id }],
    'passeios',
    'roteiro',
    'revisao'
  );
  expect(mistos[1].registro_id).toBe(id);
  expect(mistos[0].registro_id).not.toBe(id);
  await expect(
    identificarRegistrosLegados(
      [{ cidade_id: null, registro_id: 'inválido' }],
      'dias',
      'roteiro',
      'revisao'
    )
  ).rejects.toThrow('inválida');
  await expect(
    identificarRegistrosLegados(
      [
        { cidade_id: null, registro_id: id },
        { cidade_id: null, registro_id: id.toUpperCase() }
      ],
      'dias',
      'roteiro',
      'revisao'
    )
  ).rejects.toThrow('duplicada');
});
