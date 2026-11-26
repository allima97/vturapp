<script lang="ts">
  import { FieldInput, FieldSelect, FieldTextarea } from '$lib/components/ui';
  import Dialog from '$lib/components/ui/Dialog.svelte';
  import { apiPost } from '$lib/services/api';
  import { toUserMessage } from '$lib/utils/errors';
  import type { ModoAplicacaoIA, PedidoRoteiroIA, RascunhoRoteiroIA } from '$lib/roteiroIA/tipos';

  let {
    open = $bindable(),
    inicial,
    onAplicar
  }: {
    open: boolean;
    /** Valores sugeridos a partir do que já está no roteiro. */
    inicial: Partial<PedidoRoteiroIA>;
    onAplicar: (rascunho: RascunhoRoteiroIA, modo: ModoAplicacaoIA) => void;
  } = $props();

  let origem = $state('');
  let destinos = $state('');
  let dataInicio = $state('');
  let dataFim = $state('');
  let adultos = $state('2');
  let criancas = $state('0');
  let perfil = $state('');
  let observacoes = $state('');
  let modo: ModoAplicacaoIA = $state('substituir');
  let novaVersao = $state(false);
  let gerando = $state(false);
  let erro = $state('');

  // Ao abrir, preenche com o que o roteiro já tem (sem sobrescrever o digitado).
  $effect(() => {
    if (!open) return;
    if (!origem && inicial.origem) origem = inicial.origem;
    if (!destinos && inicial.destinos?.length) destinos = inicial.destinos.join(', ');
    if (!dataInicio && inicial.data_inicio) dataInicio = inicial.data_inicio;
    if (!dataFim && inicial.data_fim) dataFim = inicial.data_fim;
  });

  async function gerar() {
    erro = '';
    const pedido: PedidoRoteiroIA = {
      origem: origem.trim(),
      destinos: destinos
        .split(/[,;\n]|→|->/)
        .map((d) => d.trim())
        .filter(Boolean),
      data_inicio: dataInicio,
      data_fim: dataFim,
      adultos: Number(adultos) || 0,
      criancas: Number(criancas) || 0,
      perfil: perfil.trim(),
      observacoes: observacoes.trim(),
      ...(novaVersao ? { nova_versao: true } : {})
    };
    if (!pedido.origem || !pedido.destinos.length || !pedido.data_inicio || !pedido.data_fim) {
      erro = 'Preencha origem, destinos e as datas de início e fim.';
      return;
    }
    gerando = true;
    try {
      // A geração pode levar até ~2 minutos em roteiros longos.
      const rascunho = await apiPost<RascunhoRoteiroIA>(
        '/api/v1/roteiros/gerar-ia',
        pedido,
        undefined,
        180_000
      );
      onAplicar(rascunho, modo);
      novaVersao = false;
      open = false;
    } catch (err) {
      erro = toUserMessage(err, 'Não foi possível gerar o roteiro com IA.');
    } finally {
      gerando = false;
    }
  }
</script>

<Dialog
  bind:open
  title="Gerar roteiro com IA"
  description="A IA preenche o dia a dia, os passeios opcionais e as inclusões. Valores, voos e nomes de hotel ficam para você. Nada é salvo até você clicar em Salvar."
  size="lg"
  color="clientes"
  showConfirm
  confirmText={gerando ? 'Gerando… pode levar até 2 minutos' : 'Gerar roteiro'}
  loading={gerando}
  confirmDisabled={gerando}
  onConfirm={gerar}
>
  <div class="grid grid-cols-1 gap-3 sm:grid-cols-2">
    <FieldInput label="Cidade de origem" required bind:value={origem} placeholder="São Paulo" />
    <FieldInput
      label="Destinos, na ordem"
      required
      bind:value={destinos}
      placeholder="Roma, Barcelona, Madri, Paris"
    />
    <FieldInput label="Início da viagem" type="date" required bind:value={dataInicio} />
    <FieldInput label="Fim da viagem" type="date" required bind:value={dataFim} />
    <FieldInput label="Adultos" type="number" min="1" bind:value={adultos} />
    <FieldInput label="Crianças" type="number" min="0" bind:value={criancas} />
    <div class="sm:col-span-2">
      <FieldInput
        label="Perfil da viagem"
        bind:value={perfil}
        placeholder="Ex.: casal em lua de mel, família com crianças pequenas, primeira vez na Europa"
      />
    </div>
    <div class="sm:col-span-2">
      <FieldTextarea
        label="Observações para a IA"
        bind:value={observacoes}
        rows={3}
        placeholder="Ex.: incluir um dia na Disneyland Paris; ritmo tranquilo; trem entre Barcelona e Madri."
      />
    </div>
    <div class="sm:col-span-2">
      <FieldSelect
        label="O que fazer com o que já está preenchido"
        bind:value={modo}
        options={[
          { value: 'substituir', label: 'Substituir dia a dia, opcionais e inclusões' },
          { value: 'juntar', label: 'Juntar ao que já existe' }
        ]}
      />
    </div>
    <label class="flex items-start gap-2 text-sm text-slate-700 sm:col-span-2">
      <input type="checkbox" class="mt-0.5" bind:checked={novaVersao} />
      <span>
        Gerar uma versão nova
        <span class="block text-xs text-slate-500">
          Sem marcar, se já existir um roteiro gerado com os mesmos destinos, duração, viajantes,
          perfil e observações, ele é reaproveitado na hora (sem custo de IA), com as datas deste
          pedido.
        </span>
      </span>
    </label>
  </div>
  {#if erro}
    <p role="alert" class="mt-3 text-sm text-red-700">{erro}</p>
  {/if}
</Dialog>
