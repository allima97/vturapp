<script lang="ts">
  import { Button, FieldCheckbox, FieldInput, FieldSelect, FormPanel } from '$lib/components/ui';
  import CidadeAutocomplete from '$lib/components/vendas/CidadeAutocomplete.svelte';
  import CidadeGeograficaAutocomplete from '$lib/components/vendas/CidadeGeograficaAutocomplete.svelte';
  import { vendasGeograficasAtivas } from '$lib/config/destinosGeograficos';
  import { getCidadeLabel } from '$lib/features/vendas/form';
  import { Plus, Receipt, Trash2 } from '$lib/icons';
  import type { Option, ReciboEditForm } from './types';

  export let recibos: ReciboEditForm[];
  export let errors: Record<string, string>;
  export let cidades: Option[];
  export let tipos: Option[];
  export let tiposPacote: Option[];
  export let addRecibo: () => void;
  export let removeRecibo: (index: number) => void;
  export let toggleReciboCidadePadrao: (index: number, checked: boolean) => void;
  export let getCidadeById: (cidadeId: string) => Option | null;
  export let getReciboCidadeId: (recibo: ReciboEditForm) => string;
  export let syncReciboCidade: (index: number, cidadeId: string) => void;
  export let mergeCidades: (items: Option[]) => void;
  export let syncReciboTipoProduto: (index: number, event?: Event) => void;
  export let getProdutosOptionsRecibo: (recibo: ReciboEditForm) => Option[];
  export let updateReciboProduto: (index: number, event?: Event) => void;
</script>

<FormPanel
  title="Recibos da venda"
  description="Atualize os recibos associados à venda"
  class_name="border-green-200"
