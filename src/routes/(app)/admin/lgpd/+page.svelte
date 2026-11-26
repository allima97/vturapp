<script lang="ts">
  import PageHeader from '$lib/components/ui/PageHeader.svelte';
  import Card from '$lib/components/ui/Card.svelte';
  import Tabs from '$lib/components/ui/Tabs.svelte';
  import DataTable from '$lib/components/ui/DataTable.svelte';
  import Dialog from '$lib/components/ui/Dialog.svelte';
  import Button from '$lib/components/ui/Button.svelte';
  import AlertMessage from '$lib/components/ui/AlertMessage.svelte';
  import { FieldInput, FieldSelect, FieldTextarea } from '$lib/components/ui';
  import { confirmAction } from '$lib/stores/confirm';
  import { RefreshCw, MessageSquare, AlertTriangle } from '$lib/icons';
  import { escapeHtml } from '$lib/utils/html';
  import { formatISODateBR } from '$lib/date';
  import { toUserMessage } from '$lib/utils/errors';
  import { apiGet, apiPatch, apiPost, isCanceledApiError } from '$lib/services/api';
  import { createLoadGuard } from '$lib/utils/loadGuard';

  type Solicitacao = {
    id: string;
    tipo: string;
    titular_nome: string;
    titular_email: string;
    titular_cpf?: string;
    descricao: string;
    status: string;
    resposta?: string;
    prazo_legal: string;
    prazo_vencido: boolean;
    created_at: string;
  };

  type Atividade = {
    id: string;
    nome: string;
    finalidade: string;
    base_legal: string;
    dados_tratados: string[];
    titulares: string[];
    retencao_meses?: number;
    ativo: boolean;
  };

  const TIPO_LABEL: Record<string, string> = {
    acesso: 'Acesso',
    portabilidade: 'Portabilidade',
    retificacao: 'Retificação',
    eliminacao: 'Eliminação',
    revogacao: 'Revogação',
    oposicao: 'Oposição',
    informacao: 'Informação'
  };

  const STATUS_LABEL: Record<string, string> = {
    recebida: 'Recebida',
    em_analise: 'Em análise',
    concluida: 'Concluída',
    recusada: 'Recusada'
  };

  const STATUS_BADGE: Record<string, 'yellow' | 'blue' | 'green' | 'red'> = {
    recebida: 'yellow',
    em_analise: 'blue',
    concluida: 'green',
    recusada: 'red'
  };

  let aba = $state<'solicitacoes' | 'atividades' | 'anonimizar'>('solicitacoes');
  let solicitacoes = $state<Solicitacao[]>([]);
  let atividades = $state<Atividade[]>([]);
  let carregando = $state(false);
  let erroGlobal = $state('');
  const loadGuard = createLoadGuard();

  // Responder solicitação
  let respondendo: Solicitacao | null = $state(null);
  let novoStatus = $state('em_analise');
  let resposta = $state('');
  let salvando = $state(false);
  let msgResposta = $state('');

  // Anonimizar
  let anonTipo = $state<string>('cliente');
  let anonId = $state('');
  let anonProtocolo = $state('');
  let anonizando = $state(false);
  let msgAnon = $state('');

  const podeResponder = (row: Solicitacao) =>
    row.status !== 'concluida' && row.status !== 'recusada';

  async function carregarSolicitacoes() {
    const request = loadGuard.next();
    carregando = true;
    erroGlobal = '';
    try {
      const payload = await apiGet<{ items?: Solicitacao[] }>(
        '/api/v1/lgpd/admin/solicitacoes',
        undefined,
        request.signal
      );
      if (!loadGuard.isCurrent(request.seq)) return;
      solicitacoes = payload.items || [];
    } catch (err) {
      if (isCanceledApiError(err)) return;
      erroGlobal = toUserMessage(err, 'Erro ao carregar solicitações.');
    } finally {
      if (loadGuard.isCurrent(request.seq)) carregando = false;
    }
  }

  async function carregarAtividades() {
    const request = loadGuard.next();
    carregando = true;
    erroGlobal = '';
    try {
      const payload = await apiGet<{ atividades?: Atividade[] }>(
        '/api/v1/lgpd/admin/atividades',
        undefined,
        request.signal
      );
      if (!loadGuard.isCurrent(request.seq)) return;
      atividades = payload.atividades || [];
    } catch (err) {
      if (isCanceledApiError(err)) return;
      erroGlobal = toUserMessage(err, 'Erro ao carregar atividades.');
    } finally {
      if (loadGuard.isCurrent(request.seq)) carregando = false;
    }
  }

  function recarregar() {
    if (aba === 'solicitacoes') carregarSolicitacoes();
    else if (aba === 'atividades') carregarAtividades();
  }

  $effect(() => {
    if (aba === 'solicitacoes') carregarSolicitacoes();
    else if (aba === 'atividades') carregarAtividades();
  });

  async function salvarResposta() {
    if (!respondendo) return;
    salvando = true;
    msgResposta = '';
    try {
      await apiPatch(`/api/v1/lgpd/admin/solicitacoes/${respondendo.id}`, {
        status: novoStatus,
        resposta
      });
      msgResposta = 'Solicitação atualizada com sucesso.';
      respondendo = null;
      resposta = '';
      await carregarSolicitacoes();
    } catch (err) {
      msgResposta = toUserMessage(err, 'Erro ao salvar resposta.');
    } finally {
      salvando = false;
    }
  }

  async function executarAnonimizacao() {
    if (!anonId.trim()) return;
    const confirmado = await confirmAction({
      title: 'Confirmar anonimização',
      message:
        'Esta operação é irreversível e substitui os dados pessoais por [ANONIMIZADO-LGPD]. Confirme que obteve a solicitação formal do titular.',
      confirmLabel: 'Anonimizar',
      confirmVariant: 'danger'
    });
    if (!confirmado) return;
    anonizando = true;
    msgAnon = '';
    try {
      const payload = await apiPost<{ mensagem?: string }>('/api/v1/lgpd/admin/anonimizar', {
        tipo: anonTipo,
        id: anonId.trim(),
        protocolo_solicitacao: anonProtocolo.trim() || undefined
      });
      msgAnon = payload.mensagem || 'Dados anonimizados com sucesso.';
      anonId = '';
      anonProtocolo = '';
    } catch (err) {
      msgAnon = toUserMessage(err, 'Erro ao anonimizar.');
    } finally {
      anonizando = false;
    }
  }

  function abrirResponder(s: Solicitacao) {
    respondendo = s;
    novoStatus = s.status === 'recebida' ? 'em_analise' : 'concluida';
    resposta = s.resposta ?? '';
    msgResposta = '';
  }

  const colunasSolicitacoes = [
    {
      key: 'created_at',
      label: 'Data',
      sortable: true,
      formatter: (v: string) => formatISODateBR(v)
    },
    {
      key: 'titular_nome',
      label: 'Titular',
      sortable: true,
      formatter: (_v: unknown, row: Solicitacao) =>
        `<div><p class="font-medium text-slate-900">${escapeHtml(row.titular_nome)}</p><p class="text-xs text-slate-500">${escapeHtml(row.titular_email)}</p></div>`
    },
    {
      key: 'tipo',
      label: 'Tipo',
      sortable: true,
      formatter: (v: string) =>
        `<span class="inline-flex rounded-full bg-slate-100 px-2.5 py-1 text-xs font-semibold text-slate-700">${escapeHtml(TIPO_LABEL[v] ?? v)}</span>`
    },
    {
      key: 'status',
      label: 'Status',
      sortable: true,
      formatter: (v: string) => {
        const cor = STATUS_BADGE[v] ?? 'gray';
        const mapa: Record<string, string> = {
          yellow: 'bg-amber-100 text-amber-800',
          blue: 'bg-blue-100 text-blue-800',
          green: 'bg-emerald-100 text-emerald-800',
          red: 'bg-red-100 text-red-800',
          gray: 'bg-slate-100 text-slate-700'
        };
        return `<span class="inline-flex rounded-full px-2.5 py-1 text-xs font-semibold ${mapa[cor]}">${escapeHtml(STATUS_LABEL[v] ?? v)}</span>`;
      }
    },
    {
      key: 'prazo_legal',
      label: 'Prazo',
      sortable: true,
      formatter: (v: string, row: Solicitacao) =>
        row.prazo_vencido
          ? `<span class="text-red-600 font-semibold">${formatISODateBR(v)} — VENCIDO</span>`
          : formatISODateBR(v)
    }
  ];

  const colunasAtividades = [
    {
      key: 'nome',
      label: 'Atividade',
      sortable: true,
      formatter: (_v: unknown, row: Atividade) =>
        `<p class="font-medium text-slate-900">${escapeHtml(row.nome)}</p>`
    },
    { key: 'finalidade', label: 'Finalidade', sortable: true },
    { key: 'base_legal', label: 'Base Legal', sortable: true },
    {
      key: 'dados_tratados',
      label: 'Dados',
      formatter: (v: string[]) => `<span class="text-xs text-slate-500">${escapeHtml((v || []).join(', '))}</span>`
    },
    {
      key: 'retencao_meses',
      label: 'Retenção',
      formatter: (v: number | null | undefined) => (v ? `${v}m` : '—')
    },
    {
      key: 'ativo',
      label: 'Ativo',
      formatter: (v: boolean) =>
        v
          ? '<span class="text-emerald-600 font-semibold">Sim</span>'
          : '<span class="text-slate-400">Não</span>'
    }
  ];
