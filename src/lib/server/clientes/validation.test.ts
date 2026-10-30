/**
 * F3-01 — Testes unitários da validação de clientes (regras portadas do legado).
 *
 * Executar: npx vitest run src/lib/server/clientes/validation.test.ts
 */
import { describe, expect, it } from 'vitest';
import { validarCliente } from './validation';

const base = {
  nome: 'Maria da Silva',
  tipo_pessoa: 'PF',
  documento: '529.982.247-25', // CPF válido (dígitos verificadores)
  telefone: '(11) 98888-7777',
};

describe('validarCliente', () => {
  it('aceita cadastro mínimo válido e normaliza', () => {
    const r = validarCliente(base);
    expect(r.ok).toBe(true);
    if (r.ok) {
      expect(r.dados.nome).toBe('Maria da Silva');
      expect(r.dados.documento).toBe('52998224725'); // só dígitos
      expect(r.dados.tipo_pessoa).toBe('PF');
      expect(r.dados.tipo_cliente).toBe('passageiro'); // default
      expect(r.dados.tags).toEqual([]);
    }
  });

  it('exige nome, documento e telefone', () => {
    const r = validarCliente({ nome: '', documento: '', telefone: '' });
    expect(r.ok).toBe(false);
    if (!r.ok) {
      expect(r.errors.nome).toBeTruthy();
      expect(r.errors.documento).toBeTruthy();
      expect(r.errors.telefone).toBeTruthy();
    }
  });

  it('CPF precisa de 11 dígitos', () => {
    const r = validarCliente({ ...base, documento: '123456' });
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.errors.documento).toContain('CPF');
  });

  it('CNPJ precisa ser válido (dígitos verificadores)', () => {
    const invalido = validarCliente({
      ...base,
      tipo_pessoa: 'PJ',
      documento: '11.111.111/1111-11',
    });
    expect(invalido.ok).toBe(false);
    if (!invalido.ok) expect(invalido.errors.documento).toContain('CNPJ');

    const valido = validarCliente({
      ...base,
      tipo_pessoa: 'PJ',
      documento: '04.252.011/0001-10', // CNPJ válido
    });
    expect(valido.ok).toBe(true);
    if (valido.ok) expect(valido.dados.documento).toBe('04252011000110');
  });

  it('telefone precisa de DDD (10+ dígitos)', () => {
    const r = validarCliente({ ...base, telefone: '98888-7777' });
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.errors.telefone).toContain('DDD');
  });

  it('e-mail opcional, mas validado quando presente', () => {
    const semEmail = validarCliente({ ...base, email: '' });
    expect(semEmail.ok).toBe(true);

    const invalido = validarCliente({ ...base, email: 'maria@' });
    expect(invalido.ok).toBe(false);
    if (!invalido.ok) expect(invalido.errors.email).toBeTruthy();

    const valido = validarCliente({ ...base, email: '  MARIA@Exemplo.com ' });
    expect(valido.ok).toBe(true);
    if (valido.ok) expect(valido.dados.email).toBe('maria@exemplo.com');
  });

  it('PJ não guarda gênero/nacionalidade/nascimento', () => {
    const r = validarCliente({
      ...base,
      tipo_pessoa: 'PJ',
      documento: '04.252.011/0001-10',
      genero: 'Outros',
      nacionalidade: 'Brasileira',
      nascimento: '1990-01-01',
    });
    expect(r.ok).toBe(true);
    if (r.ok) {
      expect(r.dados.genero).toBeNull();
      expect(r.dados.nacionalidade).toBeNull();
      expect(r.dados.nascimento).toBeNull();
    }
  });

  it('nascimento é data civil AAAA-MM-DD (nunca timestamp)', () => {
    const invalido = validarCliente({ ...base, nascimento: '01/01/1990' });
    expect(invalido.ok).toBe(false);

    const comTimestamp = validarCliente({ ...base, nascimento: '1990-01-01T00:00:00Z' });
    expect(comTimestamp.ok).toBe(false);

    const valido = validarCliente({ ...base, nascimento: '1990-01-01' });
    expect(valido.ok).toBe(true);
  });

  it('tags aceitam array ou string separada por vírgula', () => {
    const arr = validarCliente({ ...base, tags: ['vip', ' família '] });
    expect(arr.ok && arr.dados.tags).toEqual(['vip', 'família']);

    const str = validarCliente({ ...base, tags: 'vip, família' });
    expect(str.ok && str.dados.tags).toEqual(['vip', 'família']);
  });

  it('classificação e UF validadas', () => {
    const r = validarCliente({ ...base, classificacao: 'Z', estado: 'XX1' });
    expect(r.ok).toBe(false);
    if (!r.ok) {
      expect(r.errors.classificacao).toBeTruthy();
      expect(r.errors.estado).toBeTruthy();
    }
  });

  it('aceita campo legado cpf como alias de documento', () => {
    const r = validarCliente({ ...base, documento: undefined, cpf: '52998224725' });
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.dados.documento).toBe('52998224725');
  });
});
