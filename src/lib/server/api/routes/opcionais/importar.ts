import { json, type RequestEvent } from '@sveltejs/kit';
import { chaveCidadeOpcional, chaveIdentidadeCidade } from '$lib/catalogoOpcionais';
import { destinoIdValido } from '$lib/destinoIdentidade';
import { chaveNomeOpcional, MAX_OPCIONAIS_IMPORTACAO } from '$lib/importarOpcionais';
import {
  IdentidadeDestinoInvalida,
  resolverDestinoParaPersistencia
} from '$lib/server/destinoPersistencia';
import { NO_STORE_HEADERS } from '$lib/server/httpCache';
import { readJsonBodyLimited, rejectCrossOriginRequest } from '$lib/server/requestGuards';
import { logServerError, toErrorResponse } from '$lib/server/v1';
import { requireOpcionaisScope } from './root';

type Item = { cidade: string; cidade_id: string | null; nome: string; descricao: string };
const invalid = (message: string) =>
  json({ error: message }, { status: 400, headers: NO_STORE_HEADERS });

export async function handleOpcionaisImportarPost(event: RequestEvent) {
  try {
    const originError = rejectCrossOriginRequest(event.request);
    if (originError) return originError;
    const { db, user } = await requireOpcionaisScope(event, 2);
    const body = await readJsonBodyLimited(event.request, 1024 * 1024);
    if (!body.ok) return body.response;
    if (
      !body.data ||
      typeof body.data !== 'object' ||
      !('items' in body.data) ||
      !Array.isArray(body.data.items)
    )
      return invalid('Lista de passeios inválida.');
    if (body.data.items.length < 1 || body.data.items.length > MAX_OPCIONAIS_IMPORTACAO)
      return invalid(`Informe de 1 a ${MAX_OPCIONAIS_IMPORTACAO} passeios.`);
    const items: Item[] = [];
    const destinos = new Map<string, { cidade_id: string; cidade: string }>();
    for (const raw of body.data.items) {
      if (
        !raw ||
        typeof raw !== 'object' ||
        typeof raw.cidade !== 'string' ||
        typeof raw.nome !== 'string' ||
        typeof raw.descricao !== 'string'
      )
        return invalid('Passeio inválido.');
      let cidade = raw.cidade.trim().replace(/\s+/g, ' ');
      let cidadeId: string | null = null;
      if ('cidade_id' in raw && raw.cidade_id != null) {
        if (!destinoIdValido(raw.cidade_id)) return invalid('Identificação da cidade inválida.');
        const geoDb = event.platform?.env?.GEO_DB;
        if (!geoDb)
          return json(
            { error: 'Busca geográfica ainda não está disponível.' },
            { status: 503, headers: NO_STORE_HEADERS }
          );
        const id = raw.cidade_id.toLowerCase();
        let destino = destinos.get(id);
        if (!destino) {
          destino = await resolverDestinoParaPersistencia(db, geoDb, id);
          destinos.set(id, destino);
        }
        cidade = destino.cidade;
        cidadeId = destino.cidade_id;
      }
      const nome = raw.nome.trim();
      const descricao = raw.descricao.trim();
      if (!cidade || cidade.length > 200 || !nome || nome.length > 300 || descricao.length > 20000)
        return invalid('Cidade, nome ou descrição inválidos.');
      items.push({ cidade, cidade_id: cidadeId, nome, descricao });
    }

    const cidades = [
      ...new Map(
        items.map((item) => [chaveIdentidadeCidade(item.cidade, item.cidade_id), item])
      ).values()
    ];
    const consultas = cidades.map((item) =>
      item.cidade_id
        ? db
            .prepare(
              'SELECT cidade_chave, cidade_id, nome FROM catalogo_opcionais WHERE cidade_id = ?'
            )
            .bind(item.cidade_id)
        : db
            .prepare(
              'SELECT cidade_chave, cidade_id, nome FROM catalogo_opcionais WHERE cidade_chave = ? AND cidade_id IS NULL'
            )
            .bind(chaveCidadeOpcional(item.cidade))
    );
    const existentes = await db.batch<{
      cidade_chave: string;
      cidade_id: string | null;
      nome: string;
    }>(consultas);
    const chave = (cidade: string, nome: string) =>
      JSON.stringify([cidade, chaveNomeOpcional(nome)]);
    const conhecidos = new Set(
      existentes.flatMap((result) =>
        result.results.map((item) =>
          chave(chaveIdentidadeCidade(item.cidade_chave, item.cidade_id), item.nome)
        )
      )
    );
    const statements: D1PreparedStatement[] = [];
    for (const item of items) {
      const cidade = chaveCidadeOpcional(item.cidade);
      const itemKey = chave(chaveIdentidadeCidade(item.cidade, item.cidade_id), item.nome);
      if (conhecidos.has(itemKey)) continue;
      conhecidos.add(itemKey);
      statements.push(
        db
          .prepare(
            'INSERT INTO catalogo_opcionais (id, cidade, cidade_chave, cidade_id, nome, descricao, created_by, updated_by) SELECT ?, ?, ?, ?, ?, ?, ?, ? WHERE NOT EXISTS (SELECT 1 FROM catalogo_opcionais WHERE ((? IS NOT NULL AND cidade_id = ?) OR (? IS NULL AND cidade_id IS NULL AND cidade_chave = ?)) AND nome = ? COLLATE NOCASE)'
          )
          .bind(
            crypto.randomUUID(),
            item.cidade,
            cidade,
            item.cidade_id,
            item.nome,
            item.descricao,
            user.id,
            user.id,
            item.cidade_id,
            item.cidade_id,
            item.cidade_id,
            cidade,
            item.nome
          )
      );
    }
    const results = statements.length ? await db.batch(statements) : [];
    const importados = results.reduce((sum, result) => sum + result.meta.changes, 0);
    return json(
      { importados, ignorados: items.length - importados },
      { headers: NO_STORE_HEADERS }
    );
  } catch (err) {
    if (err instanceof IdentidadeDestinoInvalida) return invalid(err.message);
    logServerError('[opcionais/importar] falha ao importar', err);
    return toErrorResponse(err, 'Erro ao importar opcionais.');
  }
}
