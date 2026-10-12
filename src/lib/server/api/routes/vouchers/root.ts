// Migrado para Hono de src/routes/api/v1/vouchers/+server.ts — corpo IDÊNTICO ao original
// (só nome/assinatura do handler e caminhos de import mudaram). Ver src/lib/server/api/app.ts.
import type { RequestEvent } from '@sveltejs/kit';
import { json } from '@sveltejs/kit';
import {
  ensureModuloAccess,
  getAdminClient,
  isUuid,
  logServerError,
  requireAuthenticatedUser,
  resolveScopedCompanyIds,
  resolveUserScope,
  toErrorResponse
} from '$lib/server/v1';
import { DYNAMIC_READ_HEADERS, NO_STORE_HEADERS } from '$lib/server/httpCache';
import { readJsonBodyLimited, rejectCrossOriginRequest } from '$lib/server/requestGuards';
import { chunkArray, SUPABASE_IN_BATCH_SIZE } from '$lib/utils/array';

const MAX_VOUCHER_BODY_BYTES = 512 * 1024;

type VoucherListRow = {
  id: string | null;
  updated_at: string | null;
  [key: string]: unknown;
};

type VoucherDiaDraft = {
  dia_numero?: number | null;
  titulo?: string | null;
  descricao?: string | null;
  data_referencia?: string | null;
  cidade?: string | null;
};

type VoucherHotelDraft = {
  cidade?: string | null;
  hotel?: string | null;
  endereco?: string | null;
  data_inicio?: string | null;
  data_fim?: string | null;
  noites?: number | null;
  telefone?: string | null;
  contato?: string | null;
  status?: string | null;
  observacao?: string | null;
};

type VoucherCreateBody = {
  provider?: string | null;
  nome?: string | null;
  codigo_sistema?: string | null;
  codigo_fornecedor?: string | null;
  reserva_online?: string | null;
  passageiros?: string | null;
  tipo_acomodacao?: string | null;
  operador?: string | null;
  resumo?: string | null;
  extra_data?: Record<string, unknown> | null;
  data_inicio?: string | null;
  data_fim?: string | null;
  ativo?: boolean;
  viagem_id?: string | null;
  dias?: VoucherDiaDraft[];
  hoteis?: VoucherHotelDraft[];
};

export async function handleVouchersGet(event: RequestEvent) {
  try {
    const client = getAdminClient();
    const user = await requireAuthenticatedUser(event);
    const scope = await resolveUserScope(client, user.id);

    if (!scope.isAdmin) {
      ensureModuloAccess(scope, ['operacao_vouchers', 'vouchers', 'operacao'], 1, 'Sem acesso a Vouchers.');
    }

    const companyIds = resolveScopedCompanyIds(scope, event.url.searchParams.get('company_id'));

    const buildQuery = (companyIdsFilter?: string[]) => {
      let query = client
        .from('vouchers')
        .select(`
          id, company_id, provider, nome, codigo_sistema, codigo_fornecedor,
          reserva_online, passageiros, tipo_acomodacao, operador, resumo,
          data_inicio, data_fim, ativo, extra_data, created_at, updated_at,
          voucher_dias(id, dia_numero, titulo, descricao, data_referencia, cidade, ordem),
          voucher_hoteis(id, cidade, hotel, endereco, data_inicio, data_fim, noites, telefone, contato, status, observacao, ordem)
        `)
        .order('updated_at', { ascending: false })
        .limit(500);

      if (companyIdsFilter && companyIdsFilter.length > 0) query = query.in('company_id', companyIdsFilter);
      return query;
    };

    const fetchItems = async () => {
      if (companyIds.length <= SUPABASE_IN_BATCH_SIZE) {
        const { data, error } = await buildQuery(companyIds);
        if (error) throw error;
        return data || [];
      }

      const rows: VoucherListRow[] = [];
      for (const batch of chunkArray(companyIds)) {
        const { data, error } = await buildQuery(batch);
        if (error) throw error;
        rows.push(...(data || []));
      }

      const rowsById = new Map<string, VoucherListRow>();
      for (const row of rows) {
        rowsById.set(String(row?.id || ''), row);
      }

      return Array.from(rowsById.values())
        .sort((left, right) =>
          String(right?.updated_at || '').localeCompare(String(left?.updated_at || ''))
        )
        .slice(0, 500);
    };

    return json({ success: true, items: await fetchItems() }, { headers: DYNAMIC_READ_HEADERS });
  } catch (err: unknown) {
    return toErrorResponse(err, 'Erro ao carregar vouchers.');
  }
}

