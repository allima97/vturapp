<script lang="ts">
  import { onMount } from 'svelte';
  import { goto } from '$app/navigation';
  import PageHeader from '$lib/components/ui/PageHeader.svelte';
  import Card from '$lib/components/ui/Card.svelte';
  import DataTable from '$lib/components/ui/DataTable.svelte';
  import Button from '$lib/components/ui/Button.svelte';
  import { BottomSheet, FieldSelect } from '$lib/components/ui';
  import { toast } from '$lib/stores/ui';
  import { Plus, RefreshCw, SlidersHorizontal, Users, UserCheck, UserX, UserCog } from '$lib/icons';
  import { apiGet, isCanceledApiError } from '$lib/services/api';
  import { createLoadGuard } from '$lib/utils/loadGuard';
  import { escapeHtml } from '$lib/utils/html';
  import { toUserMessage } from '$lib/utils/errors';

  type Usuario = {
    id: string;
    nome: string;
    email: string | null;
    telefone?: string | null;
    cidade?: string | null;
    estado?: string | null;
    tipo: string;
    tipo_id?: string | null;
    empresa: string;
    empresa_id?: string | null;
    ativo: boolean;
    uso_individual: boolean;
    created_by_gestor: boolean;
    participa_ranking: boolean;
    created_at?: string | null;
    updated_at?: string | null;
  };

  let loading = true;
  let usuarios: Usuario[] = [];
  let filtroTipo = '';
  let filtroStatus = '';
  let filtroEmpresa = '';
  let filtroEscopo = '';
  let showFilterSheet = false;
  const loadGuard = createLoadGuard();

  const DATE_TIME_FORMATTER = new Intl.DateTimeFormat('pt-BR', {
    dateStyle: 'short',
    timeStyle: 'short'
  });
  const PT_BR_COLLATOR = new Intl.Collator('pt-BR');

  function formatDateTime(value?: string | null) {
    if (!value) return '-';
    const date = new Date(value);
    if (Number.isNaN(date.getTime())) return '-';
    return DATE_TIME_FORMATTER.format(date);
  }

  function userCell(row: Usuario) {
    const initials = row.nome
      .split(' ')
      .filter(Boolean)
      .slice(0, 2)
      .map((part) => part[0]?.toUpperCase() || '')
      .join('');

    return `
      <div class="flex items-center gap-3">
        <div class="flex h-10 w-10 items-center justify-center rounded-full bg-orange-100 font-semibold text-orange-700">
          ${escapeHtml(initials || 'U')}
        </div>
        <div class="min-w-0">
          <p class="truncate font-medium text-slate-900">${escapeHtml(row.nome)}</p>
          <p class="truncate text-xs text-slate-500">${escapeHtml(row.email || '-')}</p>
        </div>
      </div>
    `;
  }

  function badge(label: string, tone: 'gray' | 'green' | 'yellow' | 'red' | 'blue') {
    const classes = {
      gray: 'bg-slate-100 text-slate-700',
      green: 'bg-emerald-100 text-emerald-700',
      yellow: 'bg-amber-100 text-amber-700',
      red: 'bg-rose-100 text-rose-700',
      blue: 'bg-blue-100 text-blue-700'
    };

    return `<span class="inline-flex rounded-full px-2 py-1 text-xs font-medium ${classes[tone]}">${escapeHtml(label)}</span>`;
  }

  const columns = [
    {
      key: 'nome',
      label: 'Usuario',
      sortable: true,
      formatter: (_value: unknown, row: Usuario) => userCell(row)
    },
    {
      key: 'tipo',
      label: 'Perfil',
      sortable: true,
      formatter: (value: string) => badge(value || 'OUTRO', 'blue')
    },
    { key: 'empresa', label: 'Empresa', sortable: true },
    {
      key: 'escopo',
      label: 'Escopo',
      sortable: true,
      formatter: (_value: unknown, row: Usuario) =>
        row.uso_individual
          ? badge('Individual', 'yellow')
          : row.created_by_gestor
            ? badge('Equipe gestor', 'gray')
            : badge('Corporativo', 'green')
    },
    {
      key: 'status',
      label: 'Status',
      sortable: true,
      formatter: (_value: unknown, row: Usuario) =>
        badge(row.ativo ? 'Ativo' : 'Inativo', row.ativo ? 'green' : 'red')
    },
    {
      key: 'ranking',
      label: 'Ranking',
      sortable: true,
      formatter: (_value: unknown, row: Usuario) =>
        badge(
          row.participa_ranking ? 'Participa' : 'Nao participa',
          row.participa_ranking ? 'green' : 'gray'
        )
    },
    {
      key: 'updated_at',
      label: 'Atualizado',
      sortable: true,
      formatter: (value: string) => formatDateTime(value)
    }
  ];

  async function loadUsuarios() {
    const request = loadGuard.next();
    loading = true;
    try {
      const payload = await apiGet<{ items?: Usuario[] }>(
        '/api/v1/admin/usuarios',
        undefined,
        request.signal
      );
      if (!loadGuard.isCurrent(request.seq)) return;
      usuarios = payload.items || [];
    } catch (err) {
      if (isCanceledApiError(err)) return;
      toast.error(toUserMessage(err, 'Nao foi possivel carregar os usuarios administrativos.'));
      usuarios = [];
    } finally {
      if (loadGuard.isCurrent(request.seq)) loading = false;
    }
  }

  $: empresas = (() => {
    const nomes = new Set<string>();
    for (const row of usuarios) {
      if (row.empresa) nomes.add(row.empresa);
    }
    return Array.from(nomes).sort((a, b) => PT_BR_COLLATOR.compare(a, b));
  })();
  $: tipoOptions = (() => {
    const tipos = new Set<string>();
    for (const row of usuarios) {
      tipos.add(row.tipo);
    }
    return Array.from(tipos)
      .sort((a, b) => PT_BR_COLLATOR.compare(a, b))
      .map((tipo) => ({ value: tipo, label: tipo }));
  })();
  $: filteredUsuarios = usuarios.filter((row) => {
    if (filtroTipo && row.tipo !== filtroTipo) return false;
    if (filtroStatus && String(row.ativo) !== filtroStatus) return false;
    if (filtroEmpresa && row.empresa !== filtroEmpresa) return false;
    if (filtroEscopo === 'individual' && !row.uso_individual) return false;
    if (filtroEscopo === 'corporativo' && row.uso_individual) return false;
    return true;
  });

  $: stats = usuarios.reduce(
    (acc, row) => {
      acc.total += 1;
      if (row.ativo) acc.ativos += 1;
      else acc.inativos += 1;
      if (row.uso_individual) acc.individuais += 1;
      return acc;
    },
    { total: 0, ativos: 0, inativos: 0, individuais: 0 }
  );

  onMount(loadUsuarios);
