// Migrado para Hono de src/routes/api/v1/clientes/[id]/+server.ts — corpo IDÊNTICO ao original
// (só nome/assinatura do handler e caminhos de import mudaram). Ver src/lib/server/api/app.ts.
import { registrarLog } from '$lib/server/auditLog';
import type { RequestEvent } from '@sveltejs/kit';
import { json } from '@sveltejs/kit';
import {
  getAdminClient,
  requireAuthenticatedUser,
  resolveUserScope,
  toErrorResponse
} from '$lib/server/v1';
import {
  buildClientePayload,
  createInitialClienteForm,
  fillClienteFormFromApi,
  type ClienteFormData,
  validateClienteForm
} from '$lib/features/clientes/form';
import {
  deriveClienteStatus,
  ensureClienteAccess,
  formatDocumentoDisplay,
  type ClienteScopedFilters
} from '$lib/server/clientes';
import { DYNAMIC_READ_HEADERS, NO_STORE_HEADERS } from '$lib/server/httpCache';
import { invalidateClientReadModels } from '$lib/server/readModelCache';
import { readJsonBodyLimited, rejectCrossOriginRequest, rejectLargePayload } from '$lib/server/requestGuards';
import { chunkArray, QUERY_IN_BATCH_SIZE } from '$lib/utils/array';

const MAX_CLIENTE_UPDATE_BODY_BYTES = 128 * 1024;
const MAX_CLIENTE_DELETE_BODY_BYTES = 8 * 1024;

type ClienteRow = {
  id: string;
  nome: string | null;
  cpf: string | null;
  rg: string | null;
  telefone: string | null;
  email: string | null;
  whatsapp: string | null;
  nascimento: string | null;
  genero: string | null;
  nacionalidade: string | null;
  tipo_pessoa: string | null;
  tipo_cliente: string | null;
  classificacao: string | null;
  cep: string | null;
  endereco: string | null;
  numero: string | null;
  complemento: string | null;
  cidade: string | null;
  estado: string | null;
  notas: string | null;
  tags: string[] | null;
  ativo: boolean | null;
  active: boolean | null;
  company_id: string | null;
  created_by: string | null;
  created_at: string | null;
  updated_at: string | null;
};

type VendaResumoRow = {
  id: string | null;
  data_venda: string | null;
  valor_total: number | string | null;
};

type QuoteResumoRow = {
  id: string | null;
  created_at: string | null;
};

const CLIENTE_SELECT_FIELDS =
  'id, nome, cpf, rg, telefone, email, whatsapp, nascimento, genero, nacionalidade, tipo_pessoa, tipo_cliente, classificacao, cep, endereco, numero, complemento, cidade, estado, notas, tags, ativo, active, company_id, created_by, created_at, updated_at';

async function fetchCliente(client: ReturnType<typeof getAdminClient>, id: string) {
  const { data, error } = await client
    .from('clientes')
    .select(CLIENTE_SELECT_FIELDS)
    .eq('id', id)
    .maybeSingle();

  if (error) throw error;
  return (data || null) as ClienteRow | null;
}

