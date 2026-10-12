<script lang="ts">
  import { goto } from '$app/navigation';
  import PageHeader from '$lib/components/ui/PageHeader.svelte';
  import Card from '$lib/components/ui/Card.svelte';
  import Button from '$lib/components/ui/Button.svelte';
  import { permissoes } from '$lib/stores/permissoes';
  import {
    PieChart,
    Users,
    TrendingUp,
    MapPin,
    ShoppingCart,
    ArrowRight,
    FileText
  } from '$lib/icons';

  const relatorios = [
    {
      titulo: 'Vendas detalhado',
      descricao: 'Drill-down operacional com leitura por venda, cliente, destino, valor e comissão.',
      icone: ShoppingCart,
      rota: '/relatorios/vendas'
    },
    {
      titulo: 'Vendas por destino',
      descricao: 'Participação por destino com caminho direto para o relatório detalhado.',
      icone: MapPin,
      rota: '/relatorios/destinos'
    },
    {
      titulo: 'Vendas por produto',
      descricao: 'Leitura por produto, receita, margem e contribuição no período.',
      icone: PieChart,
      rota: '/relatorios/produtos'
    },
    {
      titulo: 'Vendas por cliente',
      descricao: 'Carteira, recorrência e ticket médio com vínculo ao cadastro do cliente.',
      icone: Users,
      rota: '/relatorios/clientes'
    },
    {
      titulo: 'Ranking de vendas',
      descricao: 'Comparativo por responsável com meta, conversão, comissão e tendência.',
      icone: TrendingUp,
      rota: '/relatorios/ranking'
    }
  ];

  // Relatório de Performance por agência: master e gestor (e admin do sistema).
  const relatorioPerformance = {
    titulo: 'Performance da agência',
    descricao: 'Resumo do mês por empresa: vendas, meta, produtos, destinos e orçamentos (com PDF).',
    icone: FileText,
    rota: '/relatorios/performance'
  };
  $: relatoriosVisiveis =
    !$permissoes.ready || $permissoes.isSystemAdmin || $permissoes.isMaster || $permissoes.isGestor
      ? [...relatorios, relatorioPerformance]
      : relatorios;

  function openRelatorio(path: string) {
    void goto(path);
  }
</script>

<svelte:head>
  <title>Relatórios | VTUR</title>
</svelte:head>

<PageHeader
  title="Relatórios"
  subtitle="Escolha o tipo de relatório que deseja consultar."
  color="financeiro"
  breadcrumbs={[{ label: 'Relatórios' }]}
/>

<section class="space-y-4">
  <div class="flex items-center justify-between">
    <h2 class="text-lg font-semibold text-slate-900">Relatórios disponíveis</h2>
  </div>

  <div class="grid grid-cols-1 gap-4 sm:grid-cols-2 {relatoriosVisiveis.length > 5 ? 'lg:grid-cols-3 xl:grid-cols-6' : 'lg:grid-cols-5'}">
    {#each relatoriosVisiveis as relatorio}
      <Card color="financeiro" class="group h-full transition-all duration-200 hover:shadow-lg p-4!">
        <div class="mb-3 flex items-start justify-between gap-2">
          <div class="rounded-lg bg-financeiro-50 p-2.5">
            <svelte:component this={relatorio.icone} size={20} class="text-financeiro-600" />
          </div>
        </div>

        <h3 class="mb-1 text-base font-semibold leading-tight text-slate-900">{relatorio.titulo}</h3>
        <p class="mb-3 text-xs leading-5 text-slate-500">{relatorio.descricao}</p>

        <Button
          on:click={() => openRelatorio(relatorio.rota)}
          variant="unstyled"
          size="sm"
          class_name="inline-flex items-center gap-1 text-sm font-medium text-financeiro-700 hover:text-orange-800 transition-colors"
        >
          Abrir relatório
          <ArrowRight size={16} class="group-hover:translate-x-1 transition-transform" />
        </Button>
      </Card>
    {/each}
  </div>
</section>
