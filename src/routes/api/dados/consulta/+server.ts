import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { getDataClient } from '$lib/server/data';

const LEITURA_PERMITIDA = new Set([
  'users',
  'modulo_acesso',
  'system_module_settings',
  'system_module_catalog'
]);

type Filtro = { op: string; column?: string; value?: unknown; raw?: string };

export const POST: RequestHandler = async (event) => {
  const { session } = await event.locals.safeGetSession();
  if (!session?.user)
    return json({ data: null, error: { message: 'sem sessao', code: '401' } }, { status: 401 });

  const body = (await event.request.json().catch(() => null)) as {
    table?: string;
    columns?: string;
    filters?: Filtro[];
    order?: Array<{ column: string; ascending?: boolean }>;
    limit?: number | null;
    mode?: 'many' | 'single' | 'maybe';
  } | null;
  const table = String(body?.table || '');
  if (!LEITURA_PERMITIDA.has(table)) {
    return json(
      {
        data: null,
        error: { message: 'consulta nao permitida', code: '42501' }
      },
      { status: 403 }
    );
  }

  const client = getDataClient();
  let query = client.from(table).select(body?.columns || '*');
  if (table === 'users') query = query.eq('id', session.user.id);
  if (table === 'modulo_acesso') query = query.eq('usuario_id', session.user.id);
  for (const filter of body?.filters || []) {
    if (filter.op === 'eq' && filter.column) query = query.eq(filter.column, filter.value);
    else if (filter.op === 'neq' && filter.column) query = query.neq(filter.column, filter.value);
    else if (filter.op === 'in' && filter.column)
      query = query.in(filter.column, Array.isArray(filter.value) ? filter.value : []);
    else if (filter.op === 'is' && filter.column) query = query.is(filter.column, filter.value);
    else if (filter.op === 'ilike' && filter.column)
      query = query.ilike(filter.column, String(filter.value || ''));
    else if (filter.op === 'or' && filter.raw) query = query.or(filter.raw);
  }
  for (const item of body?.order || [])
    query = query.order(item.column, { ascending: item.ascending !== false });
  if (body?.limit) query = query.limit(body.limit);
  const result =
    body?.mode === 'single'
      ? await query.single()
      : body?.mode === 'maybe'
        ? await query.maybeSingle()
        : await query;
  return json(result);
};
