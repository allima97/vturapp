/**
 * F3-01 — Operações de negócio de clientes (M02).
 *
 * Camada de domínio sobre D1 (Drizzle) + R2 (anexos privados).
 * Isolamento de tenant (F2-04): toda consulta filtra empresa_id do contexto
 * autenticado; o body nunca fornece empresa_id (injectTenantId).
 *
 * Regras relevantes do roteiro (§5):
 *   - edição concorrente com versão (conflito 409, nunca sobrescrever);
 *   - documento único por empresa (constraint) + resposta idempotente;
 *   - sem exclusão física: desativação preserva histórico (vendas — F4);
 *   - R2 + D1 não são transação conjunta: upload → INSERT, com compensação
 *     (delete do objeto) se o INSERT falhar; download mediado (a chave R2
 *     nunca sai do servidor).
 */

import { and, desc, eq, lt, like, or } from 'drizzle-orm';
import type { DrizzleDb } from '$lib/server/db/client';
import { clientes, clienteAnexos, type Cliente, type ClienteAnexo } from '$lib/server/db/schema';
import { injectTenantId } from '$lib/server/tenant/guard';
import { r2Upload, r2Delete, r2Key } from '$lib/server/r2/client';
import { validateUploadedFile } from '$lib/server/uploadValidation';
import { validarCliente, type ClienteInput } from './validation';

