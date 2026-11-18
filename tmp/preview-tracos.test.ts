import { writeFileSync } from 'node:fs';
import { it, vi } from 'vitest';
import { buildQuotePreviewHtmlSync } from '../src/lib/quote/exportQuotePdfClient';

vi.mock('$lib/services/api', () => ({ apiFetch: vi.fn() }));
vi.mock('$lib/security/url', () => ({ safeOpenNewTab: vi.fn() }));

it('gera preview para screenshot', () => {
  const html = buildQuotePreviewHtmlSync({
    quote: { id: 'quote-1' },
    items: [
      {
        item_type: 'passagem',
        title: 'Voo',
        raw: {
          aereo_import: {
            segmentos: [
              {
                aeroporto_saida: 'GRU',
                aeroporto_chegada: 'FCO',
                hora_saida: '10:50',
                hora_chegada: '12:00',
                data_voo: '2027-08-10',
                cidade_saida: 'São Paulo',
                cidade_chegada: 'Roma',
                numero_voo: 'LA 8120',
                cia_aerea: 'LATAM'
              }
            ]
          }
        }
      },
      {
        item_type: 'aluguel_carro',
        title: 'SUV - Automático',
        city_name: 'Los Angeles',
        start_date: '2027-01-17',
        end_date: '2027-01-20',
        quantity: 1,
        total_amount: 700,
        raw: {
          detalhes_orcamento: {
            cambio: 'Automático',
            locadora: 'Avis',
            cidade_devolucao: 'Los Angeles',
            hora_retirada: '14:00',
            hora_devolucao: '20:00',
            loja_retirada: 'Aeroporto LAX',
            loja_devolucao: 'Aeroporto LAS'
          }
        }
      },
      {
        item_type: 'hotel',
        title: 'Hotel Roma Centro',
        city_name: 'Roma, Itália',
        start_date: '2027-08-10',
        end_date: '2027-08-12',
        quantity: 1,
        raw: { detalhes_orcamento: { hora_checkin: '14:00', hora_checkout: '11:00' } }
      },
      {
        item_type: 'trem',
        title: 'Trem Roma - Florença',
        raw: {
          trem_import: {
            segmentos: [
              {
                aeroporto_saida: 'Roma Termini',
                aeroporto_chegada: 'Firenze SMN',
                hora_saida: '09:15',
                hora_chegada: '10:45',
                data_voo: '2027-08-11'
              }
            ]
          }
        }
      }
    ],
    settings: {},
    qrUrl: null,
    complementUrl: null,
    showBudgetItems: false,
    showBudgetDetails: true,
    showItemValues: false
  });
  writeFileSync('tmp/preview-tracos.html', html);
});
