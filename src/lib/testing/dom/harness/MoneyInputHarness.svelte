<script lang="ts">
  import FieldInput from '$lib/components/ui/form/FieldInput.svelte';

  export let initialValue: string | number = '';
  export let numeric = false;
  export let min: string | null = null;
  export let max: string | null = null;
  let value = initialValue;
  let lastInput = '';
</script>

<FieldInput
  id="money"
  money
  type={numeric ? 'number' : 'text'}
  {min}
  {max}
  bind:value
  on:moneyInput={(event) => (lastInput = event.detail)}
/>
<span data-value>{JSON.stringify(value)}</span>
<span data-event>{lastInput}</span>
<button type="button" on:click={() => (value = numeric ? 45.67 : '45.67')}>Alterar</button>
