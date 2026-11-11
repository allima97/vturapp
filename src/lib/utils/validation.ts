/**
 * Validações de formulário — VTUR
 *
 * Uso:
 * ```ts
 * import { validateForm, validateCPF } from '$lib/utils/validation';
 *
 * const { isValid, errors } = validateForm(form, {
 *   nome: { required: true },
 *   cpf:  { required: true, custom: validateCPF, message: 'CPF inválido' }
 * });
 * ```
 */

// ─── Tipos ────────────────────────────────────────────────────────────────────

export interface ValidationRule {
  required?: boolean;
  minLength?: number;
  maxLength?: number;
  pattern?: RegExp;
  /** Função customizada: retorna true quando válido */
  custom?: (value: unknown) => boolean;
  /** Mensagem de erro personalizada para `pattern` ou `custom` */
  message?: string;
}

export interface ValidationResult {
  isValid: boolean;
  errors: Record<string, string>;
}

// ─── Regex prontas ────────────────────────────────────────────────────────────

export const CPF_PATTERN = /^\d{3}\.\d{3}\.\d{3}-\d{2}$/;
export const CNPJ_PATTERN = /^\d{2}\.\d{3}\.\d{3}\/\d{4}-\d{2}$/;
export const PHONE_PATTERN = /^\(\d{2}\) \d{4,5}-\d{4}$/;
export const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
export const CEP_PATTERN = /^\d{5}-\d{3}$/;
export const DATE_BR_PATTERN = /^\d{2}\/\d{2}\/\d{4}$/;
const REPEATED_DIGITS_PATTERN = /^(\d)\1+$/;

// ─── Validação de campo individual ───────────────────────────────────────────

export function validateField(value: unknown, rules: ValidationRule): string | null {
  const str = value != null ? String(value).trim() : '';

  if (rules.required && str === '') {
    return rules.message || 'Este campo é obrigatório';
  }

  // Se não é required e está vazio, pula as demais regras
  if (str === '') return null;

  if (rules.minLength != null && str.length < rules.minLength) {
    return `Mínimo de ${rules.minLength} caractere${rules.minLength === 1 ? '' : 's'}`;
  }

  if (rules.maxLength != null && str.length > rules.maxLength) {
    return `Máximo de ${rules.maxLength} caractere${rules.maxLength === 1 ? '' : 's'}`;
  }

  if (rules.pattern && !rules.pattern.test(str)) {
    return rules.message || 'Formato inválido';
  }

  if (rules.custom && !rules.custom(value)) {
    return rules.message || 'Valor inválido';
  }

  return null;
}

// ─── Validação de formulário completo ────────────────────────────────────────

export function validateForm(
  data: Record<string, unknown>,
  rules: Record<string, ValidationRule>
): ValidationResult {
  const errors: Record<string, string> = {};

  for (const [field, rule] of Object.entries(rules)) {
    const error = validateField(data[field], rule);
    if (error) errors[field] = error;
  }

  return {
    isValid: Object.keys(errors).length === 0,
    errors
  };
}

// ─── Validadores específicos ──────────────────────────────────────────────────

/**
 * Valida CPF com algoritmo de dígito verificador.
 * Aceita com ou sem máscara (000.000.000-00 ou 00000000000).
 */
export function validateCPF(value: unknown): boolean {
  if (typeof value !== 'string' || !/^[\d\s.-]+$/.test(value)) return false;
  const n = String(value).replace(/\D/g, '');
  if (n.length !== 11) return false;
  if (REPEATED_DIGITS_PATTERN.test(n)) return false; // todos iguais

  let sum = 0;
  for (let i = 0; i < 9; i++) sum += parseInt(n[i]) * (10 - i);
  let d1 = 11 - (sum % 11);
  if (d1 >= 10) d1 = 0;
  if (d1 !== parseInt(n[9])) return false;

  sum = 0;
  for (let i = 0; i < 10; i++) sum += parseInt(n[i]) * (11 - i);
  let d2 = 11 - (sum % 11);
  if (d2 >= 10) d2 = 0;
  return d2 === parseInt(n[10]);
}

/**
 * Valida CNPJ com algoritmo de dígito verificador.
 * Aceita com ou sem máscara.
 */
export function validateCNPJ(value: unknown): boolean {
  if (typeof value !== 'string' || !/^[\d\s./-]+$/.test(value)) return false;
  const n = String(value).replace(/\D/g, '');
  if (n.length !== 14) return false;
  if (REPEATED_DIGITS_PATTERN.test(n)) return false;

  const calc = (digits: string, weights: number[]) => {
    const sum = digits.split('').reduce((acc, d, i) => acc + parseInt(d) * weights[i], 0);
    const rem = sum % 11;
    return rem < 2 ? 0 : 11 - rem;
  };

  const base = n.slice(0, 12);
  const d1 = calc(base, [5, 4, 3, 2, 9, 8, 7, 6, 5, 4, 3, 2]);
  if (d1 !== parseInt(n[12])) return false;

  const d2 = calc(base + d1, [6, 5, 4, 3, 2, 9, 8, 7, 6, 5, 4, 3, 2]);
  return d2 === parseInt(n[13]);
}

export function validateOptionalCPF(value: unknown): boolean {
  return value == null || (typeof value === 'string' && (!value.trim() || validateCPF(value)));
}

export function validateOptionalCNPJ(value: unknown): boolean {
  return value == null || (typeof value === 'string' && (!value.trim() || validateCNPJ(value)));
}

/**
 * Valida e-mail com regex simples.
 */
export function validateEmail(value: unknown): boolean {
  return EMAIL_PATTERN.test(String(value ?? '').trim());
}

/**
 * Valida telefone brasileiro com ou sem máscara.
 */
export function validatePhone(value: unknown): boolean {
  if (!value) return false;
  const n = String(value).replace(/\D/g, '');
  return n.length === 10 || n.length === 11;
}

/**
 * Valida CEP com ou sem máscara.
 */
export function validateCEP(value: unknown): boolean {
  if (!value) return false;
  const n = String(value).replace(/\D/g, '');
  return n.length === 8;
}
