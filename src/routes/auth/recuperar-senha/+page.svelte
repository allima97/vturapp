<script lang="ts">
  import { supabase } from '$lib/db/supabase';
  import { env as publicEnv } from '$env/dynamic/public';
  import Button from '$lib/components/ui/Button.svelte';
  import Card from '$lib/components/ui/Card.svelte';
  import TurnstileWidget from '$lib/components/auth/TurnstileWidget.svelte';
  import FieldInput from '$lib/components/ui/form/FieldInput.svelte';
  import { toUserMessage } from '$lib/utils/errors';
  import { Mail, AlertCircle, CheckCircle, ArrowLeft } from '$lib/icons';

  let email = '';
  let loading = false;
  let error: string | null = null;
  let success = false;
  let cooldown = 0;
  let cooldownTimer: ReturnType<typeof setInterval> | null = null;
  let turnstileToken = '';
  let turnstileWidget: { reset?: () => void } | null = null;

  $: turnstileEnabled = Boolean(String(publicEnv.PUBLIC_TURNSTILE_SITE_KEY || '').trim());

  function startCooldown(seconds: number) {
    cooldown = seconds;
    if (cooldownTimer) clearInterval(cooldownTimer);
    cooldownTimer = setInterval(() => {
      cooldown = Math.max(0, cooldown - 1);
      if (cooldown === 0 && cooldownTimer) {
        clearInterval(cooldownTimer);
        cooldownTimer = null;
        error = null;
      }
    }, 1000);
  }

  async function handleSubmit() {
    if (!email.trim()) { error = 'Informe seu e-mail.'; return; }
    if (cooldown > 0) return;
    if (turnstileEnabled && !turnstileToken) {
      error = 'Confirme a verificação de segurança para continuar.';
      return;
    }

    loading = true;
    error = null;

    try {
      if (turnstileEnabled) {
        const verifyRes = await fetch('/api/auth/turnstile/verify', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ turnstile_token: turnstileToken })
        });
        const verifyPayload = (await verifyRes.json().catch(() => ({}))) as { error?: string };
        if (!verifyRes.ok) {
          throw new Error(verifyPayload.error || 'Não foi possível validar o desafio de segurança.');
        }
      }

      const { error: authError } = await supabase.auth.resetPasswordForEmail(email.trim(), {
        redirectTo: `${window.location.origin}/auth/nova-senha`
      });

      if (authError) {
        const msg = authError.message || '';
        const match = msg.match(/(\d+)\s*second/i);
        if (match) {
          startCooldown(Number(match[1]));
          error = `Muitas solicitações. Aguarde ${match[1]} segundos.`;
        } else {
          error = 'Erro ao enviar e-mail. Verifique o endereço e tente novamente.';
        }
        if (turnstileEnabled) {
          turnstileWidget?.reset?.();
        }
        return;
      }

      success = true;
    } catch (err) {
      error = toUserMessage(err, 'Erro inesperado. Tente novamente.');
      if (turnstileEnabled) {
        turnstileWidget?.reset?.();
      }
    } finally {
      loading = false;
    }
  }
</script>

<svelte:head>
  <title>Recuperar Senha | VTUR</title>
</svelte:head>

<div class="vtur-auth-shell min-h-screen flex items-center justify-center p-4">
  <div class="w-full max-w-md">
    <div class="vtur-auth-brand">
      <div class="vtur-auth-brand-lockup">
        <div class="vtur-auth-brand-row">
          <img src="/brand/vtur-symbol.png?v=9" alt="VTUR" class="vtur-auth-brand-logo w-auto object-contain drop-shadow-[0_12px_24px_rgba(15,23,42,0.16)]" />
          <h1 class="vtur-auth-brand-title text-3xl font-bold">VTUR</h1>
        </div>
        <p class="vtur-auth-brand-subtitle">Sistema de Gestão de Viagens</p>
      </div>
    </div>

    <Card padding="lg">
      {#if success}
        <div class="text-center py-4">
          <div class="inline-flex items-center justify-center w-12 h-12 rounded-full bg-green-100 text-green-600 mb-4">
            <CheckCircle size={24} />
          </div>
          <h3 class="text-lg font-semibold text-slate-900 mb-2">E-mail enviado!</h3>
          <p class="text-slate-500 text-sm">Verifique sua caixa de entrada e clique no link para redefinir sua senha.</p>
          <a href="/auth/login" class="mt-4 inline-flex items-center gap-2 text-sm text-blue-600 hover:text-blue-700 font-medium">
            <ArrowLeft size={16} />
            Voltar ao login
          </a>
        </div>
      {:else}
        {#if error}
          <div class="mb-4 p-3 bg-red-50 border border-red-200 rounded-lg flex items-center gap-2 text-red-700 text-sm">
            <AlertCircle size={18} />
            <span>{error}</span>
          </div>
        {/if}

        <form on:submit|preventDefault={handleSubmit} class="space-y-4">
          <FieldInput
            label="E-mail"
            bind:value={email}
            type="email"
            placeholder="seu@email.com"
            disabled={loading}
            autocomplete="email"
            icon={Mail}
          />

          <TurnstileWidget
            bind:this={turnstileWidget}
            bind:token={turnstileToken}
            disabled={loading || cooldown > 0}
            action="password_reset"
          />

          <Button type="submit" variant="primary" size="lg" loading={loading || cooldown > 0} class_name="w-full justify-center">
            {cooldown > 0 ? `Aguarde ${cooldown}s...` : 'Enviar link de recuperação'}
          </Button>
        </form>

        <div class="mt-6 text-center text-sm">
          <a href="/auth/login" class="inline-flex items-center gap-1 text-slate-500 hover:text-slate-700">
            <ArrowLeft size={14} />
            Voltar ao login
          </a>
        </div>
      {/if}
    </Card>
  </div>
</div>
