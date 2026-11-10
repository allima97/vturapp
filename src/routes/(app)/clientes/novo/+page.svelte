<script lang="ts">
  import { goto } from '$app/navigation';
  import {
    Button,
    Card,
    FieldCheckbox,
    FieldInput,
    FieldRadioGroup,
    FieldSelect,
    FieldTextarea,
    PageHeader
  } from '$lib/components/ui';
  import { ArrowLeft, Calendar, FileText, Mail, MapPin, Phone, Save, Tag, User } from '$lib/icons';
  import { toast } from '$lib/stores/ui';
  import { ApiError, apiGet, apiPost, isCanceledApiError } from '$lib/services/api';
  import { toUserMessage } from '$lib/utils/errors';
  import { createLoadGuard } from '$lib/utils/loadGuard';
  import {
    buildClientePayload,
    classificacaoSelectOptions,
    createInitialClienteForm,
    estadosBrasil,
    formatCep,
    formatDocumento,
    formatTelefone,
    generoSelectOptions,
    type ClienteFormData,
    validateClienteForm
  } from '$lib/features/clientes/form';

  let formData: ClienteFormData = createInitialClienteForm();
  let loading = false;
  let errors: Record<string, string> = {};
  let cepStatus: string | null = null;
  const cepGuard = createLoadGuard();

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

  function updateField<Key extends keyof ClienteFormData>(field: Key, value: ClienteFormData[Key]) {
    formData = {
      ...formData,
      [field]: value
    };
  }

  function setTipoPessoa(value: 'PF' | 'PJ') {
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
    updateField(field, formatTelefone(input.value));
  }

  function handleDocumentoInput(event: Event) {
    const input = event.currentTarget as HTMLInputElement;
    updateField('cpf', formatDocumento(input.value, formData.tipo_pessoa));
  }

  function handleCepInput(event: Event) {
    const input = event.currentTarget as HTMLInputElement;
    updateField('cep', formatCep(input.value));
  }

  async function buscarCepIfNeeded() {
    const digits = String(formData.cep || '').replace(/\D/g, '');
    if (digits.length !== 8) {
      cepGuard.abort();
      cepStatus = null;
      return;
    }

    const request = cepGuard.next();
    try {
      cepStatus = 'Buscando CEP...';
      const data = await apiGet<CepResponse>(
        '/api/v1/enderecos/cep',
        { cep: digits },
        request.signal
      );
      if (!cepGuard.isCurrent(request.seq)) return;
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
      if (isCanceledApiError(error)) return;
      cepStatus = 'Nao foi possivel carregar o CEP.';
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

    loading = true;

    try {
      const payload = await apiPost<{ data?: { id?: string } }>(
        '/api/v1/clientes/create',
        buildClientePayload(formData)
      );

      toast.success('Cliente cadastrado com sucesso.');
      const createdId = String(payload?.data?.id || '').trim();
      if (createdId) {
        goto(`/clientes/${createdId}`);
      } else {
        goto('/clientes');
      }
    } catch (error: unknown) {
      if (error instanceof ApiError) {
        const payload = error.payload as { errors?: Record<string, string> } | undefined;
        if (payload?.errors && typeof payload.errors === 'object') {
          errors = payload.errors;
        }
      }
      toast.error(toUserMessage(error, 'Erro ao cadastrar cliente.'));
    } finally {
      loading = false;
    }
  }
</script>

<svelte:head>
  <title>Novo Cliente | VTUR</title>
</svelte:head>

<PageHeader
  title="Novo Cliente"
  subtitle="Cadastro completo com dados pessoais, contato, endereco, classificacao e notas operacionais."
  breadcrumbs={[{ label: 'Clientes', href: '/clientes' }, { label: 'Novo Cliente' }]}
/>

<form on:submit|preventDefault={handleSubmit} class="space-y-6">
  <Card title="Dados cadastrais" color="clientes">
    <div class="grid grid-cols-1 gap-4 md:grid-cols-2 lg:grid-cols-4">
      <FieldRadioGroup
        label="Tipo de pessoa"
        value={formData.tipo_pessoa}
        options={tipoPessoaOptions}
        class_name="lg:col-span-1"
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
        placeholder={formData.tipo_pessoa === 'PJ'
          ? 'Razao social do cliente'
          : 'Nome completo do cliente'}
        class_name="lg:col-span-2"
      />

      <FieldInput
        id="cpf"
        label={formData.tipo_pessoa === 'PJ' ? 'CNPJ' : 'CPF'}
        value={formData.cpf}
        required={true}
        error={errors.cpf}
        placeholder={formData.tipo_pessoa === 'PJ' ? '00.000.000/0000-00' : '000.000.000-00'}
        class_name="w-full"
        on:input={handleDocumentoInput}
      />

      <FieldInput
        id="rg"
        label={formData.tipo_pessoa === 'PJ' ? 'Inscricao / IE' : 'RG'}
        bind:value={formData.rg}
        placeholder={formData.tipo_pessoa === 'PJ'
          ? 'Documento complementar'
          : 'Documento de identidade'}
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

        <FieldInput id="nacionalidade" label="Nacionalidade" bind:value={formData.nacionalidade} />
      {/if}

      <FieldInput
        id="tipo_cliente"
        label="Tipo de cliente"
        bind:value={formData.tipo_cliente}
        placeholder="passageiro"
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
        placeholder="(00) 00000-0000"
        on:input={(event) => handleTelefoneInput('telefone', event)}
      />

      <FieldInput
        id="whatsapp"
        label="WhatsApp"
        value={formData.whatsapp}
        type="tel"
        icon={Phone}
        placeholder="(00) 00000-0000"
        on:input={(event) => handleTelefoneInput('whatsapp', event)}
      />

      <FieldInput
        id="email"
        label="E-mail"
        bind:value={formData.email}
        type="email"
        icon={Mail}
        error={errors.email}
        placeholder="cliente@exemplo.com"
        class_name="lg:col-span-2"
      />

      <FieldInput
        id="tags"
        label="Tags"
        bind:value={formData.tags}
        icon={Tag}
        helper="Separe as tags por virgula, como no fluxo do app legado."
        placeholder="vip, aniversario, indicacao"
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
        placeholder="00000-000"
        on:input={handleCepInput}
        on:blur={buscarCepIfNeeded}
      />

      <FieldInput
        id="endereco"
        label="Endereco"
        bind:value={formData.endereco}
        placeholder="Rua, avenida, etc."
        class_name="lg:col-span-2"
      />

      <FieldInput id="numero" label="Numero" bind:value={formData.numero} placeholder="123" />

      <FieldInput
        id="complemento"
        label="Complemento"
        bind:value={formData.complemento}
        placeholder="Apto, sala, bloco"
      />

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
      placeholder="Informacoes de relacionamento, preferencias, observacoes comerciais e contexto do cliente."
    />
  </Card>

  <div class="flex items-center justify-end gap-3">
    <Button type="button" variant="secondary" on:click={() => goto('/clientes')} disabled={loading}>
      <ArrowLeft size={16} class="mr-2" />
      Cancelar
    </Button>
    <Button type="submit" variant="primary" color="clientes" {loading}>
      <Save size={16} class="mr-2" />
      Salvar cliente
    </Button>
  </div>
</form>
