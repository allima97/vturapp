import { destinoIdValido } from '$lib/destinoIdentidade';
import { obterDestino } from '$lib/server/destinosBusca';

type ItemComDestino = Record<string, unknown> & {
  cidade_id?: unknown;
  destino_geografico_id?: unknown;
};

type ClienteCidades = {
  from: (tabela: string) => {
    select: (campos: string) => {
      in: (
        coluna: string,
        valores: string[]
      ) => PromiseLike<{ data: unknown[] | null; error: unknown }>;
    };
  };
};

/**
 * Anexa `pais_nome` a cada item do orçamento (usado no título do PDF Moderno).
 * Destino geográfico → base GeoNames; cadastro antigo → cidade → subdivisão → país.
 * Falhas de consulta nunca quebram a prévia: o item só fica sem país.
 */
export async function anexarPaisesAosItens<T extends ItemComDestino>(
  itens: T[],
  client: unknown,
  db?: D1Database,
  geoDb?: D1Database
): Promise<Array<T & { pais_nome: string | null }>> {
  const porDestino = new Map<string, string>();
  const porCidade = new Map<string, string>();

  const destinoIds = [
    ...new Set(
      itens
        .map((item) => String(item.destino_geografico_id || '').trim())
        .filter((id) => id && destinoIdValido(id))
    )
  ];
  if (destinoIds.length && db && geoDb) {
    await Promise.all(
      destinoIds.map(async (id) => {
        try {
          const destino = await obterDestino(db, geoDb, id, 'pt');
          const pais = destino?.referencia.pais?.trim();
          if (pais) porDestino.set(id, pais);
        } catch {
          /* sem país para este destino */
        }
      })
    );
  }

  const cidadeIds = [
    ...new Set(
      itens
        .filter((item) => !porDestino.has(String(item.destino_geografico_id || '').trim()))
        .map((item) => String(item.cidade_id || '').trim())
        .filter(Boolean)
    )
  ];
  if (cidadeIds.length) {
    try {
      const { data } = await (client as ClienteCidades)
        .from('cidades')
        .select('id, subdivisao:subdivisoes!subdivisao_id(pais:paises!pais_id(nome))')
        .in('id', cidadeIds);
      for (const row of (data || []) as Array<Record<string, unknown>>) {
        const subdivisao = row.subdivisao as { pais?: { nome?: unknown } | null } | null;
        const pais = String(subdivisao?.pais?.nome || '').trim();
        if (pais) porCidade.set(String(row.id), pais);
      }
    } catch {
      /* sem país pelo cadastro antigo */
    }
  }

  return itens.map((item) => ({
    ...item,
    pais_nome:
      porDestino.get(String(item.destino_geografico_id || '').trim()) ||
      porCidade.get(String(item.cidade_id || '').trim()) ||
      null
  }));
}
