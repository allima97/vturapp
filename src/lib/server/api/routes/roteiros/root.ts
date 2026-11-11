// Migrado para Hono de src/routes/api/v1/roteiros/+server.ts — corpo IDÊNTICO ao original
// (só nome/assinatura do handler e caminhos de import mudaram). Ver src/lib/server/api/app.ts.
import { json } from '@sveltejs/kit';
import { revisaoRoteiroAtiva, roteiroGeograficoAtivo } from '$lib/config/destinosGeograficos';
import { VERSAO_ROTEIRO_IDENTIDADE } from '$lib/roteiroProtocolo';
import { decodificarRevisaoExclusao } from '$lib/roteiroRevisaoExclusao';
import { validarLimitesRoteiro } from '$lib/roteiroLimites';
import { readJsonBodyLimited, rejectCrossOriginRequest } from '$lib/server/requestGuards';
import {
  ensureModuloAccess,
  getAdminClient,
  isUuid,
  logServerError,
  requireAuthenticatedUser,
  resolveUserScope,
  sanitizePostgrestSearchTerm,
  toErrorResponse
} from '$lib/server/v1';
import { DYNAMIC_READ_HEADERS, NO_STORE_HEADERS } from '$lib/server/httpCache';
import type { RequestEvent } from '@sveltejs/kit';
import {
  prepararCidadesGeograficasRoteiro,
  validarCidadesRoteiro,
  validarIdentidadesExplicitas
} from './cidades-busca';
import { salvarRoteiroSimplificadoAtomico } from './salvar-simplificado-atomico';
import { SalvamentoRoteiroAtomico } from './salvar-completo-atomico';
import { IdentificacaoRegistroError } from '$lib/server/roteiroRegistrosLegados';

const ROTEIRO_SUGESTAO_SELECT = 'id, company_id, tipo, valor, uso_count, created_at, updated_at';
const MAX_ROTEIRO_BODY_BYTES = 512 * 1024;

type EqQueryable<T> = {
  eq(column: string, value: string | null | undefined): T;
};

type UserCompanyRow = {
  company_id?: string | null;
};

type RoteiroPatchBody = {
  action?: unknown;
  termo?: unknown;
  tipo?: unknown;
  valor?: unknown;
  id?: unknown;
};

type RoteiroSugestaoRow = {
  id: string;
  uso_count?: number | null;
};

type RoteiroDiaDraft = {
  cidade?: unknown;
  cidade_id?: unknown;
  data?: unknown;
  descricao?: unknown;
};

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}

function applyRoteiroScope<T extends EqQueryable<T>>(
  query: T,
  scope: {
    isAdmin?: boolean;
    isGestor?: boolean;
    isMaster?: boolean;
    userId?: string | null;
    companyId?: string | null;
  }
) {
  if (!scope.isAdmin && !scope.isGestor && !scope.isMaster) {
    return query.eq('created_by', scope.userId);
  }

  if (scope.companyId && !scope.isAdmin && !scope.isMaster) {
    return query.eq('company_id', scope.companyId);
  }

  return query;
}

function isMissingItinerarioConfigColumn(error: unknown) {
  const code = isRecord(error) ? String(error.code || '') : '';
  const message = isRecord(error) ? String(error.message || '') : '';
  return code === '42703' || /itinerario_config/i.test(message);
}

export async function handleRoteirosGet(event: RequestEvent) {
  try {
    const client = getAdminClient();
    const user = await requireAuthenticatedUser(event);
    const scope = await resolveUserScope(client, user.id);

    ensureModuloAccess(scope, ['Orcamentos'], 1, 'Sem acesso a Roteiros.');

    const { data, error: queryError } = await applyRoteiroScope(
      client
        .from('roteiro_personalizado')
        .select(
          `id, nome, duracao, inicio_cidade, fim_cidade, created_at, updated_at${revisaoRoteiroAtiva ? ', revisao' : ''}`
        )
        .order('updated_at', { ascending: false })
        .limit(200),
      scope
    );

    if (queryError) throw queryError;

    return json({ roteiros: data || [] }, { headers: DYNAMIC_READ_HEADERS });
  } catch (err) {
    logServerError('[roteiros] falha ao carregar roteiros', err);
    return toErrorResponse(err, 'Erro ao carregar roteiros.');
  }
}

