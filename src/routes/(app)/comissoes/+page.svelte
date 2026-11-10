<script lang="ts">
  import PageHeader from '$lib/components/ui/PageHeader.svelte';
  import Card from '$lib/components/ui/Card.svelte';
  import Button from '$lib/components/ui/Button.svelte';
  import { Wallet } from '$lib/icons';
</script>

<svelte:head>
  <title>Comissões | VTUR</title>
</svelte:head>

<PageHeader
  title="Comissões"
  subtitle="O módulo foi consolidado dentro do Financeiro."
  color="comissoes"
  breadcrumbs={[{ label: 'Comissões' }]}
/>

<Card color="comissoes">
  <div class="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
    <div>
      <p class="font-semibold text-slate-900">Abrindo comissões financeiras.</p>
      <p class="mt-1 text-sm text-slate-500">Use a tela canônica por recibo e escopo de empresa.</p>
    </div>
    <Button href="/financeiro/comissoes" variant="outline" color="financeiro">
      <Wallet size={16} class="mr-2" /> Abrir comissões
    </Button>
  </div>
</Card>
