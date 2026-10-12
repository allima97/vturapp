// Migrado para Hono de src/routes/api/v1/clientes/resolve-import/+server.ts — corpo IDÊNTICO ao original
// (só nome/assinatura do handler e caminhos de import mudaram). Ver src/lib/server/api/app.ts.
import type { RequestEvent } from '@sveltejs/kit';
import { json } from '@sveltejs/kit';
import {
  ensureModuloAccess,
  getAdminClient,
  requireAuthenticatedUser,
  resolveScopedCompanyId,
  resolveScopedCompanyIds,
  resolveUserScope,
  toErrorResponse
} from '$lib/server/v1';
import { sanitizeImportedClienteNome } from '$lib/features/clientes/form';
import { titleCaseNome } from '$lib/normalizeText';
import { NO_STORE_HEADERS } from '$lib/server/httpCache';
import { invalidateClientReadModels } from '$lib/server/readModelCache';
import { readJsonBodyLimited, rejectCrossOriginRequest } from '$lib/server/requestGuards';
import { chunkArray, SUPABASE_IN_BATCH_SIZE } from '$lib/utils/array';

const MAX_CLIENTE_RESOLVE_IMPORT_BODY_BYTES = 128 * 1024;

type ClienteResolveImportBody = {
  cpf?: string;
  nome?: string;
  nascimento?: string;
  endereco?: string;
  numero?: string;
  cidade?: string;
  estado?: string;
  cep?: string;
  rg?: string;
  company_id?: string;
  empresa_id?: string;
};

function normalizeCpf(value?: string | null) {
  return String(value || '').replace(/\D/g, '');
}

function readClienteResolveImportBody(value: unknown): ClienteResolveImportBody {
  if (!value || typeof value !== 'object') return {};

  const body = value as Record<string, unknown>;
  const parsed: ClienteResolveImportBody = {};

  if (typeof body.cpf === 'string') parsed.cpf = body.cpf;
  if (typeof body.nome === 'string') parsed.nome = body.nome;
  if (typeof body.nascimento === 'string') parsed.nascimento = body.nascimento;
  if (typeof body.endereco === 'string') parsed.endereco = body.endereco;
  if (typeof body.numero === 'string') parsed.numero = body.numero;
  if (typeof body.cidade === 'string') parsed.cidade = body.cidade;
  if (typeof body.estado === 'string') parsed.estado = body.estado;
  if (typeof body.cep === 'string') parsed.cep = body.cep;
  if (typeof body.rg === 'string') parsed.rg = body.rg;
  if (typeof body.company_id === 'string') parsed.company_id = body.company_id;
  if (typeof body.empresa_id === 'string') parsed.empresa_id = body.empresa_id;

  return parsed;
}

