// Migrado para Hono de src/routes/api/v1/agenda/range/+server.ts — corpo IDÊNTICO ao original
// (só nome/assinatura do handler e caminhos de import mudaram). Ver src/lib/server/api/app.ts.
import type { RequestEvent } from '@sveltejs/kit';
import { json } from '@sveltejs/kit';
import {
  buildAgendaOverlapFilter,
  buildAgendaRangeParams,
  ensureAgendaAccess,
  isIsoDate,
  mapAgendaRowToEvent,
  parseDateToUTC,
  safeISODate
} from '$lib/server/agenda';
import {
  getAdminClient,
  logServerError,
  requireAuthenticatedUser,
  resolveScopedCompanyIds,
  resolveUserScope,
  toErrorResponse
} from '$lib/server/v1';
import {
  buildReadModelCacheKey,
  getCachedReadModel,
  READ_MODEL_TAGS,
  scopeCacheTags
} from '$lib/server/readModelCache';
import { DYNAMIC_READ_HEADERS, NO_STORE_HEADERS } from '$lib/server/httpCache';

type AgendaBirthdayUserRow = {
  id?: string | null;
  nome_completo?: string | null;
  data_nascimento?: string | null;
};

export async function handleAgendaRangeGet(event: RequestEvent) {
  try {
    const client = getAdminClient();
    const user = await requireAuthenticatedUser(event);
    const scope = await resolveUserScope(client, user.id);

    ensureAgendaAccess(scope, 1, 'Sem acesso a Agenda.');

    const { inicio, fim } = buildAgendaRangeParams(event.url.searchParams);
    if (!isIsoDate(inicio) || !isIsoDate(fim)) {
      return json(
        { error: 'inicio e fim devem estar no formato YYYY-MM-DD.' },
        { status: 400, headers: NO_STORE_HEADERS }
      );
    }

    const overlapFilter = buildAgendaOverlapFilter(inicio, fim);
    const { data, error } = await client
      .from('agenda_itens')
      .select('id, titulo, descricao, start_date, end_date, start_at, end_at, all_day')
      .eq('tipo', 'evento')
      .eq('user_id', user.id)
      .or(overlapFilter)
      .order('start_date', { ascending: true });

    if (error) throw error;

    const items: NonNullable<ReturnType<typeof mapAgendaRowToEvent>>[] = [];
    for (const row of data || []) {
      const item = mapAgendaRowToEvent(row);
      if (item) items.push(item);
    }

    const birthdayCompanyIds = resolveScopedCompanyIds(
      scope,
      event.url.searchParams.get('company_id')
    );
    const birthdayCompanyId = birthdayCompanyIds[0] || scope.companyId || null;

    if (!scope.isVendedor && birthdayCompanyId) {
      try {
        const birthdayUsers = await getCachedReadModel<AgendaBirthdayUserRow[]>({
          key: buildReadModelCacheKey('agenda:birthday-users', {
            companyId: birthdayCompanyId
          }),
          tags: [READ_MODEL_TAGS.users, ...scopeCacheTags({ companyIds: [birthdayCompanyId] })],
          ttlMs: 600_000,
          staleTtlMs: 3_600_000,
          loader: async () => {
            const { data, error: birthdayError } = await client
              .from('users')
              .select('id, nome_completo, data_nascimento, active, uso_individual')
              .eq('company_id', birthdayCompanyId)
              .or('active.is.null,active.eq.true')
              .or('uso_individual.is.null,uso_individual.eq.false')
              .not('data_nascimento', 'is', null)
              .order('nome_completo', { ascending: true })
              .limit(5000);

            if (birthdayError) throw birthdayError;
            return data || [];
          }
        });

        const startYear = Number(inicio.slice(0, 4));
        const endYear = Number(fim.slice(0, 4));

        for (const row of birthdayUsers || []) {
          const userId = String(row?.id || '').trim();
          const nome = String(row?.nome_completo || '').trim() || '(Sem nome)';
          const nascimento = String(row?.data_nascimento || '').trim();
          if (!userId || !nascimento) continue;

          const parsed = parseDateToUTC(nascimento);
          if (Number.isNaN(parsed.getTime())) continue;

          const month = parsed.getUTCMonth() + 1;
          const day = parsed.getUTCDate();

          for (let year = startYear; year <= endYear; year += 1) {
            const iso = safeISODate(year, month, day);
            if (iso < inicio || iso > fim) continue;

            items.push({
              id: `birthday:${userId}:${iso}`,
              title: `Aniversario: ${nome}`,
              start: iso,
              end: null,
              descricao: 'Aniversario',
              allDay: true,
              source: 'birthday'
            });
          }
        }
      } catch (birthdayErr) {
        logServerError('[agenda/range] Falha ao carregar aniversarios', birthdayErr);
      }
    }

    items.sort((a, b) => String(a.start).localeCompare(String(b.start)));

    return json(
      {
        inicio,
        fim,
        items
      },
      { headers: DYNAMIC_READ_HEADERS }
    );
  } catch (err) {
    return toErrorResponse(err, 'Erro ao carregar agenda.');
  }
}
