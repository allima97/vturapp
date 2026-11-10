<script lang="ts">
  import { onDestroy, onMount } from 'svelte';
  import PageHeader from '$lib/components/ui/PageHeader.svelte';
  import Card from '$lib/components/ui/Card.svelte';
  import Button from '$lib/components/ui/Button.svelte';
  import { Badge, FieldSelect, LoadingState } from '$lib/components/ui';
  import { apiGet, isCanceledApiError } from '$lib/services/api';
  import { Building2, FileCheck2, FileText, PlugZap, ReceiptText, Settings } from '$lib/icons';

  type EmpresaOption = {
    id: string;
    nome?: string | null;
    nome_fantasia?: string | null;
    razao_social?: string | null;
  };

  let empresas: EmpresaOption[] = [];
  let empresaId = '';
  let loadingContext = true;
  let contextController: AbortController | null = null;
  let contextSeq = 0;

  $: empresaOptions = empresas.map((empresa) => ({
    value: empresa.id,
    label: empresa.nome_fantasia || empresa.nome || empresa.razao_social || empresa.id
  }));
  $: canSelectEmpresa = empresaOptions.length > 1;
  $: empresaAtual =
    empresaOptions.find((empresa) => empresa.value === empresaId)?.label ||
    empresaOptions[0]?.label ||
    'empresa selecionada';

  async function loadUserContext() {
    contextController?.abort();
    const controller = new AbortController();
    contextController = controller;
    const seq = ++contextSeq;
    loadingContext = true;
    try {
      const data = await apiGet<{
        company_id?: string | null;
        empresas?: EmpresaOption[];
      }>('/api/v1/user/context', undefined, controller.signal);

      if (seq !== contextSeq) return;
      empresas = Array.isArray(data.empresas) ? data.empresas : [];
      empresaId = String(data.company_id || '').trim() || empresas[0]?.id || '';
    } catch (err) {
      if (isCanceledApiError(err)) return;
      empresas = [];
      empresaId = '';
    } finally {
      if (seq === contextSeq) loadingContext = false;
    }
  }

  onMount(() => {
    void loadUserContext();
  });

  onDestroy(() => {
    contextSeq += 1;
    contextController?.abort();
  });
</script>

<svelte:head>
  <title>Notas Fiscais | Financeiro | VTUR</title>
</svelte:head>

<PageHeader
  title="Notas Fiscais"
  subtitle="Base do módulo fiscal brasileiro: emissão, conferência, integração com prefeitura e vínculo com vendas/recebimentos."
  color="financeiro"
  breadcrumbs={[{ label: 'Financeiro', href: '/financeiro' }, { label: 'Notas Fiscais' }]}
/>

