// Migrado para Hono de src/routes/api/v1/users/aniversariantes/+server.ts — corpo IDÊNTICO ao original
// (só nome/assinatura do handler e caminhos de import mudaram). Ver src/lib/server/api/app.ts.
import type { RequestEvent } from '@sveltejs/kit';
import { json } from '@sveltejs/kit';
import {
  getAdminClient,
  requireAuthenticatedUser,
  resolveScopedCompanyIds,
  resolveUserScope,
  toErrorResponse
} from '$lib/server/v1';
import { DYNAMIC_READ_HEADERS } from '$lib/server/httpCache';
import { parseISODateParts, todayISODateLocal } from '$lib/date';
import { chunkArray, QUERY_IN_BATCH_SIZE } from '$lib/utils/array';

type DadosRelation<T> = T | T[] | null | undefined;

type AniversarianteUserRow = {
  id: string;
  nome_completo: string | null;
  email: string | null;
  data_nascimento: string | null;
  company_id: string | null;
  user_types?: DadosRelation<{ name?: string | null }>;
  companies?: DadosRelation<{ nome_fantasia?: string | null }>;
};

function firstRelation<T>(value: DadosRelation<T>): T | null {
  if (Array.isArray(value)) return value[0] ?? null;
  return value ?? null;
}

export async function handleUsersAniversariantesGet(event: RequestEvent) {
  try {
    const client = getAdminClient();
    const user = await requireAuthenticatedUser(event);
    const scope = await resolveUserScope(client, user.id);

    const { searchParams } = event.url;
    const month = Number(searchParams.get('month') || new Date().getMonth() + 1);
    const companyIds = resolveScopedCompanyIds(scope, searchParams.get('company_id'));

    const buildQuery = (companyIdsFilter = companyIds) => {
      let query = client
        .from('users')
        .select(
          'id, nome_completo, email, data_nascimento, company_id, user_types(name), companies:companies!company_id(nome_fantasia)'
        )
        .eq('active', true)
        .not('data_nascimento', 'is', null)
        .limit(500);

      if (companyIdsFilter.length > 0) query = query.in('company_id', companyIdsFilter);

      return query;
    };

    const rows: AniversarianteUserRow[] = [];
    if (companyIds.length > QUERY_IN_BATCH_SIZE) {
      for (const batch of chunkArray(companyIds)) {
        const { data, error: queryError } = await buildQuery(batch);
        if (queryError) throw queryError;
        rows.push(...(data || []));
      }
    } else {
      const { data, error: queryError } = await buildQuery();
      if (queryError) throw queryError;
      rows.push(...(data || []));
    }

    const hoje = parseISODateParts(todayISODateLocal());
    const items = rows
      .filter((u) => {
        if (!u.data_nascimento) return false;
        const d = parseISODateParts(u.data_nascimento);
        return d?.month === month;
      })
      .map((u) => ({
        id: u.id,
        nome_completo: u.nome_completo,
        email: u.email,
        data_nascimento: u.data_nascimento,
        role: firstRelation(u.user_types)?.name || '',
        company_id: u.company_id,
        company_nome: firstRelation(u.companies)?.nome_fantasia || null,
        aniversario_hoje: (() => {
          const d = parseISODateParts(u.data_nascimento);
          return Boolean(d && hoje && d.month === hoje.month && d.day === hoje.day);
        })()
      }))
      .sort((a, b) => {
        const da = parseISODateParts(a.data_nascimento)?.day || 0;
        const db = parseISODateParts(b.data_nascimento)?.day || 0;
        return da - db;
      });

    return json({ items, month }, { headers: DYNAMIC_READ_HEADERS });
  } catch (err) {
    return toErrorResponse(err, 'Erro ao carregar aniversariantes de colaboradores.');
  }
}
