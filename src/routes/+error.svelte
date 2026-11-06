<script lang="ts">
  import { page } from '$app/stores';
  import Button from '$lib/components/ui/Button.svelte';
  import { Home, AlertTriangle, ArrowLeft } from '$lib/icons';

  $: status = $page.status;
  $: message = $page.error?.message || 'Ocorreu um erro inesperado';
</script>

<svelte:head>
  <title>Erro {status} | VTUR</title>
</svelte:head>

<div
  class="flex min-h-screen items-center justify-center bg-gradient-to-br from-slate-50 to-slate-100 p-4"
>
  <div class="w-full max-w-md text-center">
    <!-- Ícone de erro -->
    <div
      class="mb-6 inline-flex h-20 w-20 items-center justify-center rounded-2xl bg-red-100 text-red-600"
    >
      <AlertTriangle size={40} />
    </div>

    <!-- Código de erro -->
    <h1 class="mb-2 text-6xl font-bold text-slate-900">{status}</h1>

    <!-- Mensagem -->
    <p class="mb-2 text-xl text-slate-600">
      {#if status === 404}
        Página não encontrada
      {:else if status === 500}
        Erro interno do servidor
      {:else}
        Ocorreu um erro
      {/if}
    </p>

    <p class="mb-8 text-slate-500">{message}</p>

    <!-- Ações -->
    <div class="flex flex-col justify-center gap-3 sm:flex-row">
      <Button href="/" color="clientes">
        <Home size={18} class="mr-2" />
        Ir para o Dashboard
      </Button>

      <Button href="javascript:history.back()" variant="secondary">
        <ArrowLeft size={18} class="mr-2" />
        Voltar
      </Button>
    </div>

    <!-- Footer -->
    <p class="mt-8 text-sm text-slate-400">
      © {new Date().getFullYear()} VTUR. Sistema de Gestão de Viagens.
    </p>
  </div>
</div>
