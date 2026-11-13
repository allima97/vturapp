import { describe, expect, it } from 'vitest';

import { buildVoucherPreviewDocument } from './preview';
import type { VoucherProvider, VoucherRecord, VoucherAssetRecord } from './types';

function voucher(provider: VoucherProvider): VoucherRecord {
  return {
    id: 'voucher-1',
    company_id: 'company-1',
    provider,
    nome: 'Circuito Teste',
    status: 'rascunho',
    codigo_fornecedor: 'ABC123',
    reserva_online: 'REF123',
    passageiros: 'Cliente Teste',
    tipo_acomodacao: 'Duplo',
    operador: '',
    resumo: '',
    data_inicio: '2026-06-10',
    data_fim: '2026-06-20',
    ativo: true,
    extra_data: {
      traslado_chegada: {
        detalhes: 'Chegada no aeroporto as 10h',
        notas: 'Aguardar na porta 2',
        telefone_transferista: '+55 11 99999-9999'
      },
      traslado_saida: {
        detalhes: 'Saida do hotel as 06h',
        notas: 'Confirmar malas na recepcao',
        telefone_transferista: '+55 11 98888-8888'
      }
    },
    voucher_dias: [],
    voucher_hoteis: []
  };
}

describe('buildVoucherPreviewDocument', () => {
  it.each(['special_tours', 'europamundo', 'sato_tours'] as const)(
    'mantém cada dia do itinerário em um único card para %s',
    (provider) => {
      const item = voucher(provider);
      const longDescription = `${'Visita guiada pela cidade. '.repeat(80)}\nÚltima atividade.`;
      item.voucher_dias = [
        { dia_numero: 1, titulo: 'Chegada', descricao: longDescription, ordem: 0 },
        { dia_numero: 2, titulo: 'Passeio', descricao: 'Próximo dia.', ordem: 1 }
      ];
      const html = buildVoucherPreviewDocument(item);
      const cards = [...html.matchAll(/<article class="program-card">([\s\S]*?)<\/article>/g)].map(
        (match) => match[1]
      );
      expect(cards).toHaveLength(2);
      expect(cards[0]).toContain('Dia 1: Chegada');
      expect(cards[0]).toContain(longDescription.replace('\n', '<br/>'));
      expect(cards[0]).not.toContain('(continuação)');
      expect(cards[1]).toContain('Dia 2: Passeio');
    }
  );
  it.each(['special_tours', 'europamundo', 'sato_tours'] as const)(
    'usa um cabeçalho repetível e pagina os dias de %s conforme o espaço',
    (provider) => {
      const item = voucher(provider);
      item.voucher_dias = Array.from({ length: 7 }, (_, index) => ({
        dia_numero: index + 1,
        titulo: `Dia ${index + 1}`,
        descricao: 'Passeio pelo centro.',
        ordem: index
      }));
      const html = buildVoucherPreviewDocument(item);
      const section = html.slice(html.indexOf('<table class="program-print-table"'));
      expect(section.match(/<thead>/g)).toHaveLength(1);
      expect(section.match(/class="program-print-row"/g)).toHaveLength(7);
      expect(html).toContain('display: table-header-group');
    }
  );
  it('permite continuar um dia muito extenso sem criar outro card', () => {
    const item = voucher('special_tours');
    item.voucher_dias = [
      { dia_numero: 1, titulo: 'Viagem', descricao: 'Visita guiada. '.repeat(400), ordem: 0 }
    ];
    const html = buildVoucherPreviewDocument(item);
    expect(html.match(/<article class="program-card program-card--long">/g)).toHaveLength(1);
    expect(html).toContain('.program-card--long');
  });
  it.each(['special_tours', 'europamundo', 'sato_tours'] as const)(
    'exibe a cidade correspondente a cada hotel de %s',
    (provider) => {
      const item = voucher(provider);
      item.voucher_hoteis = [
        { cidade: 'Lisboa', hotel: 'Hotel Lisboa', ordem: 0 },
        { cidade: 'Porto & Gaia', hotel: 'Hotel Porto', ordem: 1 },
        { cidade: '', hotel: 'Hotel sem cidade', ordem: 2 }
      ];
      const html = buildVoucherPreviewDocument(item);
      const hotelCards = [
        ...html.matchAll(/<article class="sheet-card voucher-hotel-card">([\s\S]*?)<\/article>/g)
      ].map((match) => match[1]);
      expect(hotelCards).toHaveLength(3);
      expect(hotelCards[0]).toMatch(
        /<div class="voucher-hotel-city"><svg\b[\s\S]*?<\/svg>Lisboa<\/div>/
      );
      expect(hotelCards[0]).toContain('aria-hidden="true"');
      expect(hotelCards[0]).toContain('Hotel Lisboa');
      expect(hotelCards[1]).toMatch(
        /<div class="voucher-hotel-city"><svg\b[\s\S]*?<\/svg>Porto &amp; Gaia<\/div>/
      );
      expect(hotelCards[1]).toContain('Hotel Porto');
      expect(hotelCards[2]).not.toContain('voucher-hotel-city');
      expect(hotelCards[2]).not.toContain('<svg');
    }
  );
  it.each(['special_tours', 'europamundo', 'sato_tours'] as const)(
    'mantém os contatos de emergência nos dados da viagem de %s',
    (provider) => {
      const item = voucher(provider);
      item.passageiros = Array.from({ length: 20 }, (_, i) => `Passageiro ${i + 1}`).join('\n');
      item.extra_data = {
        emergencia: {
          escritorio: 'contato@example.com',
          emergencia_24h: '+34 123 456 789',
          whatsapp: '+34 987 654 321'
        },
        passageiros_detalhes: Array.from({ length: 20 }, (_, ordem) => ({
          nome: `Passageiro ${ordem + 1}`,
          ordem
        }))
      };
      const html = buildVoucherPreviewDocument(item);
      const firstSheet = html.slice(html.indexOf('<main class="document">')).split('</section>')[0];
      expect(firstSheet).toContain('DADOS DE SUA VIAGEM');
      expect(firstSheet).toContain('TELEFONE DE EMERGÊNCIA');
      expect(firstSheet).toContain('+34 123 456 789');
      expect(firstSheet).toContain('contato@example.com');
      expect(firstSheet).toContain('+34 987 654 321');
      expect(firstSheet.indexOf('Passageiro 1')).toBeGreaterThan(-1);
      expect(firstSheet.indexOf('Passageiro 1')).toBeLessThan(
        firstSheet.indexOf('TELEFONE DE EMERGÊNCIA')
      );
      expect(html.match(/TELEFONE DE EMERGÊNCIA/g)).toHaveLength(1);
      expect(html).toContain('Passageiro 20');
      expect(html.toLowerCase()).toContain('passageiros (continuação)');
    }
  );
  it('não adiciona contatos de emergência vazios para Europamundo', () => {
    const html = buildVoucherPreviewDocument(voucher('europamundo'));
    expect(html).not.toContain('TELEFONE DE EMERGÊNCIA');
  });
  it('reserva espaço para a emergência quando há passageiros com nomes longos', () => {
    const item = voucher('europamundo');
    item.extra_data = {
      emergencia: { emergencia_24h: '+34 123 456 789' },
      passageiros_detalhes: Array.from({ length: 4 }, (_, ordem) => ({
        nome: `Passageiro ${ordem + 1} Nome Sobrenome Silva Oliveira`,
        ordem
      }))
    };
    const html = buildVoucherPreviewDocument(item);
    const firstSheet = html.slice(html.indexOf('<main class="document">')).split('</section>')[0];
    expect(firstSheet).toContain('Passageiro 1');
    expect(firstSheet).not.toContain('Passageiro 4');
    expect(html).toContain('Passageiro 4');
    expect(firstSheet.indexOf('Passageiro 1')).toBeLessThan(
      firstSheet.indexOf('TELEFONE DE EMERGÊNCIA')
    );
  });
  it.each(['special_tours', 'europamundo', 'sato_tours'] as const)(
    'inclui traslado de chegada e saída na primeira folha de %s',
    (provider) => {
      const item = voucher(provider);
      item.extra_data = {
        ...item.extra_data,
        emergencia: { emergencia_24h: '+34 123 456 789' },
        passageiros_detalhes: [{ nome: 'Cliente Teste', ordem: 0 }]
      };
      const html = buildVoucherPreviewDocument(item);
      const firstSheet = html.slice(html.indexOf('<main class="document">')).split('</section>')[0];
      for (const value of [
        'DADOS DE SUA VIAGEM',
        'TELEFONE DE EMERGÊNCIA',
        'TRASLADOS',
        'TRANSFER IN',
        'TRANSFER OUT',
        'Chegada no aeroporto as 10h',
        'Saida do hotel as 06h',
        '+55 11 99999-9999',
        '+55 11 98888-8888',
        'Confirmar malas na recepcao'
      ]) {
        expect(firstSheet).toContain(value);
      }
      expect(firstSheet.indexOf('TRASLADOS')).toBeLessThan(
        firstSheet.indexOf('TELEFONE DE EMERGÊNCIA')
      );
      expect(html.match(/TRANSFER IN/g)).toHaveLength(1);
      expect(html.match(/TRANSFER OUT/g)).toHaveLength(1);
    }
  );
  it('mantém a continuação de detalhes longos de traslado sem perder conteúdo', () => {
    const item = voucher('europamundo');
    item.extra_data = {
      traslado_chegada: {
        detalhes: `${'Texto do traslado. '.repeat(30)}FIM DOS DETALHES`,
        notas: `${'Observação do traslado. '.repeat(20)}FIM DAS NOTAS`,
        telefone_transferista: '+55 11 99999-9999'
      }
    };
    const html = buildVoucherPreviewDocument(item);
    const firstSheet = html.slice(html.indexOf('<main class="document">')).split('</section>')[0];
    expect(firstSheet).toContain('TRANSFER IN');
    expect(firstSheet).toContain('+55 11 99999-9999');
    expect(html).toContain('TRANSFER IN (continuação)');
    expect(html).toContain('FIM DOS DETALHES');
    expect(html).toContain('FIM DAS NOTAS');
  });
  it.each(['special_tours', 'europamundo', 'sato_tours'] as const)(
    'mantém detalhes e notas moderados de traslado na primeira folha de %s',
    (provider) => {
      const item = voucher(provider);
      item.extra_data = {
        traslado_chegada: {
          detalhes: `${'Detalhes da chegada. '.repeat(12)}FIMCHEGADA`,
          notas: `${'Nota do traslado. '.repeat(8)}FIMNOTAS`
        },
        emergencia: { emergencia_24h: '+34 123 456 789' }
      };
      const html = buildVoucherPreviewDocument(item);
      const firstSheet = html.slice(html.indexOf('<main class="document">')).split('</section>')[0];
      expect(firstSheet).toContain('FIMCHEGADA');
      expect(firstSheet).toContain('FIMNOTAS');
      expect(firstSheet).toContain('TELEFONE DE EMERGÊNCIA');
      expect(html).not.toContain('TRANSFER IN (continuação)');
    }
  );
  it('distribui muitas linhas curtas de traslado sem perder informações', () => {
    const item = voucher('europamundo');
    const lines = Array.from({ length: 60 }, (_, index) => `Linha ${index + 1}`);
    item.extra_data = {
      traslado_chegada: { detalhes: lines.join('\n') },
      emergencia: { emergencia_24h: '+34 123 456 789' }
    };
    const html = buildVoucherPreviewDocument(item);
    const firstSheet = html.slice(html.indexOf('<main class="document">')).split('</section>')[0];
    expect(firstSheet).toContain('Linha 1');
    expect(firstSheet).not.toContain('Linha 60');
    expect(firstSheet).toContain('TELEFONE DE EMERGÊNCIA');
    for (const line of lines) expect(html).toContain(`>${line}</div>`);
  });
  it.each(['special_tours', 'europamundo', 'sato_tours'] as const)(
    'usa logo da operadora e respeita a escolha pessoal em todas as páginas de %s',
    (provider) => {
      const assets = [
        {
          provider: 'empresa',
          asset_kind: 'logo',
          preview_url: 'https://example.com/company.png',
          ativo: true
        },
        {
          provider,
          asset_kind: 'logo',
          preview_url: 'https://example.com/provider.png',
          ativo: true
        }
      ] as VoucherAssetRecord[];
      const html = buildVoucherPreviewDocument(voucher(provider), assets);
      expect(html).toContain('alt="VTur"');
      expect(html).toContain('https://example.com/provider.png');
      expect(html).not.toContain('https://example.com/company.png');
      const companyHtml = buildVoucherPreviewDocument(voucher(provider), assets, 'empresa');
      expect(companyHtml).toContain('https://example.com/company.png');
      const repeatedHtml = buildVoucherPreviewDocument(voucher(provider), assets, 'operadora');
      const headers = repeatedHtml.match(
        /<div class="voucher-header(?: voucher-header--europamundo)?">[\s\S]*?<div class="voucher-header-logo voucher-header-logo-right[^"]*">[\s\S]*?<\/div>\s*<\/div>/g
      );
      expect(headers?.length).toBeGreaterThan(0);
      for (const header of headers || []) {
        expect(header.match(/https:\/\/example.com\/provider\.png/g)).toHaveLength(2);
      }
      expect(headers?.length).toBe(
        (repeatedHtml.match(/<div class="voucher-header(?: voucher-header--europamundo)?">/g) || [])
          .length
      );
    }
  );
  it('não usa logos inativos e informa quando o logo escolhido não foi cadastrado', () => {
    const assets = [
      {
        provider: 'special_tours',
        asset_kind: 'logo',
        preview_url: 'https://example.com/inativo.png',
        ativo: false
      }
    ] as VoucherAssetRecord[];
    const html = buildVoucherPreviewDocument(voucher('special_tours'), assets, 'operadora');
    expect(html).not.toContain('https://example.com/inativo.png');
    expect(html).toContain('Logo Special Tours não cadastrado');
  });
  it.each(['special_tours', 'europamundo', 'sato_tours'] as const)(
    'inclui a identidade VTur sem configurar assets para %s',
    (provider) => {
      const html = buildVoucherPreviewDocument(voucher(provider));
      expect(html).toContain('alt="VTur"');
      expect(html).toContain('data:image/png;base64,');
    }
  );
  it('inclui traslados no PDF de Special Tours', () => {
    const html = buildVoucherPreviewDocument(voucher('special_tours'));

    expect(html).toContain('TRASLADOS');
    expect(html).toContain('TRANSFER IN');
    expect(html).toContain('Chegada no aeroporto as 10h');
    expect(html).toContain('Telefone do transferista: +55 11 99999-9999');
    expect(html).toContain('Notas traslado');
    expect(html).toContain('Confirmar malas na recepcao');
  });

  it('inclui traslados no PDF de Sato Tours', () => {
    const html = buildVoucherPreviewDocument(voucher('sato_tours'));

    expect(html).toContain('Sato Tours');
    expect(html).toContain('TRASLADOS');
    expect(html).toContain('TRANSFER OUT');
    expect(html).toContain('Saida do hotel as 06h');
  });

  it.each(['special_tours', 'sato_tours'] as const)(
    'nao inclui a pagina de traslados quando %s nao tem dados de traslado',
    (provider) => {
      const item = voucher(provider);
      item.extra_data = {
        traslado_chegada: {
          detalhes: '',
          notas: '',
          telefone_transferista: ''
        },
        traslado_saida: {
          detalhes: '',
          notas: '',
          telefone_transferista: ''
        }
      };

      const html = buildVoucherPreviewDocument(item);

      expect(html).not.toContain('TRASLADOS');
      expect(html).not.toContain('TRANSFER IN');
      expect(html).not.toContain('TRANSFER OUT');
    }
  );

  it('inclui traslados quando apenas notas ou telefone foram preenchidos', () => {
    const item = voucher('special_tours');
    item.extra_data = {
      traslado_chegada: {
        detalhes: '',
        notas: 'Motorista aguardara com placa',
        telefone_transferista: ''
      },
      traslado_saida: {
        detalhes: '',
        notas: '',
        telefone_transferista: '+55 11 97777-7777'
      }
    };

    const html = buildVoucherPreviewDocument(item);

    expect(html).toContain('TRASLADOS');
    expect(html).toContain('Motorista aguardara com placa');
    expect(html).toContain('Telefone do transferista: +55 11 97777-7777');
  });
});
