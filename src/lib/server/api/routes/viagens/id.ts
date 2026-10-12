// Migrado para Hono de src/routes/api/v1/viagens/[id]/+server.ts — corpo IDÊNTICO ao original
// (só nome/assinatura do handler e caminhos de import mudaram). Ver src/lib/server/api/app.ts.
import type { RequestEvent } from '@sveltejs/kit';
import { json } from "@sveltejs/kit";
import type { SupabaseClient } from "@supabase/supabase-js";
import {
  ensureModuloAccess,
  getAdminClient,
  requireAuthenticatedUser,
  resolveScopedCompanyIds,
  resolveScopedVendedorIds,
  type UserScope,
  resolveUserScope,
  toErrorResponse,
} from "$lib/server/v1";
import { resolveViagemStatus } from "$lib/viagens/status";
import { syncViagemStatusIfNeeded } from "$lib/server/viagensStatus";
import { invalidateTripReadModels } from "$lib/server/readModelCache";
import { DYNAMIC_READ_HEADERS, NO_STORE_HEADERS } from "$lib/server/httpCache";
import { readJsonBodyLimited, rejectCrossOriginRequest } from "$lib/server/requestGuards";
import { chunkArray } from "$lib/utils/array";

const MAX_VIAGEM_UPDATE_BODY_BYTES = 256 * 1024;
const VIAGEM_ALLOWED_UPDATE_FIELDS = [
  "data_inicio",
  "data_fim",
  "status",
  "observacoes",
  "follow_up_text",
  "follow_up_fechado",
  "responsavel_user_id",
] as const;

type VendaResponsavelRow = {
  vendedor_id?: string | null;
};

type ClienteCreatedByRow = {
  created_by?: string | null;
};

type ViagemAccessRow = {
  company_id?: string | null;
  responsavel_user_id?: string | null;
  venda_id?: string | null;
  cliente_id?: string | null;
  data_inicio?: string | null;
  data_fim?: string | null;
  status?: string | null;
};

type ViagemUpdateBody = Partial<Record<(typeof VIAGEM_ALLOWED_UPDATE_FIELDS)[number] | "company_id", unknown>>;

type ViagemVendaResumo = {
  id?: string | null;
  valor_total?: number | null;
  valor_total_pago?: number | null;
  status?: string | null;
  data_venda?: string | null;
  recibos?: Array<Record<string, unknown> & { produto_nome?: string }>;
};

type ViagemUpdateData = {
  updated_at: string;
  data_inicio?: string | null;
  data_fim?: string | null;
  status?: string | null;
  observacoes?: string | null;
  follow_up_text?: string | null;
  follow_up_fechado?: boolean | null;
  responsavel_user_id?: string | null;
};

async function hasViagemAccessByResponsavel(
  client: SupabaseClient,
  scope: UserScope,
  userId: string,
  responsavelUserId?: string | null,
) {
  const allowedResponsavelIds = !scope.isAdmin
    ? scope.isGestor || scope.isMaster
      ? await resolveScopedVendedorIds(client, scope, null)
      : [userId]
    : await resolveScopedVendedorIds(client, scope, null);

  if (allowedResponsavelIds.length === 0) return scope.isAdmin;

  const responsavelId = String(responsavelUserId || "").trim();
  return responsavelId ? allowedResponsavelIds.includes(responsavelId) : false;
}

async function hasViagemAccessByVenda(
  client: SupabaseClient,
  scope: UserScope,
  userId: string,
  vendaId?: string | null,
) {
  const id = String(vendaId || "").trim();
  if (!id) return false;

  const allowedResponsavelIds = !scope.isAdmin
    ? scope.isGestor || scope.isMaster
      ? await resolveScopedVendedorIds(client, scope, null)
      : [userId]
    : await resolveScopedVendedorIds(client, scope, null);

  if (allowedResponsavelIds.length === 0) return scope.isAdmin;

  const { data: venda } = await client
    .from("vendas")
    .select("id, vendedor_id")
    .eq("id", id)
    .maybeSingle();

  const vendaRow = venda as VendaResponsavelRow | null;
  const vendedorId = String(vendaRow?.vendedor_id || "").trim();
  return vendedorId ? allowedResponsavelIds.includes(vendedorId) : false;
}

