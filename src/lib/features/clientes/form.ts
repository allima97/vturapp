export type TipoPessoa = 'PF' | 'PJ';

export type ClienteFormData = {
  nome: string;
  nascimento: string;
  cpf: string;
  tipo_pessoa: TipoPessoa;
  telefone: string;
  whatsapp: string;
  email: string;
  classificacao: string;
  endereco: string;
  numero: string;
  complemento: string;
  cidade: string;
  estado: string;
  cep: string;
  rg: string;
  genero: string;
  nacionalidade: string;
  tags: string;
  tipo_cliente: string;
  notas: string;
  ativo: boolean;
  active: boolean;
};

export type ClienteValidationResult = {
  valid: boolean;
  errors: Record<string, string>;
  firstError: string | null;
};

export const estadosBrasil = [
  { value: 'AC', label: 'Acre' },
  { value: 'AL', label: 'Alagoas' },
  { value: 'AP', label: 'Amapa' },
  { value: 'AM', label: 'Amazonas' },
  { value: 'BA', label: 'Bahia' },
  { value: 'CE', label: 'Ceara' },
  { value: 'DF', label: 'Distrito Federal' },
  { value: 'ES', label: 'Espirito Santo' },
  { value: 'GO', label: 'Goias' },
  { value: 'MA', label: 'Maranhao' },
  { value: 'MT', label: 'Mato Grosso' },
  { value: 'MS', label: 'Mato Grosso do Sul' },
  { value: 'MG', label: 'Minas Gerais' },
  { value: 'PA', label: 'Para' },
  { value: 'PB', label: 'Paraiba' },
  { value: 'PR', label: 'Parana' },
  { value: 'PE', label: 'Pernambuco' },
  { value: 'PI', label: 'Piaui' },
  { value: 'RJ', label: 'Rio de Janeiro' },
  { value: 'RN', label: 'Rio Grande do Norte' },
  { value: 'RS', label: 'Rio Grande do Sul' },
  { value: 'RO', label: 'Rondonia' },
  { value: 'RR', label: 'Roraima' },
  { value: 'SC', label: 'Santa Catarina' },
  { value: 'SP', label: 'Sao Paulo' },
  { value: 'SE', label: 'Sergipe' },
  { value: 'TO', label: 'Tocantins' }
] as const;

export const classificacaoOptions = ['', 'A', 'B', 'C', 'D', 'E'];
export const generoOptions = ['', 'Masculino', 'Feminino', 'Outros'];

const REPEATED_DIGITS_PATTERN = /^(\d)\1+$/;
const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

function buildClienteSelectOptions(options: string[]) {
  return options.reduce<{ value: string; label: string }[]>((items, option) => {
    if (option) items.push({ value: option, label: option });
    return items;
  }, []);
}

export const classificacaoSelectOptions = buildClienteSelectOptions(classificacaoOptions);
export const generoSelectOptions = buildClienteSelectOptions(generoOptions);

export function createInitialClienteForm(): ClienteFormData {
  return {
    nome: '',
    nascimento: '',
    cpf: '',
    tipo_pessoa: 'PF',
    telefone: '',
    whatsapp: '',
    email: '',
    classificacao: '',
    endereco: '',
    numero: '',
    complemento: '',
    cidade: '',
    estado: '',
    cep: '',
    rg: '',
    genero: '',
    nacionalidade: 'Brasileira',
    tags: '',
    tipo_cliente: 'passageiro',
    notas: '',
    ativo: true,
    active: true
  };
}

export function onlyDigits(value?: string | null) {
  return String(value || '').replace(/\D/g, '');
}

import { titleCaseNome } from '$lib/normalizeText';

export function sanitizeImportedClienteNome(value?: string | null) {
  const raw = String(value || '')
    .replace(/\s+/g, ' ')
    .trim();
  if (!raw) return '';

  const dividerPattern = /(?:\/\s*){2,}/g;
  let relevant = raw;
  let match: RegExpExecArray | null;

  while ((match = dividerPattern.exec(raw)) !== null) {
    relevant = raw.slice(match.index + match[0].length);
  }

  return relevant
    .replace(/\s+/g, ' ')
    .replace(/^[\s\-–—_:;,./\\|]+/, '')
    .replace(/^ssp\s*\([^)]*\)\s*/i, '')
    .replace(/^[\s\-–—_:;,./\\|]+/, '')
    .trim();
}