export async function handleRoteirosPost(event: RequestEvent) {
  try {
    const originError = rejectCrossOriginRequest(event.request);
    if (originError) return originError;
    const bodyResult = await readJsonBodyLimited(event.request, MAX_ROTEIRO_BODY_BYTES);
    if (!bodyResult.ok) return bodyResult.response;

    const dados = event.locals.dados;
    const { session, user } = await event.locals.safeGetSession();
    if (!session || !user) {
      return new Response('Sessao invalida.', { status: 401, headers: NO_STORE_HEADERS });
    }

    const body =
      bodyResult.data && typeof bodyResult.data === 'object'
        ? (bodyResult.data as Record<string, unknown>)
        : {};
    if (roteiroGeograficoAtivo && body.versao_identidade !== VERSAO_ROTEIRO_IDENTIDADE)
      return json(
        { error: 'Esta versão do editor está desatualizada. Recarregue a página antes de salvar.' },
        { status: 409, headers: NO_STORE_HEADERS }
      );
    const { id, nome, duracao, inicio_cidade, fim_cidade, itinerario_config } = body;
    let dias = body.dias;
    const roteiroIdFromBody = typeof id === 'string' ? id : null;

    if (revisaoRoteiroAtiva) {
      const limiteErro = validarLimitesRoteiro({ dias });
      if (limiteErro)
        return json({ error: limiteErro }, { status: 422, headers: NO_STORE_HEADERS });
      const identidadeErro = validarIdentidadesExplicitas({ dias });
      if (identidadeErro)
        return json({ error: identidadeErro }, { status: 409, headers: NO_STORE_HEADERS });
    }
    if (!String(nome || '').trim()) {
      return json({ error: 'Nome obrigatório.' }, { status: 400, headers: NO_STORE_HEADERS });
    }

    if (Array.isArray(dias)) {
      const db = event.platform?.env?.DB;
      if (!db) throw new Error('Banco D1 indisponível para validar as cidades.');
      if (roteiroGeograficoAtivo) {
        const resultado = await prepararCidadesGeograficasRoteiro(db, event.platform?.env?.GEO_DB, {
          dias
        });
        if (!resultado.ok)
          return json(
            { error: resultado.error },
            { status: resultado.status, headers: NO_STORE_HEADERS }
          );
        dias = resultado.body.dias;
      } else {
        const erroCidade = await validarCidadesRoteiro(db, { dias });
        if (erroCidade)
          return json({ error: erroCidade }, { status: 400, headers: NO_STORE_HEADERS });
      }
    }

    // Buscar company_id do usuário
    const { data: userProfile, error: userProfileError } = await dados
      .from('users')
      .select('company_id')
      .eq('id', user.id)
      .maybeSingle();
    if (userProfileError) throw userProfileError;
    const companyId = (userProfile as UserCompanyRow | null)?.company_id || null;

    if (revisaoRoteiroAtiva) {
      if (!roteiroGeograficoAtivo)
        throw new Error('Controle de revisão requer o roteiro geográfico.');
      const db = event.platform?.env?.DB;
      if (!db) throw new Error('Banco D1 indisponível para salvar o roteiro.');
      if (roteiroIdFromBody && !isUuid(roteiroIdFromBody))
        return json({ error: 'ID inválido.' }, { status: 400, headers: NO_STORE_HEADERS });
      if (roteiroIdFromBody && typeof body.revisao !== 'string')
        return json(
          { error: 'Revisão ausente. Recarregue o roteiro antes de salvar.' },
          { status: 409, headers: NO_STORE_HEADERS }
        );
      const roteiroId = roteiroIdFromBody || crypto.randomUUID();
      const atomico = new SalvamentoRoteiroAtomico(
        db,
        roteiroId,
        { userId: user.id },
        roteiroIdFromBody ? String(body.revisao) : '',
        { confirmadas: body.identidades_removidas_confirmadas }
      );
      const payload = {
        nome: String(nome).trim(),
        duracao: Number(duracao || 0) || null,
        inicio_cidade: String(inicio_cidade || '').trim() || null,
        fim_cidade: String(fim_cidade || '').trim() || null,
        ...(roteiroIdFromBody ? {} : { created_by: user.id, company_id: companyId, opcionais: [] })
      };
      atomico.principal(payload, !roteiroIdFromBody);
      if (Array.isArray(dias) && dias.length > 0) {
        atomico.excluir('roteiro_dia');
        atomico.inserir(
          'roteiro_dia',
          dias.map((dia, index) => {
            const day = isRecord(dia) ? dia : {};
            return {
              ...(day.id != null && day.id !== '' ? { id: day.id } : {}),
              created_by: user.id,
              company_id: companyId,
              ordem: index + 1,
              cidade: String(day.cidade || '').trim(),
              ...(typeof day.cidade_id === 'string' ? { cidade_id: day.cidade_id } : {}),
              data: typeof day.data === 'string' ? day.data : null,
              descricao: String(day.descricao || '').trim()
            };
          })
        );
      }
      const resultado = await atomico.executar();
      if (resultado.erroIdentificacao)
        return json(
          { error: resultado.erroIdentificacao },
          { status: 400, headers: NO_STORE_HEADERS }
        );
      if (resultado.identidadesRemovidas)
        return json(
          {
            error: 'Confirme a remoção dos vínculos geográficos antes de salvar.',
            identidades_removidas: resultado.identidadesRemovidas
          },
          { status: 409, headers: NO_STORE_HEADERS }
        );
      if (!resultado.atualizado)
        return json(
          { error: 'Roteiro alterado ou indisponível. Recarregue antes de salvar.' },
          { status: 409, headers: NO_STORE_HEADERS }
        );
      return json(
        { ok: true, id: roteiroId, revisao: resultado.revisao },
        { headers: NO_STORE_HEADERS }
      );
    }

    if (roteiroGeograficoAtivo && Array.isArray(dias) && dias.length > 0) {
      const db = event.platform?.env?.DB;
      if (!db) throw new Error('Banco D1 indisponível para salvar o roteiro.');
      const roteiroId = await salvarRoteiroSimplificadoAtomico(db, {
        id: roteiroIdFromBody && isUuid(roteiroIdFromBody) ? roteiroIdFromBody : null,
        userId: user.id,
        companyId,
        nome: String(nome).trim(),
        duracao,
        inicioCidade: inicio_cidade,
        fimCidade: fim_cidade,
        dias
      });
      if (!roteiroId)
        return json(
          { error: 'Roteiro não encontrado.' },
          { status: 404, headers: NO_STORE_HEADERS }
        );
      return json({ ok: true, id: roteiroId }, { headers: NO_STORE_HEADERS });
    }

    let roteiroId: string;

    const hasItinerarioConfig = Object.prototype.hasOwnProperty.call(body, 'itinerario_config');

    if (roteiroIdFromBody && isUuid(roteiroIdFromBody)) {
      // Atualizar roteiro existente (RLS garante que só o dono pode atualizar)
      const updatePayload: Record<string, unknown> = {
        nome: String(nome).trim(),
        duracao: Number(duracao || 0) || null,
        inicio_cidade: String(inicio_cidade || '').trim() || null,
        fim_cidade: String(fim_cidade || '').trim() || null,
        updated_at: new Date().toISOString()
      };
      if (hasItinerarioConfig) {
        updatePayload.itinerario_config = itinerario_config || null;
      }

      let { error: updateError } = await dados
        .from('roteiro_personalizado')
        .update(updatePayload)
        .eq('id', roteiroIdFromBody)
        .eq('created_by', user.id);

      if (updateError && hasItinerarioConfig && isMissingItinerarioConfigColumn(updateError)) {
        delete updatePayload.itinerario_config;
        ({ error: updateError } = await dados
          .from('roteiro_personalizado')
          .update(updatePayload)
          .eq('id', roteiroIdFromBody)
          .eq('created_by', user.id));
      }

      if (updateError) throw updateError;
      roteiroId = roteiroIdFromBody;
    } else {
      // Inserir novo roteiro
      const insertPayload: Record<string, unknown> = {
        nome: String(nome).trim(),
        duracao: Number(duracao || 0) || null,
        inicio_cidade: String(inicio_cidade || '').trim() || null,
        fim_cidade: String(fim_cidade || '').trim() || null,
        created_by: user.id,
        company_id: companyId,
        // D1 não tem DEFAULT '[]' como o Supabase: insert precisa sempre enviar a coluna
        opcionais: []
      };
      if (hasItinerarioConfig) {
        insertPayload.itinerario_config = itinerario_config || null;
      }

      let { data: inserted, error: insertError } = await dados
        .from('roteiro_personalizado')
        .insert(insertPayload)
        .select('id')
        .single();

      if (insertError && hasItinerarioConfig && isMissingItinerarioConfigColumn(insertError)) {
        delete insertPayload.itinerario_config;
        ({ data: inserted, error: insertError } = await dados
          .from('roteiro_personalizado')
          .insert(insertPayload)
          .select('id')
          .single());
      }

      if (insertError || !inserted?.id) {
        throw insertError || new Error('Falha ao criar roteiro.');
      }
      roteiroId = inserted.id;
    }

    // Salva dias se fornecidos
    if (Array.isArray(dias) && dias.length > 0) {
      const { error: deleteError } = await dados
        .from('roteiro_dia')
        .delete()
        .eq('roteiro_id', roteiroId);
      if (deleteError) throw deleteError;

      const diasRows = dias.map((dia, index: number) => {
        const day = isRecord(dia) ? (dia as RoteiroDiaDraft) : {};
        return {
          roteiro_id: roteiroId,
          created_by: user.id,
          company_id: companyId,
          ordem: index + 1,
          cidade: String(day.cidade || '').trim(),
          ...(typeof day.cidade_id === 'string' ? { cidade_id: day.cidade_id } : {}),
          data: typeof day.data === 'string' ? day.data : null,
          descricao: String(day.descricao || '').trim() || null
        };
      });

      if (diasRows.length > 0) {
        const { error: diasError } = await dados.from('roteiro_dia').insert(diasRows);
        if (diasError && !String(diasError.code || '').includes('42P01')) throw diasError;
      }
    }

    return json({ ok: true, id: roteiroId }, { headers: NO_STORE_HEADERS });
  } catch (err) {
    if (err instanceof IdentificacaoRegistroError)
      return json({ error: err.message }, { status: 400, headers: NO_STORE_HEADERS });
    logServerError('[roteiros] falha ao salvar roteiro', err);
    return toErrorResponse(err, 'Erro ao salvar roteiro.');
  }
}

