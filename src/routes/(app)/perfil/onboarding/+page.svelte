<script lang="ts">
  import { goto } from '$app/navigation';
  import { onMount } from 'svelte';
  import PageHeader from '$lib/components/ui/PageHeader.svelte';
  import Card from '$lib/components/ui/Card.svelte';
  import Button from '$lib/components/ui/Button.svelte';
  import { FieldInput, FieldRadioGroup, FieldSelect, LoadingState } from '$lib/components/ui';
  import { toast } from '$lib/stores/ui';
  import { apiGet, apiPatch, isCanceledApiError } from '$lib/services/api';
  import { toUserMessage } from '$lib/utils/errors';
  import { createLoadGuard } from '$lib/utils/loadGuard';
  import { mensagemErroCep } from '$lib/features/enderecos/cep';
  import { validateCPF } from '$lib/utils/validation';
  import { Save, CheckCircle, User, Phone, Whatsapp, MapPin } from '$lib/icons';
  import { formatDocumentoSalvo } from '$lib/features/clientes/form';

  let loading = true;
  let saving = false;
  let cepStatus: string | null = null;
  const loadGuard = createLoadGuard();
  const cepGuard = createLoadGuard();

  type PerfilOnboarding = {
    nome_completo?: string | null;
    cpf?: string | null;
    data_nascimento?: string | null;
    telefone?: string | null;
    whatsapp?: string | null;
    cep?: string | null;
    endereco?: string | null;
    numero?: string | null;
    cidade?: string | null;
    estado?: string | null;
    uso_individual?: boolean | null;
  };

  type CepResponse = {
    logradouro?: string;
    localidade?: string;
    uf?: string;
  };

  let form = {
    nome_completo: '',
    cpf: '',
    data_nascimento: '',
    telefone: '',
    whatsapp: '',
    cep: '',
    endereco: '',
    numero: '',
    cidade: '',
    estado: '',
    uso_individual: null as boolean | null
  };

  const ESTADOS = [
    'AC',
    'AL',
    'AP',
    'AM',
    'BA',
    'CE',
    'DF',
    'ES',
    'GO',
    'MA',
    'MT',
    'MS',
    'MG',
    'PA',
    'PB',
    'PR',
    'PE',
    'PI',
    'RJ',
    'RN',
    'RS',
    'RO',
    'RR',
    'SC',
    'SP',
    'SE',
    'TO'
  ];

  async function load() {
    const request = loadGuard.next();
    loading = true;
    try {
      const perfil = await apiGet<PerfilOnboarding>(
        '/api/v1/user/profile',
        undefined,
        request.signal
      );
      if (!loadGuard.isCurrent(request.seq)) return;
      form = {
        nome_completo: perfil.nome_completo || '',
        cpf: formatDocumentoSalvo(perfil.cpf || '', 'PF'),
        data_nascimento: perfil.data_nascimento || '',
        telefone: perfil.telefone || '',
        whatsapp: perfil.whatsapp || '',
        cep: perfil.cep || '',
        endereco: perfil.endereco || '',
        numero: perfil.numero || '',
        cidade: perfil.cidade || '',
        estado: perfil.estado || '',
        uso_individual: perfil.uso_individual ?? null
      };
    } catch (err) {
      if (isCanceledApiError(err)) return;
      toast.error(toUserMessage(err, 'Erro ao carregar perfil.'));
    } finally {
      if (loadGuard.isCurrent(request.seq)) loading = false;
    }
  }

  async function buscarCep() {
    const digits = String(form.cep || '').replace(/\D/g, '');
    if (digits.length !== 8) {
      cepGuard.abort();
      cepStatus = null;
      return;
    }
    const request = cepGuard.next();
    cepStatus = 'Buscando CEP...';
    try {
      const data = await apiGet<CepResponse>(
        '/api/v1/enderecos/cep',
        { cep: digits },
        request.signal
      );
      if (!cepGuard.isCurrent(request.seq)) return;
      form = {
        ...form,
        endereco: data.logradouro || form.endereco,
        cidade: data.localidade || form.cidade,
        estado: data.uf || form.estado
      };
      cepStatus = 'Endereço carregado.';
    } catch (err) {
      if (isCanceledApiError(err) || !cepGuard.isCurrent(request.seq)) return;
      cepStatus = mensagemErroCep(err);
    }
  }

  async function save() {
    if (!form.nome_completo.trim()) {
      toast.error('Nome completo obrigatório.');
      return;
    }
    if (!validateCPF(form.cpf)) {
      toast.error('CPF inválido. Confira os dígitos informados.');
      return;
    }
    if (!form.telefone.trim()) {
      toast.error('Telefone obrigatório.');
      return;
    }
    if (form.uso_individual === null) {
      toast.error('Informe o tipo de uso do sistema.');
      return;
    }

    saving = true;
    try {
      await apiPatch('/api/v1/user/profile', form);
      toast.success('Perfil completado com sucesso!');
      goto('/');
    } catch (err) {
      toast.error(toUserMessage(err, 'Erro ao salvar perfil.'));
    } finally {
      saving = false;
    }
  }

  onMount(load);

  function onUsoIndividualChange(e: Event) {
    const val = (e.currentTarget as HTMLSelectElement | HTMLInputElement).value;
    form = { ...form, uso_individual: val === '' ? null : val === 'true' };
  }

  $: camposFaltando = [
    !form.nome_completo.trim() && 'Nome completo',
    !form.cpf.trim() && 'CPF',
    !form.data_nascimento && 'Data de nascimento',
    !form.telefone.trim() && 'Telefone',
    !form.cep.trim() && 'CEP',
    !form.numero.trim() && 'Número',
    !form.cidade.trim() && 'Cidade',
    !form.estado.trim() && 'Estado',
    form.uso_individual === null && 'Tipo de uso'
  ].filter(Boolean);
