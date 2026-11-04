// Migrado para Hono de src/routes/api/v1/dashboard/aniversariantes/+server.ts — corpo IDÊNTICO ao original
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
import { addDaysISODate, parseISODateParts, todayISODateLocal } from '$lib/date';
import {
  buildReadModelCacheKey,
  getCachedReadModel,
  READ_MODEL_TAGS,
  scopeCacheTags
} from '$lib/server/readModelCache';
import { DYNAMIC_READ_HEADERS } from '$lib/server/httpCache';
import { chunkArray } from '$lib/utils/array';

type ClienteAniversarianteRow = {
  id: string;
  nome: string | null;
  nascimento: string | null;
  telefone: string | null;
  whatsapp: string | null;
  email: string | null;
};

type AcompanhanteAniversarianteRow = {
  id: string;
  cliente_id: string | null;
  nome_completo: string | null;
  data_nascimento: string | null;
  telefone: string | null;
};

type AniversarianteItem = {
  id: string;
  nome: string | null;
  nascimento: string | null;
  telefone: string | null;
  whatsapp: string | null;
  email: string | null;
  aniversario_hoje: boolean;
  pessoa_tipo: 'cliente' | 'acompanhante';
  cliente_id: string | null;
};

/** Extrai mês (1–12) e dia (1–31) de uma string "YYYY-MM-DD" sem criar Date,
 *  evitando qualquer problema de timezone/DST. */
function extractMonthDay(nascimento: string | null): { month: number; day: number } | null {
  if (!nascimento) return null;
  const m = String(nascimento)
    .trim()
    .match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (!m) return null;
  return { month: Number(m[2]), day: Number(m[3]) };
}

function isBirthdayInRange(nascimento: string | null, diasAfrente = 30): boolean {
  const parts = extractMonthDay(nascimento);
  if (!parts) return false;

  const hojeIso = todayISODateLocal();

  for (let i = 0; i <= diasAfrente; i++) {
    const check = parseISODateParts(addDaysISODate(hojeIso, i));
    if (check && parts.month === check.month && parts.day === check.day) {
      return true;
    }
  }
  return false;
}

function isToday(nascimento: string | null): boolean {
  const parts = extractMonthDay(nascimento);
  if (!parts) return false;
  const hoje = parseISODateParts(todayISODateLocal());
  return Boolean(hoje && parts.month === hoje.month && parts.day === hoje.day);
}

function clampIntParam(value: string | null, fallback: number, min: number, max: number) {
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) return fallback;
  return Math.min(max, Math.max(min, Math.trunc(parsed)));
}

