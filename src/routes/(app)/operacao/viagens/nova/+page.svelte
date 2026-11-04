<script lang="ts">
  import { goto } from '$app/navigation';
  import { onDestroy, onMount } from 'svelte';
  import {
    Button,
    Card,
    FieldCheckbox,
    FieldDatalistInput,
    FieldInput,
    FieldSelect,
    FieldTextarea,
    FormActions,
    FormPanel,
    PageHeader
  } from '$lib/components/ui';
  import ClienteAutocomplete from '$lib/components/vendas/ClienteAutocomplete.svelte';
  import CidadeDestinoAutocomplete from '$lib/components/CidadeDestinoAutocomplete.svelte';
  import { toast } from '$lib/stores/ui';
  import { ArrowLeft, Plane, RefreshCw } from '$lib/icons';
  import { apiGet, apiPost } from '$lib/services/api';
  import { toUserMessage } from '$lib/utils/errors';

  type ClienteOption = {
    id: string;
    nome: string;
    cpf?: string | null;
    telefone?: string | null;
    email?: string | null;
    whatsapp?: string | null;
  };

  type CidadeBuscaOption = {
    nome?: string | null;
  };

  const statusOptions = [
    { value: 'pendente', label: 'Pendente' },
    { value: 'confirmada', label: 'Confirmada' },
    { value: 'em_viagem', label: 'Em viagem' },
    { value: 'concluida', label: 'Concluída' },
    { value: 'cancelada', label: 'Cancelada' }
  ];

  const PT_BR_COLLATOR = new Intl.Collator('pt-BR');

  let loading = true;
  let saving = false;
  let clientes: ClienteOption[] = [];
  let origemOptions: string[] = [];
  let destinoOptions: string[] = [];
  let origemTimer: ReturnType<typeof setTimeout> | null = null;
  let destinoTimer: ReturnType<typeof setTimeout> | null = null;

  let form = {
    cliente_id: '',
    origem: '',
    destino: '',
    data_inicio: '',
    data_fim: '',
    status: 'pendente',
    observacoes: '',
    follow_up_text: '',
    follow_up_fechado: false
  };

  function mergeClientes(items: ClienteOption[]) {
    const byId = new Map<string, ClienteOption>();
    for (const item of clientes) {
      const id = String(item?.id || '').trim();
      if (!id) continue;
      byId.set(id, { ...(byId.get(id) || {}), ...item });
    }
    for (const item of items || []) {
      const id = String(item?.id || '').trim();
      if (!id) continue;
      byId.set(id, { ...(byId.get(id) || {}), ...item });
    }
    clientes = Array.from(byId.values()).sort((a, b) => PT_BR_COLLATOR.compare(a.nome, b.nome));
  }

  async function loadClientes() {
    loading = true;
    try {
      const payload = await apiGet<ClienteOption[]>('/api/v1/viagens/clientes');
      mergeClientes(Array.isArray(payload) ? payload : []);
    } catch (err) {
      toast.error(toUserMessage(err, 'Erro ao carregar clientes.'));
    } finally {
      loading = false;
    }
  }

  async function searchCidades(target: 'origem' | 'destino', query: string) {
    const termo = query.trim();
    if (termo.length < 2) {
      if (target === 'origem') origemOptions = [];
      else destinoOptions = [];
      return;
    }

    try {
      const payload = await apiGet<CidadeBuscaOption[]>('/api/v1/viagens/cidades-busca', {
        q: termo,
        limite: 12
      });
      const nomes = new Set<string>();
      for (const item of Array.isArray(payload) ? payload : []) {
        const nome = String(item?.nome || '').trim();
        if (nome) nomes.add(nome);
      }
      const options = Array.from(nomes);

      if (target === 'origem') origemOptions = options;
      else destinoOptions = options;
    } catch {
      if (target === 'origem') origemOptions = [];
      else destinoOptions = [];
    }
  }

  function queueCitySearch(target: 'origem' | 'destino', query: string) {
    const currentTimer = target === 'origem' ? origemTimer : destinoTimer;
    if (currentTimer) clearTimeout(currentTimer);

    const nextTimer = setTimeout(() => {
      void searchCidades(target, query);
    }, 220);

    if (target === 'origem') origemTimer = nextTimer;
    else destinoTimer = nextTimer;
  }

  function validateForm() {
    if (!form.cliente_id) {
      toast.error('Selecione um cliente para continuar.');
      return false;
    }
    if (!form.origem.trim() || !form.destino.trim()) {
      toast.error('Informe origem e destino da viagem.');
      return false;
    }
    if (!form.data_inicio) {
      toast.error('Informe a data de início.');
      return false;
    }
    if (form.data_fim && form.data_fim < form.data_inicio) {
      toast.error('A data final não pode ser anterior à data de início.');
      return false;
    }
    return true;
  }

  async function save() {
    if (!validateForm()) return;

    saving = true;
    try {
      const payload = await apiPost<{ viagem?: { id?: string } }>('/api/v1/viagens/create', form);

      toast.success('Viagem criada com sucesso.');

      const createdId = String(payload?.viagem?.id || '').trim();
      if (createdId) {
        goto(`/operacao/viagens/${createdId}`);
        return;
      }

      goto('/operacao/viagens');
    } catch (err) {
      toast.error(toUserMessage(err, 'Erro ao criar viagem.'));
    } finally {
      saving = false;
    }
  }

  onMount(() => {
    void loadClientes();
  });

  onDestroy(() => {
    if (origemTimer) clearTimeout(origemTimer);
    if (destinoTimer) clearTimeout(destinoTimer);
  });
