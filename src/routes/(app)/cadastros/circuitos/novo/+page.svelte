<script lang="ts">
  import { goto } from '$app/navigation';
  import PageHeader from '$lib/components/ui/PageHeader.svelte';
  import Card from '$lib/components/ui/Card.svelte';
  import Button from '$lib/components/ui/Button.svelte';
  import {
    FieldCheckbox,
    FieldInput,
    FieldRadioGroup,
    FieldSelect,
    FieldTextarea
  } from '$lib/components/ui';
  import { Route, Save, ArrowLeft, Plus, Trash2 } from '$lib/icons';
  import { toast } from '$lib/stores/ui';

  let saving = false;
  let circuito = {
    codigo: '',
    nome: '',
    tipo: 'nacional',
    dias: 5,
    noites: 4,
    descricao: '',
    preco_base: 0,
    vagas: 20,
    saidas: '',
    guia: true,
    ativo: true
  };

  let roteiro: Array<{ dia: number; titulo: string; descricao: string; refeicoes: string[] }> = [
    { dia: 1, titulo: 'Chegada', descricao: '', refeicoes: [] },
    { dia: 2, titulo: '', descricao: '', refeicoes: [] }
  ];

  let destinosSelecionados: string[] = [''];
  const destinosDisponiveis = [
    'Rio de Janeiro',
    'Salvador',
    'Gramado',
    'Fortaleza',
    'Paris',
    'Lisboa',
    'Barcelona',
    'Cancún',
    'Porto Seguro',
    'Florianópolis'
  ];

  async function handleSubmit() {
    if (!circuito.nome.trim() || !circuito.codigo.trim()) {
      toast.error('Código e nome são obrigatórios');
      return;
    }

    saving = true;
    toast.success('Circuito cadastrado com sucesso!');
    goto('/cadastros/circuitos');
  }

  function handleCancel() {
    goto('/cadastros/circuitos');
  }

  function addDestino() {
    destinosSelecionados = [...destinosSelecionados, ''];
  }

  function removeDestino(index: number) {
    destinosSelecionados = destinosSelecionados.filter((_, i) => i !== index);
  }

  function addDiaRoteiro() {
    roteiro = [...roteiro, { dia: roteiro.length + 1, titulo: '', descricao: '', refeicoes: [] }];
  }

  function removeDiaRoteiro(index: number) {
    roteiro = roteiro.reduce<typeof roteiro>((items, item, i) => {
      if (i !== index) items.push({ ...item, dia: items.length + 1 });
      return items;
    }, []);
  }

  function toggleRefeicao(diaIndex: number, refeicao: string) {
    const dia = roteiro[diaIndex];
    if (dia.refeicoes.includes(refeicao)) {
      dia.refeicoes = dia.refeicoes.filter((r) => r !== refeicao);
    } else {
      dia.refeicoes = [...dia.refeicoes, refeicao];
    }
    roteiro = [...roteiro];
  }
</script>

<svelte:head>
  <title>Novo Circuito | VTUR</title>
</svelte:head>

<PageHeader
  title="Novo Circuito"
  subtitle="Cadastrar novo roteiro ou pacote combinado"
  color="financeiro"
  breadcrumbs={[
    { label: 'Cadastros', href: '/cadastros' },
    { label: 'Circuitos', href: '/cadastros/circuitos' },
    { label: 'Novo' }
  ]}
/>

