<script lang="ts">
  import { dev } from '$app/environment';
  import { onMount } from 'svelte';
  import { goto } from '$app/navigation';
  import PageHeader from '$lib/components/ui/PageHeader.svelte';
  import Card from '$lib/components/ui/Card.svelte';
  import Button from '$lib/components/ui/Button.svelte';
  import Dialog from '$lib/components/ui/Dialog.svelte';
  import {
    FieldCheckbox,
    FieldDatalistInput,
    FieldInput,
    FieldSelect,
    FieldTextarea,
    FieldToggle,
    LoadingState
  } from '$lib/components/ui';
  import { ArrowLeft, Plus, Save, Trash2 } from '$lib/icons';
  import { toast } from '$lib/stores/ui';
  import { toUserMessage } from '$lib/utils/errors';
  import { apiDelete, apiGet, apiPatch, apiPost, isCanceledApiError } from '$lib/services/api';
  import { createLoadGuard } from '$lib/utils/loadGuard';
  import CidadeGeograficaAutocomplete from '$lib/components/vendas/CidadeGeograficaAutocomplete.svelte';
  import { produtosGeograficosAtivos } from '$lib/config/destinosGeograficos';
  import { criarEstadoCidadeGeografica } from '$lib/features/vendas/cidadeGeograficaEstado';

  export let mode: 'produtos' | 'destinos' = 'produtos';
  export let produtoId: string | null = null;

  type Option = {
    id: string;
    nome?: string | null;
    tipo?: string | null;
    nome_fantasia?: string | null;
    nome_completo?: string | null;
    estado?: string | null;
    uf?: string | null;
    subdivisao_nome?: string | null;
    subdivisao?: { nome?: string | null; sigla?: string | null } | null;
  };

  type Tarifa = {
    id?: string;
    acomodacao: string;
    qte_pax: number;
    tipo: string;
    validade_de: string;
    validade_ate: string;
    valor_neto: number;
    padrao: 'Manual' | 'Padrao';
    margem: number | null;
    valor_venda: number;
    moeda: string;
    cambio: number;
    valor_em_reais: number;
  };

  type DestinoProdutoSugestao = {
    destino?: string | null;
    atracao_principal?: string | null;
    melhor_epoca?: string | null;
  };

  type ProdutoDetalhe = {
    nome?: string | null;
    destino?: string | null;
    cidade_id?: string | null;
    tipo_produto?: string | null;
    atracao_principal?: string | null;
    melhor_epoca?: string | null;
    duracao_sugerida?: string | null;
    nivel_preco?: string | null;
    imagem_url?: string | null;
    informacoes_importantes?: string | null;
    ativo?: boolean | null;
    fornecedor_id?: string | null;
    fornecedor?: {
      nome_fantasia?: string | null;
      nome_completo?: string | null;
    } | null;
    todas_as_cidades?: boolean | null;
    valor_neto?: number | string | null;
    margem?: number | string | null;
    valor_venda?: number | string | null;
    moeda?: string | null;
    cambio?: number | string | null;
    valor_em_reais?: number | string | null;
    tarifas?: Array<Partial<Tarifa>>;
  };

  type ProdutoSaveResponse = {
    data?: {
      id?: string | null;
      data?: { id?: string | null } | null;
      produto?: { id?: string | null } | null;
    } | null;
  };

  const initialForm = {
    nome: '',
    destino: '',
    cidade_id: '',
    tipo_produto: '',
    atracao_principal: '',
    melhor_epoca: '',
    duracao_sugerida: '',
    nivel_preco: '',
    imagem_url: '',
    informacoes_importantes: '',
    ativo: true,
    fornecedor_id: '',
    fornecedor_label: '',
    todas_as_cidades: false,
    valor_neto: 0,
    margem: 0,
    valor_venda: 0,
    moeda: 'USD',
    cambio: 1,
    valor_em_reais: 0
  };

  let loading = true;
  let saving = false;
  let deleting = false;
  let showDeleteDialog = false;
  let tipos: Option[] = [];
  let cidades: Option[] = [];
  let fornecedores: Option[] = [];
  let fornecedoresOptions: string[] = [];
  let destinosSugestoes: string[] = [];
  let atracoesSugestoes: string[] = [];
  let melhoresEpocasSugestoes: string[] = [];
  let form = { ...initialForm };
  let estadoCidade = criarEstadoCidadeGeografica();
  let tarifas: Tarifa[] = [];
  const loadGuard = createLoadGuard();

  $: isCreateMode = !produtoId;
  $: routeBase = mode === 'destinos' ? '/cadastros/destinos' : '/cadastros/produtos';
  $: pageTitle = isCreateMode
    ? mode === 'destinos'
      ? 'Novo destino'
      : 'Novo produto'
    : mode === 'destinos'
      ? 'Editar destino'
      : 'Editar produto';
  $: pageSubtitle = isCreateMode
    ? 'Cadastro operacional consumido por vendas, orçamentos e operação'
    : 'Atualize o cadastro operacional completo do registro';

  $: if (form.moeda === 'BRL') {
    form.cambio = 1;
    form.valor_em_reais = Number(form.valor_venda || 0);
  } else {
    form.valor_em_reais = Number(form.valor_venda || 0) * Number(form.cambio || 1);
  }

  async function loadBase(signal?: AbortSignal) {
    const data = await apiGet<{
      tipos?: Option[];
      cidades?: Option[];
      fornecedores?: Option[];
      destinosProdutos?: DestinoProdutoSugestao[];
    }>('/api/v1/produtos/base', { all: 1, page: 1, pageSize: 500 }, signal);
    tipos = data.tipos || [];
    cidades = data.cidades || [];
    fornecedores = data.fornecedores || [];
    fornecedoresOptions = fornecedores
      .map((fornecedor) => fornecedor.nome_fantasia || fornecedor.nome_completo || '')
      .filter(Boolean);

    const destinoSet = new Set<string>();
    const atracaoSet = new Set<string>();
    const melhorEpocaSet = new Set<string>();
    for (const item of data.destinosProdutos || []) {
      const destino = String(item?.destino || '').trim();
      const atracao = String(item?.atracao_principal || '').trim();
      const melhorEpoca = String(item?.melhor_epoca || '').trim();
      if (destino) destinoSet.add(destino);
      if (atracao) atracaoSet.add(atracao);
      if (melhorEpoca) melhorEpocaSet.add(melhorEpoca);
    }
    destinosSugestoes = Array.from(destinoSet);
    atracoesSugestoes = Array.from(atracaoSet);
    melhoresEpocasSugestoes = Array.from(melhorEpocaSet);
  }

  async function loadProduto(signal?: AbortSignal) {
    if (!produtoId) return;
    const data = await apiGet<ProdutoDetalhe>(`/api/v1/produtos/${produtoId}`, undefined, signal);
    const fornecedorLabel =
      data?.fornecedor?.nome_fantasia || data?.fornecedor?.nome_completo || '';
    form = {
      nome: data.nome || '',
      destino: data.destino || '',
      cidade_id: data.cidade_id || '',
      tipo_produto: data.tipo_produto || '',
      atracao_principal: data.atracao_principal || '',
      melhor_epoca: data.melhor_epoca || '',
      duracao_sugerida: data.duracao_sugerida || '',
      nivel_preco: data.nivel_preco || '',
      imagem_url: data.imagem_url || '',
      informacoes_importantes: data.informacoes_importantes || '',
      ativo: data.ativo !== false,
      fornecedor_id: data.fornecedor_id || '',
      fornecedor_label: fornecedorLabel,
      todas_as_cidades: data.todas_as_cidades === true,
      valor_neto: Number(data.valor_neto || 0),
      margem: data.margem == null ? 0 : Number(data.margem),
      valor_venda: Number(data.valor_venda || 0),
      moeda: data.moeda || 'USD',
      cambio: Number(data.cambio || 1),
      valor_em_reais: Number(data.valor_em_reais || 0)
    };
    tarifas = (data.tarifas || []).map((item) => ({
      id: item.id,
      acomodacao: item.acomodacao || '',
      qte_pax: Number(item.qte_pax || 0),
      tipo: item.tipo || '',
      validade_de: item.validade_de ? String(item.validade_de).slice(0, 10) : '',
      validade_ate: item.validade_ate ? String(item.validade_ate).slice(0, 10) : '',
      valor_neto: Number(item.valor_neto || 0),
      padrao: item.padrao === 'Manual' ? 'Manual' : 'Padrao',
      margem: item.margem == null ? null : Number(item.margem),
      valor_venda: Number(item.valor_venda || 0),
      moeda: item.moeda || 'USD',
      cambio: Number(item.cambio || 1),
      valor_em_reais: Number(item.valor_em_reais || 0)
    }));
  }

  onMount(async () => {
    const request = loadGuard.next();
    loading = true;
    try {
      await Promise.all([loadBase(request.signal), loadProduto(request.signal)]);
      if (!loadGuard.isCurrent(request.seq)) return;
    } catch (err) {
      if (isCanceledApiError(err)) return;
      if (dev) console.error(err);
      toast.error('Erro ao carregar cadastro de produto.');
      goto(routeBase);
    } finally {
      if (loadGuard.isCurrent(request.seq)) loading = false;
    }
  });

  function cidadeLabel(id: string) {
    const cidade = cidades.find((item) => item.id === id);
    if (!cidade) return '-';
    const estado =
      cidade.estado ||
      cidade.uf ||
      cidade.subdivisao_nome ||
      cidade.subdivisao?.sigla ||
      cidade.subdivisao?.nome ||
      '';
    return estado ? `${cidade.nome} (${estado})` : cidade.nome || '-';
  }

  function handleFornecedorInput(value: string) {
    form.fornecedor_label = value;
    const normalized = value.trim().toLowerCase();
    const selected = fornecedores.find((item) => {
      const label = (item.nome_fantasia || item.nome_completo || '').trim().toLowerCase();
      return label === normalized;
    });
    form.fornecedor_id = selected?.id || '';
  }

  function addTarifa() {
    tarifas = [
      ...tarifas,
      {
        acomodacao: '',
        qte_pax: 0,
        tipo: '',
        validade_de: '',
        validade_ate: '',
        valor_neto: 0,
        padrao: 'Padrao',
        margem: null,
        valor_venda: 0,
        moeda: form.moeda || 'USD',
        cambio: Number(form.cambio || 1),
        valor_em_reais: 0
      }
    ];
  }

  function removeTarifa(index: number) {
    tarifas = tarifas.filter((_item, current) => current !== index);
  }

  function updateTarifa(index: number, key: keyof Tarifa, value: Tarifa[keyof Tarifa]) {
    tarifas = tarifas.map((item, current) => {
      if (current !== index) return item;
      const next = { ...item, [key]: value };
      if (next.moeda === 'BRL') {
        next.cambio = 1;
        next.valor_em_reais = Number(next.valor_venda || 0);
      } else {
        next.valor_em_reais = Number(next.valor_venda || 0) * Number(next.cambio || 1);
      }
      return next;
    });
  }

  async function saveTarifas(savedId: string) {
    await apiPost('/api/v1/produtos/tarifas', {
      produto_id: savedId,
      tarifas
    });
  }

  async function handleSubmit() {
    if (!form.nome.trim()) return toast.error('Nome é obrigatório.');
    if (!form.destino.trim()) return toast.error('Destino é obrigatório.');
    if (!form.tipo_produto) return toast.error('Tipo de produto é obrigatório.');
    if (produtosGeograficosAtivos && !form.todas_as_cidades && estadoCidade.pendente)
      return toast.error('Selecione uma cidade da lista ou limpe o campo.');
    if (!form.todas_as_cidades && !form.cidade_id)
      return toast.error('Cidade é obrigatória para produtos por cidade.');

    saving = true;
    try {
      const payload = {
        ...form,
        cidade_id: form.todas_as_cidades ? null : form.cidade_id,
        fornecedor_id: form.fornecedor_id || null,
        margem: form.margem === 0 ? null : form.margem
      };

      const data = isCreateMode
        ? await apiPost<ProdutoSaveResponse>('/api/v1/produtos/create', payload)
        : await apiPatch<ProdutoSaveResponse>(`/api/v1/produtos/${produtoId}`, payload);

      const savedId = String(
        data?.data?.id ||
          data?.data?.data?.id ||
          data?.data?.produto?.id ||
          data?.data?.id ||
          produtoId ||
          ''
      );
      if (savedId) await saveTarifas(savedId);

      toast.success(
        isCreateMode ? 'Cadastro salvo com sucesso.' : 'Cadastro atualizado com sucesso.'
      );
      goto(routeBase);
    } catch (err: unknown) {
      if (dev) console.error(err);
      toast.error(toUserMessage(err, 'Erro ao salvar cadastro.'));
    } finally {
      saving = false;
    }
  }

  async function handleDelete() {
    if (!produtoId) return;
    deleting = true;
    try {
      await apiDelete(`/api/v1/produtos/${produtoId}`);
      toast.success('Registro excluído com sucesso.');
      goto(routeBase);
    } catch (err: unknown) {
      toast.error(toUserMessage(err, 'Erro ao excluir registro.'));
    } finally {
      deleting = false;
      showDeleteDialog = false;
    }
  }