export async function handleRoteirosDelete(event: RequestEvent) {
  try {
    const originError = rejectCrossOriginRequest(event.request);
    if (originError) return originError;

    const dados = event.locals.dados;
    const { session, user } = await event.locals.safeGetSession();
    if (!session || !user) {
      return new Response('Sessao invalida.', { status: 401, headers: NO_STORE_HEADERS });
    }

    const id = String(event.url.searchParams.get('id') || '').trim();
    if (!isUuid(id))
      return json({ error: 'ID inválido.' }, { status: 400, headers: NO_STORE_HEADERS });

    const revisao = decodificarRevisaoExclusao(event.url.searchParams.get('revisao'));
    if (revisaoRoteiroAtiva && revisao === null)
      return json(
        { error: 'Revisão ausente. Recarregue o roteiro antes de excluir.' },
        { status: 409, headers: NO_STORE_HEADERS }
      );
    let query = dados.from('roteiro_personalizado').delete().eq('id', id).eq('created_by', user.id);
    if (revisaoRoteiroAtiva) query = query.eq('revisao', revisao);
    const { data: excluido, error: deleteError } = await query.select('id').maybeSingle();

    if (deleteError) throw deleteError;
    if (revisaoRoteiroAtiva && !excluido)
      return json(
        { error: 'Roteiro alterado ou indisponível. Recarregue antes de excluir.' },
        { status: 409, headers: NO_STORE_HEADERS }
      );

    return json({ ok: true }, { headers: NO_STORE_HEADERS });
  } catch (err) {
    logServerError('[roteiros] falha ao excluir roteiro', err);
    return toErrorResponse(err, 'Erro ao excluir roteiro.');
  }
}

