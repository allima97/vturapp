import { describe, expect, it } from 'vitest';
import { hotelIconShape, planeIconShape, quoteCheckIcon, serviceIconSvg } from './pdfIcons';
import { roteiroCheckChips, roteiroPdfThemeCss } from './roteiroPdfTheme';
import { renderPreviewHotels } from '../../routes/(app)/orcamentos/roteiros/[id]/_components/preview-cards';
import { newHotel } from '../../routes/(app)/orcamentos/roteiros/[id]/_components/tipos';

describe('ícones compartilhados do PDF', () => {
  it('mantém o desenho do orçamento para hotel, avião e confirmação', () => {
    const hotel = serviceIconSvg('hotel');
    expect(hotel).toContain('orc-service-icon--hotel');
    expect(hotel).toContain(hotelIconShape);
    expect(hotel).not.toContain('roteiro-print-title-icon');
    const flight = serviceIconSvg('passagem-section', 'roteiro-print-title-icon');
    expect(flight).toContain('orc-service-icon--flight');
    expect(flight).toContain('roteiro-print-title-icon');
    expect(flight).toContain(planeIconShape);
    expect(quoteCheckIcon).toContain('M20 6 9 17l-5-5');
  });
});

describe('tema do PDF de roteiro', () => {
  it('repete a faixa, a borda e a margem do orçamento', () => {
    expect(roteiroPdfThemeCss).toContain('background: #D0DAEA');
    expect(roteiroPdfThemeCss).toContain('border: 1.5px solid #C5CED9');
    expect(roteiroPdfThemeCss).toContain('color: #6B7280');
    expect(roteiroPdfThemeCss).toContain('font-size: 8pt');
    expect(roteiroPdfThemeCss).toContain('@page { size: A4; margin: 13mm; }');
    expect(roteiroPdfThemeCss).toContain('display: table-header-group');
    expect(roteiroPdfThemeCss).toContain('print-color-adjust: exact');
    expect(roteiroPdfThemeCss).not.toContain('.roteiro-print-section { overflow: hidden');
    expect(roteiroPdfThemeCss).toContain('font-family: Arial, Helvetica, sans-serif');
  });

  it('mostra o hotel com o ícone e o rótulo do orçamento, sem mudar os campos', () => {
    const html = renderPreviewHotels(
      [
        {
          ...newHotel(0),
          cidade: 'Roma, Itália',
          hotel: 'Hotel Roma',
          noites: 6,
          regime: 'Café',
          data_inicio: '2027-08-11',
          data_fim: '2027-08-13'
        }
      ],
      (value) => value || ''
    );
    expect(html).toContain(hotelIconShape);
    expect(html).toContain('class="lb">HOTEL · 6 NOITES');
    expect(html).toContain('<b>Hotel Roma</b>');
    expect(html).toContain('class="rtf rota"');
    expect(html).toContain('Café');
    expect(roteiroCheckChips(['Traslado'], (value) => value)).toContain(quoteCheckIcon);
  });
});
