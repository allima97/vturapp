import { expect, it } from 'vitest';
import type { RequestEvent } from '@sveltejs/kit';
import { handlePaisesDelete, handlePaisesPost } from './root';

it('recusa criar ou apagar países', async () => {
  for (const resposta of [
    handlePaisesPost({} as RequestEvent),
    handlePaisesDelete({} as RequestEvent)
  ]) {
    expect(resposta.status).toBe(410);
    expect(await resposta.json()).toEqual({
      error: 'O cadastro de países foi desativado. A consulta continua disponível.'
    });
  }
});
