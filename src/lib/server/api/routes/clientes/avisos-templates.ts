// Migrado para Hono de src/routes/api/v1/clientes/avisos/templates/+server.ts — corpo IDÊNTICO ao original
// (só nome/assinatura do handler e caminhos de import mudaram). Ver src/lib/server/api/app.ts.
import type { RequestEvent } from '@sveltejs/kit';
import { json } from '@sveltejs/kit';
import { buildOfficialTemplateRows } from '$lib/cards/officialLibrary';
import {
  getAdminClient,
  requireAuthenticatedUser,
  resolveUserScope,
  toErrorResponse
} from '$lib/server/v1';
import { ensureClienteModuloAccess } from '$lib/server/clientes';
import { DYNAMIC_READ_HEADERS } from '$lib/server/httpCache';

function inferTipo(nome: string) {
  const value = String(nome || '')
    .trim()
    .toLowerCase();
  if (value.includes('anivers')) return 'aniversario';
  if (value.includes('promo')) return 'promocao';
  if (value.includes('confirm')) return 'confirmacao';
  if (value.includes('follow')) return 'follow_up';
  return 'geral';
}

type ScopeValue = 'system' | 'master' | 'gestor' | 'user';

type MessageTemplateRow = {
  id: string;
  user_id: string | null;
  company_id: string | null;
  scope: string | null;
  nome: string | null;
  assunto: string | null;
  titulo?: string | null;
  corpo: string | null;
  ativo: boolean | null;
};

function normalizeScope(value?: string | null): ScopeValue {
  const scope = String(value || '')
    .trim()
    .toLowerCase();
  if (scope === 'system' || scope === 'master' || scope === 'gestor' || scope === 'user')
    return scope;
  return 'system';
}

function inCompany(companyId: string | null, allowed: Set<string>) {
  const key = String(companyId || '').trim();
  return key ? allowed.has(key) : false;
}

function canAccessScopedRow(params: {
  isAdmin: boolean;
  userId: string;
  companyIds: Set<string>;
  rowUserId?: string | null;
  rowCompanyId?: string | null;
  rowScope?: string | null;
}) {
  const { isAdmin, userId, companyIds, rowUserId, rowCompanyId, rowScope } = params;
  if (isAdmin) return true;
  if (String(rowUserId || '') === userId) return true;
  const scope = normalizeScope(rowScope);
  if (scope === 'system') return true;
  if (scope === 'user') return false;
  return inCompany(rowCompanyId || null, companyIds);
}

function normalizeTemplateKey(value?: string | null) {
  return String(value || '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .trim();
}

export async function handleClientesAvisosTemplatesGet(event: RequestEvent) {
  try {
    const client = getAdminClient();
    const user = await requireAuthenticatedUser(event);
    const scope = await resolveUserScope(client, user.id);

    if (!scope.isAdmin) {
      ensureClienteModuloAccess(scope, 1, 'Sem acesso aos avisos do cliente.');
    }

    const companyIds = new Set<string>();
    if (scope.companyId) companyIds.add(String(scope.companyId));
    if (scope.papel === 'MASTER') {
      const { data: vinculos } = await client
        .from('master_empresas')
        .select('company_id, status')
        .eq('master_id', user.id);
      for (const row of vinculos || []) {
        const status = String(row?.status || '').toLowerCase();
        const companyId = String(row?.company_id || '').trim();
        if (!companyId || status === 'rejected') continue;
        companyIds.add(companyId);
      }
    }

    const { data: templates, error } = await client
      .from('user_message_templates')
      .select('id, user_id, company_id, scope, nome, assunto, corpo, ativo')
      .order('nome', { ascending: true });

    if (error) throw error;

    const visibleTemplates = ((templates || []) as MessageTemplateRow[])
      .filter((item) => item.ativo !== false)
      .filter((item) =>
        canAccessScopedRow({
          isAdmin: Boolean(scope.isAdmin),
          userId: user.id,
          companyIds,
          rowUserId: item.user_id || null,
          rowCompanyId: item.company_id || null,
          rowScope: item.scope || null
        })
      );

    const dedup = new Map<
      string,
      { id: string; nome: string; tipo: string; assunto: string; conteudo: string }
    >();

    for (const item of visibleTemplates) {
      const nome = String(item.nome || '').trim();
      if (!nome) continue;
      const key = normalizeTemplateKey(nome);
      if (!key || dedup.has(key)) continue;
      dedup.set(key, {
        id: String(item.id),
        nome,
        tipo: inferTipo(nome),
        assunto: String(item.assunto || item.titulo || ''),
        conteudo: String(item.corpo || '')
      });
    }

    const officialTemplates = buildOfficialTemplateRows(
      user.id,
      String(scope.companyId || '').trim() || null,
      {}
    );
    for (const item of officialTemplates) {
      if (!item.ativo) continue;
      const nome = String(item.nome || '').trim();
      if (!nome) continue;
      const key = normalizeTemplateKey(nome);
      if (!key || dedup.has(key)) continue;
      dedup.set(key, {
        id: `official-template:${key}`,
        nome,
        tipo: inferTipo(nome),
        assunto: String(item.assunto || item.titulo || ''),
        conteudo: String(item.corpo || '')
      });
    }

    const items = Array.from(dedup.values()).sort((a, b) => a.nome.localeCompare(b.nome));

    return json(
      {
        items
      },
      { headers: DYNAMIC_READ_HEADERS }
    );
  } catch (err) {
    return toErrorResponse(err, 'Erro ao carregar templates de aviso.');
  }
}