export function formatTelefone(value: string) {
  const digits = onlyDigits(value).slice(0, 11);
  if (digits.length <= 2) return digits ? `(${digits}` : '';
  if (digits.length <= 6) return `(${digits.slice(0, 2)}) ${digits.slice(2)}`;
  if (digits.length <= 10) {
    return `(${digits.slice(0, 2)}) ${digits.slice(2, 6)}-${digits.slice(6)}`;
  }
  return `(${digits.slice(0, 2)}) ${digits.slice(2, 7)}-${digits.slice(7)}`;
}

export function formatDocumento(value: string, tipoPessoa: TipoPessoa) {
  const digits = onlyDigits(value).slice(0, tipoPessoa === 'PJ' ? 14 : 11);

  if (tipoPessoa === 'PJ') {
    if (digits.length <= 2) return digits;
    if (digits.length <= 5) return `${digits.slice(0, 2)}.${digits.slice(2)}`;
    if (digits.length <= 8) return `${digits.slice(0, 2)}.${digits.slice(2, 5)}.${digits.slice(5)}`;
    if (digits.length <= 12) {
      return `${digits.slice(0, 2)}.${digits.slice(2, 5)}.${digits.slice(5, 8)}/${digits.slice(8)}`;
    }
    return `${digits.slice(0, 2)}.${digits.slice(2, 5)}.${digits.slice(5, 8)}/${digits.slice(8, 12)}-${digits.slice(12)}`;
  }

  if (digits.length <= 3) return digits;
  if (digits.length <= 6) return `${digits.slice(0, 3)}.${digits.slice(3)}`;
  if (digits.length <= 9) return `${digits.slice(0, 3)}.${digits.slice(3, 6)}.${digits.slice(6)}`;
  return `${digits.slice(0, 3)}.${digits.slice(3, 6)}.${digits.slice(6, 9)}-${digits.slice(9)}`;
}

export function formatCep(value: string) {
  const digits = onlyDigits(value).slice(0, 8);
  if (digits.length <= 5) return digits;
  return `${digits.slice(0, 5)}-${digits.slice(5)}`;
}

export function isValidCnpj(value: string) {
  const digits = onlyDigits(value);
  if (digits.length !== 14) return false;
  if (REPEATED_DIGITS_PATTERN.test(digits)) return false;

  const calc = (base: string, factors: number[]) => {
    const sum = base.split('').reduce((acc, num, index) => acc + Number(num) * factors[index], 0);
    const mod = sum % 11;
    return mod < 2 ? 0 : 11 - mod;
  };

  const d1 = calc(digits.slice(0, 12), [5, 4, 3, 2, 9, 8, 7, 6, 5, 4, 3, 2]);
  const d2 = calc(digits.slice(0, 13), [6, 5, 4, 3, 2, 9, 8, 7, 6, 5, 4, 3, 2]);
  return digits === `${digits.slice(0, 12)}${d1}${d2}`;
}

export function parseTagsInput(value: string) {
  return String(value || '')
    .split(',')
    .reduce<string[]>((items, item) => {
      const tag = item.trim();
      if (tag) items.push(tag);
      return items;
    }, []);
}

export function joinTagsInput(value: unknown) {
  if (!Array.isArray(value)) return '';
  return value
    .reduce<string[]>((items, item) => {
      const tag = String(item || '').trim();
      if (tag) items.push(tag);
      return items;
    }, [])
    .join(', ');
}

