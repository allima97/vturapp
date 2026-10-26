/**
 * F2-04 — Testes de isolamento de tenant.
 *
 * Prova que:
 *   A. assertTenantOwnership() bloqueia leitura cross-tenant
 *   B. injectTenantId() previne write injection pelo body
 *   C. validateTenantWrite() detecta cross-tenant write explícito
 *   D. assertHasEmpresaId() exige empresa associada
 *   E. Padrão de isolamento em getMembro / revogarMembro (simulado sem D1)
 *
 * Nota: as funções getMembro() e revogarMembro() usam Drizzle ORM + D1.
 * Os testes de isolamento abaixo simulam o padrão dessas funções com dados
 * em memória para provar a lógica de guarda sem dependência de banco.
 * Testes de integração com D1 real rodam via wrangler (ver docs/f2/F2-04-isolamento.md).
 *
 * Executar: npx vitest run src/lib/server/tenant/tenant.test.ts
 */

import { describe, it, expect } from 'vitest';
import {
  assertTenantOwnership,
  injectTenantId,
  validateTenantWrite,
  assertHasEmpresaId,
  isTenantMismatch,
  TenantError,
} from './guard';

// ─────────────────────────────────────────────────────────────────────────────
// Seed constants (espelham f2-seed.sql)
// ─────────────────────────────────────────────────────────────────────────────
const EMPRESA_ALFA = 1;
const EMPRESA_BETA = 2;

// Membros de test (sem D1)
const membrosAlfa = [
  { id: 1, empresaId: EMPRESA_ALFA, userId: 'usr-alfa-admin-001', papel: 'admin',        ativo: true },
  { id: 2, empresaId: EMPRESA_ALFA, userId: 'usr-alfa-oper-001',  papel: 'operador',     ativo: true },
  { id: 3, empresaId: EMPRESA_ALFA, userId: 'usr-alfa-view-001',  papel: 'visualizador', ativo: true },
];
const membrosBeta = [
  { id: 4, empresaId: EMPRESA_BETA, userId: 'usr-beta-admin-001', papel: 'admin',        ativo: true },
  { id: 5, empresaId: EMPRESA_BETA, userId: 'usr-beta-oper-001',  papel: 'operador',     ativo: true },
  { id: 6, empresaId: EMPRESA_BETA, userId: 'usr-beta-view-001',  papel: 'visualizador', ativo: true },
];

// ─────────────────────────────────────────────────────────────────────────────
// Helpers que simulam o padrão getMembro / revogarMembro sem Drizzle
// ─────────────────────────────────────────────────────────────────────────────

type Membro = { id: number; empresaId: number; userId: string; papel: string; ativo: boolean };
type MembroResult =
  | { ok: true;  membro: Membro }
  | { ok: false; code: 'NAO_ENCONTRADO' | 'CROSS_TENANT' | 'ERRO_INTERNO'; error: string };

/**
 * Simula getMembro(): busca em array + assertTenantOwnership.
 * Replica exatamente a lógica de src/lib/server/tenant/members.ts
 * sem D1/Drizzle, para provar o padrão de isolamento de leitura.
 */
function simulateGetMembro(db: Membro[], id: number, authEmpresaId: number): MembroResult {
  const row = db.find(m => m.id === id) ?? null;
  if (!row) return { ok: false, code: 'NAO_ENCONTRADO', error: 'Membro não encontrado.' };
  try {
    assertTenantOwnership(authEmpresaId, row.empresaId);
    return { ok: true, membro: row };
  } catch (err) {
    if (err instanceof TenantError) return { ok: false, code: 'CROSS_TENANT', error: err.message };
    return { ok: false, code: 'ERRO_INTERNO', error: 'Erro interno.' };
  }
}

/**
 * Simula revogarMembro(): busca + assertTenantOwnership + soft-delete.
 * Replica a lógica de members.ts sem D1/Drizzle.
 */
