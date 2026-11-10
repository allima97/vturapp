export type DashboardWidgetId =
  | 'kpis'
  | 'timeline'
  | 'top_destinos'
  | 'por_produto'
  | 'orcamentos'
  | 'aniversariantes'
  | 'atividades_recentes'
  | 'viagens'
  | 'followups'
  | 'consultorias';

export type DashboardKpiId =
  | 'vendas_periodo'
  | 'qtd_vendas'
  | 'orcamentos'
  | 'meta_mes'
  | 'dias_mes'
  | 'seguro_viagem';

type DashboardKpiSettings = {
  order?: DashboardKpiId[] | null;
  visible?: Partial<Record<DashboardKpiId, boolean>> | null;
};

type DashboardWidgetSettings = {
  kpis?: DashboardKpiSettings | null;
} & Record<string, unknown>;

export type WidgetPrefRow = {
  widget?: string | null;
  ordem?: number | null;
  visivel?: boolean | null;
  settings?: DashboardWidgetSettings | null;
};

export const DASHBOARD_WIDGETS: Array<{ id: DashboardWidgetId; titulo: string }> = [
  { id: 'kpis', titulo: 'KPIs principais' },
  { id: 'timeline', titulo: 'Evolução das vendas' },
  { id: 'top_destinos', titulo: 'Top destinos' },
  { id: 'por_produto', titulo: 'Vendas por produto' },
  { id: 'viagens', titulo: 'Próximas viagens' },
  { id: 'followups', titulo: 'Follow-up operacional' },
  { id: 'aniversariantes', titulo: 'Aniversariantes do mês' },
  { id: 'orcamentos', titulo: 'Orçamentos recentes' },
  { id: 'atividades_recentes', titulo: 'Atividades recentes' },
  { id: 'consultorias', titulo: 'Consultorias online' }
];

export const DASHBOARD_KPIS: Array<{ id: DashboardKpiId; titulo: string }> = [
  { id: 'vendas_periodo', titulo: 'Vendas no período' },
  { id: 'qtd_vendas', titulo: 'Quantidade de vendas' },
  { id: 'orcamentos', titulo: 'Orçamentos e conversão' },
  { id: 'meta_mes', titulo: 'Meta do mês' },
  { id: 'dias_mes', titulo: 'Dias restantes / meta diária' },
  { id: 'seguro_viagem', titulo: 'Seguro viagem' }
];

export const DEFAULT_WIDGET_ORDER = DASHBOARD_WIDGETS.map((item) => item.id);
export const DEFAULT_KPI_ORDER = DASHBOARD_KPIS.map((item) => item.id);

export function normalizeOrder<T extends string>(order: T[], allowed: T[]): T[] {
  const cleaned = order.filter((id, idx) => allowed.includes(id) && order.indexOf(id) === idx);
  for (const id of allowed) {
    if (!cleaned.includes(id)) cleaned.push(id);
  }
  return cleaned;
}

export function moveItem<T extends string>(items: T[], id: T, direction: 'up' | 'down'): T[] {
  const currentIndex = items.indexOf(id);
  if (currentIndex === -1) return items;
  const nextIndex = direction === 'up' ? currentIndex - 1 : currentIndex + 1;
  if (nextIndex < 0 || nextIndex >= items.length) return items;
  const next = [...items];
  [next[currentIndex], next[nextIndex]] = [next[nextIndex], next[currentIndex]];
  return next;
}

export function createVisibilityMap<T extends string>(
  ids: T[],
  visible = true
): Record<T, boolean> {
  return ids.reduce(
    (acc, id) => {
      acc[id] = visible;
      return acc;
    },
    {} as Record<T, boolean>
  );
}

export const DEFAULT_WIDGET_VISIBILITY: Record<DashboardWidgetId, boolean> = {
  ...createVisibilityMap(DEFAULT_WIDGET_ORDER, true),
  atividades_recentes: false
};

export function readDashboardPrefsFromStorage<T extends string>(
  key: string,
  allowed: T[],
  defaultVisible?: Record<T, boolean>
): { order: T[]; visible: Record<T, boolean> } | null {
  if (typeof window === 'undefined') return null;
  try {
    const raw = window.localStorage.getItem(key);
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    const order = normalizeOrder(Array.isArray(parsed?.order) ? parsed.order : [], allowed);
    const visible = { ...(defaultVisible ?? createVisibilityMap(allowed, true)) };
    if (parsed?.visible && typeof parsed.visible === 'object') {
      for (const id of allowed) {
        if (typeof parsed.visible[id] === 'boolean') visible[id] = parsed.visible[id];
      }
    }
    return { order, visible };
  } catch {
    return null;
  }
}

export function saveDashboardPrefsToStorage<T extends string>(
  key: string,
  order: T[],
  visible: Record<T, boolean>
) {
  if (typeof window === 'undefined') return;
  window.localStorage.setItem(key, JSON.stringify({ order, visible }));
}

export function parseDashboardPrefs(rows: WidgetPrefRow[]) {
  const widgetAllowed = DEFAULT_WIDGET_ORDER;
  const kpiAllowed = DEFAULT_KPI_ORDER;

  const widgetVisible = { ...DEFAULT_WIDGET_VISIBILITY };
  const kpiVisible = createVisibilityMap(kpiAllowed, true);
  const widgetOrder = normalizeOrder(
    rows
      .map((row) => String(row?.widget || '').trim() as DashboardWidgetId)
      .filter((id) => widgetAllowed.includes(id)),
    widgetAllowed
  );

  for (const row of rows) {
    const id = String(row?.widget || '').trim() as DashboardWidgetId;
    if (widgetAllowed.includes(id)) {
      widgetVisible[id] = row?.visivel !== false;
    }
    if (id === 'kpis') {
      const settings = row?.settings?.kpis;
      if (settings?.visible && typeof settings.visible === 'object') {
        for (const kpiId of kpiAllowed) {
          if (typeof settings.visible[kpiId] === 'boolean') {
            kpiVisible[kpiId] = settings.visible[kpiId];
          }
        }
      }
    }
  }

  const kpiRow = rows.find((row) => String(row?.widget || '').trim() === 'kpis');
  const parsedKpiOrder = Array.isArray(kpiRow?.settings?.kpis?.order)
    ? (kpiRow?.settings?.kpis?.order as DashboardKpiId[])
    : [];

  return {
    widgetOrder,
    widgetVisible,
    kpiOrder: normalizeOrder(parsedKpiOrder, kpiAllowed),
    kpiVisible
  };
}

export function buildDashboardPrefsPayload(
  widgetOrder: DashboardWidgetId[],
  widgetVisible: Record<DashboardWidgetId, boolean>,
  kpiOrder: DashboardKpiId[],
  kpiVisible: Record<DashboardKpiId, boolean>
) {
  return widgetOrder.map((widget) => ({
    widget,
    visivel: widgetVisible[widget] !== false,
    settings:
      widget === 'kpis'
        ? {
            kpis: {
              order: kpiOrder,
              visible: kpiVisible
            }
          }
        : null
  }));
}
