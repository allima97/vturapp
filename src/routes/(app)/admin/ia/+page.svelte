<script lang="ts">
  import { onMount } from 'svelte';
  import PageHeader from '$lib/components/ui/PageHeader.svelte';
  import Card from '$lib/components/ui/Card.svelte';
  import Button from '$lib/components/ui/Button.svelte';
  import LoadingState from '$lib/components/ui/LoadingState.svelte';
  import { toast } from '$lib/stores/ui';
  import { RefreshCw } from '$lib/icons';
  import { apiGet, apiPost, isCanceledApiError } from '$lib/services/api';
  import { toUserMessage } from '$lib/utils/errors';
  import { createLoadGuard } from '$lib/utils/loadGuard';

  type Modelo = {
    provedor: 'anthropic' | 'groq';
    id: string;
    nome: string;
    descricao: string;
    preco: { entrada: number; saida: number; leituraCache: number; gravacaoCache: number };
    chave_configurada: boolean;
  };
  type Resposta = {
    modelo: string;
    origem: 'painel' | 'variavel' | 'padrao';
    atualizado_em: string | null;
    modelos: Modelo[];
    reaproveitamento: {
      roteiros_guardados: number;
      geracoes_reaproveitadas: number;
      opcionais_na_biblioteca: number;
    } | null;
  };

  let loading = $state(true);
  let saving = $state(false);
  let dados: Resposta | null = $state(null);
  let escolhido = $state('');
  const loadGuard = createLoadGuard();

  // Estimativa de um roteiro típico (≈10 dias, 3 cidades): ~1.000 tokens de
  // instruções fixas em cache, ~600 de pedido e ~2.500 de resposta. No Groq,
  // o gpt-oss ainda gasta ~800 tokens de raciocínio (cobrados como saída).
  const CACHE = 1_000;
  const ENTRADA = 600;
  const SAIDA = 2_500;
  const RACIOCINIO_GROQ = 800;
  function custoPorMil(m: Modelo) {
    const saida = SAIDA + (m.provedor === 'groq' ? RACIOCINIO_GROQ : 0);
    const porRoteiro =
      (CACHE * m.preco.leituraCache + ENTRADA * m.preco.entrada + saida * m.preco.saida) / 1e6;
    return porRoteiro * 1000;
  }
  const usd = (v: number) =>
    v.toLocaleString('pt-BR', { style: 'currency', currency: 'USD', maximumFractionDigits: 2 });

  async function carregar() {
    const request = loadGuard.next();
    loading = true;
    try {
      const r = await apiGet<Resposta>('/api/v1/admin/ia', undefined, request.signal);
      if (!loadGuard.isCurrent(request.seq)) return;
      dados = r;
      escolhido = r.modelo;
    } catch (err) {
      if (isCanceledApiError(err)) return;
      toast.error(toUserMessage(err, 'Não foi possível carregar a configuração de IA.'));
    } finally {
      if (loadGuard.isCurrent(request.seq)) loading = false;
    }
  }

  async function salvar() {
    saving = true;
    try {
      await apiPost('/api/v1/admin/ia', { modelo: escolhido });
      toast.success('Modelo de IA atualizado. Vale para as próximas gerações (até 1 minuto).');
      await carregar();
    } catch (err) {
      toast.error(toUserMessage(err, 'Erro ao salvar a configuração de IA.'));
    } finally {
      saving = false;
    }
  }

  onMount(carregar);
</script>

<svelte:head>
  <title>IA dos roteiros | VTUR</title>
</svelte:head>

<PageHeader
  title="IA dos roteiros"
  subtitle="Escolha qual provedor e modelo geram os roteiros com IA (Claude ou Groq)."
  breadcrumbs={[{ label: 'Administracao', href: '/admin' }, { label: 'IA dos roteiros' }]}
  actions={[{ label: 'Atualizar', onClick: carregar, variant: 'secondary', icon: RefreshCw }]}
/>