async function fetchResumoRelacionamentos(
  client: ReturnType<typeof getAdminClient>,
  clienteId: string,
  filters: ClienteScopedFilters
) {
  const buildVendasQuery = (companyIds?: string[], vendedorIds?: string[]) => {
    let vendasQuery = client
      .from('vendas')
      .select('id, data_venda, valor_total')
      .eq('cliente_id', clienteId)
      .eq('cancelada', false);

    if (companyIds && companyIds.length > 0) {
      vendasQuery = vendasQuery.in('company_id', companyIds);
    }
    if (vendedorIds && vendedorIds.length > 0) {
      vendasQuery = vendasQuery.in('vendedor_id', vendedorIds);
    }

    return vendasQuery;
  };

  let vendasData: VendaResumoRow[] = [];
  const companyBatches = filters.companyIds.length > 0 ? chunkArray(filters.companyIds) : [undefined];
  const vendedorBatches = filters.vendedorIds.length > 0 ? chunkArray(filters.vendedorIds) : [undefined];
  for (const companyBatch of companyBatches) {
    for (const vendedorBatch of vendedorBatches) {
      const { data, error: vendasError } = await buildVendasQuery(companyBatch, vendedorBatch);
      if (vendasError) throw vendasError;
      vendasData.push(...((data || []) as VendaResumoRow[]));
    }
  }
  const vendasById = new Map<string, VendaResumoRow>();
  for (const row of vendasData) {
    vendasById.set(String(row.id || ''), row);
  }
  vendasData = Array.from(vendasById.values());

  const buildQuotesQuery = (creatorIds?: string[]) => {
    let quotesQuery = client
      .from('quote')
      .select('id, created_at')
      .eq('client_id', clienteId);

    if (creatorIds && creatorIds.length > 0) {
      quotesQuery = quotesQuery.in('created_by', creatorIds);
    }

    return quotesQuery;
  };

  let quotesData: QuoteResumoRow[] = [];
  if (filters.vendedorIds.length > QUERY_IN_BATCH_SIZE) {
    for (const batch of chunkArray(filters.vendedorIds)) {
      const { data, error: quotesError } = await buildQuotesQuery(batch);
      if (quotesError) throw quotesError;
      quotesData.push(...((data || []) as QuoteResumoRow[]));
    }
  } else {
    const { data, error: quotesError } = await buildQuotesQuery(
      filters.vendedorIds.length > 0 ? filters.vendedorIds : undefined
    );
    if (quotesError) throw quotesError;
    quotesData = (data || []) as QuoteResumoRow[];
  }

  const { count, error: acompanhantesError } = await client
    .from('cliente_acompanhantes')
    .select('id', { count: 'exact', head: true })
    .eq('cliente_id', clienteId)
    .eq('ativo', true);

  if (acompanhantesError) throw acompanhantesError;

  const vendas = vendasData;
  const totalGasto = vendas.reduce(
    (acc, row) => acc + Number(row.valor_total || 0),
    0
  );
  const ultimaCompra = vendas.reduce<string | null>((acc, row) => {
    const current = String(row.data_venda || '').trim() || null;
    if (!current) return acc;
    return !acc || current > acc ? current : acc;
  }, null);

  return {
    total_gasto: totalGasto,
    total_viagens: vendas.length,
    total_orcamentos: quotesData?.length || 0,
    ultima_compra: ultimaCompra,
    acompanhantes_count: Number(count || 0)
  };
}

export async function handleClientesIdGet(event: RequestEvent) {
  try {
    const client = getAdminClient();
    const user = await requireAuthenticatedUser(event);
    const scope = await resolveUserScope(client, user.id);
    const id = String(event.params.id || '').trim();

    const filters = await ensureClienteAccess(
      client,
      scope,
      id,
      event.url.searchParams.get('empresa_id'),
      event.url.searchParams.get('vendedor_ids'),
      1
    );

    const row = await fetchCliente(client, id);
    if (!row) return json({ error: 'Cliente nao encontrado.' }, { status: 404, headers: NO_STORE_HEADERS });

    const resumo = await fetchResumoRelacionamentos(client, id, filters);

    return json({
      ...row,
      data_nascimento: row.nascimento,
      observacoes: row.notas,
      documento_formatado: formatDocumentoDisplay(row.cpf),
      status: deriveClienteStatus(row, resumo.ultima_compra),
      ...resumo
    }, { headers: DYNAMIC_READ_HEADERS });
  } catch (err) {
    return toErrorResponse(err, 'Erro ao carregar cliente.');
  }
}

