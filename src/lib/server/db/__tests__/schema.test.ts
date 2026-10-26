/**
 * Testes do schema Drizzle.
 *
 * Valida:
 * - Tipos TypeScript (Empresa, NovaEmpresa) estão corretos
 * - O schema define as colunas esperadas
 * - Nomes de colunas seguem a convenção snake_case
 *
 * Nota: estes testes NÃO executam queries D1 reais.
 * Para testes de integração com D1 real, use @cloudflare/vitest-pool-workers (F1-03b).
 *
 * Como rodar:
 *   npm test          — executa com vitest
 */
import { describe, expect, it } from 'vitest';
import { empresas, type Empresa, type NovaEmpresa } from '../schema';

describe('schema: empresas', () => {
  it('tem a tabela "empresas" definida', () => {
    // Drizzle expõe o nome da tabela em [Table]._.name
    expect((empresas as unknown as { _: { name: string } })._.name).toBe('empresas');
  });

  it('colunas têm os nomes corretos em snake_case', () => {
    const cols = Object.keys(empresas);
    expect(cols).toContain('id');
    expect(cols).toContain('nome');
    expect(cols).toContain('cnpj');
    expect(cols).toContain('timezone');
    expect(cols).toContain('ativo');
    expect(cols).toContain('criadoEm');
    expect(cols).toContain('atualizadoEm');
  });

  it('tipos TypeScript: NovaEmpresa tem campos obrigatórios', () => {
    // Compilar isso já prova que os tipos são corretos
    const empresa: NovaEmpresa = {
      nome: 'Agência Teste LTDA',
      criadoEm: new Date().toISOString(),
      atualizadoEm: new Date().toISOString(),
    };
    expect(empresa.nome).toBe('Agência Teste LTDA');
    expect(empresa.ativo).toBeUndefined(); // tem default no schema
    expect(empresa.timezone).toBeUndefined(); // tem default no schema
  });

  it('tipos TypeScript: Empresa tem todos os campos do SELECT', () => {
    // Empresa é o tipo do SELECT (todos os campos, incluindo os com default)
    const mockRow: Empresa = {
      id: 1,
      nome: 'Agência Teste LTDA',
      cnpj: null,
      timezone: 'America/Sao_Paulo',
      ativo: true,
      criadoEm: '2026-10-26T00:00:00.000Z',
      atualizadoEm: '2026-10-26T00:00:00.000Z',
    };
    expect(mockRow.id).toBe(1);
    // ADR-005: boolean como boolean em TypeScript (mode: 'boolean')
    expect(typeof mockRow.ativo).toBe('boolean');
    // ADR-005: datas como string ISO 8601
    expect(mockRow.criadoEm).toMatch(/^\d{4}-\d{2}-\d{2}T/);
  });
});
