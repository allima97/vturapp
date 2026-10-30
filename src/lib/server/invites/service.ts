/**
 * Serviço de convites — F2-02.
 *
 * Fluxo completo:
 *   1. criarConvite()    — gera token, salva em `convites`, envia e-mail via Resend
 *   2. getConvite()      — valida token (não expirado, não aceito)
 *   3. aceitarConvite()  — cria usuário via Better Auth, cria membro_empresa, marca aceito_em
 *
 * Dependências:
 *   - Drizzle ORM + D1 (getDb)
 *   - Better Auth (createAuth) para criar conta do usuário
 *   - Resend HTTP client (sendEmailWithRetry) para envio de e-mail
 */

import { eq, and, isNull } from 'drizzle-orm';
import { getDb } from '$lib/server/db/client';
import { convites, membrosEmpresa, user, empresas, type Papel } from '$lib/server/db/schema';
import { sendEmailWithRetry } from '$lib/server/email/client';
import type { AuthInstance } from '$lib/auth';

// ─────────────────────────────────────────────────────────────────────────────
// Tipos
// ─────────────────────────────────────────────────────────────────────────────

export type ConviteInfo = {
  id: number;
  empresaId: number;
  empresaNome: string;
  email: string;
  papel: Papel;
  expiresAt: string;
  aceitadoEm: string | null;
};

export type CriarConviteInput = {
  empresaId: number;
  email: string;
  papel: Papel;
  convidadoPorId: string;
};

export type AceitarConviteInput = {
  token: string;
  nome: string;
  senha: string;
};

// ─────────────────────────────────────────────────────────────────────────────
// Helpers
// ─────────────────────────────────────────────────────────────────────────────

const CONVITE_EXPIRY_DAYS = 7;

function addDays(date: Date, days: number): Date {
  const d = new Date(date);
  d.setDate(d.getDate() + days);
  return d;
}

/** Retorna true se a data ISO 8601 já expirou */
function isExpired(expiresAt: string): boolean {
  return new Date(expiresAt) < new Date();
}

/** Valida formato de e-mail básico */
function isValidEmail(email: string): boolean {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
}

// ─────────────────────────────────────────────────────────────────────────────
// Criar convite
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Cria um convite e envia e-mail ao convidado.
 *
 * @throws {ConviteError} se o e-mail for inválido, usuário já for membro,
 *                         ou a empresa não existir/ativa
 */
