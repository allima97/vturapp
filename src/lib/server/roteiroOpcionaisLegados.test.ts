import { expect, it } from 'vitest';
import { identificarOpcionaisLegados } from './roteiroOpcionaisLegados';

it('atribui IDs determinísticos apenas na leitura, únicos para grupos idênticos', async () => {
  const grupos = [
    { cidade: 'Roma', passeios: [{ nome: 'Passeio', descricao: '' }], extra: 'preservado' },
    { cidade: 'Roma', passeios: [{ nome: 'Passeio', descricao: '' }], extra: 'preservado' }
  ];
  const original = JSON.stringify(grupos);
  const primeira = await identificarOpcionaisLegados(grupos, 'roteiro', 'revisao');
  expect(primeira).toEqual(await identificarOpcionaisLegados(grupos, 'roteiro', 'revisao'));
  expect(primeira[0].registro_id).toMatch(
    /^[a-f0-9]{8}-[a-f0-9]{4}-4[a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/
  );
  expect(primeira[0].registro_id).not.toBe(primeira[1].registro_id);
  expect(primeira[0].extra).toBe('preservado');
  expect(JSON.stringify(grupos)).toBe(original);
  expect((await identificarOpcionaisLegados(grupos, 'outro', 'revisao'))[0].registro_id).not.toBe(
    primeira[0].registro_id
  );
  expect((await identificarOpcionaisLegados(grupos, 'roteiro', 'outra'))[0].registro_id).not.toBe(
    primeira[0].registro_id
  );
});

it('não colide com IDs já persistidos e rejeita identificadores inválidos ou duplicados', async () => {
  const legado = [{ cidade: 'Roma', passeios: [] }];
  const id = (await identificarOpcionaisLegados(legado, 'roteiro', 'revisao'))[0].registro_id;
  const mistos = await identificarOpcionaisLegados(
    [...legado, { cidade: 'Paris', passeios: [], registro_id: id }],
    'roteiro',
    'revisao'
  );
  expect(mistos[1].registro_id).toBe(id);
  expect(mistos[0].registro_id).not.toBe(id);
  await expect(
    identificarOpcionaisLegados([{ ...legado[0], registro_id: null }], 'roteiro', 'revisao')
  ).rejects.toThrow('inválida');
  await expect(
    identificarOpcionaisLegados(
      [
        { ...legado[0], registro_id: id },
        { ...legado[0], registro_id: String(id).toUpperCase() }
      ],
      'roteiro',
      'revisao'
    )
  ).rejects.toThrow('duplicada');
});