</script>

<svelte:head>
  <title>Nova Viagem | VTUR</title>
</svelte:head>

<PageHeader
  title="Nova Viagem"
  subtitle="Cadastre uma viagem operacional com cliente, roteiro base e acompanhamento."
  color="clientes"
  breadcrumbs={[
    { label: 'Viagens', href: '/operacao/viagens' },
    { label: 'Nova viagem' }
  ]}
  actions={[
    { label: 'Voltar', href: '/operacao/viagens', variant: 'secondary', icon: ArrowLeft },
    { label: 'Recarregar clientes', onClick: loadClientes, variant: 'secondary', icon: RefreshCw }
  ]}
/>

<div class="space-y-6">
  <FormPanel
    title="Dados da viagem"
    subtitle="Os campos principais já permitem abrir o dossiê e acompanhar follow-ups."
    description="O cliente define o vínculo da viagem. Origem, destino e data de início são obrigatórios."
  >
    <div class="grid grid-cols-1 gap-4 lg:grid-cols-2">
      <ClienteAutocomplete
        id="viagem-cliente"
        label="Cliente"
        bind:value={form.cliente_id}
        clients={clientes}
        required={true}
        placeholder="Digite para buscar cliente"
        on:loaded={(event) => mergeClientes(event.detail)}
      />

      <FieldSelect
        id="viagem-status"
        label="Status"
        bind:value={form.status}
        options={statusOptions}
        class_name="w-full"
      />

      <FieldDatalistInput
        id="viagem-origem"
        label="Origem"
        bind:value={form.origem}
        options={origemOptions}
        placeholder="Ex.: São Paulo"
        required={true}
        class_name="w-full"
        on:input={() => queueCitySearch('origem', form.origem)}
      />

      <CidadeDestinoAutocomplete
        id="viagem-destino"
        label="Destino"
        bind:value={form.destino}
        placeholder="Ex.: Maceió"
        required={true}
        class_name="w-full"
        endpoint="/api/v1/viagens/cidades-busca"
      />

      <FieldInput
        id="viagem-data-inicio"
        label="Data de início"
        type="date"
        bind:value={form.data_inicio}
        required={true}
        class_name="w-full"
      />

      <FieldInput
        id="viagem-data-fim"
        label="Data final"
        type="date"
        bind:value={form.data_fim}
        min={form.data_inicio || null}
        helper="Opcional. Se vazio, o dossiê considera apenas a data de início."
        class_name="w-full"
      />
    </div>
  </FormPanel>

  <FormPanel
    title="Follow-up e observações"
    subtitle="Essas anotações já ajudam a operação a continuar o atendimento sem contexto perdido."
  >
    <div class="grid grid-cols-1 gap-4 lg:grid-cols-2">
      <FieldTextarea
        id="viagem-observacoes"
        label="Observações"
        bind:value={form.observacoes}
        rows={5}
        placeholder="Informações operacionais, referências do roteiro, necessidades do cliente..."
        class_name="w-full"
      />

      <FieldTextarea
        id="viagem-follow-up"
        label="Texto de follow-up"
        bind:value={form.follow_up_text}
        rows={5}
        placeholder="Próxima ação, lembrete de retorno, detalhe importante para a equipe..."
        class_name="w-full"
      />
    </div>

    <FieldCheckbox
      id="viagem-follow-up-fechado"
      label="Criar a viagem já com follow-up fechado"
      bind:checked={form.follow_up_fechado}
      helper="Deixe marcado apenas se não houver pendência operacional para acompanhar."
      class_name="w-full"
    />
  </FormPanel>

  <Card color="clientes">
    <div class="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
      <div>
        <p class="text-sm font-medium text-slate-900">Pronto para criar o dossiê?</p>
        <p class="text-sm text-slate-500">
          Ao salvar, a viagem é criada e você é redirecionado diretamente para a tela de detalhe.
        </p>
      </div>

      <FormActions
        {saving}
        submitLabel="Criar viagem"
        cancelLabel="Cancelar"
        onSubmit={save}
        onCancel={() => goto('/operacao/viagens')}
      />
    </div>
  </Card>
</div>