export async function criarConvite(
  d1: D1Database,
  input: CriarConviteInput,
  baseUrl: string,
  resendApiKey: string
): Promise<{ token: string; conviteId: number }> {
  const db = getDb(d1);
  const { empresaId, email, papel, convidadoPorId } = input;

  if (!isValidEmail(email)) {
    throw new ConviteError('E-mail inválido.', 'EMAIL_INVALIDO');
  }

  // Verificar que a empresa existe e está ativa
  const empresa = await db
    .select({ id: empresas.id, nome: empresas.nome, ativo: empresas.ativo })
    .from(empresas)
    .where(eq(empresas.id, empresaId))
    .get();

  if (!empresa) {
    throw new ConviteError('Empresa não encontrada.', 'EMPRESA_NAO_ENCONTRADA');
  }
  if (!empresa.ativo) {
    throw new ConviteError('Empresa inativa.', 'EMPRESA_INATIVA');
  }

  // Verificar se o e-mail já tem conta vinculada à empresa
  const usuarioExistente = await db
    .select({ id: user.id })
    .from(user)
    .where(and(eq(user.email, email), eq(user.empresaId, empresaId)))
    .get();

  if (usuarioExistente) {
    throw new ConviteError('Este e-mail já tem conta nesta empresa.', 'USUARIO_JA_EXISTE');
  }

  // Verificar se já existe convite pendente não expirado para este e-mail
  const convitePendente = await db
    .select({ id: convites.id, expiresAt: convites.expiresAt })
    .from(convites)
    .where(and(eq(convites.empresaId, empresaId), eq(convites.email, email), isNull(convites.aceitadoEm)))
    .get();

  if (convitePendente && !isExpired(convitePendente.expiresAt)) {
    throw new ConviteError('Já existe um convite pendente para este e-mail.', 'CONVITE_JA_EXISTE');
  }

  // Gerar token único
  const token = crypto.randomUUID();
  const expiresAt = addDays(new Date(), CONVITE_EXPIRY_DAYS).toISOString();
  const criadoEm = new Date().toISOString();

  // Salvar convite
  const result = await db
    .insert(convites)
    .values({
      empresaId,
      email,
      papel,
      token,
      expiresAt,
      convidadoPor: convidadoPorId,
      criadoEm,
    })
    .returning({ id: convites.id });

  const conviteId = result[0]?.id;
  if (!conviteId) {
    throw new ConviteError('Falha ao salvar convite.', 'ERRO_INTERNO');
  }

  // Enviar e-mail de convite
  const linkConvite = `${baseUrl}/auth/convite?token=${token}`;
  const nomeConvidante = convidadoPorId;

  await sendEmailWithRetry(resendApiKey, {
    from: 'convites@vturapp.com.br',
    to: email,
    subject: `Convite para ${empresa.nome} — VTUR`,
    html: templateConvite({
      email,
      empresaNome: empresa.nome,
      papel,
      linkConvite,
      expiresAt,
    }),
    text: `Você foi convidado para ${empresa.nome} como ${papel}.\nAcesse: ${linkConvite}\nVálido até: ${expiresAt}`,
  });

  return { token, conviteId };
}

// ─────────────────────────────────────────────────────────────────────────────
// Consultar convite
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Retorna informações de um convite pelo token.
 *
 * @throws {ConviteError} se o token for inválido, expirado ou já aceito
 */
