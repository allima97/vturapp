<script lang="ts">
  import { onDestroy } from 'svelte';
  import PageHeader from '$lib/components/ui/PageHeader.svelte';
  import Card from '$lib/components/ui/Card.svelte';
  import Button from '$lib/components/ui/Button.svelte';
  import Dialog from '$lib/components/ui/Dialog.svelte';
  import { FieldInput, FieldTextarea } from '$lib/components/ui';
  import { Plus, Search } from '$lib/icons';
  import CidadeDestinoAutocomplete from '$lib/components/CidadeDestinoAutocomplete.svelte';
  import SeletorDestinoGeografico from '$lib/components/SeletorDestinoGeografico.svelte';
  import { catalogoGeograficoAtivo } from '$lib/config/destinosGeograficos';
  import { apiDelete, apiFetch, apiPost } from '$lib/services/api';
  import { toast } from '$lib/stores/ui';
  import { confirmAction } from '$lib/stores/confirm';
  import { toUserMessage } from '$lib/utils/errors';
  import { createDebouncedReloader } from '$lib/utils/autoReload';
  import type { OpcionalCatalogo } from '$lib/catalogoOpcionais';
  import ImportarOpcionais from './ImportarOpcionais.svelte';
  import CadastroLoteOpcionais from './CadastroLoteOpcionais.svelte';

  let items: OpcionalCatalogo[] = [];
  let busca = '';
  let form = { id: '', cidade: '', cidade_id: '', nome: '', descricao: '' };
  let destinoValido = false;
  let loading = false;
  let saving = false;
  let modalOpen = false;
  let loteOpen = false;
  let importacaoOpen = false;
  let importando = false;
  let pagina = 1;
  let temMais = false;
  let erroBusca = '';
  let sequencia = 0;
  let filtroAplicado = '';
  const buscaAutomatica = createDebouncedReloader(() => pesquisar(), 300);

  function limparResultados() {
    sequencia++;
    items = [];
    temMais = false;
    pagina = 1;
    loading = false;
    erroBusca = '';
    filtroAplicado = '';
  }

  function pesquisar() {
    if (Array.from(busca.trim()).length < 2) {
      limparResultados();
      return;
    }
    filtroAplicado = busca.trim();
    void load();
  }

  async function load(page = 1) {
    if (!filtroAplicado) return;
    const seq = ++sequencia;
    loading = true;
    erroBusca = '';
    try {
      const result = await apiFetch<{ items: OpcionalCatalogo[]; hasMore: boolean }>(
        '/api/v1/opcionais',
        {
          query: {
            q: filtroAplicado,
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
      items = [];
      temMais = false;
      erroBusca = toUserMessage(err, 'Erro ao carregar opcionais.');
      toast.error(erroBusca);
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
      modalOpen = false;
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

  onDestroy(() => {
    buscaAutomatica.cancel();
    sequencia++;
  });
</script>

<svelte:head><title>Passeios Opcionais | VTUR</title></svelte:head>

<PageHeader
  title="Passeios Opcionais"
  subtitle="Catálogo compartilhado de passeios por cidade."
  breadcrumbs={[{ label: 'Cadastros', href: '/cadastros' }, { label: 'Passeios Opcionais' }]}
  actions={[
    {
      label: 'Novo opcional',
      icon: Plus,
      onClick: () => {
        limpar();
        modalOpen = true;
      }
    },
    {
      label: 'Adicionar em lote',
      variant: 'secondary',
      onClick: () => (loteOpen = true)
    },
    {
      label: 'Importar passeios opcionais',
      variant: 'secondary',
      onClick: () => (importacaoOpen = true)
    }
  ]}
/>

{#if loteOpen}
  <CadastroLoteOpcionais
    bind:open={loteOpen}
    geografico={catalogoGeograficoAtivo}
    onSaved={() => {
      void load();
    }}
  />
{/if}

<Dialog
  bind:open={importacaoOpen}
  title="Importar passeios opcionais"
  size="lg"
  cancelText="Fechar"
  loading={importando}
  dismissable={!importando}
>
  {#if importacaoOpen}
    <ImportarOpcionais
      geografico={catalogoGeograficoAtivo}
      bind:salvando={importando}
      onImported={() => {
        void load();
      }}
    />
  {/if}
</Dialog>

<Dialog
  bind:open={modalOpen}
  title={form.id ? 'Editar opcional' : 'Novo opcional'}
  description="Os passeios são compartilhados entre os usuários. Alterações no catálogo não modificam roteiros já salvos."
  showConfirm
  confirmText="Salvar opcional"
  loading={saving}
  dismissable={!saving}
  onConfirm={salvar}
>
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
  </div>
</Dialog>

<div class="mt-4">
  <Card title="Opcionais cadastrados">
    <FieldInput
      id="opcional-busca"
      label="Buscar opcional (cidade ou descrição)"
      placeholder="Digite pelo menos 2 letras da cidade, nome ou descrição"
      icon={Search}
      maxlength={300}
      bind:value={busca}
      class_name="mb-4"
      on:input={(event) => {
        busca = (event.target as HTMLInputElement).value;
        buscaAutomatica.cancel();
        limparResultados();
        if (Array.from(busca.trim()).length >= 2) buscaAutomatica.schedule();
      }}
    />
    <div class="mb-4 flex flex-wrap items-end gap-2">
      <Button
        type="button"
        variant="secondary"
        on:click={() => {
          buscaAutomatica.cancel();
          pesquisar();
        }}>Buscar</Button
      >
      <Button
        type="button"
        variant="secondary"
        on:click={() => {
          busca = '';
          buscaAutomatica.cancel();
          limparResultados();
        }}>Limpar busca</Button
      >
    </div>
    {#if loading}<p class="text-sm text-slate-500">Carregando...</p>
    {:else if !filtroAplicado}<p class="text-sm text-slate-500">
        Digite pelo menos 2 letras da cidade, nome ou descrição para encontrar opcionais.
      </p>
    {:else if erroBusca}<p role="alert" class="text-sm text-red-700">{erroBusca}</p>
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
                  modalOpen = true;
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
