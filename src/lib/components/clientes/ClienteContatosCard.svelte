<!--
  Fase 5.4 (ficha completa do cliente): últimos contatos enviados pelo sistema (avisos).
  Usa a API existente /api/v1/clientes/avisos/history (a mesma do envio de avisos; últimos 10).
-->
<script lang="ts">
  import { onDestroy, onMount } from 'svelte';
  import Card from '$lib/components/ui/Card.svelte';
  import { apiFetch, ApiError, isCanceledApiError } from '$lib/services/api';
  import { toUserMessage } from '$lib/utils/errors';

  export let clienteId: string;
  /** Muda quando um aviso novo é enviado pela própria ficha, para recarregar a lista. */
  export let versao = 0;

  type AvisoHistorico = {
    id: string;
    canal: string | null;
    assunto: string | null;
    mensagem: string | null;
    status: string | null;
    destinatario: string | null;
    created_at: string | null;
  };

  const DATA_HORA = new Intl.DateTimeFormat('pt-BR', { dateStyle: 'short', timeStyle: 'short' });
  const CANAIS: Record<string, string> = { whatsapp: 'WhatsApp', email: 'E-mail', sms: 'SMS' };

  let itens: AvisoHistorico[] = [];
  let loading = true;
  let semAcesso = false;
  let erro: string | null = null;
  let controller: AbortController | null = null;
  let carregado = -1;

  function formatarData(value: string | null) {
    if (!value) return '-';
    const data = new Date(value);
    return Number.isNaN(data.getTime()) ? '-' : DATA_HORA.format(data);
  }

  function canalLabel(canal: string | null) {
    const key = String(canal || '').toLowerCase();
    return CANAIS[key] || canal || 'Aviso';
  }

  async function carregar(recarregando = false) {
    controller?.abort();
    const atual = new AbortController();
    controller = atual;
    loading = true;
    erro = null;
    try {
      const data = await apiFetch<{ items?: AvisoHistorico[] }>('/api/v1/clientes/avisos/history', {
        query: { cliente_id: clienteId },
        signal: atual.signal,
        // Depois de enviar um aviso, busca de novo (sem o cache curto das leituras).
        noCache: recarregando,
        redirectOnForbidden: false
      });
      itens = Array.isArray(data?.items) ? data.items : [];
    } catch (err) {
      if (isCanceledApiError(err)) return;
      if (err instanceof ApiError && err.status === 403) semAcesso = true;
      else erro = toUserMessage(err, 'Erro ao carregar contatos do cliente.');
    } finally {
      if (controller === atual) loading = false;
    }
  }

  onMount(() => {
    carregado = versao;
    void carregar();
  });

  $: if (carregado !== -1 && versao !== carregado) {
    carregado = versao;
    void carregar(true);
  }

  onDestroy(() => controller?.abort());
</script>

{#if !semAcesso}
  <Card
    title="Contatos enviados"
    subtitle="Últimos avisos enviados pelo sistema a este cliente."
    color="clientes"
  >
    {#if loading && itens.length === 0}
      <div class="space-y-2" aria-busy="true" aria-label="Carregando contatos">
        {#each [0, 1] as _}
          <div class="h-12 animate-pulse rounded-lg bg-slate-100"></div>
        {/each}
      </div>
    {:else if erro}
      <p role="alert" class="text-sm text-red-700">{erro}</p>
    {:else if itens.length === 0}
      <div
        class="rounded-vtur-lg border border-dashed border-slate-300 bg-slate-50 px-5 py-8 text-center text-sm text-slate-500"
      >
        Nenhum aviso enviado a este cliente.
      </div>
    {:else}
      <ul class="divide-y divide-slate-200">
        {#each itens as item (item.id)}
          <li class="py-3">
            <div class="flex flex-wrap items-center justify-between gap-2">
              <span class="text-sm font-medium text-slate-900"
                >{canalLabel(item.canal)}{item.assunto ? ` · ${item.assunto}` : ''}</span
              >
              <span class="text-xs text-slate-500">{formatarData(item.created_at)}</span>
            </div>
            {#if item.mensagem}
              <p class="mt-1 line-clamp-2 text-sm text-slate-600">{item.mensagem}</p>
            {/if}
            {#if item.status || item.destinatario}
              <p class="mt-1 text-xs text-slate-500">
                {[item.status, item.destinatario].filter(Boolean).join(' · ')}
              </p>
            {/if}
          </li>
        {/each}
      </ul>
    {/if}
  </Card>
{/if}
