<script lang="ts">
  import Button from '$lib/components/ui/Button.svelte';
  import Dialog from '$lib/components/ui/Dialog.svelte';
  import { FieldInput, FieldTextarea } from '$lib/components/ui';
  import CidadeDestinoAutocomplete from '$lib/components/CidadeDestinoAutocomplete.svelte';
  import SeletorDestinoGeografico from '$lib/components/SeletorDestinoGeografico.svelte';
  import { MAX_OPCIONAIS_IMPORTACAO } from '$lib/importarOpcionais';
  import { apiPost } from '$lib/services/api';
  import { toast } from '$lib/stores/ui';
  import { toUserMessage } from '$lib/utils/errors';
  import { Plus } from '$lib/icons';

  export let open = false;
  export let geografico = false;
  export let onSaved: () => void;

  let cidade = '';
  let cidadeId = '';
  let destinoValido = false;
  let proximoId = 1;
  let passeios = [{ id: 0, nome: '', descricao: '' }];
  let salvando = false;

  function adicionarPasseio() {
    if (passeios.length >= MAX_OPCIONAIS_IMPORTACAO) return;
    passeios = [...passeios, { id: proximoId++, nome: '', descricao: '' }];
  }

  async function salvar() {
    if (salvando) return;
    if (!cidade.trim()) {
      toast.error('Informe a cidade dos passeios.');
      return;
    }
    if (geografico && (!cidadeId || !destinoValido)) {
      toast.error('Selecione e confirme o destino geográfico.');
      return;
    }
    const invalido = passeios.findIndex(
      (passeio) =>
        !passeio.nome.trim() ||
        passeio.nome.trim().length > 300 ||
        passeio.descricao.trim().length > 20000
    );
    if (invalido !== -1) {
      toast.error(
        `Confira o passeio ${invalido + 1}: informe o título (até 300 caracteres) e uma descrição de até 20.000 caracteres.`
      );
      return;
    }

    salvando = true;
    try {
      const resultado = await apiPost<{ importados: number; ignorados: number }>(
        '/api/v1/opcionais/importar',
        {
          items: passeios.map(({ nome, descricao }) => ({
            cidade: cidade.trim(),
            ...(geografico ? { cidade_id: cidadeId } : {}),
            nome: nome.trim(),
            descricao: descricao.trim()
          }))
        }
      );
      toast.success(
        `${resultado.importados} passeio(s) cadastrado(s); ${resultado.ignorados} duplicado(s) ignorado(s).`
      );
      open = false;
      onSaved();
    } catch (err) {
      toast.error(toUserMessage(err, 'Erro ao cadastrar passeios em lote.'));
    } finally {
      salvando = false;
    }
  }
</script>

<Dialog
  bind:open
  title="Adicionar opcionais em lote"
  description="Selecione uma cidade e informe os passeios que pertencem a ela."
  size="lg"
  showConfirm
  confirmText="Salvar passeios"
  loading={salvando}
  dismissable={!salvando}
  onConfirm={salvar}
>
  <div class="space-y-4">
    {#if geografico}
      <SeletorDestinoGeografico
        fieldId="lote-opcional-cidade"
        label="Cidade"
        bind:value={cidade}
        bind:destinoId={cidadeId}
        bind:valid={destinoValido}
        disabled={salvando}
        required
      />
    {:else}
      <CidadeDestinoAutocomplete
        id="lote-opcional-cidade"
        label="Cidade"
        bind:value={cidade}
        endpoint="/api/v1/opcionais/cidades"
        disabled={salvando}
        required
      />
    {/if}

    {#each passeios as passeio, index (passeio.id)}
      <fieldset class="space-y-3 rounded-lg border border-slate-200 p-3">
        <legend class="px-1 text-sm font-semibold text-slate-700">Passeio {index + 1}</legend>
        <FieldInput
          id={`lote-opcional-nome-${passeio.id}`}
          label="Título do passeio"
          bind:value={passeio.nome}
          maxlength={300}
          disabled={salvando}
          required
        />
        <FieldTextarea
          id={`lote-opcional-descricao-${passeio.id}`}
          label="Descrição"
          bind:value={passeio.descricao}
          rows={3}
          disabled={salvando}
        />
        {#if passeios.length > 1}
          <Button
            type="button"
            variant="secondary"
            size="sm"
            disabled={salvando}
            on:click={() => (passeios = passeios.filter((item) => item.id !== passeio.id))}
          >
            Remover passeio {index + 1}
          </Button>
        {/if}
      </fieldset>
    {/each}
    <Button
      type="button"
      variant="secondary"
      disabled={salvando || passeios.length >= MAX_OPCIONAIS_IMPORTACAO}
      on:click={adicionarPasseio}
    >
      <Plus size={16} class="mr-2" />Adicionar outro passeio
    </Button>
    <p class="text-sm text-slate-500">
      Até {MAX_OPCIONAIS_IMPORTACAO} passeios por vez. Nomes já cadastrados na mesma cidade serão ignorados.
    </p>
  </div>
</Dialog>
