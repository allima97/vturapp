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

// ══════════════════════════════════════════════════════════════════════════════
// F4-03 — Consultas / Dashboard / Parcelas
// ══════════════════════════════════════════════════════════════════════════════

// ── Tipos exportados ──────────────────────────────────────────────────────────

export type ResumoVendas = {
  /** Número de vendas não canceladas no período/filtro. */
  totalVendas: number;
  /** Soma de vendas.valor_total_centavos (não canceladas). */
  valorTotalCentavos: number;
  /** Soma de vendas.valor_pago_centavos (não canceladas). */
  valorPagoCentavos: number;
  /** valorTotal − valorPago (calculado). */
  valorAReceberCentavos: number;
  /** Soma de venda_itens.valor_total_centavos para as mesmas vendas. */
  somaItensTotalCentavos: number;
  /** Soma de venda_pagamentos.valor_total_centavos para as mesmas vendas. */
  somaPagamentosTotalCentavos: number;
  /** true quando somaItens === valorTotal (invariante de reconciliação). */
  itensReconciliam: boolean;
  /** true quando somaPagamentos === valorPago (invariante de reconciliação). */
  pagamentosReconciliam: boolean;
};

export type ResumoVendasOptions = {
  /** Data de venda mínima inclusive (YYYY-MM-DD). */
  dataVendaDe?: string;
  /** Data de venda máxima inclusive (YYYY-MM-DD). */
  dataVendaAte?: string;
  /** Filtrar por vendedor (user ID). */
  vendedorId?: string;
  /** Filtrar por cliente. */
  clienteId?: number;
  /** Se true, inclui também as vendas canceladas nos totais. */
  incluirCanceladas?: boolean;
};

export type ParcelaItem = {
  id: number;
  numero: number;
  valorCentavos: number;
  vencimento: string | null;
  vendaId: number;
  numeroVenda: string | null;
  pagamentoId: number;
  formaNome: string;
  clienteId: number | null;
  cancelada: boolean;
  dataVenda: string;
};

export type ListarParcelasOptions = {
  /** Cursor keyset (id da última parcela retornada; retorna id < cursor). */
  cursor?: number;
  limite?: number;
  /** Vencimento mínimo (YYYY-MM-DD). */
  vencimentoDe?: string;
  /** Vencimento máximo (YYYY-MM-DD). */
  vencimentoAte?: string;
  /** Filtrar por vendedor. */
  vendedorId?: string;
  /** Filtrar por cliente. */
  clienteId?: number;
  /** Se true (padrão), exclui parcelas de vendas canceladas. */
  somenteAtivas?: boolean;
};

// ── resumoVendas ──────────────────────────────────────────────────────────────

/**
 * Retorna totais agregados das vendas da empresa.
 *
 * Inclui valores de reconciliação: a soma dos itens e dos pagamentos deve
 * coincidir com os campos de cabeçalho (invariante do contrato financeiro).
 */
