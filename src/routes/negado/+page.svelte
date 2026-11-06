<script lang="ts">
  import { goto } from '$app/navigation';
  import { Button } from '$lib/components/ui';
</script>

<svelte:head>
  <title>Acesso negado | VTUR</title>
</svelte:head>

<div class="flex min-h-screen items-center justify-center bg-slate-50 px-4">
  <div class="w-full max-w-md text-center">
    <div class="mb-6 flex justify-center">
      <div class="flex h-20 w-20 items-center justify-center rounded-full bg-red-100">
        <svg
          xmlns="http://www.w3.org/2000/svg"
          class="h-10 w-10 text-red-500"
          fill="none"
          viewBox="0 0 24 24"
          stroke="currentColor"
        >
          <path
            stroke-linecap="round"
            stroke-linejoin="round"
            stroke-width="2"
            d="M12 9v2m0 4h.01M10.29 3.86L1.82 18a2 2 0 001.71 3h16.94a2 2 0 001.71-3L13.71 3.86a2 2 0 00-3.42 0z"
          />
        </svg>
      </div>
    </div>

    <h1 class="mb-2 text-2xl font-bold text-slate-900">Acesso negado</h1>
    <p class="mb-8 text-slate-500">
      Você não tem permissão para acessar esta página.<br />
      Entre em contato com o administrador do sistema.
    </p>

    <div class="flex flex-col justify-center gap-3 sm:flex-row">
      <Button variant="primary" color="orange" size="lg" on:click={() => goto('/dashboard')}>
        Ir para o início
      </Button>
      <Button variant="outline" size="lg" on:click={() => history.back()}>Voltar</Button>
    </div>
  </div>
</div>
