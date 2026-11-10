<script lang="ts">
  import { DropdownItem as FlowbiteDropdownItem } from './flowbite-legacy';

  export let href: string | undefined = undefined;
  export let class_name = '';
</script>

<FlowbiteDropdownItem {href} class={class_name} on:click>
  <slot />
</FlowbiteDropdownItem>