async function hasViagemAccessByCliente(
  client: SupabaseClient,
  scope: UserScope,
  userId: string,
  clienteId?: string | null,
) {
  const id = String(clienteId || "").trim();
  if (!id) return false;

  const allowedResponsavelIds = !scope.isAdmin
    ? scope.isGestor || scope.isMaster
      ? await resolveScopedVendedorIds(client, scope, null)
      : [userId]
    : await resolveScopedVendedorIds(client, scope, null);

  if (allowedResponsavelIds.length === 0) return scope.isAdmin;

  // Clientes relacionados a vendas do vendedor/equipe
  for (const responsavelBatch of chunkArray(allowedResponsavelIds)) {
    const { data: vendaCliente } = await client
      .from("vendas")
      .select("id")
      .eq("cliente_id", id)
      .in("vendedor_id", responsavelBatch)
      .limit(1);
    if (vendaCliente?.[0]?.id) return true;
  }

  // Fallback para cliente criado pelo vendedor/equipe
  const { data: cliente, error: clienteError } = await client
    .from("clientes")
    .select("id, created_by")
    .eq("id", id)
    .maybeSingle();
  if (!clienteError) {
    const clienteRow = cliente as ClienteCreatedByRow | null;
    const createdBy = String(clienteRow?.created_by || "").trim();
    if (createdBy && allowedResponsavelIds.includes(createdBy)) return true;
  }

  return false;
}

function shouldRestrictViagemToOwner(scope: UserScope) {
  // Gestor/Master/Admin podem operar a empresa. Vendedor comum fica restrito
  // à própria operação comercial; o fallback por cliente é controlado abaixo.
  return !scope.isAdmin && !scope.isGestor && !scope.isMaster;
}

function shouldAllowClienteFallback(scope: UserScope) {
  // Vendedor comum não pode enxergar/alterar uma viagem só porque já vendeu
  // para o mesmo cliente em outra oportunidade. Para ele, a viagem precisa
  // estar vinculada à própria venda ou atribuída diretamente.
  return !scope.isVendedor;
}

