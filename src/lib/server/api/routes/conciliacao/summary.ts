// Migrado para Hono de src/routes/api/v1/conciliacao/summary/+server.ts — corpo IDÊNTICO ao original
// (só o nome/assinatura do handler e caminhos de import relativos mudaram). Ver src/lib/server/api/app.ts.
import type { RequestEvent } from '@sveltejs/kit';
import { json } from '@sveltejs/kit';
import {
  ensureModuloAccess,
  getAdminClient,
  requireAuthenticatedUser,
  resolveScopedCompanyIds,
  resolveUserScope,
  toErrorResponse
} from '$lib/server/v1';
import { diagnosticarLacunasCronologicas } from '$lib/server/conciliacaoReconcile';
import type { DiagnosticoCronologico } from '$lib/server/conciliacaoReconcile';
import { monthRangeFromKey, todayISODateLocal } from '$lib/date';
import {
  buildReadModelCacheKey,
  getCachedReadModel,
  READ_MODEL_TAGS,
  scopeCacheTags
} from '$lib/server/readModelCache';
import { DYNAMIC_READ_HEADERS, NO_STORE_HEADERS } from '$lib/server/httpCache';
import { chunkArray } from '$lib/utils/array';

type ConciliacaoSummaryRow = {
  id: string;
  movimento_data?: string | null;
  status?: string | null;
  descricao?: string | null;
  conciliado?: boolean | null;
  venda_id?: string | null;
  ranking_vendedor_id?: string | null;
  valor_calculada_loja?: number | string | null;
  valor_lancamentos?: number | string | null;
  is_baixa_rac?: boolean | null;
};

function isConciliacaoEfetivada(row: ConciliacaoSummaryRow) {
  const raw = String(row?.descricao || row?.status || '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toUpperCase();
  return raw.includes('BAIXA');
}

export async function handleConciliacaoSummaryGet(event: RequestEvent) {
  try {
    const client = getAdminClient();
    const user = await requireAuthenticatedUser(event);
    const scope = await resolveUserScope(client, user.id);

    if (!scope.isAdmin && !scope.isMaster && !scope.isFinanceiro && !scope.isGestor) {
      ensureModuloAccess(scope, ['operacao_conciliacao', 'conciliacao'], 1, 'Sem acesso à Conciliação.');
    }

    const { searchParams } = event.url;
    const mes = String(searchParams.get('mes') || '').trim(); // YYYY-MM
    const companyIds = resolveScopedCompanyIds(scope, searchParams.get('company_id'));

    // Não-admins devem sempre ter empresa resolvida
    if (!scope.isAdmin && companyIds.length === 0) {
      return json({ error: 'Empresa não identificada.' }, { status: 400, headers: NO_STORE_HEADERS });
    }
    // Admin sem filtro explicitamente passado também precisa de company_id
    if (companyIds.length === 0) {
      return json({ error: 'Informe company_id.' }, { status: 400, headers: NO_STORE_HEADERS });
    }

    const monthRange = monthRangeFromKey(mes);
    const hoje = todayISODateLocal();
    const inicio = monthRange?.inicio || `${hoje.slice(0, 7)}-01`;
    const fim = monthRange?.fim || hoje;

    // companyId primário para diagnóstico cronológico (usa o primeiro do escopo)
    const companyIdDiag = companyIds[0];

    const { rows, diagnostico } = await getCachedReadModel<{ rows: ConciliacaoSummaryRow[]; diagnostico: DiagnosticoCronologico | null }>({
      key: buildReadModelCacheKey('conciliacao:summary', {
        companyIds,
        inicio,
        fim,
        companyIdDiag
      }),
      tags: [
        READ_MODEL_TAGS.conciliacao,
        READ_MODEL_TAGS.sales,
        READ_MODEL_TAGS.finance,
        READ_MODEL_TAGS.dashboard,
        ...scopeCacheTags({ companyIds, userId: user.id })
      ],
      ttlMs: 120_000,
      staleTtlMs: 600_000,
      loader: async () => {
        const [rows, diagnostico] = await Promise.all([
          (async () => {
            const dataRows: ConciliacaoSummaryRow[] = [];
            for (const companyBatch of chunkArray(companyIds)) {
              const { data, error } = await client
                .from('conciliacao_recibos')
                .select(
                  'id, movimento_data, status, descricao, conciliado, venda_id, ranking_vendedor_id, valor_calculada_loja, valor_lancamentos, is_baixa_rac'
                )
                .in('company_id', companyBatch)
                .gte('movimento_data', inicio)
                .lte('movimento_data', fim)
                .limit(5000);

              if (error) throw error;
              dataRows.push(...(data || []));
            }
            return dataRows;
          })(),
          companyIdDiag
            ? diagnosticarLacunasCronologicas({ client, companyId: companyIdDiag })
            : Promise.resolve(null)
        ]);

        return { rows, diagnostico };
      }
    });
    const efetivados = rows.filter((row) => isConciliacaoEfetivada(row));
    const pendentes = efetivados.filter((row) => !row.conciliado);
    const semRanking = efetivados.filter((row) => !row.venda_id && !row.ranking_vendedor_id);
    const baixaRac = rows.filter((row) => row.is_baixa_rac);

    const totalValor = efetivados.reduce(
      (acc: number, row) => acc + Number(row.valor_calculada_loja || row.valor_lancamentos || 0),
      0
    );

    const byDay = new Map<string, number>();
    for (const row of efetivados) {
      const day = String(row.movimento_data || '').slice(0, 10);
      if (day) byDay.set(day, (byDay.get(day) || 0) + Number(row.valor_calculada_loja || row.valor_lancamentos || 0));
    }

    const timeline = Array.from(byDay.entries())
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([date, value]) => ({ date, value }));

    // Monta alerta de bloqueio cronológico (apenas se houver lacunas)
    const lacunaCronologica = diagnostico && diagnostico.diasFaltantes.length > 0
      ? {
          fronteira: diagnostico.fronteira,
          dias_faltantes: diagnostico.diasFaltantes,
          dias_bloqueados: diagnostico.diasBloqueados,
          dias_sem_movimento: diagnostico.diasSemMovimento,
          registros_bloqueados: diagnostico.registrosBloqueados,
          aviso: `A conciliação está bloqueada a partir de ${diagnostico.fronteira}. ` +
            `Importe os arquivos dos dias: ${diagnostico.diasFaltantes.map((d) => {
              const [y, m, dia] = d.split('-');
              return `${dia}/${m}/${y}`;
            }).join(', ')} ` +
            `para liberar ${diagnostico.registrosBloqueados} registro(s) bloqueado(s).`
        }
      : null;

    return json({
      periodo: { inicio, fim },
      total: rows.length,
      efetivados: efetivados.length,
      pendentes: pendentes.length,
      semRanking: semRanking.length,
      baixaRac: baixaRac.length,
      totalValor,
      timeline,
      ...(lacunaCronologica ? { lacuna_cronologica: lacunaCronologica } : {})
    }, { headers: DYNAMIC_READ_HEADERS });
  } catch (err) {
    return toErrorResponse(err, 'Erro ao carregar resumo da conciliação.');
  }
}
