<script lang="ts">
  import PageHeader from '$lib/components/ui/PageHeader.svelte';
  import Card from '$lib/components/ui/Card.svelte';
  import Button from '$lib/components/ui/Button.svelte';
  import { FieldCheckbox, FieldToggle } from '$lib/components/ui';
  import { Bell, Save, Mail, MessageSquare, AlertTriangle } from '$lib/icons';
  import { toast } from '$lib/stores/ui';

  let saving = false;

  let notificacoes = {
    email: {
      ativo: true,
      novo_cliente: true,
      nova_venda: true,
      pagamento_confirmado: true,
      pagamento_atrasado: true,
      aniversario_cliente: false,
      relatorio_diario: false
    },
    sistema: {
      ativo: true,
      novo_orcamento: true,
      orcamento_aprovado: true,
      vencimento_voucher: true,
      tarefa_atrasada: true,
      meta_atingida: true
    },
    whatsapp: {
      ativo: false,
      novo_cliente: false,
      nova_venda: true,
      lembrete_viagem: true,
      feedback_pos_viagem: true
    }
  };

  async function handleSubmit() {
    saving = true;
    toast.success('Configurações de notificações salvas!');
    saving = false;
  }
</script>

<svelte:head>
  <title>Notificações | VTUR</title>
</svelte:head>

<PageHeader
  title="Notificações"
  subtitle="Configurar alertas e comunicações"
  color="financeiro"
  breadcrumbs={[{ label: 'Parâmetros', href: '/parametros' }, { label: 'Notificações' }]}
/>

