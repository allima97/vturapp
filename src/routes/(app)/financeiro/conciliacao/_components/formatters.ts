import { formatDate as formatDateValue, formatDateTime as formatDateTimeValue } from '$lib/utils/formatters';
import type { ImportPreviewRow, VinculoAuditIssue } from './types';

const BRL_CURRENCY_FORMATTER = new Intl.NumberFormat('pt-BR', {
  style: 'currency',
  currency: 'BRL'
});

const PT_BR_DECIMAL_FORMATTER = new Intl.NumberFormat('pt-BR', {
  minimumFractionDigits: 2,
  maximumFractionDigits: 2
});

export function resolveMetaDifLabel(percentualComissaoLoja: number | null | undefined, fallback?: string | null): string {
  const pct = Number(percentualComissaoLoja || 0);
  if (pct >= 31) return 'Seguro Viagem';
  return fallback || 'Não';
}

export function statusImportLabel(status?: string | null) {
  const value = String(status || '').toUpperCase();
  if (value === 'BAIXA') return 'Efetivado';
  if (value === 'OPFAX') return 'Pendente em OPFAX';
  if (value === 'ESTORNO') return 'Estorno';
  return value || 'OUTRO';
}

export function formatDocumentoConciliacao(row: { documento?: string | null; numero_reserva?: string | null }) {
  const documento = String(row.documento || '').trim();
  const reserva = String(row.numero_reserva || '').trim();
  return reserva ? `${documento} / ${reserva}` : documento || '-';
}

export function exigeRanking(status?: string | null) {
  const value = String(status || '').toUpperCase();
  return value === 'BAIXA' || value === 'OPFAX';
}

export function formatMoney(value: number | null | undefined) {
  const num = Number(value || 0);
  if (!Number.isFinite(num)) return '-';
  return PT_BR_DECIMAL_FORMATTER.format(num);
}

export function getDiffRatio(diff: number | null | undefined, sistemaValue: number | null | undefined) {
  const diffAbs = Math.abs(Number(diff || 0));
  if (diffAbs <= 0.01) return 0;

  const base = Math.abs(Number(sistemaValue || 0));
  if (base <= 0.01) return Number.POSITIVE_INFINITY;

  return diffAbs / base;
}

export function isCriticalDiff(diff: number | null | undefined, sistemaValue: number | null | undefined) {
  return getDiffRatio(diff, sistemaValue) >= 0.1;
}

export function getImportDiffSeverity(row: ImportPreviewRow): 'none' | 'warning' | 'critical' {
  if (!row.tem_diferenca) return 'none';

  if (
    isCriticalDiff(row.diff_total, row.sistema_valor_total) ||
    isCriticalDiff(row.diff_taxas, row.sistema_valor_taxas)
  ) {
    return 'critical';
  }

  return 'warning';
}

export function getDiffModalSeverity(diff: { diff_total: number; diff_taxas: number; valor_sistema: number; taxas_sistema: number }) {
  return isCriticalDiff(diff.diff_total, diff.valor_sistema) || isCriticalDiff(diff.diff_taxas, diff.taxas_sistema)
    ? 'critical'
    : 'warning';
}

export function formatPtBrInput(value: number | null | undefined) {
  if (value === null || value === undefined) return '';
  const num = Number(value);
  if (!Number.isFinite(num)) return '';
  return PT_BR_DECIMAL_FORMATTER.format(num);
}

export function formatCurrency(value: number | null | undefined) {
  return BRL_CURRENCY_FORMATTER.format(Number(value || 0));
}

export function formatPercent(value: number | null | undefined) {
  const num = Number(value || 0);
  if (!num) return '-';
  return `${num.toFixed(2)}%`;
}

export function formatDate(value?: string | null) {
  return formatDateValue(value);
}

export function formatDateTime(value?: string | null) {
  return formatDateTimeValue(value);
}

export function auditSeverityLabel(severity?: string | null) {
  if (severity === 'critical') return 'Crítico';
  if (severity === 'warning') return 'Alerta';
  if (severity === 'info') return 'Info';
  return 'OK';
}

export function auditSeverityClass(severity?: string | null) {
  if (severity === 'critical') return 'bg-red-100 text-red-700';
  if (severity === 'warning') return 'bg-amber-100 text-amber-700';
  if (severity === 'info') return 'bg-blue-100 text-blue-700';
  return 'bg-green-100 text-green-700';
}

export function auditIssueBorderClass(severity?: string | null) {
  if (severity === 'critical') return 'border-red-200 bg-red-50 text-red-900';
  if (severity === 'warning') return 'border-amber-200 bg-amber-50 text-amber-900';
  return 'border-blue-200 bg-blue-50 text-blue-900';
}

export function auditExpectedActual(issue: VinculoAuditIssue) {
  const expected = issue.expected ?? null;
  const actual = issue.actual ?? null;
  if (expected === null && actual === null) return '';
  const left = expected === null ? '-' : String(expected);
  const right = actual === null ? '-' : String(actual);
  return `Esperado: ${left} | Atual: ${right}`;
}
