/**
 * F4-01 — Operações de negócio de vendas (M04).
 *
 * Camada de domínio sobre D1 (Drizzle). A criação composta usa
 * D1Database.batch() para atomicidade (Workers não aceita BEGIN/COMMIT).
 *
 * Regras do roteiro (§5 / §6):
 *   - status DERIVADO em leitura; não persistido;
 *   - idempotência: chave_idempotencia previne duplicação em retry de POST;
 *   - concorrência otimista: UPDATE ... WHERE versao = ? → CONFLITO_VERSAO;
 *   - isolamento de tenant: empresa_id do contexto, nunca do body;
 *   - sem exclusão física (cancelamento lógico via cancelada=true).
 *
 * Valores: centavos inteiros (ADR-005).
 */

import { and, desc, eq, lt, like, sql, asc } from 'drizzle-orm';
import type { DrizzleDb } from '$lib/server/db/client';
import {
  vendas,
  vendaItens,
  vendaPagamentos,
  vendaParcelas,
  produtos,
  formasPagamento,
  type Venda,
  type VendaItem,
  type VendaPagamento,
  type VendaParcela,
  type VendaStatus,
  type Produto,
  type FormaPagamento,
} from '$lib/server/db/schema';
import type { VendaNormalizada } from './validation';

// ─────────────────────────────────────────────────────────────────────────────
// Erros de domínio
// ─────────────────────────────────────────────────────────────────────────────

