import { parseRoteiroOpcionais } from '$lib/roteiroOpcionais';
// Migrado para Hono de src/routes/api/v1/roteiros/save/+server.ts — corpo IDÊNTICO ao original
// (só nome/assinatura do handler e caminhos de import mudaram). Ver src/lib/server/api/app.ts.
import { json, type RequestEvent } from '@sveltejs/kit';
import { readJsonBodyLimited, rejectCrossOriginRequest } from '$lib/server/requestGuards';
import {
  getAdminClient,
  requireAuthenticatedUser,
  resolveUserScope,
  ensureModuloAccess,
  toErrorResponse,
  toISODateLocal,
  isUuid
} from '$lib/server/v1';
import { NO_STORE_HEADERS } from '$lib/server/httpCache';

const MAX_ROTEIRO_SAVE_BODY_BYTES = 512 * 1024;

type RoteiroDiaPayload = {
  cidade?: string | null;
  percurso?: string | null;
  data?: string | null;
  descricao?: string | null;
  ordem?: unknown;
  [key: string]: unknown;
};

type RoteiroDiaDraft = {
  created_by: string;
  company_id: string | null | undefined;
  roteiro_id: string;
  cidade: string;
  percurso: string;
  data: string | null;
  descricao: string;
  ordem: number;
};

type RoteiroHotelPayload = {
  cidade?: string | null;
  hotel?: string | null;
  endereco?: string | null;
  data_inicio?: string | null;
  data_fim?: string | null;
  noites?: unknown;
  qtd_apto?: unknown;
  apto?: string | null;
  categoria?: string | null;
  regime?: string | null;
  tipo_tarifa?: string | null;
  qtd_adultos?: unknown;
  qtd_criancas?: unknown;
  valor_original?: unknown;
  valor_final?: unknown;
  ordem?: unknown;
};

type RoteiroHotelDraft = {
  roteiro_id: string;
  cidade: string | null;
  hotel: string | null;
  endereco: string | null;
  data_inicio: string | null;
  data_fim: string | null;
  noites: unknown;
  qtd_apto: unknown;
  apto: string | null;
  categoria: string | null;
  regime: string | null;
  tipo_tarifa: string | null;
  qtd_adultos: unknown;
  qtd_criancas: unknown;
  valor_original: unknown;
  valor_final: unknown;
  ordem: number;
};

type RoteiroPasseioPayload = {
  cidade?: string | null;
  passeio?: string | null;
  fornecedor?: string | null;
  data_inicio?: string | null;
  data_fim?: string | null;
  tipo?: string | null;
  ingressos?: string | null;
  qtd_adultos?: unknown;
  qtd_criancas?: unknown;
  valor_original?: unknown;
  valor_final?: unknown;
  ordem?: unknown;
};

type RoteiroPasseioDraft = {
  roteiro_id: string;
  cidade: string | null;
  passeio: string | null;
  fornecedor: string | null;
  data_inicio: string | null;
  data_fim: string | null;
  tipo: string | null;
  ingressos: string | null;
  qtd_adultos: unknown;
  qtd_criancas: unknown;
  valor_original: unknown;
  valor_final: unknown;
  ordem: number;
};

type RoteiroTransportePayload = {
  trecho?: string | null;
  cia_aerea?: string | null;
  data_voo?: string | null;
  classe_reserva?: string | null;
  hora_saida?: string | null;
  aeroporto_saida?: string | null;
  duracao_voo?: string | null;
  tipo_voo?: string | null;
  hora_chegada?: string | null;
  aeroporto_chegada?: string | null;
  tarifa_nome?: string | null;
  reembolso_tipo?: string | null;
  qtd_adultos?: unknown;
  qtd_criancas?: unknown;
  taxas?: unknown;
  valor_total?: unknown;
  tipo?: string | null;
  fornecedor?: string | null;
  descricao?: string | null;
  data_inicio?: string | null;
  data_fim?: string | null;
  categoria?: string | null;
  observacao?: string | null;
  ordem?: unknown;
};

type RoteiroTransporteDraft = {
  roteiro_id: string;
  trecho: string | null;
  cia_aerea: string | null;
  data_voo: string | null;
  classe_reserva: string | null;
  hora_saida: string | null;
  aeroporto_saida: string | null;
  duracao_voo: string | null;
  tipo_voo: string | null;
  hora_chegada: string | null;
  aeroporto_chegada: string | null;
  tarifa_nome: string | null;
  reembolso_tipo: string | null;
  qtd_adultos: unknown;
  qtd_criancas: unknown;
  taxas: unknown;
  valor_total: unknown;
  tipo: string | null;
  fornecedor: string | null;
  descricao: string | null;
  data_inicio: string | null;
  data_fim: string | null;
  categoria: string | null;
  observacao: string | null;
  ordem: number;
};