export async function resumoVendas(
  db: DrizzleDb,
  empresaId: number,
  opts: ResumoVendasOptions = {}
): Promise<ResumoVendas> {
  const { dataVendaDe, dataVendaAte, vendedorId, clienteId, incluirCanceladas = false } = opts;

  // Condições base para vendas
  const condicoesVenda = [eq(vendas.empresaId, empresaId)];
  if (!incluirCanceladas) condicoesVenda.push(eq(vendas.cancelada, false));
  if (dataVendaDe) condicoesVenda.push(sql`${vendas.dataVenda} >= ${dataVendaDe}`);
  if (dataVendaAte) condicoesVenda.push(sql`${vendas.dataVenda} <= ${dataVendaAte}`);
  if (vendedorId) condicoesVenda.push(eq(vendas.vendedorId, vendedorId));
  if (clienteId !== undefined) condicoesVenda.push(eq(vendas.clienteId, clienteId));

  // Agrega diretamente da tabela vendas
  const [resumo] = await db
    .select({
      total: sql<number>`count(*)`,
      valorTotal: sql<number>`coalesce(sum(${vendas.valorTotalCentavos}), 0)`,
      valorPago: sql<number>`coalesce(sum(${vendas.valorPagoCentavos}), 0)`,
    })
    .from(vendas)
    .where(and(...condicoesVenda));

  // Soma de venda_itens para as mesmas vendas (JOIN)
  const [resumoItens] = await db
    .select({
      somaTotal: sql<number>`coalesce(sum(${vendaItens.valorTotalCentavos}), 0)`,
    })
    .from(vendaItens)
    .innerJoin(vendas, eq(vendaItens.vendaId, vendas.id))
    .where(and(...condicoesVenda));

  // Soma de venda_pagamentos para as mesmas vendas (JOIN)
  const [resumoPagamentos] = await db
    .select({
      somaTotal: sql<number>`coalesce(sum(${vendaPagamentos.valorTotalCentavos}), 0)`,
    })
    .from(vendaPagamentos)
    .innerJoin(vendas, eq(vendaPagamentos.vendaId, vendas.id))
    .where(and(...condicoesVenda));

  const valorTotal = Number(resumo.valorTotal);
  const valorPago = Number(resumo.valorPago);
  const somaItens = Number(resumoItens.somaTotal);
  const somaPags = Number(resumoPagamentos.somaTotal);

  return {
    totalVendas: Number(resumo.total),
    valorTotalCentavos: valorTotal,
    valorPagoCentavos: valorPago,
    valorAReceberCentavos: valorTotal - valorPago,
    somaItensTotalCentavos: somaItens,
    somaPagamentosTotalCentavos: somaPags,
    itensReconciliam: somaItens === valorTotal,
    pagamentosReconciliam: somaPags === valorPago,
  };
}

// ── listarParcelas ────────────────────────────────────────────────────────────

/**
 * Lista parcelas de pagamentos em ordem decrescente de id (keyset pagination).
 *
 * Retorna `temMais = true` quando há mais resultados além do limite pedido.
 * O próximo cursor é o id da última parcela retornada.
 */
export async function listarParcelas(
  db: DrizzleDb,
  empresaId: number,
  opts: ListarParcelasOptions = {}
): Promise<{ parcelas: ParcelaItem[]; temMais: boolean }> {
  const {
    cursor,
    limite = 50,
    vencimentoDe,
    vencimentoAte,
    vendedorId,
    clienteId,
    somenteAtivas = true,
  } = opts;

  const limiteFetch = Math.min(limite + 1, 201);

  const condicoes = [eq(vendaParcelas.empresaId, empresaId)];
  if (cursor !== undefined) condicoes.push(lt(vendaParcelas.id, cursor));
  if (vencimentoDe) condicoes.push(sql`${vendaParcelas.vencimento} >= ${vencimentoDe}`);
  if (vencimentoAte) condicoes.push(sql`${vendaParcelas.vencimento} <= ${vencimentoAte}`);
  if (somenteAtivas) condicoes.push(eq(vendas.cancelada, false));
  if (vendedorId) condicoes.push(eq(vendas.vendedorId, vendedorId));
  if (clienteId !== undefined) condicoes.push(eq(vendas.clienteId, clienteId));

  const rows = await db
    .select({
      id: vendaParcelas.id,
      numero: vendaParcelas.numero,
      valorCentavos: vendaParcelas.valorCentavos,
      vencimento: vendaParcelas.vencimento,
      vendaId: vendas.id,
      numeroVenda: vendas.numeroVenda,
      pagamentoId: vendaPagamentos.id,
      formaNome: vendaPagamentos.formaNome,
      clienteId: vendas.clienteId,
      cancelada: vendas.cancelada,
      dataVenda: vendas.dataVenda,
    })
    .from(vendaParcelas)
    .innerJoin(vendaPagamentos, eq(vendaParcelas.pagamentoId, vendaPagamentos.id))
    .innerJoin(vendas, eq(vendaPagamentos.vendaId, vendas.id))
    .where(and(...condicoes))
    .orderBy(desc(vendaParcelas.id))
    .limit(limiteFetch);

  const temMais = rows.length > limite;
  const parcelas = rows.slice(0, limite).map((r) => ({
    id: r.id,
    numero: r.numero,
    valorCentavos: r.valorCentavos,
    vencimento: r.vencimento ?? null,
    vendaId: r.vendaId,
    numeroVenda: r.numeroVenda ?? null,
    pagamentoId: r.pagamentoId,
    formaNome: r.formaNome,
    clienteId: r.clienteId ?? null,
    cancelada: r.cancelada,
    dataVenda: r.dataVenda,
  }));

  return { parcelas, temMais };
}