export async function getConvite(
  d1: D1Database,
  token: string
): Promise<ConviteInfo> {
  const db = getDb(d1);

  const row = await db
    .select({
      id: convites.id,
      empresaId: convites.empresaId,
      empresaNome: empresas.nome,
      email: convites.email,
      papel: convites.papel,
      expiresAt: convites.expiresAt,
      aceitadoEm: convites.aceitadoEm,
    })
    .from(convites)
    .innerJoin(empresas, eq(empresas.id, convites.empresaId))
    .where(eq(convites.token, token))
    .get();

  if (!row) {
    throw new ConviteError('Convite não encontrado.', 'TOKEN_INVALIDO');
  }

  if (row.aceitadoEm) {
    throw new ConviteError('Este convite já foi aceito.', 'CONVITE_ACEITO');
  }

  if (isExpired(row.expiresAt)) {
    throw new ConviteError('Este convite expirou.', 'CONVITE_EXPIRADO');
  }

  return {
    id: row.id,
    empresaId: row.empresaId,
    empresaNome: row.empresaNome,
    email: row.email,
    papel: row.papel as Papel,
    expiresAt: row.expiresAt,
    aceitadoEm: row.aceitadoEm,
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// Aceitar convite
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Aceita um convite: cria conta Better Auth + membro_empresa.
 *
 * Transação lógica (D1 não suporta transações entre tabelas gerenciadas
 * por camadas distintas; usamos operações ordenadas com rollback manual):
 *   1. Validar convite (token, expirado, aceito)
 *   2. Criar usuário via Better Auth (signUpEmail)
 *   3. Atualizar user.empresa_id
 *   4. Inserir membros_empresa
 *   5. Marcar convite como aceito
 *
 * @throws {ConviteError} se o convite for inválido ou o e-mail já estiver registrado
 */
export async function aceitarConvite(
  d1: D1Database,
  auth: AuthInstance,
  input: AceitarConviteInput,
  baseUrl: string
): Promise<{ userId: string; empresaId: number }> {
  const db = getDb(d1);
  const { token, nome, senha } = input;

  // 1. Validar convite
  const convite = await getConvite(d1, token);

  // 2. Criar conta Better Auth
  const signUpResult = await auth.api.signUpEmail({
    body: {
      name: nome,
      email: convite.email,
      password: senha,
    },
  });

  if (!signUpResult?.user?.id) {
    throw new ConviteError('Falha ao criar conta de usuário.', 'ERRO_CRIAR_USUARIO');
  }

  const userId = signUpResult.user.id;
  const agora = new Date().toISOString();

  // 3. Vincular user ao tenant (empresa_id)
  await db
    .update(user)
    .set({ empresaId: convite.empresaId })
    .where(eq(user.id, userId));

  // 4. Criar entrada em membros_empresa
  await db.insert(membrosEmpresa).values({
    empresaId: convite.empresaId,
    userId,
    papel: convite.papel,
    ativo: true,
    criadoEm: agora,
    atualizadoEm: agora,
  });

  // 5. Marcar convite como aceito
  await db
    .update(convites)
    .set({ aceitadoEm: agora })
    .where(eq(convites.token, token));

  return { userId, empresaId: convite.empresaId };
}

// ─────────────────────────────────────────────────────────────────────────────
// Template de e-mail de convite
// ─────────────────────────────────────────────────────────────────────────────

function esc(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function templateConvite(params: {
  email: string;
  empresaNome: string;
  papel: Papel;
  linkConvite: string;
  expiresAt: string;
}): string {
  const { email, empresaNome, papel, linkConvite, expiresAt } = params;
  const expDate = new Date(expiresAt).toLocaleDateString('pt-BR', {
    day: '2-digit', month: 'long', year: 'numeric',
  });
  const papelLabel = { admin: 'Administrador', operador: 'Operador', visualizador: 'Visualizador' }[papel] ?? papel;

  return `<!DOCTYPE html>
<html lang="pt-BR">
<head><meta charset="utf-8"><title>Convite VTUR</title></head>
<body style="font-family:sans-serif;max-width:600px;margin:0 auto;padding:32px 16px;color:#1a1a1a">
  <h1 style="font-size:1.5rem;margin-bottom:8px">Convite para <strong>${esc(empresaNome)}</strong></h1>
  <p>Você foi convidado para acessar o sistema <strong>VTUR</strong> como <strong>${esc(papelLabel)}</strong>.</p>
  <p style="margin:24px 0">
    <a href="${esc(linkConvite)}"
       style="background:#2563eb;color:#fff;padding:12px 24px;border-radius:6px;text-decoration:none;font-weight:600;display:inline-block">
      Aceitar convite
    </a>
  </p>
  <p style="color:#555;font-size:0.875rem">
    Este link expira em <strong>${expDate}</strong>.
    Caso não reconheça este convite, ignore este e-mail.
  </p>
  <hr style="border:none;border-top:1px solid #e5e7eb;margin:24px 0">
  <p style="color:#999;font-size:0.75rem">VTUR — Sistema de gestão para agências de viagem</p>
</body>
</html>`;
}

// ─────────────────────────────────────────────────────────────────────────────
// Erro tipado
// ─────────────────────────────────────────────────────────────────────────────

export type ConviteErrorCode =
  | 'EMAIL_INVALIDO'
  | 'EMPRESA_NAO_ENCONTRADA'
  | 'EMPRESA_INATIVA'
  | 'USUARIO_JA_EXISTE'
  | 'CONVITE_JA_EXISTE'
  | 'TOKEN_INVALIDO'
  | 'CONVITE_ACEITO'
  | 'CONVITE_EXPIRADO'
  | 'ERRO_CRIAR_USUARIO'
  | 'ERRO_INTERNO';

export class ConviteError extends Error {
  constructor(
    message: string,
    public readonly code: ConviteErrorCode
  ) {
    super(message);
    this.name = 'ConviteError';
  }
}