export async function handleViagensIdGet(event: RequestEvent) {
  try {
    const client = getAdminClient();
    const user = await requireAuthenticatedUser(event);
    const scope = await resolveUserScope(client, user.id);

    if (!scope.isAdmin) {
      ensureModuloAccess(
        scope,
        ["operacao_viagens", "viagens", "operacao"],
        1,
        "Sem acesso a Viagens.",
      );
    }

    const { id } = event.params;
    const companyIds = resolveScopedCompanyIds(
      scope,
      event.url.searchParams.get("empresa_id"),
    );

    const { data: viagem, error } = await client
      .from("viagens")
      .select(
        `
        id,
        venda_id,
        orcamento_id,
        cliente_id,
        company_id,
        responsavel_user_id,
        origem,
        destino,
        data_inicio,
        data_fim,
        status,
        observacoes,
        follow_up_text,
        follow_up_fechado,
        recibo_id,
        created_at,
        updated_at
      `,
      )
      .eq("id", id)
      .single();

    if (error) {
      if (error.code === "PGRST116") {
        return json({ error: "Viagem não encontrada" }, { status: 404, headers: NO_STORE_HEADERS });
      }
      throw error;
    }

    if (companyIds.length > 0 && !companyIds.includes(viagem.company_id)) {
      return json({ error: "Sem acesso a esta viagem" }, { status: 403, headers: NO_STORE_HEADERS });
    }

    if (shouldRestrictViagemToOwner(scope)) {
      const hasResponsavelAccess = await hasViagemAccessByResponsavel(
        client,
        scope,
        user.id,
        viagem.responsavel_user_id,
      );
      const hasVendaAccess = await hasViagemAccessByVenda(
        client,
        scope,
        user.id,
        viagem.venda_id,
      );
      const hasClienteAccess =
        shouldAllowClienteFallback(scope) &&
        (await hasViagemAccessByCliente(
          client,
          scope,
          user.id,
          viagem.cliente_id,
        ));
      if (!hasResponsavelAccess && !hasVendaAccess && !hasClienteAccess) {
        return json({ error: "Sem acesso a esta viagem" }, { status: 403, headers: NO_STORE_HEADERS });
      }
    }

    // Fase 3.4: as leituras abaixo não dependem umas das outras (só dos ids da
    // viagem), então rodam em paralelo. Mesmas consultas e mesmo resultado da
    // versão em fila — ver id.contract.test.ts.
    const loadCliente = async () => {
      if (!viagem.cliente_id) return null;
      const { data: clienteData } = await client
        .from("clientes")
        .select("id, nome, email, telefone, whatsapp")
        .eq("id", viagem.cliente_id)
        .single();
      return clienteData;
    };

    const loadVenda = async () => {
      if (!viagem.venda_id) return null;
      const { data: vendaData } = await client
        .from("vendas")
        .select("id, valor_total, valor_total_pago, status, data_venda")
        .eq("id", viagem.venda_id)
        .single();

      if (!vendaData) return null;
      const venda = { ...vendaData } as ViagemVendaResumo;

      const { data: recibosData } = await client
        .from("vendas_recibos")
        .select(
          `
          id,
          produto_id,
          produto_resolvido_id,
          numero_recibo,
          numero_reserva,
          tipo_pacote,
          valor_total,
          valor_taxas,
          data_inicio,
          data_fim,
          contrato_url
        `,
        )
        .eq("venda_id", viagem.venda_id);

      const produtoIds = [
        ...new Set(
          (recibosData || [])
            .map((r) => r.produto_id || r.produto_resolvido_id)
            .filter(Boolean),
        ),
      ];

      const produtosMap = new Map<string, string>();
      if (produtoIds.length > 0) {
        const { data: produtosData } = await client
          .from("produtos")
          .select("id, nome")
          .in("id", produtoIds);
        for (const p of produtosData || []) {
          produtosMap.set(p.id, p.nome);
        }
      }

      venda.recibos = (recibosData || []).map((r) => ({
        ...r,
        produto_nome:
          produtosMap.get(r.produto_id || r.produto_resolvido_id) ||
          "Produto",
      }));
      return venda;
    };

    const loadRecibo = async () => {
      if (!viagem.recibo_id) return null;
      const { data: reciboData } = await client
        .from("vendas_recibos")
        .select(
          "id, numero_recibo, numero_reserva, valor_total, data_inicio, data_fim",
        )
        .eq("id", viagem.recibo_id)
        .single();
      return reciboData;
    };

    const [statusAtual, cliente, venda, recibo, vouchersResult, passageirosResult] = await Promise.all([
      syncViagemStatusIfNeeded(client, viagem as ViagemAccessRow),
      loadCliente(),
      loadVenda(),
      loadRecibo(),
      // Vouchers vinculados especificamente a esta viagem (via vouchers.viagem_id).
      // Antes o filtro era só por company_id, o que trazia até 20 vouchers de
      // qualquer viagem da empresa — sem relação nenhuma com a viagem aberta.
      client
        .from("vouchers")
        .select(
          "id, nome, provider, codigo_sistema, codigo_fornecedor, data_inicio, data_fim, ativo",
        )
        .eq("viagem_id", id)
        .order("created_at", { ascending: false })
        .limit(50),
      client
        .from("viagem_passageiros")
        .select(
          `
          id, viagem_id, cliente_id, papel, observacoes, created_at,
          cliente:clientes!cliente_id(id, nome, cpf, telefone, data_nascimento:nascimento)
        `,
        )
        .eq("viagem_id", id)
        .order("created_at", { ascending: true }),
    ]);
    const viagemComStatus = { ...viagem, status: statusAtual };
    const vouchers = vouchersResult.data;
    const passageiros = passageirosResult.data;

    return json({
      viagem: {
        ...viagemComStatus,
        cliente,
        venda,
        recibo,
        vouchers: vouchers || [],
        passageiros: passageiros || [],
      },
    }, { headers: DYNAMIC_READ_HEADERS });
  } catch (err) {
    return toErrorResponse(err, "Erro ao carregar viagem.");
  }
}

