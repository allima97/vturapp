/**
 * inputMask — Svelte action para aplicar máscaras automáticas em inputs
 *
 * Uso:
 * ```svelte
 * <input use:inputMask={{ type: 'cpf' }} bind:value={cpf} />
 * ```
 */

export type MaskType = 'cpf' | 'cnpj' | 'phone' | 'cep' | 'date' | 'rg';

export interface MaskParams {
  type: MaskType;
}

const NON_DIGIT_RE = /\D/g;
const CPF_FIRST_BLOCK_RE = /(\d{3})(\d)/;
const CPF_LAST_BLOCK_RE = /(\d{3})(\d{1,2})$/;
const CNPJ_FIRST_BLOCK_RE = /(\d{2})(\d)/;
const CNPJ_MIDDLE_BLOCK_RE = /(\d{3})(\d)/;
const CNPJ_SLASH_BLOCK_RE = /(\d{3})(\d)/;
const CNPJ_LAST_BLOCK_RE = /(\d{4})(\d{1,2})$/;
const PHONE_DDD_RE = /(\d{2})(\d)/;
const PHONE_EIGHT_DIGIT_RE = /(\d{4})(\d{1,4})$/;
const PHONE_NINE_DIGIT_RE = /(\d{5})(\d{1,4})$/;
const CEP_BLOCK_RE = /(\d{5})(\d{1,3})$/;
const DATE_FIRST_BLOCK_RE = /(\d{2})(\d)/;
const DATE_LAST_BLOCK_RE = /(\d{2})(\d{1,4})$/;

function applyMask(raw: string, type: MaskType): string {
  const n = raw.replace(NON_DIGIT_RE, '');

  switch (type) {
    case 'cpf':
      return n
        .slice(0, 11)
        .replace(CPF_FIRST_BLOCK_RE, '$1.$2')
        .replace(CPF_FIRST_BLOCK_RE, '$1.$2')
        .replace(CPF_LAST_BLOCK_RE, '$1-$2');

    case 'cnpj':
      return n
        .slice(0, 14)
        .replace(CNPJ_FIRST_BLOCK_RE, '$1.$2')
        .replace(CNPJ_MIDDLE_BLOCK_RE, '$1.$2')
        .replace(CNPJ_SLASH_BLOCK_RE, '$1/$2')
        .replace(CNPJ_LAST_BLOCK_RE, '$1-$2');

    case 'phone':
      if (n.length <= 10) {
        return n
          .slice(0, 10)
          .replace(PHONE_DDD_RE, '($1) $2')
          .replace(PHONE_EIGHT_DIGIT_RE, '$1-$2');
      }
      return n.slice(0, 11).replace(PHONE_DDD_RE, '($1) $2').replace(PHONE_NINE_DIGIT_RE, '$1-$2');

    case 'cep':
      return n.slice(0, 8).replace(CEP_BLOCK_RE, '$1-$2');

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
  function onInput() {
    const prev = node.value;
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
    const documentLength = params.type === 'cpf' ? 11 : params.type === 'cnpj' ? 14 : null;
    if (
      documentLength === null ||
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
