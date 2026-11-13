<script lang="ts">
  export let value: string | number | null | undefined = undefined;
</script>

<span class="vtur-table-cell-preview"><slot name="preview">{value ?? '—'}</slot></span>
<div class="vtur-table-cell-edit">
  <slot />
</div>
