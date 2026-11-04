<script lang="ts">
  import { FieldInput, FieldTextarea } from '$lib/components/ui';
  import Button from '$lib/components/ui/Button.svelte';
  import Card from '$lib/components/ui/Card.svelte';
  import type { RoteiroOpcionalCidade } from '$lib/roteiroOpcionais';
  import CidadeDestinoAutocomplete from '$lib/components/CidadeDestinoAutocomplete.svelte';

  let { opcionais = $bindable() }: { opcionais: RoteiroOpcionalCidade[] } = $props();
  function mover(index: number, delta: number) {
    const next = [...opcionais];
    [next[index], next[index + delta]] = [next[index + delta], next[index]];
    opcionais = next;
  }
</script>

<Card title="Opcionais por cidade" color="clientes">
  <p class="mb-4 text-sm text-slate-500">Sugestões de passeios e atividades sem data marcada, organizadas por cidade. Aparecem no PDF como opcionais e não entram no valor do roteiro.</p>
  <Button type="button" variant="secondary" size="sm" on:click={() => { opcionais = [...opcionais, { cidade: '', passeios: [] }]; }}>Adicionar cidade</Button>
  {#if opcionais.length === 0}
    <p class="py-6 text-center text-sm text-slate-400">Nenhuma cidade adicionada aos opcionais.</p>
  {/if}
  <div class="mt-4 space-y-4">
    {#each opcionais as cidade, index}
      <div class="rounded-xl border border-slate-200 p-4">
        <div class="mb-3 flex flex-wrap items-center gap-2">
          <span class="mr-auto text-sm font-semibold">Cidade {index + 1}</span>
          <Button type="button" variant="secondary" size="xs" disabled={index === 0} on:click={() => mover(index, -1)}>Subir cidade</Button>
          <Button type="button" variant="secondary" size="xs" disabled={index === opcionais.length - 1} on:click={() => mover(index, 1)}>Descer cidade</Button>
          <Button type="button" variant="secondary" size="xs" on:click={() => { opcionais = opcionais.filter((_, i) => i !== index); }}>Remover cidade</Button>
        </div>
        <CidadeDestinoAutocomplete label="Cidade" required bind:value={cidade.cidade} placeholder="Ex.: Barcelona" endpoint="/api/v1/orcamentos/cidades-busca" />
        <div class="my-3 space-y-3">
          {#each cidade.passeios as passeio, passeioIndex}
            <div class="space-y-2 rounded-lg bg-slate-50 p-3">
              <FieldInput label="Nome do passeio opcional" required bind:value={passeio.nome} placeholder="Ex.: Passeio e jantar no Bairro Gótico" />
              <FieldTextarea label="Descrição" bind:value={passeio.descricao} rows={4} placeholder="Descreva a experiência e as recomendações para o viajante." />
              <Button type="button" variant="secondary" size="xs" on:click={() => { cidade.passeios = cidade.passeios.filter((_, i) => i !== passeioIndex); }}>Remover opcional</Button>
            </div>
          {/each}
        </div>
        <Button type="button" variant="secondary" size="sm" on:click={() => { cidade.passeios = [...cidade.passeios, { nome: '', descricao: '' }]; }}>Adicionar passeio opcional</Button>
      </div>
    {/each}
  </div>
  {#if opcionais.length > 0}
    <div class="mt-3">
      <Button type="button" variant="secondary" size="sm" on:click={() => { opcionais = [...opcionais, { cidade: '', passeios: [] }]; }}>Adicionar cidade</Button>
    </div>
  {/if}
</Card>