</script>

<svelte:head>
  <title>Usuarios | VTUR</title>
</svelte:head>

<PageHeader
  title="Usuarios"
  subtitle="Listagem administrativa consolidada com papel, empresa, escopo e status real."
  breadcrumbs={[{ label: 'Administracao', href: '/admin' }, { label: 'Usuarios' }]}
  actions={[
    { label: 'Atualizar', onClick: loadUsuarios, variant: 'secondary', icon: RefreshCw },
    { label: 'Novo usuario', href: '/admin/usuarios/novo', variant: 'primary', icon: Plus }
  ]}
/>

<div class="space-y-6">
  <div class="vtur-kpi-grid mb-6">
    <div class="vtur-kpi-card">
      <div
        class="flex h-10 w-10 items-center justify-center rounded-xl bg-slate-100 text-slate-500"
      >
        <Users size={20} />
      </div>
      <div>
        <p class="text-sm font-medium text-slate-500">Total</p>
        <p class="text-2xl font-bold text-slate-900">{stats.total}</p>
      </div>
    </div>
    <div class="vtur-kpi-card">
      <div class="flex h-10 w-10 items-center justify-center rounded-xl bg-green-50 text-green-500">
        <UserCheck size={20} />
      </div>
      <div>
        <p class="text-sm font-medium text-slate-500">Ativos</p>
        <p class="text-2xl font-bold text-slate-900">{stats.ativos}</p>
      </div>
    </div>
    <div class="vtur-kpi-card">
      <div class="flex h-10 w-10 items-center justify-center rounded-xl bg-red-50 text-red-500">
        <UserX size={20} />
      </div>
      <div>
        <p class="text-sm font-medium text-slate-500">Inativos</p>
        <p class="text-2xl font-bold text-slate-900">{stats.inativos}</p>
      </div>
    </div>
    <div class="vtur-kpi-card">
      <div class="flex h-10 w-10 items-center justify-center rounded-xl bg-blue-50 text-blue-500">
        <UserCog size={20} />
      </div>
      <div>
        <p class="text-sm font-medium text-slate-500">Uso individual</p>
        <p class="text-2xl font-bold text-slate-900">{stats.individuais}</p>
      </div>
    </div>
  </div>

  <!-- Mobile: botão de filtros -->
  <div class="mb-4 sm:hidden">
    <Button variant="secondary" class_name="w-full" on:click={() => (showFilterSheet = true)}>
      <SlidersHorizontal size={16} class="mr-2" />
      Filtros
      {#if filtroTipo || filtroStatus || filtroEmpresa || filtroEscopo}
        <span class="bg-financeiro-500 ml-2 inline-flex h-2 w-2 rounded-full"></span>
      {/if}
    </Button>
  </div>

  <Card color="financeiro" title="Filtros" class="hidden sm:block">
    <div class="grid gap-4 md:grid-cols-4">
      <FieldSelect
        id="usuarios-tipo"
        label="Perfil"
        bind:value={filtroTipo}
        options={tipoOptions}
        placeholder="Todos"
        class_name="w-full"
      />

      <FieldSelect
        id="usuarios-status"
        label="Status"
        bind:value={filtroStatus}
        options={[
          { value: 'true', label: 'Ativo' },
          { value: 'false', label: 'Inativo' }
        ]}
        placeholder="Todos"
        class_name="w-full"
      />

      <FieldSelect
        id="usuarios-empresa"
        label="Empresa"
        bind:value={filtroEmpresa}
        options={empresas.map((empresa) => ({ value: empresa, label: empresa }))}
        placeholder="Todas"
        class_name="w-full"
      />

      <FieldSelect
        id="usuarios-escopo"
        label="Escopo"
        bind:value={filtroEscopo}
        options={[
          { value: 'corporativo', label: 'Corporativo' },
          { value: 'individual', label: 'Individual' }
        ]}
        placeholder="Todos"
        class_name="w-full"
      />
    </div>
  </Card>

  <BottomSheet bind:open={showFilterSheet} title="Filtrar usuários">
    <div class="space-y-4">
      <FieldSelect
        id="usuarios-tipo-mobile"
        label="Perfil"
        bind:value={filtroTipo}
        options={tipoOptions}
        placeholder="Todos"
        class_name="w-full"
      />
      <FieldSelect
        id="usuarios-status-mobile"
        label="Status"
        bind:value={filtroStatus}
        options={[
          { value: 'true', label: 'Ativo' },
          { value: 'false', label: 'Inativo' }
        ]}
        placeholder="Todos"
        class_name="w-full"
      />
      <FieldSelect
        id="usuarios-empresa-mobile"
        label="Empresa"
        bind:value={filtroEmpresa}
        options={empresas.map((empresa) => ({ value: empresa, label: empresa }))}
        placeholder="Todas"
        class_name="w-full"
      />
      <FieldSelect
        id="usuarios-escopo-mobile"
        label="Escopo"
        bind:value={filtroEscopo}
        options={[
          { value: 'corporativo', label: 'Corporativo' },
          { value: 'individual', label: 'Individual' }
        ]}
        placeholder="Todos"
        class_name="w-full"
      />
    </div>
    <Button variant="primary" class_name="w-full mt-2" on:click={() => (showFilterSheet = false)}
      >Aplicar filtros</Button
    >
  </BottomSheet>

  <DataTable
    title="Usuarios administrados"
    color="financeiro"
    {loading}
    {columns}
    data={filteredUsuarios}
    emptyMessage="Nenhum usuario encontrado para o escopo atual."
    onRowClick={(row: Usuario) => goto(`/admin/usuarios/${row.id}`)}
  />

  <Card color="financeiro">
    <p class="text-sm text-slate-600">
      Abertura do registro ocorre pelo clique na linha. O detalhe concentra edicao, acoes sensiveis,
      vinculo de empresa, papel, ranking, disparo de aviso, redefinicao de senha e reset de 2FA.
    </p>
  </Card>
</div>
