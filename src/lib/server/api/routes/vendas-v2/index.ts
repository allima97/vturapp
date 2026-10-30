/**
 * Rotas Hono para vendas — /api/v2/vendas (F4-01 / F4-02 / F4-03 / M04).
 *
 * Endpoints:
 *   GET    /api/v2/vendas                  — listar (cursor, filtros)
 *   POST   /api/v2/vendas                  — criar (transação atômica + idempotência)
 *   GET    /api/v2/vendas/:id              — detalhe (cabeçalho + itens + pagamentos)
 *   PATCH  /api/v2/vendas/:id              — editar (substituição atômica + recálculo)
 *   POST   /api/v2/vendas/:id/cancelar     — cancelamento lógico (exige versao)
 *
 * Dashboard / relatórios (F4-03):
 *   GET    /api/v2/vendas/resumo           — totais agregados + reconciliação
 *   GET    /api/v2/vendas/parcelas         — parcelas de pagamentos (keyset cursor)
 *
 * Suporte ao formulário:
 *   GET    /api/v2/vendas/produtos         — lista global de produtos ativos
 *   GET    /api/v2/vendas/formas-pagamento — formas de pagamento da empresa
 */

import { Hono, type Context } from 'hono';
import type { ApiEnv } from '../../types';
import { resolveAuthContext } from '$lib/server/auth/context';
import { can } from '$lib/server/policy';
import { getDb } from '$lib/server/db/client';
import { validarVenda, validarVendaEdicao } from '$lib/server/vendas/validation';
import {
  VendaError,
  criarVenda,
  editarVenda,
  listarVendas,
  obterVenda,
  cancelarVenda,
  listarProdutos,
  listarFormasPagamento,
  resumoVendas,
  listarParcelas,
  type VendaDetalhe,
  type VendaListItem,
  type ParcelaItem,
} from '$lib/server/vendas/service';
import type { Produto, FormaPagamento } from '$lib/server/db/schema';

export const vendasV2Routes = new Hono<ApiEnv>();

// ─────────────────────────────────────────────────────────────────────────────
// Helpers
// ─────────────────────────────────────────────────────────────────────────────

async function contexto(c: Context<ApiEnv>) {
  const { DB, BETTER_AUTH_SECRET, PUBLIC_APP_URL, PUBLIC_ENVIRONMENT } = c.env;
  if (!DB || !BETTER_AUTH_SECRET) {
    return { res: c.json({ error: 'Serviço indisponível.' }, 503) };
  }
  const baseURL =
    PUBLIC_ENVIRONMENT === 'production'
      ? 'https://vturapp.com.br'
      : PUBLIC_APP_URL ?? 'http://localhost:5173';
  const ctx = await resolveAuthContext(c.req.raw.headers, DB, BETTER_AUTH_SECRET, baseURL);
  if (!ctx) {
    return { res: c.json({ error: 'Não autenticado.' }, 401) };
  }
  return { ctx, db: getDb(DB) };
}

function respostaErro(c: Context<ApiEnv>, err: unknown) {
  if (err instanceof VendaError) {
    const status =
      err.code === 'NAO_ENCONTRADA' ? 404
      : err.code === 'IDEMPOTENCIA' ? 409
      : err.code === 'CONFLITO_VERSAO' ? 409
      : err.code === 'CANCELADA' ? 409
      : err.code === 'VALIDACAO' ? 400
      : 500;
    return c.json({ error: err.message, code: err.code, errors: err.errors }, status);
  }
  throw err;
}

function parseId(valor: string): number | null {
  const n = Number(valor);
  return Number.isInteger(n) && n > 0 ? n : null;
}

// ─────────────────────────────────────────────────────────────────────────────
// GET /resumo — dashboard financeiro + reconciliação (F4-03)
// ─────────────────────────────────────────────────────────────────────────────

vendasV2Routes.get('/resumo', async (c) => {
  const r = await contexto(c);
  if ('res' in r) return r.res;
  if (!can(r.ctx.papel, 'vendas', 'ler')) return c.json({ error: 'Sem permissão.' }, 403);

  const incluirCanceladas = c.req.query('incluir_canceladas') === '1';
  const dataVendaDe = c.req.query('data_venda_de') || undefined;
  const dataVendaAte = c.req.query('data_venda_ate') || undefined;
  const vendedorId = c.req.query('vendedor_id') || undefined;
  const clienteIdParam = c.req.query('cliente_id');
  const clienteId = clienteIdParam ? parseId(clienteIdParam) : undefined;

  const resumo = await resumoVendas(r.db, r.ctx.empresaId, {
    dataVendaDe,
    dataVendaAte,
    vendedorId,
    clienteId: clienteId ?? undefined,
    incluirCanceladas,
  });

  return c.json({ data: resumo });
});

