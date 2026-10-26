<script lang="ts">
  import { onMount } from "svelte";
  import { goto } from "$app/navigation";
  import { supabase } from "$lib/db/supabase";
  import { permissoes } from "$lib/stores/permissoes";
  import Button from "$lib/components/ui/Button.svelte";
  import Card from "$lib/components/ui/Card.svelte";
  import LoadingState from "$lib/components/ui/LoadingState.svelte";
  import FieldInput from "$lib/components/ui/form/FieldInput.svelte";
  import { toUserMessage } from "$lib/utils/errors";
  import { AlertCircle, KeyRound } from '$lib/icons';

  let codigo = "";
  let loading = true;
  let verificando = false;
  let error: string | null = null;
  let factorId = "";
  let nextPath = "/";

  type VerifiedTotpFactor = {
    id?: string | null;
    status?: string | null;
  };

  function normalizeNextPath(value: string | null) {
    const raw = String(value || "").trim();
    if (!raw) return "/";
    try {
      const parsed = new URL(raw, window.location.origin);
      if (parsed.origin !== window.location.origin) return "/";
      if (parsed.pathname.startsWith("/auth/")) return "/";
      return `${parsed.pathname}${parsed.search || ""}${parsed.hash || ""}`;
    } catch {
      return "/";
    }
  }

  onMount(async () => {
    try {
      const params = new URLSearchParams(window.location.search);
      nextPath = normalizeNextPath(params.get("next"));

      const { data: sessionData } = await supabase.auth.getSession();
      if (!sessionData?.session?.user) {
        goto("/auth/login");
        return;
      }

      // Verifica se já está em AAL2
      const { data: aalData } =
        await supabase.auth.mfa.getAuthenticatorAssuranceLevel();
      if (aalData?.currentLevel === "aal2") {
        goto(nextPath);
        return;
      }

      // Busca fatores TOTP verificados
      const { data: factorsData } = await supabase.auth.mfa.listFactors();
      const verifiedFactor = factorsData?.totp?.find(
        (f: VerifiedTotpFactor) => f.status === "verified",
      );

      if (!verifiedFactor) {
        // Sem fator 2FA configurado — verifica política
        const policyResp = await fetch("/api/v1/admin/auth/mfa-status");
        if (policyResp.ok) {
          const policy = (await policyResp.json()) as { required?: boolean };
          if (policy?.required) {
            goto(`/perfil?setup_2fa=1&next=${encodeURIComponent(nextPath)}`);
            return;
          }
        }
        // Sem 2FA obrigatório, redireciona direto
        goto(nextPath);
        return;
      }

      factorId = verifiedFactor.id;
    } catch (err: unknown) {
      error = toUserMessage(err, "Erro ao carregar verificação 2FA.");
    } finally {
      loading = false;
    }
  });

  function normalizeCodigo(value: string) {
    return value.replace(/\D/g, "").slice(0, 6);
  }

  async function verificar() {
    const code = normalizeCodigo(codigo);
    if (code.length !== 6) {
      error = "Informe o código de 6 dígitos.";
      return;
    }
    if (!factorId) {
      error = "Fator 2FA não encontrado.";
      return;
    }

    verificando = true;
    error = null;

    try {
      const { data: challengeData, error: challengeError } =
        await supabase.auth.mfa.challenge({ factorId });
      if (challengeError) throw challengeError;

      const { error: verifyError } = await supabase.auth.mfa.verify({
        factorId,
        challengeId: challengeData.id,
        code,
      });
      if (verifyError) throw verifyError;

      // Atualiza permissões e redireciona
      const supabaseClient = supabase;
      await permissoes.refresh(supabaseClient);
      goto(nextPath);
    } catch (err: unknown) {
      const msg = toUserMessage(err, "").toLowerCase();
      if (
        msg.includes("invalid") ||
        msg.includes("incorrect") ||
        msg.includes("expired")
      ) {
        error =
          "Código inválido ou expirado. Verifique o aplicativo autenticador.";
      } else {
        error = toUserMessage(err, "Erro ao verificar código.");
      }
      codigo = "";
    } finally {
      verificando = false;
    }
  }

  function handleKeydown(e: KeyboardEvent) {
    if (e.key === "Enter") verificar();
  }
</script>

<svelte:head>
  <title>Verificação em Duas Etapas | VTUR</title>
</svelte:head>

<div class="vtur-auth-shell min-h-screen flex items-center justify-center p-4">
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
      {#if loading}
        <LoadingState compact={true} />
      {:else}
        {#if error}
          <div
            class="mb-4 p-3 bg-red-50 border border-red-200 rounded-lg flex items-center gap-2 text-red-700 text-sm"
          >
            <AlertCircle size={18} />
            <span>{error}</span>
          </div>
        {/if}

        <div class="space-y-4">
          <FieldInput
            label="Código de verificação"
            bind:value={codigo}
            type="text"
            autocomplete="one-time-code"
            on:input={(e) => {
              codigo = normalizeCodigo(
                (e.currentTarget as HTMLInputElement).value,
              );
            }}
            on:keydown={handleKeydown}
            placeholder="000000"
            maxlength={6}
            disabled={verificando}
            icon={KeyRound}
            helper="Abra o aplicativo autenticador (Google Authenticator, Authy, etc.) e informe o código de 6 dígitos."
            class_name="[&_input]:text-center [&_input]:text-2xl [&_input]:tracking-widest [&_input]:font-mono"
          />

          <Button
            type="button"
            variant="primary"
            size="lg"
            loading={verificando}
            class_name="w-full justify-center mt-6"
            on:click={verificar}
          >
            Verificar
          </Button>
        </div>

        <div class="mt-6 text-center text-sm">
          <a href="/auth/login" class="text-slate-500 hover:text-slate-700">
            Voltar ao login
          </a>
        </div>
      {/if}
    </Card>
  </div>
</div>
