<script lang="ts">
  import { onMount } from 'svelte';
  import { goto } from '$app/navigation';
  import { browserData as dados } from '$lib/db/browserData';
  import Button from '$lib/components/ui/Button.svelte';
  import Card from '$lib/components/ui/Card.svelte';
  import FieldInput from '$lib/components/ui/form/FieldInput.svelte';
  import { toUserMessage } from '$lib/utils/errors';
  import { Lock, AlertCircle, CheckCircle, Eye, EyeOff } from '$lib/icons';

  let password = '';
  let confirmPassword = '';
  let showPassword = false;
  let showConfirm = false;
  let loading = false;
  let validating = true;
  let error: string | null = null;
  let success = false;
  let validLink = false;

  onMount(async () => {
    try {
      // Tenta trocar o code por sessão (fluxo PKCE)
      const url = new URL(window.location.href);
      const code = url.searchParams.get('code');

      if (code) {
        const { error: exchangeError } = await dados.auth.exchangeCodeForSession(code);
        if (exchangeError) throw exchangeError;
        // Limpa a URL
        url.searchParams.delete('code');
        window.history.replaceState({}, '', url.pathname);
        validLink = true;
      } else {
        // Tenta verificar sessão existente (fluxo hash)
        const hash = window.location.hash;
        if (hash) {
          const params = new URLSearchParams(hash.replace(/^#/, ''));
          const accessToken = params.get('access_token');
          const refreshToken = params.get('refresh_token');
          const type = params.get('type');

          if (type === 'recovery' && accessToken && refreshToken) {
            const { error: sessionError } = await dados.auth.setSession({
              access_token: accessToken,
              refresh_token: refreshToken
            });
            if (sessionError) throw sessionError;
            window.history.replaceState({}, '', window.location.pathname);
            validLink = true;
          }
        }

        if (!validLink) {
          const { data } = await dados.auth.getUser();
          validLink = Boolean(data?.user?.id);
        }
      }

      if (!validLink) {
        error = 'Link de recuperação inválido ou expirado. Solicite um novo.';
      }
    } catch (err: unknown) {
      error = toUserMessage(err, 'Link inválido ou expirado.');
    } finally {
      validating = false;
    }
  });

  async function handleSubmit() {
    if (!password) {
      error = 'Informe a nova senha.';
      return;
    }
    if (password.length < 8) {
      error = 'A senha deve ter pelo menos 8 caracteres.';
      return;
    }
    if (password !== confirmPassword) {
      error = 'As senhas não conferem.';
      return;
    }

    loading = true;
    error = null;

    try {
      const { error: updateError } = await dados.auth.updateUser({ password });
      if (updateError) throw updateError;
      success = true;
      setTimeout(() => goto('/auth/login'), 2500);
    } catch (err: unknown) {
      error = toUserMessage(err, 'Erro ao redefinir senha.');
    } finally {
      loading = false;
    }
  }
</script>

<svelte:head>
  <title>Nova Senha | VTUR</title>
</svelte:head>

<div class="vtur-auth-shell flex min-h-screen items-center justify-center p-4">
  <div class="w-full max-w-md">
    <div class="vtur-auth-brand">
      <div class="vtur-auth-brand-lockup">
        <div class="vtur-auth-brand-row">
          <img
            src="/brand/vtur-symbol.png?v=9"
            alt="VTUR"
            class="vtur-auth-brand-logo w-auto object-contain drop-shadow-[0_12px_24px_rgba(15,23,42,0.16)]"
          />
          <h1 class="vtur-auth-brand-title text-3xl font-bold">VTUR</h1>
        </div>
        <p class="vtur-auth-brand-subtitle">Sistema de Gestão de Viagens</p>
      </div>
    </div>

    <Card padding="lg">
      {#if validating}
        <div class="py-8 text-center text-slate-500">Validando link...</div>
      {:else if success}
        <div class="py-4 text-center">
          <div
            class="mb-4 inline-flex h-12 w-12 items-center justify-center rounded-full bg-green-100 text-green-600"
          >
            <CheckCircle size={24} />
          </div>
          <h3 class="mb-2 text-lg font-semibold text-slate-900">Senha redefinida!</h3>
          <p class="text-sm text-slate-500">Redirecionando para o login...</p>
        </div>
      {:else if !validLink}
        <div class="py-4 text-center">
          <div
            class="mb-4 inline-flex h-12 w-12 items-center justify-center rounded-full bg-red-100 text-red-600"
          >
            <AlertCircle size={24} />
          </div>
          <h3 class="mb-2 text-lg font-semibold text-slate-900">Link inválido</h3>
          <p class="mb-4 text-sm text-slate-500">{error}</p>
          <a
            href="/auth/recuperar-senha"
            class="text-sm font-medium text-blue-600 hover:text-blue-700"
          >
            Solicitar novo link
          </a>
        </div>
      {:else}
        {#if error}
          <div
            class="mb-4 flex items-center gap-2 rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-700"
          >
            <AlertCircle size={18} />
            <span>{error}</span>
          </div>
        {/if}

        <form on:submit|preventDefault={handleSubmit} class="space-y-4">
          <FieldInput
            label="Nova senha"
            bind:value={password}
            type={showPassword ? 'text' : 'password'}
            placeholder="Mínimo 6 caracteres"
            disabled={loading}
            icon={Lock}
            actionIcon={showPassword ? EyeOff : Eye}
            actionLabel={showPassword ? 'Ocultar senha' : 'Mostrar senha'}
            onAction={() => {
              showPassword = !showPassword;
            }}
          />

          <FieldInput
            label="Confirmar senha"
            bind:value={confirmPassword}
            type={showConfirm ? 'text' : 'password'}
            placeholder="Repita a senha"
            disabled={loading}
            icon={Lock}
            actionIcon={showConfirm ? EyeOff : Eye}
            actionLabel={showConfirm ? 'Ocultar senha' : 'Mostrar senha'}
            onAction={() => {
              showConfirm = !showConfirm;
            }}
          />

          <Button
            type="submit"
            variant="primary"
            size="lg"
            {loading}
            class_name="w-full justify-center"
          >
            Redefinir senha
          </Button>
        </form>
      {/if}
    </Card>
  </div>
</div>