</script>

<svelte:head>
  <title>{pageTitle} | VTUR</title>
</svelte:head>

<PageHeader
  title={pageTitle}
  subtitle={pageSubtitle}
  color="financeiro"
  breadcrumbs={[
    { label: 'Cadastros', href: '/cadastros' },
    { label: mode === 'destinos' ? 'Destinos' : 'Produtos', href: routeBase },
    { label: isCreateMode ? 'Novo' : 'Editar' }
  ]}
/>

{#if loading}
  <LoadingState />
{:else}
  <form on:submit|preventDefault={handleSubmit}>
    <Card color="financeiro" class="mb-6">
      <div class="grid grid-cols-1 gap-6 md:grid-cols-3">
        <FieldSelect
          id="produto-tipo"
          label="Tipo de produto"
          required={true}
          bind:value={form.tipo_produto}
          options={tipos.map((t) => ({ value: t.id, label: t.nome || t.tipo || '' }))}
          placeholder="Selecione uma opção"
          class_name="w-full"
        />
        <FieldDatalistInput
          id="produto-destino"
          label="Destino *"
          bind:value={form.destino}
          options={destinosSugestoes}
          placeholder="Ex: Disney, Gramado, Global"
          disabled={form.todas_as_cidades}
          class_name="w-full"
        />
        <FieldToggle
          label="Produto global"
          bind:checked={form.todas_as_cidades}
          helper={form.todas_as_cidades
            ? 'O cadastro fica disponível para qualquer cidade e usa destino global.'
            : 'Mantenha desligado para vincular o cadastro a uma cidade específica.'}
          color="financeiro"
          class_name="rounded-xl border border-slate-200 bg-slate-50 px-4 py-3"
          on:change={(event) => {
            form.todas_as_cidades = (event.target as HTMLInputElement).checked;
            if (form.todas_as_cidades) {
              form.cidade_id = '';
              form.destino = 'Global';
              estadoCidade = criarEstadoCidadeGeografica();
            }
          }}
        />

        <FieldInput
          id="produto-nome"
          label="Nome"
          required={true}
          bind:value={form.nome}
          placeholder="Ex: Passeio em Paris, Pacote Disney, Hotel em Gramado"
          class_name="md:col-span-2 w-full"
        />
        {#if produtosGeograficosAtivos && !form.todas_as_cidades}
          <CidadeGeograficaAutocomplete
            id="produto-cidade"
            bind:value={form.cidade_id}
            cities={cidades}
            estado={estadoCidade}
            urlBusca="/api/v1/produtos/cidades-geograficas"
            urlConsulta="/api/v1/produtos/cidades-geograficas"
            on:loaded={(event) => {
              const novas = event.detail.filter(
                (cidade) => !cidades.some((item) => item.id === cidade.id)
              );
              cidades = [...cidades, ...novas];
            }}
          />
        {:else}
          <FieldSelect
            id="produto-cidade"
            label="Cidade"
            bind:value={form.cidade_id}
            options={[
              { value: '', label: 'Selecione uma opção' },
              ...cidades.map((c) => ({ value: c.id, label: cidadeLabel(c.id) }))
            ]}
            placeholder=""
            disabled={form.todas_as_cidades}
            class_name="w-full"
          />
        {/if}

        <FieldDatalistInput
          id="produto-fornecedor"
          label="Fornecedor"
          bind:value={form.fornecedor_label}
          options={fornecedoresOptions}
          placeholder="Opcional"
          class_name="w-full"
          on:input={(event) => handleFornecedorInput((event.target as HTMLInputElement).value)}
        />
        <FieldDatalistInput
          id="produto-atracao"
          label="Atração principal"
          bind:value={form.atracao_principal}
          options={atracoesSugestoes}
          placeholder="Opcional"
          class_name="w-full"
        />
        <FieldDatalistInput
          id="produto-epoca"
          label="Melhor época"
          bind:value={form.melhor_epoca}
          options={melhoresEpocasSugestoes}
          placeholder="Opcional"
          class_name="w-full"
        />

        <FieldInput
          id="produto-duracao"
          label="Duração sugerida"
          bind:value={form.duracao_sugerida}
          placeholder="Ex: 5 dias / 4 noites"
          class_name="w-full"
        />
        <FieldSelect
          id="produto-nivel"
          label="Nível de preço"
          bind:value={form.nivel_preco}
          options={[
            { value: '', label: 'Selecione uma opção' },
            { value: 'Economico', label: 'Econômico' },
            { value: 'Intermediario', label: 'Intermediário' },
            { value: 'Variavel', label: 'Variável' },
            { value: 'Premium', label: 'Premium' },
            { value: 'Super Premium', label: 'Super Premium' }
          ]}
          placeholder=""
          class_name="w-full"
        />
        <FieldInput
          id="produto-imagem"
          label="Imagem"
          bind:value={form.imagem_url}
          placeholder="URL da imagem"
          class_name="w-full"
        />

        <FieldInput
          money
          id="produto-valor-neto"
          label="Valor líquido"
          type="number"
          step="0.01"
          bind:value={form.valor_neto}
          class_name="w-full"
        />
        <FieldInput
          id="produto-margem"
          label="Margem"
          type="number"
          step="0.01"
          bind:value={form.margem}
          class_name="w-full"
        />
        <FieldInput
          money
          id="produto-valor-venda"
          label="Valor de venda"
          type="number"
          step="0.01"
          bind:value={form.valor_venda}
          class_name="w-full"
        />
        <FieldSelect
          id="produto-moeda"
          label="Moeda"
          bind:value={form.moeda}
          options={[
            { value: 'BRL', label: 'BRL' },
            { value: 'USD', label: 'USD' },
            { value: 'EUR', label: 'EUR' }
          ]}
          placeholder=""
          class_name="w-full"
        />
        <FieldInput
          id="produto-cambio"
          label="Câmbio"
          type="number"
          step="0.0001"
          bind:value={form.cambio}
          disabled={form.moeda === 'BRL'}
          class_name="w-full"
        />
        <FieldInput
          money
          id="produto-valor-reais"
          label="Valor em reais"
          type="number"
          step="0.01"
          bind:value={form.valor_em_reais}
          disabled
          class_name="w-full"
        />

        <FieldTextarea
          id="produto-info"
          label="Informações importantes"
          bind:value={form.informacoes_importantes}
          rows={5}
          placeholder="Orientações operacionais, observações de venda, detalhes úteis para voucher e execução"
          class_name="md:col-span-3 w-full"
        />

        <FieldCheckbox
          label="Cadastro ativo"
          bind:checked={form.ativo}
          helper="Desative para esconder o cadastro dos fluxos sem perder o histórico."
          color="financeiro"
          class_name="rounded-xl border border-slate-200 bg-slate-50 px-4 py-3"
        />
        <div
          class="rounded-xl border border-slate-200 bg-slate-50 p-4 text-sm text-slate-600 md:col-span-2"
        >
          <p class="font-medium text-slate-900">Impacto operacional</p>
          <p class="mt-1">
            Este cadastro alimenta Vendas e listas base. Produtos globais aparecem para qualquer
            cidade; produtos por cidade dependem do vínculo em `cidade_id`.
          </p>
        </div>
      </div>
    </Card>

    <Card color="financeiro" class="mb-6">
      <div class="mb-4 flex items-center justify-between">
        <div>
          <h3 class="text-lg font-semibold text-slate-900">Tarifas</h3>
          <p class="text-sm text-slate-500">
            Use tarifas quando o produto exigir grade por acomodação, pax, período e moeda.
          </p>
        </div>
        <Button type="button" variant="secondary" on:click={addTarifa}>
          <Plus size={16} class="mr-2" />
          Adicionar tarifa
        </Button>
      </div>

      {#if tarifas.length === 0}
        <div
          class="rounded-xl border border-dashed border-slate-300 bg-slate-50 p-4 text-sm text-slate-500"
        >
          Nenhuma tarifa cadastrada. O produto pode funcionar apenas com os valores base acima.
        </div>
      {:else}
        <div class="space-y-4">
          {#each tarifas as tarifa, index}
            <div class="rounded-xl border border-slate-200 p-4">
              <div class="mb-4 flex items-center justify-between">
                <p class="font-medium text-slate-900">Tarifa {index + 1}</p>
                <Button
                  variant="ghost"
                  size="sm"
                  color="red"
                  class_name="text-slate-400 hover:bg-red-50 hover:text-red-600"
                  on:click={() => removeTarifa(index)}
                >
                  <Trash2 size={16} />
                </Button>
              </div>
              <div class="grid grid-cols-1 gap-4 md:grid-cols-4">
                <FieldInput
                  value={tarifa.acomodacao}
                  placeholder="Acomodação"
                  class_name="w-full"
                  on:input={(e) =>
                    updateTarifa(index, 'acomodacao', (e.target as HTMLInputElement).value)}
                />
                <FieldInput
                  value={tarifa.tipo}
                  placeholder="Tipo"
                  class_name="w-full"
                  on:input={(e) =>
                    updateTarifa(index, 'tipo', (e.target as HTMLInputElement).value)}
                />
                <FieldInput
                  type="number"
                  min="0"
                  value={tarifa.qte_pax}
                  placeholder="Qtd pax"
                  class_name="w-full"
                  on:input={(e) =>
                    updateTarifa(
                      index,
                      'qte_pax',
                      Number((e.target as HTMLInputElement).value || 0)
                    )}
                />
                <FieldSelect
                  value={tarifa.padrao}
                  options={[
                    { value: 'Padrao', label: 'Padrão' },
                    { value: 'Manual', label: 'Manual' }
                  ]}
                  placeholder={null}
                  class_name="w-full"
                  on:change={(e) =>
                    updateTarifa(index, 'padrao', (e.target as HTMLSelectElement).value)}
                />
                <FieldInput
                  type="date"
                  value={tarifa.validade_de}
                  class_name="w-full"
                  on:input={(e) =>
                    updateTarifa(index, 'validade_de', (e.target as HTMLInputElement).value)}
                />
                <FieldInput
                  type="date"
                  value={tarifa.validade_ate}
                  class_name="w-full"
                  on:input={(e) =>
                    updateTarifa(index, 'validade_ate', (e.target as HTMLInputElement).value)}
                />
                <FieldInput
                  money
                  type="number"
                  step="0.01"
                  value={tarifa.valor_neto}
                  placeholder="Valor líquido"
                  class_name="w-full"
                  on:moneyInput={(e) => updateTarifa(index, 'valor_neto', Number(e.detail || 0))}
                />
                <FieldInput
                  type="number"
                  step="0.01"
                  value={tarifa.margem ?? ''}
                  placeholder="Margem"
                  class_name="w-full"
                  on:input={(e) => {
                    const nextValue = (e.target as HTMLInputElement).value;
                    updateTarifa(index, 'margem', nextValue === '' ? null : Number(nextValue));
                  }}
                />
                <FieldInput
                  money
                  type="number"
                  step="0.01"
                  value={tarifa.valor_venda}
                  placeholder="Valor de venda"
                  class_name="w-full"
                  on:moneyInput={(e) => updateTarifa(index, 'valor_venda', Number(e.detail || 0))}
                />
                <FieldSelect
                  value={tarifa.moeda}
                  options={[
                    { value: 'BRL', label: 'BRL' },
                    { value: 'USD', label: 'USD' },
                    { value: 'EUR', label: 'EUR' }
                  ]}
                  placeholder={null}
                  class_name="w-full"
                  on:change={(e) =>
                    updateTarifa(index, 'moeda', (e.target as HTMLSelectElement).value)}
                />
                <FieldInput
                  type="number"
                  step="0.0001"
                  value={tarifa.cambio}
                  placeholder="Câmbio"
                  disabled={tarifa.moeda === 'BRL'}
                  class_name="w-full"
                  on:input={(e) =>
                    updateTarifa(
                      index,
                      'cambio',
                      Number((e.target as HTMLInputElement).value || 1)
                    )}
                />
                <FieldInput
                  money
                  type="number"
                  step="0.01"
                  value={tarifa.valor_em_reais}
                  placeholder="Valor em reais"
                  disabled={true}
                  class_name="w-full"
                />
              </div>
            </div>
          {/each}
        </div>
      {/if}
    </Card>

    <div class="flex flex-wrap items-center justify-between gap-3">
      <div class="flex gap-3">
        <Button variant="secondary" type="button" on:click={() => goto(routeBase)}>
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
        Salvar cadastro
      </Button>
    </div>
  </form>
{/if}

<Dialog
  bind:open={showDeleteDialog}
  title="Excluir cadastro"
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
    Tem certeza que deseja excluir este registro? Se houver vínculos com vendas, orçamentos ou
    operação, a exclusão pode ser bloqueada pelo banco.
  </p>
</Dialog>