</script>

<svelte:head>
  <title>Completar Perfil | VTUR</title>
</svelte:head>

<PageHeader
  title="Complete seu Perfil"
  subtitle="Preencha os dados obrigatórios para acessar todos os recursos do sistema."
  breadcrumbs={[{ label: 'Onboarding' }]}
/>

{#if camposFaltando.length > 0}
  <div class="rounded-vtur-lg mb-6 border border-amber-200 bg-amber-50 px-4 py-3">
    <p class="text-sm font-medium text-amber-800">Campos obrigatórios pendentes:</p>
    <p class="mt-1 text-sm text-amber-700">{camposFaltando.join(', ')}</p>
  </div>
{:else}
  <div
    class="rounded-vtur-lg mb-6 flex items-center gap-2 border border-green-200 bg-green-50 px-4 py-3"
  >
    <CheckCircle size={18} class="text-green-600" />
    <p class="text-sm font-medium text-green-800">
      Todos os campos obrigatórios estão preenchidos!
    </p>
  </div>
{/if}

{#if loading}
  <LoadingState />
{:else}
  <form on:submit|preventDefault={save} class="space-y-6">
    <Card title="Dados pessoais">
      <div class="grid grid-cols-1 gap-4 md:grid-cols-2 lg:grid-cols-3">
        <FieldInput
          id="ob-nome"
          label="Nome completo"
          required
          bind:value={form.nome_completo}
          placeholder="Seu nome completo"
          icon={User}
          class_name="lg:col-span-2 w-full"
        />
        <FieldInput
          id="ob-cpf"
          documentType="cpf"
          label="CPF"
          required
          bind:value={form.cpf}
          placeholder="000.000.000-00"
          maxlength={14}
          mask="cpf"
          class_name="w-full"
        />
        <FieldInput
          id="ob-nascimento"
          label="Data de nascimento"
          required
          type="date"
          bind:value={form.data_nascimento}
          class_name="w-full"
        />
        <FieldInput
          id="ob-telefone"
          label="Telefone"
          required
          bind:value={form.telefone}
          placeholder="(00) 00000-0000"
          icon={Phone}
          mask="phone"
          class_name="w-full"
        />
        <FieldInput
          id="ob-whatsapp"
          label="WhatsApp"
          bind:value={form.whatsapp}
          placeholder="(00) 00000-0000"
          icon={Whatsapp}
          mask="phone"
          class_name="w-full"
        />
      </div>
    </Card>

    <Card title="Tipo de uso *">
      <FieldRadioGroup
        id="ob-uso"
        label={null}
        value={form.uso_individual === null ? '' : String(form.uso_individual)}
        on:change={onUsoIndividualChange}
        orientation="column"
        options={[
          { value: 'false', label: 'Uso corporativo' },
          { value: 'true', label: 'Uso individual' }
        ]}
        helper={form.uso_individual === false
          ? 'Faço parte de uma equipe ou agência.'
          : form.uso_individual === true
            ? 'Trabalho de forma independente.'
            : 'Escolha como você usa o sistema.'}
        class_name="w-full"
      />
    </Card>

    <Card title="Endereço">
      <div class="grid grid-cols-1 gap-4 md:grid-cols-2 lg:grid-cols-4">
        <FieldInput
          id="ob-cep"
          label="CEP"
          required
          bind:value={form.cep}
          placeholder="00000-000"
          maxlength={9}
          icon={MapPin}
          mask="cep"
          helper={cepStatus}
          on:input={() => {
            cepGuard.abort();
            cepStatus = null;
          }}
          on:blur={buscarCep}
          class_name="w-full"
        />
        <FieldInput
          id="ob-endereco"
          label="Endereço"
          bind:value={form.endereco}
          class_name="lg:col-span-2 w-full"
        />
        <FieldInput
          id="ob-numero"
          label="Número"
          required
          bind:value={form.numero}
          placeholder="123"
          class_name="w-full"
        />
        <FieldInput
          id="ob-cidade"
          label="Cidade"
          required
          bind:value={form.cidade}
          class_name="w-full"
        />
        <FieldSelect
          id="ob-estado"
          label="Estado"
          required
          bind:value={form.estado}
          options={ESTADOS.map((uf) => ({ value: uf, label: uf }))}
          placeholder="Selecione uma opção"
          class_name="w-full"
        />
      </div>
    </Card>

    <div class="flex justify-end gap-3">
      <Button type="button" variant="secondary" on:click={() => goto('/')}>Pular por agora</Button>
      <Button type="submit" variant="primary" loading={saving}>
        <Save size={16} class="mr-2" />
        Salvar e continuar
      </Button>
    </div>
  </form>
{/if}
