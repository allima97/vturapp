import { expect, it } from 'vitest';
import { atribuirIdsRegistros, renovarIdsRegistros } from './roteiroRegistros';

it('preserva ids válidos e completa os registros novos', () => {
  const id = crypto.randomUUID().toUpperCase();
  const itens = atribuirIdsRegistros([{ id, cidade: 'Roma' }, { cidade: 'Paris' }]);
  expect(itens[0].id).toBe(id.toLowerCase());
  expect(itens[1].id).toMatch(
    /^[a-f0-9]{8}-[a-f0-9]{4}-4[a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/
  );
  expect(atribuirIdsRegistros(itens).map((item) => item.id)).toEqual(itens.map((item) => item.id));
});

it('gera ids novos na duplicação sem alterar a lista original', () => {
  const id = crypto.randomUUID();
  const original = [{ id, cidade: 'Roma' }];
  const copia = renovarIdsRegistros(original);
  expect(original[0].id).toBe(id);
  expect(copia[0].id).not.toBe(id);
  expect(copia[0].cidade).toBe('Roma');
});
