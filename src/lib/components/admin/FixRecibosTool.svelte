<script lang="ts">
  import { Search, Wrench } from '$lib/icons';
  import AlertMessage from '$lib/components/ui/AlertMessage.svelte';
  import Button from '$lib/components/ui/Button.svelte';
  import Card from '$lib/components/ui/Card.svelte';
  import PageHeader from '$lib/components/ui/PageHeader.svelte';
  import SimpleTable from '$lib/components/ui/SimpleTable.svelte';
  import FieldInput from '$lib/components/ui/form/FieldInput.svelte';
  import FieldSelect from '$lib/components/ui/form/FieldSelect.svelte';
  import { apiFetch, isCanceledApiError } from '$lib/services/api';
  import { createLoadGuard } from '$lib/utils/loadGuard';

  const API_ENDPOINT = '/api/v1/admin/fix-recibos';

  const BRL_CURRENCY_FORMATTER = new Intl.NumberFormat('pt-BR', {
    style: 'currency',
    currency: 'BRL',
    minimumFractionDigits: 2,
    maximumFractionDigits: 2
  });

  type ConcRow = {
    id: string;
    documento: string;
    status: string;
    descricao: string;
    movimento_data: string;
    valor_lancamentos: number;
    valor_descontos: number;
    valor_abatimentos: number;
    valor_venda_real: number;
    venda_id: string | null;
    venda_recibo_id: string | null;
    ranking_vendedor_id: string;
    ranking_vendedor_nome: string;
    company_id: string;
    candidatos?: ReciboCandidate[];
  };

  type ReciboCandidate = {
    id: string;
    venda_id: string;
    numero_recibo: string | null;
    numero_recibo_normalizado?: string | null;
    numero_reserva: string | null;
    data_venda: string | null;
    valor_total: number;
    valor_taxas: number;
    vendedor_id: string | null;
    vendedor_nome: string;
  };

  type UserOption = {
    id: string;
    nome_completo: string;
  };

  type SearchDocumentsResponse = {
    conciliacao_rows?: ConcRow[];
  };

  type SearchUsersResponse = {
    usuarios?: UserOption[];
  };

  type FixRecibosAction = 'fix_link' | 'fix_vendor' | 'fix_valor';

  type FixRecibosPayload = {
    action: string;
    id: string;
    vendedor_id?: string;
    venda_recibo_id?: string;
    valor_lancamentos?: number;
    valor_venda_real?: number;
  };

  type FixRecibosResponse = {
    updated?: { documento?: string | null } | Array<{ documento?: string | null }>;
  };

  type ApiErrorLike = {
    message?: string;
  };

  const FIX_OPTIONS = [
    { value: 'fix_link', label: 'Corrigir vínculo com recibo de venda' },
    { value: 'fix_vendor', label: 'Trocar vendedor atribuido no ranking' },
    { value: 'fix_valor', label: 'Corrigir valores financeiros' }
  ];

  let docs = '';
  let rows: ConcRow[] = [];
  let loading = false;
  let message = '';
  let errorMsg = '';

  let fixId = '';
  let fixAction: FixRecibosAction = 'fix_vendor';
  let fixVendedorId = '';
  let fixValorLancamentos = '';
  let fixValorVendaReal = '';
  let fixCompanyId = '';
  let originalValorLancamentos: number | null = null;
  let originalValorVendaReal: number | null = null;
  let selectedCandidates: ReciboCandidate[] = [];
  let selectedCandidateId = '';

  let userSearch = '';
  let userResults: UserOption[] = [];
  let userSearchLoading = false;
  const docsGuard = createLoadGuard();
  const usersGuard = createLoadGuard();

  function formatMoney(value: number) {
    return BRL_CURRENCY_FORMATTER.format(Number(value || 0));
  }

  function parseMoneyInput(value: string) {
    let normalized = String(value || '')
      .trim()
      .replace(/[R$\s]/g, '');

    if (normalized.includes(',')) {
      normalized = normalized.replace(/\./g, '').replace(',', '.');
    } else {
      const parts = normalized.split('.');
      const hasThousandsPattern =
        parts.length > 1 &&
        parts.slice(1).every((part) => part.length === 3) &&
        parts[0].length >= 1 &&
        parts[0].length <= 3;

      if (hasThousandsPattern) {
        normalized = parts.join('');
      }
    }

    const parsed = Number(normalized);
    return Number.isFinite(parsed) ? parsed : null;
  }

  function displayCandidateDoc(candidate: ReciboCandidate) {
    return candidate.numero_recibo || candidate.numero_reserva || candidate.numero_recibo_normalizado || candidate.id;
  }

  async function fetchDocs(options: { suppressSuccessMessage?: boolean } = {}) {
    if (!docs.trim()) {
      errorMsg = 'Informe pelo menos um recibo/documento.';
      rows = [];
      message = '';
      return;
    }

    loading = true;
    errorMsg = '';
    rows = [];
    const request = docsGuard.next();

    try {
      const data = await apiFetch<SearchDocumentsResponse>(API_ENDPOINT, {
        method: 'GET',
        query: { docs },
        redirectOnForbidden: false,
        signal: request.signal
      });
      if (!docsGuard.isCurrent(request.seq)) return;
      rows = data.conciliacao_rows || [];
      if (!options.suppressSuccessMessage) {
        message = `${rows.length} linha(s) encontrada(s)`;
      }
    } catch (err: unknown) {
      if (isCanceledApiError(err)) return;
      errorMsg = (err as ApiErrorLike).message || 'Erro ao buscar dados';
    } finally {
      if (docsGuard.isCurrent(request.seq)) loading = false;
    }
  }

  async function searchUsers() {
    if (!userSearch.trim()) return;

    userSearchLoading = true;
    userResults = [];
    const request = usersGuard.next();

    try {
      const data = await apiFetch<SearchUsersResponse>(API_ENDPOINT, {
        method: 'GET',
        query: {
          busca_usuario: userSearch,
          empresa_id: fixCompanyId || undefined
        },
        redirectOnForbidden: false,
        signal: request.signal
      });
      if (!usersGuard.isCurrent(request.seq)) return;
      userResults = data.usuarios || [];
    } catch (err: unknown) {
      if (isCanceledApiError(err)) return;
      errorMsg = (err as ApiErrorLike).message || 'Erro ao buscar vendedores';
    } finally {
      if (usersGuard.isCurrent(request.seq)) userSearchLoading = false;
    }
  }

  async function applyFix() {
    if (!fixId) {
      errorMsg = 'Selecione um registro primeiro.';
      return;
    }

    loading = true;
    errorMsg = '';
    message = '';

    try {
      const body: FixRecibosPayload = { action: fixAction, id: fixId };

      if (fixAction === 'fix_vendor') {
        if (!fixVendedorId.trim()) {
          errorMsg = 'Informe o vendedor_id.';
          loading = false;
          return;
        }
        body.vendedor_id = fixVendedorId.trim();
      } else if (fixAction === 'fix_link') {
        if (!selectedCandidateId.trim()) {
          errorMsg = 'Selecione o recibo de venda que deve ser vinculado.';
          loading = false;
          return;
        }
        body.venda_recibo_id = selectedCandidateId.trim();
      } else if (fixAction === 'fix_valor') {
        let changed = false;
        if (fixValorLancamentos) {
          const parsed = parseMoneyInput(fixValorLancamentos);
          if (parsed == null) {
            errorMsg = 'valor_lancamentos invalido.';
            loading = false;
            return;
          }
          if (
            originalValorLancamentos == null ||
            Math.abs(parsed - originalValorLancamentos) > 0.009
          ) {
            body.valor_lancamentos = parsed;
            changed = true;
          }
        }
        if (fixValorVendaReal) {
          const parsed = parseMoneyInput(fixValorVendaReal);
          if (parsed == null) {
            errorMsg = 'valor_venda_real invalido.';
            loading = false;
            return;
          }
          if (
            originalValorVendaReal == null ||
            Math.abs(parsed - originalValorVendaReal) > 0.009
          ) {
            body.valor_venda_real = parsed;
            changed = true;
          }
        }
        if (!changed) {
          errorMsg = 'Altere pelo menos um valor antes de aplicar a correção.';
          loading = false;
          return;
        }
      }

      const data = await apiFetch<FixRecibosResponse>(API_ENDPOINT, {
        method: 'POST',
        body,
        redirectOnForbidden: false
      });
      await fetchDocs({ suppressSuccessMessage: true });
      const updated = Array.isArray(data.updated) ? data.updated[0] : data.updated;
      message = `Correção aplicada em ${updated?.documento || 'registro selecionado'}.`;
    } catch (err: unknown) {
      errorMsg = (err as ApiErrorLike).message || 'Erro ao aplicar correção';
    } finally {
      loading = false;
    }
  }

  function selectRow(row: ConcRow) {
    fixId = row.id;
    fixValorLancamentos = String(row.valor_lancamentos ?? '');
    fixValorVendaReal = String(row.valor_venda_real ?? '');
    originalValorLancamentos = Number(row.valor_lancamentos ?? 0);
    originalValorVendaReal = Number(row.valor_venda_real ?? 0);
    fixVendedorId = row.ranking_vendedor_id || '';
    fixCompanyId = row.company_id || '';
    selectedCandidates = row.candidatos || [];
    selectedCandidateId =
      selectedCandidates.length === 1
        ? selectedCandidates[0].id
        : selectedCandidates.find((candidate) => candidate.id === row.venda_recibo_id)?.id || '';
    fixAction = selectedCandidates.length > 0 ? 'fix_link' : 'fix_vendor';
    userResults = [];
    errorMsg = '';
    message = '';
  }

  function useUser(user: UserOption) {
    fixVendedorId = user.id;
    userResults = [];
    userSearch = user.nome_completo;
  }