export class ClienteError extends Error {
  constructor(
    message: string,
    public readonly code:
      | 'NAO_ENCONTRADO'
      | 'DOCUMENTO_DUPLICADO'
      | 'CONFLITO_VERSAO'
      | 'VALIDACAO'
      | 'ANEXO_INVALIDO'
      | 'ERRO_INTERNO',
    public readonly errors?: Record<string, string>
  ) {
    super(message);
    this.name = 'ClienteError';
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// Listagem (keyset/cursor — roteiro §8: ordenação determinística)
// ─────────────────────────────────────────────────────────────────────────────

export type ListarClientesOptions = {
  busca?: string;
  somenteAtivos?: boolean;
  cursor?: number;
  limite?: number;
};

export async function listarClientes(
  db: DrizzleDb,
  empresaId: number,
  options: ListarClientesOptions = {}
): Promise<{ itens: Cliente[]; proximoCursor: number | null }> {
  const limite = Math.min(Math.max(options.limite ?? 20, 1), 100);
  const somenteAtivos = options.somenteAtivos !== false;

  const condicoes = [eq(clientes.empresaId, empresaId)];
  if (somenteAtivos) condicoes.push(eq(clientes.ativo, true));
  if (options.cursor) condicoes.push(lt(clientes.id, options.cursor));

  const busca = options.busca?.trim();
  if (busca) {
    const padrao = `%${busca.replace(/[%_]/g, '')}%`;
    condicoes.push(or(like(clientes.nome, padrao), like(clientes.documento, padrao))!);
  }

  // Ordenação determinística: id descendente (mais recentes primeiro)
  const linhas = await db
    .select()
    .from(clientes)
    .where(and(...condicoes))
    .orderBy(desc(clientes.id))
    .limit(limite + 1);

  const temMais = linhas.length > limite;
  const itens = temMais ? linhas.slice(0, limite) : linhas;
  return {
    itens,
    proximoCursor: temMais ? itens[itens.length - 1].id : null,
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// Leitura
// ─────────────────────────────────────────────────────────────────────────────

export async function getCliente(
  db: DrizzleDb,
  empresaId: number,
  clienteId: number
): Promise<Cliente> {
  const row = await db
    .select()
    .from(clientes)
    .where(and(eq(clientes.id, clienteId), eq(clientes.empresaId, empresaId)))
    .get();

  if (!row) throw new ClienteError('Cliente não encontrado.', 'NAO_ENCONTRADO');
  return row;
}

// ─────────────────────────────────────────────────────────────────────────────
// Criação
// ─────────────────────────────────────────────────────────────────────────────

export async function criarCliente(
  db: DrizzleDb,
  empresaId: number,
  criadoPor: string,
  body: unknown
): Promise<Cliente> {
  const validacao = validarCliente(body);
  if (!validacao.ok) {
    throw new ClienteError('Dados inválidos.', 'VALIDACAO', validacao.errors);
  }

  const valores = injectTenantId(paraColunas(validacao.dados), empresaId);

  try {
    const row = await db
      .insert(clientes)
      .values({ ...valores, criadoPor })
      .returning()
      .get();
    return row;
  } catch (err) {
    if (ehViolacaoUnicidade(err)) {
      throw new ClienteError(
        'Já existe um cliente com este documento nesta empresa.',
        'DOCUMENTO_DUPLICADO'
      );
    }
    throw err;
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// Edição (concorrência otimista por versão — roteiro §5)
// ─────────────────────────────────────────────────────────────────────────────

export async function atualizarCliente(
  db: DrizzleDb,
  empresaId: number,
  clienteId: number,
  versaoEsperada: number,
  body: unknown
): Promise<Cliente> {
  // Leitura prévia: 404 e isolamento de tenant
  const atual = await getCliente(db, empresaId, clienteId);

  const validacao = validarCliente(body);
  if (!validacao.ok) {
    throw new ClienteError('Dados inválidos.', 'VALIDACAO', validacao.errors);
  }

  let res;
  try {
    res = await db
      .update(clientes)
      .set({
        ...paraColunas(validacao.dados),
        versao: atual.versao + 1,
        atualizadoEm: new Date().toISOString(),
      })
      .where(
        and(
          eq(clientes.id, clienteId),
          eq(clientes.empresaId, empresaId),
          eq(clientes.versao, versaoEsperada)
        )
      )
      .run();
  } catch (err) {
    if (ehViolacaoUnicidade(err)) {
      throw new ClienteError(
        'Já existe um cliente com este documento nesta empresa.',
        'DOCUMENTO_DUPLICADO'
      );
    }
    throw err;
  }

  if (res.meta.changes === 0) {
    throw new ClienteError(
      `O cliente foi alterado por outra pessoa (versão atual: ${atual.versao}). Recarregue e tente novamente.`,
      'CONFLITO_VERSAO'
    );
  }

  return getCliente(db, empresaId, clienteId);
}

// ─────────────────────────────────────────────────────────────────────────────
// Desativação (sem exclusão física — roteiro §5)
// ─────────────────────────────────────────────────────────────────────────────

export async function desativarCliente(
  db: DrizzleDb,
  empresaId: number,
  clienteId: number
): Promise<void> {
  await getCliente(db, empresaId, clienteId); // 404 + isolamento
  await db
    .update(clientes)
    .set({ ativo: false, atualizadoEm: new Date().toISOString() })
    .where(and(eq(clientes.id, clienteId), eq(clientes.empresaId, empresaId)))
    .run();
}

// ─────────────────────────────────────────────────────────────────────────────
// Anexos privados (R2 + metadados D1)
// ─────────────────────────────────────────────────────────────────────────────

export const ANEXO_TIPOS_PERMITIDOS = ['application/pdf', 'image/jpeg', 'image/png', 'image/webp'];
export const ANEXO_TAMANHO_MAX = 10 * 1024 * 1024; // 10 MB

export async function listarAnexos(
  db: DrizzleDb,
  empresaId: number,
  clienteId: number
): Promise<ClienteAnexo[]> {
  await getCliente(db, empresaId, clienteId); // 404 + isolamento
  return db
    .select()
    .from(clienteAnexos)
    .where(and(eq(clienteAnexos.clienteId, clienteId), eq(clienteAnexos.empresaId, empresaId)))
    .orderBy(clienteAnexos.id)
    .all();
}

/**
 * Upload: valida conteúdo (magic bytes), sobe ao R2 com chave imprevisível
 * e registra metadados. Falha no INSERT compensa removendo o objeto do R2.
 */
export async function registrarAnexo(
  db: DrizzleDb,
  r2: R2Bucket,
  empresaId: number,
  clienteId: number,
  enviadoPor: string,
  file: File
): Promise<ClienteAnexo> {
  await getCliente(db, empresaId, clienteId); // 404 + isolamento

  const validacao = await validateUploadedFile(file, {
    allowedMimeTypes: ANEXO_TIPOS_PERMITIDOS,
    maxSizeBytes: ANEXO_TAMANHO_MAX,
  });
  if (!validacao.ok) {
    throw new ClienteError(validacao.error, 'ANEXO_INVALIDO');
  }

  const nomeArquivo = `${crypto.randomUUID()}-${file.name}`;
  const upload = await r2Upload(
    r2,
    empresaId,
    `clientes/${clienteId}`,
    nomeArquivo,
    await file.arrayBuffer(),
    validacao.mimeType
  );

  try {
    return await db
      .insert(clienteAnexos)
      .values(
        injectTenantId(
          {
            clienteId,
            chaveR2: upload.key,
            nomeOriginal: file.name.slice(0, 255),
            contentType: validacao.mimeType,
            tamanhoBytes: file.size,
            enviadoPor,
          },
          empresaId
        )
      )
      .returning()
      .get();
  } catch (err) {
    // Compensação: o objeto não pode ficar órfão no R2 (roteiro §5)
    await r2Delete(r2, upload.key, empresaId).catch(() => {});
    throw err;
  }
}

/**
 * Metadados de um anexo para download mediado.
 * A rota usa a chaveR2 com r2Download() — a chave nunca vai ao navegador.
 */
export async function getAnexo(
  db: DrizzleDb,
  empresaId: number,
  clienteId: number,
  anexoId: number
): Promise<ClienteAnexo> {
  const row = await db
    .select()
    .from(clienteAnexos)
    .where(
      and(
        eq(clienteAnexos.id, anexoId),
        eq(clienteAnexos.clienteId, clienteId),
        eq(clienteAnexos.empresaId, empresaId)
      )
    )
    .get();

  if (!row) throw new ClienteError('Anexo não encontrado.', 'NAO_ENCONTRADO');
  return row;
}

export async function removerAnexo(
  db: DrizzleDb,
  r2: R2Bucket,
  empresaId: number,
  clienteId: number,
  anexoId: number
): Promise<void> {
  const anexo = await getAnexo(db, empresaId, clienteId, anexoId);
  await db
    .delete(clienteAnexos)
    .where(and(eq(clienteAnexos.id, anexoId), eq(clienteAnexos.empresaId, empresaId)))
    .run();
  // Metadado removido; objeto sai em seguida (falha aqui vira órfão limpo por rotina)
  await r2Delete(r2, anexo.chaveR2, empresaId).catch(() => {});
}

// ─────────────────────────────────────────────────────────────────────────────
// Helpers internos
// ─────────────────────────────────────────────────────────────────────────────

function paraColunas(dados: ClienteInput) {
  return {
    nome: dados.nome,
    tipoPessoa: dados.tipo_pessoa,
    documento: dados.documento,
    nascimento: dados.nascimento,
    telefone: dados.telefone,
    whatsapp: dados.whatsapp,
    email: dados.email,
    classificacao: dados.classificacao,
    endereco: dados.endereco,
    numero: dados.numero,
    complemento: dados.complemento,
    cidade: dados.cidade,
    estado: dados.estado,
    cep: dados.cep,
    rg: dados.rg,
    genero: dados.genero,
    nacionalidade: dados.nacionalidade,
    tags: JSON.stringify(dados.tags),
    tipoCliente: dados.tipo_cliente,
    notas: dados.notas,
  };
}

function ehViolacaoUnicidade(err: unknown): boolean {
  // Drizzle wraps SQLite/D1 constraint failures in a query error, so inspect
  // the cause chain instead of only the outer "Failed query" message.
  let atual: unknown = err;
  for (let profundidade = 0; profundidade < 5 && atual; profundidade += 1) {
    if (atual instanceof Error && /UNIQUE constraint failed/i.test(atual.message)) return true;
    atual = atual instanceof Error ? atual.cause : undefined;
  }
  return false;
}
