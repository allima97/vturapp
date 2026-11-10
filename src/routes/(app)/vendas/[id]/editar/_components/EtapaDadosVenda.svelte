<script lang="ts">
  import { FieldInput, FieldSelect, FormPanel } from '$lib/components/ui';
  import CidadeAutocomplete from '$lib/components/vendas/CidadeAutocomplete.svelte';
  import CidadeGeograficaAutocomplete from '$lib/components/vendas/CidadeGeograficaAutocomplete.svelte';
  import { vendasGeograficasAtivas } from '$lib/config/destinosGeograficos';
  import type { EstadoCidadeGeografica } from '$lib/features/vendas/cidadeGeograficaEstado';
  import ClienteAutocomplete from '$lib/components/vendas/ClienteAutocomplete.svelte';
  import type { Cliente, Option, VendaEditForm } from './types';

  export let venda: VendaEditForm;
  export let errors: Record<string, string>;
  export let canAssignVendedor: boolean;
  export let vendedoresEquipe: Option[];
  export let clientes: Cliente[];
  export let clienteSelecionado: Cliente | null;
  export let cidades: Option[];
  export let mergeClientes: (items: Cliente[]) => void;
  export let mergeCidades: (items: Option[]) => void;
  export let estadoCidadeVenda: EstadoCidadeGeografica;
</script>

<FormPanel
  title="Dados da venda"
  description="Atualize os dados principais da venda"
  class_name="border-green-200"
>
  <div slot="header-actions"></div>
  <div class="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-4">
    {#if canAssignVendedor}
      <div>
        <FieldSelect
          id="venda-editar-vendedor"
          label="Vendedor"
          bind:value={venda.vendedor_id}
          options={[
            { value: '', label: 'Selecione uma opção' },
            ...vendedoresEquipe.map((vendedorEquipe) => ({
              value: vendedorEquipe.id,
              label: vendedorEquipe.nome_completo || 'Vendedor'
            }))
          ]}
          class_name="w-full"
          error={errors.vendedor_id}
          required
        />
      </div>
    {/if}

    <div class="md:col-span-2">
      <ClienteAutocomplete
        id="venda-editar-cliente"
        label="Cliente"
        required={true}
        bind:value={venda.cliente_id}
        clients={clientes}
        error={errors.cliente_id}
        on:loaded={(event) => mergeClientes(event.detail)}
      />
      {#if clienteSelecionado}
        <p class="mt-1 text-xs text-slate-500">
          {clienteSelecionado.email ||
            clienteSelecionado.whatsapp ||
            clienteSelecionado.telefone ||
            'Cliente selecionado'}
        </p>
      {/if}
      {#if errors.cliente_id}<p role="alert" class="mt-1 text-xs text-red-600">
          {errors.cliente_id}
        </p>{/if}
    </div>

    <div>
      {#if vendasGeograficasAtivas}
        <CidadeGeograficaAutocomplete
          id="venda-editar-cidade"
          label="Cidade de destino"
          bind:value={venda.destino_cidade_id}
          cities={cidades}
          estado={estadoCidadeVenda}
          error={errors.destino_cidade_id}
          on:loaded={(event) => mergeCidades(event.detail)}
        />
      {:else}
        <CidadeAutocomplete
          id="venda-editar-cidade"
          label="Cidade de destino"
          placeholder="Digite a cidade (ex.: Orlando)"
          bind:value={venda.destino_cidade_id}
          cities={cidades}
          error={errors.destino_cidade_id}
          on:loaded={(event) => mergeCidades(event.detail)}
        />
      {/if}
      <p class="mt-1 text-xs text-slate-500">
        Use esta cidade em todos os recibos por padrão. Você pode trocar em recibos específicos na
        etapa seguinte.
      </p>
    </div>

    <div>
      <FieldInput
        id="venda-editar-data-lancamento"
        label="Lançada em"
        type="date"
        bind:value={venda.data_lancamento}
        class_name="w-full"
      />
    </div>
    <div>
      <FieldInput
        id="venda-editar-data-venda"
        label="Data da venda"
        type="date"
        bind:value={venda.data_venda}
        class_name="w-full"
        error={errors.data_venda}
        required
      />
    </div>
    <div>
      <FieldInput
        id="venda-editar-data-embarque"
        label="Data de embarque"
        type="date"
        bind:value={venda.data_embarque}
        class_name="w-full"
        error={errors.data_embarque}
        required
      />
    </div>
    <div>
      <FieldInput
        id="venda-editar-data-final"
        label="Data final"
        type="date"
        bind:value={venda.data_final}
        min={venda.data_embarque || null}
        class_name="w-full"
        error={errors.data_final}
        required
      />
    </div>
  </div>
</FormPanel>