// ─────────────────────────────────────────────────────────────────────────────
// F4-02 — Comissão: cálculo puro com arredondamento
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Resultado do cálculo de comissão sobre uma venda.
 */
export type ResultadoComissao = {
  /** Base sobre a qual a comissão incide (centavos). */
  baseComissionavelCentavos: number;
  /** Taxa usada (ex: 10.5 = 10,5%). */
  taxaPct: number;
  /** Comissão calculada (centavos, arredondamento banker-round / half-even). */
  comissaoCentavos: number;
  /** Valor excluído da base (itens/pagamentos com paga_comissao=false). */
  valorNaoComissionadoCentavos: number;
};

/**
 * Arredondamento "half-even" (banker's rounding):
 * evita acúmulo de erros quando se calculam muitas parcelas com o mesmo offset.
 *
 * Exemplos:
 *   roundHalfEven(0.5) → 0  (0.5 → arredonda para o par mais próximo, 0)
 *   roundHalfEven(1.5) → 2  (1.5 → arredonda para o par mais próximo, 2)
 *   roundHalfEven(2.5) → 2  (2.5 → arredonda para o par mais próximo, 2)
 *   roundHalfEven(3.5) → 4
 *   roundHalfEven(2.3) → 2  (comportamento normal abaixo de 0.5)
 *   roundHalfEven(2.7) → 3  (comportamento normal acima de 0.5)
 */
export function roundHalfEven(x: number): number {
  const floor = Math.floor(x);
  const diff = x - floor;
  if (Math.abs(diff - 0.5) < Number.EPSILON) {
    // exatamente .5: arredonda para o par
    return floor % 2 === 0 ? floor : floor + 1;
  }
  return Math.round(x);
}

/**
 * Calcula a comissão sobre uma venda a partir dos seus itens e pagamentos.
 *
 * Base comissionável = soma dos `valor_total_centavos` dos itens onde
 * `paga_comissao = true`. O campo `valor_nao_comissionado_centavos` do
 * cabeçalho é tratado como confirmação (auditoria), mas o cálculo usa os
 * itens para máxima precisão.
 *
 * Arredondamento: banker's rounding (half-even) para minimizar acúmulo de
 * erro em séries de vendas com o mesmo percentual.
 *
 * Exemplos documentados (taxaPct = 10):
 *   valorTotal = 10_000 (R$ 100,00) → comissao = 1_000 (R$ 10,00)
 *   valorTotal =  3_333 (R$  33,33) → comissao =   333 (R$  3,33) [truncado = 333.3]
 *   valorTotal =  1_001 (R$  10,01) → comissao =   100 (R$  1,00) [100.1 → 100]
 *   valorTotal =  1_005 (R$  10,05) → comissao =   100 (R$  1,00) [100.5 → par, 100]
 *   valorTotal =  3_005 (R$  30,05) → comissao =   300 (R$  3,00) [300.5 → par, 300]
 *   valorTotal =  1_015 (R$  10,15) → comissao =   102 (R$  1,02) [101.5 → par, 102]
 *
 * @param venda Detalhe da venda com itens.
 * @param taxaPct Percentual da comissão (0–100). Ex: 10.5 para 10,5%.
 */
