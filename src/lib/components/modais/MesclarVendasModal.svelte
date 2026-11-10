<script lang="ts">
  import {
    Merge,
    CheckCircle,
    Loader2,
    Calendar,
    MapPin,
    Receipt,
    DollarSign,
    Search
  } from '$lib/icons';
  import AlertMessage from '$lib/components/ui/AlertMessage.svelte';
  import Button from '$lib/components/ui/Button.svelte';
  import Dialog from '$lib/components/ui/Dialog.svelte';
  import FieldInput from '$lib/components/ui/form/FieldInput.svelte';
  import { toast } from '$lib/stores/ui';
  import { apiGet, apiPost, isCanceledApiError } from '$lib/services/api';
  import { toUserMessage } from '$lib/utils/errors';
  import { createLoadGuard } from '$lib/utils/loadGuard';

  // ─── Props ─────────────────────────────────────────────────────────────────
  export let open = false;
  export let vendaId: string = '';
  export let vendaCodigo: string = '';
  export let onClose: () => void = () => {};
  export let onMerged: () => void = () => {};

  // ─── Estado ────────────────────────────────────────────────────────────────
  interface Candidato {
    id: string;
    cliente_nome: string;
    destino_nome: string;
    destino_cidade_nome: string;
    data_venda: string | null;
    data_embarque: string | null;
    data_final: string | null;
    valor_total: number | null;
    numero_recibo_principal: string | null;
    numeros_recibo: string[];
  }

  let candidatos: Candidato[] = [];
  let selecionados = new Set<string>();
  let loading = false;
  let mesclando = false;
  let erro: string | null = null;
  let filtro = '';
  let confirmando = false;
  let lastLoadKey = '';
  const loadGuard = createLoadGuard();
  const BRL_CURRENCY_FORMATTER = new Intl.NumberFormat('pt-BR', {
    style: 'currency',
    currency: 'BRL'
  });

  // ─── Derivados ─────────────────────────────────────────────────────────────
  $: filtroNormalizado = filtro.trim().toLowerCase();
  $: candidatosFiltrados = candidatos.filter((c) => {
    if (!filtroNormalizado) return true;
    return (
      c.destino_nome?.toLowerCase().includes(filtroNormalizado) ||
      c.destino_cidade_nome?.toLowerCase().includes(filtroNormalizado) ||
      c.numero_recibo_principal?.toLowerCase().includes(filtroNormalizado) ||
      c.numeros_recibo?.some((n) => n.toLowerCase().includes(filtroNormalizado))
    );
  });

  $: totalSelecionados = selecionados.size;
  $: podeMesclar = totalSelecionados > 0 && !mesclando;

  // ─── Helpers ───────────────────────────────────────────────────────────────
  function fmt(v: number | null) {
    return BRL_CURRENCY_FORMATTER.format(v || 0);
  }

  function fmtDate(d: string | null) {
    if (!d) return '—';
    const [y, m, day] = d.split('-');
    return `${day}/${m}/${y}`;
  }

  function toggleSelecionado(id: string) {
    const novo = new Set(selecionados);
    if (novo.has(id)) {
      novo.delete(id);
    } else {
      novo.add(id);
    }
    selecionados = novo;
  }

  // ─── Carregar candidatos ───────────────────────────────────────────────────
  async function carregarCandidatos() {
    if (!vendaId) return;
    const loadKey = `${open}:${vendaId}`;
    if (loadKey === lastLoadKey && candidatos.length > 0) return;
    lastLoadKey = loadKey;
    const request = loadGuard.next();
    loading = true;
    erro = null;
    candidatos = [];
    selecionados = new Set();
    confirmando = false;
    filtro = '';
    try {
      const data = await apiGet<{ items?: Candidato[] }>(
        '/api/v1/vendas/merge-candidates',
        { venda_id: vendaId },
        request.signal
      );
      if (!loadGuard.isCurrent(request.seq)) return;
      candidatos = data.items || [];
    } catch (e: unknown) {
      if (isCanceledApiError(e)) return;
      erro = toUserMessage(e, 'Erro ao carregar vendas do cliente.');
    } finally {
      if (loadGuard.isCurrent(request.seq)) loading = false;
    }
  }

  // ─── Mesclar ───────────────────────────────────────────────────────────────
  async function executarMescla() {
    if (!podeMesclar) return;
    mesclando = true;
    erro = null;
    try {
      const result = await apiPost<{ removed_pagamentos?: number }>('/api/v1/vendas/merge', {
        venda_id: vendaId,
        merge_ids: Array.from(selecionados)
      });
      const removedPagamentos = Number(result.removed_pagamentos || 0);
      toast.success(
        `Vendas mescladas com sucesso! ${removedPagamentos > 0 ? `${removedPagamentos} pagamento(s) duplicado(s) removido(s).` : ''}`
      );
      onMerged();
      fechar();
    } catch (e: unknown) {
      erro = toUserMessage(e, 'Erro ao mesclar vendas.');
      confirmando = false;
    } finally {
      mesclando = false;
    }
  }

  function fechar() {
    if (mesclando) return;
    selecionados = new Set();
    candidatos = [];
    erro = null;
    confirmando = false;
    filtro = '';
    lastLoadKey = '';
    loadGuard.abort();
    onClose();
  }

  // ─── Lifecycle ─────────────────────────────────────────────────────────────
  $: if (open && vendaId) carregarCandidatos();
