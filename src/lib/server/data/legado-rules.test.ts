import { describe, expect, it } from "vitest";
import {
  applyLegadoRowRules,
  formatCpfCnpj,
  normalizeNamePtBr,
  normalizeReciboNumero,
} from "./legado-rules";

describe("regras de escrita do catalogo legado", () => {
  it("normaliza nome como o gatilho do Postgres", () => {
    expect(normalizeNamePtBr("  JOAO   DA   SILVA ")).toBe("Joao da Silva");
    expect(normalizeNamePtBr("ana e maria")).toBe("Ana e Maria");
  });

  it("formata CPF e CNPJ e recusa tamanho invalido", () => {
    expect(formatCpfCnpj("12345678901")).toBe("123.456.789-01");
    expect(formatCpfCnpj("12345678000199")).toBe("12.345.678/0001-99");
    expect(() => formatCpfCnpj("123")).toThrow(/11 ou 14/);
  });

  it("aplica nome, documento e numero de recibo na linha", () => {
    const cliente = applyLegadoRowRules(
      "clientes",
      { nome: "MARIA DAS DORES", cpf: "12345678901" },
      "insert",
    );
    expect(cliente.nome).toBe("Maria das Dores");
    expect(cliente.cpf).toBe("123.456.789-01");

    const empresa = applyLegadoRowRules(
      "companies",
      { cnpj: "12.345.678/0001-99" },
      "insert",
    );
    expect(empresa.cnpj).toBe("12345678000199");

    const recibo = applyLegadoRowRules(
      "vendas_recibos",
      { numero_recibo: "rc-10/a" },
      "insert",
    );
    expect(recibo.numero_recibo_normalizado).toBe("RC10A");
    expect(normalizeReciboNumero(null)).toBeNull();
  });
});
