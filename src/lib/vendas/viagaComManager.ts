import type { DataClient } from '$lib/dataClientTypes';
import { normalizeText } from '$lib/normalizeText';
import { logServerError } from '$lib/server/v1';
import type { ReciboRelacionado } from './reciboReservaValidator';

function normalizeNumero(valor?: string | null) {
  if (!valor) return "";
  return normalizeText(valor, { trim: true, collapseWhitespace: true }).replace(/\s+/g, "");
}

function logViajaComError(context: string, error: unknown) {
  logServerError(context, error);
}

interface ReciboComplementarClienteRow {
  nome?: string | null;
}

interface ReciboComplementarVendaRow {
  cliente_id?: string | null;
  clientes?: ReciboComplementarClienteRow[] | null;
}

interface ReciboComplementarReciboRow {
  id?: string | null;
  numero_recibo?: string | null;
  numero_reserva?: string | null;
  venda_id?: string | null;
  vendas?: ReciboComplementarVendaRow[] | null;
}

export interface ReciboComplementarRow {
  recibo_id?: string | null;
  vendas_recibos?: ReciboComplementarReciboRow[] | null;
}

/**
 * Cria vínculos automáticos "Viaja Com" entre recibos de diferentes
 * contratantes que compartilham a mesma reserva.
 *
 * @param params.client - Cliente Dados
 * @param params.vendaId - ID da venda atual
 * @param params.recibosNovos - Recibos recém-criados
 * @param params.recibosRelacionados - Recibos existentes com mesma reserva
 * @returns Número de vínculos criados
 */
export async function criarVinculosViajaComAutomaticos(params: {
  client: DataClient;
  vendaId: string;
  recibosNovos: { id: string; numero_reserva?: string | null }[];
  recibosRelacionados?: ReciboRelacionado[] | null;
}): Promise<number> {
  const { client, vendaId, recibosNovos, recibosRelacionados } = params;

  if (!recibosRelacionados || recibosRelacionados.length === 0) {
    return 0;
  }

  let vinculosCriados = 0;

  // Para cada recibo novo que tem reserva duplicada
  for (const reciboNovo of recibosNovos) {
    if (!reciboNovo.numero_reserva) continue;

    const reservaNorm = normalizeNumero(reciboNovo.numero_reserva);

    // Encontra recibos relacionados com a mesma reserva
    const relacionados = recibosRelacionados.filter(
      (r) => normalizeNumero(r.numero_reserva) === reservaNorm
    );

    if (relacionados.length === 0) continue;

    for (const relacionado of relacionados) {
      try {
        // Cria vínculo: recibo novo aponta para recibo relacionado
        const { error: erro1 } = await client
          .from("vendas_recibos_complementares")
          .upsert(
            {
              venda_id: vendaId,
              recibo_id: relacionado.id,
            },
            {
              onConflict: "venda_id,recibo_id",
              ignoreDuplicates: true
            }
          );

        if (erro1) {
          logViajaComError("[viaja-com] erro ao criar vinculo direto", erro1);
          continue;
        }

        // Cria vínculo reverso: recibo relacionado aponta para recibo novo
        const { error: erro2 } = await client
          .from("vendas_recibos_complementares")
          .upsert(
            {
              venda_id: relacionado.venda_id,
              recibo_id: reciboNovo.id,
            },
            {
              onConflict: "venda_id,recibo_id",
              ignoreDuplicates: true
            }
          );

        if (erro2) {
          logViajaComError("[viaja-com] erro ao criar vinculo reverso", erro2);
          continue;
        }

        vinculosCriados += 2;
      } catch (error) {
        logViajaComError("[viaja-com] erro ao criar vinculo", error);
      }
    }
  }

  return vinculosCriados;
}

/**
 * Busca todos os recibos complementares ("Viaja Com") de uma venda.
 *
 * @param params.client - Cliente Dados
 * @param params.vendaId - ID da venda
 * @returns Lista de recibos complementares com informações do cliente
 */
export async function buscarRecibosComplementares(params: {
  client: DataClient;
  vendaId: string;
}): Promise<ReciboComplementarRow[]> {
  const { client, vendaId } = params;

  const { data, error } = await client
    .from("vendas_recibos_complementares")
    .select(`
      recibo_id,
      vendas_recibos!inner(
        id,
        numero_recibo,
        numero_reserva,
        venda_id,
        vendas!inner(
          cliente_id,
          clientes(nome)
        )
      )
    `)
    .eq("venda_id", vendaId);

  if (error) {
    logViajaComError("[viaja-com] erro ao buscar recibos complementares", error);
    return [];
  }

  return data || [];
}
