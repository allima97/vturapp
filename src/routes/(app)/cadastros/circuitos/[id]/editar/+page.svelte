<script lang="ts">
  import { goto } from '$app/navigation';
  import PageHeader from '$lib/components/ui/PageHeader.svelte';
  import Card from '$lib/components/ui/Card.svelte';
  import Button from '$lib/components/ui/Button.svelte';
  import { FieldInput, FieldRadioGroup, FieldSelect, FieldTextarea } from '$lib/components/ui';
  import { Route, Save, ArrowLeft } from '$lib/icons';
  import { toast } from '$lib/stores/ui';

  let saving = false;
  let circuito = {
    codigo: 'CIR-001',
    nome: 'Rota das Emoções',
    tipo: 'nacional' as 'nacional' | 'internacional',
    dias: 7,
    noites: 6,
    descricao: 'Circuito incrível pelo Nordeste',
    preco_base: 3200,
    vagas: 20,
    saidas: 'Ter, Sab',
    guia: true,
    ativo: true
  };

  async function handleSubmit() {
    saving = true;
    toast.success('Circuito atualizado com sucesso!');
    goto('/cadastros/circuitos');
  }

  function handleCancel() {
    goto('/cadastros/circuitos');
  }
</script>

<svelte:head>
  <title>Editar Circuito | VTUR</title>
</svelte:head>

<PageHeader
  title="Editar Circuito"
  subtitle="Atualizar informações do circuito"
  color="financeiro"
  breadcrumbs={[
    { label: 'Cadastros', href: '/cadastros' },
    { label: 'Circuitos', href: '/cadastros/circuitos' },
    { label: 'Editar' }
  ]}
/>

<form on:submit|preventDefault={handleSubmit}>
  <Card color="financeiro" class="mb-6">
    <div class="grid grid-cols-1 gap-6 md:grid-cols-2">
      <FieldInput
        id="circuito-codigo"
        label="Código"
        bind:value={circuito.codigo}
        icon={Route}
        required={true}
        class_name="w-full"
      />

      <FieldInput
        id="circuito-nome"
        label="Nome"
        bind:value={circuito.nome}
        required={true}
        class_name="w-full"
      />

      <FieldSelect
        id="circuito-tipo"
        label="Tipo"
        bind:value={circuito.tipo}
        options={[
          { value: 'nacional', label: 'Nacional' },
          { value: 'internacional', label: 'Internacional' }
        ]}
        placeholder={null}
        class_name="w-full"
      />

      <div class="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <FieldInput
          id="circuito-dias"
          label="Dias"
          type="number"
          bind:value={circuito.dias}
          min="1"
          class_name="w-full"
        />
        <FieldInput
          id="circuito-noites"
          label="Noites"
          type="number"
          bind:value={circuito.noites}
          min="1"
          class_name="w-full"
        />
      </div>

      <FieldInput
        money
        id="circuito-preco-base"
        label="Preço Base"
        type="number"
        bind:value={circuito.preco_base}
        min="0"
        step="0.01"
        prefix="R$"
        class_name="w-full"
      />

      <FieldInput
        id="circuito-vagas"
        label="Vagas"
        type="number"
        bind:value={circuito.vagas}
        min="1"
        class_name="w-full"
      />

      <FieldInput
        id="circuito-saidas"
        label="Dias de Saída"
        bind:value={circuito.saidas}
        class_name="w-full"
      />

      <FieldRadioGroup
        id="circuito-guia"
        label="Guia"
        value={circuito.guia ? 'true' : 'false'}
        options={[
          { value: 'true', label: 'Sim' },
          { value: 'false', label: 'Não' }
        ]}
        class_name="w-full"
        on:change={(event) => {
          circuito.guia =
            String((event.currentTarget as HTMLInputElement | null)?.value || 'false') === 'true';
        }}
      />

      <div class="md:col-span-2">
        <FieldTextarea
          id="circuito-descricao"
          label="Descrição"
          bind:value={circuito.descricao}
          rows={4}
          class_name="w-full"
        />
      </div>
    </div>
  </Card>

  <div class="flex items-center justify-end gap-3">
    <Button variant="secondary" on:click={handleCancel}>
      <ArrowLeft size={18} class="mr-2" />
      Voltar
    </Button>
    <Button variant="primary" color="financeiro" type="submit" disabled={saving}>
      {#if saving}
        <span class="mr-2 animate-spin">⟳</span>
        Salvando...
      {:else}
        <Save size={18} class="mr-2" />
        Salvar Alterações
      {/if}
    </Button>
  </div>
</form>
