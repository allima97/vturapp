/**
 * F1-07: Rotas de prova de e-mail transacional via Resend API.
 *
 * ATENÇÃO: rota de prova — requer RESEND_API_KEY configurado em .dev.vars
 * Remover ou proteger com auth real antes de F2-03.
 *
 * Endpoints:
 *   POST /api/v1/email-proof/send    — envia e-mail de teste
 *   GET  /api/v1/email-proof/status  — verifica se API key está configurada
 */
import { Hono } from 'hono';
import type { ApiEnv } from '../../types';
import { hasResendApiKey, sendEmail, ResendApiError } from '$lib/server/email/client';
import { templateTesteStack } from '$lib/server/email/templates';

const FROM_TEST = 'Vtur Dev <dev@vturapp.com.br>';

export const emailProofRoutes = new Hono<ApiEnv>()

  /**
   * GET /api/v1/email-proof/status
   * Verifica se RESEND_API_KEY está disponível (sem enviar nada).
   */
  .get('/status', (c) => {
    const apiKey = c.env.event?.platform?.env?.RESEND_API_KEY;
    const ok = hasResendApiKey(apiKey);
    return c.json({
      configured: ok,
      hint: ok ? 'RESEND_API_KEY presente e bem-formada (re_...)' : 'RESEND_API_KEY ausente ou inválida em .dev.vars',
    });
  })

  /**
   * POST /api/v1/email-proof/send
   * Body JSON: { to: string, from?: string }
   * Envia e-mail de teste e retorna o ID da mensagem Resend.
   */
  .post('/send', async (c) => {
    const env = c.env.event?.platform?.env;
    const apiKey = env?.RESEND_API_KEY;

    if (!hasResendApiKey(apiKey)) {
      return c.json(
        { error: 'RESEND_API_KEY não configurado. Adicione em .dev.vars: RESEND_API_KEY=re_...' },
        503
      );
    }

    let body: { to?: string; from?: string };
    try {
      body = await c.req.json<{ to?: string; from?: string }>();
    } catch {
      return c.json({ error: 'Body inválido: esperado JSON com "to"' }, 400);
    }

    if (!body.to || !body.to.includes('@')) {
      return c.json({ error: 'Campo "to" obrigatório (endereço de e-mail válido)' }, 400);
    }

    const template = templateTesteStack({
      timestamp: new Date().toISOString(),
      environment: env?.PUBLIC_ENVIRONMENT ?? 'development',
    });

    try {
      const result = await sendEmail(apiKey!, {
        from: body.from ?? FROM_TEST,
        to: body.to,
        subject: template.subject,
        html: template.html,
        text: template.text,
        tags: [{ name: 'fase', value: 'f1-07-prova-stack' }],
      });

      return c.json({ success: true, id: result.id, to: body.to });
    } catch (err) {
      if (err instanceof ResendApiError) {
        return c.json(
          { error: err.message, statusCode: err.statusCode, resendError: err.resendName },
          err.statusCode >= 500 ? 502 : 400
        );
      }
      return c.json({ error: String(err) }, 500);
    }
  });