type RoteiroInvestimentoPayload = {
  tipo?: string | null;
  valor_por_pessoa?: unknown;
  qtd_apto?: unknown;
  valor_por_apto?: unknown;
  ordem?: unknown;
};

type RoteiroInvestimentoDraft = {
  roteiro_id: string;
  tipo: string | null;
  valor_por_pessoa: number;
  qtd_apto: number;
  valor_por_apto: number;
  ordem: number;
};

type RoteiroPagamentoPayload = {
  servico?: string | null;
  valor_total_com_taxas?: unknown;
  taxas?: unknown;
  forma_pagamento?: string | null;
  ordem?: unknown;
};

type RoteiroPagamentoDraft = {
  roteiro_id: string;
  servico: string | null;
  valor_total_com_taxas: number;
  taxas: number;
  forma_pagamento: string | null;
  ordem: number;
};

type ScopedRoteiroEq<T> = T & {
  eq: (column: string, value: string | null | undefined) => T;
};

function applyRoteiroScope<T>(
  query: T,
  scope: { isAdmin?: boolean; isGestor?: boolean; isMaster?: boolean; userId?: string | null; companyId?: string | null },
) {
  const scopedQuery = query as ScopedRoteiroEq<T>;
  if (!scope.isAdmin && !scope.isGestor && !scope.isMaster) {
    return scopedQuery.eq('created_by', scope.userId);
  }

  if (scope.companyId && !scope.isAdmin && !scope.isMaster) {
    return scopedQuery.eq('company_id', scope.companyId);
  }

  return query;
}

function normalizeDiaKey(d: {
  cidade: string;
  percurso?: string | null;
  data: string | null;
  descricao: string;
}): string {
  const cidade = String(d.cidade || '').trim().toLocaleLowerCase();
  const percurso = String(d.percurso || '').trim().toLocaleLowerCase();
  const data = String(d.data || '').trim();
  const descricao = String(d.descricao || '').trim().toLocaleLowerCase();
  return `${data}__${cidade}__${percurso}__${descricao}`;
}

function stripPercursoField(list: RoteiroDiaDraft[]): Array<Omit<RoteiroDiaDraft, 'percurso'>> {
  return (list || []).map((d) => {
    const { percurso: _percurso, ...rest } = d || {};
    return rest;
  });
}

function readDiaOrdem(row: RoteiroDiaPayload): number {
  if (typeof row?.ordem === 'number' && Number.isFinite(row.ordem)) return row.ordem;
  const parsed = Number(row?.ordem);
  return Number.isFinite(parsed) ? parsed : 0;
}

function isMissingPercursoColumn(error: unknown) {
  const errorRecord = typeof error === 'object' && error !== null ? (error as Record<string, unknown>) : null;
  const code = String(errorRecord?.code || '');
  const msg = String(errorRecord?.message || '');
  return (
    code === '42703' ||
    (/percurso/i.test(msg) &&
      /does not exist|nao existe|não existe|unknown column|column/i.test(msg))
  );
}

function isMissingOnConflictConstraint(error: unknown) {
  const errorRecord = typeof error === 'object' && error !== null ? (error as Record<string, unknown>) : null;
  const code = String(errorRecord?.code || '');
  const msg = String(errorRecord?.message || '');
  return (
    code === '42P10' || /unique or exclusion constraint/i.test(msg)
  );
}

function isDuplicateOrdensUnique(error: unknown) {
  const errorRecord = typeof error === 'object' && error !== null ? (error as Record<string, unknown>) : null;
  const code = String(errorRecord?.code || '');
  const msg = String(errorRecord?.message || '');
  const details = String(errorRecord?.details || '');
  return (
    code === '23505' ||
    /duplicate key value violates unique constraint/i.test(msg) ||
    /roteiro_dia_roteiro_ordem_uniq/i.test(msg) ||
    /roteiro_dia_roteiro_ordem_uniq/i.test(details)
  );
}

