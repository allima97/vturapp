<script lang="ts">
  import { onMount } from 'svelte';
  import { goto } from '$app/navigation';
  import Button from '$lib/components/ui/Button.svelte';
  import Card from '$lib/components/ui/Card.svelte';
  import { toUserMessage } from '$lib/utils/errors';
  import { FieldInput } from '$lib/components/ui';
  import { Mail, Lock, User, AlertCircle, CheckCircle, Eye, EyeOff } from '$lib/icons';
  
  let email = '';
  let password = '';
  let confirmPassword = '';
  let nome = '';
  let token = '';
  let loading = false;
  let error: string | null = null;
  let success = false;
  let showPassword = false;
  let showConfirmPassword = false;

  onMount(() => {
    const params = new URLSearchParams(window.location.search);
    token = params.get('invite') || params.get('token') || token;
  });
  
  async function handleSubmit() {
    if (!email || !password || !nome || !token) {
      error = 'Preencha todos os campos';
      return;
    }

    if (password !== confirmPassword) {
      error = 'As senhas não conferem';
      return;
    }

    if (password.length < 8) {
      error = 'A senha deve ter pelo menos 8 caracteres';
      return;
    }

    loading = true;
    error = null;

    try {
      const response = await fetch('/api/auth/convite/activate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          invite_id: token,
          email,
          password,
          nome
        })
      });

      const payload = (await response.json().catch(() => ({}))) as { error?: string };
      if (!response.ok) throw new Error(payload.error || 'Erro ao ativar conta');

      success = true;

      // Redirecionar após 2 segundos
      setTimeout(() => {
        goto('/auth/login');
      }, 2000);

    } catch (err: unknown) {
      error = toUserMessage(err, 'Erro ao ativar conta');
    } finally {
      loading = false;
    }
  }
</script>

<svelte:head>
  <title>Ativar Conta | VTUR</title>
</svelte:head>

<div class="vtur-auth-shell min-h-screen flex items-center justify-center p-4">
  <div class="w-full max-w-md">
    <!-- Logo -->
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
          <h3 class="text-lg font-semibold text-slate-900 mb-2">Conta ativada!</h3>
          <p class="text-slate-500">Redirecionando para o login...</p>
        </div>
      {:else}
        <h2 class="text-xl font-semibold text-slate-900 mb-6 text-center">
          Dados do Convite
        </h2>
        
        {#if error}
          <div class="mb-4 p-3 bg-red-50 border border-red-200 rounded-lg flex items-center gap-2 text-red-700 text-sm">
            <AlertCircle size={18} />
            <span>{error}</span>
          </div>
        {/if}
        
        <form on:submit|preventDefault={handleSubmit} class="space-y-4">
          <!-- Token -->
          <FieldInput
            id="token"
            label="Código do Convite"
            type="text"
            bind:value={token}
            placeholder="Cole o código do convite"
            disabled={loading}
            class_name="w-full"
          />
          
          <!-- Nome -->
          <FieldInput
            id="nome"
            label="Nome Completo"
            type="text"
            bind:value={nome}
            placeholder="Seu nome"
            icon={User}
            autocomplete="name"
            disabled={loading}
            class_name="w-full"
          />
          
          <!-- Email -->
          <FieldInput
            id="email"
            label="Email"
            type="email"
            bind:value={email}
            placeholder="seu@email.com"
            icon={Mail}
            autocomplete="email"
            disabled={loading}
            class_name="w-full"
          />
          
          <!-- Senha -->
          <FieldInput
            id="password"
            label="Senha"
            type={showPassword ? 'text' : 'password'}
            bind:value={password}
            placeholder="Mínimo 8 caracteres"
            icon={Lock}
            actionIcon={showPassword ? EyeOff : Eye}
            actionLabel={showPassword ? 'Ocultar senha' : 'Mostrar senha'}
            onAction={() => (showPassword = !showPassword)}
            autocomplete="new-password"
            disabled={loading}
            class_name="w-full"
          />
          
          <!-- Confirmar Senha -->
          <FieldInput
            id="confirmPassword"
            label="Confirmar Senha"
            type={showConfirmPassword ? 'text' : 'password'}
            bind:value={confirmPassword}
            placeholder="Digite a senha novamente"
            icon={Lock}
            actionIcon={showConfirmPassword ? EyeOff : Eye}
            actionLabel={showConfirmPassword ? 'Ocultar confirmação de senha' : 'Mostrar confirmação de senha'}
            onAction={() => (showConfirmPassword = !showConfirmPassword)}
            autocomplete="new-password"
            disabled={loading}
            class_name="w-full"
          />
          
          <!-- Botão -->
          <Button
            type="submit"
            variant="primary"
            size="lg"
            loading={loading}
            class_name="w-full justify-center"
          >
            Ativar Conta
          </Button>
        </form>
      {/if}
      
      <!-- Voltar -->
      <div class="mt-6 text-center text-sm">
        <span class="text-slate-500">Já tem conta?</span>
        <a href="/auth/login" class="ml-1 text-blue-600 hover:text-blue-700 font-medium">
          Fazer login
        </a>
      </div>
    </Card>
  </div>
</div>
