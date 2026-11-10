<script lang="ts">
  import { onMount } from 'svelte';
  import PageHeader from '$lib/components/ui/PageHeader.svelte';
  import Card from '$lib/components/ui/Card.svelte';
  import Button from '$lib/components/ui/Button.svelte';
  import { FieldInput, FieldTextarea } from '$lib/components/ui';
  import CidadeDestinoAutocomplete from '$lib/components/CidadeDestinoAutocomplete.svelte';
  import SeletorDestinoGeografico from '$lib/components/SeletorDestinoGeografico.svelte';
  import { catalogoGeograficoAtivo } from '$lib/config/destinosGeograficos';
  import { apiDelete, apiFetch, apiPost } from '$lib/services/api';
  import { toast } from '$lib/stores/ui';
  import { confirmAction } from '$lib/stores/confirm';
  import { toUserMessage } from '$lib/utils/errors';
  import type { OpcionalCatalogo } from '$lib/catalogoOpcionais';
  import ImportarOpcionais from './ImportarOpcionais.svelte';

  let items: OpcionalCatalogo[] = [];
  let cidadeFiltro = '';
  let cidadeFiltroId = '';
  let filtroValido = false;
  let filtroLegado = false;
  let form = { id: '', cidade: '', cidade_id: '', nome: '', descricao: '' };
  let destinoValido = false;
  let loading = false;
  let saving = false;
  let pagina = 1;
  let temMais = false;
  let sequencia = 0;

  async function load(page = 1) {
    if (catalogoGeograficoAtivo && !filtroLegado && cidadeFiltro.trim() && !filtroValido) {
      toast.error('Selecione uma cidade na lista para filtrar.');
      return;
    }
    const seq = ++sequencia;
    loading = true;
    try {
      const result = await apiFetch<{ items: OpcionalCatalogo[]; hasMore: boolean }>(
        '/api/v1/opcionais',
        {
          query: {
            cidade: catalogoGeograficoAtivo && !filtroLegado ? '' : cidadeFiltro,
            ...(catalogoGeograficoAtivo && !filtroLegado && cidadeFiltroId
              ? { cidade_id: cidadeFiltroId }
              : {}),
            pagina: page
          },
          noCache: true
        }
      );
      if (seq !== sequencia) return;
      items = result.items;
      temMais = result.hasMore;
      pagina = page;
    } catch (err) {
      if (seq !== sequencia) return;
      toast.error(toUserMessage(err, 'Erro ao carregar opcionais.'));
    } finally {
      if (seq === sequencia) loading = false;
    }
  }

  function limpar() {
    form = { id: '', cidade: '', cidade_id: '', nome: '', descricao: '' };
    destinoValido = false;
  }

  async function salvar() {
    if (!form.cidade.trim() || !form.nome.trim()) {
      toast.error('Informe a cidade e o nome do passeio.');
      return;
    }
    if (catalogoGeograficoAtivo && (!form.cidade_id || !destinoValido)) {
      toast.error('Selecione e confirme o destino geográfico.');
      return;
    }
    saving = true;
    try {
      await apiPost('/api/v1/opcionais', {
        ...form,
        id: form.id || undefined,
        cidade_id: catalogoGeograficoAtivo ? form.cidade_id : undefined
      });
      toast.success('Opcional salvo no catálogo compartilhado.');
      limpar();
      await load();
    } catch (err) {
      toast.error(toUserMessage(err, 'Erro ao salvar opcional.'));
    } finally {
      saving = false;
    }
  }

  async function excluir(item: OpcionalCatalogo) {
    if (
      !(await confirmAction(
        `Excluir "${item.nome}" do catálogo? Os roteiros existentes não serão alterados.`
      ))
    )
      return;
    try {
      await apiDelete('/api/v1/opcionais', { id: item.id });
      if (form.id === item.id) limpar();
      toast.success('Opcional excluído do catálogo.');
      await load(pagina);
    } catch (err) {
      toast.error(toUserMessage(err, 'Erro ao excluir opcional.'));
    }
  }

  onMount(() => {
    void load();
  });
</script>

<svelte:head><title>Passeios Opcionais | VTUR</title></svelte:head>

<PageHeader
  title="Passeios Opcionais"
  subtitle="Catálogo compartilhado de passeios por cidade."
  breadcrumbs={[{ label: 'Cadastros', href: '/cadastros' }, { label: 'Passeios Opcionais' }]}
/>

