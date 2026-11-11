<script lang="ts">
  import { onMount } from 'svelte';
  import PageHeader from '$lib/components/ui/PageHeader.svelte';
  import Card from '$lib/components/ui/Card.svelte';
  import Button from '$lib/components/ui/Button.svelte';
  import { FieldInput, FieldSelect, LoadingState } from '$lib/components/ui';
  import { toast } from '$lib/stores/ui';
  import { toUserMessage } from '$lib/utils/errors';
  import { apiGet, apiPatch, isCanceledApiError } from '$lib/services/api';
  import { createLoadGuard } from '$lib/utils/loadGuard';
  import { mensagemErroCep } from '$lib/features/enderecos/cep';
  import { validateOptionalCPF } from '$lib/utils/validation';
  import {
    formatCep,
    formatDocumento,
    formatDocumentoSalvo,
    formatTelefone,
    onlyDigits
  } from '$lib/features/clientes/form';
  import { Save, User, Phone, Whatsapp, MapPin, Mail, Building2, Calendar } from '$lib/icons';

  type Perfil = {
    id: string;
    nome_completo: string | null;
    cpf: string | null;
    data_nascimento: string | null;
    telefone: string | null;
    whatsapp: string | null;
    rg: string | null;
    cep: string | null;
    endereco: string | null;
    numero: string | null;
    complemento: string | null;
    cidade: string | null;
    estado: string | null;
    email: string;
    uso_individual: boolean | null;
    avatar_url: string | null;
    company_id: string | null;
    company?: {
      nome_empresa?: string | null;
      nome_fantasia?: string | null;
      cnpj?: string | null;
    } | null;
  };

  type CepResponse = {
    logradouro?: string;
    complemento?: string;
    localidade?: string;
    uf?: string;
  };

  let perfil: Perfil | null = null;
  let loading = true;
  let saving = false;
  let cepStatus: string | null = null;
  let assinatura = '';
  let savingAssinatura = false;
  const loadGuard = createLoadGuard();
  const cepGuard = createLoadGuard();

  let form = {
    nome_completo: '',
    cpf: '',
    data_nascimento: '',
    telefone: '',
    whatsapp: '',
    rg: '',
    cep: '',
    endereco: '',
    numero: '',
    complemento: '',
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
      const [perfilData, sigData] = await Promise.all([
        apiGet<Perfil>('/api/v1/user/profile', undefined, request.signal),
        apiGet<{ signature?: string | null }>(
          '/api/v1/profile/signature',
          undefined,
          request.signal
        ).catch((err) => {
          if (isCanceledApiError(err)) throw err;
          return null;
        })
      ]);
      if (!loadGuard.isCurrent(request.seq)) return;
      perfil = perfilData;
      assinatura = String(sigData?.signature || '').trim();
      if (perfil) {
        form = {
          nome_completo: perfil.nome_completo || '',
          cpf: formatDocumentoSalvo(perfil.cpf || '', 'PF'),
          data_nascimento: perfil.data_nascimento || '',
          telefone: displayFormatted(perfil.telefone || '', [10, 11], formatTelefone),
          whatsapp: displayFormatted(perfil.whatsapp || '', [10, 11], formatTelefone),
          rg: perfil.rg || '',
          cep: displayFormatted(perfil.cep || '', [8], formatCep),
          endereco: perfil.endereco || '',
          numero: perfil.numero || '',
          complemento: perfil.complemento || '',
          cidade: perfil.cidade || '',
          estado: perfil.estado || '',
          uso_individual: perfil.uso_individual
        };
      }
    } catch (err) {
      if (isCanceledApiError(err)) return;
      toast.error(toUserMessage(err, 'Erro ao carregar perfil.'));
    } finally {
      if (loadGuard.isCurrent(request.seq)) loading = false;
    }
  }

  async function saveAssinatura() {
    savingAssinatura = true;
    try {
      await apiPatch('/api/v1/profile/signature', { signature: assinatura.trim() });
      toast.success('Assinatura atualizada.');
    } catch (err) {
      toast.error(toUserMessage(err, 'Erro ao salvar assinatura.'));
    } finally {
      savingAssinatura = false;
    }
  }

  function displayFormatted(
    value: string,
    lengths: number[],
    formatter: (value: string) => string
  ) {
    return /^[\d\s().-]*$/.test(value) && lengths.includes(onlyDigits(value).length)
      ? formatter(value)
      : value;
  }

  function handleTelefoneInput(field: 'telefone' | 'whatsapp', event: Event) {
    const input = event.currentTarget as HTMLInputElement;
    input.value = formatTelefone(input.value);
    form = { ...form, [field]: input.value };
  }

  function handleCpfInput(event: Event) {
    const input = event.currentTarget as HTMLInputElement;
    input.value = formatDocumento(input.value, 'PF');
    form = { ...form, cpf: input.value };
  }

  function handleCepInput(event: Event) {
    cepGuard.abort();
    cepStatus = null;
    const input = event.currentTarget as HTMLInputElement;
    input.value = formatCep(input.value);
    form = { ...form, cep: input.value };
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
        complemento: data.complemento || form.complemento,
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
    if (!validateOptionalCPF(form.cpf)) {
      toast.error('CPF inválido. Confira os dígitos informados.');
      return;
    }

    saving = true;
    try {
      await apiPatch('/api/v1/user/profile', form);
      toast.success('Perfil atualizado com sucesso.');
      await load();
    } catch (err) {
      toast.error(toUserMessage(err, 'Erro ao salvar perfil.'));
    } finally {
      saving = false;
    }
  }

  onMount(load);
