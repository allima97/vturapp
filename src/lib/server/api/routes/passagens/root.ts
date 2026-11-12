import { json, type RequestEvent } from '@sveltejs/kit';
import { NO_STORE_HEADERS } from '$lib/server/httpCache';
import { readJsonBodyLimited, rejectCrossOriginRequest } from '$lib/server/requestGuards';
import { isTipoPassageiro } from '$lib/passagens/importacao';
import { nomePassageiroMaiusculo } from '$lib/passagens/nome';
import {
  ensureModuloAccess,
  getAdminClient,
  isUuid,
  logServerError,
  requireAuthenticatedUser,
  resolveUserScope,
  toErrorResponse
} from '$lib/server/v1';

function invalid(message: string, status = 400) {
  return json({ error: message }, { status, headers: NO_STORE_HEADERS });
}

async function contexto(event: RequestEvent, nivel: number) {
  const client = getAdminClient();
  const user = await requireAuthenticatedUser(event);
  const scope = await resolveUserScope(client, user.id);
  ensureModuloAccess(scope, ['Operacao'], nivel, 'Sem permissão para acessar passagens.');
  if (!scope.usoIndividual && (!scope.companyId || !isUuid(scope.companyId))) return null;
  const db = event.platform?.env?.DB;
  if (!db) throw new Error('Banco D1 indisponível nesta requisição.');
  const companyId = scope.usoIndividual ? null : scope.companyId;
  return {
    db,
    companyId,
    userId: user.id,
    scopeSql: companyId ? 'company_id = ?' : 'company_id IS NULL AND created_by = ?',
    scopeId: companyId || user.id
  };
}

function texto(value: unknown, limit: number) {
  if (typeof value !== 'string' || value.length > limit) return null;
  return value.trim();
}

function dataHoraValida(value: string) {
  const match = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})$/.exec(value);
  if (!match) return false;
  const [ano, mes, dia, hora, minuto] = match.slice(1).map(Number);
  const data = new Date(Date.UTC(ano, mes - 1, dia, hora, minuto));
  return (
    ano >= 1900 &&
    data.getUTCFullYear() === ano &&
    data.getUTCMonth() === mes - 1 &&
    data.getUTCDate() === dia &&
    data.getUTCHours() === hora &&
    data.getUTCMinutes() === minuto
  );
}

function validar(body: unknown) {
  if (!body || typeof body !== 'object' || Array.isArray(body)) return null;
  const input = body as Record<string, unknown>;
  const localizador = texto(input.localizador, 30);
  const emissao = texto(input.emissao, 10);
  if (
    !localizador ||
    emissao === null ||
    (emissao && !dataHoraValida(`${emissao}T00:00`)) ||
    !Array.isArray(input.trechos) ||
    !Array.isArray(input.passageiros)
  )
    return null;
  if (
    !input.trechos.length ||
    input.trechos.length > 30 ||
    !input.passageiros.length ||
    input.passageiros.length > 50
  )
    return null;
  const trechos = [];
  for (const raw of input.trechos) {
    if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return null;
    const item = raw as Record<string, unknown>;
    const fields = [
      'companhia',
      'voo',
      'origem',
      'destino',
      'saida',
      'chegada',
      'status',
      'duracao',
      'classe'
    ] as const;
    const values = fields.map((field) => texto(item[field], 150));
    if (values.some((value) => value === null) || values.slice(0, 6).some((value) => !value))
      return null;
    const [companhia, voo, origem, destino, saida, chegada, status, duracao, classe] = values;
    const cidadeOrigem = texto(item.cidadeOrigem ?? '', 150);
    const cidadeDestino = texto(item.cidadeDestino ?? '', 150);
    const tarifa = texto(item.tarifa ?? '', 150);
    if (
      !companhia ||
      !voo ||
      !origem ||
      !destino ||
      !saida ||
      !chegada ||
      status === null ||
      duracao === null ||
      classe === null ||
      cidadeOrigem === null ||
      cidadeDestino === null ||
      tarifa === null
    )
      return null;
    if (!dataHoraValida(saida) || !dataHoraValida(chegada)) return null;
    trechos.push({
      companhia,
      voo,
      origem: origem.toUpperCase(),
      destino: destino.toUpperCase(),
      saida,
      chegada,
      status,
      duracao,
      classe,
      cidadeOrigem,
      cidadeDestino,
      tarifa
    });
  }
  const passageiros = [];
  for (const raw of input.passageiros) {
    if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return null;
    const item = raw as Record<string, unknown>;
    const nome = texto(item.nome, 200);
    const bilhete = texto(item.bilhete, 80);
    const status = texto(item.status, 100);
    const tipo = item.tipo ?? '';
    if (
      !nome ||
      bilhete === null ||
      status === null ||
      (tipo !== '' && !isTipoPassageiro(tipo)) ||
      !Array.isArray(item.assentos) ||
      item.assentos.length > input.trechos.length
    )
      return null;
    const assentos = item.assentos.map((value: unknown) => texto(value, 30));
    if (assentos.some((value: string | null) => value === null)) return null;
    const nomeFormatado = nomePassageiroMaiusculo(nome);
    if (nomeFormatado.length > 200) return null;
    passageiros.push({ nome: nomeFormatado, tipo, bilhete, status, assentos });
  }
  return { localizador, emissao, trechos, passageiros };
}

