<!-- Página mínima de teste: usa a aba Investimento do roteiro com bind:, como a página real. -->
<script lang="ts">
  import AbaInvestimento from '../../../../routes/(app)/orcamentos/roteiros/[id]/_components/AbaInvestimento.svelte';
  import type { RotInvestimento } from '../../../../routes/(app)/orcamentos/roteiros/[id]/_components/tipos';
  let { expose }: { expose: (get: () => RotInvestimento[]) => void } = $props();
  let investimentos: RotInvestimento[] = $state([]);
  const INVESTIMENTO_TIPO_OPTIONS = ['Por pessoa', 'Por casal'];
  let totalInvestimento = $derived(
    investimentos.reduce((s, i) => s + Number(i.valor_por_pessoa || 0), 0)
  );
  function onInvestimentoChange(
    index: number,
    field: 'valor_por_pessoa' | 'qtd_apto' | 'valor_por_apto',
    rawValue: string
  ) {
    const next = [...investimentos];
    next[index] = {
      ...next[index],
      [field]: rawValue === '' ? null : Number(rawValue)
    } as RotInvestimento;
    investimentos = next;
  }
  // svelte-ignore state_referenced_locally
  expose(() => investimentos);
</script>

<AbaInvestimento
  {INVESTIMENTO_TIPO_OPTIONS}
  bind:investimentos
  {onInvestimentoChange}
  {totalInvestimento}
/>
<p data-testid="total">{totalInvestimento}</p>