export async function handleViagensIdPatch(event: RequestEvent) {
  try {
    const originError = rejectCrossOriginRequest(event.request);
    if (originError) return originError;
    const bodyResult = await readJsonBodyLimited(event.request, MAX_VIAGEM_UPDATE_BODY_BYTES);
    if (!bodyResult.ok) return bodyResult.response;

    const client = getAdminClient();
    const user = await requireAuthenticatedUser(event);
    const scope = await resolveUserScope(client, user.id);

    if (!scope.isAdmin) {
      ensureModuloAccess(
        scope,
        ["operacao_viagens", "viagens", "operacao"],
        2,
        "Sem permissão para editar viagens.",
      );
    }

    const { id } = event.params;
    const body =
      bodyResult.data && typeof bodyResult.data === 'object'
        ? (bodyResult.data as ViagemUpdateBody)
        : {};
    const companyId =
      typeof body.company_id === "string" || body.company_id == null
        ? body.company_id
        : undefined;
    const companyIds = resolveScopedCompanyIds(scope, companyId);

    const { data: existing, error: checkError } = await client
      .from("viagens")
      .select(
        "id, company_id, responsavel_user_id, venda_id, cliente_id, data_inicio, data_fim, status",
      )
      .eq("id", id)
      .single();

    if (checkError || !existing) {
      return json({ error: "Viagem não encontrada" }, { status: 404, headers: NO_STORE_HEADERS });
    }

    if (companyIds.length > 0 && !companyIds.includes(existing.company_id)) {
      return json({ error: "Sem acesso a esta viagem" }, { status: 403, headers: NO_STORE_HEADERS });
    }

    const existingRow = existing as ViagemAccessRow;
    if (shouldRestrictViagemToOwner(scope)) {
      const hasResponsavelAccess = await hasViagemAccessByResponsavel(
        client,
        scope,
        user.id,
        existingRow.responsavel_user_id,
      );
      const hasVendaAccess = await hasViagemAccessByVenda(
        client,
        scope,
        user.id,
        existingRow.venda_id ?? null,
      );
      const hasClienteAccess =
        shouldAllowClienteFallback(scope) &&
        (await hasViagemAccessByCliente(
          client,
          scope,
          user.id,
          existingRow.cliente_id ?? null,
        ));
      if (!hasResponsavelAccess && !hasVendaAccess && !hasClienteAccess) {
        return json({ error: "Sem acesso a esta viagem" }, { status: 403, headers: NO_STORE_HEADERS });
      }
    }

    const updateData: ViagemUpdateData = {
      updated_at: new Date().toISOString(),
    };
    for (const field of VIAGEM_ALLOWED_UPDATE_FIELDS) {
      const value = body[field];
      if (value === undefined) continue;
      if (field === "follow_up_fechado") {
        updateData.follow_up_fechado = typeof value === "boolean" ? value : null;
        continue;
      }
      if (field === "responsavel_user_id") {
        updateData.responsavel_user_id = typeof value === "string" ? value : null;
        continue;
      }
      if (field === "observacoes" || field === "follow_up_text") {
        updateData[field] = typeof value === "string" ? value : null;
        continue;
      }
      updateData[field] = typeof value === "string" ? value : null;
    }
    updateData.status = resolveViagemStatus({
      status: updateData.status ?? existingRow.status,
      data_inicio: updateData.data_inicio ?? existingRow.data_inicio,
      data_fim: updateData.data_fim ?? existingRow.data_fim,
    });

    const { data, error } = await client
      .from("viagens")
      .update(updateData)
      .eq("id", id)
      .select(
        "id, company_id, responsavel_user_id, venda_id, cliente_id, data_inicio, data_fim, status, observacoes, follow_up_text, follow_up_fechado, created_at, updated_at",
      )
      .single();

    if (error) throw error;

    const updatedRow = data as ViagemAccessRow | null;
    invalidateTripReadModels({
      companyIds: [
        String(
          updatedRow?.company_id || existingRow.company_id || "",
        ),
      ].filter(Boolean),
      vendedorIds: [
        String(existingRow.responsavel_user_id || ""),
        String(updatedRow?.responsavel_user_id || ""),
      ].filter(Boolean),
      userId: user.id,
    });

    return json({ viagem: data, message: "Viagem atualizada com sucesso" }, { headers: NO_STORE_HEADERS });
  } catch (err) {
    return toErrorResponse(err, "Erro ao atualizar viagem.");
  }
}