export async function handlePassagensGet(event: RequestEvent) {
  try {
    const ctx = await contexto(event, 1);
    if (!ctx)
      return invalid('É necessário estar vinculado a uma empresa para acessar passagens.', 403);
    const id = event.url.searchParams.get('id');
    if (id && !isUuid(id)) return invalid('Identificação inválida.');
    if (id) {
      const row = await ctx.db
        .prepare(`SELECT id, dados, updated_at FROM passagens WHERE id = ? AND ${ctx.scopeSql}`)
        .bind(id, ctx.scopeId)
        .first<{ id: string; dados: string; updated_at: string }>();
      if (!row) return invalid('Passagem não encontrada.', 404);
      return json(
        { item: { id: row.id, ...JSON.parse(row.dados), updated_at: row.updated_at } },
        { headers: NO_STORE_HEADERS }
      );
    }
    const paginaRaw = event.url.searchParams.get('pagina') || '1';
    const pagina = Number(paginaRaw);
    if (!/^\d+$/.test(paginaRaw) || !Number.isSafeInteger(pagina) || pagina < 1 || pagina > 10000)
      return invalid('Página inválida.');
    const rows = await ctx.db
      .prepare(
        `SELECT id, localizador, updated_at FROM passagens WHERE ${ctx.scopeSql} ORDER BY updated_at DESC, id LIMIT 51 OFFSET ?`
      )
      .bind(ctx.scopeId, (pagina - 1) * 50)
      .all();
    return json(
      { items: rows.results.slice(0, 50), hasMore: rows.results.length > 50 },
      { headers: NO_STORE_HEADERS }
    );
  } catch (err) {
    logServerError('[passagens] falha ao consultar', err);
    return toErrorResponse(err, 'Erro ao carregar passagens.');
  }
}

export async function handlePassagensDelete(event: RequestEvent) {
  try {
    const originError = rejectCrossOriginRequest(event.request);
    if (originError) return originError;
    const ctx = await contexto(event, 4);
    if (!ctx)
      return invalid('É necessário estar vinculado a uma empresa para excluir passagens.', 403);
    const id = event.url.searchParams.get('id') || '';
    if (!isUuid(id)) return invalid('Identificação inválida.');
    const deleted = await ctx.db
      .prepare(`DELETE FROM passagens WHERE id = ? AND ${ctx.scopeSql} RETURNING id`)
      .bind(id, ctx.scopeId)
      .first();
    if (!deleted) return invalid('Passagem não encontrada.', 404);
    return json({ ok: true }, { headers: NO_STORE_HEADERS });
  } catch (err) {
    logServerError('[passagens] falha ao excluir', err);
    return toErrorResponse(err, 'Erro ao excluir passagem.');
  }
}

export async function handlePassagensPost(event: RequestEvent) {
  try {
    const originError = rejectCrossOriginRequest(event.request);
    if (originError) return originError;
    const result = await readJsonBodyLimited(event.request, 128 * 1024);
    if (!result.ok) return result.response;
    const body = result.data;
    const dados = validar(body);
    if (!dados) return invalid('Confira o localizador, voos, datas e passageiros antes de salvar.');
    const record = body as Record<string, unknown>;
    const id = texto(record.id ?? '', 100);
    if (id === null || (id && !isUuid(id))) return invalid('Identificação inválida.');
    const ctx = await contexto(event, id ? 3 : 2);
    if (!ctx)
      return invalid('É necessário estar vinculado a uma empresa para salvar passagens.', 403);
    const dadosJson = JSON.stringify(dados);
    if (id) {
      const updated = await ctx.db
        .prepare(
          `UPDATE passagens SET localizador = ?, dados = ?, updated_at = strftime('%Y-%m-%dT%H:%M:%fZ','now') WHERE id = ? AND ${ctx.scopeSql} RETURNING id`
        )
        .bind(dados.localizador, dadosJson, id, ctx.scopeId)
        .first();
      if (!updated) return invalid('Passagem não encontrada.', 404);
      return json({ id }, { headers: NO_STORE_HEADERS });
    }
    const newId = crypto.randomUUID();
    await ctx.db
      .prepare(
        'INSERT INTO passagens (id, company_id, created_by, localizador, dados) VALUES (?, ?, ?, ?, ?)'
      )
      .bind(newId, ctx.companyId, ctx.userId, dados.localizador, dadosJson)
      .run();
    return json({ id: newId }, { status: 201, headers: NO_STORE_HEADERS });
  } catch (err) {
    logServerError('[passagens] falha ao salvar', err);
    return toErrorResponse(err, 'Erro ao salvar passagem.');
  }
}
