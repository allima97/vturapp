<script lang="ts">
  import { goto } from '$app/navigation';
  import { onMount } from 'svelte';
  import { authClient } from '$lib/auth-client';
  import { AlertMessage, Button, Card, FieldInput } from '$lib/components/ui';

  let email = '';
  let password = '';
  let busy = false;
  let error = '';

  onMount(async () => {
    const session = await authClient.getSession();
    if (session.data?.user) await goto('/reescrita/clientes');
  });

  async function entrar(event: SubmitEvent) {
    event.preventDefault();
    if (busy) return;
    busy = true;
    error = '';
    try {
      const result = await authClient.signIn.email({ email: email.trim(), password });
      if (result.error) {
        error = 'Não foi possível entrar. Confira o e-mail e a senha.';
      } else {
        await goto('/reescrita/clientes');
      }
    } catch {
      error = 'O serviço de autenticação está indisponível. Tente novamente.';
    } finally {
      busy = false;
    }
  }
</script>

<svelte:head>
  <title>Entrar na reescrita · VTUR</title>
  <meta name="robots" content="noindex, nofollow" />
</svelte:head>

<main class="reescrita-login">
  <Card padding="lg" class="reescrita-login-card">
    <form onsubmit={entrar}>
      <p class="reescrita-eyebrow">VTUR · NOVA APLICAÇÃO</p>
      <h1>Entrar na VTUR</h1>
      <p class="reescrita-login-intro">Acesse o ambiente novo com a conta criada para a reescrita.</p>

      {#if error}<AlertMessage variant="error" message={error} />{/if}

      <FieldInput id="reescrita-login-email" label="E-mail" type="email" autocomplete="username" bind:value={email} required />
      <FieldInput id="reescrita-login-password" label="Senha" type="password" autocomplete="current-password" bind:value={password} required class_name="mt-4" />

      <Button type="submit" variant="primary" loading={busy} class_name="mt-5 w-full">
        {busy ? 'Entrando…' : 'Entrar'}
      </Button>
      <a class="reescrita-legacy-link" href="/auth/login">Voltar ao aplicativo atual</a>
    </form>
  </Card>
</main>
