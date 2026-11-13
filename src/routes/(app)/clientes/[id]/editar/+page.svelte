<script lang="ts">
  import { page } from '$app/stores';
  import { goto } from '$app/navigation';
  import { onDestroy, onMount } from 'svelte';
  import {
    Button,
    Card,
    FieldCheckbox,
    FieldInput,
    FieldRadioGroup,
    FieldSelect,
    FieldTextarea,
    LoadingState,
    PageHeader,
    Tabs
  } from '$lib/components/ui';
  import AcompanhantesManager from '$lib/components/clientes/AcompanhantesManager.svelte';
  import {
    ArrowLeft,
    Calendar,
    FileText,
    Mail,
    MapPin,
    Phone,
    Whatsapp,
    Save,
    Tag,
    User,
    Users
  } from '$lib/icons';
  import { toast } from '$lib/stores/ui';
  import { ApiError, apiGet, apiPatch, isCanceledApiError } from '$lib/services/api';
  import { toUserMessage } from '$lib/utils/errors';
  import { mensagemErroCep } from '$lib/features/enderecos/cep';
  import {
    buildClientePayload,
    classificacaoSelectOptions,
    createInitialClienteForm,
    estadosBrasil,
    fillClienteFormFromApi,
    formatCep,
    formatDocumento,
    formatTelefone,
    generoSelectOptions,
    type ClienteFormData,
    validateClienteForm
  } from '$lib/features/clientes/form';

  const clienteId = $page.params.id;

  let formData: ClienteFormData = createInitialClienteForm();
  let loading = true;
  let saving = false;
  let errors: Record<string, string> = {};
  let cepStatus: string | null = null;
  let errorMessage: string | null = null;
  let abaAtiva: 'dados' | 'acompanhantes' = 'dados';
  let loadController: AbortController | null = null;
  let cepController: AbortController | null = null;
  let loadSeq = 0;
  let cepSeq = 0;

  type CepResponse = {
    erro?: boolean;
    logradouro?: string;
    localidade?: string;
    uf?: string;
  };

  const tipoPessoaOptions = [
    { value: 'PF', label: 'Pessoa Fisica' },
    { value: 'PJ', label: 'Pessoa Juridica' }
  ];

  const estadosSelectOptions = estadosBrasil.map((estado) => ({
    value: estado.value,
    label: estado.label
  }));

  async function carregarCliente() {
    loadController?.abort();
    const controller = new AbortController();
    loadController = controller;
    const seq = ++loadSeq;
    loading = true;
    errorMessage = null;

    try {
      const data = await apiGet<Record<string, unknown>>(
        `/api/v1/clientes/${clienteId}`,
        undefined,
        controller.signal
      );
      if (seq !== loadSeq) return;
      formData = fillClienteFormFromApi(data);
    } catch (error: unknown) {
      if (isCanceledApiError(error)) return;
      errorMessage = toUserMessage(error, 'Erro ao carregar cliente.');
      toast.error(errorMessage);
    } finally {
      if (seq === loadSeq) loading = false;
    }
  }

  onMount(() => {
    void carregarCliente();
  });

  onDestroy(() => {
    loadSeq += 1;
    cepSeq += 1;
    loadController?.abort();
    cepController?.abort();
  });

  function setTipoPessoa(value: 'PF' | 'PJ') {
    errors = { ...errors, cpf: '' };
    formData = {
      ...formData,
      tipo_pessoa: value,
      cpf: formatDocumento(formData.cpf, value),
      genero: value === 'PJ' ? '' : formData.genero,
      nacionalidade: value === 'PJ' ? '' : formData.nacionalidade || 'Brasileira'
    };
  }

  function handleTelefoneInput(field: 'telefone' | 'whatsapp', event: Event) {
    const input = event.currentTarget as HTMLInputElement;
    formData = {
      ...formData,
      [field]: formatTelefone(input.value)
    };
  }

  function handleDocumentoInput(event: Event) {
    errors = { ...errors, cpf: '' };
    const input = event.currentTarget as HTMLInputElement;
    input.value = formatDocumento(input.value, formData.tipo_pessoa);
    formData = {
      ...formData,
      cpf: input.value
    };
  }

  function handleCepInput(event: Event) {
    const input = event.currentTarget as HTMLInputElement;
    cepController?.abort();
    cepSeq += 1;
    cepStatus = null;
    formData = {
      ...formData,
      cep: formatCep(input.value)
    };
  }

  async function buscarCepIfNeeded() {
    const digits = String(formData.cep || '').replace(/\D/g, '');
    if (digits.length !== 8) {
      cepController?.abort();
      cepSeq += 1;
      cepStatus = null;
      return;
    }

    cepController?.abort();
    const controller = new AbortController();
    cepController = controller;
    const seq = ++cepSeq;
    try {
      cepStatus = 'Buscando CEP...';
      const data = await apiGet<CepResponse>(
        '/api/v1/enderecos/cep',
        { cep: digits },
        controller.signal
      );
      if (seq !== cepSeq) return;
      if (data?.erro) {
        throw new Error('CEP nao encontrado.');
      }

      formData = {
        ...formData,
        endereco: String(data?.logradouro || formData.endereco || ''),
        cidade: String(data?.localidade || formData.cidade || ''),
        estado: String(data?.uf || formData.estado || '')
      };
      cepStatus = 'Endereco carregado pelo CEP.';
    } catch (error) {
      if (isCanceledApiError(error) || seq !== cepSeq) return;
      cepStatus = mensagemErroCep(error);
    }
  }

  async function handleSubmit() {
    errors = {};
    const validation = validateClienteForm(formData);
    if (!validation.valid) {
      errors = validation.errors;
      toast.error(validation.firstError || 'Corrija os erros do formulario.');
      return;
    }

    saving = true;

    try {
      await apiPatch(`/api/v1/clientes/${clienteId}`, buildClientePayload(formData));

      toast.success('Cliente atualizado com sucesso.');
      goto(`/clientes/${clienteId}`);
    } catch (error: unknown) {
      if (error instanceof ApiError) {
        const payload = error.payload as { errors?: Record<string, string> } | undefined;
        if (payload?.errors && typeof payload.errors === 'object') {
          errors = payload.errors;
        }
      }
      toast.error(toUserMessage(error, 'Erro ao atualizar cliente.'));
    } finally {
      saving = false;
    }
  }
