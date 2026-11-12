import {
  chaveCidadeOpcional,
  chaveIdentidadeCidade,
  type OpcionalCatalogo
} from './catalogoOpcionais';
import { apiFetch } from './services/api';

export type CidadeCatalogo = { cidade: string; cidade_id?: string | null };

export function chaveCidadeCatalogo(cidade: CidadeCatalogo) {
  if (!cidade.cidade_id && !chaveCidadeOpcional(cidade.cidade)) return '';
  return chaveIdentidadeCidade(cidade.cidade, cidade.cidade_id);
}

export async function consultarCatalogoCidade(cidade: CidadeCatalogo): Promise<OpcionalCatalogo[]> {
  const chave = chaveCidadeCatalogo(cidade);
  if (!chave) throw new Error('Selecione uma cidade para consultar o catálogo.');
  const items: OpcionalCatalogo[] = [];
  for (let pagina = 1; ; pagina++) {
    const data = await apiFetch<{ items: OpcionalCatalogo[]; hasMore: boolean }>(
      '/api/v1/opcionais',
      {
        query: cidade.cidade_id
          ? { cidade_id: cidade.cidade_id, pagina }
          : { cidade: cidade.cidade, pagina },
        noCache: true
      }
    );
    if (data.items.some((item) => chaveCidadeCatalogo(item) !== chave))
      throw new Error('O catálogo retornou um passeio de outra cidade.');
    items.push(...data.items);
    if (!data.hasMore) return items;
    if (pagina >= 10000) throw new Error('O catálogo excede o limite de páginas permitido.');
  }
}