</script>

<Dialog
  bind:open
  title="Mesclar Vendas"
  description={`Venda principal: ${vendaCodigo || vendaId.slice(0, 8).toUpperCase()}`}
  color="vendas"
  size="lg"
  showCancel={false}
  dismissable={!mesclando}
  onclose={fechar}
>
  <div class="space-y-4">
    <AlertMessage variant="warning" title="Ação irreversível">
      <p class="m-0">
        As vendas selecionadas serão <strong>absorvidas</strong> pela venda principal. Seus recibos e
        pagamentos serão migrados e as vendas secundárias excluídas.
      </p>
    </AlertMessage>

    {#if loading}
      <div class="flex items-center justify-center gap-3 py-12 text-slate-500">
        <Loader2 size={20} class="animate-spin" />
        <span class="text-sm">Buscando outras vendas do cliente...</span>
      </div>
    {:else if erro}
      <AlertMessage variant="error" message={erro} />
    {:else if candidatos.length === 0}
      <div class="flex flex-col items-center justify-center gap-3 py-12 text-slate-400">
        <CheckCircle size={32} class="text-slate-300" />
        <div class="text-center">
          <p class="text-sm font-medium text-slate-600">Nenhuma venda encontrada</p>
          <p class="mt-1 text-xs text-slate-400">
            Não há outras vendas do mesmo cliente e vendedor para mesclar.
          </p>
        </div>
      </div>
    {:else}
      <!-- Filtro e contador -->
      <div class="vtur-modal-grid-compact flex items-center gap-3">
        <FieldInput
          icon={Search}
          bind:value={filtro}
          placeholder="Filtrar por destino ou recibo..."
          class_name="flex-1"
        />
        <span class="text-xs whitespace-nowrap text-slate-500">
          {candidatos.length} venda{candidatos.length !== 1 ? 's' : ''} disponível{candidatos.length !==
          1
            ? 'is'
            : ''}
        </span>
      </div>

      <!-- Lista de candidatos -->
      <div class="space-y-2">
        {#each candidatosFiltrados as c (c.id)}
          {@const sel = selecionados.has(c.id)}
          <Button
            type="button"
            variant="unstyled"
            on:click={() => toggleSelecionado(c.id)}
            class_name="vtur-modal-list-item !block w-full rounded-xl border-2 px-4 py-3 text-left transition-all
                  {sel
              ? 'border-vendas-400 bg-vendas-50 shadow-xs'
              : 'border-slate-200 bg-white hover:border-slate-300 hover:bg-slate-50'}"
          >
            <div class="flex items-start justify-between gap-3">
              <!-- Checkbox visual -->
              <div
                class="mt-0.5 flex h-4 w-4 shrink-0 items-center justify-center rounded border-2 transition-colors
                    {sel ? 'bg-vendas-500 border-vendas-500' : 'border-slate-300 bg-white'}"
              >
                {#if sel}
                  <svg class="h-2.5 w-2.5 text-white" fill="none" viewBox="0 0 10 8">
                    <path
                      d="M1 4l3 3 5-6"
                      stroke="currentColor"
                      stroke-width="1.8"
                      stroke-linecap="round"
                      stroke-linejoin="round"
                    />
                  </svg>
                {/if}
              </div>

              <!-- Dados da venda -->
              <div class="min-w-0 flex-1">
                <div class="flex flex-wrap items-center gap-2">
                  {#if c.numeros_recibo.length > 0}
                    {#each c.numeros_recibo as nr}
                      <span
                        class="inline-flex items-center gap-1 rounded-full bg-slate-100 px-2 py-0.5 text-xs font-semibold text-slate-600"
                      >
                        <Receipt size={10} />
                        {nr}
                      </span>
                    {/each}
                  {:else}
                    <span class="text-xs text-slate-400 italic">Sem recibo</span>
                  {/if}
                </div>

                <div class="mt-1.5 grid grid-cols-2 gap-x-4 gap-y-1">
                  {#if c.destino_nome || c.destino_cidade_nome}
                    <div class="flex items-center gap-1.5 text-xs text-slate-600">
                      <MapPin size={11} class="shrink-0 text-slate-400" />
                      <span class="truncate">{c.destino_nome || c.destino_cidade_nome}</span>
                    </div>
                  {/if}
                  {#if c.data_embarque}
                    <div class="flex items-center gap-1.5 text-xs text-slate-600">
                      <Calendar size={11} class="shrink-0 text-slate-400" />
                      <span
                        >{fmtDate(c.data_embarque)}{c.data_final
                          ? ` → ${fmtDate(c.data_final)}`
                          : ''}</span
                      >
                    </div>
                  {/if}
                  {#if c.data_venda}
                    <div class="flex items-center gap-1.5 text-xs text-slate-500">
                      <span class="text-slate-400">Lançada:</span>
                      <span>{fmtDate(c.data_venda)}</span>
                    </div>
                  {/if}
                  {#if c.valor_total}
                    <div class="flex items-center gap-1.5 text-xs text-slate-600">
                      <DollarSign size={11} class="shrink-0 text-slate-400" />
                      <span class="font-medium">{fmt(c.valor_total)}</span>
                    </div>
                  {/if}
                </div>
              </div>
            </div>
          </Button>
        {/each}

        {#if candidatosFiltrados.length === 0 && filtro}
          <p class="py-4 text-center text-sm text-slate-400">
            Nenhuma venda corresponde ao filtro.
          </p>
        {/if}
      </div>
    {/if}

    <!-- Footer -->
    <div class="border-t border-slate-100 pt-4">
      {#if confirmando}
        <!-- Passo de confirmação -->
        <div class="vtur-modal-notice mb-3 rounded-lg border border-red-200 bg-red-50 px-4 py-3">
          <p class="mb-1 text-sm font-semibold text-red-800">Confirmar mesclagem?</p>
          <p class="text-xs text-red-700">
            {totalSelecionados} venda{totalSelecionados !== 1 ? 's' : ''} será{totalSelecionados !==
            1
              ? 'ão'
              : ''} mesclada{totalSelecionados !== 1 ? 's' : ''} na venda principal e excluída{totalSelecionados !==
            1
              ? 's'
              : ''} permanentemente.
          </p>
        </div>
        <div class="flex justify-end gap-2">
          <Button variant="secondary" on:click={() => (confirmando = false)} disabled={mesclando}>
            Cancelar
          </Button>
          <Button variant="primary" color="vendas" on:click={executarMescla} disabled={mesclando}>
            {#if mesclando}
              <Loader2 size={15} class="mr-1.5 animate-spin" />
              Mesclando...
            {:else}
              <Merge size={15} class="mr-1.5" />
              Confirmar Mesclagem
            {/if}
          </Button>
        </div>
      {:else}
        <div class="flex items-center justify-between gap-3">
          <span class="text-sm text-slate-500">
            {#if totalSelecionados > 0}
              <span class="text-vendas-700 font-semibold">{totalSelecionados}</span>
              venda{totalSelecionados !== 1 ? 's' : ''} selecionada{totalSelecionados !== 1
                ? 's'
                : ''}
            {:else}
              Selecione ao menos uma venda para mesclar
            {/if}
          </span>
          <div class="flex gap-2">
            <Button variant="secondary" on:click={fechar}>Cancelar</Button>
            <Button
              variant="primary"
              color="vendas"
              disabled={!podeMesclar}
              on:click={() => (confirmando = true)}
            >
              <Merge size={15} class="mr-1.5" />
              Mesclar vendas
            </Button>
          </div>
        </div>
      {/if}
    </div>
  </div>
</Dialog>
