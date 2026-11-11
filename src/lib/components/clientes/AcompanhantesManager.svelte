<script lang="ts">
  import Card from '$lib/components/ui/Card.svelte';
  import Button from '$lib/components/ui/Button.svelte';
  import {
    FieldCheckbox,
    FieldInput,
    FieldSelect,
    FieldTextarea,
    LoadingState
  } from '$lib/components/ui';
  import { toast } from '$lib/stores/ui';
  import { Calendar, Phone, Save, Trash2, UserPlus, Users } from '$lib/icons';
  import { formatDate } from '$lib/utils/formatters';
  import { toUserMessage } from '$lib/utils/errors';
  import { formatDocumentoSalvo } from '$lib/features/clientes/form';
  import { validateOptionalCPF } from '$lib/utils/validation';

  import { confirmAction } from '$lib/stores/confirm';
  import { apiFetch, apiGet, isCanceledApiError } from '$lib/services/api';
  import { createLoadGuard } from '$lib/utils/loadGuard';
  type Acompanhante = {
    id: string;
    nome_completo: string;
    cpf: string | null;
    telefone: string | null;
    grau_parentesco: string | null;
    rg: string | null;
    data_nascimento: string | null;
    observacoes: string | null;
    ativo: boolean;
  };

  type AcompanhanteForm = {
    nome_completo: string;
    cpf: string;
    telefone: string;
    grau_parentesco: string;
    rg: string;
    data_nascimento: string;
    observacoes: string;
    ativo: boolean;
  };

  export let clienteId = '';
  export let editable = false;
  export let title = 'Acompanhantes';
  export let subtitle = 'Relacionamentos e passageiros vinculados ao cliente.';
  export let collapsible = false;

  let acompanhantes: Acompanhante[] = [];
  let loading = false;
  let saving = false;
  let deleting = false;
  let errorMessage: string | null = null;
  let selectedId = '';
  let loadedClienteId = '';
  const loadGuard = createLoadGuard();

  const parentescoOptions = [
    '',
    'Conjuge',
    'Filho(a)',
    'Pai/Mae',
    'Irmao(a)',
    'Amigo(a)',
    'Colega',
    'Outro'
  ];
  const parentescoSelectOptions = parentescoOptions
    .filter((option) => option)
    .map((option) => ({ value: option, label: option }));

  function createInitialForm(): AcompanhanteForm {
    return {
      nome_completo: '',
      cpf: '',
      telefone: '',
      grau_parentesco: '',
      rg: '',
      data_nascimento: '',
      observacoes: '',
      ativo: true
    };
  }

  let form = createInitialForm();

  $: if (clienteId && clienteId !== loadedClienteId) {
    loadedClienteId = clienteId;
    void loadAcompanhantes();
  }

  function fillForm(item: Acompanhante) {
    form = {
      nome_completo: String(item.nome_completo || ''),
      cpf: formatDocumentoSalvo(String(item.cpf || ''), 'PF'),
      telefone: String(item.telefone || ''),
      grau_parentesco: String(item.grau_parentesco || ''),
      rg: String(item.rg || ''),
      data_nascimento: String(item.data_nascimento || '').slice(0, 10),
      observacoes: String(item.observacoes || ''),
      ativo: item.ativo !== false
    };
  }

  async function loadAcompanhantes() {
    if (!clienteId) return;

    const request = loadGuard.next();
    loading = true;
    errorMessage = null;

    try {
      const payload = await apiGet<{ items?: Acompanhante[] }>(
        `/api/v1/clientes/${clienteId}/acompanhantes`,
        undefined,
        request.signal
      );
      if (!loadGuard.isCurrent(request.seq)) return;
      acompanhantes = Array.isArray(payload?.items) ? payload.items : [];

      if (selectedId) {
        const selected = acompanhantes.find((item) => item.id === selectedId);
        if (selected) {
          fillForm(selected);
        } else {
          selectedId = '';
          form = createInitialForm();
        }
      }
    } catch (error: unknown) {
      if (isCanceledApiError(error)) return;
      acompanhantes = [];
      errorMessage = toUserMessage(error, 'Erro ao carregar acompanhantes.');
    } finally {
      if (loadGuard.isCurrent(request.seq)) loading = false;
    }
  }

  function handleRowClick(item: Acompanhante) {
    selectedId = item.id;
    fillForm(item);
  }

  function novoAcompanhante() {
    selectedId = '';
    form = createInitialForm();
    errorMessage = null;
  }

  async function salvarAcompanhante() {
    if (!clienteId || !editable) return;

    if (!form.nome_completo.trim()) {
      toast.error('Informe o nome completo do acompanhante.');
      return;
    }
    if (!validateOptionalCPF(form.cpf)) {
      toast.error('CPF inválido. Confira os dígitos informados.');
      return;
    }

    saving = true;
    errorMessage = null;

    try {
      const method = selectedId ? 'PATCH' : 'POST';
      const url = selectedId
        ? `/api/v1/clientes/${clienteId}/acompanhantes/${selectedId}`
        : `/api/v1/clientes/${clienteId}/acompanhantes`;

      await apiFetch(url, {
        method,
        body: form
      });

      toast.success(selectedId ? 'Acompanhante atualizado.' : 'Acompanhante cadastrado.');
      await loadAcompanhantes();
      if (!selectedId) {
        novoAcompanhante();
      }
    } catch (error: unknown) {
      errorMessage = toUserMessage(error, 'Erro ao salvar acompanhante.');
      toast.error(errorMessage);
    } finally {
      saving = false;
    }
  }

  async function excluirAcompanhante() {
    if (!clienteId || !editable || !selectedId) return;
    if (!(await confirmAction('Deseja remover este acompanhante?'))) return;

    deleting = true;
    errorMessage = null;

    try {
      await apiFetch(`/api/v1/clientes/${clienteId}/acompanhantes/${selectedId}`, {
        method: 'DELETE'
      });

      toast.success('Acompanhante removido.');
      novoAcompanhante();
      await loadAcompanhantes();
    } catch (error: unknown) {
      errorMessage = toUserMessage(error, 'Erro ao remover acompanhante.');
      toast.error(errorMessage);
    } finally {
      deleting = false;
    }
  }
