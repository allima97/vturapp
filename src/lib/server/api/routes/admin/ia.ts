// GET/POST /api/v1/admin/ia — escolha do provedor e modelo de IA dos roteiros
// (Claude ou Groq). Só administradores. As chaves de API ficam como secret no
// servidor e nunca são devolvidas: a tela só sabe se cada uma está presente.
import { json, type RequestEvent } from '@sveltejs/kit';
import { registrarLog } from '$lib/server/auditLog';
import { NO_STORE_HEADERS } from '$lib/server/httpCache';
import { readJsonBodyLimited, rejectCrossOriginRequest } from '$lib/server/requestGuards';
import {
  MODELOS_IA,
  carregarConfigIA,
  chaveDoProvedor,
  modeloIA,
  salvarConfigIA
} from '$lib/server/roteiroIA/provedores';
import {
  getAdminClient,
  logServerError,
  requireAuthenticatedUser,
  resolveUserScope,
  toErrorResponse
} from '$lib/server/v1';

const erro = (message: string, status: number) =>
  json({ error: message }, { status, headers: NO_STORE_HEADERS });

async function exigirAdmin(event: RequestEvent) {
  const client = getAdminClient();
  const user = await requireAuthenticatedUser(event);
  const scope = await resolveUserScope(client, user.id);
  return scope.isAdmin ? user : null;
}

async function resumoReaproveitamento(db: D1Database | undefined) {
  if (!db) return null;
  try {
    const row = await db
      .prepare(
        `SELECT COUNT(*) AS roteiros, COALESCE(SUM(acertos), 0) AS reaproveitados
         FROM roteiro_ia_cache`
      )
      .first<{ roteiros: number; reaproveitados: number }>();
    const opc = await db
      .prepare('SELECT COUNT(*) AS total FROM roteiro_ia_opcionais')
      .first<{ total: number }>();
    return {
      roteiros_guardados: row?.roteiros ?? 0,
      geracoes_reaproveitadas: row?.reaproveitados ?? 0,
      opcionais_na_biblioteca: opc?.total ?? 0
    };
  } catch {
    return null;
  }
}

export async function handleAdminIaGet(event: RequestEvent) {
  try {
    if (!(await exigirAdmin(event)))
      return erro('Somente administradores podem configurar a IA.', 403);
    const env = event.platform?.env;
    const config = await carregarConfigIA(env?.DB, env, false);
    return json(
      {
        modelo: config.modelo.id,
        origem: config.origem,
        atualizado_em: config.atualizadoEm,
        modelos: MODELOS_IA.map((m) => ({
          ...m,
          chave_configurada: Boolean(chaveDoProvedor(env, m.provedor))
        })),
        reaproveitamento: await resumoReaproveitamento(env?.DB)
      },
      { headers: NO_STORE_HEADERS }
    );
  } catch (err) {
    logServerError('[admin-ia] falha ao carregar', err);
    return toErrorResponse(err, 'Erro ao carregar a configuração de IA.');
  }
}

export async function handleAdminIaPost(event: RequestEvent) {
  try {
    const originError = rejectCrossOriginRequest(event.request);
    if (originError) return originError;
    const body = await readJsonBodyLimited(event.request, 4 * 1024);
    if (!body.ok) return body.response;
    const user = await exigirAdmin(event);
    if (!user) return erro('Somente administradores podem configurar a IA.', 403);

    const env = event.platform?.env;
    if (!env?.DB) return erro('Banco de dados indisponível.', 503);
    const modelo = modeloIA((body.data as { modelo?: unknown } | null)?.modelo as string);
    if (!modelo) return erro('Escolha um dos modelos da lista.', 400);
    if (!chaveDoProvedor(env, modelo.provedor))
      return erro(
        `A chave do ${modelo.provedor === 'groq' ? 'Groq (GROQ_API_KEY)' : 'Claude (ANTHROPIC_API_KEY)'} não está configurada no servidor.`,
        400
      );

    const anterior = await carregarConfigIA(env.DB, env, false);
    await salvarConfigIA(env.DB, modelo.id, user.id);
    registrarLog(event, {
      userId: user.id,
      modulo: 'Admin',
      acao: 'roteiro_ia_modelo_alterado',
      detalhes: { de: anterior.modelo.id, para: modelo.id, provedor: modelo.provedor }
    });
    return json({ ok: true, modelo: modelo.id }, { headers: NO_STORE_HEADERS });
  } catch (err) {
    logServerError('[admin-ia] falha ao salvar', err);
    return toErrorResponse(err, 'Erro ao salvar a configuração de IA.');
  }
}
