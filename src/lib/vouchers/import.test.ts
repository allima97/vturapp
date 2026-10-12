import { describe, expect, it } from "vitest";

import { parseSpecialToursCircuitPasteText, parseSpecialToursHotelPaste, parseVoucherImportText } from "./import";

const CONFIRMED_HOTELS_TEXT = `HOTEIS CONFIRMADOS
Para obter a lista com a hotelaria confirmada, acesse o link: www.example.com/minhascompras 48 horas antes do seu embarque.
Hotel EVORA HOTEL Bed and Breakfast - EXPDTE
Endereco /Address Av. Tulio Espanca Apart. 93
Telefone +351/266748800
Check In/Out 2026-06-22 a 2026-06-23
Hotel SANTOS PRAGA Bed and Breakfast - EXPDTE
Endereco /Address ANTONIO LOPEZ 65
Telefone +34/914690600
Check In/Out 2026-06-17 a 2026-06-18
Hotel SANTOS PRAGA Bed and Breakfast - EXPDTE
Endereco /Address ANTONIO LOPEZ 65
Telefone +34/914690600
Check In/Out 2026-06-18 a 2026-06-19
Hotel B&B PORTO GAIA Bed and Breakfast - EXPDTE
Endereco /Address Av. da Republica n.o 1351
Telefone +00351 22 323 7385
Check In/Out 2026-06-24 a 2026-06-25
Hotel B&B PORTO GAIA Bed and Breakfast - EXPDTE
Endereco /Address Av. da Republica n.o 1351
Telefone +00351 22 323 7385
Check In/Out 2026-06-25 a 2026-06-26
Hotel ROMA LISBOA HOTEL Bed and Breakfast - EXPDTE
Endereco /Address AV DE ROMA 33
Telefone +351/217932244
Check In/Out 2026-06-19 a 2026-06-20
Hotel ROMA LISBOA HOTEL Bed and Breakfast - EXPDTE
Endereco /Address AV DE ROMA 33
Telefone +351/217932244
Check In/Out 2026-06-20 a 2026-06-21
Hotel ROMA LISBOA HOTEL Bed and Breakfast - EXPDTE
Endereco /Address AV DE ROMA 33
Telefone +351/217932244
Check In/Out 2026-06-21 a 2026-06-22
Hotel COIMBRA AEMINIUM AFFILIATED BY MELIA Bed and Breakfast - EXPDTE
Endereco /Address AVDA ARMANDO GONSALVES 20
Telefone +351/239480800
Check In/Out 2026-06-23 a 2026-06-24`;

describe("hotel voucher import", () => {
  it("reconhece hoteis confirmados por labels e mescla estadias consecutivas", () => {
    const result = parseSpecialToursHotelPaste(CONFIRMED_HOTELS_TEXT, "europamundo");
    const byHotel = new Map(result.hoteis.map((hotel) => [hotel.hotel, hotel]));

    expect(result.provider).toBe("europamundo");
    expect(result.hoteis).toHaveLength(5);
    expect(byHotel.get("SANTOS PRAGA Bed and Breakfast - EXPDTE")).toMatchObject({
      endereco: "ANTONIO LOPEZ 65",
      telefone: "+34/914690600",
      data_inicio: "2026-06-17",
      data_fim: "2026-06-19",
      noites: 2,
    });
    expect(byHotel.get("ROMA LISBOA HOTEL Bed and Breakfast - EXPDTE")).toMatchObject({
      data_inicio: "2026-06-19",
      data_fim: "2026-06-22",
      noites: 3,
    });
    expect(byHotel.get("B&B PORTO GAIA Bed and Breakfast - EXPDTE")).toMatchObject({
      data_inicio: "2026-06-24",
      data_fim: "2026-06-26",
      noites: 2,
    });
  });

  it("tambem reconhece o bloco de hoteis confirmados na colagem completa do circuito", () => {
    const result = parseSpecialToursCircuitPasteText(CONFIRMED_HOTELS_TEXT, "sato_tours");

    expect(result.provider).toBe("sato_tours");
    expect(result.hoteis).toHaveLength(5);
    expect(result.hoteis[0]).toMatchObject({
      hotel: "SANTOS PRAGA Bed and Breakfast - EXPDTE",
      data_inicio: "2026-06-17",
      data_fim: "2026-06-19",
    });
  });

  it("reconhece o mesmo formato no parser generico de colagem", () => {
    const result = parseVoucherImportText(CONFIRMED_HOTELS_TEXT, "special_tours");

    expect(result.hoteis).toHaveLength(5);
    expect(result.hoteis[0]).toMatchObject({
      hotel: "SANTOS PRAGA Bed and Breakfast - EXPDTE",
      data_inicio: "2026-06-17",
      data_fim: "2026-06-19",
    });
  });
});
