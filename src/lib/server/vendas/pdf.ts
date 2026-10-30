/**
 * F4-05 — Geração de HTML para comprovante de venda com marca VTUR.
 *
 * Estratégia: servidor gera HTML completo e self-contained (CSS inline,
 * logo em data-URL embutida via brand.ts). O cliente abre em nova aba e
 * usa window.print() / jsPDF para converter — sem Puppeteer no Worker.
 *
 * Regras:
 *   - Valores em centavos (ADR-005) → formatados como R$ 0.000,00
 *   - Data em TEXT YYYY-MM-DD → formatada como DD/MM/YYYY
 *   - Câmbio em 4 decimais inteiros → ÷ 10000 antes de exibir
 *   - Venda cancelada: aviso visível no cabeçalho
 *   - Quebra de página: @media print; cada seção tem page-break-inside:avoid
 */

import type { VendaDetalhe } from './service';

// ─────────────────────────────────────────────────────────────────────────────
// Utilitários de formatação
// ─────────────────────────────────────────────────────────────────────────────

/** Centavos inteiros → "R$ 1.234,56" */
export function formatarBRL(centavos: number): string {
  const valor = centavos / 100;
  return valor.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
}

/** TEXT YYYY-MM-DD → "DD/MM/YYYY" (sem dependência de Date para evitar TZ) */
export function formatarData(iso: string | null | undefined): string {
  if (!iso) return '—';
  const m = iso.match(/^(\d{4})-(\d{2})-(\d{2})/);
  return m ? `${m[3]}/${m[2]}/${m[1]}` : iso;
}

/** Câmbio armazenado como inteiro 4 decimais → "5,3210" */
export function formatarCambio(centavos: number | null): string {
  if (centavos === null) return '—';
  return (centavos / 10000).toFixed(4).replace('.', ',');
}

