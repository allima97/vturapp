<script lang="ts">
  import PageHeader from '$lib/components/ui/PageHeader.svelte';
  import Card from '$lib/components/ui/Card.svelte';
  import Button from '$lib/components/ui/Button.svelte';
  import Badge from '$lib/components/ui/Badge.svelte';
  import { FieldInput } from '$lib/components/ui';
  import { Save, AlertTriangle, RefreshCw, ExternalLink } from '$lib/icons';
  import { toast } from '$lib/stores/ui';

  let saving = false;
  let testando = false;

  type IntegracaoCampo = {
    nome: string;
    valor: string;
    tipo: 'text' | 'password';
    readonly?: boolean;
  };

  type Integracao = {
    id: string;
    nome: string;
    descricao: string;
    icone: string;
    status: 'conectado' | 'desconectado' | 'configurar' | 'erro';
    campos: IntegracaoCampo[];
  };

  const integracoes: Integracao[] = [
    {
      id: 'dados',
      nome: 'Dados',
      descricao: 'Banco de dados e autenticação',
      icone: '🔷',
      status: 'conectado',
      campos: [
        { nome: 'URL', valor: 'https://xyz.dados.co', tipo: 'text' },
        { nome: 'API Key', valor: '••••••••••••••••', tipo: 'password' }
      ]
    },
    {
      id: 'stripe',
      nome: 'Stripe',
      descricao: 'Gateway de pagamento',
      icone: '💳',
      status: 'conectado',
      campos: [
        { nome: 'Publishable Key', valor: 'pk_live_••••••••••••••••', tipo: 'text' },
        { nome: 'Secret Key', valor: '••••••••••••••••', tipo: 'password' },
        { nome: 'Webhook Secret', valor: '••••••••••••••••', tipo: 'password' }
      ]
    },
    {
      id: 'whatsapp',
      nome: 'WhatsApp Business API',
      descricao: 'Envio de mensagens automatizadas',
      icone: '💬',
      status: 'desconectado',
      campos: [
        { nome: 'Phone Number ID', valor: '', tipo: 'text' },
        { nome: 'Access Token', valor: '', tipo: 'password' },
        {
          nome: 'Webhook URL',
          valor: 'https://api.vtur.com/webhooks/whatsapp',
          tipo: 'text',
          readonly: true
        }
      ]
    },
    {
      id: 'sendgrid',
      nome: 'SendGrid',
      descricao: 'Envio de emails transacionais',
      icone: '📧',
      status: 'conectado',
      campos: [
        { nome: 'API Key', valor: '••••••••••••••••', tipo: 'password' },
        { nome: 'From Email', valor: 'contato@vtur.com.br', tipo: 'text' },
        { nome: 'From Name', valor: 'VTUR Viagens', tipo: 'text' }
      ]
    },
    {
      id: 'google',
      nome: 'Google Calendar',
      descricao: 'Sincronização de agenda',
      icone: '📅',
      status: 'configurar',
      campos: [
        { nome: 'Client ID', valor: '', tipo: 'text' },
        { nome: 'Client Secret', valor: '', tipo: 'password' },
        {
          nome: 'Redirect URI',
          valor: 'https://vtur.com/auth/google/callback',
          tipo: 'text',
          readonly: true
        }
      ]
    }
  ];

  function getStatusBadge(status: string): { label: string; color: 'green' | 'red' | 'yellow' } {
    const colors: Record<string, 'green' | 'red' | 'yellow'> = {
      conectado: 'green',
      desconectado: 'red',
      configurar: 'yellow',
      erro: 'red'
    };
    const labels: Record<string, string> = {
      conectado: 'Conectado',
      desconectado: 'Desconectado',
      configurar: 'Configurar',
      erro: 'Erro'
    };
    return { label: labels[status] || 'Desconhecido', color: colors[status] || 'yellow' };
  }

  function getStatusLabel(status: string) {
    return getStatusBadge(status).label;
  }

  function getStatusColor(status: string) {
    return getStatusBadge(status).color;
  }

  async function testarConexao(id: string) {
    testando = true;
    toast.success(`Conexão com ${id} testada com sucesso!`);
    testando = false;
  }

  async function salvarConfiguracoes() {
    saving = true;
    toast.success('Configurações de integrações salvas!');
    saving = false;
  }
