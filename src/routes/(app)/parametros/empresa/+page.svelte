<script lang="ts">
  import { VTUR_LOGO_URL } from "$lib/brand";
  import { onMount } from 'svelte';
  import PageHeader from '$lib/components/ui/PageHeader.svelte';
  import Card from '$lib/components/ui/Card.svelte';
  import Button from '$lib/components/ui/Button.svelte';
  import { FieldInput, FieldSelect, LoadingState } from '$lib/components/ui';
  import { Building2, Save } from '$lib/icons';
  import { toast } from '$lib/stores/ui';
  import { apiGet, apiPatch, isCanceledApiError } from '$lib/services/api';
  import { createLoadGuard } from '$lib/utils/loadGuard';
  import { toUserMessage } from '$lib/utils/errors';

  type Empresa = {
    id: string;
    nome_empresa: string | null;
    nome_fantasia: string | null;
    cnpj: string | null;
    ie: string | null;
    im: string | null;
    email: string | null;
    telefone: string | null;
    website: string | null;
    endereco: string | null;
    numero: string | null;
    complemento: string | null;
    bairro: string | null;
    cidade: string | null;
    estado: string | null;
    cep: string | null;
    logo_url: string | null;
  };

  let loading = true;
  let saving = false;
  let empresa: Empresa | null = null;
  const loadGuard = createLoadGuard();

  let form = {
    nome_empresa: '',
    nome_fantasia: '',
    cnpj: '',
    ie: '',
    im: '',
    email: '',
    telefone: '',
    website: '',
    endereco: '',
    numero: '',
    complemento: '',
    bairro: '',
    cidade: '',
    estado: '',
    cep: ''
  };

  const estados = ['AC','AL','AP','AM','BA','CE','DF','ES','GO','MA','MT','MS','MG','PA','PB','PR','PE','PI','RJ','RN','RS','RO','RR','SC','SP','SE','TO'];

  async function load() {
    const request = loadGuard.next();
    loading = true;
    try {
      empresa = await apiGet<Empresa>('/api/v1/parametros/empresa', undefined, request.signal);
      if (!loadGuard.isCurrent(request.seq)) return;
      if (empresa) {
        form = {
          nome_empresa: empresa.nome_empresa || '',
          nome_fantasia: empresa.nome_fantasia || '',
          cnpj: empresa.cnpj || '',
          ie: empresa.ie || '',
          im: empresa.im || '',
          email: empresa.email || '',
          telefone: empresa.telefone || '',
          website: empresa.website || '',
          endereco: empresa.endereco || '',
          numero: empresa.numero || '',
          complemento: empresa.complemento || '',
          bairro: empresa.bairro || '',
          cidade: empresa.cidade || '',
          estado: empresa.estado || '',
          cep: empresa.cep || ''
        };
      }
    } catch (err) {
      if (isCanceledApiError(err)) return;
      toast.error(toUserMessage(err, 'Erro ao carregar dados da empresa.'));
    } finally {
      if (loadGuard.isCurrent(request.seq)) loading = false;
    }
  }

  async function handleSubmit() {
    saving = true;
    try {
      await apiPatch('/api/v1/parametros/empresa', form);
      toast.success('Dados da empresa atualizados com sucesso.');
      await load();
    } catch (err) {
      toast.error(toUserMessage(err, 'Erro ao salvar dados da empresa.'));
    } finally {
      saving = false;
    }
  }

  onMount(load);
</script>

<svelte:head>
  <title>Dados da Empresa | VTUR</title>
</svelte:head>

<PageHeader
  title="Dados da Empresa"
  subtitle="Informações cadastrais e fiscais da empresa."
  color="financeiro"
  breadcrumbs={[
    { label: 'Parâmetros', href: '/parametros' },
    { label: 'Empresa' }
  ]}
/>

