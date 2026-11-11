import { json, type RequestEvent } from '@sveltejs/kit';
import { chaveCidadeOpcional, type OpcionalCatalogo } from '$lib/catalogoOpcionais';
import { destinoIdValido } from '$lib/destinoIdentidade';
import {
  IdentidadeDestinoInvalida,
  resolverDestinoParaPersistencia
} from '$lib/server/destinoPersistencia';
import { NO_STORE_HEADERS } from '$lib/server/httpCache';
import { readJsonBodyLimited, rejectCrossOriginRequest } from '$lib/server/requestGuards';
import {
  ensureModuloAccess,
  getAdminClient,
  isUuid,
  logServerError,
  requireAuthenticatedUser,
  resolveUserScope,
  toErrorResponse
} from '$lib/server/v1';

export async function requireOpcionaisScope(event: RequestEvent, level: number, read = false) {
  const client = getAdminClient();
  const user = await requireAuthenticatedUser(event);
  const scope = await resolveUserScope(client, user.id);
  ensureModuloAccess(
    scope,
    read ? ['Cadastros', 'Orcamentos'] : ['Cadastros'],
    level,
    'Sem permissão para acessar o catálogo de opcionais.'
  );
  const db = event.platform?.env?.DB;
  if (!db) throw new Error('Banco D1 indisponível nesta requisição.');
  return { db, user };
}

function invalid(message: string, status = 400) {
  return json({ error: message }, { status, headers: NO_STORE_HEADERS });
}

export async function handleOpcionaisGet(event: RequestEvent) {
  try {
    const { db } = await requireOpcionaisScope(event, 1, true);
    const cidade = String(event.url.searchParams.get('cidade') || '').trim();
    const cidadeId = event.url.searchParams.get('cidade_id');
    const nome = String(event.url.searchParams.get('nome') || '').trim();
    const busca = String(event.url.searchParams.get('q') || '').trim();
    if (cidade.length > 200) return invalid('Cidade inválida.');
    if (nome.length > 300) return invalid('Nome inválido.');
    if (busca.length > 300) return invalid('Busca inválida.');
    if (cidadeId !== null && !destinoIdValido(cidadeId))
      return invalid('Identificação da cidade inválida.');
    const rawPage = Number(event.url.searchParams.get('pagina') || '1');
    if (!Number.isSafeInteger(rawPage) || rawPage < 1 || rawPage > 10000)
      return invalid('Página inválida.');
    const key = chaveCidadeOpcional(cidade);
    const filtros: string[] = [];
    const parametros: (string | number)[] = [];
    if (cidadeId) {
      filtros.push('cidade_id = ?');
      parametros.push(cidadeId.toLowerCase());
    } else if (key) {
      filtros.push('cidade_chave = ? AND cidade_id IS NULL');
      parametros.push(key);
    }
    if (nome) {
      filtros.push("nome LIKE ? ESCAPE '\\'");
      parametros.push(`%${nome.replace(/[\\%_]/g, '\\$&')}%`);
    }
    if (busca) {
      const minusculo = `%${busca.toLocaleLowerCase('pt-BR').replace(/[\\%_]/g, '\\$&')}%`;
      const maiusculo = `%${busca.toLocaleUpperCase('pt-BR').replace(/[\\%_]/g, '\\$&')}%`;
      filtros.push(
        "(cidade LIKE ? ESCAPE '\\' OR cidade LIKE ? ESCAPE '\\' OR nome LIKE ? ESCAPE '\\' OR nome LIKE ? ESCAPE '\\' OR descricao LIKE ? ESCAPE '\\' OR descricao LIKE ? ESCAPE '\\')"
      );
      parametros.push(minusculo, maiusculo, minusculo, maiusculo, minusculo, maiusculo);
    }
    parametros.push((rawPage - 1) * 100);
    const statement = db
      .prepare(
        `SELECT id, cidade, cidade_id, nome, descricao FROM catalogo_opcionais
         ${filtros.length ? `WHERE ${filtros.join(' AND ')}` : ''}
         ORDER BY ${cidadeId || key ? 'nome, id' : 'cidade_chave, nome, id'} LIMIT 101 OFFSET ?`
      )
      .bind(...parametros);
    const result = await statement.all<OpcionalCatalogo>();
    return json(
      { items: result.results.slice(0, 100), hasMore: result.results.length > 100 },
      { headers: NO_STORE_HEADERS }
    );
  } catch (err) {
    logServerError('[opcionais] falha ao listar catálogo', err);
    return toErrorResponse(err, 'Erro ao carregar opcionais.');
  }
}

