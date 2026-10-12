<script lang="ts">
  import { onMount } from 'svelte';
  import { DollarSign, Percent, Settings, Plus, Trash2, AlertTriangle, CheckCircle } from '$lib/icons';
  import Button from '$lib/components/ui/Button.svelte';
  import { FieldInput, FieldSelect } from '$lib/components/ui';

  // ─── Tipos ────────────────────────────────────────────────────────────────
  interface FaixaCredito {
    de: number;   // parcelas de
    ate: number;  // parcelas até
    desconto: number; // %
  }

  interface FormaPagamento {
    id: string;
    label: string;
    tipo: 'simples' | 'credito'; // simples = desconto fixo; credito = faixas
    desconto?: number;
    faixas?: FaixaCredito[];
    maxParcelas?: number;
  }

  interface ConfigFormas {
    padrao: FormaPagamento[];
    ingressos: FormaPagamento[];
  }

  // ─── Formas de pagamento padrão ────────────────────────────────────────────
  const FORMAS_PADRAO_DEFAULT: FormaPagamento[] = [
    { id: 'pix', label: 'PIX QR Code', tipo: 'simples', desconto: 5 },
    { id: 'debito', label: 'Débito', tipo: 'simples', desconto: 3 },
    {
      id: 'credito', label: 'Cartão de Crédito', tipo: 'credito',
      maxParcelas: 12,
      faixas: [
        { de: 1, ate: 2, desconto: 4 },
        { de: 3, ate: 4, desconto: 3.5 },
        { de: 5, ate: 6, desconto: 3 },
        { de: 7, ate: 8, desconto: 2 },
        { de: 9, ate: 10, desconto: 1.5 },
        { de: 11, ate: 12, desconto: 0 },
      ]
    },
    { id: 'deposito', label: 'Depósito da agência', tipo: 'simples', desconto: 3 },
    { id: 'boleto', label: 'Boleto à Vista', tipo: 'simples', desconto: 3 },
  ];

  const FORMAS_INGRESSOS_DEFAULT: FormaPagamento[] = [
    { id: 'pix', label: 'PIX QR Code', tipo: 'simples', desconto: 3 },
    { id: 'debito', label: 'Débito', tipo: 'simples', desconto: 3 },
    {
      id: 'credito', label: 'Cartão de Crédito', tipo: 'credito',
      maxParcelas: 8,
      faixas: [
        { de: 1, ate: 2, desconto: 2.5 },
        { de: 3, ate: 4, desconto: 2 },
        { de: 5, ate: 6, desconto: 1.5 },
        { de: 7, ate: 8, desconto: 0 },
      ]
    },
    { id: 'deposito', label: 'Depósito da agência', tipo: 'simples', desconto: 3 },
    { id: 'boleto', label: 'Boleto à Vista', tipo: 'simples', desconto: 3 },
  ];

  // ─── Tipos de Pacote ───────────────────────────────────────────────────────
  const TIPOS_PACOTE = [
    { value: '', label: 'Selecione o tipo de pacote' },
    { value: 'pacote', label: 'Pacote' },
    { value: 'hotel', label: 'Hotel' },
    { value: 'passagem', label: 'Passagem Aérea' },
    { value: 'disney', label: 'Ingresso Disney' },
    { value: 'universal', label: 'Ingresso Universal' },
    { value: 'seguro', label: 'Seguro Viagem' },
  ];

  // ─── Estado ────────────────────────────────────────────────────────────────
  let config: ConfigFormas = { padrao: [], ingressos: [] };
  let abaConfig: 'padrao' | 'ingressos' = 'padrao';
  let mostrarConfig = false;

  let calc = {
    valorAgencia: 0,
    valorConcorrente: 0,
    descontoAutorizadoPct: 0, // entrada manual do usuário
    tipoPacote: '',
    formaPagamentoId: '',
    parcelas: 1,
    valorTaxas: 0,
  };

  // Nova forma (modal de configuração)
  let novaForma = { label: '', tipo: 'simples' as 'simples' | 'credito', desconto: 0 };

  // ─── Persistência via localStorage ────────────────────────────────────────
  const STORAGE_KEY = 'vtur_concorrencia_formas';
  const BRL_CURRENCY_FORMATTER = new Intl.NumberFormat('pt-BR', {
    style: 'currency',
    currency: 'BRL'
  });
  const fieldClass = 'vtur-concorrencia-field';

  function carregarConfig() {
    try {
      const saved = localStorage.getItem(STORAGE_KEY);
      if (saved) {
        config = JSON.parse(saved);
      } else {
        config = { padrao: FORMAS_PADRAO_DEFAULT, ingressos: FORMAS_INGRESSOS_DEFAULT };
      }
    } catch {
      config = { padrao: FORMAS_PADRAO_DEFAULT, ingressos: FORMAS_INGRESSOS_DEFAULT };
    }
  }

  function salvarConfig() {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(config));
    } catch {
      // Persisting calculator preferences is optional; keep the modal usable.
    }
  }

  onMount(() => {
    carregarConfig();
  });

  // ─── Derivados ─────────────────────────────────────────────────────────────
  $: ehIngresso = calc.tipoPacote === 'disney' || calc.tipoPacote === 'universal';
  $: formasDisponiveis = ehIngresso ? config.ingressos : config.padrao;

  $: formaSelecionada = formasDisponiveis.find(f => f.id === calc.formaPagamentoId) ?? null;
  $: ehCredito = formaSelecionada?.tipo === 'credito';

  $: maxParcelas = formaSelecionada?.maxParcelas ?? 12;
  $: opcoesParcelas = ehCredito
    ? [
        { value: '1', label: 'À vista (sem parcelamento)' },
        ...Array.from({ length: maxParcelas - 1 }, (_, i) => ({
          value: String(i + 2),
          label: `${i + 2}x`
        }))
      ]
    : [{ value: '1', label: 'À vista' }];

  // Diferença Agência vs Concorrente
  $: diferencaReais = calc.valorAgencia - calc.valorConcorrente;
  $: diferencaPct = calc.valorAgencia > 0 ? (diferencaReais / calc.valorAgencia) * 100 : 0;

  // Desconto autorizado — informado manualmente pelo usuário
  $: descontoAutorizadoReais = calc.valorAgencia * (calc.descontoAutorizadoPct / 100);

  // Valor final após concorrência
  $: valorFinalConcorrencia = calc.valorAgencia - descontoAutorizadoReais;

  // Desconto da forma de pagamento
  $: descontoFormaPct = (() => {
    if (!formaSelecionada) return 0;
    if (formaSelecionada.tipo === 'simples') return formaSelecionada.desconto ?? 0;
    // crédito: busca faixa pela qtde de parcelas
    const p = calc.parcelas;
    const faixa = formaSelecionada.faixas?.find(f => p >= f.de && p <= f.ate);
    return faixa?.desconto ?? 0;
  })();

  // Taxas sempre excluídas da base de desconto quando informadas
  $: temTaxas = calc.valorTaxas > 0;
  $: baseDesconto = temTaxas
    ? Math.max(0, valorFinalConcorrencia - calc.valorTaxas)
    : valorFinalConcorrencia;

  $: valorDescontoForma = baseDesconto * (descontoFormaPct / 100);
  $: totalAPagar = temTaxas
    ? (baseDesconto - valorDescontoForma) + calc.valorTaxas
    : valorFinalConcorrencia - valorDescontoForma;
  $: valorParcela = calc.parcelas > 1 ? totalAPagar / calc.parcelas : totalAPagar;

  // ─── Helpers ───────────────────────────────────────────────────────────────
  function fmt(v: number) {
    return BRL_CURRENCY_FORMATTER.format(v || 0);
  }
  function fmtPct(v: number) {
    return (v || 0).toFixed(2).replace('.', ',') + '%';
  }

  // Ao mudar tipo do pacote, reseta apenas forma e parcelas
  let tipoPacoteAnterior = '';
  $: if (calc.tipoPacote !== tipoPacoteAnterior) {
    tipoPacoteAnterior = calc.tipoPacote;
    calc.formaPagamentoId = '';
    calc.parcelas = 1;
  }

  function limpar() {
    tipoPacoteAnterior = '';
    calc = {
      valorAgencia: 0,
      valorConcorrente: 0,
      descontoAutorizadoPct: 0,
      tipoPacote: '',
      formaPagamentoId: '',
      parcelas: 1,
      valorTaxas: 0,
    };
  }

  // ─── Configuração de Formas ────────────────────────────────────────────────
  function adicionarForma() {
    if (!novaForma.label.trim()) return;
    const id = novaForma.label.toLowerCase().replace(/\s+/g, '_') + '_' + Date.now();
    const forma: FormaPagamento = {
      id,
      label: novaForma.label,
      tipo: novaForma.tipo,
      desconto: novaForma.tipo === 'simples' ? novaForma.desconto : 0,
      faixas: novaForma.tipo === 'credito' ? [] : undefined,
    };
    if (abaConfig === 'padrao') {
      config.padrao = [...config.padrao, forma];
    } else {
      config.ingressos = [...config.ingressos, forma];
    }
    salvarConfig();
    novaForma = { label: '', tipo: 'simples', desconto: 0 };
  }

  function resetForma() {
    novaForma = { label: '', tipo: 'simples', desconto: 0 };
  }

  function removerForma(id: string, grupo: 'padrao' | 'ingressos') {
    if (grupo === 'padrao') {
      config.padrao = config.padrao.filter(f => f.id !== id);
    } else {
      config.ingressos = config.ingressos.filter(f => f.id !== id);
    }
    salvarConfig();
    resetForma();
  }

  function atualizarDesconto(id: string, grupo: 'padrao' | 'ingressos', novoDesc: number) {
    const arr = grupo === 'padrao' ? config.padrao : config.ingressos;
    const idx = arr.findIndex(f => f.id === id);
    if (idx >= 0) arr[idx].desconto = novoDesc;
    config = { ...config };
    salvarConfig();
  }

  function atualizarFaixa(id: string, grupo: 'padrao' | 'ingressos', fi: number, novoDesc: number) {
    const arr = grupo === 'padrao' ? config.padrao : config.ingressos;
    const forma = arr.find(f => f.id === id);
    if (forma?.faixas) forma.faixas[fi].desconto = novoDesc;
    config = { ...config };
    salvarConfig();
  }

  function restaurarPadrao() {
    if (abaConfig === 'padrao') {
      config.padrao = JSON.parse(JSON.stringify(FORMAS_PADRAO_DEFAULT));
    } else {
      config.ingressos = JSON.parse(JSON.stringify(FORMAS_INGRESSOS_DEFAULT));
    }
    salvarConfig();
    config = { ...config };
  }
