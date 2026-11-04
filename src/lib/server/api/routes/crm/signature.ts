// Migrado para Hono de src/routes/api/v1/crm/signature/+server.ts — corpo IDÊNTICO ao original
// (só nome/assinatura do handler e caminhos de import mudaram). Ver src/lib/server/api/app.ts.
import type { RequestEvent } from '@sveltejs/kit';
/**
 * API de Assinatura CRM — vtur-svelte
 *
 * Salva/atualiza a assinatura padrão do usuário em user_crm_assinaturas.
 * Portabilizado fielmente do vtur-app.
 */
import { json } from '@sveltejs/kit';
import { requireAuthenticatedUser, toErrorResponse } from '$lib/server/v1';
import { NO_STORE_HEADERS } from '$lib/server/httpCache';
import { readJsonBodyLimited, rejectCrossOriginRequest } from '$lib/server/requestGuards';

const MAX_CRM_SIGNATURE_BODY_BYTES = 64 * 1024;

type AssinaturaForm = {
  linha1?: string | null;
  linha1_font_size?: number | null;
  linha1_italic?: boolean | null;
  linha2?: string | null;
  linha2_font_size?: number | null;
  linha2_italic?: boolean | null;
  linha3?: string | null;
  linha3_font_size?: number | null;
  linha3_italic?: boolean | null;
};

function readAssinaturaForm(value: unknown): AssinaturaForm {
  if (!value || typeof value !== 'object') return {};
  const body = value as Record<string, unknown>;
  return {
    linha1: typeof body.linha1 === 'string' ? body.linha1 : null,
    linha1_font_size: typeof body.linha1_font_size === 'number' ? body.linha1_font_size : null,
    linha1_italic: typeof body.linha1_italic === 'boolean' ? body.linha1_italic : null,
    linha2: typeof body.linha2 === 'string' ? body.linha2 : null,
    linha2_font_size: typeof body.linha2_font_size === 'number' ? body.linha2_font_size : null,
    linha2_italic: typeof body.linha2_italic === 'boolean' ? body.linha2_italic : null,
    linha3: typeof body.linha3 === 'string' ? body.linha3 : null,
    linha3_font_size: typeof body.linha3_font_size === 'number' ? body.linha3_font_size : null,
    linha3_italic: typeof body.linha3_italic === 'boolean' ? body.linha3_italic : null,
  };
}

function readCrmSignatureBody(value: unknown): { assinatura: AssinaturaForm } {
  if (!value || typeof value !== 'object') {
    return { assinatura: {} };
  }

  const body = value as Record<string, unknown>;
  const assinaturaSource =
    body.assinatura && typeof body.assinatura === 'object' ? body.assinatura : body;

  return { assinatura: readAssinaturaForm(assinaturaSource) };
}

export async function handleCrmSignaturePost(event: RequestEvent) {
  try {
    const originError = rejectCrossOriginRequest(event.request);
    if (originError) return originError;
    const bodyResult = await readJsonBodyLimited(event.request, MAX_CRM_SIGNATURE_BODY_BYTES);
    if (!bodyResult.ok) return bodyResult.response;

    const user = await requireAuthenticatedUser(event);
    const client = event.locals.dados;
    const { assinatura } = readCrmSignatureBody(bodyResult.data);

    const row = {
      user_id: user.id,
      is_default: true,
      linha1: String(assinatura.linha1 || ''),
      linha1_font_size: Number(assinatura.linha1_font_size || 40),
      linha1_italic: Boolean(assinatura.linha1_italic),
      linha2: String(assinatura.linha2 || ''),
      linha2_font_size: Number(assinatura.linha2_font_size || 40),
      linha2_italic: Boolean(assinatura.linha2_italic),
      linha3: String(assinatura.linha3 || ''),
      linha3_font_size: Number(assinatura.linha3_font_size || 24),
      linha3_italic: Boolean(assinatura.linha3_italic),
      updated_at: new Date().toISOString(),
    };

    const { error } = await client
      .from('user_crm_assinaturas')
      .upsert(row, { onConflict: 'user_id,is_default' });

    if (error) throw error;

    return json({ ok: true }, { headers: NO_STORE_HEADERS });
  } catch (err) {
    return toErrorResponse(err, 'Erro ao salvar assinatura.');
  }
}