{#if loading && !dados}
  <LoadingState />
{:else if dados}
  <div class="space-y-6">
    <Card color="financeiro" title="Modelo em uso">
      <fieldset class="space-y-3">
        <legend class="sr-only">Modelo de IA</legend>
        {#each dados.modelos as m (m.id)}
          <label
            class="flex cursor-pointer items-start gap-3 rounded-xl border p-4 {escolhido === m.id
              ? 'border-blue-400 bg-blue-50'
              : 'border-slate-200'} {m.chave_configurada ? '' : 'opacity-60'}"
          >
            <input
              type="radio"
              name="modelo-ia"
              value={m.id}
              bind:group={escolhido}
              disabled={!m.chave_configurada}
              class="mt-1"
            />
            <span class="flex-1">
              <span class="block font-semibold text-slate-800">
                {m.nome}
                {#if m.id === dados.modelo}<span class="ml-2 text-xs font-normal text-green-700"
                    >(em uso)</span
                  >{/if}
              </span>
              <span class="block text-sm text-slate-600">{m.descricao}</span>
              <span class="mt-1 block text-xs text-slate-500">
                US$ {m.preco.entrada} entrada · {m.preco.leituraCache} em cache · {m.preco.saida} saída
                (por milhão de tokens) · estimativa ≈ {usd(custoPorMil(m))} por 1.000 roteiros
              </span>
              {#if !m.chave_configurada}
                <span class="mt-1 block text-xs text-red-700">
                  Chave não configurada no servidor ({m.provedor === 'groq'
                    ? 'GROQ_API_KEY'
                    : 'ANTHROPIC_API_KEY'}).
                </span>
              {/if}
            </span>
          </label>
        {/each}
      </fieldset>
      <div class="mt-4 flex items-center justify-between gap-3">
        <p class="text-xs text-slate-500">
          {#if dados.origem === 'painel'}
            Escolhido neste painel{dados.atualizado_em
              ? ` em ${new Date(dados.atualizado_em).toLocaleString('pt-BR')}`
              : ''}.
          {:else if dados.origem === 'variavel'}
            Definido pela variável ROTEIRO_IA_MODELO do servidor (nenhuma escolha salva aqui).
          {:else}
            Padrão do sistema (nenhuma escolha salva aqui).
          {/if}
        </p>
        <Button
          type="button"
          variant="primary"
          loading={saving}
          disabled={saving || escolhido === dados.modelo}
          on:click={salvar}
        >
          Salvar
        </Button>
      </div>
    </Card>

    <Card color="financeiro" title="Economia automática">
      <ul class="list-disc space-y-1 pl-5 text-sm text-slate-700">
        <li>
          Prompt caching nos dois provedores: as instruções fixas vão sempre no início e são
          cobradas com desconto quando repetidas (Claude: 90%–95%; Groq: 50%).
        </li>
        <li>
          Pedido idêntico (mesmos destinos, duração, viajantes, perfil e observações) é
          reaproveitado sem chamar a IA, em qualquer data.
        </li>
        <li>
          Opcionais do catálogo e da biblioteca são escolhidos por código, sem reescrever texto.
        </li>
      </ul>
      {#if dados.reaproveitamento}
        <div class="mt-4 grid gap-3 sm:grid-cols-3">
          <div class="rounded-xl border border-slate-200 p-3">
            <div class="text-xs text-slate-500">Roteiros guardados</div>
            <div class="text-lg font-semibold">{dados.reaproveitamento.roteiros_guardados}</div>
          </div>
          <div class="rounded-xl border border-slate-200 p-3">
            <div class="text-xs text-slate-500">Gerações reaproveitadas (custo zero)</div>
            <div class="text-lg font-semibold">
              {dados.reaproveitamento.geracoes_reaproveitadas}
            </div>
          </div>
          <div class="rounded-xl border border-slate-200 p-3">
            <div class="text-xs text-slate-500">Opcionais na biblioteca</div>
            <div class="text-lg font-semibold">
              {dados.reaproveitamento.opcionais_na_biblioteca}
            </div>
          </div>
        </div>
      {/if}
    </Card>
  </div>
{/if}