export async function handleDashboardAniversariantesGet(event: RequestEvent) {
  try {
    const client = getAdminClient();
    const user = await requireAuthenticatedUser(event);
    const scope = await resolveUserScope(client, user.id);

    const { searchParams } = event.url;
    const diasAfrente = Math.min(90, Math.max(1, Number(searchParams.get('dias') || 30)));
    const hasExplicitLimit = searchParams.has('limit');
    const outputLimit = clampIntParam(searchParams.get('limit'), 500, 1, 500);
    const companyIds = resolveScopedCompanyIds(scope, searchParams.get('company_id'));
    const vendedorClienteIds = new Set<string>();

    if (!scope.isAdmin && companyIds.length === 0) {
      return json(
        {
          items: [],
          hoje: 0,
          proximos: 0
        },
        { headers: DYNAMIC_READ_HEADERS }
      );
    }

    if (scope.isVendedor) {
      const clienteRows = await getCachedReadModel<Array<{ cliente_id?: string | null }>>({
        key: buildReadModelCacheKey('dashboard:aniversariantes-vendedor-clientes', {
          userId: user.id,
          companyIds
        }),
        tags: [
          READ_MODEL_TAGS.sales,
          READ_MODEL_TAGS.dashboard,
          ...scopeCacheTags({ companyIds, userId: user.id, vendedorIds: [user.id] })
        ],
        ttlMs: 300_000,
        staleTtlMs: 1_800_000,
        loader: async () => {
          const companyBatches = companyIds.length > 0 ? chunkArray(companyIds) : [null];
          const rows = await Promise.all(
            companyBatches.map(async (companyBatch) => {
              let query = client
                .from('vendas')
                .select('cliente_id')
                .eq('vendedor_id', user.id)
                .not('cliente_id', 'is', null)
                .limit(5000);
              if (companyBatch) query = query.in('company_id', companyBatch);
              const { data, error } = await query;
              if (error) throw error;
              return (data || []) as Array<{ cliente_id?: string | null }>;
            })
          );
          return rows.flat();
        }
      });

      for (const row of clienteRows || []) {
        const id = String(row?.cliente_id || '').trim();
        if (id) vendedorClienteIds.add(id);
      }

      if (vendedorClienteIds.size === 0) {
        return json(
          {
            items: [],
            hoje: 0,
            proximos: 0
          },
          { headers: DYNAMIC_READ_HEADERS }
        );
      }
    }

    const vendedorClienteIdList = Array.from(vendedorClienteIds);

    const [clientes, acompanhantes] = await Promise.all([
      getCachedReadModel<ClienteAniversarianteRow[]>({
        key: buildReadModelCacheKey('dashboard:aniversariantes-clientes', {
          companyIds,
          vendedorClienteIds: scope.isVendedor ? vendedorClienteIdList : null
        }),
        tags: [
          READ_MODEL_TAGS.clients,
          READ_MODEL_TAGS.dashboard,
          ...scopeCacheTags({
            companyIds,
            userId: user.id,
            vendedorIds: scope.isVendedor ? [user.id] : []
          })
        ],
        ttlMs: 300_000,
        staleTtlMs: 1_800_000,
        loader: async () => {
          const companyBatches = companyIds.length > 0 ? chunkArray(companyIds) : [null];
          const clienteBatches =
            scope.isVendedor && vendedorClienteIdList.length > 0
              ? chunkArray(vendedorClienteIdList)
              : [null];
          const batchRows = await Promise.all(
            companyBatches.flatMap((companyBatch) =>
              clienteBatches.map(async (clienteBatch) => {
                let q = client
                  .from('clientes')
                  .select('id, nome, nascimento, telefone, whatsapp, email')
                  .not('nascimento', 'is', null)
                  .limit(2000);
                if (companyBatch) q = q.in('company_id', companyBatch);
                if (clienteBatch) q = q.in('id', clienteBatch);
                const { data, error } = await q;
                if (error) throw error;
                return (data || []) as ClienteAniversarianteRow[];
              })
            )
          );
          return batchRows.flat();
        }
      }),
      getCachedReadModel<AcompanhanteAniversarianteRow[]>({
        key: buildReadModelCacheKey('dashboard:aniversariantes-acompanhantes', {
          companyIds,
          vendedorClienteIds: scope.isVendedor ? vendedorClienteIdList : null
        }),
        tags: [
          READ_MODEL_TAGS.clients,
          READ_MODEL_TAGS.dashboard,
          ...scopeCacheTags({
            companyIds,
            userId: user.id,
            vendedorIds: scope.isVendedor ? [user.id] : []
          })
        ],
        ttlMs: 300_000,
        staleTtlMs: 1_800_000,
        loader: async () => {
          const companyBatches = companyIds.length > 0 ? chunkArray(companyIds) : [null];
          const clienteBatches =
            scope.isVendedor && vendedorClienteIdList.length > 0
              ? chunkArray(vendedorClienteIdList)
              : [null];
          const batchRows = await Promise.all(
            companyBatches.flatMap((companyBatch) =>
              clienteBatches.map(async (clienteBatch) => {
                let q = client
                  .from('cliente_acompanhantes')
                  .select('id, cliente_id, nome_completo, data_nascimento, telefone')
                  .eq('ativo', true)
                  .not('data_nascimento', 'is', null)
                  .limit(4000);
                if (companyBatch) q = q.in('company_id', companyBatch);
                if (clienteBatch) q = q.in('cliente_id', clienteBatch);
                const { data, error } = await q;
                if (error) throw error;
                return (data || []) as AcompanhanteAniversarianteRow[];
              })
            )
          );
          return batchRows.flat();
        }
      })
    ]);

    function getNextBirthdayMs(nascimento: string | null, hojeMs: number, hojeYear: number) {
      const birth = parseISODateParts(nascimento);
      if (!birth) return Number.POSITIVE_INFINITY;
      let nextMs = Date.UTC(hojeYear, birth.month - 1, birth.day);
      if (nextMs < hojeMs) nextMs = Date.UTC(hojeYear + 1, birth.month - 1, birth.day);
      return nextMs;
    }

    const hoje = parseISODateParts(todayISODateLocal());
    const hojeMs = hoje ? Date.UTC(hoje.year, hoje.month - 1, hoje.day) : 0;
    const hojeYear = hoje?.year ?? new Date().getFullYear();

    const clientesAniv = (clientes || [])
      .filter((c) => isBirthdayInRange(c.nascimento, diasAfrente))
      .map(
        (c): AniversarianteItem => ({
          id: c.id,
          nome: c.nome,
          nascimento: c.nascimento,
          telefone: c.telefone,
          whatsapp: c.whatsapp,
          email: null as string | null,
          aniversario_hoje: isToday(c.nascimento),
          pessoa_tipo: 'cliente' as const,
          cliente_id: c.id as string | null
        })
      );

    const acompanhantesAniv = (acompanhantes || [])
      .filter((a) => isBirthdayInRange(a.data_nascimento, diasAfrente))
      .map(
        (a): AniversarianteItem => ({
          id: a.id,
          nome: a.nome_completo,
          nascimento: a.data_nascimento,
          telefone: a.telefone,
          whatsapp: null as string | null,
          email: null as string | null,
          aniversario_hoje: isToday(a.data_nascimento),
          pessoa_tipo: 'acompanhante' as const,
          cliente_id: a.cliente_id as string | null
        })
      );

    const aniversariantesFiltrados = [...clientesAniv, ...acompanhantesAniv].sort(
      (a, b) =>
        getNextBirthdayMs(a.nascimento, hojeMs, hojeYear) -
        getNextBirthdayMs(b.nascimento, hojeMs, hojeYear)
    );

    const aniversariantes = hasExplicitLimit
      ? aniversariantesFiltrados.slice(0, outputLimit)
      : aniversariantesFiltrados;
    const hojeCount = aniversariantesFiltrados.reduce(
      (total, a) => total + (a.aniversario_hoje ? 1 : 0),
      0
    );

    return json(
      {
        items: aniversariantes,
        hoje: hojeCount,
        proximos: aniversariantesFiltrados.length
      },
      { headers: DYNAMIC_READ_HEADERS }
    );
  } catch (err) {
    return toErrorResponse(err, 'Erro ao carregar aniversariantes.');
  }
}