export async function handleRoteirosPatch(event: RequestEvent) {
  try {
    const originError = rejectCrossOriginRequest(event.request);
    if (originError) return originError;
    const bodyResult = await readJsonBodyLimited(event.request, MAX_ROTEIRO_BODY_BYTES);
    if (!bodyResult.ok) return bodyResult.response;

    const dados = event.locals.dados;
    const { session, user } = await event.locals.safeGetSession();
    if (!session || !user) {
      return new Response('Sessao invalida.', { status: 401, headers: NO_STORE_HEADERS });
    }

    const body =
      bodyResult.data && typeof bodyResult.data === 'object'
        ? (bodyResult.data as RoteiroPatchBody)
        : {};
    const { action } = body;

    if (action === 'sugestoes-busca') {
      const termo = sanitizePostgrestSearchTerm(
        typeof body.termo === 'string' ? body.termo : null,
        80
      );
      const tipo = String(body.tipo || '')
        .trim()
        .slice(0, 60);

      if (!termo && !tipo) return json({ sugestoes: [] }, { headers: NO_STORE_HEADERS });

      let query = dados
        .from('roteiro_sugestoes')
        .select(ROTEIRO_SUGESTAO_SELECT)
        .order('uso_count', { ascending: false })
        .limit(50);
      if (termo.length >= 2) query = query.ilike('valor', `%${termo}%`);
      if (tipo) query = query.eq('tipo', tipo);

      const { data, error } = await query;
      if (error) throw error;
      return json({ sugestoes: data || [] }, { headers: NO_STORE_HEADERS });
    }

    if (action === 'sugestoes-salvar') {
      const { tipo, valor } = body;
      if (!tipo || !valor) {
        return json(
          { error: 'tipo e valor obrigatorios.' },
          { status: 400, headers: NO_STORE_HEADERS }
        );
      }

      const safeTipo = String(tipo).trim().slice(0, 60);
      const safeValor = String(valor).trim().slice(0, 160);
      if (!safeTipo || !safeValor) {
        return json(
          { error: 'tipo e valor obrigatorios.' },
          { status: 400, headers: NO_STORE_HEADERS }
        );
      }
      if (safeTipo.toLowerCase() === 'cidade')
        return json(
          { error: 'Selecione cidades no cadastro de destinos, não nas sugestões de roteiro.' },
          { status: 400, headers: NO_STORE_HEADERS }
        );

      const normalizedValor = safeValor.toLowerCase();

      // Buscar company_id
      const { data: userProfile } = await dados
        .from('users')
        .select('company_id')
        .eq('id', user.id)
        .maybeSingle();
      const companyId = (userProfile as UserCompanyRow | null)?.company_id || null;

      const { data: existing } = await dados
        .from('roteiro_sugestoes')
        .select('id, uso_count')
        .eq('tipo', safeTipo)
        .eq('valor_normalizado', normalizedValor)
        .maybeSingle();
      const existingSuggestion = existing as RoteiroSugestaoRow | null;

      if (existingSuggestion) {
        await dados
          .from('roteiro_sugestoes')
          .update({ uso_count: (existingSuggestion.uso_count || 0) + 1 })
          .eq('id', existingSuggestion.id);
        return json({ ok: true, id: existingSuggestion.id }, { headers: NO_STORE_HEADERS });
      }

      const { data: inserted, error: insertError } = await dados
        .from('roteiro_sugestoes')
        .insert({
          tipo: safeTipo,
          valor: safeValor,
          company_id: companyId,
          valor_normalizado: normalizedValor
        })
        .select('id')
        .single();
      const insertedSuggestion = inserted as Pick<RoteiroSugestaoRow, 'id'> | null;

      if (insertError) throw insertError;
      return json({ ok: true, id: insertedSuggestion?.id || null }, { headers: NO_STORE_HEADERS });
    }

    if (action === 'sugestoes-remover') {
      const suggestionId = typeof body.id === 'string' ? body.id : '';
      if (!isUuid(suggestionId)) {
        return json({ error: 'ID invalido.' }, { status: 400, headers: NO_STORE_HEADERS });
      }
      await dados.from('roteiro_sugestoes').delete().eq('id', suggestionId);
      return json({ ok: true }, { headers: NO_STORE_HEADERS });
    }

    return json({ error: 'Acao invalida.' }, { status: 400, headers: NO_STORE_HEADERS });
  } catch (err) {
    logServerError('[roteiros] falha ao processar sugestoes', err);
    return toErrorResponse(err, 'Erro ao processar sugestoes.');
  }
}