<form on:submit|preventDefault={handleSubmit}>
  <!-- Email -->
  <Card header="Notificações por Email" color="financeiro" class="mb-6">
    <div class="mb-4 flex items-center justify-between border-b border-slate-100 pb-4">
      <div class="flex items-center gap-3">
        <div class="rounded-lg bg-blue-50 p-2">
          <Mail size={20} class="text-blue-600" />
        </div>
        <div>
          <p class="font-medium text-slate-900">Email</p>
          <p class="text-sm text-slate-500">Receber notificações por email</p>
        </div>
      </div>
      <FieldToggle
        label={null}
        ariaLabel="Notificações por email"
        bind:checked={notificacoes.email.ativo}
        color="financeiro"
        class_name="shrink-0"
      />
    </div>

    {#if notificacoes.email.ativo}
      <div class="grid grid-cols-1 gap-4 md:grid-cols-2">
        <FieldCheckbox
          label="Novo cliente cadastrado"
          bind:checked={notificacoes.email.novo_cliente}
          color="financeiro"
          class_name="rounded-lg border border-slate-200 p-3 hover:bg-slate-50"
        />
        <FieldCheckbox
          label="Nova venda realizada"
          bind:checked={notificacoes.email.nova_venda}
          color="financeiro"
          class_name="rounded-lg border border-slate-200 p-3 hover:bg-slate-50"
        />
        <FieldCheckbox
          label="Pagamento confirmado"
          bind:checked={notificacoes.email.pagamento_confirmado}
          color="financeiro"
          class_name="rounded-lg border border-slate-200 p-3 hover:bg-slate-50"
        />
        <FieldCheckbox
          label="Pagamento em atraso"
          bind:checked={notificacoes.email.pagamento_atrasado}
          color="financeiro"
          class_name="rounded-lg border border-slate-200 p-3 hover:bg-slate-50"
        />
        <FieldCheckbox
          label="Aniversário de cliente"
          bind:checked={notificacoes.email.aniversario_cliente}
          color="financeiro"
          class_name="rounded-lg border border-slate-200 p-3 hover:bg-slate-50"
        />
        <FieldCheckbox
          label="Relatório diário de vendas"
          bind:checked={notificacoes.email.relatorio_diario}
          color="financeiro"
          class_name="rounded-lg border border-slate-200 p-3 hover:bg-slate-50"
        />
      </div>
    {/if}
  </Card>

  <!-- Sistema -->
  <Card header="Notificações no Sistema" color="financeiro" class="mb-6">
    <div class="mb-4 flex items-center justify-between border-b border-slate-100 pb-4">
      <div class="flex items-center gap-3">
        <div class="bg-financeiro-50 rounded-lg p-2">
          <Bell size={20} class="text-financeiro-600" />
        </div>
        <div>
          <p class="font-medium text-slate-900">Sistema</p>
          <p class="text-sm text-slate-500">Notificações dentro da plataforma</p>
        </div>
      </div>
      <FieldToggle
        label={null}
        ariaLabel="Notificações no sistema"
        bind:checked={notificacoes.sistema.ativo}
        color="financeiro"
        class_name="shrink-0"
      />
    </div>

    {#if notificacoes.sistema.ativo}
      <div class="grid grid-cols-1 gap-4 md:grid-cols-2">
        <FieldCheckbox
          label="Novo orçamento"
          bind:checked={notificacoes.sistema.novo_orcamento}
          color="financeiro"
          class_name="rounded-lg border border-slate-200 p-3 hover:bg-slate-50"
        />
        <FieldCheckbox
          label="Orçamento aprovado"
          bind:checked={notificacoes.sistema.orcamento_aprovado}
          color="financeiro"
          class_name="rounded-lg border border-slate-200 p-3 hover:bg-slate-50"
        />
        <FieldCheckbox
          label="Voucher próximo do vencimento"
          bind:checked={notificacoes.sistema.vencimento_voucher}
          color="financeiro"
          class_name="rounded-lg border border-slate-200 p-3 hover:bg-slate-50"
        />
        <FieldCheckbox
          label="Tarefa atrasada"
          bind:checked={notificacoes.sistema.tarefa_atrasada}
          color="financeiro"
          class_name="rounded-lg border border-slate-200 p-3 hover:bg-slate-50"
        />
        <FieldCheckbox
          label="Meta de vendas atingida"
          bind:checked={notificacoes.sistema.meta_atingida}
          color="financeiro"
          class_name="rounded-lg border border-slate-200 p-3 hover:bg-slate-50"
        />
      </div>
    {/if}
  </Card>

  <!-- WhatsApp -->
  <Card header="Notificações WhatsApp" color="financeiro" class="mb-6">
    <div class="mb-4 flex items-center justify-between border-b border-slate-100 pb-4">
      <div class="flex items-center gap-3">
        <div class="rounded-lg bg-green-50 p-2">
          <MessageSquare size={20} class="text-green-600" />
        </div>
        <div>
          <p class="font-medium text-slate-900">WhatsApp</p>
          <p class="text-sm text-slate-500">Integração com WhatsApp Business API</p>
        </div>
      </div>
      <FieldToggle
        label={null}
        ariaLabel="Notificações por WhatsApp"
        bind:checked={notificacoes.whatsapp.ativo}
        color="green"
        class_name="shrink-0"
      />
    </div>

    {#if notificacoes.whatsapp.ativo}
      <div class="mb-4 rounded-lg border border-amber-200 bg-amber-50 p-4">
        <div class="flex items-start gap-3">
          <AlertTriangle size={20} class="mt-0.5 text-amber-600" />
          <div>
            <p class="text-sm font-medium text-amber-800">Configuração necessária</p>
            <p class="text-sm text-amber-700">
              Para enviar mensagens via WhatsApp, configure a integração na aba "Integrações".
            </p>
          </div>
        </div>
      </div>

      <div class="grid grid-cols-1 gap-4 md:grid-cols-2">
        <FieldCheckbox
          label="Boas-vindas novo cliente"
          bind:checked={notificacoes.whatsapp.novo_cliente}
          color="green"
          class_name="rounded-lg border border-slate-200 p-3 hover:bg-slate-50"
        />
        <FieldCheckbox
          label="Confirmação de venda"
          bind:checked={notificacoes.whatsapp.nova_venda}
          color="green"
          class_name="rounded-lg border border-slate-200 p-3 hover:bg-slate-50"
        />
        <FieldCheckbox
          label="Lembrete de viagem (D-1)"
          bind:checked={notificacoes.whatsapp.lembrete_viagem}
          color="green"
          class_name="rounded-lg border border-slate-200 p-3 hover:bg-slate-50"
        />
        <FieldCheckbox
          label="Pesquisa pós-viagem"
          bind:checked={notificacoes.whatsapp.feedback_pos_viagem}
          color="green"
          class_name="rounded-lg border border-slate-200 p-3 hover:bg-slate-50"
        />
      </div>
    {/if}
  </Card>

  <!-- Botões -->
  <div class="flex items-center justify-end gap-3">
    <Button variant="secondary" on:click={() => history.back()}>Cancelar</Button>
    <Button variant="primary" color="financeiro" type="submit" disabled={saving}>
      {#if saving}
        <span class="mr-2 animate-spin">⟳</span>
        Salvando...
      {:else}
        <Save size={18} class="mr-2" />
        Salvar Configurações
      {/if}
    </Button>
  </div>
</form>