<form on:submit|preventDefault={handleSubmit}>
  <Card header="Informações Básicas" color="financeiro" class="mb-6">
    <div class="grid grid-cols-1 gap-6 md:grid-cols-2">
      <FieldInput
        id="novo-circuito-codigo"
        label="Código"
        bind:value={circuito.codigo}
        placeholder="Ex: CIR-001"
        icon={Route}
        required={true}
        class_name="w-full"
      />

      <FieldInput
        id="novo-circuito-nome"
        label="Nome do Circuito"
        bind:value={circuito.nome}
        placeholder="Ex: Rota das Emoções"
        required={true}
        class_name="w-full"
      />

      <FieldSelect
        id="novo-circuito-tipo"
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
          id="novo-circuito-dias"
          label="Dias"
          type="number"
          bind:value={circuito.dias}
          min="1"
          class_name="w-full"
        />
        <FieldInput
          id="novo-circuito-noites"
          label="Noites"
          type="number"
          bind:value={circuito.noites}
          min="1"
          class_name="w-full"
        />
      </div>

      <FieldInput
        money
        id="novo-circuito-preco-base"
        label="Preço Base"
        type="number"
        bind:value={circuito.preco_base}
        placeholder="0,00"
        min="0"
        step="0.01"
        prefix="R$"
        class_name="w-full"
      />

      <FieldInput
        id="novo-circuito-vagas"
        label="Vagas por Saída"
        type="number"
        bind:value={circuito.vagas}
        min="1"
        class_name="w-full"
      />

      <FieldInput
        id="novo-circuito-saidas"
        label="Dias de Saída"
        bind:value={circuito.saidas}
        placeholder="Ex: Ter, Sab / Semanal / Quinzenal"
        class_name="w-full"
      />

      <FieldRadioGroup
        id="novo-circuito-guia"
        label="Guia Acompanhante"
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

      <FieldRadioGroup
        id="novo-circuito-status"
        label="Status"
        value={circuito.ativo ? 'true' : 'false'}
        options={[
          { value: 'true', label: 'Ativo' },
          { value: 'false', label: 'Inativo' }
        ]}
        class_name="w-full"
        on:change={(event) => {
          circuito.ativo =
            String((event.currentTarget as HTMLInputElement | null)?.value || 'false') === 'true';
        }}
      />

      <div class="md:col-span-2">
        <FieldTextarea
          id="novo-circuito-descricao"
          label="Descrição Geral"
          bind:value={circuito.descricao}
          rows={3}
          placeholder="Descrição do circuito, principais atrativos..."
          class_name="w-full"
        />
      </div>
    </div>
  </Card>

  <Card header="Destinos do Circuito" color="financeiro" class="mb-6">
    <div class="space-y-3">
      {#each destinosSelecionados as destino, index}
        <div class="flex items-center gap-3">
          <span
            class="bg-financeiro-100 text-financeiro-700 flex h-8 w-8 items-center justify-center rounded-full text-sm font-medium"
          >
            {index + 1}
          </span>
          <FieldSelect
            id="destino-circuito-{index}"
            ariaLabel={`Destino ${index + 1}`}
            bind:value={destinosSelecionados[index]}
            options={destinosDisponiveis.map((d) => ({ value: d, label: d }))}
            placeholder="Selecione um destino..."
            class_name="flex-1"
          />
          {#if destinosSelecionados.length > 1}
            <Button
              type="button"
              variant="ghost"
              size="sm"
              on:click={() => removeDestino(index)}
              ariaLabel="Remover destino"
              class_name="text-slate-400 hover:text-red-600"
            >
              <Trash2 size={18} />
            </Button>
          {/if}
        </div>
      {/each}
      <Button
        type="button"
        variant="ghost"
        size="sm"
        color="financeiro"
        class_name="mt-4 justify-start px-0! text-financeiro-700 hover:bg-transparent! hover:text-financeiro-700!"
        on:click={addDestino}
      >
        <Plus size={18} />
        Adicionar Destino
      </Button>
    </div>
  </Card>

  <Card header="Roteiro Diário" color="financeiro" class="mb-6">
    <div class="space-y-6">
      {#each roteiro as dia, index}
        <div class="rounded-lg border border-slate-200 bg-slate-50 p-4">
          <div class="mb-4 flex items-center justify-between">
            <div class="flex items-center gap-3">
              <span
                class="bg-financeiro-700 flex h-10 w-10 items-center justify-center rounded-full font-bold text-white"
              >
                D{dia.dia}
              </span>
              <FieldInput
                bind:value={dia.titulo}
                placeholder="Título do dia"
                class_name="bg-white"
              />
            </div>
            {#if roteiro.length > 1}
              <Button
                type="button"
                variant="ghost"
                size="sm"
                on:click={() => removeDiaRoteiro(index)}
                ariaLabel="Remover dia do roteiro"
                class_name="text-slate-400 hover:text-red-600"
              >
                <Trash2 size={18} />
              </Button>
            {/if}
          </div>

          <div class="ml-13">
            <FieldTextarea
              bind:value={dia.descricao}
              rows={2}
              placeholder="Descrição das atividades do dia..."
              class_name="w-full bg-white mb-3"
            />

            <div class="flex items-center gap-4">
              <span class="text-sm font-medium text-slate-700">Refeições incluídas:</span>
              {#each ['Café', 'Almoço', 'Jantar'] as refeicao}
                <FieldCheckbox
                  label={refeicao}
                  checked={dia.refeicoes.includes(refeicao)}
                  on:change={() => toggleRefeicao(index, refeicao)}
                />
              {/each}
            </div>
          </div>
        </div>
      {/each}

      <Button
        type="button"
        variant="outline"
        color="financeiro"
        class_name="w-full justify-center border-2 border-dashed border-financeiro-300 py-3 text-financeiro-700 hover:border-financeiro-500! hover:bg-financeiro-50!"
        on:click={addDiaRoteiro}
      >
        <Plus size={20} />
        Adicionar Dia
      </Button>
    </div>
  </Card>

  <!-- Botões -->
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
        Salvar Circuito
      {/if}
    </Button>
  </div>
</form>