/** Escapa caracteres HTML para evitar XSS no template literal */
function esc(s: string | null | undefined): string {
  if (!s) return '';
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

// ─────────────────────────────────────────────────────────────────────────────
// Gerador principal
// ─────────────────────────────────────────────────────────────────────────────

export type ComprovanteVendaOptions = {
  /** Nome da empresa (agência). */
  nomeEmpresa?: string;
  /** Gerado em: se não fornecido usa a data atual. */
  geradoEm?: string;
  /**
   * Logo como data-URL ou caminho público.
   * Separado do import Vite (`$lib/brand`) para manter o módulo
   * testável no Workers runtime (vitest-pool-workers não suporta
   * `?raw` de assets Vite em importações transitivas).
   * A rota injeta `VTUR_LOGO_URL` de `$lib/brand` antes de chamar.
   */
  logoUrl?: string;
};

/**
 * Gera HTML completo e self-contained de um comprovante de venda.
 * Pode ser servido diretamente como text/html para impressão.
 */
export function gerarComprovanteHtml(
  venda: VendaDetalhe,
  opts: ComprovanteVendaOptions = {}
): string {
  const nomeEmpresa = opts.nomeEmpresa ?? 'VTUR Turismo';
  const geradoEm =
    opts.geradoEm ??
    new Date().toLocaleString('pt-BR', { timeZone: 'America/Sao_Paulo' });

  // ── Seção: itens ──────────────────────────────────────────────────────────
  const itensHtml = venda.itens.length === 0
    ? '<tr><td colspan="5" style="text-align:center;color:#666">Nenhum item</td></tr>'
    : venda.itens.map((it) => /* html */`
      <tr>
        <td>${esc(it.descricao)}</td>
        <td style="white-space:nowrap">${formatarData(it.dataServico)}</td>
        <td style="white-space:nowrap">${formatarCambio(it.cambioCentavos)}</td>
        <td class="num">${formatarBRL(it.valorNetoCentavos)}</td>
        <td class="num">${formatarBRL(it.valorTotalCentavos)}</td>
      </tr>
    `).join('');

  // ── Seção: pagamentos / parcelas ──────────────────────────────────────────
  const pagamentosHtml = venda.pagamentos.length === 0
    ? '<tr><td colspan="5" style="text-align:center;color:#666">Nenhum pagamento</td></tr>'
    : venda.pagamentos.flatMap((pag) =>
        pag.parcelas.map((par, idx) => /* html */`
          <tr>
            ${idx === 0
              ? `<td rowspan="${pag.parcelas.length}">${esc(pag.formaPagamentoId?.toString())}</td>`
              : ''}
            <td class="num">${par.numero}</td>
            <td style="white-space:nowrap">${formatarData(par.vencimento)}</td>
            <td class="num">${formatarBRL(par.valorCentavos)}</td>
            <td class="num">${formatarBRL(pag.valorTotalCentavos)}</td>
          </tr>
        `)
      ).join('');

  const canceladaBanner = venda.cancelada
    ? `<div class="cancelada-banner">⚠ VENDA CANCELADA</div>`
    : '';

  return /* html */`<!DOCTYPE html>
<html lang="pt-BR">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width,initial-scale=1">
  <title>Comprovante de Venda ${esc(venda.numeroVenda ?? String(venda.id))}</title>
  <style>
    /* ── reset ── */
    *, *::before, *::after { box-sizing: border-box; margin: 0; padding: 0; }
    body { font-family: Arial, Helvetica, sans-serif; font-size: 11pt; color: #1a1a1a; background: #fff; }

    /* ── layout ── */
    .page { max-width: 210mm; margin: 0 auto; padding: 12mm 14mm; }
    .header { display: flex; align-items: flex-start; justify-content: space-between; margin-bottom: 8mm; }
    .logo { height: 40px; max-width: 140px; object-fit: contain; }
    .empresa-info { text-align: right; font-size: 9pt; color: #444; }
    h1 { font-size: 14pt; color: #003366; margin-bottom: 2mm; }
    h2 { font-size: 11pt; color: #003366; margin: 5mm 0 2mm; border-bottom: 1px solid #ccd6e0; padding-bottom: 1mm; }

    /* ── cancelada ── */
    .cancelada-banner {
      background: #fee2e2; color: #b91c1c; font-weight: bold;
      text-align: center; padding: 4mm; border-radius: 2mm;
      font-size: 13pt; margin-bottom: 5mm; letter-spacing: .5px;
    }

    /* ── dados ── */
    .grid2 { display: grid; grid-template-columns: 1fr 1fr; gap: 2mm 8mm; margin-bottom: 4mm; }
    .campo { font-size: 9.5pt; }
    .campo .label { color: #555; font-size: 8.5pt; display: block; margin-bottom: .5mm; }
    .campo .valor { font-weight: 600; }

    /* ── tabelas ── */
    table { width: 100%; border-collapse: collapse; margin-bottom: 4mm; font-size: 9.5pt; }
    th { background: #003366; color: #fff; text-align: left; padding: 2mm 3mm; font-size: 9pt; }
    td { padding: 1.5mm 3mm; border-bottom: 1px solid #e5e7eb; }
    tr:last-child td { border-bottom: none; }
    td.num { text-align: right; }
    th.num { text-align: right; }

    /* ── totais ── */
    .totais { margin-top: 3mm; float: right; min-width: 180px; }
    .totais table { width: 100%; }
    .totais td { padding: 1mm 3mm; font-size: 10pt; }
    .totais .total-principal td { font-weight: bold; font-size: 11pt; color: #003366; border-top: 2px solid #003366; }

    /* ── rodapé ── */
    .rodape { margin-top: 8mm; font-size: 8pt; color: #666; border-top: 1px solid #e5e7eb; padding-top: 3mm; }

    /* ── impressão ── */
    @media print {
      body { font-size: 10pt; }
      .page { max-width: 100%; padding: 0; }
      .no-print { display: none !important; }
      table, .campo, .grid2 { page-break-inside: avoid; }
      h2 { page-break-after: avoid; }
    }
  </style>
</head>
<body>
<div class="page">

  <!-- cabeçalho -->
  <div class="header">
    <div>
      <img src="${esc(opts.logoUrl ?? '')}" class="logo" alt="VTUR">
      <h1 style="margin-top:3mm">Comprovante de Venda</h1>
    </div>
    <div class="empresa-info">
      <strong>${esc(nomeEmpresa)}</strong><br>
      Gerado em: ${esc(geradoEm)}
    </div>
  </div>

  ${canceladaBanner}

  <!-- dados gerais -->
  <h2>Dados da Venda</h2>
  <div class="grid2">
    <div class="campo">
      <span class="label">Número da Venda</span>
      <span class="valor">${esc(venda.numeroVenda ?? '—')}</span>
    </div>
    <div class="campo">
      <span class="label">Data da Venda</span>
      <span class="valor">${formatarData(venda.dataVenda)}</span>
    </div>
    <div class="campo">
      <span class="label">Data de Embarque</span>
      <span class="valor">${formatarData(venda.dataEmbarque)}</span>
    </div>
    <div class="campo">
      <span class="label">Data Final</span>
      <span class="valor">${formatarData(venda.dataFinal)}</span>
    </div>
    <div class="campo">
      <span class="label">Status</span>
      <span class="valor">${esc(venda.status)}</span>
    </div>
    <div class="campo">
      <span class="label">Destino</span>
      <span class="valor">${esc(venda.destino ?? '—')}</span>
    </div>
  </div>

  <!-- itens -->
  <h2>Itens</h2>
  <table>
    <thead>
      <tr>
        <th>Descrição</th>
        <th>Data Serviço</th>
        <th>Câmbio</th>
        <th class="num">Valor Neto</th>
        <th class="num">Total</th>
      </tr>
    </thead>
    <tbody>${itensHtml}</tbody>
  </table>

  <!-- totais -->
  <div class="totais" style="clear:right">
    <table>
      <tr>
        <td>Valor Bruto</td>
        <td class="num">${formatarBRL(venda.valorBrutoCentavos)}</td>
      </tr>
      <tr>
        <td>Taxas</td>
        <td class="num">${formatarBRL(venda.valorTaxasCentavos)}</td>
      </tr>
      <tr>
        <td>Desconto</td>
        <td class="num">− ${formatarBRL(venda.descontoComercialCentavos)}</td>
      </tr>
      <tr class="total-principal">
        <td>Total</td>
        <td class="num">${formatarBRL(venda.valorTotalCentavos)}</td>
      </tr>
      <tr>
        <td>Pago</td>
        <td class="num">${formatarBRL(venda.valorPagoCentavos)}</td>
      </tr>
      <tr>
        <td>A Receber</td>
        <td class="num">${formatarBRL(Math.max(0, venda.valorTotalCentavos - venda.valorPagoCentavos))}</td>
      </tr>
    </table>
  </div>
  <div style="clear:both"></div>

  <!-- pagamentos -->
  <h2>Pagamentos</h2>
  <table>
    <thead>
      <tr>
        <th>Forma</th>
        <th class="num">Parcela</th>
        <th>Vencimento</th>
        <th class="num">Valor Parcela</th>
        <th class="num">Total Pagamento</th>
      </tr>
    </thead>
    <tbody>${pagamentosHtml}</tbody>
  </table>

  <!-- botão impressão (oculto ao imprimir) -->
  <div class="no-print" style="text-align:right; margin-top:6mm">
    <button onclick="window.print()"
      style="padding:8px 20px;background:#003366;color:#fff;border:none;border-radius:4px;cursor:pointer;font-size:11pt">
      🖨 Imprimir / Salvar PDF
    </button>
  </div>

  <!-- rodapé -->
  <div class="rodape">
    Este comprovante é gerado automaticamente e não substitui nota fiscal.
    Valores em R$ (reais). Câmbio referência ao dia da venda.
  </div>

</div>
</body>
</html>`;
}
