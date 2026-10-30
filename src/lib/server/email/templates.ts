/**
 * Templates de e-mail básicos em HTML + texto.
 * Sem dependência de template engine — HTML inline simples.
 * Em F4+: migrar para React Email ou Handlebars via Workers.
 */

export type EmailTemplate = {
  subject: string;
  html: string;
  text: string;
};

/** E-mail de boas-vindas */
export function templateBoasVindas(params: {
  nome: string;
  empresa: string;
  loginUrl: string;
}): EmailTemplate {
  const { nome, empresa, loginUrl } = params;
  return {
    subject: `Bem-vindo ao ${empresa}!`,
    html: `
<!DOCTYPE html>
<html lang="pt-BR">
<head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1"></head>
<body style="font-family:sans-serif;max-width:600px;margin:0 auto;padding:24px;color:#111">
  <h1 style="font-size:24px;margin-bottom:16px">Bem-vindo, ${escHtml(nome)}!</h1>
  <p>Sua conta na agência <strong>${escHtml(empresa)}</strong> foi criada com sucesso.</p>
  <p style="margin-top:24px">
    <a href="${escHtml(loginUrl)}"
       style="background:#2563eb;color:#fff;padding:12px 24px;border-radius:6px;text-decoration:none;display:inline-block">
      Acessar o sistema
    </a>
  </p>
  <p style="margin-top:32px;font-size:12px;color:#6b7280">
    Se você não esperava este e-mail, ignore-o com segurança.
  </p>
</body>
</html>`,
    text: `Bem-vindo, ${nome}!\n\nSua conta na agência ${empresa} foi criada.\n\nAcesse: ${loginUrl}`,
  };
}

/** E-mail de teste para prova de stack (F1-07) */
export function templateTesteStack(params: {
  timestamp: string;
  environment: string;
}): EmailTemplate {
  return {
    subject: `[F1-07] Teste de e-mail Workers — ${params.environment}`,
    html: `
<!DOCTYPE html>
<html lang="pt-BR">
<body style="font-family:sans-serif;padding:24px;color:#111">
  <h2>✅ E-mail transacional via Resend API funcionando</h2>
  <p><strong>Environment:</strong> ${escHtml(params.environment)}</p>
  <p><strong>Timestamp:</strong> ${escHtml(params.timestamp)}</p>
  <p><strong>Runtime:</strong> Cloudflare Workers + Hono</p>
  <p style="font-size:12px;color:#6b7280">Prova de stack F1-07 — remover em F2+</p>
</body>
</html>`,
    text: `E-mail transacional via Resend funcionando.\nEnvironment: ${params.environment}\nTimestamp: ${params.timestamp}`,
  };
}

function escHtml(str: string): string {
  return str
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}