{#if loading}
  <LoadingState />
{:else}
  <form on:submit|preventDefault={handleSubmit} class="space-y-6">
    <!-- Identidade Visual -->
    <Card title="Identidade Visual" color="financeiro">
      <div class="flex items-center gap-6">
        <div class="flex h-20 w-20 items-center justify-center rounded-xl bg-financeiro-100">
          {#if VTUR_LOGO_URL}
            <img src={VTUR_LOGO_URL} alt="VTur" class="h-full w-full rounded-xl object-contain" />
          {:else}
            <Building2 size={36} class="text-financeiro-600" />
          {/if}
        </div>
        <div>
          <p class="text-sm font-medium text-slate-700">Logo VTur</p>
          <p class="mt-1 text-xs text-slate-500">Identidade padrão desta versão do CRM.</p>
        </div>
      </div>
    </Card>

    <!-- Dados Cadastrais -->
    <Card title="Dados Cadastrais" color="financeiro">
      <div class="grid grid-cols-1 gap-4 md:grid-cols-2">
        <FieldInput id="emp-razao" label="Razão Social" type="text" bind:value={form.nome_empresa} class_name="md:col-span-2 w-full" />
        <FieldInput id="emp-fantasia" label="Nome Fantasia" type="text" bind:value={form.nome_fantasia} class_name="w-full" />
        <FieldInput id="emp-cnpj" label="CNPJ" type="text" bind:value={form.cnpj} placeholder="00.000.000/0000-00" mask="cnpj" class_name="w-full" />
        <FieldInput id="emp-ie" label="Inscrição Estadual" type="text" bind:value={form.ie} class_name="w-full" />
        <FieldInput id="emp-im" label="Inscrição Municipal" type="text" bind:value={form.im} class_name="w-full" />
      </div>
    </Card>

    <!-- Contato -->
    <Card title="Contato" color="financeiro">
      <div class="grid grid-cols-1 gap-4 md:grid-cols-2">
        <FieldInput id="emp-email" label="E-mail" type="email" bind:value={form.email} class_name="w-full" />
        <FieldInput id="emp-telefone" label="Telefone" type="text" bind:value={form.telefone} placeholder="(00) 0000-0000" mask="phone" class_name="w-full" />
        <FieldInput id="emp-website" label="Website" type="url" bind:value={form.website} placeholder="https://" class_name="md:col-span-2 w-full" />
      </div>
    </Card>

    <!-- Endereço -->
    <Card title="Endereço" color="financeiro">
      <div class="grid grid-cols-1 gap-4 md:grid-cols-2 lg:grid-cols-4">
        <FieldInput id="emp-endereco" label="Endereço" type="text" bind:value={form.endereco} class_name="lg:col-span-2 w-full" />
        <FieldInput id="emp-numero" label="Número" type="text" bind:value={form.numero} class_name="w-full" />
        <FieldInput id="emp-complemento" label="Complemento" type="text" bind:value={form.complemento} class_name="w-full" />
        <FieldInput id="emp-bairro" label="Bairro" type="text" bind:value={form.bairro} class_name="w-full" />
        <FieldInput id="emp-cidade" label="Cidade" type="text" bind:value={form.cidade} class_name="w-full" />
        <FieldSelect
          id="emp-estado"
          label="Estado"
          bind:value={form.estado}
          options={estados.map(uf => ({ value: uf, label: uf }))}
          placeholder="Selecione uma opção"
          class_name="w-full"
        />
        <FieldInput id="emp-cep" label="CEP" type="text" bind:value={form.cep} placeholder="00000-000" mask="cep" class_name="w-full" />
      </div>
    </Card>

    <div class="flex items-center justify-end gap-3">
      <Button type="button" variant="secondary" on:click={() => history.back()} disabled={saving}>Cancelar</Button>
      <Button type="submit" variant="primary" color="financeiro" loading={saving}>
        <Save size={16} class="mr-2" />
        Salvar Alterações
      </Button>
    </div>
  </form>
{/if}
