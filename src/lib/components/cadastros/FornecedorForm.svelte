<script lang="ts">
  import { dev } from '$app/environment';
  import { onDestroy, onMount } from 'svelte';
  import { goto } from '$app/navigation';
  import PageHeader from '$lib/components/ui/PageHeader.svelte';
  import Card from '$lib/components/ui/Card.svelte';
  import Button from '$lib/components/ui/Button.svelte';
  import Dialog from '$lib/components/ui/Dialog.svelte';
  import {
    FieldCheckbox,
    FieldInput,
    FieldSelect,
    FieldTextarea,
    LoadingState
  } from '$lib/components/ui';
  import { ArrowLeft, Save, Trash2 } from '$lib/icons';
  import { toast } from '$lib/stores/ui';
  import { formatDate } from '$lib/utils/formatters';
  import { toUserMessage } from '$lib/utils/errors';
  import { apiDelete, apiFetch, apiGet, isCanceledApiError } from '$lib/services/api';
  import { createLoadGuard } from '$lib/utils/loadGuard';
  import { fornecedoresGeograficosAtivos } from '$lib/config/destinosGeograficos';
  import SeletorDestinoGeografico from '$lib/components/SeletorDestinoGeografico.svelte';

  export let fornecedorId: string | null = null;

  type CidadeBusca = {
    id: string;
    nome: string;
    subdivisao_nome?: string | null;
    pais_nome?: string | null;
    label?: string | null;
  };

  type ProdutoRelacionado = {
    id?: string | null;
    nome?: string | null;
    destino?: string | null;
    ativo?: boolean | null;
  };

  type VoucherRelacionado = {
    id?: string | null;
    codigo?: string | null;
    status?: string | null;
    data_utilizacao?: string | null;
  };

  type FornecedorDetalhe = {
    nome_completo?: string | null;
    nome_fantasia?: string | null;
    localizacao?: string | null;
    cnpj?: string | null;
    cep?: string | null;
    cidade?: string | null;
    estado?: string | null;
    cidade_geografica_id?: string | null;
    telefone?: string | null;
    whatsapp?: string | null;
    telefone_emergencia?: string | null;
    responsavel?: string | null;
    tipo_faturamento?: string | null;
    principais_servicos?: string | null;
    ativo?: boolean | null;
    produtos?: ProdutoRelacionado[] | null;
    vouchers?: VoucherRelacionado[] | null;
  };

  const initialForm = {
    nome_completo: '',
    nome_fantasia: '',
    localizacao: 'brasil',
    cnpj: '',
    cep: '',
    cidade: '',
    estado: '',
    telefone: '',
    whatsapp: '',
    telefone_emergencia: '',
    responsavel: '',
    tipo_faturamento: 'pre_pago',
    principais_servicos: '',
    ativo: true
  };

  let loading = true;
  let saving = false;
  let deleting = false;
  let showDeleteDialog = false;
  let form = { ...initialForm };
  let cidadeBusca = '';
  let cidadeGeograficaId = '';
  let cidadeGeograficaEsperada: string | null = null;
  let cidadeGeograficaTexto = '';
  let cidadeGeograficaValida = false;
  let modoGeografico = false;
  let cidadeLegada: { cidade: string; estado: string } | null = null;
  let resultadosCidade: CidadeBusca[] = [];
  let buscandoCidade = false;
  let erroCidadeBusca = '';
  let showCidadeOptions = false;
  let produtosRelacionados: ProdutoRelacionado[] = [];
  let vouchersRelacionados: VoucherRelacionado[] = [];
  let cidadeSearchTimer: ReturnType<typeof setTimeout> | null = null;
  const fornecedorGuard = createLoadGuard();
  const cidadeGuard = createLoadGuard();

  $: isCreateMode = !fornecedorId;
  $: title = isCreateMode ? 'Novo fornecedor' : 'Editar fornecedor';

  function formatPhone(value: string) {
    const digits = value.replace(/\D/g, '').slice(0, 11);
    if (digits.length <= 10) {
      return digits.replace(/(\d{2})(\d)/, '($1) $2').replace(/(\d{4})(\d)/, '$1-$2');
    }
    return digits.replace(/(\d{2})(\d)/, '($1) $2').replace(/(\d{5})(\d)/, '$1-$2');
  }

  async function loadFornecedor(signal?: AbortSignal) {
    if (!fornecedorId) return;
    const result = await apiGet<{ data: FornecedorDetalhe }>(
      `/api/v1/fornecedores/${fornecedorId}`,
      undefined,
      signal
    );
    const data = result.data;
    form = {
      nome_completo: data.nome_completo || '',
      nome_fantasia: data.nome_fantasia || '',
      localizacao: data.localizacao || 'brasil',
      cnpj: data.cnpj || '',
      cep: data.cep || '',
      cidade: data.cidade || '',
      estado: data.estado || '',
      telefone: data.telefone || '',
      whatsapp: data.whatsapp || '',
      telefone_emergencia: data.telefone_emergencia || '',
      responsavel: data.responsavel || '',
      tipo_faturamento: data.tipo_faturamento || 'pre_pago',
      principais_servicos: data.principais_servicos || '',
      ativo: data.ativo !== false
    };
    cidadeBusca = data.cidade
      ? data.estado
        ? `${data.cidade} (${data.estado})`
        : data.cidade
      : '';
    cidadeGeograficaId = data.cidade_geografica_id || '';
    cidadeGeograficaEsperada = data.cidade_geografica_id ?? null;
    cidadeGeograficaTexto = cidadeBusca;
    modoGeografico = fornecedoresGeograficosAtivos && Boolean(cidadeGeograficaId);
    if (fornecedoresGeograficosAtivos && !cidadeGeograficaId)
      cidadeLegada = { cidade: form.cidade, estado: form.estado };
    produtosRelacionados = data.produtos || [];
    vouchersRelacionados = data.vouchers || [];
  }

  onMount(async () => {
    const request = fornecedorGuard.next();
    try {
      if (fornecedorId) await loadFornecedor(request.signal);
      else if (fornecedoresGeograficosAtivos) modoGeografico = true;
      if (!fornecedorGuard.isCurrent(request.seq)) return;
    } catch (err) {
      if (isCanceledApiError(err)) return;
      if (dev) console.error(err);
      toast.error('Erro ao carregar fornecedor.');
      goto('/cadastros/fornecedores');
    } finally {
      if (fornecedorGuard.isCurrent(request.seq)) loading = false;
    }
  });

  function handleCidadeInput(value: string) {
    cidadeBusca = value;
    showCidadeOptions = true;
    form.cidade = '';
    form.estado = '';
    loadCidadeOptions();
  }

  function selectCidade(cidade: CidadeBusca) {
    if (cidadeSearchTimer) clearTimeout(cidadeSearchTimer);
    cidadeGuard.abort();
    buscandoCidade = false;
    form.cidade = cidade.nome || '';
    form.estado = cidade.subdivisao_nome || '';
    cidadeBusca =
      cidade.label ||
      (cidade.subdivisao_nome ? `${cidade.nome} (${cidade.subdivisao_nome})` : cidade.nome);
    resultadosCidade = [];
    showCidadeOptions = false;
    erroCidadeBusca = '';
  }

  async function loadCidadeOptions() {
    if (cidadeSearchTimer) clearTimeout(cidadeSearchTimer);
    cidadeGuard.abort();
    resultadosCidade = [];
    buscandoCidade = false;
    erroCidadeBusca = '';

    if (!showCidadeOptions || cidadeBusca.trim().length < 2) {
      return;
    }

    const query = cidadeBusca.trim();
    cidadeSearchTimer = setTimeout(async () => {
      const request = cidadeGuard.next();
      buscandoCidade = true;
      erroCidadeBusca = '';
      try {
        const resultados =
          (await apiGet<CidadeBusca[]>(
            '/api/v1/vendas/cidades-busca',
            {
              q: query,
              limite: 10
            },
            request.signal
          )) || [];
        if (!cidadeGuard.isCurrent(request.seq)) return;
        resultadosCidade = resultados;
      } catch (err) {
        if (isCanceledApiError(err) || !cidadeGuard.isCurrent(request.seq)) return;
        resultadosCidade = [];
        erroCidadeBusca = 'Erro ao buscar cidades.';
      } finally {
        if (cidadeGuard.isCurrent(request.seq)) buscandoCidade = false;
      }
    }, 300);
  }

  onDestroy(() => {
    if (cidadeSearchTimer) clearTimeout(cidadeSearchTimer);
  });

  async function handleSubmit() {
    if (!form.nome_completo.trim()) return toast.error('Nome completo é obrigatório.');
    if (!form.nome_fantasia.trim()) return toast.error('Nome fantasia é obrigatório.');
    if (
      fornecedoresGeograficosAtivos &&
      modoGeografico &&
      (!cidadeGeograficaValida || !cidadeGeograficaId)
    )
      return toast.error('Selecione uma cidade geográfica válida.');
    if (!form.cidade.trim()) return toast.error('Cidade é obrigatória.');
    if (!form.estado.trim()) return toast.error('Estado é obrigatório.');
    if (!form.telefone.trim()) return toast.error('Telefone é obrigatório.');
    if (!form.whatsapp.trim()) return toast.error('WhatsApp é obrigatório.');
    if (!form.telefone_emergencia.trim())
      return toast.error('Telefone de emergência é obrigatório.');
    if (!form.responsavel.trim()) return toast.error('Responsável é obrigatório.');
    if (!form.principais_servicos.trim())
      return toast.error('Principais serviços são obrigatórios.');
    if (form.localizacao === 'brasil' && !form.cnpj.trim())
      return toast.error('CNPJ é obrigatório para fornecedores do Brasil.');
    if (form.localizacao === 'brasil' && !form.cep.trim())
      return toast.error('CEP é obrigatório para fornecedores do Brasil.');

    saving = true;
    try {
      await apiFetch(
        isCreateMode ? '/api/v1/fornecedores/create' : `/api/v1/fornecedores/${fornecedorId}`,
        {
          method: isCreateMode ? 'POST' : 'PUT',
          body:
            fornecedoresGeograficosAtivos && modoGeografico
              ? {
                  ...form,
                  cidade_geografica_id: cidadeGeograficaId,
                  ...(!isCreateMode ? { cidade_geografica_esperada: cidadeGeograficaEsperada } : {})
                }
              : form
        }
      );
      toast.success(
        isCreateMode ? 'Fornecedor cadastrado com sucesso.' : 'Fornecedor atualizado com sucesso.'
      );
      goto('/cadastros/fornecedores');
    } catch (err: unknown) {
      toast.error(toUserMessage(err, 'Erro ao salvar fornecedor.'));
    } finally {
      saving = false;
    }
  }

  async function handleDelete() {
    if (!fornecedorId) return;
    deleting = true;
    try {
      await apiDelete(`/api/v1/fornecedores/${fornecedorId}`);
      toast.success('Fornecedor excluído com sucesso.');
      goto('/cadastros/fornecedores');
    } catch (err: unknown) {
      toast.error(toUserMessage(err, 'Erro ao excluir fornecedor.'));
    } finally {
      deleting = false;
      showDeleteDialog = false;
    }
  }