export async function handleOpcionaisPost(event: RequestEvent) {
  try {
    const originError = rejectCrossOriginRequest(event.request);
    if (originError) return originError;
    const bodyResult = await readJsonBodyLimited(event.request, 96 * 1024);
    if (!bodyResult.ok) return bodyResult.response;
    const body = bodyResult.data;
    if (!body || typeof body !== 'object' || Array.isArray(body))
      return invalid('Dados inválidos.');
    const record = body as Record<string, unknown>;
    const id = typeof record.id === 'string' ? record.id.trim() : '';
    if (id && !isUuid(id)) return invalid('ID inválido.');
    const { db, user } = await requireOpcionaisScope(event, id ? 3 : 2);
    let cidade = typeof record.cidade === 'string' ? record.cidade.trim().replace(/\s+/g, ' ') : '';
    let cidadeId: string | null = null;
    if (record.cidade_id != null) {
      if (!destinoIdValido(record.cidade_id)) return invalid('Identificação da cidade inválida.');
      const geoDb = event.platform?.env?.GEO_DB;
      if (!geoDb) return invalid('Busca geográfica ainda não está disponível.', 503);
      const destino = await resolverDestinoParaPersistencia(db, geoDb, record.cidade_id);
      cidade = destino.cidade;
      cidadeId = destino.cidade_id;
    }
    const nome = typeof record.nome === 'string' ? record.nome.trim() : '';
    const descricao = typeof record.descricao === 'string' ? record.descricao.trim() : '';
    if (!cidade || cidade.length > 200) return invalid('Informe a cidade (até 200 caracteres).');
    if (!nome || nome.length > 300)
      return invalid('Informe o nome do passeio (até 300 caracteres).');
    if (typeof record.descricao !== 'string' || descricao.length > 20000)
      return invalid('Informe uma descrição de até 20.000 caracteres.');
    const key = chaveCidadeOpcional(cidade);
    const result = id
      ? await db
          .prepare(
            "UPDATE catalogo_opcionais SET cidade = ?, cidade_chave = ?, cidade_id = ?, nome = ?, descricao = ?, updated_by = ?, updated_at = strftime('%Y-%m-%dT%H:%M:%fZ','now') WHERE id = ? AND (? IS NOT NULL OR cidade_id IS NULL) RETURNING id, cidade, cidade_id, nome, descricao"
          )
          .bind(cidade, key, cidadeId, nome, descricao, user.id, id, cidadeId)
          .first<OpcionalCatalogo>()
      : await db
          .prepare(
            'INSERT INTO catalogo_opcionais (id, cidade, cidade_chave, cidade_id, nome, descricao, created_by, updated_by) VALUES (?, ?, ?, ?, ?, ?, ?, ?) RETURNING id, cidade, cidade_id, nome, descricao'
          )
          .bind(crypto.randomUUID(), cidade, key, cidadeId, nome, descricao, user.id, user.id)
          .first<OpcionalCatalogo>();
    if (!result) {
      if (id && !cidadeId) {
        const anterior = await db
          .prepare('SELECT cidade_id FROM catalogo_opcionais WHERE id = ?')
          .bind(id)
          .first<{ cidade_id: string | null }>();
        if (anterior?.cidade_id)
          return invalid(
            'Selecione novamente o destino geográfico antes de editar este opcional.',
            409
          );
      }
      return invalid('Opcional não encontrado.', 404);
    }
    return json({ item: result }, { headers: NO_STORE_HEADERS });
  } catch (err) {
    if (err instanceof IdentidadeDestinoInvalida) return invalid(err.message);
    logServerError('[opcionais] falha ao salvar', err);
    return toErrorResponse(err, 'Erro ao salvar opcional.');
  }
}

export async function handleOpcionaisDelete(event: RequestEvent) {
  try {
    const originError = rejectCrossOriginRequest(event.request);
    if (originError) return originError;
    const { db } = await requireOpcionaisScope(event, 4);
    const id = String(event.url.searchParams.get('id') || '').trim();
    if (!isUuid(id)) return invalid('ID inválido.');
    const result = await db
      .prepare('DELETE FROM catalogo_opcionais WHERE id = ? RETURNING id')
      .bind(id)
      .first();
    if (!result) return invalid('Opcional não encontrado.', 404);
    return json({ ok: true }, { headers: NO_STORE_HEADERS });
  } catch (err) {
    logServerError('[opcionais] falha ao excluir', err);
    return toErrorResponse(err, 'Erro ao excluir opcional.');
  }
}
