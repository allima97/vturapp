/**
 * receiptNormalize.ts
 *
 * Regras canônicas de normalização de número de recibo.
 * Usado no front (display mask) e no back (persistência + conciliação).
 *
 * Regra de display:
 *   - Se o valor, após remover não-dígitos, tiver exatamente 14 dígitos numéricos
 *     (sem letras no original), exibe no formato NNNN-NNNNNNNNNN.
 *   - Caso contrário, mantém o valor como digitado (campo livre).
 *
 * Regra de chave normalizada (para matching):
 *   - Remove separadores, converte para maiúsculas, mantém apenas [A-Z0-9].
 *   - Resultado é determinístico: "5630-0000083899" == "56300000083899" == "5630 0000083899".
 */

/**
 * Retorna o valor canonicamente exibido/gravado no banco.
 * Aplica máscara NNNN-NNNNNNNNNN apenas quando o conteúdo é
 * claramente um recibo de 14 dígitos numéricos.
 */
export function normalizeReceiptDisplay(value?: string | null): string {
  const raw = String(value ?? '').trim();
  if (!raw) return '';

  const hasLetters = /[A-Za-z]/.test(raw);
  if (hasLetters) return raw; // campo livre alfanumérico: não altera

  const digits = raw.replace(/\D+/g, '');
  if (digits.length === 14) {
    return `${digits.slice(0, 4)}-${digits.slice(4)}`;
  }

  return raw;
}

/**
 * Retorna a chave técnica de comparação, usada em conciliação e buscas.
 * Remove separadores, mantém apenas [A-Z0-9] em maiúsculas.
 */
export function normalizeReceiptKey(value?: string | null): string {
  return String(value ?? '')
    .trim()
    .toUpperCase()
    .replace(/[^A-Z0-9]/g, '');
}
