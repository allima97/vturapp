<!--
  Fase 5.4 (ficha completa do cliente): viagens do cliente.
  Usa a API existente /api/v1/viagens/cliente/:id (mesmo escopo de acesso e mesmo status da tela de Viagens).
  Sem acesso ao módulo Viagens (403), o quadro não aparece.
-->
<script lang="ts">
  import { onDestroy, onMount } from 'svelte';
  import Card from '$lib/components/ui/Card.svelte';
  import { apiFetch, ApiError, isCanceledApiError } from '$lib/services/api';
  import { formatDate } from '$lib/utils/formatters';
  import { formatViagemStatus, normalizeViagemStatus } from '$lib/viagens/status';
  import { toUserMessage } from '$lib/utils/errors';

  export let clienteId: string;
  export let collapsible = false;

  type ViagemCliente = {
    id: string;
    venda_id: string | null;
    origem: string;
    destino: string;
    data_inicio: string | null;
    data_fim: string | null;
    status: string;
  };

  const STATUS_CLASSES: Record<string, string> = {
    pendente: 'bg-slate-100 text-slate-700',
    confirmada: 'bg-blue-100 text-blue-700',
    em_viagem: 'bg-amber-100 text-amber-800',
    concluida: 'bg-emerald-100 text-emerald-700',
    cancelada: 'bg-red-100 text-red-700'
  };

  let viagens: ViagemCliente[] = [];
  let loading = true;
  export let semAcesso = false;
  let erro: string | null = null;
  const controller = new AbortController();

  onMount(async () => {
    try {
      const data = await apiFetch<{ items?: ViagemCliente[] }>(
        `/api/v1/viagens/cliente/${clienteId}`,
        {
          signal: controller.signal,
          // Sem acesso ao módulo Viagens: só esconde o quadro (sem mandar para a tela "acesso negado").
          redirectOnForbidden: false
        }
      );
      viagens = Array.isArray(data?.items) ? data.items : [];
    } catch (err) {
      if (isCanceledApiError(err)) return;
      if (err instanceof ApiError && err.status === 403) semAcesso = true;
      else erro = toUserMessage(err, 'Erro ao carregar viagens do cliente.');
    } finally {
      loading = false;
    }
  });

  onDestroy(() => controller.abort());
</script>

{#if !semAcesso}
  <Card title="Viagens" color="clientes" {collapsible}>
    {#if loading}
      <div class="space-y-2" aria-busy="true" aria-label="Carregando viagens">
        {#each [0, 1] as _}
          <div class="h-12 animate-pulse rounded-lg bg-slate-100"></div>
        {/each}
      </div>
    {:else if erro}
      <p role="alert" class="text-sm text-red-700">{erro}</p>
    {:else if viagens.length === 0}
      <div
        class="rounded-vtur-lg border border-dashed border-slate-300 bg-slate-50 px-5 py-8 text-center text-sm text-slate-500"
      >
        Nenhuma viagem vinculada a este cliente.
      </div>
    {:else}
      <ul class="divide-y divide-slate-200">
        {#each viagens as viagem (viagem.id)}
          {@const status = normalizeViagemStatus(viagem.status)}
          <li>
            <a
              href={`/operacao/viagens/${viagem.id}`}
              class="flex items-center justify-between gap-3 rounded-lg px-2 py-3 transition-colors hover:bg-slate-50 focus-visible:outline-2 focus-visible:outline-blue-500"
            >
              <span class="min-w-0">
                <span class="block truncate font-medium text-slate-900">{viagem.destino}</span>
                <span class="block text-xs text-slate-500">
                  {formatDate(viagem.data_inicio)}{viagem.data_fim
                    ? ` a ${formatDate(viagem.data_fim)}`
                    : ''}
                  {#if viagem.origem}
                    · saída de {viagem.origem}{/if}
                </span>
              </span>
              <span
                class={`shrink-0 rounded-full px-2.5 py-1 text-xs font-semibold ${STATUS_CLASSES[status]}`}
              >
                {formatViagemStatus(status)}
              </span>
            </a>
          </li>
        {/each}
      </ul>
    {/if}
  </Card>
{/if}