>
  <div class="mb-4 flex items-center justify-between">
    <div>
      <p class="text-sm text-slate-600">
        Cada recibo tem seu próprio produto, cidade, comissionamento e conciliação. A venda apenas
        agrupa a viagem do cliente.
      </p>
      {#if errors.recibos}<p role="alert" class="mt-1 text-xs text-red-600">
          {errors.recibos}
        </p>{/if}
    </div>
    <Button type="button" variant="secondary" on:click={addRecibo}
      ><Plus size={16} class="mr-2" />Adicionar recibo</Button
    >
  </div>

  <div class="space-y-4">
    {#each recibos as recibo, index (vendasGeograficasAtivas ? recibo.estadoCidade : index)}
      <div class="rounded-xl border border-slate-200 p-4">
        <div class="mb-3 flex items-center justify-between">
          <div class="flex items-center gap-3">
            <div class="rounded-lg bg-green-50 p-2 text-green-700"><Receipt size={18} /></div>
            <p class="font-semibold text-slate-900">Recibo {index + 1}</p>
          </div>
          <div class="flex items-center gap-2">
            <Button type="button" variant="ghost" on:click={() => removeRecibo(index)}
              ><Trash2 size={16} /></Button
            >
          </div>
        </div>

        <div class="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-4">
          <div
            class="rounded-lg border border-slate-200 bg-slate-50 p-3 md:col-span-2 xl:col-span-4"
          >
            <div class="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
              <FieldCheckbox
                label="Usar cidade padrão da venda"
                checked={recibo.usar_cidade_padrao}
                on:change={(event) =>
                  toggleReciboCidadePadrao(index, (event.target as HTMLInputElement)?.checked)}
              />
              <p class="text-xs text-slate-500">
                Cidade deste recibo:
                <strong class="text-slate-700"
                  >{getCidadeLabel(
                    getCidadeById(getReciboCidadeId(recibo)) || { id: '', nome: 'Não informada' }
                  )}</strong
                >
              </p>
            </div>
            {#if !recibo.usar_cidade_padrao}
              <div class="mt-3">
                {#if vendasGeograficasAtivas}
                  <CidadeGeograficaAutocomplete
                    id={`venda-editar-recibo-cidade-${index}`}
                    label="Cidade deste recibo"
                    required={true}
                    bind:value={recibo.destino_cidade_id}
                    cities={cidades}
                    estado={recibo.estadoCidade}
                    error={errors[`recibo_cidade_${index}`]}
                    on:loaded={(event) => mergeCidades(event.detail)}
                    on:select={(event) => syncReciboCidade(index, String(event.detail?.id || ''))}
                  />
                {:else}
                  <CidadeAutocomplete
                    id={`venda-editar-recibo-cidade-${index}`}
                    label="Cidade deste recibo"
                    required={true}
                    bind:value={recibo.destino_cidade_id}
                    cities={cidades}
                    error={errors[`recibo_cidade_${index}`]}
                    on:loaded={(event) => mergeCidades(event.detail)}
                    on:select={(event) => syncReciboCidade(index, String(event.detail?.id || ''))}
                  />
                {/if}
              </div>
            {/if}
          </div>
          <div>
            <FieldSelect
              id={`venda-editar-recibo-tipo-${index}`}
              label="Tipo de produto"
              bind:value={recibo.tipo_produto_id}
              options={[
                { value: '', label: 'Selecione uma opção' },
                ...tipos.map((tipo) => ({ value: tipo.id, label: tipo.nome || tipo.tipo || '' }))
              ]}
              class_name="w-full"
              error={errors[`recibo_tipo_${index}`]}
              required
              on:change={(event) => syncReciboTipoProduto(index, event)}
            />
          </div>
          <div>
            <FieldSelect
              id={`venda-editar-recibo-produto-${index}`}
              label="Produto"
              bind:value={recibo.produto_id}
              options={[
                { value: '', label: 'Selecione uma opção' },
                ...getProdutosOptionsRecibo(recibo).map((produto) => ({
                  value: produto.id,
                  label: produto.nome || ''
                }))
              ]}
              class_name="w-full"
              error={errors[`recibo_produto_${index}`]}
              required
              on:change={(event) => updateReciboProduto(index, event)}
            />
          </div>
          <div>
            <FieldInput
              id={`venda-editar-recibo-numero-${index}`}
              label="Número recibo"
              bind:value={recibo.numero_recibo}
              class_name="w-full"
              error={errors[`recibo_numero_${index}`]}
              required
            />
          </div>
          <div>
            <FieldInput
              id={`venda-editar-recibo-reserva-${index}`}
              label="Reserva"
              bind:value={recibo.numero_reserva}
              class_name="w-full"
            />
          </div>
          <div>
            <FieldSelect
              id={`venda-editar-recibo-pacote-${index}`}
              label="Tipo de pacote"
              bind:value={recibo.tipo_pacote}
              options={[
                { value: '', label: 'Selecione uma opção' },
                ...tiposPacote.map((pacote) => ({
                  value: pacote.nome || pacote.label || '',
                  label: pacote.nome || pacote.label || ''
                }))
              ]}
              class_name="w-full"
              error={errors[`recibo_pacote_${index}`]}
              required
            />
          </div>
          <div>
            <FieldInput
              id={`venda-editar-recibo-inicio-${index}`}
              label="Data início"
              type="date"
              bind:value={recibo.data_inicio}
              class_name="w-full"
              error={errors[`recibo_inicio_${index}`]}
              required
            />
          </div>
          <div>
            <FieldInput
              id={`venda-editar-recibo-fim-${index}`}
              label="Data fim"
              type="date"
              bind:value={recibo.data_fim}
              min={recibo.data_inicio || null}
              class_name="w-full"
              error={errors[`recibo_fim_${index}`]}
              required
            />
          </div>
          <div>
            <FieldInput
              money
              id={`venda-editar-recibo-total-${index}`}
              label="Valor total"
              bind:value={recibo.valor_total}
              class_name="w-full"
              error={errors[`recibo_total_${index}`]}
              required
            />
          </div>
          <div>
            <FieldInput
              money
              id={`venda-editar-recibo-taxas-${index}`}
              label="Taxas"
              bind:value={recibo.valor_taxas}
              class_name="w-full"
            />
          </div>
          <div>
            <FieldInput
              money
              id={`venda-editar-recibo-du-${index}`}
              label="DU"
              bind:value={recibo.valor_du}
              class_name="w-full"
            />
          </div>
          <div>
            <FieldInput
              money
              id={`venda-editar-recibo-rav-${index}`}
              label="RAV/RAC"
              bind:value={recibo.valor_rav}
              class_name="w-full"
            />
          </div>
          <div>
            <FieldInput
              id={`venda-editar-recibo-contrato-url-${index}`}
              label="Contrato (URL)"
              bind:value={recibo.contrato_url}
              class_name="w-full"
            />
          </div>
          <div>
            <FieldInput
              id={`venda-editar-recibo-contrato-path-${index}`}
              label="Contrato (Path)"
              bind:value={recibo.contrato_path}
              class_name="w-full"
            />
          </div>
        </div>
      </div>
    {/each}
  </div>
</FormPanel>
