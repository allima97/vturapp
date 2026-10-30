/**
 * Testes da política RBAC VTUR — F2-03.
 *
 * Testes puros: nenhuma dependência de banco, rede ou runtime.
 * Valida a matriz de capacidades e as funções de autorização.
 */

import { describe, it, expect } from 'vitest';
import { can, canAny, canAll, listarCapacidades, temAcessoAoRecurso, authorize } from './authorize';
import { MATRIZ_RBAC, RECURSOS, ACOES } from './matrix';

// ─────────────────────────────────────────────────────────────────────────────
// can() — verificações básicas
// ─────────────────────────────────────────────────────────────────────────────

describe('can() — permissões básicas', () => {
  // Admin — acesso total
  it('admin pode ler empresa', () => expect(can('admin', 'empresa', 'ler')).toBe(true));
  it('admin pode gerenciar empresa', () => expect(can('admin', 'empresa', 'gerenciar')).toBe(true));
  it('admin pode excluir vendas', () => expect(can('admin', 'vendas', 'excluir')).toBe(true));
  it('admin pode ler auditoria', () => expect(can('admin', 'auditoria', 'ler')).toBe(true));
  it('admin pode gerenciar financeiro', () => expect(can('admin', 'financeiro', 'gerenciar')).toBe(true));
  it('admin pode convidar usuarios', () => expect(can('admin', 'usuarios', 'gerenciar')).toBe(true));

  // Operador — escrita limitada
  it('operador pode ler vendas', () => expect(can('operador', 'vendas', 'ler')).toBe(true));
  it('operador pode criar vendas', () => expect(can('operador', 'vendas', 'criar')).toBe(true));
  it('operador pode editar vendas', () => expect(can('operador', 'vendas', 'editar')).toBe(true));
  it('operador NÃO pode excluir vendas', () => expect(can('operador', 'vendas', 'excluir')).toBe(false));
  it('operador NÃO pode gerenciar empresa', () => expect(can('operador', 'empresa', 'gerenciar')).toBe(false));
  it('operador NÃO pode editar empresa', () => expect(can('operador', 'empresa', 'editar')).toBe(false));
  it('operador NÃO pode criar convites', () => expect(can('operador', 'convites', 'criar')).toBe(false));
  it('operador NÃO pode ler auditoria', () => expect(can('operador', 'auditoria', 'ler')).toBe(false));
  it('operador NÃO pode gerenciar financeiro', () => expect(can('operador', 'financeiro', 'gerenciar')).toBe(false));

  // Visualizador — somente leitura seletiva
  it('visualizador pode ler vendas', () => expect(can('visualizador', 'vendas', 'ler')).toBe(true));
  it('visualizador pode ler clientes', () => expect(can('visualizador', 'clientes', 'ler')).toBe(true));
  it('visualizador pode ler relatorios', () => expect(can('visualizador', 'relatorios', 'ler')).toBe(true));
  it('visualizador NÃO pode criar vendas', () => expect(can('visualizador', 'vendas', 'criar')).toBe(false));
  it('visualizador NÃO pode ler financeiro', () => expect(can('visualizador', 'financeiro', 'ler')).toBe(false));
  it('visualizador NÃO pode ler usuarios', () => expect(can('visualizador', 'usuarios', 'ler')).toBe(false));
  it('visualizador NÃO pode ler auditoria', () => expect(can('visualizador', 'auditoria', 'ler')).toBe(false));
  it('visualizador NÃO pode exportar relatorios', () => expect(can('visualizador', 'relatorios', 'exportar')).toBe(false));

  // Sem papel / null
  it('null NÃO pode ler vendas', () => expect(can(null, 'vendas', 'ler')).toBe(false));
  it('undefined NÃO pode ler vendas', () => expect(can(undefined, 'vendas', 'ler')).toBe(false));
});

// ─────────────────────────────────────────────────────────────────────────────
// canAny() / canAll()
// ─────────────────────────────────────────────────────────────────────────────