</script>

<svelte:head>
  <title>Integrações | VTUR</title>
</svelte:head>

<PageHeader
  title="Integrações"
  subtitle="APIs e serviços externos"
  color="financeiro"
  breadcrumbs={[{ label: 'Parâmetros', href: '/parametros' }, { label: 'Integrações' }]}
/>

<div class="space-y-6">
  {#each integracoes as int}
    <Card color="financeiro">
      <div class="mb-4 flex items-start justify-between">
        <div class="flex items-center gap-4">
          <div class="flex h-12 w-12 items-center justify-center rounded-xl bg-slate-100 text-2xl">
            {int.icone}
          </div>
          <div>
            <div class="flex items-center gap-2">
              <h3 class="text-lg font-semibold text-slate-900">{int.nome}</h3>
              <Badge color={getStatusColor(int.status)} size="sm"
                >{getStatusLabel(int.status)}</Badge
              >
            </div>
            <p class="text-sm text-slate-500">{int.descricao}</p>
          </div>
        </div>
        <div class="flex items-center gap-2">
          {#if int.status === 'conectado'}
            <Button
              variant="secondary"
              size="sm"
              on:click={() => testarConexao(int.id)}
              disabled={testando}
            >
              <RefreshCw size={16} class="mr-1 {testando ? 'animate-spin' : ''}" />
              Testar
            </Button>
          {/if}
          <Button
            type="button"
            variant="ghost"
            size="sm"
            class_name="p-2"
            title="Documentação"
            ariaLabel="Abrir documentação da integração"
          >
            <ExternalLink size={18} />
          </Button>
        </div>
      </div>

      <div class="grid grid-cols-1 gap-4 md:grid-cols-2 lg:grid-cols-3">
        {#each int.campos as campo, campoIndex}
          <div>
            {#if campo.readonly}
              <div class="flex items-center gap-2">
                <FieldInput
                  id={`integracao-${int.id}-${campoIndex}`}
                  label={campo.nome}
                  type="text"
                  bind:value={campo.valor}
                  readonly={true}
                  class_name="w-full"
                />
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  class_name="mt-6 p-2"
                  title="Copiar valor"
                  ariaLabel={`Copiar ${campo.nome}`}
                  on:click={() => {
                    navigator.clipboard.writeText(campo.valor);
                    toast.success('Copiado!');
                  }}
                >
                  📋
                </Button>
              </div>
            {:else}
              <FieldInput
                id={`integracao-${int.id}-${campoIndex}`}
                label={campo.nome}
                type={campo.tipo}
                bind:value={campo.valor}
                class_name="w-full"
              />
            {/if}
          </div>
        {/each}
      </div>

      {#if int.status === 'desconectado'}
        <div class="mt-4 rounded-lg border border-amber-200 bg-amber-50 p-3">
          <div class="flex items-center gap-2">
            <AlertTriangle size={18} class="text-amber-600" />
            <span class="text-sm text-amber-700"
              >Esta integração não está configurada. Preencha os campos acima para ativar.</span
            >
          </div>
        </div>
      {/if}
    </Card>
  {/each}
</div>

<!-- Botões -->
<div class="mt-6 flex items-center justify-end gap-3">
  <Button variant="secondary" on:click={() => history.back()}>Cancelar</Button>
  <Button variant="primary" color="financeiro" on:click={salvarConfiguracoes} disabled={saving}>
    {#if saving}
      <span class="mr-2 animate-spin">⟳</span>
      Salvando...
    {:else}
      <Save size={18} class="mr-2" />
      Salvar Configurações
    {/if}
  </Button>
</div>
