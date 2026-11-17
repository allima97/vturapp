<script lang="ts">
  import FieldInput from '$lib/components/ui/form/FieldInput.svelte';
  import type { MaskType } from '$lib/actions/inputMask';
  import { Phone } from '$lib/icons';
  export let mask: MaskType | undefined = undefined;
  export let withIcon = false;
  export let prefix: string | null = null;
  export let initialValue = '';
  export let documentType: 'cpf' | 'cnpj' | undefined = undefined;
  export let required = false;
  let value = initialValue;
  let events = 0;
</script>

<FieldInput
  id="mascara"
  {mask}
  {documentType}
  {required}
  icon={withIcon ? Phone : null}
  {prefix}
  bind:value
  on:input={() => (events += 1)}
/>
<span data-value>{value}</span>
<span data-events>{events}</span>