</script>

<svelte:head>
  <title>Correção de recibos | VTUR</title>
</svelte:head>

<PageHeader
  title="Correção de recibos"
  subtitle="Ferramenta administrativa para diagnosticar e corrigir registros de conciliação."
  color="financeiro"
  breadcrumbs={[
    { label: 'Admin' },
    { label: 'Correção de recibos' }
  ]}
/>

<div class="space-y-4">
  <Card title="Busca">
    <div class="grid grid-cols-1 gap-3 lg:grid-cols-[1fr_auto] lg:items-end">
      <FieldInput
        label="Documentos"
        bind:value={docs}
        placeholder="Ex.: 5630-0000084181, 084181 ou 84181"
        helper="Use recibos completos ou apenas os números. A busca normaliza a formatação dos recibos."
      />
      <Button variant="primary" color="financeiro" loading={loading} on:click={() => fetchDocs()}>
        <Search size={16} class="mr-2" />
        Buscar
      </Button>
    </div>
  </Card>

  {#if errorMsg}
    <AlertMessage variant="error" title="Nao foi possivel concluir" message={errorMsg} />
  {/if}

  {#if message}
    <AlertMessage variant="success" message={message} />
  {/if}

  <SimpleTable title="Registros encontrados" empty={rows.length === 0 && !loading} emptyMessage="Nenhuma linha encontrada. Verifique os documentos informados.">
    <thead>
      <tr>
        <th>Documento</th>
        <th>Data</th>
        <th class="text-right">Valor lanc.</th>
        <th class="text-right">Valor real</th>
        <th>Vendedor atual</th>
        <th>Vínculo</th>
        <th>Candidatos</th>
        <th>Empresa</th>
        <th>ID</th>
        <th class="text-right">Acao</th>
      </tr>
    </thead>
    <tbody>
      {#each rows as row}
        <tr class={fixId === row.id ? 'bg-amber-50' : ''}>
          <td class="font-mono font-semibold">{row.documento}</td>
          <td>{row.movimento_data?.slice(0, 10)}</td>
          <td class="text-right font-mono {Number(row.valor_lancamentos) < 1000 ? 'font-semibold text-red-600' : ''}">
            {formatMoney(row.valor_lancamentos)}
          </td>
          <td class="text-right font-mono">{formatMoney(row.valor_venda_real)}</td>
          <td>{row.ranking_vendedor_nome || '-'}</td>
          <td class="font-mono text-xs text-slate-500">
            {row.venda_recibo_id ? row.venda_recibo_id.slice(0, 8) + '...' : '-'}
          </td>
          <td>{row.candidatos?.length || 0}</td>
          <td class="font-mono text-xs text-slate-400">{row.company_id?.slice(0, 8)}...</td>
          <td class="font-mono text-xs text-slate-400">{row.id?.slice(0, 8)}...</td>
          <td class="text-right">
            <Button variant="ghost" size="xs" on:click={() => selectRow(row)}>
              Selecionar
            </Button>
          </td>
        </tr>
      {/each}
    </tbody>
  </SimpleTable>

  <Card title="Aplicar correcao" subtitle="Use somente para ajustes auditados. A alteracao chama o endpoint administrativo existente.">
    <div class="space-y-4">
      <FieldInput
        label="ID do registro selecionado"
        bind:value={fixId}
        placeholder="Clique em Selecionar na tabela acima"
        readonly={Boolean(fixId)}
      />

      {#if fixCompanyId}
        <FieldInput
          label="Empresa do recibo"
          bind:value={fixCompanyId}
          readonly
          helper="A busca de vendedor usa esta empresa automaticamente para evitar correção cruzada."
        />
      {/if}

      <FieldSelect
        label="Tipo de correcao"
        bind:value={fixAction}
        options={FIX_OPTIONS}
        placeholder={null}
      />

      {#if fixAction === 'fix_link'}
        {#if selectedCandidates.length > 0}
          <div class="space-y-2">
            <p class="text-sm font-medium text-slate-700">Recibos de venda candidatos</p>
            <div class="overflow-hidden rounded-xl border border-slate-200 bg-white">
              {#each selectedCandidates as candidate}
                <Button
                  variant={selectedCandidateId === candidate.id ? 'selected' : 'ghost'}
                  class_name="w-full justify-between rounded-none border-b border-slate-100 text-left last:border-b-0"
                  on:click={() => (selectedCandidateId = candidate.id)}
                >
                  <span class="flex flex-col items-start gap-0.5">
                    <span class="font-semibold">{displayCandidateDoc(candidate)}</span>
                    <span class="text-xs text-slate-500">
                      {candidate.vendedor_nome} · {candidate.data_venda || 'sem data'}
                    </span>
                  </span>
                  <span class="font-mono text-xs text-slate-500">
                    {formatMoney(candidate.valor_total)}
                  </span>
                </Button>
              {/each}
            </div>
          </div>
        {:else}
          <AlertMessage
            variant="warning"
            title="Nenhum recibo candidato"
            message="Não há recibo de venda cadastrado com o mesmo número deste documento. Use a correção de vendedor/valor ou cadastre/importe a venda antes de vincular."
          />
        {/if}
      {:else if fixAction === 'fix_vendor'}
        <div class="grid grid-cols-1 gap-3 lg:grid-cols-[1fr_auto] lg:items-end">
          <FieldInput
            label="Buscar vendedor por nome"
            bind:value={userSearch}
            placeholder="Ex: Sandra"
            on:keydown={(e) => e.key === 'Enter' && searchUsers()}
          />
          <Button variant="secondary" loading={userSearchLoading} on:click={searchUsers}>
            Buscar vendedor
          </Button>
        </div>

        {#if userResults.length > 0}
          <div class="overflow-hidden rounded-xl border border-slate-200 bg-white">
            {#each userResults as user}
              <Button
                variant="ghost"
                class_name="w-full justify-start rounded-none border-b border-slate-100 text-left last:border-b-0"
                on:click={() => useUser(user)}
              >
                <span class="font-medium">{user.nome_completo}</span>
                <span class="ml-2 font-mono text-xs text-slate-400">{user.id}</span>
              </Button>
            {/each}
          </div>
        {/if}

        <FieldInput
          label="UUID do novo vendedor"
          bind:value={fixVendedorId}
          placeholder="Cole o UUID aqui ou use a busca acima"
        />
      {:else}
        <div class="grid grid-cols-1 gap-3 sm:grid-cols-2">
          <FieldInput
            label="Valor bruto lançado"
            type="number"
            step="0.01"
            bind:value={fixValorLancamentos}
            placeholder="ex: 18148.00"
            helper="Use quando o bruto da conciliação estiver errado."
          />
          <FieldInput
            label="Valor que deve entrar no ranking"
            type="number"
            step="0.01"
            bind:value={fixValorVendaReal}
            placeholder="ex: 18148.00"
            helper="Ao alterar somente este campo, o sistema ajusta o bruto considerando descontos e abatimentos."
          />
        </div>
      {/if}

      <div class="flex justify-end">
        <Button
          variant="primary"
          color="financeiro"
          loading={loading}
          disabled={loading || !fixId}
          on:click={applyFix}
        >
          <Wrench size={16} class="mr-2" />
          Aplicar correcao
        </Button>
      </div>
    </div>
  </Card>
</div>