export async function handleClientesIdPatch(event: RequestEvent) {
  try {
    const originError = rejectCrossOriginRequest(event.request);
    if (originError) return originError;
    const bodyResult = await readJsonBodyLimited(event.request, MAX_CLIENTE_UPDATE_BODY_BYTES);
    if (!bodyResult.ok) return bodyResult.response;

    const client = getAdminClient();
    const user = await requireAuthenticatedUser(event);
    const scope = await resolveUserScope(client, user.id);
    const id = String(event.params.id || '').trim();

    await ensureClienteAccess(
      client,
      scope,
      id,
      event.url.searchParams.get('empresa_id'),
      event.url.searchParams.get('vendedor_ids'),
      2
    );

    const existing = await fetchCliente(client, id);
    if (!existing) return json({ error: 'Cliente nao encontrado.' }, { status: 404, headers: NO_STORE_HEADERS });

    const body =
      bodyResult.data && typeof bodyResult.data === 'object'
        ? (bodyResult.data as Record<string, unknown>)
        : {};
    const form: ClienteFormData = {
      ...createInitialClienteForm(),
      ...fillClienteFormFromApi(existing),
      ...fillClienteFormFromApi(body),
      nome: String(body?.nome ?? existing.nome ?? ''),
      cpf: String(body?.cpf ?? existing.cpf ?? ''),
      tipo_pessoa: body?.tipo_pessoa === 'PJ' || existing.tipo_pessoa === 'PJ' ? 'PJ' : 'PF',
      telefone: String(body?.telefone ?? existing.telefone ?? ''),
      whatsapp: String(body?.whatsapp ?? existing.whatsapp ?? ''),
      email: String(body?.email ?? existing.email ?? ''),
      classificacao: String(body?.classificacao ?? existing.classificacao ?? ''),
      endereco: String(body?.endereco ?? existing.endereco ?? ''),
      numero: String(body?.numero ?? existing.numero ?? ''),
      complemento: String(body?.complemento ?? existing.complemento ?? ''),
      cidade: String(body?.cidade ?? existing.cidade ?? ''),
      estado: String(body?.estado ?? existing.estado ?? ''),
      cep: String(body?.cep ?? existing.cep ?? ''),
      rg: String(body?.rg ?? existing.rg ?? ''),
      genero: String(body?.genero ?? existing.genero ?? ''),
      nacionalidade: String(body?.nacionalidade ?? existing.nacionalidade ?? ''),
      tags: Array.isArray(body?.tags)
        ? body.tags.join(', ')
        : body?.tags !== undefined
          ? String(body.tags || '')
          : Array.isArray(existing.tags)
            ? existing.tags.join(', ')
            : '',
      tipo_cliente: String(body?.tipo_cliente ?? existing.tipo_cliente ?? 'passageiro'),
      notas: String(body?.notas ?? body?.observacoes ?? existing.notas ?? ''),
      nascimento: String(body?.nascimento ?? body?.data_nascimento ?? existing.nascimento ?? ''),
      ativo: body?.ativo !== undefined ? Boolean(body.ativo) : existing.ativo !== false,
      active: body?.active !== undefined ? Boolean(body.active) : existing.active !== false
    };

    const validation = validateClienteForm(form);
    if (!validation.valid) {
      return json(
        { error: validation.firstError || 'Dados invalidos.', errors: validation.errors },
        { status: 400, headers: NO_STORE_HEADERS }
      );
    }

    const payload = buildClientePayload(form);
    const { data, error: updateError } = await client
      .from('clientes')
      .update({ ...payload, updated_at: new Date().toISOString() })
      .eq('id', id)
      .select(CLIENTE_SELECT_FIELDS)
      .single();

    if (updateError) throw updateError;

    registrarLog(event, { userId: user.id, modulo: 'Clientes', acao: 'cliente_editado', detalhes: { id, payload } });

    invalidateClientReadModels({
      companyIds: data?.company_id ? [String(data.company_id)] : [],
      userId: user.id
    });

    return json({ cliente: data, message: 'Cliente atualizado com sucesso.' }, { headers: NO_STORE_HEADERS });
  } catch (err) {
    return toErrorResponse(err, 'Erro ao atualizar cliente.');
  }
}

export async function handleClientesIdDelete(event: RequestEvent) {
  try {
    const originError = rejectCrossOriginRequest(event.request);
    if (originError) return originError;
    const payloadError = rejectLargePayload(event.request, MAX_CLIENTE_DELETE_BODY_BYTES);
    if (payloadError) return payloadError;

    const client = getAdminClient();
    const user = await requireAuthenticatedUser(event);
    const scope = await resolveUserScope(client, user.id);
    const id = String(event.params.id || '').trim();

    const filters = await ensureClienteAccess(
      client,
      scope,
      id,
      event.url.searchParams.get('empresa_id'),
      event.url.searchParams.get('vendedor_ids'),
      3
    );

    const { error: deleteError } = await client.from('clientes').delete().eq('id', id);
    if (deleteError) throw deleteError;

    registrarLog(event, { userId: user.id, modulo: 'Clientes', acao: 'cliente_excluido', detalhes: { id } });

    invalidateClientReadModels({
      companyIds: filters.companyIds,
      userId: user.id
    });

    return json({ message: 'Cliente excluido com sucesso.' }, { headers: NO_STORE_HEADERS });
  } catch (err) {
    return toErrorResponse(err, 'Erro ao excluir cliente.');
  }
}
