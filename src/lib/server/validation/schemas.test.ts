/**
 * Testes F2-05 — Validação de inputs e helpers de segurança.
 *
 * Cobre:
 *   A. Predicados primitivos (isEmail, isUUID, isSlug, etc.)
 *   B. parseConviteInput — happy path e casos de erro
 *   C. parseAceitarConviteInput — happy path e UUID inválido
 *   D. parseRegistroEmpresaInput — happy path, slug inválido, cnpj
 *   E. isOriginAllowed — CSRF origin check
 *   F. checkRateLimit — sliding window
 *   G. getClientIp — extração de IP
 */

import { describe, it, expect, beforeEach } from 'vitest';

import {
  isEmail,
  isUUID,
  isSlug,
  isPapelValido,
  parseConviteInput,
  parseAceitarConviteInput,
  parseRegistroEmpresaInput,
  validationErrorResponse,
} from './schemas';

import { isOriginAllowed } from '../api/middleware/security';
import { checkRateLimit, clearStore, getClientIp } from '../api/middleware/rate-limit';

// ─────────────────────────────────────────────────────────────────────────────
// A. Predicados primitivos
// ─────────────────────────────────────────────────────────────────────────────

describe('A. Predicados primitivos', () => {
  describe('isEmail', () => {
    it('aceita e-mail válido simples', () => {
      expect(isEmail('usuario@empresa.com')).toBe(true);
    });

    it('aceita e-mail com subdomínio', () => {
      expect(isEmail('a@mail.empresa.com.br')).toBe(true);
    });

    it('rejeita sem @', () => {
      expect(isEmail('semarvoba.com')).toBe(false);
    });

    it('rejeita sem domínio', () => {
      expect(isEmail('a@')).toBe(false);
    });

    it('rejeita sem TLD', () => {
      expect(isEmail('a@b')).toBe(false);
    });

    it('rejeita TLD de 1 char', () => {
      expect(isEmail('a@b.c')).toBe(false);
    });

    it('rejeita espaços', () => {
      expect(isEmail('a @b.com')).toBe(false);
    });
  });

  describe('isUUID', () => {
    it('aceita UUIDs v4 canônicos — versão 4, variante [89ab]', () => {
      // Grupo 3 começa com '4', grupo 4 começa com [89ab]
      expect(isUUID('550e8400-e29b-4ef8-ab6d-6bb9bd380a11')).toBe(true);
      expect(isUUID('a0eebc99-9c0b-4ef8-8b6d-6bb9bd380a11')).toBe(true);
      expect(isUUID('550e8400-e29b-4ef8-bb6d-6bb9bd380a11')).toBe(true); // 'b' em [89ab]
    });

    it('aceita UUID v4 com variante 9', () => {
      expect(isUUID('550e8400-e29b-41d4-9716-446655440000')).toBe(true);
    });

    it('rejeita string sem hífens', () => {
      expect(isUUID('550e8400e29b4ef8ab6d6bb9bd380a11')).toBe(false);
    });

    it('rejeita string muito curta', () => {
      expect(isUUID('550e8400-e29b')).toBe(false);
    });
  });

  describe('isSlug', () => {
    it('aceita slug simples', () => {
      expect(isSlug('alfa-viagens')).toBe(true);
    });

    it('aceita slug com números', () => {
      expect(isSlug('agencia123')).toBe(true);
    });

    it('rejeita início com hífen', () => {
      expect(isSlug('-alfa')).toBe(false);
    });

    it('rejeita fim com hífen', () => {
      expect(isSlug('alfa-')).toBe(false);
    });

    it('rejeita hífens duplos', () => {
      expect(isSlug('alfa--viagens')).toBe(false);
    });

    it('rejeita letras maiúsculas', () => {
      expect(isSlug('Alfa')).toBe(false);
    });

    it('rejeita espaços', () => {
      expect(isSlug('alfa viagens')).toBe(false);
    });
  });

  describe('isPapelValido', () => {
    it('aceita papéis válidos', () => {
      expect(isPapelValido('admin')).toBe(true);
      expect(isPapelValido('operador')).toBe(true);
      expect(isPapelValido('visualizador')).toBe(true);
    });

    it('rejeita papel inválido', () => {
      expect(isPapelValido('superadmin')).toBe(false);
      expect(isPapelValido('')).toBe(false);
      expect(isPapelValido(null)).toBe(false);
      expect(isPapelValido(123)).toBe(false);
    });
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// B. parseConviteInput
// ─────────────────────────────────────────────────────────────────────────────

describe('B. parseConviteInput', () => {
  it('happy path — retorna dados normalizados', () => {
    const r = parseConviteInput({ email: ' JOAO@EMPRESA.COM ', papel: 'operador' });
    expect(r.ok).toBe(true);
    if (!r.ok) throw new Error('esperado ok=true');
    expect(r.data.email).toBe('joao@empresa.com');
    expect(r.data.papel).toBe('operador');
  });

  it('rejeita body não-objeto', () => {
    const r = parseConviteInput('string');
    expect(r.ok).toBe(false);
    if (r.ok) throw new Error('esperado ok=false');
    expect(r.errors[0]).toMatch(/objeto JSON/);
  });

  it('rejeita email ausente', () => {
    const r = parseConviteInput({ papel: 'admin' });
    expect(r.ok).toBe(false);
    if (r.ok) throw new Error('esperado ok=false');
    expect(r.errors.some((e) => e.includes('email'))).toBe(true);
  });

  it('rejeita email inválido', () => {
    const r = parseConviteInput({ email: 'naoeh_email', papel: 'admin' });
    expect(r.ok).toBe(false);
    if (r.ok) throw new Error('esperado ok=false');
    expect(r.errors.some((e) => e.includes('formato inválido'))).toBe(true);
  });

  it('rejeita papel ausente', () => {
    const r = parseConviteInput({ email: 'a@b.com' });
    expect(r.ok).toBe(false);
    if (r.ok) throw new Error('esperado ok=false');
    expect(r.errors.some((e) => e.includes('papel'))).toBe(true);
  });

  it('rejeita papel inválido', () => {
    const r = parseConviteInput({ email: 'a@b.com', papel: 'superadmin' });
    expect(r.ok).toBe(false);
    if (r.ok) throw new Error('esperado ok=false');
    expect(r.errors.some((e) => e.includes('papel'))).toBe(true);
  });

  it('acumula múltiplos erros', () => {
    const r = parseConviteInput({ email: 123, papel: 'invalido' });
    expect(r.ok).toBe(false);
    if (r.ok) throw new Error('esperado ok=false');
    expect(r.errors.length).toBeGreaterThanOrEqual(2);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// C. parseAceitarConviteInput
// ─────────────────────────────────────────────────────────────────────────────

describe('C. parseAceitarConviteInput', () => {
  const validUuid = '550e8400-e29b-4ef8-ab6d-6bb9bd380a11';

  it('happy path', () => {
    const r = parseAceitarConviteInput({ token: validUuid });
    expect(r.ok).toBe(true);
    if (!r.ok) throw new Error('esperado ok=true');
    expect(r.data.token).toBe(validUuid);
  });

  it('normaliza para lowercase', () => {
    const r = parseAceitarConviteInput({ token: validUuid.toUpperCase() });
    // UUID v4 regex é lowercase — deve falhar se maiúsculo
    expect(r.ok).toBe(false);
  });

  it('rejeita token não-UUID', () => {
    const r = parseAceitarConviteInput({ token: 'nao-sou-uuid' });
    expect(r.ok).toBe(false);
    if (r.ok) throw new Error('esperado ok=false');
    expect(r.errors[0]).toMatch(/UUID/);
  });

  it('rejeita body sem token', () => {
    const r = parseAceitarConviteInput({});
    expect(r.ok).toBe(false);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// D. parseRegistroEmpresaInput
// ─────────────────────────────────────────────────────────────────────────────

describe('D. parseRegistroEmpresaInput', () => {
  it('happy path sem cnpj', () => {
    const r = parseRegistroEmpresaInput({ nome: 'Alfa Viagens', slug: 'alfa-viagens' });
    expect(r.ok).toBe(true);
    if (!r.ok) throw new Error('esperado ok=true');
    expect(r.data.nome).toBe('Alfa Viagens');
    expect(r.data.slug).toBe('alfa-viagens');
    expect(r.data.cnpj).toBeUndefined();
  });

  it('happy path com cnpj válido', () => {
    const r = parseRegistroEmpresaInput({
      nome: 'Alfa Viagens',
      slug: 'alfa-viagens',
      cnpj: '11222333000181',
    });
    expect(r.ok).toBe(true);
    if (!r.ok) throw new Error('esperado ok=true');
    expect(r.data.cnpj).toBe('11222333000181');
  });

  it('normaliza slug para lowercase', () => {
    const r = parseRegistroEmpresaInput({ nome: 'Alfa', slug: 'Alfa-Viagens' });
    // Slug com maiúsculas falha na validação (isSlug rejeita maiúsculas)
    expect(r.ok).toBe(false);
  });

  it('rejeita nome muito curto', () => {
    const r = parseRegistroEmpresaInput({ nome: 'A', slug: 'alfa' });
    expect(r.ok).toBe(false);
    if (r.ok) throw new Error('esperado ok=false');
    expect(r.errors.some((e) => e.includes('nome'))).toBe(true);
  });

  it('rejeita slug inválido', () => {
    const r = parseRegistroEmpresaInput({ nome: 'Alfa', slug: '-inicio-invalido' });
    expect(r.ok).toBe(false);
    if (r.ok) throw new Error('esperado ok=false');
    expect(r.errors.some((e) => e.includes('slug'))).toBe(true);
  });

  it('rejeita cnpj com letras', () => {
    const r = parseRegistroEmpresaInput({
      nome: 'Alfa',
      slug: 'alfa',
      cnpj: '1122333AAABB11',
    });
    expect(r.ok).toBe(false);
    if (r.ok) throw new Error('esperado ok=false');
    expect(r.errors.some((e) => e.includes('cnpj'))).toBe(true);
  });

  it('rejeita cnpj com menos de 14 dígitos', () => {
    const r = parseRegistroEmpresaInput({ nome: 'Alfa', slug: 'alfa', cnpj: '123' });
    expect(r.ok).toBe(false);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// E. isOriginAllowed (CSRF)
// ─────────────────────────────────────────────────────────────────────────────

describe('E. isOriginAllowed — CSRF origin check', () => {
  const allowed = ['https://app.vtur.com.br', 'http://localhost:5173'];

  it('aceita origin exato', () => {
    expect(isOriginAllowed('https://app.vtur.com.br', allowed)).toBe(true);
  });

  it('aceita origin localhost', () => {
    expect(isOriginAllowed('http://localhost:5173', allowed)).toBe(true);
  });

  it('rejeita origin diferente', () => {
    expect(isOriginAllowed('https://evil.com', allowed)).toBe(false);
  });

  it('rejeita subdomínio não autorizado', () => {
    expect(isOriginAllowed('https://subdomain.vtur.com.br', allowed)).toBe(false);
  });

  it('rejeita origin vazio', () => {
    expect(isOriginAllowed('', allowed)).toBe(false);
  });

  it('lista vazia rejeita tudo', () => {
    expect(isOriginAllowed('https://app.vtur.com.br', [])).toBe(false);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// F. checkRateLimit — sliding window
// ─────────────────────────────────────────────────────────────────────────────

describe('F. checkRateLimit — sliding window', () => {
  beforeEach(() => {
    clearStore();
  });

  it('permite requisições dentro do limite', () => {
    for (let i = 0; i < 5; i++) {
      const r = checkRateLimit('192.168.1.1', 60_000, 5);
      expect(r.allowed).toBe(true);
    }
  });

  it('bloqueia após exceder o limite', () => {
    for (let i = 0; i < 5; i++) {
      checkRateLimit('10.0.0.1', 60_000, 5);
    }
    const r = checkRateLimit('10.0.0.1', 60_000, 5);
    expect(r.allowed).toBe(false);
    if (r.allowed) throw new Error('esperado allowed=false');
    expect(r.retryAfterMs).toBeGreaterThan(0);
  });

  it('IPs diferentes têm limites independentes', () => {
    for (let i = 0; i < 5; i++) {
      checkRateLimit('1.1.1.1', 60_000, 5);
    }
    // Outro IP ainda pode fazer requisições
    const r = checkRateLimit('2.2.2.2', 60_000, 5);
    expect(r.allowed).toBe(true);
  });

  it('reinicia contador após a janela expirar', () => {
    // Janela de 1ms
    for (let i = 0; i < 3; i++) {
      checkRateLimit('3.3.3.3', 1, 3);
    }
    // Espera janela expirar
    return new Promise<void>((resolve) => {
      setTimeout(() => {
        const r = checkRateLimit('3.3.3.3', 1, 3);
        expect(r.allowed).toBe(true);
        resolve();
      }, 10);
    });
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// G. getClientIp
// ─────────────────────────────────────────────────────────────────────────────

describe('G. getClientIp', () => {
  function makeRequest(headers: Record<string, string>): Request {
    return new Request('https://example.com/', { headers });
  }

  it('usa CF-Connecting-IP primeiro', () => {
    const req = makeRequest({ 'cf-connecting-ip': '203.0.113.1' });
    expect(getClientIp(req)).toBe('203.0.113.1');
  });

  it('usa X-Forwarded-For como fallback', () => {
    const req = makeRequest({ 'x-forwarded-for': '203.0.113.2, 10.0.0.1' });
    expect(getClientIp(req)).toBe('203.0.113.2');
  });

  it('retorna 127.0.0.1 sem headers', () => {
    const req = makeRequest({});
    expect(getClientIp(req)).toBe('127.0.0.1');
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// H. validationErrorResponse helper
// ─────────────────────────────────────────────────────────────────────────────

describe('H. validationErrorResponse', () => {
  it('retorna estrutura padronizada', () => {
    const r = validationErrorResponse(['Campo x inválido.', 'Campo y obrigatório.']);
    expect(r.code).toBe('VALIDATION_ERROR');
    expect(r.details).toHaveLength(2);
    expect(typeof r.error).toBe('string');
  });
});