export function calcularComissao(
  venda: Pick<VendaDetalhe, 'itens' | 'valorNaoComissionadoCentavos'>,
  taxaPct: number
): ResultadoComissao {
  if (taxaPct < 0 || taxaPct > 100) {
    throw new VendaError('taxaPct deve estar entre 0 e 100.', 'VALIDACAO');
  }

  const baseComissionavelCentavos = venda.itens
    .filter((it) => it.pagaComissao)
    .reduce((s, it) => s + it.valorTotalCentavos, 0);

  const comissaoCentavos = roundHalfEven(baseComissionavelCentavos * taxaPct / 100);

  return {
    baseComissionavelCentavos,
    taxaPct,
    comissaoCentavos,
    valorNaoComissionadoCentavos: venda.valorNaoComissionadoCentavos,
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// F4-02 — Estorno: reverção financeira de pagamento
// ─────────────────────────────────────────────────────────────────────────────

export type EstornoInput = {
  /** Forma de pagamento original (ou "Estorno" como texto livre). */
  formaNome: string;
  /** Valor a estornar em centavos (positivo; será subtraído do valor_pago). */
  valorCentavos: number;
  /** Motivo textual registrado no campo operacao. */
  motivo?: string;
  /** Versão atual da venda (concorrência otimista). */
  versaoAtual: number;
};

/**
 * Registra um estorno financeiro na venda.
 *
 * Diferença em relação ao cancelamento lógico:
 *   - `cancelarVenda` marca a venda como inativa (cancelada=true) e impede
 *     novas operações; o status derivado muda para "cancelada".
 *   - `estornarPagamento` adiciona uma entrada de pagamento negativa
 *     (operacao='estorno') e reduz `valor_pago_centavos` do cabeçalho;
 *     a venda permanece ativa e pode receber novos pagamentos.
 *
 * Invariantes preservados:
 *   1. Tenant isolation: empresa_id do contexto, nunca do body.
 *   2. Concorrência otimista: versao é verificada e incrementada.
 *   3. Idempotência: não aplicável ao estorno (cada estorno é intencional);
 *      o chamador deve controlar duplicação via UI/idempotência de rota.
 *   4. Venda cancelada não aceita estorno.
 *   5. valorCentavos > 0 (estorno não pode ser zero ou negativo).
 *
 * Lança VendaError em:
 *   - NAO_ENCONTRADA
 *   - CANCELADA
 *   - CONFLITO_VERSAO
 *   - VALIDACAO (valor <= 0)
 */
export async function estornarPagamento(
  db: DrizzleDb,
  empresaId: number,
  vendaId: number,
  input: EstornoInput
): Promise<VendaDetalhe> {
  if (input.valorCentavos <= 0) {
    throw new VendaError('Valor do estorno deve ser maior que zero.', 'VALIDACAO');
  }

  const [existente] = await db
    .select({
      id: vendas.id,
      cancelada: vendas.cancelada,
      versao: vendas.versao,
      valorPagoCentavos: vendas.valorPagoCentavos,
    })
    .from(vendas)
    .where(and(eq(vendas.id, vendaId), eq(vendas.empresaId, empresaId)));

  if (!existente) throw new VendaError('Venda não encontrada.', 'NAO_ENCONTRADA');
  if (existente.cancelada) throw new VendaError('Venda cancelada não aceita estorno.', 'CANCELADA');
  if (existente.versao !== input.versaoAtual) {
    throw new VendaError('Conflito de versão.', 'CONFLITO_VERSAO');
  }

  const agora = new Date().toISOString();
  const novaVersao = input.versaoAtual + 1;
  // valor_pago pode ficar negativo em caso de estorno maior que o pago (raro, mas válido)
  const novoValorPago = existente.valorPagoCentavos - input.valorCentavos;

  // Inserir linha de estorno com valor negativo
  await db.insert(vendaPagamentos).values({
    empresaId,
    vendaId,
    formaNome: input.formaNome,
    operacao: `estorno${input.motivo ? ': ' + input.motivo : ''}`,
    valorBrutoCentavos: -input.valorCentavos,
    descontoCentavos: 0,
    valorTotalCentavos: -input.valorCentavos,
    parcelasQtd: 1,
    parcelasValorCentavos: -input.valorCentavos,
    pagaComissao: false,
    criadoEm: agora,
  });

  // Atualizar cabeçalho com concorrência otimista
  const resultado = await db
    .update(vendas)
    .set({
      valorPagoCentavos: novoValorPago,
      versao: novaVersao,
      atualizadoEm: agora,
    })
    .where(and(
      eq(vendas.id, vendaId),
      eq(vendas.empresaId, empresaId),
      eq(vendas.versao, input.versaoAtual)
    ))
    .returning({ id: vendas.id });

  if (resultado.length === 0) throw new VendaError('Conflito de versão.', 'CONFLITO_VERSAO');

  return obterVenda(db, empresaId, vendaId);
}
