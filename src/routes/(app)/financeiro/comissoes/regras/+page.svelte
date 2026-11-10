<script lang="ts">
  import PageHeader from '$lib/components/ui/PageHeader.svelte';
  import Card from '$lib/components/ui/Card.svelte';
  import Button from '$lib/components/ui/Button.svelte';
  import { Settings } from '$lib/icons';
</script>

<svelte:head>
  <title>Regras de Comissão | Financeiro | VTUR</title>
</svelte:head>

<PageHeader
  title="Regras de Comissão"
  subtitle="Esta rota foi consolidada no módulo canônico de regras."
  color="financeiro"
  breadcrumbs={[{ label: 'Financeiro', href: '/financeiro' }, { label: 'Regras' }]}
/>

<Card color="financeiro">
  <div class="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
    <div>
      <p class="font-semibold text-slate-900">Redirecionando para a tela atual de regras.</p>
      <p class="mt-1 text-sm text-slate-500">
        Use a seção financeira consolidada para editar regras por empresa.
      </p>
    </div>
    <Button href="/financeiro/regras" variant="outline" color="financeiro">
      <Settings size={16} class="mr-2" /> Abrir regras
    </Button>
  </div>
</Card>
