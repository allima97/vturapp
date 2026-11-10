<script lang="ts">
  import { onMount } from 'svelte';
  import PageHeader from '$lib/components/ui/PageHeader.svelte';
  import Card from '$lib/components/ui/Card.svelte';
  import Button from '$lib/components/ui/Button.svelte';
  import { FieldInput, FieldCheckbox } from '$lib/components/ui';
  import { toast } from '$lib/stores/ui';
  import { Send, RefreshCw } from '$lib/icons';
  import { apiFetch, apiGet, apiPost, isCanceledApiError } from '$lib/services/api';
  import { toUserMessage } from '$lib/utils/errors';
  import { createLoadGuard } from '$lib/utils/loadGuard';

  type EmailSettings = {
    smtp_host?: string | null;
    smtp_port?: number | string | null;
    smtp_secure?: boolean | null;
    smtp_user?: string | null;
    smtp_pass?: string | null;
    resend_api_key?: string | null;
    alerta_from_email?: string | null;
    admin_from_email?: string | null;
    avisos_from_email?: string | null;
    financeiro_from_email?: string | null;
    suporte_from_email?: string | null;
  };

  let loading = true;
  let saving = false;
  let sendingTest = false;
  let testEmail = '';
  const loadGuard = createLoadGuard();
  let form = {
    smtp_host: '',
    smtp_port: '465',
    smtp_secure: true,
    smtp_user: '',
    smtp_pass: '',
    resend_api_key: '',
    alerta_from_email: '',
    admin_from_email: '',
    avisos_from_email: '',
    financeiro_from_email: '',
    suporte_from_email: ''
  };

  async function loadPage() {
    const request = loadGuard.next();
    loading = true;
    try {
      const payload = await apiGet<{ settings: EmailSettings }>(
        '/api/v1/admin/email',
        undefined,
        request.signal
      );
      if (!loadGuard.isCurrent(request.seq)) return;
      form = {
        smtp_host: payload.settings.smtp_host || '',
        smtp_port: String(payload.settings.smtp_port || '465'),
        smtp_secure: payload.settings.smtp_secure !== false,
        smtp_user: payload.settings.smtp_user || '',
        smtp_pass: payload.settings.smtp_pass || '',
        resend_api_key: payload.settings.resend_api_key || '',
        alerta_from_email: payload.settings.alerta_from_email || '',
        admin_from_email: payload.settings.admin_from_email || '',
        avisos_from_email: payload.settings.avisos_from_email || '',
        financeiro_from_email: payload.settings.financeiro_from_email || '',
        suporte_from_email: payload.settings.suporte_from_email || ''
      };
    } catch (err) {
      if (isCanceledApiError(err)) return;
      toast.error(toUserMessage(err, 'Nao foi possivel carregar as configuracoes de e-mail.'));
    } finally {
      if (loadGuard.isCurrent(request.seq)) loading = false;
    }
  }

  async function saveEmailSettings() {
    saving = true;
    try {
      await apiPost('/api/v1/admin/email', {
        ...form,
        smtp_port: Number(form.smtp_port)
      });
      toast.success('Configuracoes de e-mail salvas.');
    } catch (err) {
      toast.error(toUserMessage(err, 'Erro ao salvar configuracoes.'));
    } finally {
      saving = false;
    }
  }

  async function sendTestEmail() {
    sendingTest = true;
    try {
      await apiFetch('/api/v1/admin/email/test', {
        method: 'POST',
        timeoutMs: 60_000,
        body: {
          to: testEmail || form.admin_from_email || form.avisos_from_email,
          ...form,
          smtp_port: Number(form.smtp_port)
        }
      });
      toast.success('E-mail de teste enviado com sucesso.');
    } catch (err) {
      toast.error(toUserMessage(err, 'Erro ao enviar teste.'));
    } finally {
      sendingTest = false;
    }
  }

  onMount(loadPage);
</script>

<svelte:head>
  <title>E-mail | VTUR</title>
</svelte:head>

<PageHeader
  title="E-mail"
  subtitle="Configuracoes globais de envio para administracao, avisos, suporte e financeiro."
  breadcrumbs={[{ label: 'Administracao', href: '/admin' }, { label: 'E-mail' }]}
  actions={[{ label: 'Atualizar', onClick: loadPage, variant: 'secondary', icon: RefreshCw }]}
/>

<div class="space-y-6">
  <Card color="financeiro" title="Envio principal">
    <div class="grid gap-4 md:grid-cols-2">
      <FieldInput
        id="resend-key"
        label="Resend API key"
        type="password"
        bind:value={form.resend_api_key}
        class_name="md:col-span-2 w-full"
      />
      <FieldInput
        id="smtp-host"
        label="SMTP host"
        bind:value={form.smtp_host}
        class_name="w-full"
      />
      <FieldInput
        id="smtp-port"
        label="SMTP port"
        bind:value={form.smtp_port}
        class_name="w-full"
      />
      <FieldInput
        id="smtp-user"
        label="SMTP user"
        bind:value={form.smtp_user}
        class_name="w-full"
      />
      <FieldInput
        id="smtp-pass"
        label="SMTP password"
        type="password"
        bind:value={form.smtp_pass}
        class_name="w-full"
      />
      <FieldCheckbox
        label="SMTP seguro"
        bind:checked={form.smtp_secure}
        helper="Ativa TLS/SSL quando houver fallback SMTP."
        class_name="rounded-xl border border-slate-200 p-4"
      />
    </div>
  </Card>

  <Card color="financeiro" title="Remetentes por area">
    <div class="grid gap-4 md:grid-cols-2">
      <FieldInput
        id="from-alerta"
        label="Alerta"
        bind:value={form.alerta_from_email}
        class_name="w-full"
      />
      <FieldInput
        id="from-admin"
        label="Admin"
        bind:value={form.admin_from_email}
        class_name="w-full"
      />
      <FieldInput
        id="from-avisos"
        label="Avisos"
        bind:value={form.avisos_from_email}
        class_name="w-full"
      />
      <FieldInput
        id="from-financeiro"
        label="Financeiro"
        bind:value={form.financeiro_from_email}
        class_name="w-full"
      />
      <FieldInput
        id="from-suporte"
        label="Suporte"
        bind:value={form.suporte_from_email}
        class_name="w-full"
      />
    </div>
  </Card>

  <Card color="financeiro" title="Validacao">
    <div class="grid gap-4 md:grid-cols-[minmax(0,1fr)_auto]">
      <FieldInput
        id="test-email"
        label="Destino do teste"
        bind:value={testEmail}
        placeholder="email@empresa.com"
        class_name="w-full"
      />
      <div class="md:self-end">
        <Button variant="outline" on:click={sendTestEmail} loading={sendingTest}>
          <Send size={16} class="mr-2" />
          Enviar teste
        </Button>
      </div>
    </div>
  </Card>

  <div class="flex flex-wrap gap-3">
    <Button variant="primary" color="financeiro" on:click={saveEmailSettings} loading={saving}>
      Salvar configuracoes
    </Button>
  </div>
</div>