<Card title={form.id ? 'Editar opcional' : 'Novo opcional'}>
  <p class="mb-4 text-sm text-slate-500">
    Os passeios são compartilhados entre os usuários. Alterações no catálogo não modificam roteiros
    já salvos.
  </p>
  <div class="space-y-3">
    {#if catalogoGeograficoAtivo}
      {#key form.id}
        <SeletorDestinoGeografico
          fieldId="opcional-cidade"
          label="Cidade"
          bind:value={form.cidade}
          bind:destinoId={form.cidade_id}
          bind:valid={destinoValido}
          disabled={saving}
          required
        />
      {/key}
    {:else}
      <CidadeDestinoAutocomplete
        id="opcional-cidade"
        label="Cidade"
        bind:value={form.cidade}
        required
        endpoint="/api/v1/opcionais/cidades"
      />
    {/if}
    <FieldInput label="Nome do passeio" bind:value={form.nome} required />
    <FieldTextarea label="Descrição" bind:value={form.descricao} rows={5} />
    <div class="flex gap-2">
      <Button type="button" disabled={saving} on:click={salvar}
        >{saving ? 'Salvando...' : 'Salvar opcional'}</Button
      >
      {#if form.id}<Button type="button" variant="secondary" on:click={limpar}
          >Cancelar edição</Button
        >{/if}
    </div>
  </div>
</Card>

<div class="mt-4">
  <ImportarOpcionais
    geografico={catalogoGeograficoAtivo}
    onImported={() => {
      void load();
    }}
  />
</div>

<div class="mt-4">
  <Card title="Opcionais cadastrados">
    <div class="mb-4 flex flex-wrap items-end gap-2">
      {#if catalogoGeograficoAtivo}
        <label class="text-sm text-slate-700">
          <input
            type="checkbox"
            bind:checked={filtroLegado}
            on:change={() => {
              cidadeFiltro = '';
              cidadeFiltroId = '';
            }}
          /> Buscar registros antigos por texto
        </label>
      {/if}
      {#if catalogoGeograficoAtivo && !filtroLegado}
        <div class="min-w-[220px] flex-1">
          <SeletorDestinoGeografico
            fieldId="opcional-filtro"
            label="Filtrar por cidade"
            bind:value={cidadeFiltro}
            bind:destinoId={cidadeFiltroId}
            bind:valid={filtroValido}
          />
        </div>
      {:else}
        <CidadeDestinoAutocomplete
          id="opcional-filtro"
          label="Filtrar por cidade"
          bind:value={cidadeFiltro}
          endpoint="/api/v1/opcionais/cidades"
          class_name="min-w-[220px] flex-1"
        />
      {/if}
      <Button type="button" variant="secondary" on:click={() => load()}>Buscar</Button>
      <Button
        type="button"
        variant="secondary"
        on:click={() => {
          cidadeFiltro = '';
          cidadeFiltroId = '';
          void load();
        }}>Todas as cidades</Button
      >
    </div>
    {#if loading}<p class="text-sm text-slate-500">Carregando...</p>
    {:else if items.length === 0}<p class="text-sm text-slate-500">Nenhum opcional encontrado.</p>
    {:else}
      <div class="space-y-3">
        {#each items as item (item.id)}
          <div class="rounded-lg border border-slate-200 p-3">
            <p class="text-sm text-slate-500">{item.cidade}</p>
            <h3 class="font-semibold">{item.nome}</h3>
            <p class="text-sm whitespace-pre-line text-slate-600">{item.descricao}</p>
            <div class="mt-2 flex gap-2">
              <Button
                type="button"
                variant="secondary"
                size="xs"
                on:click={() => {
                  if (item.cidade_id && !catalogoGeograficoAtivo) {
                    toast.error('A edição deste destino geográfico ainda não está disponível.');
                    return;
                  }
                  destinoValido = false;
                  form = { ...item, cidade_id: item.cidade_id || '' };
                }}>Editar</Button
              >
              <Button type="button" variant="secondary" size="xs" on:click={() => excluir(item)}
                >Excluir</Button
              >
            </div>
          </div>
        {/each}
      </div>
      <div class="mt-4 flex items-center gap-2">
        {#if pagina > 1}<Button
            type="button"
            variant="secondary"
            size="sm"
            on:click={() => load(pagina - 1)}>Anterior</Button
          >{/if}
        <span class="text-sm text-slate-500">Página {pagina}</span>
        {#if temMais}<Button
            type="button"
            variant="secondary"
            size="sm"
            on:click={() => load(pagina + 1)}>Próxima</Button
          >{/if}
      </div>
    {/if}
  </Card>
</div>
