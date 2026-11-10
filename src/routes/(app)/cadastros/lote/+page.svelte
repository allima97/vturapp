<script lang="ts">
  import { onMount } from 'svelte';
  import PageHeader from '$lib/components/ui/PageHeader.svelte';
  import Card from '$lib/components/ui/Card.svelte';
  import Button from '$lib/components/ui/Button.svelte';
  import { FieldSelect, FieldTextarea } from '$lib/components/ui';
  import { toast } from '$lib/stores/ui';
  import { toUserMessage } from '$lib/utils/errors';
  import { apiGet, apiPost, isCanceledApiError } from '$lib/services/api';
  import { createLoadGuard } from '$lib/utils/loadGuard';
  import { Upload, FileText, CheckCircle, AlertCircle, Download } from '$lib/icons';

  type TipoProduto = { id: string; nome: string };
  type TipoProdutosResponse = { items?: TipoProduto[] | null };
  type ImportacaoLoteResponse = {
    criados?: number;
    atualizados?: number;
    erros?: string[] | null;
  };

  let tipos: TipoProduto[] = [];
  let loading = false;
  let saving = false;
  let resultado: { criados: number; atualizados: number; erros: string[] } | null = null;

  // Formulário de lote
  let tipoId = '';
  let textoProdutos = '';
  const baseGuard = createLoadGuard();
  $: produtosNaLista = textoProdutos
    .split('\n')
    .reduce((total, linha) => total + (linha.trim() ? 1 : 0), 0);

  async function loadBase() {
    const request = baseGuard.next();
    try {
      const tiposPayload = await apiGet<TipoProdutosResponse>(
        '/api/v1/tipo-produtos',
        { all: 1 },
        request.signal
      );
      if (!baseGuard.isCurrent(request.seq)) return;
      tipos = tiposPayload.items || [];
    } catch (err) {
      if (isCanceledApiError(err)) return;
      toast.error(toUserMessage(err, 'Erro ao carregar dados base.'));
    }
  }

  async function importarLote() {
    if (!textoProdutos.trim()) {
      toast.error('Cole a lista de produtos.');
      return;
    }
    if (!tipoId) {
      toast.error('Selecione o tipo de produto.');
      return;
    }

    const linhas: string[] = [];
    for (const linha of textoProdutos.split('\n')) {
      const nome = linha.trim();
      if (nome) linhas.push(nome);
    }
    if (linhas.length === 0) {
      toast.error('Nenhuma linha válida encontrada.');
      return;
    }

    saving = true;
    resultado = null;

    try {
      const produtos = linhas.map((nome) => ({
        nome,
        tipo_produto_id: tipoId,
        cidade_id: null,
        todas_as_cidades: true,
        ativo: true
      }));

      const data = await apiPost<ImportacaoLoteResponse>('/api/v1/produtos', { produtos });

      resultado = {
        criados: data.criados || linhas.length,
        atualizados: data.atualizados || 0,
        erros: data.erros || []
      };

      toast.success(`${resultado.criados} produto(s) importado(s).`);
      textoProdutos = '';
    } catch (err) {
      toast.error(toUserMessage(err, 'Erro ao importar produtos.'));
    } finally {
      saving = false;
    }
  }

  function downloadTemplate() {
    const csv =
      'Nome do Produto\nPacote Europa Clássica\nHotel Copacabana Palace\nPassagem Aérea GRU-LIS';
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
    const link = document.createElement('a');
    link.href = URL.createObjectURL(blob);
    link.download = 'template_produtos.csv';
    link.click();
  }

  onMount(loadBase);
</script>

<svelte:head>
  <title>Importação em Lote | VTUR</title>
</svelte:head>

<PageHeader
  title="Importação em Lote"
  subtitle="Importe múltiplos produtos de uma vez colando a lista ou fazendo upload de arquivo."
  breadcrumbs={[{ label: 'Cadastros', href: '/cadastros' }, { label: 'Importação em Lote' }]}
/>

<div class="grid grid-cols-1 gap-6 lg:grid-cols-3">
  <div class="space-y-6 lg:col-span-2">
    <Card title="Configuração da importação">
      <FieldSelect
        id="lote-tipo"
        label="Tipo de produto"
        required={true}
        bind:value={tipoId}
        options={[...tipos.map((t) => ({ value: t.id, label: t.nome }))]}
        class_name="w-full"
      />
    </Card>

    <Card title="Lista de produtos">
      <p class="mb-3 text-sm text-slate-500">
        Cole um produto por linha. O nome será usado diretamente.
      </p>
      <FieldTextarea
        bind:value={textoProdutos}
        rows={12}
        class_name="w-full"
        monospace={true}
        placeholder="Pacote Europa Clássica&#10;Hotel Copacabana Palace&#10;Passagem Aérea GRU-LIS&#10;..."
      />
      <p class="mt-1 text-xs text-slate-500">
        {produtosNaLista} produto(s) na lista
      </p>
    </Card>

    <div class="flex justify-end gap-3">
      <Button variant="secondary" on:click={downloadTemplate}>
        <Download size={16} class="mr-2" />
        Baixar template
      </Button>
      <Button variant="secondary" loading={saving} on:click={importarLote}>
        <Upload size={16} class="mr-2" />
        Importar produtos
      </Button>
    </div>
  </div>

  <div class="space-y-6">
    <Card title="Instruções">
      <div class="space-y-3 text-sm text-slate-600">
        <p>1. Selecione o <strong>tipo de produto</strong> que será aplicado a todos os itens.</p>
        <p>
          2. Opcionalmente, selecione um <strong>estado/subdivisão</strong> para vincular os produtos
          a uma região.
        </p>
        <p>3. Cole a lista de produtos, <strong>um por linha</strong>.</p>
        <p>4. Clique em <strong>Importar produtos</strong>.</p>
        <p class="text-amber-700">Produtos com o mesmo nome já existentes serão ignorados.</p>
      </div>
    </Card>

    {#if resultado}
      <Card title="Resultado da importação">
        <div class="space-y-3">
          <div class="flex items-center gap-2 text-green-700">
            <CheckCircle size={18} />
            <span class="font-medium">{resultado.criados} criado(s)</span>
          </div>
          {#if resultado.atualizados > 0}
            <div class="flex items-center gap-2 text-blue-700">
              <CheckCircle size={18} />
              <span class="font-medium">{resultado.atualizados} atualizado(s)</span>
            </div>
          {/if}
          {#if resultado.erros.length > 0}
            <div class="space-y-1">
              <div class="flex items-center gap-2 text-red-700">
                <AlertCircle size={18} />
                <span class="font-medium">{resultado.erros.length} erro(s)</span>
              </div>
              {#each resultado.erros as erro}
                <p role="alert" class="ml-6 text-xs text-red-600">{erro}</p>
              {/each}
            </div>
          {/if}
        </div>
      </Card>
    {/if}
  </div>
</div>
