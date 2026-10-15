<script lang="ts">
  import Button from '$lib/components/ui/Button.svelte';
  import Dialog from '$lib/components/ui/Dialog.svelte';
  import LoadingState from '$lib/components/ui/LoadingState.svelte';
  import {
    auditExpectedActual,
    auditIssueBorderClass,
    auditSeverityClass,
    auditSeverityLabel,
    formatCurrency,
    formatDate
  } from './formatters';
  import type { VinculoAuditResult } from './types';

  export let vinculosAuditOpen: boolean;
  export let vinculosAuditScope: 'global' | 'recibo';
  export let vinculosAuditLoading: boolean;
  export let vinculosAuditApplying: boolean;
  export let vinculosAuditResult: VinculoAuditResult | null;
  export let vinculosAuditConciliacaoId: string | null;
  export let runFixVinculosAudit: (options?: { conciliacaoId?: string | null; apply?: boolean }) => void | Promise<void>;
</script>

<Dialog
  bind:open={vinculosAuditOpen}
  title={vinculosAuditScope === 'recibo' ? 'Auditoria do vínculo do recibo' : 'Auditoria de vínculos da conciliação'}
  color="financeiro"
  cancelText="Fechar"
  size="full"
  maxWidth="min(96vw, 1500px)"
>
  <div class="space-y-4">
    {#if vinculosAuditLoading}
      <LoadingState
        title="Auditando vínculos"
        message="Comparando recibo, venda, vendedor, valores, taxas, data e possíveis candidatos."
        compact={true}
      />
    {:else if vinculosAuditResult}
      <div class="grid gap-3 text-sm md:grid-cols-5">
        <div class="rounded-xl border border-slate-200 bg-slate-50 px-3 py-3">
          <p class="text-xs font-semibold text-slate-500">Verificados</p>
          <p class="text-lg font-semibold text-slate-900">{vinculosAuditResult.checked}</p>
        </div>
        <div class="rounded-xl border border-red-200 bg-red-50 px-3 py-3">
          <p class="text-xs font-semibold text-red-600">Críticos</p>
          <p class="text-lg font-semibold text-red-700">{vinculosAuditResult.critical}</p>
        </div>
        <div class="rounded-xl border border-amber-200 bg-amber-50 px-3 py-3">
          <p class="text-xs font-semibold text-amber-600">Alertas</p>
          <p class="text-lg font-semibold text-amber-700">{vinculosAuditResult.warnings}</p>
        </div>
        <div class="rounded-xl border border-blue-200 bg-blue-50 px-3 py-3">
          <p class="text-xs font-semibold text-blue-600">Informativos</p>
          <p class="text-lg font-semibold text-blue-700">{vinculosAuditResult.infos}</p>
        </div>
        <div class="rounded-xl border border-orange-200 bg-orange-50 px-3 py-3">
          <p class="text-xs font-semibold text-orange-600">Corrigíveis</p>
          <p class="text-lg font-semibold text-orange-700">{vinculosAuditResult.corrigiveis}</p>
        </div>
      </div>

      {#if vinculosAuditResult.detalhes.length === 0}
        <div class="rounded-xl border border-green-200 bg-green-50 px-4 py-3 text-sm text-green-800">
          Nenhuma divergência encontrada nos vínculos auditados.
        </div>
      {:else}
        <div class="space-y-3">
          {#each vinculosAuditResult.detalhes as detail}
            <section class="rounded-xl border border-slate-200 bg-white p-4 shadow-xs">
              <div class="mb-3 flex flex-wrap items-start justify-between gap-3">
                <div class="min-w-0">
                  <div class="flex flex-wrap items-center gap-2">
                    <p class="font-semibold text-slate-900">{detail.documento || '-'}</p>
                    <span class="rounded-full px-2 py-1 text-xs font-semibold {auditSeverityClass(detail.severity)}">
                      {auditSeverityLabel(detail.severity)}
                    </span>
                    {#if detail.fixable}
                      <span class="rounded-full bg-orange-100 px-2 py-1 text-[11px] font-semibold text-orange-700">limpeza segura</span>
                    {/if}
                  </div>
                  <p class="text-xs text-slate-500">{formatDate(detail.movimento_data)}</p>
                </div>
                <div class="text-left sm:text-right">
                  <p class="text-xs font-semibold uppercase text-slate-500">Recibo do sistema</p>
                  <p class="font-medium text-slate-900">{detail.sistema?.numero_recibo || '-'}</p>
                  <p class="text-xs text-slate-500">
                    Venda: {formatDate(detail.sistema?.data_venda)}
                    {#if detail.sistema?.data_lancamento}
                      · Lanç.: {formatDate(detail.sistema.data_lancamento)}
                    {/if}
                  </p>
                </div>
              </div>

              <div class="grid gap-3 text-sm lg:grid-cols-[1.2fr_1.2fr_0.8fr_0.8fr]">
                <div class="rounded-lg bg-slate-50 px-3 py-2">
                  <p class="text-xs font-semibold uppercase text-slate-500">Vendedores</p>
                  <p class="text-slate-700">Venda: <span class="font-medium">{detail.sistema?.vendedor_nome || '-'}</span></p>
                  <p class="text-slate-700">Ranking: <span class="font-medium">{detail.conciliacao?.ranking_vendedor_nome || '-'}</span></p>
                  {#if detail.sistema?.rateio}
                    <p class="mt-1 text-xs text-blue-700">
                      Rateio: {detail.sistema.rateio.vendedor_origem_nome || '-'} {Number(detail.sistema.rateio.percentual_origem || 0).toFixed(2)}%
                      / {detail.sistema.rateio.vendedor_destino_nome || '-'} {Number(detail.sistema.rateio.percentual_destino || 0).toFixed(2)}%
                    </p>
                  {/if}
                </div>
                <div class="rounded-lg bg-slate-50 px-3 py-2">
                  <p class="text-xs font-semibold uppercase text-slate-500">Candidatos</p>
                  {#if detail.candidatos && detail.candidatos.length > 0}
                    <p class="text-slate-700">{detail.candidatos.map((c) => c.numero_recibo).join(', ')}</p>
                  {:else}
                    <p class="text-slate-500">-</p>
                  {/if}
                </div>
                <div class="rounded-lg bg-slate-50 px-3 py-2">
                  <p class="text-xs font-semibold uppercase text-slate-500">Valor conc. / venda</p>
                  <p class="font-medium text-slate-900">{formatCurrency(detail.conciliacao?.valor_venda_real)}</p>
                  <p class="text-xs text-slate-500">{formatCurrency(detail.sistema?.valor_ranking)}</p>
                </div>
                <div class="rounded-lg bg-slate-50 px-3 py-2">
                  <p class="text-xs font-semibold uppercase text-slate-500">Taxas conc. / venda</p>
                  <p class="font-medium text-slate-900">{formatCurrency(detail.conciliacao?.valor_taxas)}</p>
                  <p class="text-xs text-slate-500">{formatCurrency(detail.sistema?.valor_taxas)}</p>
                </div>
              </div>

              <div class="mt-3 grid gap-2 xl:grid-cols-2">
                {#each detail.issues as issueItem}
                  <div class="rounded-xl border px-3 py-2 {auditIssueBorderClass(issueItem.severity)}">
                    <p class="text-xs font-semibold">{issueItem.title}</p>
                    <p class="text-xs leading-relaxed">{issueItem.message}</p>
                    {#if auditExpectedActual(issueItem)}
                      <p class="mt-1 text-[11px] opacity-80">{auditExpectedActual(issueItem)}</p>
                    {/if}
                  </div>
                {/each}
              </div>
            </section>
          {/each}
        </div>
      {/if}

      <div class="rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 text-xs text-slate-600">
        A correção automática só limpa vínculos críticos inseguros. Diferenças de valor, taxas, datas, vendedor e rateio ficam como auditoria; o ajuste pode ser na venda, na conciliação/ranking ou no rateio.
      </div>
    {:else}
      <div class="rounded-xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm text-slate-600">
        Execute a auditoria para comparar os vínculos da conciliação com as vendas do sistema.
      </div>
    {/if}
  </div>

  <svelte:fragment slot="actions">
    {#if vinculosAuditResult && vinculosAuditResult.corrigiveis > 0}
      <Button
        color="financeiro"
        on:click={() => runFixVinculosAudit({ conciliacaoId: vinculosAuditConciliacaoId, apply: true })}
        disabled={vinculosAuditApplying || vinculosAuditLoading}
        loading={vinculosAuditApplying}
      >
        Corrigir críticos
      </Button>
    {/if}
    {#if vinculosAuditResult}
      <Button
        variant="secondary"
        on:click={() => runFixVinculosAudit({ conciliacaoId: vinculosAuditConciliacaoId })}
        disabled={vinculosAuditApplying || vinculosAuditLoading}
      >
        Auditar novamente
      </Button>
    {/if}
  </svelte:fragment>
</Dialog>