</script>

<svelte:head>
  <title>Meu Perfil | VTUR</title>
</svelte:head>

{#if loading}
  <LoadingState />
{:else}
  <PageHeader
    title="Meu Perfil"
    subtitle="Dados pessoais, contato e endereço do seu cadastro no sistema."
    breadcrumbs={[{ label: 'Perfil' }]}
  />

  <form on:submit|preventDefault={save} class="space-y-6">
    {#if perfil?.company}
      <Card title="Empresa" color="clientes">
        <div class="flex items-center gap-4">
          <div class="flex h-12 w-12 items-center justify-center rounded-xl bg-slate-100">
            <Building2 size={22} class="text-slate-500" />
          </div>
          <div>
            <p class="font-semibold text-slate-900">
              {perfil.company.nome_fantasia || perfil.company.nome_empresa || 'Empresa'}
            </p>
            {#if perfil.company.cnpj}
              <p class="text-sm text-slate-500">CNPJ: {perfil.company.cnpj}</p>
            {/if}
          </div>
        </div>
      </Card>
    {/if}

    <Card title="Dados pessoais" color="clientes">
      <div class="grid grid-cols-1 gap-4 md:grid-cols-2 lg:grid-cols-3">
        <FieldInput
          id="perfil-nome"
          label="Nome completo"
          required
          bind:value={form.nome_completo}
          placeholder="Seu nome completo"
          icon={User}
          class_name="lg:col-span-2 w-full"
        />
        <FieldInput
          id="perfil-cpf"
          documentType="cpf"
          label="CPF"
          bind:value={form.cpf}
          placeholder="000.000.000-00"
          maxlength={14}
          on:input={handleCpfInput}
          class_name="w-full"
        />
        <FieldInput
          id="perfil-rg"
          label="RG"
          bind:value={form.rg}
          placeholder="Documento de identidade"
          class_name="w-full"
        />
        <FieldInput
          id="perfil-nascimento"
          label="Data de nascimento"
          type="date"
          bind:value={form.data_nascimento}
          icon={Calendar}
          class_name="w-full"
        />
        <FieldInput
          id="perfil-email"
          label="E-mail"
          type="email"
          value={perfil?.email || ''}
          disabled={true}
          icon={Mail}
          helper="O e-mail não pode ser alterado aqui."
          class_name="w-full"
        />
      </div>
    </Card>

    <Card title="Contato" color="clientes">
      <div class="grid grid-cols-1 gap-4 md:grid-cols-2">
        <FieldInput
          id="perfil-telefone"
          label="Telefone"
          bind:value={form.telefone}
          type="tel"
          placeholder="(00) 00000-0000"
          icon={Phone}
          on:input={(event) => handleTelefoneInput('telefone', event)}
          class_name="w-full"
        />
        <FieldInput
          id="perfil-whatsapp"
          label="WhatsApp"
          bind:value={form.whatsapp}
          type="tel"
          placeholder="(00) 00000-0000"
          icon={Whatsapp}
          on:input={(event) => handleTelefoneInput('whatsapp', event)}
          class_name="w-full"
        />
      </div>
    </Card>

    <Card title="Endereço" color="clientes">
      <div class="grid grid-cols-1 gap-4 md:grid-cols-2 lg:grid-cols-4">
        <FieldInput
          id="perfil-cep"
          label="CEP"
          bind:value={form.cep}
          placeholder="00000-000"
          maxlength={9}
          icon={MapPin}
          helper={cepStatus}
          on:input={handleCepInput}
          on:blur={buscarCep}
          class_name="w-full"
        />
        <FieldInput
          id="perfil-endereco"
          label="Endereço"
          bind:value={form.endereco}
          placeholder="Rua, avenida..."
          class_name="lg:col-span-2 w-full"
        />
        <FieldInput
          id="perfil-numero"
          label="Número"
          bind:value={form.numero}
          placeholder="123"
          class_name="w-full"
        />
        <FieldInput
          id="perfil-complemento"
          label="Complemento"
          bind:value={form.complemento}
          placeholder="Apto, sala..."
          class_name="w-full"
        />
        <FieldInput
          id="perfil-cidade"
          label="Cidade"
          bind:value={form.cidade}
          class_name="w-full"
        />
        <FieldSelect
          id="perfil-estado"
          label="Estado"
          bind:value={form.estado}
          options={ESTADOS.map((uf) => ({ value: uf, label: uf }))}
          placeholder="Selecione uma opção"
          class_name="w-full"
        />
      </div>
    </Card>

    <div class="flex items-center justify-end gap-3">
      <Button type="submit" variant="primary" loading={saving}>
        <Save size={16} class="mr-2" />
        Salvar perfil
      </Button>
    </div>
  </form>

  <!-- Assinatura separada pois é salva em tabela diferente -->
  <div class="mt-6">
    <Card title="Assinatura" color="clientes">
      <p class="mb-3 text-sm text-slate-500">
        Usada nas mensagens de acompanhamento de clientes (WhatsApp, e-mail). Preencha com seu nome
        ou como prefere se apresentar.
      </p>
      <div class="flex items-end gap-3">
        <FieldInput
          id="perfil-assinatura"
          label="Assinatura de exibição"
          bind:value={assinatura}
          placeholder="Ex: André Lima"
          class_name="flex-1 w-full"
        />
        <Button variant="primary" loading={savingAssinatura} on:click={saveAssinatura}>
          <Save size={16} class="mr-2" />
          Salvar
        </Button>
      </div>
    </Card>
  </div>
{/if}