<div class="space-y-6">
  {#if canSelectEmpresa || loadingContext}
    <Card title="Escopo fiscal" color="financeiro">
      <div class="grid gap-4 md:grid-cols-[minmax(260px,360px)_1fr] md:items-end">
        {#if loadingContext}
          <LoadingState compact={true} />
        {:else}
          <FieldSelect
            id="notas-fiscais-empresa"
            label="Empresa"
            bind:value={empresaId}
            options={empresaOptions}
            class_name="w-full"
          />
        {/if}
        <p class="text-sm leading-6 text-slate-500">
          A emissão fiscal será tratada por CNPJ/empresa. O escopo atual é <strong
            class="text-slate-800">{empresaAtual}</strong
          >.
        </p>
      </div>
    </Card>
  {/if}

  <div class="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
    <Card color="financeiro">
      <p class="text-xs font-semibold tracking-[0.18em] text-slate-500 uppercase">Pendentes</p>
      <p class="mt-2 text-2xl font-semibold text-slate-950">0</p>
      <p class="mt-1 text-sm text-slate-500">Vendas aguardando emissão em {empresaAtual}</p>
    </Card>
    <Card color="financeiro">
      <p class="text-xs font-semibold tracking-[0.18em] text-slate-500 uppercase">Emitidas</p>
      <p class="mt-2 text-2xl font-semibold text-slate-950">0</p>
      <p class="mt-1 text-sm text-slate-500">Notas autorizadas</p>
    </Card>
    <Card color="financeiro">
      <p class="text-xs font-semibold tracking-[0.18em] text-slate-500 uppercase">Falhas</p>
      <p class="mt-2 text-2xl font-semibold text-slate-950">0</p>
      <p class="mt-1 text-sm text-slate-500">Rejeições ou retorno inválido</p>
    </Card>
    <Card color="financeiro">
      <p class="text-xs font-semibold tracking-[0.18em] text-slate-500 uppercase">Integração</p>
      <p class="mt-2 text-lg font-semibold text-slate-950">A configurar</p>
      <p class="mt-1 text-sm text-slate-500">Provider fiscal para {empresaAtual}</p>
    </Card>
  </div>

  <Card
    title="Plano técnico da emissão fiscal"
    subtitle="Sem emissão real até configurar provedor, certificado e regras municipais."
    color="financeiro"
  >
    <div class="grid gap-4 lg:grid-cols-2">
      <div class="rounded-xl border border-slate-200 p-4">
        <div class="flex items-start gap-3">
          <ReceiptText size={20} class="mt-0.5 text-orange-600" />
          <div>
            <div class="flex flex-wrap items-center gap-2">
              <p class="font-semibold text-slate-900">NFS-e de serviços turísticos</p>
              <Badge color="yellow">Planejado</Badge>
            </div>
            <p class="mt-2 text-sm leading-6 text-slate-600">
              Emitir por empresa/CNPJ, com código de serviço, alíquota municipal, ISS, tomador,
              discriminação e vínculo à venda/recebimento.
            </p>
          </div>
        </div>
      </div>

      <div class="rounded-xl border border-slate-200 p-4">
        <div class="flex items-start gap-3">
          <FileText size={20} class="mt-0.5 text-orange-600" />
          <div>
            <div class="flex flex-wrap items-center gap-2">
              <p class="font-semibold text-slate-900">NF-e quando aplicável</p>
              <Badge color="gray">Futuro</Badge>
            </div>
            <p class="mt-2 text-sm leading-6 text-slate-600">
              Manter separado de NFS-e para não misturar serviço com produto. A regra padrão do VTUR
              deve começar por NFS-e, que é o fluxo típico de prestação de serviço.
            </p>
          </div>
        </div>
      </div>

      <div class="rounded-xl border border-slate-200 p-4">
        <div class="flex items-start gap-3">
          <Building2 size={20} class="mt-0.5 text-orange-600" />
          <div>
            <p class="font-semibold text-slate-900">Configuração por empresa</p>
            <p class="mt-2 text-sm leading-6 text-slate-600">
              CNPJ, inscrição municipal, regime tributário, série/lote, certificado digital,
              ambiente de homologação/produção e credenciais do provedor.
            </p>
          </div>
        </div>
      </div>

      <div class="rounded-xl border border-slate-200 p-4">
        <div class="flex items-start gap-3">
          <FileCheck2 size={20} class="mt-0.5 text-orange-600" />
          <div>
            <p class="font-semibold text-slate-900">Auditoria antes de emitir</p>
            <p class="mt-2 text-sm leading-6 text-slate-600">
              Conferir cliente, CPF/CNPJ, endereço quando exigido, valor recebido, descontos,
              abatimentos e divergência financeira antes de autorizar a nota.
            </p>
          </div>
        </div>
      </div>
    </div>
  </Card>

  <Card title="Próximos blocos" color="financeiro">
    <div class="grid gap-3 md:grid-cols-3">
      <Button
        href="/parametros/empresa"
        variant="outline"
        color="financeiro"
        class_name="justify-start! rounded-xl! p-4!"
        disabled
      >
        <Settings size={18} class="mr-3 text-orange-600" /> Parametrizar empresa
      </Button>
      <Button
        href="/vendas"
        variant="outline"
        color="financeiro"
        class_name="justify-start! rounded-xl! p-4!"
      >
        <FileCheck2 size={18} class="mr-3 text-orange-600" /> Conferir vendas
      </Button>
      <Button
        href="/financeiro/notas-fiscais"
        variant="outline"
        color="financeiro"
        class_name="justify-start! rounded-xl! p-4!"
        disabled
      >
        <PlugZap size={18} class="mr-3 text-orange-600" /> Conectar provedor
      </Button>
    </div>
  </Card>
</div>
