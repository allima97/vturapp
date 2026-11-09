<script lang="ts">
  import { goto } from '$app/navigation';
  import PageHeader from '$lib/components/ui/PageHeader.svelte';
  import Card from '$lib/components/ui/Card.svelte';
  import Button from '$lib/components/ui/Button.svelte';
  import { MapPin, Package, Building2, Route, ArrowRight, Plus, Search } from '$lib/icons';

  const cadastros = [
    {
      titulo: 'Passeios Opcionais',
      descricao: 'Catálogo compartilhado de passeios opcionais por cidade',
      icone: MapPin,
      cor: 'financeiro',
      rota: '/cadastros/opcionais',
      stats: 'Catálogo',
      acao: 'Novo Opcional',
      inline: true
    },
    {
      titulo: 'Destinos',
      descricao: 'Gerencie destinos turísticos, cidades e países',
      icone: MapPin,
      cor: 'financeiro',
      rota: '/cadastros/destinos',
      stats: '45 destinos',
      acao: 'Novo Destino'
    },
    {
      titulo: 'Produtos',
      descricao: 'Pacotes, passeios, serviços e produtos vendidos',
      icone: Package,
      cor: 'financeiro',
      rota: '/cadastros/produtos',
      stats: '128 produtos',
      acao: 'Novo Produto'
    },
    {
      titulo: 'Fornecedores',
      descricao: 'Hotéis, companhias aéreas, operadoras locais',
      icone: Building2,
      cor: 'financeiro',
      rota: '/cadastros/fornecedores',
      stats: '32 fornecedores',
      acao: 'Novo Fornecedor'
    },
    {
      titulo: 'Circuitos',
      descricao: 'Roteiros pré-montados e pacotes combinados',
      icone: Route,
      cor: 'financeiro',
      rota: '/cadastros/circuitos',
      stats: '18 circuitos',
      acao: 'Novo Circuito'
    }
  ];
</script>

<svelte:head>
  <title>Cadastros | VTUR</title>
</svelte:head>

<PageHeader
  title="Cadastros"
  subtitle="Gerenciamento de dados mestres"
  color="financeiro"
  breadcrumbs={[{ label: 'Cadastros' }]}
/>

<div class="grid grid-cols-1 gap-6 md:grid-cols-2">
  {#each cadastros as item}
    <Card color="financeiro" class="group transition-all duration-200 hover:shadow-lg">
      <div class="flex items-start gap-4">
        <div class="rounded-xl p-4" style="background-color: var(--color-financeiro-50);">
          <svelte:component this={item.icone} size={28} class="text-financeiro-600" />
        </div>
        <div class="flex-1">
          <div class="flex items-center justify-between">
            <h3 class="text-lg font-semibold text-slate-900">{item.titulo}</h3>
            <span
              class="bg-financeiro-50 text-financeiro-700 inline-flex rounded-full px-2 py-1 text-xs font-medium"
            >
              {item.stats}
            </span>
          </div>
          <p class="mt-1 mb-4 text-sm text-slate-500">{item.descricao}</p>

          <div class="flex items-center gap-3">
            <Button variant="ghost" size="sm" color="financeiro" on:click={() => goto(item.rota)}>
              <Search size={16} />
              Consultar
            </Button>
            <span class="text-slate-300">|</span>
            <Button
              variant="ghost"
              size="sm"
              color="financeiro"
              on:click={() => goto(item.inline ? item.rota : `${item.rota}/novo`)}
            >
              <Plus size={16} />
              {item.acao}
            </Button>
            <span class="ml-auto">
              <ArrowRight
                size={16}
                class="group-hover:text-financeiro-500 text-slate-400 transition-all group-hover:translate-x-1"
              />
            </span>
          </div>
        </div>
      </div>
    </Card>
  {/each}
</div>