</script>

<svelte:head>
  <title>LGPD — Administração</title>
</svelte:head>

<PageHeader
  title="Conformidade LGPD"
  subtitle="Lei 13.709/2018 — Gestão de solicitações, atividades de tratamento e anonimização."
  breadcrumbs={[{ label: 'Administração', href: '/admin' }, { label: 'LGPD' }]}
  actions={[{ label: 'Atualizar', onClick: recarregar, variant: 'secondary', icon: RefreshCw }]}
/>

<div class="space-y-6">
  <Tabs
    activeKey={aba}
    items={[
      { key: 'solicitacoes', label: 'Solicitações de Titulares' },
      { key: 'atividades', label: 'Atividades de Tratamento (ROPA)' },
      { key: 'anonimizar', label: 'Anonimizar Dados' }
    ]}
    onSelect={(key) => {
      if (key === 'solicitacoes' || key === 'atividades' || key === 'anonimizar') aba = key;
    }}
  />

  {#if erroGlobal}
    <AlertMessage variant="error" message={erroGlobal} />
  {/if}

  {#if aba === 'solicitacoes'}
    <DataTable
      title="Solicitações — Art. 18 LGPD"
      color="financeiro"
      loading={carregando}
      loadingTitle="Carregando solicitações"
      columns={colunasSolicitacoes}
      data={solicitacoes}
      emptyMessage="Nenhuma solicitação encontrada."
      rowClass={(row: Solicitacao) => (row.prazo_vencido ? 'bg-orange-50' : '')}
      rowActionsAvailable={(row: Solicitacao) => podeResponder(row)}
    >
      <svelte:fragment slot="row-actions" let:row>
        {#if podeResponder(row)}
          <Button variant="outline" size="sm" on:click={() => abrirResponder(row)}>
            <MessageSquare size={14} class="mr-1" />
            Responder
          </Button>
        {/if}
      </svelte:fragment>
    </DataTable>
  {/if}

  {#if aba === 'atividades'}
    <DataTable
      title="Registro de Atividades de Tratamento — Art. 37"
      color="financeiro"
      loading={carregando}
      loadingTitle="Carregando atividades"
      columns={colunasAtividades}
      data={atividades}
      emptyMessage="Nenhuma atividade cadastrada."
    />
  {/if}

  {#if aba === 'anonimizar'}
    <Card color="financeiro" title="Anonimizar Dados — Art. 18, IV/VI">
      <p class="mb-4 text-sm text-slate-600">
        A anonimização substitui os dados pessoais por
        <code class="rounded bg-slate-100 px-1">[ANONIMIZADO-LGPD]</code>, tornando o titular
        irreversivelmente não identificável, sem excluir os registros de negócio.
      </p>
      {#if msgAnon}
        <AlertMessage variant={msgAnon.startsWith('Dados') ? 'success' : 'error'} message={msgAnon} />
      {/if}
      <div class="mt-4 grid gap-4 md:grid-cols-2">
        <FieldSelect
          label="Tipo de entidade"
          bind:value={anonTipo}
          options={[
            { value: 'cliente', label: 'Cliente' },
            { value: 'acompanhante', label: 'Acompanhante' }
          ]}
        />
        <FieldInput
          label="ID do {anonTipo} (UUID)"
          bind:value={anonId}
          placeholder="xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx"
          required
        />
        <div class="md:col-span-2">
          <FieldInput
            label="Protocolo da solicitação LGPD (opcional)"
            bind:value={anonProtocolo}
            placeholder="UUID da solicitação para vincular"
          />
        </div>
      </div>
      <div class="mt-4 flex items-start gap-2 rounded-lg border border-amber-200 bg-amber-50 p-3 text-sm text-amber-800">
        <AlertTriangle size={16} class="mt-0.5 shrink-0" />
        <span
          ><strong>Esta operação é irreversível.</strong> Confirme que obteve a solicitação formal
          do titular.</span
        >
      </div>
      <div class="mt-4">
        <Button
          variant="danger"
          loading={anonizando}
          disabled={!anonId.trim()}
          on:click={executarAnonimizacao}
        >
          Anonimizar Dados
        </Button>
      </div>
    </Card>
  {/if}
</div>

<Dialog
  open={respondendo !== null}
  title="Responder Solicitação"
  color="financeiro"
  size="lg"
  showConfirm
  confirmText={salvando ? 'Salvando...' : 'Salvar Resposta'}
  loading={salvando}
  confirmDisabled={!resposta.trim()}
  onConfirm={salvarResposta}
  onCancel={() => (respondendo = null)}
>
  {#if respondendo}
    <div class="space-y-4">
      {#if msgResposta}
        <AlertMessage variant={msgResposta.includes('sucesso') ? 'success' : 'error'} message={msgResposta} />
      {/if}
      <p class="text-sm text-slate-600">
        <strong>{respondendo.titular_nome}</strong> — {TIPO_LABEL[respondendo.tipo] ?? respondendo.tipo}
      </p>
      <FieldSelect
        label="Novo Status"
        bind:value={novoStatus}
        options={[
          { value: 'em_analise', label: 'Em Análise' },
          { value: 'concluida', label: 'Concluída' },
          { value: 'recusada', label: 'Recusada' }
        ]}
      />
      <FieldTextarea
        label="Resposta ao titular"
        bind:value={resposta}
        rows={5}
        placeholder="Descreva a ação tomada..."
        required
      />
    </div>
  {/if}
</Dialog>