export async function handleViagensIdDelete(event: RequestEvent) {
  try {
    const originError = rejectCrossOriginRequest(event.request);
    if (originError) return originError;

    const client = getAdminClient();
    const user = await requireAuthenticatedUser(event);
    const scope = await resolveUserScope(client, user.id);

    if (!scope.isAdmin) {
      ensureModuloAccess(
        scope,
        ["operacao_viagens", "viagens", "operacao"],
        3,
        "Sem permissão para excluir viagens.",
      );
    }

    const { id } = event.params;
    const companyIds = resolveScopedCompanyIds(
      scope,
      event.url.searchParams.get("company_id"),
    );

    // ✅ Guard: não-admin deve ter empresa identificada
    if (!scope.isAdmin && companyIds.length === 0) {
      return json(
        { error: "Informe company_id para excluir viagem." },
        { status: 400, headers: NO_STORE_HEADERS },
      );
    }

    const { data: existing, error: checkError } = await client
      .from("viagens")
      .select("id, company_id, responsavel_user_id, venda_id, cliente_id")
      .eq("id", id)
      .single();

    if (checkError || !existing) {
      return json({ error: "Viagem não encontrada" }, { status: 404, headers: NO_STORE_HEADERS });
    }

    if (companyIds.length > 0 && !companyIds.includes(existing.company_id)) {
      return json({ error: "Sem acesso a esta viagem" }, { status: 403, headers: NO_STORE_HEADERS });
    }

    const existingRow = existing as ViagemAccessRow;
    if (shouldRestrictViagemToOwner(scope)) {
      const hasResponsavelAccess = await hasViagemAccessByResponsavel(
        client,
        scope,
        user.id,
        existingRow.responsavel_user_id,
      );
      const hasVendaAccess = await hasViagemAccessByVenda(
        client,
        scope,
        user.id,
        existingRow.venda_id ?? null,
      );
      const hasClienteAccess =
        shouldAllowClienteFallback(scope) &&
        (await hasViagemAccessByCliente(
          client,
          scope,
          user.id,
          existingRow.cliente_id ?? null,
        ));
      if (!hasResponsavelAccess && !hasVendaAccess && !hasClienteAccess) {
        return json({ error: "Sem acesso a esta viagem" }, { status: 403, headers: NO_STORE_HEADERS });
      }
    }

    const { error } = await client.from("viagens").delete().eq("id", id);
    if (error) throw error;

    invalidateTripReadModels({
      companyIds: [String(existingRow.company_id || "")].filter(Boolean),
      vendedorIds: [
        String(existingRow.responsavel_user_id || ""),
      ].filter(Boolean),
      userId: user.id,
    });

    return json({ message: "Viagem excluída com sucesso" }, { headers: NO_STORE_HEADERS });
  } catch (err) {
    return toErrorResponse(err, "Erro ao excluir viagem.");
  }
}