</script>

<svelte:head>
  <title>Editar Cliente | VTUR</title>
</svelte:head>

{#if loading}
  <LoadingState />
{:else if errorMessage}
  <div class="space-y-4">
    <div
      role="alert"
      class="rounded-vtur-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700"
    >
      {errorMessage}
    </div>
    <Button variant="secondary" on:click={() => goto('/clientes')}>
      <ArrowLeft size={16} class="mr-2" />
      Voltar para clientes
    </Button>
  </div>
{:else}
  <PageHeader
    title="Editar Cliente"
    subtitle="Mesmo fluxo do cadastro, com aba de acompanhantes para manter o relacionamento operacional."
    breadcrumbs={[
      { label: 'Clientes', href: '/clientes' },
      { label: formData.nome || 'Cliente', href: `/clientes/${clienteId}` },
      { label: 'Editar' }
    ]}
  />

  <div class="mb-6 md:hidden">
    <Tabs
      activeKey={abaAtiva}
      items={[
        { key: 'dados', label: 'Dados do cliente' },
        { key: 'acompanhantes', label: 'Acompanhantes' }
      ]}
      onSelect={(key) => {
        if (key === 'dados' || key === 'acompanhantes') abaAtiva = key;
      }}
    />
  </div>
  <div class="mb-6 hidden flex-wrap gap-3 md:flex">
    <Button
      type="button"
      variant={abaAtiva === 'dados' ? 'selected' : 'secondary'}
      color={abaAtiva === 'dados' ? 'clientes' : undefined}
      on:click={() => (abaAtiva = 'dados')}
    >
      <User size={16} class="mr-2" />
      Dados do cliente
    </Button>
    <Button
      type="button"
      variant={abaAtiva === 'acompanhantes' ? 'selected' : 'secondary'}
      color={abaAtiva === 'acompanhantes' ? 'clientes' : undefined}
      on:click={() => (abaAtiva = 'acompanhantes')}
    >
      <Users size={16} class="mr-2" />
      Acompanhantes
    </Button>
  </div>

  {#if abaAtiva === 'dados'}
    <form on:submit|preventDefault={handleSubmit} class="space-y-6">
      <Card title="Dados cadastrais" color="clientes">
        <div class="grid grid-cols-1 gap-4 md:grid-cols-2 lg:grid-cols-4">
          <FieldRadioGroup
            label="Tipo de pessoa"
            value={formData.tipo_pessoa}
            options={tipoPessoaOptions}
            on:change={(event) =>
              setTipoPessoa((event.currentTarget as HTMLInputElement).value as 'PF' | 'PJ')}
          />

          <FieldInput
            id="nome"
            label={formData.tipo_pessoa === 'PJ' ? 'Razao social' : 'Nome completo'}
            bind:value={formData.nome}
            icon={User}
            required={true}
            error={errors.nome}
            class_name="lg:col-span-2"
          />

          <FieldInput
            id="cpf"
            documentType={formData.tipo_pessoa === 'PJ' ? 'cnpj' : 'cpf'}
            label={formData.tipo_pessoa === 'PJ' ? 'CNPJ' : 'CPF'}
            value={formData.cpf}
            required={true}
            error={errors.cpf}
            on:input={handleDocumentoInput}
          />

          <FieldInput
            id="rg"
            label={formData.tipo_pessoa === 'PJ' ? 'Inscricao / IE' : 'RG'}
            bind:value={formData.rg}
          />

          {#if formData.tipo_pessoa === 'PF'}
            <FieldInput
              id="nascimento"
              label="Data de nascimento"
              type="date"
              bind:value={formData.nascimento}
              icon={Calendar}
            />

            <FieldSelect
              id="genero"
              label="Genero"
              bind:value={formData.genero}
              options={generoSelectOptions}
              placeholder="Selecione uma opção"
            />

            <FieldInput
              id="nacionalidade"
              label="Nacionalidade"
              bind:value={formData.nacionalidade}
            />
          {/if}

          <FieldInput
            id="tipo_cliente"
            label="Tipo de cliente"
            bind:value={formData.tipo_cliente}
          />

          <FieldSelect
            id="classificacao"
            label="Classificacao"
            bind:value={formData.classificacao}
            options={classificacaoSelectOptions}
            placeholder="Selecione uma opção"
          />

          <FieldCheckbox
            id="ativo"
            label="Cliente ativo"
            checked={formData.ativo}
            color="clientes"
            class_name="pt-7"
            on:change={(event) => {
              const checked = (event.currentTarget as HTMLInputElement).checked;
              formData = { ...formData, ativo: checked, active: checked };
            }}
          />
        </div>
      </Card>

      <Card title="Contato e relacionamento" color="clientes">
        <div class="grid grid-cols-1 gap-4 md:grid-cols-2 lg:grid-cols-4">
          <FieldInput
            id="telefone"
            label="Telefone"
            value={formData.telefone}
            type="tel"
            icon={Phone}
            required={true}
            error={errors.telefone}
            on:input={(event) => handleTelefoneInput('telefone', event)}
          />

          <FieldInput
            id="whatsapp"
            label="WhatsApp"
            value={formData.whatsapp}
            type="tel"
            icon={Whatsapp}
            on:input={(event) => handleTelefoneInput('whatsapp', event)}
          />

          <FieldInput
            id="email"
            label="E-mail"
            bind:value={formData.email}
            type="email"
            icon={Mail}
            error={errors.email}
            class_name="lg:col-span-2"
          />

          <FieldInput
            id="tags"
            label="Tags"
            bind:value={formData.tags}
            icon={Tag}
            helper="Separe as tags por virgula."
            class_name="lg:col-span-4"
          />
        </div>
      </Card>

      <Card title="Endereco" color="clientes">
        <div class="grid grid-cols-1 gap-4 md:grid-cols-2 lg:grid-cols-4">
          <FieldInput
            id="cep"
            label="CEP"
            value={formData.cep}
            icon={MapPin}
            helper={cepStatus || 'Preencha para auto-preencher o endereco.'}
            on:input={handleCepInput}
            on:blur={buscarCepIfNeeded}
          />

          <FieldInput
            id="endereco"
            label="Endereco"
            bind:value={formData.endereco}
            class_name="lg:col-span-2"
          />

          <FieldInput id="numero" label="Numero" bind:value={formData.numero} />

          <FieldInput id="complemento" label="Complemento" bind:value={formData.complemento} />

          <FieldInput id="cidade" label="Cidade" bind:value={formData.cidade} />

          <FieldSelect
            id="estado"
            label="Estado"
            bind:value={formData.estado}
            options={estadosSelectOptions}
            placeholder="Selecione uma opção"
          />
        </div>
      </Card>

      <Card title="Notas operacionais" color="clientes">
        <FieldTextarea
          id="notas"
          label="Notas"
          bind:value={formData.notas}
          rows={5}
          placeholder="Informacoes adicionais sobre relacionamento, preferencias e historico comercial."
        />
      </Card>

      <div class="flex items-center justify-end gap-3">
        <Button
          type="button"
          variant="secondary"
          on:click={() => goto(`/clientes/${clienteId}`)}
          disabled={saving}
        >
          <ArrowLeft size={16} class="mr-2" />
          Cancelar
        </Button>
        <Button type="submit" variant="primary" color="clientes" loading={saving}>
          <Save size={16} class="mr-2" />
          Salvar alteracoes
        </Button>
      </div>
    </form>
  {:else}
    <AcompanhantesManager
      {clienteId}
      editable={true}
      title="Acompanhantes do cliente"
      subtitle="Cadastro e manutencao dos acompanhantes vinculados a este cliente."
    />
  {/if}
{/if}
