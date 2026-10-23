/**
 * POST /api/v1/lgpd/solicitar
 *
 * Exercício de direitos do titular — LGPD Art. 18.
 * Rota PÚBLICA: não requer sessão (titular pode ser cliente externo não cadastrado).
 * Requer Turnstile para evitar spam.
 *
 * Prazo legal de resposta: 15 dias corridos (Art. 18, § 4).
 */
import type { RequestEvent } from '@sveltejs/kit';
import { json } from '@sveltejs/kit';
import { getAdminClient, logServerError } from '$lib/server/v1';
import { NO_STORE_HEADERS } from '$lib/server/httpCache';
import { readJsonBodyLimited } from '$lib/server/requestGuards';
import { env } from '$env/dynamic/private';
import { registrarLog } from '$lib/server/auditLog';

const MAX_BODY = 16 * 1024;

const TIPOS_VALIDOS = [
  'acesso', 'portabilidade', 'retificacao', 'eliminacao',
  'revogacao', 'oposicao', 'informacao'
] as const;
type TipoSolicitacao = typeof TIPOS_VALIDOS[number];

function cleanStr(v: unknown, max = 500): string {
  return String(v ?? '').trim().slice(0, max);
}

function isTipoValido(v: unknown): v is TipoSolicitacao {
  return TIPOS_VALIDOS.includes(v as TipoSolicitacao);
}

function isEmailBasico(email: string): boolean {
  return /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(email);
}

function resolveIp(request: Request): string | null {
  return request.headers.get('cf-connecting-ip')?.trim()
    || request.headers.get('x-forwarded-for')?.split(',')[0]?.trim()
    || null;
}

async function verificarTurnstile(token: string, ip: string | null): Promise<boolean> {
  const secret = env.TURNSTILE_SECRET_KEY;
  if (!secret) return true; // sem configuração, permite (dev)
  try {
    const form = new FormData();
    form.append('secret', secret);
    form.append('response', token);
    if (ip) form.append('remoteip', ip);
    const resp = await fetch('https://challenges.cloudflare.com/turnstile/v0/siteverify', {
      method: 'POST',
      body: form,
      signal: AbortSignal.timeout(8_000)
    });
    const data = await resp.json() as { success?: boolean };
    return data.success === true;
  } catch {
    return false;
  }
}

export async function handleLgpdSolicitarPost(event: RequestEvent) {
  try {
    const bodyResult = await readJsonBodyLimited(event.request, MAX_BODY);
    if (!bodyResult.ok) return bodyResult.response;

    const body = bodyResult.data as Record<string, unknown>;

    // Validação dos campos obrigatórios
    const tipo = body.tipo;
    if (!isTipoValido(tipo)) {
      return json(
        { error: 'Tipo de solicitação inválido. Valores aceitos: ' + TIPOS_VALIDOS.join(', ') },
        { status: 400, headers: NO_STORE_HEADERS }
      );
    }

    const nome = cleanStr(body.nome, 200);
    const email = cleanStr(body.email, 200).toLowerCase();
    const descricao = cleanStr(body.descricao, 2000);
    const cpf = cleanStr(body.cpf, 20);

    if (!nome) return json({ error: 'Nome é obrigatório.' }, { status: 400, headers: NO_STORE_HEADERS });
    if (!email || !isEmailBasico(email)) return json({ error: 'E-mail inválido.' }, { status: 400, headers: NO_STORE_HEADERS });
    if (!descricao) return json({ error: 'Descrição da solicitação é obrigatória.' }, { status: 400, headers: NO_STORE_HEADERS });

    // Verificação Turnstile (anti-spam)
    const turnstileToken = cleanStr(body.turnstileToken, 2048);
    const ip = resolveIp(event.request);
    if (turnstileToken && !(await verificarTurnstile(turnstileToken, ip))) {
      return json({ error: 'Verificação de segurança falhou. Tente novamente.' }, { status: 403, headers: NO_STORE_HEADERS });
    }

    const client = getAdminClient();

    // Limita 3 solicitações do mesmo email nos últimos 7 dias (anti-abuse)
    const seteAtras = new Date(Date.now() - 7 * 24 * 3600 * 1000).toISOString();
    const { count } = await client
      .from('lgpd_solicitacoes')
      .select('id', { count: 'exact', head: true })
      .eq('titular_email', email)
      .gte('created_at', seteAtras);

    if ((count ?? 0) >= 3) {
      return json(
        { error: 'Limite de solicitações atingido para este e-mail. Aguarde 7 dias ou entre em contato diretamente.' },
        { status: 429, headers: NO_STORE_HEADERS }
      );
    }

    const prazoLegal = new Date(Date.now() + 15 * 24 * 3600 * 1000).toISOString();

    const { data: solicitacao, error: insertErr } = await client
      .from('lgpd_solicitacoes')
      .insert({
        tipo,
        titular_nome: nome,
        titular_email: email,
        titular_cpf: cpf || null,
        descricao,
        ip_origem: ip,
        user_agent: event.request.headers.get('user-agent')?.slice(0, 500) || null,
        prazo_legal: prazoLegal,
        status: 'recebida'
      })
      .select('id, created_at, prazo_legal')
      .single();

    if (insertErr || !solicitacao) {
      logServerError('[lgpd/solicitar] erro ao gravar solicitação', insertErr);
      return json({ error: 'Erro ao registrar solicitação. Tente novamente.' }, { status: 500, headers: NO_STORE_HEADERS });
    }

    // Log de auditoria (best-effort)
    registrarLog(event, 'Admin', 'lgpd_solicitacao_recebida' as never, {
      id: solicitacao.id,
      tipo,
      titular_email: email
    }).catch(() => {});

    return json({
      ok: true,
      protocolo: solicitacao.id,
      prazo: solicitacao.prazo_legal,
      mensagem: `Solicitação registrada com sucesso. Protocolo: ${solicitacao.id}. Prazo de resposta: 15 dias corridos (LGPD Art. 18, § 4).`
    }, { headers: NO_STORE_HEADERS });

  } catch (err) {
    logServerError('[lgpd/solicitar] erro inesperado', err);
    return json({ error: 'Erro interno.' }, { status: 500, headers: NO_STORE_HEADERS });
  }
}