export async function handleClientesResolveImportPost(event: RequestEvent) {
  try {
    const originError = rejectCrossOriginRequest(event.request);
    if (originError) return originError;
    const bodyResult = await readJsonBodyLimited(event.request, MAX_CLIENTE_RESOLVE_IMPORT_BODY_BYTES);
    if (!bodyResult.ok) return bodyResult.response;

    const client = getAdminClient();
    const user = await requireAuthenticatedUser(event);
    const scope = await resolveUserScope(client, user.id);

    if (!scope.isAdmin) {
      ensureModuloAccess(
        scope,
        ['clientes', 'clientes_consulta', 'vendas_cadastro', 'vendas'],
        2,
        'Sem permissão para criar cliente pela importação.'
      );
    }

    const body = readClienteResolveImportBody(bodyResult.data);
    const cpf = normalizeCpf(String(body.cpf || ''));
    const nome = titleCaseNome(sanitizeImportedClienteNome(String(body.nome || ''))) || null;
    const nascimento = String(body.nascimento || '').trim() || null;
    const endereco = String(body.endereco || '').trim() || null;
    const numero = String(body.numero || '').trim() || null;
    const cidade = String(body.cidade || '').trim() || null;
    const estado = String(body.estado || '').trim() || null;
    const cep = String(body.cep || '').trim() || null;
    const rg = String(body.rg || '').trim() || null;

    if (!cpf || cpf.length !== 11) {
      return new Response('CPF inválido.', { status: 400, headers: NO_STORE_HEADERS });
    }

    const formattedCpf = `${cpf.slice(0, 3)}.${cpf.slice(3, 6)}.${cpf.slice(6, 9)}-${cpf.slice(9, 11)}`;

    // ✅ Filtra clientes pelo escopo da empresa do usuário
    const requestedCompanyId = String(body?.company_id || body?.empresa_id || '').trim();
    const allowedCompanyIds = resolveScopedCompanyIds(scope, requestedCompanyId || null);
    if (!scope.isAdmin && allowedCompanyIds.length === 0) {
      return json(
        { error: requestedCompanyId ? 'Empresa fora do escopo.' : 'Empresa não identificada.' },
        { status: requestedCompanyId ? 403 : 400, headers: NO_STORE_HEADERS }
      );
    }

    const buildExistingQuery = (companyIdsFilter?: string[]) => {
      let query = client
        .from('clientes')
        .select(
          'id, cpf, nome, nascimento, endereco, numero, cidade, estado, cep, rg, telefone, whatsapp, email'
        )
        .in('cpf', [cpf, formattedCpf])
        .limit(1);

      if (!scope.isAdmin && companyIdsFilter && companyIdsFilter.length > 0) {
        query = query.in('company_id', companyIdsFilter);
      }

      return query;
    };

    const findExistingCliente = async () => {
      if (scope.isAdmin || allowedCompanyIds.length <= SUPABASE_IN_BATCH_SIZE) {
        const { data, error } = await buildExistingQuery(allowedCompanyIds).maybeSingle();
        if (error) throw error;
        return data || null;
      }

      for (const batch of chunkArray(allowedCompanyIds)) {
        const { data, error } = await buildExistingQuery(batch).maybeSingle();
        if (error) throw error;
        if (data) return data;
      }

      return null;
    };

    const existing = await findExistingCliente();

    if (existing) {
      const existingNome = String(existing.nome || '').trim();
      const existingNomeLimpo = titleCaseNome(sanitizeImportedClienteNome(existingNome)) || '';
      const updates: Record<string, string> = {};

      if (existingNomeLimpo && existingNomeLimpo !== existingNome) {
        updates.nome = existingNomeLimpo;
      } else if (nome && (!existingNome || existingNome.toLowerCase() === 'cliente sem nome')) {
        updates.nome = nome;
      }

      if (Object.keys(updates).length > 0) {
        await client.from('clientes').update(updates).eq('id', existing.id);
        invalidateClientReadModels({
          companyIds: allowedCompanyIds,
          userId: user.id
        });
      }

      return json({ cliente: { ...existing, ...updates }, created: false }, { headers: NO_STORE_HEADERS });
    }

    // ✅ company_id compatível com MASTER (usa primeiro do escopo)
    const companyId = scope.isAdmin
      ? (requestedCompanyId || null)
      : resolveScopedCompanyId(scope, requestedCompanyId || null);

    if (!scope.isAdmin && !companyId) {
      return json(
        { error: requestedCompanyId ? 'Empresa fora do escopo.' : 'Empresa não identificada.' },
        { status: requestedCompanyId ? 403 : 400, headers: NO_STORE_HEADERS }
      );
    }

    const { data: created, error: insertError } = await client
      .from('clientes')
      .insert({
        cpf: formattedCpf,
        nome: nome || 'Cliente sem nome',
        nascimento: nascimento || null,
        endereco: endereco || null,
        numero: numero || null,
        cidade: cidade || null,
        estado: estado || null,
        cep: cep || null,
        rg: rg || null,
        company_id: companyId,
        created_by: user.id,
        ativo: true
      })
      .select(
        'id, cpf, nome, nascimento, endereco, numero, cidade, estado, cep, rg, telefone, whatsapp, email'
      )
      .single();

    if (insertError) throw insertError;

    invalidateClientReadModels({
      companyIds: companyId ? [companyId] : allowedCompanyIds,
      userId: user.id
    });

    return json({ cliente: created, created: true }, { headers: NO_STORE_HEADERS });
  } catch (err) {
    return toErrorResponse(err, 'Erro ao resolver cliente.');
  }
}