export function buildClientePayload(form: ClienteFormData) {
  const tipoPessoa = form.tipo_pessoa || 'PF';
  const documento = onlyDigits(form.cpf);
  const nome = sanitizeImportedClienteNome(form.nome);

  return {
    nome: titleCaseNome(nome),
    nascimento: form.nascimento || null,
    cpf: documento || null,
    tipo_pessoa: tipoPessoa,
    telefone: form.telefone.trim() || null,
    whatsapp: form.whatsapp.trim() || null,
    email: form.email.trim() ? form.email.trim().toLowerCase() : null,
    classificacao: form.classificacao.trim() || null,
    endereco: form.endereco.trim() || null,
    numero: form.numero.trim() || null,
    complemento: form.complemento.trim() || null,
    cidade: form.cidade.trim() || null,
    estado: form.estado.trim() || null,
    cep: onlyDigits(form.cep) || null,
    rg: form.rg.trim() || null,
    genero: tipoPessoa === 'PJ' ? null : form.genero.trim() || null,
    nacionalidade: tipoPessoa === 'PJ' ? null : form.nacionalidade.trim() || null,
    tags: parseTagsInput(form.tags),
    tipo_cliente: form.tipo_cliente.trim() || 'passageiro',
    notas: form.notas.trim() || null,
    ativo: Boolean(form.ativo),
    active: Boolean(form.active)
  };
}

export function fillClienteFormFromApi(
  data: Record<string, unknown> | null | undefined
): ClienteFormData {
  const initial = createInitialClienteForm();
  if (!data) return initial;

  const tipoPessoa =
    data.tipo_pessoa === 'PJ' || onlyDigits(String(data.cpf || '')).length > 11 ? 'PJ' : 'PF';

  return {
    ...initial,
    nome: sanitizeImportedClienteNome(String(data.nome || '')),
    nascimento: String(data.nascimento || data.data_nascimento || '').slice(0, 10),
    cpf: formatDocumento(String(data.cpf || ''), tipoPessoa),
    tipo_pessoa: tipoPessoa,
    telefone: String(data.telefone || ''),
    whatsapp: String(data.whatsapp || ''),
    email: String(data.email || ''),
    classificacao: String(data.classificacao || ''),
    endereco: String(data.endereco || ''),
    numero: String(data.numero || ''),
    complemento: String(data.complemento || ''),
    cidade: String(data.cidade || ''),
    estado: String(data.estado || ''),
    cep: formatCep(String(data.cep || '')),
    rg: String(data.rg || ''),
    genero: String(data.genero || ''),
    nacionalidade: String(data.nacionalidade || (tipoPessoa === 'PF' ? 'Brasileira' : '')),
    tags: joinTagsInput(data.tags),
    tipo_cliente: String(data.tipo_cliente || 'passageiro'),
    notas: String(data.notas || data.observacoes || ''),
    ativo: data.ativo !== false,
    active: data.active !== false
  };
}

export function validateClienteForm(form: ClienteFormData): ClienteValidationResult {
  const errors: Record<string, string> = {};
  const documentoDigits = onlyDigits(form.cpf);
  const telefoneDigits = onlyDigits(form.telefone);
  const nome = sanitizeImportedClienteNome(form.nome);

  if (!nome) {
    errors.nome = 'Informe o nome completo do cliente.';
  }

  if (!documentoDigits) {
    errors.cpf =
      form.tipo_pessoa === 'PJ' ? 'Informe o CNPJ do cliente.' : 'Informe o CPF do cliente.';
  } else if (form.tipo_pessoa === 'PJ') {
    if (!isValidCnpj(documentoDigits)) {
      errors.cpf = 'CNPJ invalido. Informe os 14 digitos corretamente.';
    }
  } else if (documentoDigits.length !== 11) {
    errors.cpf = 'CPF invalido. Informe os 11 digitos corretamente.';
  }

  if (!telefoneDigits) {
    errors.telefone = 'Informe o telefone do cliente.';
  } else if (telefoneDigits.length < 10) {
    errors.telefone = 'Telefone invalido. Informe DDD e numero.';
  }

  if (form.email.trim() && !EMAIL_PATTERN.test(form.email.trim())) {
    errors.email = 'E-mail invalido.';
  }

  const firstError = Object.values(errors)[0] || null;

  return {
    valid: Object.keys(errors).length === 0,
    errors,
    firstError
  };
}