</script>

<svelte:head>
  <title>{title} | VTUR</title>
</svelte:head>

<PageHeader
  {title}
  subtitle="Centralize contato, faturamento, localização e serviços do parceiro em um único cadastro"
  color="financeiro"
  breadcrumbs={[
    { label: 'Cadastros', href: '/cadastros' },
    { label: 'Fornecedores', href: '/cadastros/fornecedores' },
    { label: isCreateMode ? 'Novo' : 'Editar' }
  ]}
/>

{#if loading}
  <LoadingState />
{:else}
  <form on:submit|preventDefault={handleSubmit}>
    <Card color="financeiro" class="mb-6">
      <div class="mb-4 grid grid-cols-1 gap-4 md:grid-cols-2">
        <Button
          type="button"
          variant={form.localizacao === 'brasil' ? 'primary' : 'outline'}
          color="financeiro"
          class_name="w-full justify-start! rounded-xl! px-4! py-3! text-left!"
          on:click={() => (form.localizacao = 'brasil')}
        >
          <div class="font-medium text-slate-900">Brasil</div>
          <div class="text-sm text-slate-500">Usa CNPJ, CEP e cidade nacional.</div>
        </Button>
        <Button
          type="button"
          variant={form.localizacao === 'exterior' ? 'primary' : 'outline'}
          color="financeiro"
          class_name="w-full justify-start! rounded-xl! px-4! py-3! text-left!"
          on:click={() => (form.localizacao = 'exterior')}
        >
          <div class="font-medium text-slate-900">Exterior</div>
          <div class="text-sm text-slate-500">
            Permite cadastro internacional sem exigir documento fiscal brasileiro.
          </div>
        </Button>
      </div>

      <div class="grid grid-cols-1 gap-6 md:grid-cols-2">
        <FieldInput
          id="forn-nome-completo"
          label="Nome completo"
          bind:value={form.nome_completo}
          placeholder="Razão social"
          class_name="w-full"
        />
        <FieldInput
          id="forn-fantasia"
          label="Nome fantasia"
          bind:value={form.nome_fantasia}
          placeholder="Nome comercial"
          class_name="w-full"
        />
        {#if form.localizacao === 'brasil'}
          <FieldInput
            id="forn-cnpj"
            label="CNPJ"
            bind:value={form.cnpj}
            placeholder="00.000.000/0000-00"
            class_name="w-full"
          />
          <FieldInput
            id="forn-cep"
            label="CEP"
            bind:value={form.cep}
            placeholder="00000-000"
            class_name="w-full"
          />
        {/if}
        {#if fornecedoresGeograficosAtivos && modoGeografico}
          <div>
            <SeletorDestinoGeografico
              fieldId="forn-cidade"
              label="Cidade"
              required
              idioma="pt"
              bind:destinoId={cidadeGeograficaId}
              bind:value={cidadeGeograficaTexto}
              bind:valid={cidadeGeograficaValida}
              on:edit={() => {
                form.cidade = '';
                form.estado = '';
              }}
              on:select={(event) => {
                form.cidade = event.detail.nome;
                form.estado = event.detail.referencia?.regiao || '';
              }}
            />
            {#if cidadeGeograficaId && !form.estado}
              <p class="mt-1 text-xs text-red-600" role="alert">
                O destino não possui estado ou região. Selecione outra localidade.
              </p>
            {/if}
            {#if cidadeLegada}
              <button
                type="button"
                class="mt-2 text-sm text-indigo-700 underline"
                on:click={() => {
                  modoGeografico = false;
                  cidadeGeograficaId = '';
                  cidadeGeograficaValida = false;
                  form.cidade = cidadeLegada?.cidade || '';
                  form.estado = cidadeLegada?.estado || '';
                }}>Manter cidade anterior</button
              >
            {/if}
          </div>
        {:else if fornecedoresGeograficosAtivos}
          <div>
            <FieldInput
              id="forn-cidade"
              label="Cidade"
              value={cidadeBusca}
              readonly
              class_name="w-full"
            />
            <p class="mt-1 text-xs text-slate-500">Cidade anterior sem identidade geográfica.</p>
            <button
              type="button"
              class="mt-2 text-sm text-indigo-700 underline"
              on:click={() => {
                cidadeGeograficaTexto = cidadeBusca;
                cidadeGeograficaValida = false;
                modoGeografico = true;
              }}>Selecionar cidade geográfica</button
            >
          </div>
        {:else}
          <div class="relative">
            <FieldInput
              id="forn-cidade"
              label="Cidade"
              value={cidadeBusca}
              placeholder="Buscar cidade..."
              class_name="w-full"
              on:input={(e) => handleCidadeInput((e.target as HTMLInputElement).value)}
              on:focus={() => (showCidadeOptions = true)}
              on:blur={() => setTimeout(() => (showCidadeOptions = false), 150)}
            />
            {#if showCidadeOptions}
              <div
                class="absolute z-10 mt-2 w-full rounded-xl border border-slate-200 bg-white p-2 shadow-lg"
              >
                {#if buscandoCidade}
                  <div class="px-3 py-2 text-sm text-slate-500">Buscando cidades...</div>
                {:else if erroCidadeBusca}
                  <div role="alert" class="px-3 py-2 text-sm text-red-500">{erroCidadeBusca}</div>
                {:else if resultadosCidade.length === 0}
                  <div class="px-3 py-2 text-sm text-slate-500">Nenhuma cidade encontrada.</div>
                {:else}
                  {#each resultadosCidade as cidade}
                    <Button
                      type="button"
                      variant="unstyled"
                      size="sm"
                      class_name="block w-full justify-start! rounded-lg px-3 py-2 text-left text-sm hover:bg-slate-50"
                      on:click={() => selectCidade(cidade)}
                    >
                      <div class="font-medium text-slate-900">{cidade.label || cidade.nome}</div>
                      {#if cidade.pais_nome}
                        <div class="text-xs text-slate-500">{cidade.pais_nome}</div>
                      {/if}
                    </Button>
                  {/each}
                {/if}
              </div>
            {/if}
          </div>
        {/if}
        <FieldInput
          id="forn-estado"
          label="Estado"
          bind:value={form.estado}
          placeholder="UF / região"
          readonly
          class_name="w-full"
        />
        <FieldInput
          id="forn-telefone"
          label="Telefone"
          value={form.telefone}
          class_name="w-full"
          on:input={(e) => {
            const t = e.target as HTMLInputElement;
            form.telefone = formatPhone(t.value);
          }}
        />
        <FieldInput
          id="forn-whatsapp"
          label="WhatsApp"
          value={form.whatsapp}
          class_name="w-full"
          on:input={(e) => {
            const t = e.target as HTMLInputElement;
            form.whatsapp = formatPhone(t.value);
          }}
        />
        <FieldInput
          id="forn-emergencia"
          label="Telefone emergência"
          value={form.telefone_emergencia}
          class_name="w-full"
          on:input={(e) => {
            const t = e.target as HTMLInputElement;
            form.telefone_emergencia = formatPhone(t.value);
          }}
        />
        <FieldInput
          id="forn-responsavel"
          label="Responsável"
          bind:value={form.responsavel}
          placeholder="Pessoa de contato"
          class_name="w-full"
        />
        <FieldSelect
          id="forn-faturamento"
          label="Tipo de faturamento"
          bind:value={form.tipo_faturamento}
          options={[
            { value: 'pre_pago', label: 'Pré-pago' },
            { value: 'semanal', label: 'Semanal' },
            { value: 'quinzenal', label: 'Quinzenal' },
            { value: 'mensal', label: 'Mensal' }
          ]}
          placeholder=""
          class_name="w-full"
        />
        <FieldCheckbox
          label="Fornecedor ativo"
          bind:checked={form.ativo}
          helper="Desative para retirar o fornecedor dos fluxos operacionais sem apagar o cadastro."
          color="financeiro"
          class_name="rounded-xl border border-slate-200 bg-slate-50 px-4 py-3"
        />
        <FieldTextarea
          id="forn-servicos"
          label="Principais serviços"
          bind:value={form.principais_servicos}
          rows={4}
          placeholder="Descreva serviços, especialidades, janelas de atendimento e observações relevantes"
          class_name="md:col-span-2 w-full"
        />
      </div>
    </Card>

    {#if !isCreateMode}
      <Card color="financeiro" class="mb-6">
        <div class="grid grid-cols-1 gap-6 md:grid-cols-2">
          <div>
            <h3 class="text-lg font-semibold text-slate-900">Produtos vinculados</h3>
            {#if produtosRelacionados.length === 0}
              <p class="mt-2 text-sm text-slate-500">Nenhum produto vinculado.</p>
            {:else}
              <div class="mt-3 space-y-2">
                {#each produtosRelacionados as produto}
                  <div class="rounded-lg border border-slate-200 p-3">
                    <div class="font-medium text-slate-900">{produto.nome}</div>
                    <div class="text-sm text-slate-500">
                      {produto.destino || 'Sem destino'} · {produto.ativo === false
                        ? 'Inativo'
                        : 'Ativo'}
                    </div>
                  </div>
                {/each}
              </div>
            {/if}
          </div>
          <div>
            <h3 class="text-lg font-semibold text-slate-900">Vouchers recentes</h3>
            {#if vouchersRelacionados.length === 0}
              <p class="mt-2 text-sm text-slate-500">Nenhum voucher recente.</p>
            {:else}
              <div class="mt-3 space-y-2">
                {#each vouchersRelacionados as voucher}
                  <div class="rounded-lg border border-slate-200 p-3">
                    <div class="font-medium text-slate-900">{voucher.codigo || voucher.id}</div>
                    <div class="text-sm text-slate-500">
                      {voucher.status || 'Sem status'}{voucher.data_utilizacao
                        ? ` · ${formatDate(voucher.data_utilizacao)}`
                        : ''}
                    </div>
                  </div>
                {/each}
              </div>
            {/if}
          </div>
        </div>
      </Card>
    {/if}

    <div class="flex flex-wrap items-center justify-between gap-3">
      <div class="flex gap-3">
        <Button variant="secondary" type="button" on:click={() => goto('/cadastros/fornecedores')}>
          <ArrowLeft size={18} class="mr-2" />
          Voltar
        </Button>
        {#if !isCreateMode}
          <Button variant="danger" type="button" on:click={() => (showDeleteDialog = true)}>
            <Trash2 size={18} class="mr-2" />
            Excluir
          </Button>
        {/if}
      </div>
      <Button variant="primary" color="financeiro" type="submit" loading={saving}>
        <Save size={18} class="mr-2" />
        Salvar fornecedor
      </Button>
    </div>
  </form>
{/if}

<Dialog
  bind:open={showDeleteDialog}
  title="Excluir fornecedor"
  size="sm"
  color="financeiro"
  showCancel={true}
  cancelText="Cancelar"
  showConfirm={true}
  confirmText={deleting ? 'Excluindo...' : 'Excluir'}
  onConfirm={handleDelete}
  onCancel={() => (showDeleteDialog = false)}
>
  <p class="text-slate-600">
    Tem certeza que deseja excluir este fornecedor? Se houver produtos vinculados, a exclusão será
    bloqueada.
  </p>
</Dialog>
