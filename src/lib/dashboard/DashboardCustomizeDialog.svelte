<script lang="ts">
  import Dialog from '$lib/components/ui/Dialog.svelte';
  import Card from '$lib/components/ui/Card.svelte';
  import Button from '$lib/components/ui/Button.svelte';
  import { Checkbox } from '$lib/components/ui';
  import { ArrowDown, ArrowUp } from '$lib/icons';
  import type { DashboardKpiId, DashboardWidgetId } from './dashboardPrefs';

  export let open = false;
  export let loading = false;
  export let widgetOrder: DashboardWidgetId[] = [];
  export let widgetVisible: Record<DashboardWidgetId, boolean> = {} as Record<
    DashboardWidgetId,
    boolean
  >;
  export let kpiOrder: DashboardKpiId[] = [];
  export let kpiVisible: Record<DashboardKpiId, boolean> = {} as Record<DashboardKpiId, boolean>;
  export let widgetOptions: Array<{ id: DashboardWidgetId; titulo: string }> = [];
  export let kpiOptions: Array<{ id: DashboardKpiId; titulo: string }> = [];
  export let onClose: (() => void) | undefined = undefined;
  export let onSave: (() => void) | undefined = undefined;
  export let onMoveWidget: ((id: DashboardWidgetId, direction: 'up' | 'down') => void) | undefined =
    undefined;
  export let onToggleWidget: ((id: DashboardWidgetId) => void) | undefined = undefined;
  export let onMoveKpi: ((id: DashboardKpiId, direction: 'up' | 'down') => void) | undefined =
    undefined;
  export let onToggleKpi: ((id: DashboardKpiId) => void) | undefined = undefined;

  function getWidgetTitle(id: DashboardWidgetId) {
    return widgetOptions.find((item) => item.id === id)?.titulo || id;
  }

  function getKpiTitle(id: DashboardKpiId) {
    return kpiOptions.find((item) => item.id === id)?.titulo || id;
  }
</script>

<Dialog
  bind:open
  title="Personalizar dashboard"
  color="financeiro"
  size="lg"
  showCancel={true}
  cancelText="Fechar"
  showConfirm={true}
  confirmText={loading ? 'Salvando...' : 'Salvar preferências'}
  confirmDisabled={loading}
  onCancel={onClose}
  onConfirm={onSave}
>
  <div class="space-y-4">
    <Card title="Widgets" color="financeiro" padding="sm">
      <div class="space-y-2">
        {#each widgetOrder as id, index}
          <div
            class="flex items-center justify-between gap-3 rounded-xl border border-slate-200 bg-white px-3 py-2.5"
          >
            <label class="flex min-w-0 flex-1 items-center gap-3 text-sm text-slate-700">
              <Checkbox
                checked={widgetVisible[id] !== false}
                on:change={() => onToggleWidget?.(id)}
                ariaLabel={`Exibir widget ${getWidgetTitle(id)}`}
              />
              <span class="truncate font-medium text-slate-900">{getWidgetTitle(id)}</span>
            </label>
            <div class="flex shrink-0 items-center gap-2">
              <Button
                variant="ghost"
                size="xs"
                on:click={() => onMoveWidget?.(id, 'up')}
                disabled={index === 0}
              >
                <ArrowUp size={14} />
              </Button>
              <Button
                variant="ghost"
                size="xs"
                on:click={() => onMoveWidget?.(id, 'down')}
                disabled={index === widgetOrder.length - 1}
              >
                <ArrowDown size={14} />
              </Button>
            </div>
          </div>
        {/each}
      </div>
    </Card>

    <Card title="KPIs" color="financeiro" padding="sm">
      <div class="space-y-2">
        {#each kpiOrder as id, index}
          <div
            class="flex items-center justify-between gap-3 rounded-xl border border-slate-200 bg-white px-3 py-2.5"
          >
            <label class="flex min-w-0 flex-1 items-center gap-3 text-sm text-slate-700">
              <Checkbox
                checked={kpiVisible[id] !== false}
                on:change={() => onToggleKpi?.(id)}
                ariaLabel={`Exibir KPI ${getKpiTitle(id)}`}
              />
              <span class="truncate font-medium text-slate-900">{getKpiTitle(id)}</span>
            </label>
            <div class="flex shrink-0 items-center gap-2">
              <Button
                variant="ghost"
                size="xs"
                on:click={() => onMoveKpi?.(id, 'up')}
                disabled={index === 0}
              >
                <ArrowUp size={14} />
              </Button>
              <Button
                variant="ghost"
                size="xs"
                on:click={() => onMoveKpi?.(id, 'down')}
                disabled={index === kpiOrder.length - 1}
              >
                <ArrowDown size={14} />
              </Button>
            </div>
          </div>
        {/each}
      </div>
    </Card>
  </div>
</Dialog>
