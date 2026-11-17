import { expect, it } from 'vitest';
import type { RequestEvent } from '@sveltejs/kit';
import { handleSubdivisoesDelete, handleSubdivisoesPost } from './root';

it('recusa criar ou apagar estados', async () => {
  for (const resposta of [
    handleSubdivisoesPost({} as RequestEvent),
    handleSubdivisoesDelete({} as RequestEvent)
  ]) {
    expect(resposta.status).toBe(410);
    expect(await resposta.json()).toEqual({
      error: 'O cadastro de estados foi desativado. A consulta continua disponível.'
    });
  }
});