</script>

<Card {title} color="clientes" {collapsible}>
  <div class="space-y-4">
    <p class="text-sm text-slate-500">{subtitle}</p>

    {#if errorMessage}
      <div
        role="alert"
        class="rounded-vtur-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700"
      >
        {errorMessage}
      </div>
    {/if}

    <div class="rounded-vtur-xl overflow-x-auto border border-slate-200">
      <table class="table-mobile-cards w-full text-sm">
        <thead class="bg-slate-50">
          <tr>
            <th class="px-4 py-3 text-left font-semibold text-slate-600">Nome</th>
            <th class="px-4 py-3 text-left font-semibold text-slate-600">Parentesco</th>
            <th class="px-4 py-3 text-left font-semibold text-slate-600">Telefone</th>
            <th class="px-4 py-3 text-left font-semibold text-slate-600">Nascimento</th>
            <th class="px-4 py-3 text-left font-semibold text-slate-600">Status</th>
          </tr>
        </thead>
        <tbody class="divide-y divide-slate-200">
          {#if loading}
            <tr>
              <td colspan="5" class="px-4 py-8">
                <LoadingState compact={true} />
              </td>
            </tr>
          {:else if acompanhantes.length === 0}
            <tr>
              <td colspan="5" class="px-4 py-8 text-center text-slate-500"
                >Nenhum acompanhante cadastrado.</td
              >
            </tr>
          {:else}
            {#each acompanhantes as item}
              <tr
                class="cursor-pointer transition-colors hover:bg-slate-50"
                class:bg-clientes-50={item.id === selectedId}
                on:click={() => handleRowClick(item)}
              >
                <td class="px-4 py-3">
                  <div class="font-medium text-slate-900">{item.nome_completo}</div>
                  <div class="text-xs text-slate-500">{item.cpf || '-'}</div>
                </td>
                <td class="px-4 py-3 text-slate-700">{item.grau_parentesco || '-'}</td>
                <td class="px-4 py-3 text-slate-700">{item.telefone || '-'}</td>
                <td class="px-4 py-3 text-slate-700">
                  {formatDate(item.data_nascimento)}
                </td>
                <td class="px-4 py-3">
                  <span
                    class={`inline-flex rounded-full px-2.5 py-1 text-xs font-semibold ${
                      item.ativo ? 'bg-green-100 text-green-700' : 'bg-slate-200 text-slate-700'
                    }`}
                  >
                    {item.ativo ? 'Ativo' : 'Inativo'}
                  </span>
                </td>
              </tr>
            {/each}
          {/if}
        </tbody>
      </table>
    </div>

    {#if editable}
      <div class="rounded-vtur-xl border border-slate-200 bg-white p-5">
        <div class="mb-4 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <h3 class="text-base font-semibold text-slate-900">
              {selectedId ? 'Editar acompanhante' : 'Novo acompanhante'}
            </h3>
            <p class="text-sm text-slate-500">
              Clique na linha para editar ou cadastre um novo acompanhante.
            </p>
          </div>

          <div class="flex gap-2">
            <Button type="button" variant="secondary" on:click={novoAcompanhante}>
              <UserPlus size={16} class="mr-2" />
              Novo
            </Button>
            {#if selectedId}
              <Button
                type="button"
                variant="danger"
                on:click={excluirAcompanhante}
                disabled={deleting}
              >
                <Trash2 size={16} class="mr-2" />
                Excluir
              </Button>
            {/if}
          </div>
        </div>

        <div class="grid grid-cols-1 gap-4 md:grid-cols-2 lg:grid-cols-3">
          <FieldInput
            id="acomp-nome"
            label="Nome completo"
            bind:value={form.nome_completo}
            class_name="lg:col-span-2"
            placeholder="Nome do acompanhante"
            required
          />

          <FieldSelect
            id="acomp-parentesco"
            label="Parentesco"
            bind:value={form.grau_parentesco}
            options={parentescoSelectOptions}
            placeholder="Selecione uma opção"
          />

          <FieldInput
            id="acomp-cpf"
            documentType="cpf"
            label="CPF"
            bind:value={form.cpf}
            placeholder="CPF do acompanhante"
            mask="cpf"
          />

          <FieldInput
            id="acomp-telefone"
            label="Telefone"
            bind:value={form.telefone}
            placeholder="(00) 00000-0000"
            icon={Phone}
          />

          <FieldInput
            id="acomp-nascimento"
            label="Data de nascimento"
            bind:value={form.data_nascimento}
            type="date"
            icon={Calendar}
          />

          <FieldInput
            id="acomp-rg"
            label="RG"
            bind:value={form.rg}
            placeholder="Documento adicional"
          />

          <FieldTextarea
            id="acomp-observacoes"
            label="Observações"
            bind:value={form.observacoes}
            rows={3}
            class_name="lg:col-span-2"
            placeholder="Informações adicionais sobre o acompanhante..."
          />

          <div class="flex items-end">
            <FieldCheckbox
              id="acomp-ativo"
              label="Acompanhante ativo"
              bind:checked={form.ativo}
              color="clientes"
            />
          </div>
        </div>

        <div class="mt-4 flex justify-end">
          <Button
            type="button"
            variant="primary"
            color="clientes"
            on:click={salvarAcompanhante}
            loading={saving}
          >
            <Save size={16} class="mr-2" />
            {selectedId ? 'Salvar alteracoes' : 'Salvar acompanhante'}
          </Button>
        </div>
      </div>
    {:else if acompanhantes.length === 0}
      <div
        class="rounded-vtur-xl border border-dashed border-slate-300 bg-slate-50 px-5 py-8 text-center text-sm text-slate-500"
      >
        <Users size={24} class="mx-auto mb-2 text-slate-400" />
        Nenhum acompanhante vinculado a este cliente.
      </div>
    {/if}
  </div>
</Card>
