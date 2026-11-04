<script lang="ts">
  import { Tooltip as FlowbiteTooltip } from './flowbite-legacy';

  export let triggeredBy: string;
  export let placement: 'top' | 'bottom' | 'left' | 'right' = 'top';
  export let class_name = '';
</script>

<FlowbiteTooltip {triggeredBy} {placement} class={class_name}>
  <slot />
</FlowbiteTooltip>