function simulateRevogarMembro(db: Membro[], id: number, authEmpresaId: number): MembroResult {
  const row = db.find(m => m.id === id) ?? null;
  if (!row) return { ok: false, code: 'NAO_ENCONTRADO', error: 'Membro não encontrado.' };
  try {
    assertTenantOwnership(authEmpresaId, row.empresaId);
    row.ativo = false; // soft-delete
    return { ok: true, membro: { ...row, ativo: false } };
  } catch (err) {
    if (err instanceof TenantError) return { ok: false, code: 'CROSS_TENANT', error: err.message };
    return { ok: false, code: 'ERRO_INTERNO', error: 'Erro interno.' };
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// 1. assertTenantOwnership
// ─────────────────────────────────────────────────────────────────────────────

describe('assertTenantOwnership()', () => {
  it('não lança quando empresa_ids são iguais', () => {
    expect(() => assertTenantOwnership(1, 1)).not.toThrow();
    expect(() => assertTenantOwnership(99, 99)).not.toThrow();
  });

  it('lança TenantError quando empresa_ids diferem', () => {
    expect(() => assertTenantOwnership(1, 2)).toThrow(TenantError);
    expect(() => assertTenantOwnership(2, 1)).toThrow(TenantError);
  });

  it('TenantError.code === CROSS_TENANT_READ', () => {
    try {
      assertTenantOwnership(1, 2);
      expect.fail('deveria ter lançado');
    } catch (e) {
      expect(e).toBeInstanceOf(TenantError);
      expect((e as TenantError).code).toBe('CROSS_TENANT_READ');
    }
  });

  it('mensagem inclui os dois empresa_ids', () => {
    try {
      assertTenantOwnership(1, 2);
    } catch (e) {
      expect((e as TenantError).message).toContain('2');
      expect((e as TenantError).message).toContain('1');
    }
  });

  it('[F2-04] usuário Alfa não lê registro de Beta', () => {
    expect(() => assertTenantOwnership(EMPRESA_ALFA, EMPRESA_BETA)).toThrow(TenantError);
  });

  it('[F2-04] usuário Beta não lê registro de Alfa', () => {
    expect(() => assertTenantOwnership(EMPRESA_BETA, EMPRESA_ALFA)).toThrow(TenantError);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// 2. injectTenantId
// ─────────────────────────────────────────────────────────────────────────────

describe('injectTenantId()', () => {
  it('força empresaId do auth context, descartando o do body', () => {
    const body = { titulo: 'Viagem Paris', empresaId: 999 };
    const resultado = injectTenantId(body, EMPRESA_ALFA);
    expect(resultado.empresaId).toBe(EMPRESA_ALFA);
    expect(resultado.titulo).toBe('Viagem Paris');
  });

  it('injeta empresaId quando body não tem', () => {
    const body = { titulo: 'Tour Rio' };
    const resultado = injectTenantId(body, EMPRESA_BETA);
    expect(resultado.empresaId).toBe(EMPRESA_BETA);
  });

  it('não muta o objeto original', () => {
    const body = { foo: 'bar', empresaId: 5 };
    const original = { ...body };
    injectTenantId(body, 7);
    expect(body).toEqual(original);
  });

  it('[F2-04] previne cross-tenant write via body injection', () => {
    const bodyMalicioso = { empresaId: EMPRESA_BETA, titulo: 'Venda de Beta' };
    const resultado = injectTenantId(bodyMalicioso, EMPRESA_ALFA);
    expect(resultado.empresaId).toBe(EMPRESA_ALFA); // empresa Beta foi descartada
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// 3. validateTenantWrite
// ─────────────────────────────────────────────────────────────────────────────

describe('validateTenantWrite()', () => {
  it('não lança quando body empresaId corresponde ao auth', () => {
    expect(() => validateTenantWrite(1, 1)).not.toThrow();
    expect(() => validateTenantWrite(undefined, 1)).not.toThrow();
    expect(() => validateTenantWrite(null, 1)).not.toThrow();
  });

  it('lança TenantError quando body empresaId é diferente', () => {
    expect(() => validateTenantWrite(2, 1)).toThrow(TenantError);
  });

  it('TenantError.code === CROSS_TENANT_WRITE', () => {
    try {
      validateTenantWrite(2, 1);
      expect.fail('deveria ter lançado');
    } catch (e) {
      expect((e as TenantError).code).toBe('CROSS_TENANT_WRITE');
    }
  });

  it('[F2-04] rejeita gravação de Alfa tentando escrever em Beta', () => {
    expect(() => validateTenantWrite(EMPRESA_BETA, EMPRESA_ALFA)).toThrow(TenantError);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// 4. assertHasEmpresaId
// ─────────────────────────────────────────────────────────────────────────────

describe('assertHasEmpresaId()', () => {
  it('não lança com empresa_id válido', () => {
    expect(() => assertHasEmpresaId(1)).not.toThrow();
    expect(() => assertHasEmpresaId(999)).not.toThrow();
  });

  it('lança TenantError para null', () => {
    expect(() => assertHasEmpresaId(null)).toThrow(TenantError);
  });

  it('lança TenantError para undefined', () => {
    expect(() => assertHasEmpresaId(undefined)).toThrow(TenantError);
  });

  it('lança TenantError para 0 (falsy)', () => {
    expect(() => assertHasEmpresaId(0)).toThrow(TenantError);
  });

  it('code === MISSING_EMPRESA_ID', () => {
    try {
      assertHasEmpresaId(null);
      expect.fail('deveria ter lançado');
    } catch (e) {
      expect((e as TenantError).code).toBe('MISSING_EMPRESA_ID');
    }
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// 5. isTenantMismatch
// ─────────────────────────────────────────────────────────────────────────────

describe('isTenantMismatch()', () => {
  it('retorna false quando iguais', () => {
    expect(isTenantMismatch(1, 1)).toBe(false);
  });

  it('retorna true quando diferentes', () => {
    expect(isTenantMismatch(1, 2)).toBe(true);
    expect(isTenantMismatch(2, 1)).toBe(true);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// 6. Isolamento de leitura — padrão getMembro (simulado)
// ─────────────────────────────────────────────────────────────────────────────

describe('[F2-04] Isolamento de leitura — padrão getMembro', () => {
  // Cópia mutável para não afetar outros testes
  const db = [...membrosAlfa, ...membrosBeta].map(m => ({ ...m }));

  it('usuário Alfa lê membro de Alfa com sucesso', () => {
    const r = simulateGetMembro(db, 1, EMPRESA_ALFA);
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.membro.empresaId).toBe(EMPRESA_ALFA);
  });

  it('[F2-04] usuário Beta BLOQUEADO ao ler membro de Alfa', () => {
    const r = simulateGetMembro(db, 1, EMPRESA_BETA); // membro 1 = Alfa
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.code).toBe('CROSS_TENANT');
  });

  it('[F2-04] usuário Alfa BLOQUEADO ao ler membro de Beta', () => {
    const r = simulateGetMembro(db, 4, EMPRESA_ALFA); // membro 4 = Beta
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.code).toBe('CROSS_TENANT');
  });

  it('usuário Beta lê membro de Beta com sucesso', () => {
    const r = simulateGetMembro(db, 4, EMPRESA_BETA);
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.membro.empresaId).toBe(EMPRESA_BETA);
  });

  it('retorna NAO_ENCONTRADO para id inexistente', () => {
    const r = simulateGetMembro(db, 999, EMPRESA_ALFA);
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.code).toBe('NAO_ENCONTRADO');
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// 7. Isolamento de gravação/revogação — padrão revogarMembro (simulado)
// ─────────────────────────────────────────────────────────────────────────────

describe('[F2-04] Revogação de membro', () => {
  // Cópia mutável por test para isolamento
  function makeFreshDb() {
    return [...membrosAlfa, ...membrosBeta].map(m => ({ ...m }));
  }

  it('admin Alfa revoga membro de Alfa — ativo torna-se false', () => {
    const db = makeFreshDb();
    const r = simulateRevogarMembro(db, 3, EMPRESA_ALFA); // membro 3 = Alfa
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.membro.ativo).toBe(false);
  });

  it('[F2-04] usuário Beta BLOQUEADO ao revogar membro de Alfa', () => {
    const db = makeFreshDb();
    const r = simulateRevogarMembro(db, 3, EMPRESA_BETA); // membro 3 = Alfa
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.code).toBe('CROSS_TENANT');
  });

  it('[F2-04] usuário Alfa BLOQUEADO ao revogar membro de Beta', () => {
    const db = makeFreshDb();
    const r = simulateRevogarMembro(db, 6, EMPRESA_ALFA); // membro 6 = Beta
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.code).toBe('CROSS_TENANT');
  });

  it('admin Beta revoga membro de Beta — ativo torna-se false', () => {
    const db = makeFreshDb();
    const r = simulateRevogarMembro(db, 5, EMPRESA_BETA); // membro 5 = Beta
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.membro.ativo).toBe(false);
  });

  it('retorna NAO_ENCONTRADO para id inexistente', () => {
    const db = makeFreshDb();
    const r = simulateRevogarMembro(db, 999, EMPRESA_ALFA);
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.code).toBe('NAO_ENCONTRADO');
  });

  it('[F2-04] revogação é soft-delete — registro permanece, ativo=false', () => {
    const db = makeFreshDb();
    simulateRevogarMembro(db, 2, EMPRESA_ALFA); // revoga membro 2 (Alfa)
    // O registro ainda existe no banco (soft-delete)
    const membroAinda = db.find(m => m.id === 2);
    expect(membroAinda).toBeDefined();
    expect(membroAinda!.ativo).toBe(false);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// 8. Invariantes de isolamento (suite resumo F2-04)
// ─────────────────────────────────────────────────────────────────────────────

describe('[F2-04] Invariantes de isolamento de tenant', () => {
  it('A. Leitura: tenant A não acessa dados de tenant B', () => {
    expect(() => assertTenantOwnership(EMPRESA_ALFA, EMPRESA_BETA)).toThrow(TenantError);
  });

  it('B. Gravação: tenant A não grava em tenant B via body injection', () => {
    const bodyMalicioso = { empresaId: EMPRESA_BETA };
    const resultado = injectTenantId(bodyMalicioso, EMPRESA_ALFA);
    expect(resultado.empresaId).toBe(EMPRESA_ALFA);
  });

  it('C. Gravação: validateTenantWrite detecta cross-tenant write explícito', () => {
    expect(() => validateTenantWrite(EMPRESA_BETA, EMPRESA_ALFA)).toThrow(TenantError);
  });

  it('D. Sem empresa: usuário sem empresa não acessa nenhum tenant', () => {
    expect(() => assertHasEmpresaId(null)).toThrow(TenantError);
    expect(() => assertHasEmpresaId(undefined)).toThrow(TenantError);
  });

  it('E. Revogação: membro revogado tem ativo=false (sem acesso futuro)', () => {
    const db = [...membrosAlfa].map(m => ({ ...m }));
    const r = simulateRevogarMembro(db, 2, EMPRESA_ALFA);
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.membro.ativo).toBe(false);
  });
});