// ─────────────────────────────────────────────────────────────────────────────
// GET /parcelas — parcelas de pagamentos (keyset cursor) (F4-03)
// ─────────────────────────────────────────────────────────────────────────────

vendasV2Routes.get('/parcelas', async (c) => {
  const r = await contexto(c);
  if ('res' in r) return r.res;
  if (!can(r.ctx.papel, 'vendas', 'ler')) return c.json({ error: 'Sem permissão.' }, 403);

  const cursorParam = c.req.query('cursor');
  const cursor = cursorParam ? parseId(cursorParam) : undefined;
  const limiteParam = c.req.query('limite');
  const limite = limiteParam && Number.isInteger(Number(limiteParam)) ? Number(limiteParam) : undefined;
  const vencimentoDe = c.req.query('vencimento_de') || undefined;
  const vencimentoAte = c.req.query('vencimento_ate') || undefined;
  const vendedorId = c.req.query('vendedor_id') || undefined;
  const clienteIdParam = c.req.query('cliente_id');
  const clienteId = clienteIdParam ? parseId(clienteIdParam) : undefined;
  const somenteAtivas = c.req.query('somente_ativas') !== '0';

  const { parcelas, temMais } = await listarParcelas(r.db, r.ctx.empresaId, {
    cursor: cursor ?? undefined,
    limite,
    vencimentoDe,
    vencimentoAte,
    vendedorId,
    clienteId: clienteId ?? undefined,
    somenteAtivas,
  });

  return c.json({
    itens: parcelas.map(parcelaParaJson),
    tem_mais: temMais,
    proximo_cursor: temMais && parcelas.length > 0 ? parcelas[parcelas.length - 1].id : null,
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// GET /produtos — suporte ao formulário (global, sem empresa_id)
// ─────────────────────────────────────────────────────────────────────────────

vendasV2Routes.get('/produtos', async (c) => {
  const r = await contexto(c);
  if ('res' in r) return r.res;
  if (!can(r.ctx.papel, 'vendas', 'ler')) return c.json({ error: 'Sem permissão.' }, 403);

  const busca = c.req.query('busca') || undefined;
  const tipo = c.req.query('tipo') || undefined;
  const limiteParam = c.req.query('limite');
  const limite = limiteParam ? Number(limiteParam) : undefined;

  const itens = await listarProdutos(r.db, {
    busca,
    tipo,
    limite: limite && Number.isInteger(limite) ? limite : undefined,
  });
  return c.json({ itens: itens.map(produtoParaJson) });
});

// ─────────────────────────────────────────────────────────────────────────────
// GET /formas-pagamento — formas da empresa
// ─────────────────────────────────────────────────────────────────────────────

vendasV2Routes.get('/formas-pagamento', async (c) => {
  const r = await contexto(c);
  if ('res' in r) return r.res;
  if (!can(r.ctx.papel, 'vendas', 'ler')) return c.json({ error: 'Sem permissão.' }, 403);

  const itens = await listarFormasPagamento(r.db, r.ctx.empresaId);
  return c.json({ itens: itens.map(formaParaJson) });
});

// ─────────────────────────────────────────────────────────────────────────────
// GET / — listar
// ─────────────────────────────────────────────────────────────────────────────

vendasV2Routes.get('/', async (c) => {
  const r = await contexto(c);
  if ('res' in r) return r.res;
  if (!can(r.ctx.papel, 'vendas', 'ler')) return c.json({ error: 'Sem permissão.' }, 403);

  const cursorParam = c.req.query('cursor');
  const cursor = cursorParam ? parseId(cursorParam) : undefined;
  const limiteParam = c.req.query('limite');
  const limite = limiteParam ? Number(limiteParam) : undefined;
  const clienteIdParam = c.req.query('cliente_id');
  const clienteId = clienteIdParam ? parseId(clienteIdParam) : undefined;
  const vendedorId = c.req.query('vendedor_id') || undefined;
  const canceladas = c.req.query('canceladas');

  const resultado = await listarVendas(r.db, r.ctx.empresaId, {
    clienteId: clienteId ?? undefined,
    vendedorId,
    canceladas: canceladas === '1' ? true : canceladas === '0' ? false : undefined,
    cursor: cursor ?? undefined,
    limite: limite && Number.isInteger(limite) ? limite : undefined,
  });

  return c.json({
    itens: resultado.itens.map(listItemParaJson),
    proximo_cursor: resultado.proximo_cursor,
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// POST / — criar (transação atômica; idempotência via chave_idempotencia)
// ─────────────────────────────────────────────────────────────────────────────

vendasV2Routes.post('/', async (c) => {
  const r = await contexto(c);
  if ('res' in r) return r.res;
  if (!can(r.ctx.papel, 'vendas', 'criar')) return c.json({ error: 'Sem permissão.' }, 403);

  let body: unknown;
  try {
    body = await c.req.json();
  } catch {
    return c.json({ error: 'JSON inválido.' }, 400);
  }

  const validacao = validarVenda(body);
  if (!validacao.ok) {
    return c.json({ error: 'Dados inválidos.', code: 'VALIDACAO', errors: validacao.errors }, 400);
  }

  try {
    const venda = await criarVenda(r.db, r.ctx.empresaId, r.ctx.userId, validacao.dados, c.env.DB);
    return c.json({ data: detalheParaJson(venda) }, 201);
  } catch (err) {
    return respostaErro(c, err);
  }
});

// ─────────────────────────────────────────────────────────────────────────────
// GET /:id — detalhe
// ─────────────────────────────────────────────────────────────────────────────

vendasV2Routes.get('/:id', async (c) => {
  const r = await contexto(c);
  if ('res' in r) return r.res;
  if (!can(r.ctx.papel, 'vendas', 'ler')) return c.json({ error: 'Sem permissão.' }, 403);

  const id = parseId(c.req.param('id'));
  if (!id) return c.json({ error: 'ID inválido.' }, 400);

  try {
    const venda = await obterVenda(r.db, r.ctx.empresaId, id);
    return c.json({ data: detalheParaJson(venda) });
  } catch (err) {
    return respostaErro(c, err);
  }
});

// ─────────────────────────────────────────────────────────────────────────────
// PATCH /:id — editar (substituição atômica de itens/pagamentos + recálculo)
// ─────────────────────────────────────────────────────────────────────────────

vendasV2Routes.patch('/:id', async (c) => {
  const r = await contexto(c);
  if ('res' in r) return r.res;
  if (!can(r.ctx.papel, 'vendas', 'editar')) return c.json({ error: 'Sem permissão.' }, 403);

  const id = parseId(c.req.param('id'));
  if (!id) return c.json({ error: 'ID inválido.' }, 400);

  let body: unknown;
  try {
    body = await c.req.json();
  } catch {
    return c.json({ error: 'JSON inválido.' }, 400);
  }

  const validacao = validarVendaEdicao(body);
  if (!validacao.ok) {
    return c.json({ error: 'Dados inválidos.', code: 'VALIDACAO', errors: validacao.errors }, 400);
  }

  try {
    const venda = await editarVenda(r.db, r.ctx.empresaId, id, validacao.versao, validacao.dados, c.env.DB);
    return c.json({ data: detalheParaJson(venda) });
  } catch (err) {
    return respostaErro(c, err);
  }
});

// ─────────────────────────────────────────────────────────────────────────────
// POST /:id/cancelar — cancelamento lógico
// ─────────────────────────────────────────────────────────────────────────────

vendasV2Routes.post('/:id/cancelar', async (c) => {
  const r = await contexto(c);
  if ('res' in r) return r.res;
  if (!can(r.ctx.papel, 'vendas', 'editar')) return c.json({ error: 'Sem permissão.' }, 403);

  const id = parseId(c.req.param('id'));
  if (!id) return c.json({ error: 'ID inválido.' }, 400);

  let body: { versao?: unknown } = {};
  try {
    body = await c.req.json();
  } catch {
    return c.json({ error: 'JSON inválido.' }, 400);
  }

  const versao = Number(body.versao);
  if (!Number.isInteger(versao) || versao < 1) {
    return c.json({ error: 'Campo obrigatório: versao.' }, 400);
  }

  try {
    await cancelarVenda(r.db, r.ctx.empresaId, id, versao);
    return c.json({ ok: true });
  } catch (err) {
    return respostaErro(c, err);
  }
});

// ─────────────────────────────────────────────────────────────────────────────
// Serialização pública (snake_case; centavos expostos como inteiros)
// ─────────────────────────────────────────────────────────────────────────────

function listItemParaJson(r: VendaListItem) {
  return {
    id: r.id,
    numero_venda: r.numero_venda,
    vendedor_id: r.vendedor_id,
    cliente_id: r.cliente_id,
    produto_id: r.produto_id,
    data_venda: r.data_venda,
    data_embarque: r.data_embarque,
    data_final: r.data_final,
    cancelada: r.cancelada,
    status: r.status,
    valor_total_centavos: r.valor_total_centavos,
    valor_pago_centavos: r.valor_pago_centavos,
    criado_em: r.criado_em,
  };
}

function detalheParaJson(v: VendaDetalhe) {
  return {
    id: v.id,
    numero_venda: v.numeroVenda,
    vendedor_id: v.vendedorId,
    cliente_id: v.clienteId,
    produto_id: v.produtoId,
    data_venda: v.dataVenda,
    data_lancamento: v.dataLancamento,
    data_embarque: v.dataEmbarque,
    data_final: v.dataFinal,
    cancelada: v.cancelada,
    status: v.status,
    desconto_comercial_aplicado: v.descontoComercialAplicado,
    desconto_comercial_centavos: v.descontoComercialCentavos,
    valor_bruto_centavos: v.valorBrutoCentavos,
    valor_taxas_centavos: v.valorTaxasCentavos,
    valor_total_centavos: v.valorTotalCentavos,
    valor_pago_centavos: v.valorPagoCentavos,
    valor_nao_comissionado_centavos: v.valorNaoComissionadoCentavos,
    notas: v.notas,
    versao: v.versao,
    criado_por: v.criadoPor,
    criado_em: v.criadoEm,
    atualizado_em: v.atualizadoEm,
    itens: v.itens.map((it) => ({
      id: it.id,
      produto_id: it.produtoId,
      numero_recibo: it.numeroRecibo,
      numero_reserva: it.numeroReserva,
      data_servico: it.dataServico,
      data_fim_servico: it.dataFimServico,
      pax: it.pax,
      descricao: it.descricao,
      tipo: it.tipo,
      moeda: it.moeda,
      cambio_centavos: it.cambioCentavos,
      valor_neto_centavos: it.valorNetoCentavos,
      valor_bruto_centavos: it.valorBrutoCentavos,
      valor_taxas_centavos: it.valorTaxasCentavos,
      valor_total_centavos: it.valorTotalCentavos,
      paga_comissao: it.pagaComissao,
      notas: it.notas,
    })),
    pagamentos: v.pagamentos.map((pag) => ({
      id: pag.id,
      forma_id: pag.formaId,
      forma_nome: pag.formaNome,
      operacao: pag.operacao,
      plano: pag.plano,
      valor_bruto_centavos: pag.valorBrutoCentavos,
      desconto_centavos: pag.descontoCentavos,
      valor_total_centavos: pag.valorTotalCentavos,
      parcelas_qtd: pag.parcelasQtd,
      parcelas_valor_centavos: pag.parcelasValorCentavos,
      paga_comissao: pag.pagaComissao,
      parcelas: pag.parcelas.map((par) => ({
        id: par.id,
        numero: par.numero,
        valor_centavos: par.valorCentavos,
        vencimento: par.vencimento,
      })),
    })),
  };
}

function produtoParaJson(p: Produto) {
  return {
    id: p.id,
    nome: p.nome,
    tipo: p.tipo,
    destino: p.destino,
    moeda: p.moeda,
    valor_neto_centavos: p.valorNetoCentavos,
    valor_venda_centavos: p.valorVendaCentavos,
    paga_comissao: p.pagaComissao,
    permite_desconto: p.permiteDesconto,
    desconto_padrao_pct: p.descontoPadraoPct,
    fornecedor: p.fornecedor,
    ativo: p.ativo,
  };
}

function formaParaJson(f: FormaPagamento) {
  return {
    id: f.id,
    nome: f.nome,
    tipo: f.tipo,
    ativo: f.ativo,
  };
}

function parcelaParaJson(p: ParcelaItem) {
  return {
    id: p.id,
    numero: p.numero,
    valor_centavos: p.valorCentavos,
    vencimento: p.vencimento,
    venda_id: p.vendaId,
    numero_venda: p.numeroVenda,
    pagamento_id: p.pagamentoId,
    forma_nome: p.formaNome,
    cliente_id: p.clienteId,
    cancelada: p.cancelada,
    data_venda: p.dataVenda,
  };
}
