<script lang="ts">
  import { browser } from '$app/environment';
  import PageHeader from '$lib/components/ui/PageHeader.svelte';
  import Card from '$lib/components/ui/Card.svelte';
  import Button from '$lib/components/ui/Button.svelte';
  import LoadingState from '$lib/components/ui/LoadingState.svelte';
  import { browserData as dados } from '$lib/db/browserData';
  import { ApiError, apiFetch, isCanceledApiError } from '$lib/services/api';
  import { toUserMessage } from '$lib/utils/errors';
  import { createLoadGuard } from '$lib/utils/loadGuard';

  let sessionInfo = '';
  let sessionDetails = '';
  let running = false;
  let hasRun = false;
  const diagnosticsGuard = createLoadGuard();
  let apiTests: Array<{
    name: string;
    status: string;
    detail: string;
    time: number;
  }> = [];

  type DiagnosticApiResponse = {
    error?: string | null;
    items?: unknown[] | null;
  };

  async function runDiagnostics() {
    const request = diagnosticsGuard.next();
    running = true;
    hasRun = true;
    apiTests = [];

    // Test session
    const { data: sessionData, error: sessionError } = await dados.auth.getSession();

    if (sessionError) {
      sessionInfo = `Erro: ${sessionError.message}`;
    } else if (sessionData.session) {
      sessionInfo = `OK - Usuario: ${sessionData.session.user?.email || 'desconhecido'}`;
    } else {
      sessionInfo = 'Nenhuma sessao encontrada';
    }

    // Test APIs
    const apis = [
      '/api/v1/health',
      '/api/v1/relatorios/base',
      '/api/v1/relatorios/vendas',
      '/api/v1/financeiro/comissoes/calcular',
      '/api/v1/parametros/metas',
      '/api/v1/roteiros'
    ];

    for (const api of apis) {
      if (!diagnosticsGuard.isCurrent(request.seq)) return;
      const start = Date.now();
      try {
        const json = await apiFetch<DiagnosticApiResponse>(api, {
          redirectOnForbidden: false,
          redirectOnUnauthorized: false,
          signal: request.signal
        });
        if (!diagnosticsGuard.isCurrent(request.seq)) return;
        const time = Date.now() - start;
        let detail = '';

        if (json?.error) {
          detail = `Erro: ${json.error}`;
        } else if (json?.items !== undefined) {
          detail = `OK - ${json.items?.length || 0} itens`;
        } else {
          detail = 'OK';
        }

        apiTests = [
          ...apiTests,
          {
            name: api,
            status: 'OK',
            detail,
            time
          }
        ];
      } catch (err) {
        if (isCanceledApiError(err)) return;
        const isApiError = err instanceof ApiError;
        apiTests = [
          ...apiTests,
          {
            name: api,
            status: isApiError ? `Erro ${err.status}` : 'Falha',
            detail: toUserMessage(err, 'Falha ao executar diagnóstico.'),
            time: Date.now() - start
          }
        ];
      }
    }
    if (diagnosticsGuard.isCurrent(request.seq)) running = false;
  }
</script>

<svelte:head>
  <title>Diagnostico | VTUR</title>
</svelte:head>

<PageHeader
  title="Diagnostico de Sistema"
  subtitle="Verifique o status de conexao e APIs."
  color="financeiro"
/>

<div class="space-y-6">
  <Card header="Sessao do Usuario" color="financeiro">
    <div class="space-y-2">
      {#if sessionInfo}
        <p><strong>Status:</strong> {sessionInfo}</p>
      {:else if running}
        <LoadingState compact={true} />
      {:else}
        <p class="text-sm text-slate-500">
          Clique em "Executar Diagnostico" para validar a sessão.
        </p>
      {/if}
      {#if sessionDetails}
        <p class="text-sm text-slate-600">{sessionDetails}</p>
      {/if}
    </div>
  </Card>

  <Card header="Teste de APIs" color="financeiro">
    <table class="table-mobile-cards w-full text-sm">
      <thead>
        <tr class="border-b text-left">
          <th class="pb-2">API</th>
          <th class="pb-2">Status</th>
          <th class="pb-2">Detalhes</th>
          <th class="pb-2">Tempo</th>
        </tr>
      </thead>
      <tbody>
        {#each apiTests as test}
          <tr class="border-b border-slate-100">
            <td data-label="API" class="py-2 font-mono text-xs">{test.name}</td>
            <td data-label="Status" class="py-2">
              <span class:text-green-600={test.status === 'OK'}>
                {test.status}
              </span>
            </td>
            <td data-label="Detalhes" class="py-2 text-slate-600">{test.detail}</td>
            <td data-label="Tempo" class="py-2">{test.time}ms</td>
          </tr>
        {/each}
        {#if apiTests.length === 0}
          <tr>
            <td colspan="4" class="py-4 text-center text-slate-500">
              {hasRun
                ? 'Nenhum resultado disponível'
                : 'Clique em "Executar Diagnostico" para testar'}
            </td>
          </tr>
        {/if}
      </tbody>
    </table>

    <div class="mt-4">
      <Button color="financeiro" on:click={runDiagnostics} loading={running}>
        Executar Diagnostico
      </Button>
    </div>
  </Card>

  <Card header="Informacoes do Navegador" color="financeiro">
    <div class="space-y-2 text-sm">
      <p>
        <strong>User Agent:</strong>
        <span class="font-mono">{browser ? navigator.userAgent : 'Indisponivel no servidor'}</span>
      </p>
      <p>
        <strong>Cookies Habilitados:</strong>
        {browser && navigator.cookieEnabled ? 'Sim' : 'Nao'}
      </p>
    </div>
  </Card>
</div>