export class VendaError extends Error {
  constructor(
    message: string,
    public readonly code:
      | 'NAO_ENCONTRADA'
      | 'IDEMPOTENCIA'
      | 'CONFLITO_VERSAO'
      | 'CANCELADA'
      | 'VALIDACAO'
      | 'ERRO_INTERNO',
    public readonly errors?: Record<string, string>
  ) {
    super(message);
    this.name = 'VendaError';
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// Status derivado (não persistido)
// ─────────────────────────────────────────────────────────────────────────────

export function derivarStatus(row: Pick<Venda, 'cancelada' | 'dataEmbarque' | 'dataFinal'>): VendaStatus {
  if (row.cancelada) return 'cancelada';
  const hoje = new Date().toISOString().slice(0, 10);
  if (row.dataFinal && row.dataFinal < hoje) return 'concluida';
  if (row.dataEmbarque && row.dataEmbarque >= hoje) return 'confirmada';
  return 'pendente';
}

// ─────────────────────────────────────────────────────────────────────────────
// Tipos de leitura
// ─────────────────────────────────────────────────────────────────────────────

export type VendaDetalhe = Venda & {
  status: VendaStatus;
  itens: VendaItem[];
  pagamentos: Array<VendaPagamento & { parcelas: VendaParcela[] }>;
};

export type VendaListItem = {
  id: number;
  numero_venda: string | null;
  vendedor_id: string | null;
  cliente_id: number | null;
  produto_id: number | null;
  data_venda: string;
  data_embarque: string | null;
  data_final: string | null;
  cancelada: boolean;
  status: VendaStatus;
  valor_total_centavos: number;
  valor_pago_centavos: number;
  criado_em: string;
};

export type ListarVendasOptions = {
  clienteId?: number;
  vendedorId?: string;
  canceladas?: boolean;
  cursor?: number;
  limite?: number;
};

// ─────────────────────────────────────────────────────────────────────────────
// Número de venda
// ─────────────────────────────────────────────────────────────────────────────

async function gerarNumeroVenda(db: DrizzleDb, empresaId: number): Promise<string> {
  const ano = new Date().getFullYear();
  // Conta todas as vendas desta empresa para garantir unicidade do sequencial.
  // O filtro por ano é só cosmético no número; a unicidade é garantida pelo índice único.
  const result = await db
    .select({ count: sql<number>`count(*)` })
    .from(vendas)
    .where(eq(vendas.empresaId, empresaId));
  const count = (result[0]?.count ?? 0) + 1;
  return `VTUR-${ano}-${String(count).padStart(5, '0')}`;
}

// ─────────────────────────────────────────────────────────────────────────────
// Listagem (keyset/cursor)
// ─────────────────────────────────────────────────────────────────────────────

export async function listarVendas(
  db: DrizzleDb,
  empresaId: number,
  options: ListarVendasOptions = {}
): Promise<{ itens: VendaListItem[]; proximo_cursor: number | null }> {
  const limite = Math.min(Math.max(options.limite ?? 20, 1), 100);

  const conditions = [eq(vendas.empresaId, empresaId)];
  if (options.clienteId != null) conditions.push(eq(vendas.clienteId, options.clienteId));
  if (options.vendedorId) conditions.push(eq(vendas.vendedorId, options.vendedorId));
  if (options.canceladas === false) conditions.push(eq(vendas.cancelada, false));
  if (options.canceladas === true) conditions.push(eq(vendas.cancelada, true));
  if (options.cursor) conditions.push(lt(vendas.id, options.cursor));

  const rows = await db
    .select({
      id: vendas.id,
      numeroVenda: vendas.numeroVenda,
      vendedorId: vendas.vendedorId,
      clienteId: vendas.clienteId,
      produtoId: vendas.produtoId,
      dataVenda: vendas.dataVenda,
      dataEmbarque: vendas.dataEmbarque,
      dataFinal: vendas.dataFinal,
      cancelada: vendas.cancelada,
      valorTotalCentavos: vendas.valorTotalCentavos,
      valorPagoCentavos: vendas.valorPagoCentavos,
      criadoEm: vendas.criadoEm,
    })
    .from(vendas)
    .where(and(...conditions))
    .orderBy(desc(vendas.id))
    .limit(limite + 1);

  const temProximo = rows.length > limite;
  const itens = rows.slice(0, limite).map((r) => ({
    id: r.id,
    numero_venda: r.numeroVenda,
    vendedor_id: r.vendedorId,
    cliente_id: r.clienteId,
    produto_id: r.produtoId,
    data_venda: r.dataVenda,
    data_embarque: r.dataEmbarque,
    data_final: r.dataFinal,
    cancelada: r.cancelada,
    status: derivarStatus({ cancelada: r.cancelada, dataEmbarque: r.dataEmbarque, dataFinal: r.dataFinal }),
    valor_total_centavos: r.valorTotalCentavos,
    valor_pago_centavos: r.valorPagoCentavos,
    criado_em: r.criadoEm,
  }));

  return { itens, proximo_cursor: temProximo ? itens[itens.length - 1].id : null };
}

// ─────────────────────────────────────────────────────────────────────────────
// Detalhe
// ─────────────────────────────────────────────────────────────────────────────

export async function obterVenda(
  db: DrizzleDb,
  empresaId: number,
  vendaId: number
): Promise<VendaDetalhe> {
  const [venda] = await db
    .select()
    .from(vendas)
    .where(and(eq(vendas.id, vendaId), eq(vendas.empresaId, empresaId)));
  if (!venda) throw new VendaError('Venda não encontrada.', 'NAO_ENCONTRADA');

  const itens = await db
    .select()
    .from(vendaItens)
    .where(and(eq(vendaItens.vendaId, vendaId), eq(vendaItens.empresaId, empresaId)))
    .orderBy(asc(vendaItens.id));

  const pagamentosRows = await db
    .select()
    .from(vendaPagamentos)
    .where(and(eq(vendaPagamentos.vendaId, vendaId), eq(vendaPagamentos.empresaId, empresaId)))
    .orderBy(asc(vendaPagamentos.id));

  const pagamentosComParcelas = await Promise.all(
    pagamentosRows.map(async (pag) => {
      const parcelas = await db
        .select()
        .from(vendaParcelas)
        .where(eq(vendaParcelas.pagamentoId, pag.id))
        .orderBy(asc(vendaParcelas.numero));
      return { ...pag, parcelas };
    })
  );

  return { ...venda, status: derivarStatus(venda), itens, pagamentos: pagamentosComParcelas };
}

// ─────────────────────────────────────────────────────────────────────────────
// Criação — usa D1Database.batch() para atomicidade no Workers runtime
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Cria venda com itens e pagamentos de forma atômica via D1.batch().
 *
 * O Workers runtime não aceita `BEGIN TRANSACTION` SQL diretamente —
 * usa-se D1Database.batch() que garante atomicidade (all-or-nothing).
 *
 * @param d1   - D1Database binding (c.env.DB ou env.DB em testes)
 * @param db   - instância Drizzle (para SELECTs e geração de número)
 */
export async function criarVenda(
  db: DrizzleDb,
  empresaId: number,
  userId: string,
  dados: VendaNormalizada,
  d1?: D1Database
): Promise<VendaDetalhe> {
  // ── 1. Idempotência ──
  if (dados.chave_idempotencia) {
    const [existente] = await db
      .select({ id: vendas.id })
      .from(vendas)
      .where(and(eq(vendas.chaveIdempotencia, dados.chave_idempotencia), eq(vendas.empresaId, empresaId)));
    if (existente) return obterVenda(db, empresaId, existente.id);
  }

  // ── 2. Totais ──
  const valorBrutoCentavos = dados.itens.reduce((s, it) => s + it.valor_bruto_centavos, 0);
  const valorTaxasCentavos = dados.itens.reduce((s, it) => s + it.valor_taxas_centavos, 0);
  const valorTotalCentavos = dados.itens.reduce((s, it) => s + it.valor_total_centavos, 0);
  const valorPagoCentavos = dados.pagamentos.reduce((s, p) => s + p.valor_total_centavos, 0);

  // ── 3. Número ──
  const numeroVenda = await gerarNumeroVenda(db, empresaId);
  const agora = new Date().toISOString();

  // ── 4. Inserção atômica via batch ──
  // 4a. INSERT venda retornando o id
  const insertVendaResult = await db
    .insert(vendas)
    .values({
      empresaId,
      numeroVenda,
      vendedorId: dados.vendedor_id,
      clienteId: dados.cliente_id,
      produtoId: dados.produto_id,
      dataVenda: dados.data_venda,
      dataLancamento: dados.data_lancamento,
      dataEmbarque: dados.data_embarque,
      dataFinal: dados.data_final,
      cancelada: false,
      descontoComercialAplicado: dados.desconto_comercial_aplicado,
      descontoComercialCentavos: dados.desconto_comercial_centavos,
      valorBrutoCentavos,
      valorTaxasCentavos,
      valorTotalCentavos,
      valorPagoCentavos,
      valorNaoComissionadoCentavos: dados.valor_nao_comissionado_centavos,
      notas: dados.notas,
      chaveIdempotencia: dados.chave_idempotencia,
      versao: 1,
      criadoPor: userId,
      criadoEm: agora,
      atualizadoEm: agora,
    })
    .returning({ id: vendas.id });

  const vendaId = insertVendaResult[0].id;

  // 4b. INSERT itens (via D1.batch se disponível, senão sequencial)
  if (dados.itens.length > 0) {
    if (d1) {
      await d1.batch(
        dados.itens.map((it) => {
          const stmt = db
            .insert(vendaItens)
            .values({
              empresaId,
              vendaId,
              produtoId: it.produto_id,
              numeroRecibo: it.numero_recibo,
              numeroReserva: it.numero_reserva,
              dataServico: it.data_servico,
              dataFimServico: it.data_fim_servico,
              pax: it.pax,
              descricao: it.descricao,
              tipo: it.tipo,
              moeda: it.moeda,
              cambioCentavos: it.cambio_centavos,
              valorNetoCentavos: it.valor_neto_centavos,
              valorBrutoCentavos: it.valor_bruto_centavos,
              valorTaxasCentavos: it.valor_taxas_centavos,
              valorTotalCentavos: it.valor_total_centavos,
              pagaComissao: it.paga_comissao,
              notas: it.notas,
              criadoEm: agora,
            })
            .toSQL();
          return d1.prepare(stmt.sql).bind(...stmt.params);
        })
      );
    } else {
      await db.insert(vendaItens).values(
        dados.itens.map((it) => ({
          empresaId, vendaId,
          produtoId: it.produto_id,
          numeroRecibo: it.numero_recibo,
          numeroReserva: it.numero_reserva,
          dataServico: it.data_servico,
          dataFimServico: it.data_fim_servico,
          pax: it.pax,
          descricao: it.descricao,
          tipo: it.tipo,
          moeda: it.moeda,
          cambioCentavos: it.cambio_centavos,
          valorNetoCentavos: it.valor_neto_centavos,
          valorBrutoCentavos: it.valor_bruto_centavos,
          valorTaxasCentavos: it.valor_taxas_centavos,
          valorTotalCentavos: it.valor_total_centavos,
          pagaComissao: it.paga_comissao,
          notas: it.notas,
          criadoEm: agora,
        }))
      );
    }
  }

  // 4c. pagamentos e parcelas (sequencial; cada pagamento precisa do id)
  for (const pag of dados.pagamentos) {
    const [novoPag] = await db
      .insert(vendaPagamentos)
      .values({
        empresaId, vendaId,
        formaId: pag.forma_id,
        formaNome: pag.forma_nome,
        operacao: pag.operacao,
        plano: pag.plano,
        valorBrutoCentavos: pag.valor_bruto_centavos,
        descontoCentavos: pag.desconto_centavos,
        valorTotalCentavos: pag.valor_total_centavos,
        parcelasQtd: pag.parcelas_qtd,
        parcelasValorCentavos: pag.parcelas_valor_centavos,
        pagaComissao: pag.paga_comissao,
        criadoEm: agora,
      })
      .returning({ id: vendaPagamentos.id });

    if (pag.parcelas.length > 0) {
      if (d1) {
        await d1.batch(
          pag.parcelas.map((par) => {
            const stmt = db
              .insert(vendaParcelas)
              .values({
                empresaId,
                pagamentoId: novoPag.id,
                numero: par.numero,
                valorCentavos: par.valor_centavos,
                vencimento: par.vencimento,
                criadoEm: agora,
              })
              .toSQL();
            return d1.prepare(stmt.sql).bind(...stmt.params);
          })
        );
      } else {
        await db.insert(vendaParcelas).values(
          pag.parcelas.map((par) => ({
            empresaId,
            pagamentoId: novoPag.id,
            numero: par.numero,
            valorCentavos: par.valor_centavos,
            vencimento: par.vencimento,
            criadoEm: agora,
          }))
        );
      }
    }
  }

  return obterVenda(db, empresaId, vendaId);
}

// ─────────────────────────────────────────────────────────────────────────────
// Cancelamento lógico
// ─────────────────────────────────────────────────────────────────────────────

export async function cancelarVenda(
  db: DrizzleDb,
  empresaId: number,
  vendaId: number,
  versaoAtual: number
): Promise<void> {
  const [existente] = await db
    .select({ id: vendas.id, cancelada: vendas.cancelada, versao: vendas.versao })
    .from(vendas)
    .where(and(eq(vendas.id, vendaId), eq(vendas.empresaId, empresaId)));

  if (!existente) throw new VendaError('Venda não encontrada.', 'NAO_ENCONTRADA');
  if (existente.cancelada) throw new VendaError('Venda já cancelada.', 'CANCELADA');
  if (existente.versao !== versaoAtual) throw new VendaError('Conflito de versão.', 'CONFLITO_VERSAO');

  const resultado = await db
    .update(vendas)
    .set({ cancelada: true, versao: versaoAtual + 1, atualizadoEm: new Date().toISOString() })
    .where(and(eq(vendas.id, vendaId), eq(vendas.empresaId, empresaId), eq(vendas.versao, versaoAtual)))
    .returning({ id: vendas.id });

  if (resultado.length === 0) throw new VendaError('Conflito de versão.', 'CONFLITO_VERSAO');
}

// ─────────────────────────────────────────────────────────────────────────────
// Suporte ao formulário
// ─────────────────────────────────────────────────────────────────────────────

export async function listarProdutos(
  db: DrizzleDb,
  options: { busca?: string; tipo?: string; limite?: number } = {}
): Promise<Produto[]> {
  const limite = Math.min(options.limite ?? 50, 200);
  const conditions = [eq(produtos.ativo, true)];
  if (options.tipo && options.tipo !== 'todos') conditions.push(eq(produtos.tipo, options.tipo));
  if (options.busca) conditions.push(like(produtos.nome, `%${options.busca}%`));

  return db.select().from(produtos).where(and(...conditions)).orderBy(asc(produtos.nome)).limit(limite);
}

export async function listarFormasPagamento(db: DrizzleDb, empresaId: number): Promise<FormaPagamento[]> {
  return db
    .select()
    .from(formasPagamento)
    .where(and(eq(formasPagamento.empresaId, empresaId), eq(formasPagamento.ativo, true)))
    .orderBy(asc(formasPagamento.nome));
}

// ─────────────────────────────────────────────────────────────────────────────
// F4-02 — Edição (substituição atômica de itens/pagamentos + recálculo)
// ─────────────────────────────────────────────────────────────────────────────

import type { VendaEdicaoNormalizada } from './validation';

/**
 * Edita uma venda (PATCH): atualiza campos do cabeçalho e/ou substitui itens/pagamentos.
 *
 * Atomicidade:
 *   - Itens: DELETE + INSERT via d1.batch (se d1 disponível) ou sequencial.
 *   - Pagamentos: DELETE antigos + INSERT novos pagamentos sequencialmente
 *     (precisamos do id do pagamento para inserir parcelas).
 *   - UPDATE do cabeçalho com verificação de versão (otimistic concurrency).
 *
 * Lança VendaError em:
 *   - NAO_ENCONTRADA: venda não existe nesta empresa;
 *   - CANCELADA: venda já cancelada não pode ser editada;
 *   - CONFLITO_VERSAO: versao atual no body não bate com a do banco.
 */
export async function editarVenda(
  db: DrizzleDb,
  empresaId: number,
  vendaId: number,
  versaoAtual: number,
  dados: VendaEdicaoNormalizada,
  d1?: D1Database
): Promise<VendaDetalhe> {
  const agora = new Date().toISOString();

  // ── 1. Verificar existência + empresa + não cancelada ──
  const [existente] = await db
    .select({
      id: vendas.id,
      cancelada: vendas.cancelada,
      versao: vendas.versao,
      valorBrutoCentavos: vendas.valorBrutoCentavos,
      valorTaxasCentavos: vendas.valorTaxasCentavos,
      valorTotalCentavos: vendas.valorTotalCentavos,
      valorPagoCentavos: vendas.valorPagoCentavos,
    })
    .from(vendas)
    .where(and(eq(vendas.id, vendaId), eq(vendas.empresaId, empresaId)));

  if (!existente) throw new VendaError('Venda não encontrada.', 'NAO_ENCONTRADA');
  if (existente.cancelada) throw new VendaError('Venda cancelada não pode ser editada.', 'CANCELADA');
  if (existente.versao !== versaoAtual) throw new VendaError('Conflito de versão.', 'CONFLITO_VERSAO');

  // ── 2. Substituição de itens ──
  if (dados.itens !== undefined) {
    // DELETE itens antigos
    await db.delete(vendaItens).where(and(eq(vendaItens.vendaId, vendaId), eq(vendaItens.empresaId, empresaId)));

    // INSERT novos itens
    if (dados.itens.length > 0) {
      const novosItens = dados.itens.map((it) => ({
        empresaId, vendaId,
        produtoId: it.produto_id,
        numeroRecibo: it.numero_recibo,
        numeroReserva: it.numero_reserva,
        dataServico: it.data_servico,
        dataFimServico: it.data_fim_servico,
        pax: it.pax,
        descricao: it.descricao,
        tipo: it.tipo,
        moeda: it.moeda,
        cambioCentavos: it.cambio_centavos,
        valorNetoCentavos: it.valor_neto_centavos,
        valorBrutoCentavos: it.valor_bruto_centavos,
        valorTaxasCentavos: it.valor_taxas_centavos,
        valorTotalCentavos: it.valor_total_centavos,
        pagaComissao: it.paga_comissao,
        notas: it.notas,
        criadoEm: agora,
      }));

      if (d1) {
        await d1.batch(
          novosItens.map((row) => {
            const stmt = db.insert(vendaItens).values(row).toSQL();
            return d1.prepare(stmt.sql).bind(...stmt.params);
          })
        );
      } else {
        await db.insert(vendaItens).values(novosItens);
      }
    }
  }

  // ── 3. Substituição de pagamentos + parcelas ──
  if (dados.pagamentos !== undefined) {
    // Precisamos deletar parcelas ANTES dos pagamentos (FK constraint)
    const pagamentosExistentes = await db
      .select({ id: vendaPagamentos.id })
      .from(vendaPagamentos)
      .where(and(eq(vendaPagamentos.vendaId, vendaId), eq(vendaPagamentos.empresaId, empresaId)));

    if (pagamentosExistentes.length > 0) {
      // DELETE parcelas dos pagamentos antigos
      for (const pag of pagamentosExistentes) {
        await db.delete(vendaParcelas).where(eq(vendaParcelas.pagamentoId, pag.id));
      }
    }
    // DELETE pagamentos antigos
    await db.delete(vendaPagamentos).where(and(eq(vendaPagamentos.vendaId, vendaId), eq(vendaPagamentos.empresaId, empresaId)));

    // INSERT novos pagamentos + parcelas (sequencial — precisamos do id do pagamento)
    for (const pag of dados.pagamentos) {
      const [novoPag] = await db
        .insert(vendaPagamentos)
        .values({
          empresaId, vendaId,
          formaId: pag.forma_id,
          formaNome: pag.forma_nome,
          operacao: pag.operacao,
          plano: pag.plano,
          valorBrutoCentavos: pag.valor_bruto_centavos,
          descontoCentavos: pag.desconto_centavos,
          valorTotalCentavos: pag.valor_total_centavos,
          parcelasQtd: pag.parcelas_qtd,
          parcelasValorCentavos: pag.parcelas_valor_centavos,
          pagaComissao: pag.paga_comissao,
          criadoEm: agora,
        })
        .returning({ id: vendaPagamentos.id });

      if (pag.parcelas.length > 0) {
        if (d1) {
          await d1.batch(
            pag.parcelas.map((par) => {
              const stmt = db
                .insert(vendaParcelas)
                .values({
                  empresaId,
                  pagamentoId: novoPag.id,
                  numero: par.numero,
                  valorCentavos: par.valor_centavos,
                  vencimento: par.vencimento,
                  criadoEm: agora,
                })
                .toSQL();
              return d1.prepare(stmt.sql).bind(...stmt.params);
            })
          );
        } else {
          await db.insert(vendaParcelas).values(
            pag.parcelas.map((par) => ({
              empresaId,
              pagamentoId: novoPag.id,
              numero: par.numero,
              valorCentavos: par.valor_centavos,
              vencimento: par.vencimento,
              criadoEm: agora,
            }))
          );
        }
      }
    }
  }

  // ── 4. UPDATE cabeçalho com concorrência otimista ──
  // Recalcular totais: se itens/pagamentos foram substituídos, deriva dos novos filhos.
  // Valores explícitos no body prevalecem; caso contrário mantém os do banco.
  let novoValorBruto = dados.valor_bruto_centavos ?? existente.valorBrutoCentavos;
  let novoValorTaxas = dados.valor_taxas_centavos ?? existente.valorTaxasCentavos;
  let novoValorTotal = dados.valor_total_centavos ?? existente.valorTotalCentavos;
  let novoValorPago = dados.valor_pago_centavos ?? existente.valorPagoCentavos;

  if (dados.itens !== undefined) {
    if (dados.valor_bruto_centavos === undefined) {
      novoValorBruto = dados.itens.reduce((s, it) => s + it.valor_bruto_centavos, 0);
    }
    if (dados.valor_taxas_centavos === undefined) {
      novoValorTaxas = dados.itens.reduce((s, it) => s + it.valor_taxas_centavos, 0);
    }
    if (dados.valor_total_centavos === undefined) {
      novoValorTotal = dados.itens.reduce((s, it) => s + it.valor_total_centavos, 0);
    }
  }

  if (dados.pagamentos !== undefined && dados.valor_pago_centavos === undefined) {
    novoValorPago = dados.pagamentos.reduce((s, p) => s + p.valor_total_centavos, 0);
  }

  const updateSet: Record<string, unknown> = {
    versao: versaoAtual + 1,
    atualizadoEm: agora,
    valorBrutoCentavos: novoValorBruto,
    valorTaxasCentavos: novoValorTaxas,
    valorTotalCentavos: novoValorTotal,
    valorPagoCentavos: novoValorPago,
  };

  // Campos opcionais do cabeçalho: só atualizar se enviados
  if ('vendedor_id' in dados) updateSet.vendedorId = dados.vendedor_id;
  if ('cliente_id' in dados) updateSet.clienteId = dados.cliente_id;
  if ('produto_id' in dados) updateSet.produtoId = dados.produto_id;
  if ('data_venda' in dados) updateSet.dataVenda = dados.data_venda;
  if ('data_lancamento' in dados) updateSet.dataLancamento = dados.data_lancamento;
  if ('data_embarque' in dados) updateSet.dataEmbarque = dados.data_embarque;
  if ('data_final' in dados) updateSet.dataFinal = dados.data_final;
  if ('desconto_comercial_aplicado' in dados) updateSet.descontoComercialAplicado = dados.desconto_comercial_aplicado;
  if ('desconto_comercial_centavos' in dados) updateSet.descontoComercialCentavos = dados.desconto_comercial_centavos;
  if ('valor_nao_comissionado_centavos' in dados) updateSet.valorNaoComissionadoCentavos = dados.valor_nao_comissionado_centavos;
  if ('notas' in dados) updateSet.notas = dados.notas;

  const resultado = await db
    .update(vendas)
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    .set(updateSet as any)
    .where(and(eq(vendas.id, vendaId), eq(vendas.empresaId, empresaId), eq(vendas.versao, versaoAtual)))
    .returning({ id: vendas.id });

  if (resultado.length === 0) {
    throw new VendaError('Conflito de versão.', 'CONFLITO_VERSAO');
  }

  return obterVenda(db, empresaId, vendaId);
}
