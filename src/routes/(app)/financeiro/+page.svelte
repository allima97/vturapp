<script lang="ts">
  import PageHeader from '$lib/components/ui/PageHeader.svelte';
  import Card from '$lib/components/ui/Card.svelte';
  import Button from '$lib/components/ui/Button.svelte';
  import { LayoutDashboard } from '$lib/icons';
</script>

<svelte:head>
  <title>Financeiro | VTUR</title>
</svelte:head>

<PageHeader
  title="Financeiro"
  subtitle="O painel financeiro foi consolidado no dashboard financeiro."
  color="financeiro"
  breadcrumbs={[{ label: 'Financeiro' }]}
/>

<Card color="financeiro">
  <div class="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
    <div>
      <p class="font-semibold text-slate-900">Abrindo dashboard financeiro.</p>
      <p class="mt-1 text-sm text-slate-500">
        Use o painel canônico para caixa, conciliação, comissões e pendências fiscais.
      </p>
    </div>
    <Button href="/dashboard/financeiro" variant="outline" color="financeiro">
      <LayoutDashboard size={16} class="mr-2" /> Abrir dashboard
    </Button>
  </div>
</Card>
