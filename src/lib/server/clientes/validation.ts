/**
 * F3-01 — Validação e normalização do cadastro de clientes (servidor).
 *
 * Regras portadas do sistema legado (docs/f0/F0-04; origem em
 * src/lib/features/clientes/form.ts — os helpers puros são reutilizados):
 *   - nome obrigatório (após sanitização);
 *   - documento obrigatório: CPF com 11 dígitos ou CNPJ com 14 válido;
 *   - telefone obrigatório com DDD (10+ dígitos);
 *   - e-mail opcional, validado quando presente;
 *   - documento/cep ficam só com dígitos; e-mail em minúsculas;
 *   - PJ não tem gênero/nacionalidade.
 *
 * Entrada e saída em snake_case (contrato da API), como no legado.
 */

import { onlyDigits, isValidCnpj } from '$lib/features/clientes/form';

export type ClienteInput = {
  nome: string;
  tipo_pessoa: 'PF' | 'PJ';
  documento: string;
  nascimento: string | null;
  telefone: string;
  whatsapp: string | null;
  email: string | null;
  classificacao: string | null;
  endereco: string | null;
  numero: string | null;
  complemento: string | null;
  cidade: string | null;
  estado: string | null;
  cep: string | null;
  rg: string | null;
  genero: string | null;
  nacionalidade: string | null;
  tags: string[];
  tipo_cliente: string;
  notas: string | null;
};

export type ClienteValidationResult =
  | { ok: true; dados: ClienteInput }
  | { ok: false; errors: Record<string, string> };

const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const DATA_CIVIL_PATTERN = /^\d{4}-\d{2}-\d{2}$/;
const CLASSIFICACOES = ['A', 'B', 'C', 'D', 'E'];
const GENEROS = ['Masculino', 'Feminino', 'Outros'];

function textoOpcional(v: unknown, max: number): string | null {
  if (typeof v !== 'string') return null;
  const t = v.replace(/\s+/g, ' ').trim();
  return t ? t.slice(0, max) : null;
}

/** Sem truncamento: para campos validados contra padrão exato (data, UF, classificação). */
function textoIntegral(v: unknown): string | null {
  if (typeof v !== 'string') return null;
  const t = v.trim();
  return t || null;
}

function parseTags(v: unknown): string[] {
  if (Array.isArray(v)) {
    return v
      .map((t) => String(t ?? '').trim())
      .filter(Boolean)
      .slice(0, 20);
  }
  if (typeof v === 'string') {
    return v
      .split(',')
      .map((t) => t.trim())
      .filter(Boolean)
      .slice(0, 20);
  }
  return [];
}

/**
 * Valida o corpo de criação/edição de cliente.
 * Retorna os dados normalizados prontos para persistência.
 */
export function validarCliente(body: unknown): ClienteValidationResult {
  const b = (body ?? {}) as Record<string, unknown>;
  const errors: Record<string, string> = {};

  const nome = textoOpcional(b.nome, 200) ?? '';
  if (!nome) errors.nome = 'Informe o nome completo do cliente.';

  const tipoPessoa = b.tipo_pessoa === 'PJ' ? 'PJ' : 'PF';

  const documento = onlyDigits(
    typeof b.documento === 'string' ? b.documento : typeof b.cpf === 'string' ? b.cpf : ''
  );
  if (!documento) {
    errors.documento = tipoPessoa === 'PJ' ? 'Informe o CNPJ do cliente.' : 'Informe o CPF do cliente.';
  } else if (tipoPessoa === 'PJ') {
    if (!isValidCnpj(documento)) errors.documento = 'CNPJ inválido. Informe os 14 dígitos corretamente.';
  } else if (documento.length !== 11) {
    errors.documento = 'CPF inválido. Informe os 11 dígitos corretamente.';
  }

  const telefone = textoOpcional(b.telefone, 20) ?? '';
  if (!onlyDigits(telefone)) {
    errors.telefone = 'Informe o telefone do cliente.';
  } else if (onlyDigits(telefone).length < 10) {
    errors.telefone = 'Telefone inválido. Informe DDD e número.';
  }

  const email = textoOpcional(b.email, 320);
  if (email && !EMAIL_PATTERN.test(email)) {
    errors.email = 'E-mail inválido.';
  }

  const nascimento = textoIntegral(b.nascimento);
  if (nascimento && !DATA_CIVIL_PATTERN.test(nascimento)) {
    errors.nascimento = 'Data de nascimento inválida. Use AAAA-MM-DD.';
  }

  const classificacao = textoIntegral(b.classificacao);
  if (classificacao && !CLASSIFICACOES.includes(classificacao)) {
    errors.classificacao = 'Classificação inválida. Use A, B, C, D ou E.';
  }

  const estado = textoIntegral(b.estado);
  if (estado && !/^[A-Z]{2}$/.test(estado)) {
    errors.estado = 'UF inválida.';
  }

  const genero = textoOpcional(b.genero, 20);
  if (tipoPessoa === 'PF' && genero && !GENEROS.includes(genero)) {
    errors.genero = 'Gênero inválido.';
  }

  if (Object.keys(errors).length > 0) return { ok: false, errors };

  return {
    ok: true,
    dados: {
      nome,
      tipo_pessoa: tipoPessoa,
      documento,
      nascimento: tipoPessoa === 'PF' ? nascimento : null,
      telefone,
      whatsapp: textoOpcional(b.whatsapp, 20),
      email: email ? email.toLowerCase() : null,
      classificacao,
      endereco: textoOpcional(b.endereco, 200),
      numero: textoOpcional(b.numero, 20),
      complemento: textoOpcional(b.complemento, 100),
      cidade: textoOpcional(b.cidade, 120),
      estado,
      cep: onlyDigits(textoOpcional(b.cep, 9)) || null,
      rg: textoOpcional(b.rg, 20),
      genero: tipoPessoa === 'PJ' ? null : genero,
      nacionalidade: tipoPessoa === 'PJ' ? null : textoOpcional(b.nacionalidade, 60),
      tags: parseTags(b.tags),
      tipo_cliente: textoOpcional(b.tipo_cliente, 30) ?? 'passageiro',
      notas: textoOpcional(b.notas ?? b.observacoes, 2000),
    },
  };
}
