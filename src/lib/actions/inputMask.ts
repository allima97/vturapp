/**
 * inputMask — Svelte action para aplicar máscaras automáticas em inputs
 *
 * Uso:
 * ```svelte
 * <input use:inputMask={{ type: 'cpf' }} bind:value={cpf} />
 * ```
 */
import { formatCep, formatDocumento, formatTelefone } from '$lib/utils/inputFormatting';

export type MaskType = 'cpf' | 'cnpj' | 'phone' | 'cep' | 'date' | 'rg';

export interface MaskParams {
  type: MaskType;
}

const NON_DIGIT_RE = /\D/g;
const CPF_LAST_BLOCK_RE = /(\d{3})(\d{1,2})$/;
const CNPJ_FIRST_BLOCK_RE = /(\d{2})(\d)/;
const CNPJ_MIDDLE_BLOCK_RE = /(\d{3})(\d)/;
const DATE_FIRST_BLOCK_RE = /(\d{2})(\d)/;
const DATE_LAST_BLOCK_RE = /(\d{2})(\d{1,4})$/;

function applyMask(raw: string, type: MaskType): string {
  const n = raw.replace(NON_DIGIT_RE, '');

  switch (type) {
    case 'cpf':
      return formatDocumento(raw, 'PF');

    case 'cnpj':
      return formatDocumento(raw, 'PJ');

    case 'phone':
      return formatTelefone(raw);

    case 'cep':
      return formatCep(raw);

    case 'date':
      return n
        .slice(0, 8)
        .replace(DATE_FIRST_BLOCK_RE, '$1/$2')
        .replace(DATE_LAST_BLOCK_RE, '$1/$2');

    case 'rg':
      return n
        .slice(0, 9)
        .replace(CNPJ_FIRST_BLOCK_RE, '$1.$2')
        .replace(CNPJ_MIDDLE_BLOCK_RE, '$1.$2')
        .replace(CPF_LAST_BLOCK_RE, '$1-$2');

    default:
      return raw;
  }
}

export function inputMask(node: HTMLInputElement, params: MaskParams) {
  let preservePhone =
    params.type === 'phone' &&
    (node.value.trimStart().startsWith('+') || node.value.replace(NON_DIGIT_RE, '').length > 11);

  function onInput() {
    const prev = node.value;
    if (params.type === 'phone') {
      if (!prev) preservePhone = false;
      if (prev.trimStart().startsWith('+') || prev.replace(NON_DIGIT_RE, '').length > 11) {
        preservePhone = true;
      }
      if (preservePhone) return;
    }
    const cursor = node.selectionStart ?? prev.length;
    const masked = applyMask(prev, params.type);

    if (masked !== prev) {
      node.value = masked;
      // Ajusta cursor para não pular por causa dos separadores inseridos
      const diff = masked.length - prev.length;
      const newPos = Math.max(0, cursor + diff);
      node.setSelectionRange(newPos, newPos);
    }
  }

  // Aplica imediatamente se já houver valor
  if (node.value) {
    const documentLength =
      params.type === 'cpf' ? 11 : params.type === 'cnpj' ? 14 : params.type === 'cep' ? 8 : null;
    if (
      params.type === 'phone'
        ? !node.value.trimStart().startsWith('+') &&
          /^[\d\s().-]*$/.test(node.value) &&
          [10, 11].includes(node.value.replace(NON_DIGIT_RE, '').length)
        : documentLength === null ||
          (/^[\d\s./-]*$/.test(node.value) &&
            node.value.replace(NON_DIGIT_RE, '').length === documentLength)
    ) {
      node.value = applyMask(node.value, params.type);
    }
  }

  node.addEventListener('input', onInput, true);

  return {
    update(newParams: MaskParams) {
      params = newParams;
    },
    destroy() {
      node.removeEventListener('input', onInput, true);
    }
  };
}