describe('canAny() / canAll()', () => {
  it('operador canAny vendas [criar, editar]', () =>
    expect(canAny('operador', 'vendas', ['criar', 'editar'])).toBe(true));
  it('visualizador NÃO canAny vendas [criar, editar]', () =>
    expect(canAny('visualizador', 'vendas', ['criar', 'editar'])).toBe(false));
  it('admin canAll vendas [ler, criar, editar, excluir]', () =>
    expect(canAll('admin', 'vendas', ['ler', 'criar', 'editar', 'excluir'])).toBe(true));
  it('operador NÃO canAll vendas [ler, criar, excluir]', () =>
    expect(canAll('operador', 'vendas', ['ler', 'criar', 'excluir'])).toBe(false));
});

// ─────────────────────────────────────────────────────────────────────────────
// Invariantes da matriz
// ─────────────────────────────────────────────────────────────────────────────

describe('invariantes da matriz RBAC', () => {
  it('admin superset de operador', () => {
    for (const cap of MATRIZ_RBAC.operador) {
      expect(MATRIZ_RBAC.admin.has(cap), `admin deveria ter ${cap}`).toBe(true);
    }
  });

  it('admin superset de visualizador', () => {
    for (const cap of MATRIZ_RBAC.visualizador) {
      expect(MATRIZ_RBAC.admin.has(cap), `admin deveria ter ${cap}`).toBe(true);
    }
  });

  it('todas as capacidades têm formato recurso:acao válido', () => {
    const recursoSet = new Set(RECURSOS);
    const acaoSet = new Set(ACOES);
    for (const papel of ['admin', 'operador', 'visualizador'] as const) {
      for (const cap of MATRIZ_RBAC[papel]) {
        const [recurso, acao] = cap.split(':');
        expect(recursoSet.has(recurso as typeof RECURSOS[number]), `recurso inválido: ${recurso}`).toBe(true);
        expect(acaoSet.has(acao as typeof ACOES[number]), `ação inválida: ${acao}`).toBe(true);
      }
    }
  });

  it('admin tem pelo menos uma capacidade por recurso', () => {
    for (const recurso of RECURSOS) {
      const temAlguma = ACOES.some((acao) => can('admin', recurso, acao));
      expect(temAlguma, `admin deveria ter acesso a ${recurso}`).toBe(true);
    }
  });

  it('visualizador tem menos ou igual capacidades que operador', () => {
    expect(MATRIZ_RBAC.visualizador.size).toBeLessThanOrEqual(MATRIZ_RBAC.operador.size);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// authorize() — guard funcional
// ─────────────────────────────────────────────────────────────────────────────

describe('authorize()', () => {
  it('permite quando papel tem permissão', () => {
    const result = authorize('admin', 'financeiro', 'gerenciar', () => 'ok');
    expect(result.ok).toBe(true);
    if (result.ok) expect(result.value).toBe('ok');
  });

  it('nega com 403 quando papel não tem permissão', async () => {
    const result = authorize('operador', 'empresa', 'editar', () => 'ok');
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.response.status).toBe(403);
      const body = await result.response.json() as { code: string };
      expect(body.code).toBe('FORBIDDEN');
    }
  });

  it('nega com 401 quando papel é null', async () => {
    const result = authorize(null, 'vendas', 'ler', () => 'ok');
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.response.status).toBe(401);
      const body = await result.response.json() as { code: string };
      expect(body.code).toBe('UNAUTHENTICATED');
    }
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// listarCapacidades() / temAcessoAoRecurso()
// ─────────────────────────────────────────────────────────────────────────────

describe('listarCapacidades() / temAcessoAoRecurso()', () => {
  it('listarCapacidades retorna lista ordenada', () => {
    const caps = listarCapacidades('operador');
    expect(caps.length).toBeGreaterThan(0);
    expect(caps).toEqual([...caps].sort());
  });

  it('visualizador NÃO tem acesso a financeiro', () =>
    expect(temAcessoAoRecurso('visualizador', 'financeiro')).toBe(false));

  it('operador tem acesso a financeiro', () =>
    expect(temAcessoAoRecurso('operador', 'financeiro')).toBe(true));

  it('admin tem acesso a todos os recursos', () => {
    for (const recurso of RECURSOS) {
      expect(temAcessoAoRecurso('admin', recurso)).toBe(true);
    }
  });

  it('null NÃO tem acesso a nenhum recurso', () => {
    for (const recurso of RECURSOS) {
      expect(temAcessoAoRecurso(null, recurso)).toBe(false);
    }
  });
});
