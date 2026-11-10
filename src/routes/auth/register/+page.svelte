<script lang="ts">
  import Card from '$lib/components/ui/Card.svelte';
  import { Lock } from '$lib/icons';
</script>

<svelte:head>
  <title>Cadastro por Convite | VTUR</title>
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
      <div class="py-4 text-center">
        <div
          class="mb-4 inline-flex h-12 w-12 items-center justify-center rounded-full bg-blue-100 text-blue-600"
        >
          <Lock size={24} />
        </div>
        <h3 class="mb-2 text-lg font-semibold text-slate-900">Cadastro por convite</h3>
        <p class="mb-4 text-sm text-slate-500">
          Por segurança, novas contas devem ser criadas por convite ou pelo administrador.
        </p>
        <a href="/auth/login" class="text-sm font-medium text-blue-600 hover:text-blue-700"
          >Voltar ao login</a
        >
      </div>
    </Card>
  </div>
</div>