export async function handleVouchersPost(event: RequestEvent) {
  try {
    const originError = rejectCrossOriginRequest(event.request);
    if (originError) return originError;
    const bodyResult = await readJsonBodyLimited(event.request, MAX_VOUCHER_BODY_BYTES);
    if (!bodyResult.ok) return bodyResult.response;

    const client = getAdminClient();
    const user = await requireAuthenticatedUser(event);
    const scope = await resolveUserScope(client, user.id);

    if (!scope.isAdmin) {
      ensureModuloAccess(scope, ['operacao_vouchers', 'vouchers', 'operacao'], 2, 'Sem permissão para criar vouchers.');
    }

    const body: VoucherCreateBody =
      bodyResult.data && typeof bodyResult.data === 'object'
        ? (bodyResult.data as VoucherCreateBody)
        : {};

    // viagem_id é opcional (voucher avulso continua permitido); quando informado,
    // validamos que a viagem existe e pertence à mesma empresa do voucher, para
    // não linkar vouchers a viagens de outra empresa.
    let viagemId: string | null = null;
    const requestedViagemId = String(body.viagem_id || '').trim();
    if (requestedViagemId && isUuid(requestedViagemId)) {
      const { data: viagemScope } = await client
        .from('viagens')
        .select('id, company_id')
        .eq('id', requestedViagemId)
        .maybeSingle();
      if (viagemScope && viagemScope.company_id === scope.companyId) {
        viagemId = viagemScope.id;
      }
    }

    const { data: voucher, error: voucherError } = await client
      .from('vouchers')
      .insert([{
        company_id: scope.companyId,
        created_by: user.id,
        viagem_id: viagemId,
        provider: body.provider || 'special_tours',
        nome: String(body.nome || '').trim(),
        codigo_sistema: body.codigo_sistema || null,
        codigo_fornecedor: body.codigo_fornecedor || null,
        reserva_online: body.reserva_online || null,
        passageiros: body.passageiros || null,
        tipo_acomodacao: body.tipo_acomodacao || null,
        operador: body.operador || null,
        resumo: body.resumo || null,
        extra_data: body.extra_data || {},
        data_inicio: body.data_inicio || null,
        data_fim: body.data_fim || null,
        ativo: body.ativo !== false
      }])
      .select('id')
      .single();

    if (voucherError) throw voucherError;

    if (Array.isArray(body.dias) && body.dias.length > 0) {
      const diasPayload = body.dias.map((dia, index) => ({
        voucher_id: voucher.id,
        dia_numero: dia.dia_numero || index + 1,
        titulo: dia.titulo || null,
        descricao: String(dia.descricao || ''),
        data_referencia: dia.data_referencia || null,
        cidade: dia.cidade || null,
        ordem: index
      }));
      const { error: diasError } = await client.from('voucher_dias').insert(diasPayload);
      if (diasError) logServerError('[vouchers POST] Erro ao inserir dias', diasError);
    }

    if (Array.isArray(body.hoteis) && body.hoteis.length > 0) {
      const hoteisPayload = body.hoteis.map((hotel, index) => ({
        voucher_id: voucher.id,
        cidade: String(hotel.cidade || ''),
        hotel: String(hotel.hotel || ''),
        endereco: hotel.endereco || null,
        data_inicio: hotel.data_inicio || null,
        data_fim: hotel.data_fim || null,
        noites: hotel.noites ?? null,
        telefone: hotel.telefone || null,
        contato: hotel.contato || null,
        status: hotel.status || null,
        observacao: hotel.observacao || null,
        ordem: index
      }));
      const { error: hoteisError } = await client.from('voucher_hoteis').insert(hoteisPayload);
      if (hoteisError) logServerError('[vouchers POST] Erro ao inserir hoteis', hoteisError);
    }

    return json({ success: true, item: { id: voucher.id } }, { headers: NO_STORE_HEADERS });
  } catch (err: unknown) {
    return toErrorResponse(err, 'Erro ao criar voucher.');
  }
}
