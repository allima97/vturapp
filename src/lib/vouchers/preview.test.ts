import { describe, expect, it } from "vitest";

import { buildVoucherPreviewDocument } from "./preview";
import type { VoucherProvider, VoucherRecord, VoucherAssetRecord } from "./types";

function voucher(provider: VoucherProvider): VoucherRecord {
  return {
    id: "voucher-1",
    company_id: "company-1",
    provider,
    nome: "Circuito Teste",
    status: "rascunho",
    codigo_fornecedor: "ABC123",
    reserva_online: "REF123",
    passageiros: "Cliente Teste",
    tipo_acomodacao: "Duplo",
    operador: "",
    resumo: "",
    data_inicio: "2026-06-10",
    data_fim: "2026-06-20",
    ativo: true,
    extra_data: {
      traslado_chegada: {
        detalhes: "Chegada no aeroporto as 10h",
        notas: "Aguardar na porta 2",
        telefone_transferista: "+55 11 99999-9999",
      },
      traslado_saida: {
        detalhes: "Saida do hotel as 06h",
        notas: "Confirmar malas na recepcao",
        telefone_transferista: "+55 11 98888-8888",
      },
    },
    voucher_dias: [],
    voucher_hoteis: [],
  };
}

describe("buildVoucherPreviewDocument", () => {
  it.each(["special_tours", "europamundo", "sato_tours"] as const)(
    "ignora logos antigos de empresa e fornecedor em %s",
    (provider) => {
      const assets = [
        { provider: "vtur", asset_kind: "logo", preview_url: "https://example.com/old-company.png", ativo: true },
        { provider, asset_kind: "logo", preview_url: "https://example.com/old-provider.png", ativo: true },
      ] as VoucherAssetRecord[];
      const html = buildVoucherPreviewDocument(voucher(provider), assets);
      expect(html).toContain('alt="VTur"');
      expect(html).not.toContain('https://example.com/old-');
    }
  );
  it.each(["special_tours", "europamundo", "sato_tours"] as const)(
    "inclui a identidade VTur sem configurar assets para %s",
    (provider) => {
      const html = buildVoucherPreviewDocument(voucher(provider));
      expect(html).toContain('alt="VTur"');
      expect(html).toContain('data:image/png;base64,');
    }
  );
  it("inclui traslados no PDF de Special Tours", () => {
    const html = buildVoucherPreviewDocument(voucher("special_tours"));

    expect(html).toContain("TRASLADOS");
    expect(html).toContain("TRANSFER IN");
    expect(html).toContain("Chegada no aeroporto as 10h");
    expect(html).toContain("Telefone do transferista: +55 11 99999-9999");
    expect(html).toContain("Notas traslado");
    expect(html).toContain("Confirmar malas na recepcao");
  });

  it("inclui traslados no PDF de Sato Tours", () => {
    const html = buildVoucherPreviewDocument(voucher("sato_tours"));

    expect(html).toContain("Sato Tours");
    expect(html).toContain("TRASLADOS");
    expect(html).toContain("TRANSFER OUT");
    expect(html).toContain("Saida do hotel as 06h");
  });

  it.each(["special_tours", "sato_tours"] as const)(
    "nao inclui a pagina de traslados quando %s nao tem dados de traslado",
    (provider) => {
      const item = voucher(provider);
      item.extra_data = {
        traslado_chegada: {
          detalhes: "",
          notas: "",
          telefone_transferista: "",
        },
        traslado_saida: {
          detalhes: "",
          notas: "",
          telefone_transferista: "",
        },
      };

      const html = buildVoucherPreviewDocument(item);

      expect(html).not.toContain("TRASLADOS");
      expect(html).not.toContain("TRANSFER IN");
      expect(html).not.toContain("TRANSFER OUT");
    },
  );

  it("inclui traslados quando apenas notas ou telefone foram preenchidos", () => {
    const item = voucher("special_tours");
    item.extra_data = {
      traslado_chegada: {
        detalhes: "",
        notas: "Motorista aguardara com placa",
        telefone_transferista: "",
      },
      traslado_saida: {
        detalhes: "",
        notas: "",
        telefone_transferista: "+55 11 97777-7777",
      },
    };

    const html = buildVoucherPreviewDocument(item);

    expect(html).toContain("TRASLADOS");
    expect(html).toContain("Motorista aguardara com placa");
    expect(html).toContain("Telefone do transferista: +55 11 97777-7777");
  });
});