</script>

<div class="space-y-5">

  <!-- ── Cabeçalho da seção ────────────────────────────────────────────── -->
  <div class="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
    <div>
      <h4 class="text-xl font-semibold text-slate-900">Análise de Concorrência</h4>
      <p class="mt-1 text-sm leading-5 text-slate-500">Compare valores e calcule o melhor preço final para o cliente</p>
    </div>
    <Button
      type="button"
      variant="ghost"
      size="sm"
      class_name="w-full justify-center gap-2 rounded-xl border border-slate-200 bg-white px-4 py-2.5 text-slate-600 shadow-xs hover:border-indigo-200 hover:text-indigo-600 sm:w-auto"
      on:click={() => mostrarConfig = !mostrarConfig}
    >
      <Settings size={17} />
      <span class="text-sm font-medium">Formas de Pagamento</span>
    </Button>
  </div>

  <!-- ── Painel de Configuração de Formas ─────────────────────────────── -->
  {#if mostrarConfig}
    <div class="rounded-xl border border-indigo-100 bg-indigo-50/60 p-5 space-y-4">
      <div class="flex items-center justify-between flex-wrap gap-2">
        <h5 class="text-base font-semibold text-indigo-800">⚙️ Configurar Formas de Pagamento</h5>
        <div class="flex gap-2">
          <Button type="button" variant="ghost" size="sm"
            class_name={abaConfig === 'padrao' ? 'bg-white border border-indigo-200 text-indigo-700' : 'text-slate-500'}
            on:click={() => abaConfig = 'padrao'}>
            Pacotes / Hotel / Aéreo / Seguro
          </Button>
          <Button type="button" variant="ghost" size="sm"
            class_name={abaConfig === 'ingressos' ? 'bg-white border border-indigo-200 text-indigo-700' : 'text-slate-500'}
            on:click={() => abaConfig = 'ingressos'}>
            Ingressos (Disney / Universal)
          </Button>
        </div>
      </div>

      <div class="space-y-2">
        {#each (abaConfig === 'padrao' ? config.padrao : config.ingressos) as forma (forma.id)}
          <div class="bg-white rounded-lg border border-slate-100 p-3">
            <div class="flex items-center justify-between gap-3">
              <span class="text-base font-medium text-slate-700 flex-1">{forma.label}</span>
              {#if forma.tipo === 'simples'}
                <div class="flex items-center gap-2">
                  <span class="text-sm text-slate-500">Desconto:</span>
                  <FieldInput
                    label="Desconto"
                    srLabel
                    type="number"
                    min="0"
                    max="100"
                    step="0.5"
                    value={forma.desconto}
                    on:change={(e) => atualizarDesconto(forma.id, abaConfig, Number((e.target as HTMLInputElement).value))}
                    class_name="w-20 [&_input]:text-center"
                  />
                  <span class="text-sm text-slate-500">%</span>
                </div>
              {:else}
                <span class="text-sm bg-indigo-100 text-indigo-700 px-2 py-0.5 rounded-full">Crédito (faixas)</span>
              {/if}
              <Button type="button" variant="ghost" size="sm" class_name="text-red-400 hover:text-red-600 p-1"
                on:click={() => removerForma(forma.id, abaConfig)}>
                <Trash2 size={16} />
              </Button>
            </div>
            {#if forma.tipo === 'credito' && forma.faixas}
              <div class="mt-2 grid grid-cols-3 gap-2">
                {#each forma.faixas as faixa, fi}
                  <div class="flex items-center gap-2 text-sm text-slate-600">
                    <span class="w-24">{faixa.de === faixa.ate ? `${faixa.de}x` : `${faixa.de}–${faixa.ate}x`}:</span>
                    <FieldInput
                      label="Desconto da faixa"
                      srLabel
                      type="number"
                      min="0"
                      max="100"
                      step="0.5"
                      value={faixa.desconto}
                      on:change={(e) => atualizarFaixa(forma.id, abaConfig, fi, Number((e.target as HTMLInputElement).value))}
                      class_name="w-16 [&_input]:text-center"
                    />
                    <span>%</span>
                  </div>
                {/each}
              </div>
            {/if}
          </div>
        {/each}
      </div>

      <div class="border-t border-indigo-100 pt-3 space-y-2">
        <p class="text-sm font-semibold text-indigo-700">Adicionar nova forma de pagamento:</p>
        <div class="flex gap-2 items-end flex-wrap">
          <FieldInput
            label="Nome da forma"
            srLabel
            bind:value={novaForma.label}
            placeholder="Nome da forma (ex: Transferência)"
            class_name="min-w-40 flex-1"
          />
          <FieldSelect
            label="Tipo da forma"
            srLabel
            bind:value={novaForma.tipo}
            options={[
              { value: 'simples', label: 'Desconto fixo' },
              { value: 'credito', label: 'Crédito (faixas)' }
            ]}
            placeholder={null}
            class_name="min-w-40"
          />
          {#if novaForma.tipo === 'simples'}
            <div class="flex items-center gap-1">
              <FieldInput
                label="Desconto"
                srLabel
                type="number"
                min="0"
                max="100"
                step="0.5"
                bind:value={novaForma.desconto}
                class_name="w-20 [&_input]:text-center"
              />
              <span class="text-sm text-slate-500">%</span>
            </div>
          {/if}
          <Button type="button" variant="primary" color="vendas" size="sm" on:click={adicionarForma}>
            <Plus size={16} />
          </Button>
        </div>
      </div>

      <div class="flex justify-end">
        <Button type="button" variant="ghost" size="sm" class_name="text-slate-500"
          on:click={restaurarPadrao}>
          Restaurar padrão
        </Button>
      </div>
    </div>
  {/if}

  <!-- ── Grid principal 3 colunas: Entradas | Forma de Pagamento | Resultados ── -->
  <div class="grid grid-cols-1 gap-5 lg:grid-cols-[minmax(280px,0.9fr)_minmax(340px,1.15fr)_minmax(290px,0.95fr)] lg:items-start">

    <!-- ════ Coluna 1 — Entradas ════ -->
    <div class="space-y-4">

      <!-- Valores Agência e Concorrente lado a lado -->
      <div class="grid grid-cols-1 gap-3 2xl:grid-cols-2">
        <FieldInput
          id="conc-valor-agencia"
          label="Valor da agência (R$)"
          type="number"
          bind:value={calc.valorAgencia}
          min="0"
          step="0.01"
          placeholder="0,00"
          icon={DollarSign}
          class_name={fieldClass}
        />
        <FieldInput
          id="conc-valor-concorrente"
          label="Concorrente (R$)"
          type="number"
          bind:value={calc.valorConcorrente}
          min="0"
          step="0.01"
          placeholder="0,00"
          icon={DollarSign}
          class_name={fieldClass}
        />
      </div>

      <FieldInput
        id="conc-desconto-autorizado"
        label="Desconto autorizado pela agência (%)"
        type="number"
        bind:value={calc.descontoAutorizadoPct}
        min="0"
        max="100"
        step="0.01"
        placeholder="0,00"
        icon={Percent}
        class_name={fieldClass}
      />

      <FieldSelect
        id="conc-tipo-pacote"
        label="Tipo de Pacote"
        bind:value={calc.tipoPacote}
        options={TIPOS_PACOTE}
        placeholder={null}
        class_name={fieldClass}
      />

      <FieldInput
        id="conc-taxas"
        label="Taxas (R$)"
        type="number"
        bind:value={calc.valorTaxas}
        min="0"
        step="0.01"
        placeholder="0,00"
        icon={DollarSign}
        helper={temTaxas ? `Desconto sobre ${fmt(baseDesconto)} (sem taxas)` : 'Deixe 0 se não houver taxas'}
        class_name={fieldClass}
      />
    </div>

    <!-- ════ Coluna 2 — Forma de Pagamento ════ -->
    <div class="space-y-4">
      {#if calc.tipoPacote}
        <FieldSelect
          id="conc-forma-pagamento"
          label="Forma de Pagamento"
          bind:value={calc.formaPagamentoId}
          placeholder="Selecione a forma"
          options={formasDisponiveis.map(f => ({ value: f.id, label: f.label }))}
          on:change={() => { calc.parcelas = 1; }}
          class_name={fieldClass}
        />

        {#if formaSelecionada}
          <div class="space-y-3 rounded-2xl border border-slate-200 bg-slate-50 p-4">

            {#if formaSelecionada.tipo === 'simples'}
              <div class="flex items-center justify-between gap-4 rounded-xl border border-indigo-200 bg-white px-5 py-4">
                <div>
                  <p class="text-sm text-slate-500">Desconto</p>
                  <p class="text-xl font-bold text-indigo-700">{fmtPct(formaSelecionada.desconto ?? 0)}</p>
                </div>
                <div class="text-right">
                  <p class="text-sm text-slate-500">Total a pagar</p>
                  <p class="text-xl font-bold text-green-700">{fmt(totalAPagar)}</p>
                </div>
              </div>

            {:else if formaSelecionada.faixas}
              <p class="text-sm font-semibold text-slate-500">Escolha o número de parcelas:</p>
              <div class="grid grid-cols-2 gap-2">
                {#each formaSelecionada.faixas as faixa}
                  {#each Array.from({ length: faixa.ate - faixa.de + 1 }, (_, i) => faixa.de + i) as p}
                    {@const descontoP = faixa.desconto}
                    {@const baseP = temTaxas ? Math.max(0, valorFinalConcorrencia - calc.valorTaxas) : valorFinalConcorrencia}
                    {@const totalP = temTaxas
                      ? (baseP - baseP * descontoP / 100) + calc.valorTaxas
                      : valorFinalConcorrencia - valorFinalConcorrencia * descontoP / 100}
                    {@const parcelaP = p > 1 ? totalP / p : totalP}
                    {@const ativo = calc.parcelas === p}
                    <Button
                      type="button"
                      variant="unstyled"
                      on:click={() => calc.parcelas = p}
                      class_name="rounded-lg border px-3 py-2 text-left transition-all
                        {ativo ? 'border-indigo-400 bg-indigo-50 shadow-xs' : 'border-slate-200 bg-white hover:border-indigo-200 hover:bg-indigo-50/40'}"
                    >
                      <p class="text-sm font-semibold {ativo ? 'text-indigo-700' : 'text-slate-600'}">
                        {p === 1 ? 'À vista' : `${p}x`}
                      </p>
                      <p class="text-xs {ativo ? 'text-indigo-500' : 'text-slate-400'}">
                        {descontoP > 0 ? fmtPct(descontoP) : '—'}
                      </p>
                      <p class="text-sm font-bold {ativo ? 'text-green-700' : 'text-slate-500'} mt-0.5">
                        {p > 1 ? `${p}x ${fmt(parcelaP)}` : fmt(totalP)}
                      </p>
                    </Button>
                  {/each}
                {/each}
              </div>
            {/if}

          </div>
        {/if}
      {:else}
        <div class="flex min-h-54 items-center justify-center rounded-2xl border border-dashed border-slate-200 bg-slate-50 px-6 py-10">
          <p class="max-w-[18rem] text-center text-sm leading-6 text-slate-400">Selecione o tipo de pacote para ver as formas de pagamento</p>
        </div>
      {/if}
    </div>

    <!-- ════ Coluna 3 — Resultados ════ -->
    <div class="space-y-4">

      <!-- Resumo comparativo -->
      <div class="space-y-2 rounded-2xl border border-slate-200 bg-slate-50 p-5">
        <h5 class="text-xs font-bold text-slate-500 uppercase tracking-wider">Resumo</h5>

        <div class="flex justify-between items-center py-2 border-b border-slate-100">
          <span class="text-base text-slate-600">Valor da agência</span>
          <span class="text-base font-semibold text-slate-800">{fmt(calc.valorAgencia)}</span>
        </div>
        <div class="flex justify-between items-center py-2 border-b border-slate-100">
          <span class="text-base text-slate-600">Concorrente</span>
          <span class="text-base font-semibold text-slate-800">{fmt(calc.valorConcorrente)}</span>
        </div>

        {#if calc.valorAgencia > 0 && calc.valorConcorrente > 0}
          <div class="flex justify-between items-center py-2 border-b border-slate-100">
            <span class="text-base text-red-600">Diferença ({fmtPct(diferencaPct)})</span>
            <span class="text-base font-semibold text-red-600">{fmt(diferencaReais)}</span>
          </div>
          <div class="flex justify-between items-center py-2 border-b border-slate-100">
            <span class="text-base text-amber-700">Desconto Aut. ({fmtPct(calc.descontoAutorizadoPct)})</span>
            <span class="text-base font-semibold text-amber-700">{fmt(descontoAutorizadoReais)}</span>
          </div>
          <div class="rounded-lg bg-indigo-50 border border-indigo-200 px-4 py-3 flex justify-between items-center mt-1">
            <span class="text-base font-bold text-indigo-800">Após Concorrência</span>
            <span class="font-bold text-xl text-indigo-700">{fmt(valorFinalConcorrencia)}</span>
          </div>
        {:else}
          <div class="rounded-lg bg-slate-100 px-3 py-3 flex items-center gap-2 text-slate-400">
            <AlertTriangle size={16} />
            <span class="text-sm">Informe os valores da agência e do concorrente</span>
          </div>
        {/if}
      </div>

      <!-- Total a Pagar -->
      {#if calc.formaPagamentoId && calc.valorAgencia > 0 && calc.valorConcorrente > 0}
        <div class="space-y-2 rounded-2xl border border-slate-200 bg-slate-50 p-5">
          <h5 class="text-xs font-bold text-slate-500 uppercase tracking-wider">
            {formaSelecionada?.label}{ehCredito && calc.parcelas > 1 ? ` · ${calc.parcelas}x` : ''}
          </h5>

          <div class="flex justify-between items-center py-2 border-b border-slate-100">
            <span class="text-base text-slate-600">Após Concorrência</span>
            <span class="text-base font-semibold text-slate-800">{fmt(valorFinalConcorrencia)}</span>
          </div>

          {#if temTaxas}
            <div class="flex justify-between items-center py-2 border-b border-slate-100">
              <span class="text-base text-slate-500">(-) Taxas</span>
              <span class="text-base font-medium text-orange-600">-{fmt(calc.valorTaxas)}</span>
            </div>
            <div class="flex justify-between items-center py-2 border-b border-slate-100">
              <span class="text-base text-slate-500">Base desconto</span>
              <span class="text-base font-medium text-slate-700">{fmt(baseDesconto)}</span>
            </div>
          {/if}

          <div class="flex justify-between items-start py-2 border-b border-slate-100 gap-2">
            <div class="flex flex-col">
              <span class="text-base text-slate-600">Desconto {formaSelecionada?.label}{ehCredito && calc.parcelas > 1 ? ` ${calc.parcelas}x` : ''}</span>
              <span class="text-xs text-slate-400">{fmtPct(descontoFormaPct)}</span>
            </div>
            <span class="text-base font-semibold text-green-600 whitespace-nowrap">-{fmt(valorDescontoForma)}</span>
          </div>

          {#if temTaxas}
            <div class="flex justify-between items-center py-2 border-b border-slate-100">
              <span class="text-base text-slate-500">(+) Taxas</span>
              <span class="text-base font-medium text-orange-600">+{fmt(calc.valorTaxas)}</span>
            </div>
          {/if}

          <div class="mt-1 rounded-xl border border-green-200 bg-green-100 px-5 py-4">
            <div class="flex justify-between items-center">
              <div>
                <p class="text-base font-bold text-green-800">Total a Pagar</p>
                <p class="text-sm text-green-600">
                  {#if ehCredito && calc.parcelas > 1}
                    {calc.parcelas}x de {fmt(valorParcela)}
                  {:else}
                    À vista
                  {/if}
                </p>
              </div>
              <span class="font-bold text-2xl text-green-700">{fmt(totalAPagar)}</span>
            </div>
          </div>

          {#if calc.valorAgencia > totalAPagar}
            <div class="flex items-center gap-2 rounded-lg bg-emerald-50 border border-emerald-100 px-3 py-2.5">
              <CheckCircle size={17} class="text-emerald-600 shrink-0" />
              <div>
                <p class="text-sm font-semibold text-emerald-700">Economia do cliente</p>
                <p class="text-base font-bold text-emerald-600">{fmt(calc.valorAgencia - totalAPagar)}</p>
                <p class="text-xs text-emerald-500">{fmtPct((calc.valorAgencia - totalAPagar) / calc.valorAgencia * 100)} sobre o preço da agência</p>
              </div>
            </div>
          {/if}
        </div>
      {/if}

    </div>
  </div>

  <!-- Botão Limpar -->
  <div class="flex justify-start">
    <Button type="button" variant="ghost" size="sm" on:click={limpar} class_name="text-slate-500">
      Limpar campos
    </Button>
  </div>
</div>

<style>
  :global(.vtur-concorrencia-field label) {
    margin-bottom: 0.45rem;
    font-size: 0.9rem;
    font-weight: 650;
    color: #334155;
  }

  :global(.vtur-concorrencia-field .vtur-input) {
    min-height: 3.15rem;
    border-radius: 0.9rem;
    font-size: 1rem;
    line-height: 1.5rem;
  }

  :global(.vtur-concorrencia-field .vtur-input::placeholder) {
    color: #94a3b8;
  }

  :global(.vtur-concorrencia-field .text-slate-500) {
    font-size: 0.78rem;
    line-height: 1.2rem;
  }

  @media (max-width: 1023px) {
    :global(.vtur-concorrencia-field .vtur-input) {
      min-height: 3rem;
    }
  }
</style>