export async function handleRoteirosSavePost(event: RequestEvent) {
  try {
    const originError = rejectCrossOriginRequest(event.request);
    if (originError) return originError;
    const bodyResult = await readJsonBodyLimited(event.request, MAX_ROTEIRO_SAVE_BODY_BYTES);
    if (!bodyResult.ok) return bodyResult.response;

    const client = getAdminClient();
    const user = await requireAuthenticatedUser(event);
    const scope = await resolveUserScope(client, user.id);

    ensureModuloAccess(scope, ['Orcamentos'], 2, 'Sem acesso para salvar Roteiros.');

    const body =
      bodyResult.data && typeof bodyResult.data === 'object'
        ? (bodyResult.data as Record<string, unknown>)
        : null;
    if (!body) return new Response('Body invalido.', { status: 400, headers: NO_STORE_HEADERS });

    const nome = String(body.nome || '').trim();
    if (!nome) return new Response('Nome obrigatorio.', { status: 400, headers: NO_STORE_HEADERS });

    let opcionais;
    if (body.opcionais !== undefined) {
      try {
        opcionais = parseRoteiroOpcionais(body.opcionais);
      } catch (err) {
        return json({ error: err instanceof Error ? err.message : 'Opcionais inválidos.' }, { status: 400, headers: NO_STORE_HEADERS });
      }
    }

    const companyId = scope.companyId;
    const isNew = !body.id;

    const incluiTexto = typeof body.inclui_texto === 'string' ? body.inclui_texto : null;
    const naoIncluiTexto = typeof body.nao_inclui_texto === 'string' ? body.nao_inclui_texto : null;
    const informacoesImportantes =
      typeof body.informacoes_importantes === 'string' ? body.informacoes_importantes : null;

    const mostrarPagamentoPdf = body.mostrar_pagamento_pdf === false ? false : true;
    const mostrarInformacoesPdf = body.mostrar_informacoes_pdf === false ? false : true;
    const mostrarRodapePdf = body.mostrar_rodape_pdf === false ? false : true;

    // Upsert roteiro principal
    let roteiroId: string;

    if (isNew) {
      const insertPayload: Record<string, unknown> = {
        created_by: user.id,
        company_id: companyId,
        nome,
        ...(opcionais !== undefined ? { opcionais } : {}),
        duracao: body.duracao || null,
        inicio_cidade: body.inicio_cidade || null,
        fim_cidade: body.fim_cidade || null,
        inclui_texto: incluiTexto,
        nao_inclui_texto: naoIncluiTexto,
        informacoes_importantes: informacoesImportantes,
        mostrar_pagamento_pdf: mostrarPagamentoPdf,
        mostrar_informacoes_pdf: mostrarInformacoesPdf,
        mostrar_rodape_pdf: mostrarRodapePdf
      };

      const { data: roteiro, error: roteiroErr } = await client
        .from('roteiro_personalizado')
        .insert(insertPayload)
        .select('id')
        .single();

      if (roteiroErr || !roteiro) throw roteiroErr || new Error('Falha ao criar roteiro.');
      roteiroId = roteiro.id;
    } else {
      roteiroId = String(body.id).trim();
      if (!isUuid(roteiroId)) return new Response('ID invalido.', { status: 400, headers: NO_STORE_HEADERS });

      const { data: existing, error: existingError } = await applyRoteiroScope(
        client.from('roteiro_personalizado').select('id').eq('id', roteiroId).maybeSingle(),
        scope
      );
      if (existingError) throw existingError;
      if (!existing) return new Response('Roteiro nao encontrado.', { status: 404, headers: NO_STORE_HEADERS });

      const updatePayload: Record<string, unknown> = {
        nome,
        ...(opcionais !== undefined ? { opcionais } : {}),
        duracao: body.duracao || null,
        inicio_cidade: body.inicio_cidade || null,
        fim_cidade: body.fim_cidade || null,
        inclui_texto: incluiTexto,
        nao_inclui_texto: naoIncluiTexto,
        informacoes_importantes: informacoesImportantes,
        mostrar_pagamento_pdf: mostrarPagamentoPdf,
        mostrar_informacoes_pdf: mostrarInformacoesPdf,
        mostrar_rodape_pdf: mostrarRodapePdf,
        updated_at: new Date().toISOString()
      };

      const { error: updateErr } = await client
        .from('roteiro_personalizado')
        .update(updatePayload)
        .eq('id', roteiroId);

      if (updateErr) throw updateErr;
    }

    // Hotéis
    if (Array.isArray(body.hoteis)) {
      await client.from('roteiro_hotel').delete().eq('roteiro_id', roteiroId);
      if (body.hoteis.length > 0) {
        const hoteis = body.hoteis
          .map((h: RoteiroHotelPayload, idx: number): RoteiroHotelDraft => ({
            roteiro_id: roteiroId,
            cidade: h.cidade || null,
            hotel: h.hotel || null,
            endereco: h.endereco || null,
            data_inicio: h.data_inicio || null,
            data_fim: h.data_fim || null,
            noites: h.noites || null,
            qtd_apto: h.qtd_apto || null,
            apto: h.apto || null,
            categoria: h.categoria || null,
            regime: h.regime || null,
            tipo_tarifa: h.tipo_tarifa || null,
            qtd_adultos: h.qtd_adultos || null,
            qtd_criancas: h.qtd_criancas || null,
            valor_original: h.valor_original || null,
            valor_final: h.valor_final || null,
            ordem: typeof h.ordem === 'number' ? h.ordem : idx
          }))
          .filter((h: RoteiroHotelDraft) =>
            Boolean(
              String(h.cidade || '').trim() ||
                String(h.hotel || '').trim() ||
                String(h.endereco || '').trim() ||
                String(h.data_inicio || '').trim() ||
                String(h.data_fim || '').trim() ||
                String(h.apto || '').trim() ||
                String(h.regime || '').trim() ||
                String(h.categoria || '').trim() ||
                String(h.tipo_tarifa || '').trim() ||
                Number.isFinite(Number(h.noites)) ||
                Number.isFinite(Number(h.qtd_apto)) ||
                Number.isFinite(Number(h.qtd_adultos)) ||
                Number.isFinite(Number(h.qtd_criancas)) ||
                Number.isFinite(Number(h.valor_original)) ||
                Number.isFinite(Number(h.valor_final))
            )
          );

        if (hoteis.length > 0) {
          const { error } = await client.from('roteiro_hotel').insert(hoteis);
          if (error) throw error;
        }
      }
    }

    // Passeios
    if (Array.isArray(body.passeios)) {
      await client.from('roteiro_passeio').delete().eq('roteiro_id', roteiroId);
      if (body.passeios.length > 0) {
        const passeios = body.passeios
          .map((p: RoteiroPasseioPayload, idx: number): RoteiroPasseioDraft => ({
            roteiro_id: roteiroId,
            cidade: p.cidade || null,
            passeio: p.passeio || null,
            fornecedor: p.fornecedor || null,
            data_inicio: p.data_inicio || null,
            data_fim: p.data_fim || null,
            tipo: p.tipo || null,
            ingressos: p.ingressos || null,
            qtd_adultos: p.qtd_adultos || null,
            qtd_criancas: p.qtd_criancas || null,
            valor_original: p.valor_original || null,
            valor_final: p.valor_final || null,
            ordem: typeof p.ordem === 'number' ? p.ordem : idx
          }))
          .filter((p: RoteiroPasseioDraft) =>
            Boolean(
              String(p.cidade || '').trim() ||
                String(p.passeio || '').trim() ||
                String(p.fornecedor || '').trim() ||
                String(p.data_inicio || '').trim() ||
                String(p.data_fim || '').trim() ||
                String(p.tipo || '').trim() ||
                String(p.ingressos || '').trim() ||
                Number.isFinite(Number(p.qtd_adultos)) ||
                Number.isFinite(Number(p.qtd_criancas)) ||
                Number.isFinite(Number(p.valor_original)) ||
                Number.isFinite(Number(p.valor_final))
            )
          );

        if (passeios.length > 0) {
          const { error } = await client.from('roteiro_passeio').insert(passeios);
          if (error) throw error;
        }
      }
    }

    // Transportes
    if (Array.isArray(body.transportes)) {
      await client.from('roteiro_transporte').delete().eq('roteiro_id', roteiroId);
      if (body.transportes.length > 0) {
        const transportes = body.transportes
          .map((t: RoteiroTransportePayload, idx: number): RoteiroTransporteDraft => ({
            roteiro_id: roteiroId,
            trecho: t.trecho || null,
            cia_aerea: t.cia_aerea || null,
            data_voo: t.data_voo || null,
            classe_reserva: t.classe_reserva || null,
            hora_saida: t.hora_saida || null,
            aeroporto_saida: t.aeroporto_saida || null,
            duracao_voo: t.duracao_voo || null,
            tipo_voo: t.tipo_voo || null,
            hora_chegada: t.hora_chegada || null,
            aeroporto_chegada: t.aeroporto_chegada || null,
            tarifa_nome: t.tarifa_nome || null,
            reembolso_tipo: t.reembolso_tipo || null,
            qtd_adultos: t.qtd_adultos || null,
            qtd_criancas: t.qtd_criancas || null,
            taxas: t.taxas || null,
            valor_total: t.valor_total || null,
            tipo: t.tipo || null,
            fornecedor: t.fornecedor || null,
            descricao: t.descricao || null,
            data_inicio: t.data_inicio || t.data_voo || null,
            data_fim: t.data_fim || t.data_voo || null,
            categoria: t.categoria || null,
            observacao: t.observacao || null,
            ordem: typeof t.ordem === 'number' ? t.ordem : idx
          }))
          .filter((t: RoteiroTransporteDraft) =>
            Boolean(
              String(t.trecho || '').trim() ||
                String(t.cia_aerea || '').trim() ||
                String(t.data_voo || '').trim() ||
                String(t.classe_reserva || '').trim() ||
                String(t.hora_saida || '').trim() ||
                String(t.aeroporto_saida || '').trim() ||
                String(t.duracao_voo || '').trim() ||
                String(t.tipo_voo || '').trim() ||
                String(t.hora_chegada || '').trim() ||
                String(t.aeroporto_chegada || '').trim() ||
                String(t.tarifa_nome || '').trim() ||
                String(t.reembolso_tipo || '').trim() ||
                Number.isFinite(Number(t.qtd_adultos)) ||
                Number.isFinite(Number(t.qtd_criancas)) ||
                Number.isFinite(Number(t.taxas)) ||
                Number.isFinite(Number(t.valor_total)) ||
                String(t.tipo || '').trim() ||
                String(t.fornecedor || '').trim() ||
                String(t.descricao || '').trim() ||
                String(t.data_inicio || '').trim() ||
                String(t.data_fim || '').trim() ||
                String(t.categoria || '').trim() ||
                String(t.observacao || '').trim()
            )
          );

        if (transportes.length > 0) {
          const { error } = await client.from('roteiro_transporte').insert(transportes);
          if (error) throw error;
        }
      }
    }

    // Dias do roteiro (itinerário)
    if (Array.isArray(body.dias)) {
      const { error: delDiasErr } = await client
        .from('roteiro_dia')
        .delete()
        .eq('roteiro_id', roteiroId);
      if (delDiasErr) throw delDiasErr;

      if (body.dias.length > 0) {
        const sorted = body.dias
          .slice()
          .sort(
            (a: RoteiroDiaPayload, b: RoteiroDiaPayload) =>
              readDiaOrdem(a) - readDiaOrdem(b)
          );

        const normalized = sorted
          .map((d: RoteiroDiaPayload, idx: number): RoteiroDiaDraft => {
            const cidade = String(d?.cidade || '').trim();
            const percurso = String(d?.percurso || '').trim();
            const dataRaw = String(d?.data || '').trim();
            const data = dataRaw ? dataRaw : null;
            const descricao = String(d?.descricao || '').trim();
            return {
              created_by: user.id,
              company_id: companyId,
              roteiro_id: roteiroId,
              cidade,
              percurso,
              data,
              descricao,
              ordem: idx
            };
          })
          .filter((d: RoteiroDiaDraft) =>
            Boolean(
              (d.cidade || '').trim() ||
                (d.percurso || '').trim() ||
                (d.data || '').trim() ||
                (d.descricao || '').trim()
            )
          );

        const seen = new Set<string>();
        const unique: RoteiroDiaDraft[] = [];
        for (const d of normalized) {
          const key = normalizeDiaKey({
            cidade: d.cidade,
            percurso: d.percurso,
            data: d.data,
            descricao: d.descricao
          });
          if (seen.has(key)) continue;
          seen.add(key);
          unique.push(d);
        }

        const dias = unique.map((d, idx) => ({ ...d, ordem: idx }));
        const strippedDias = stripPercursoField(dias);
        let payload: RoteiroDiaDraft[] | Array<Omit<RoteiroDiaDraft, 'percurso'>> = dias;
        let triedStrip = false;

        for (let attempt = 0; attempt < 2; attempt++) {
          const { error } = await client
            .from('roteiro_dia')
            .upsert(payload, { onConflict: 'roteiro_id,ordem' });
          if (!error) break;

          if (!triedStrip && isMissingPercursoColumn(error)) {
            payload = strippedDias;
            triedStrip = true;
            continue;
          }

          if (isMissingOnConflictConstraint(error)) {
            let { error: insertErr } = await client.from('roteiro_dia').insert(payload);
            if (insertErr) {
              if (!triedStrip && isMissingPercursoColumn(insertErr)) {
                payload = strippedDias;
                triedStrip = true;
                ({ error: insertErr } = await client.from('roteiro_dia').insert(payload));
              } else {
                if (isDuplicateOrdensUnique(insertErr)) {
                  await client.from('roteiro_dia').delete().eq('roteiro_id', roteiroId);
                  const { error: retryErr } = await client.from('roteiro_dia').insert(payload);
                  if (retryErr) throw retryErr;
                } else {
                  throw insertErr;
                }
              }
            }
            break;
          }

          throw error;
        }
      }
    }

    // Investimentos
    if (Array.isArray(body.investimentos)) {
      await client.from('roteiro_investimento').delete().eq('roteiro_id', roteiroId);
      if (body.investimentos.length > 0) {
        const investimentos = body.investimentos
          .map((i: RoteiroInvestimentoPayload, idx: number): RoteiroInvestimentoDraft => {
            const tipo = String(i.tipo || '').trim() || null;
            const valorPorPessoa = Number(i.valor_por_pessoa);
            const qtdApto = Number(i.qtd_apto);
            const valorPorApto = Number(i.valor_por_apto);
            return {
              roteiro_id: roteiroId,
              tipo,
              valor_por_pessoa: Number.isFinite(valorPorPessoa) ? valorPorPessoa : 0,
              qtd_apto: Number.isFinite(qtdApto) ? qtdApto : 0,
              valor_por_apto: Number.isFinite(valorPorApto) ? valorPorApto : 0,
              ordem: typeof i.ordem === 'number' ? i.ordem : idx
            };
          })
          .filter(
            (i: RoteiroInvestimentoDraft) =>
              Boolean(
                i.tipo ||
                  Number(i.valor_por_pessoa) > 0 ||
                  Number(i.qtd_apto) > 0 ||
                  Number(i.valor_por_apto) > 0
              )
          );

        if (investimentos.length > 0) {
          const { error } = await client.from('roteiro_investimento').insert(investimentos);
          if (error) throw error;
        }
      }
    }

    // Pagamentos
    if (Array.isArray(body.pagamentos)) {
      await client.from('roteiro_pagamento').delete().eq('roteiro_id', roteiroId);
      if (body.pagamentos.length > 0) {
        const pagamentos = body.pagamentos
          .map((p: RoteiroPagamentoPayload, idx: number): RoteiroPagamentoDraft => {
            const servico = String(p.servico || '').trim() || null;
            const formaPagamento = String(p.forma_pagamento || '').trim() || null;
            const valorTotal = Number(p.valor_total_com_taxas);
            const taxas = Number(p.taxas);
            return {
              roteiro_id: roteiroId,
              servico,
              valor_total_com_taxas: Number.isFinite(valorTotal) ? valorTotal : 0,
              taxas: Number.isFinite(taxas) ? taxas : 0,
              forma_pagamento: formaPagamento,
              ordem: typeof p.ordem === 'number' ? p.ordem : idx
            };
          })
          .filter((p: RoteiroPagamentoDraft) =>
            Boolean(
              p.servico ||
                p.forma_pagamento ||
                Number(p.valor_total_com_taxas) > 0 ||
                Number(p.taxas) > 0
            )
          );

        if (pagamentos.length > 0) {
          const { error } = await client.from('roteiro_pagamento').insert(pagamentos);
          if (error) throw error;
        }
      }
    }

    return json({ ok: true, id: roteiroId }, { headers: NO_STORE_HEADERS });
  } catch (err: unknown) {
    const errorRecord = typeof err === 'object' && err !== null ? (err as Record<string, unknown>) : null;
    const code = String(errorRecord?.code || '');
    const msg = String(errorRecord?.message || '');

    if (/row-level security/i.test(msg)) {
      return new Response('Sem permissão para salvar os dias do roteiro (RLS).', {
        status: 403,
        headers: NO_STORE_HEADERS
      });
    }

    if (code === '23505' || /duplicate key value violates unique constraint/i.test(msg)) {
      return new Response(
        'Conflito ao salvar (provável save duplo/concorrência). Tente novamente.',
        { status: 409, headers: NO_STORE_HEADERS }
      );
    }

    return toErrorResponse(err, 'Erro ao salvar roteiro.');
  }
}
