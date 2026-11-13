import { describe, expect, it } from 'vitest';
import {
  atribuirIdsGruposOpcionais,
  buildOpcionaisHtml,
  parseRoteiroOpcionais,
  removerPasseiosIncorporados
} from './roteiroOpcionais';

const exemplo = [
  {
    cidade: 'Barcelona',
    passeios: [
      { nome: 'Bairro Gótico', descricao: 'Passeio e jantar\nPraça Reial' },
      { nome: 'Flamenco', descricao: 'Espetáculo tradicional' }
    ]
  },
  { cidade: 'Paris', passeios: [{ nome: 'Rio Sena', descricao: 'Cruzeiro noturno' }] }
];
describe('opcionais do roteiro', () => {
  it('remove dos opcionais passeios incorporados na mesma cidade, sem afetar outros', () => {
    const resultado = removerPasseiosIncorporados(exemplo, [
      { cidade: ' Barcelona ', passeio: ' bairro   GÓTICO ' },
      { cidade: 'Lisboa', passeio: 'Rio Sena' }
    ]);

    expect(resultado).toEqual([
      {
        cidade: 'Barcelona',
        passeios: [{ nome: 'Flamenco', descricao: 'Espetáculo tradicional' }]
      },
      { cidade: 'Paris', passeios: [{ nome: 'Rio Sena', descricao: 'Cruzeiro noturno' }] }
    ]);
  });
  it('retorna a lista original quando nenhum opcional já está incorporado', () => {
    expect(removerPasseiosIncorporados(exemplo, [{ cidade: 'Roma', passeio: 'Flamenco' }])).toBe(
      exemplo
    );
  });
  it('preserva cidades, passeios, descrições e ordem ao salvar e recarregar', () => {
    expect(parseRoteiroOpcionais(JSON.parse(JSON.stringify(exemplo)))).toEqual(exemplo);
    expect(parseRoteiroOpcionais([])).toEqual([]);
  });
  it('conserva identidades e associa a mesma cidade independente do idioma', () => {
    const opcoes = [
      {
        cidade: 'Roma, Lácio, Itália',
        cidade_id: 'geonames:3169070',
        passeios: [{ nome: 'Coliseu', descricao: 'Visita' }]
      }
    ];
    expect(parseRoteiroOpcionais(JSON.parse(JSON.stringify(opcoes)))).toEqual(opcoes);
    expect(
      removerPasseiosIncorporados(opcoes, [
        { cidade: 'Rome, Lazio, Italy', cidade_id: 'geonames:3169070', passeio: 'Coliseu' }
      ])
    ).toEqual([]);
    expect(
      removerPasseiosIncorporados(opcoes, [
        { cidade: 'Roma, Lácio, Itália', cidade_id: 'geonames:123', passeio: 'Coliseu' }
      ])
    ).toEqual(opcoes);
    expect(
      removerPasseiosIncorporados(opcoes, [{ cidade: 'Roma, Lácio, Itália', passeio: 'Coliseu' }])
    ).toEqual(opcoes);
    expect(() => parseRoteiroOpcionais([{ ...opcoes[0], cidade_id: 'geonames:01' }])).toThrow(
      'Identificação'
    );
  });
  it('preserva identificadores de grupos sem atribuí-los a registros legados', () => {
    const registroId = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
    const grupos = [
      { cidade: 'Roma', registro_id: registroId.toUpperCase(), passeios: [] },
      { cidade: 'Paris', passeios: [] }
    ];
    expect(parseRoteiroOpcionais(grupos)).toEqual([
      { cidade: 'Roma', registro_id: registroId, passeios: [] },
      { cidade: 'Paris', passeios: [] }
    ]);
    const grupo = {
      cidade: 'Roma',
      registro_id: registroId,
      passeios: [
        { nome: 'Coliseu', descricao: '' },
        { nome: 'Museu', descricao: '' }
      ]
    };
    const filtrados = removerPasseiosIncorporados(
      [grupo],
      [{ cidade: 'Roma', passeio: 'Coliseu' }]
    );
    expect(parseRoteiroOpcionais(filtrados)).toEqual([
      { ...grupo, passeios: [{ nome: 'Museu', descricao: '' }] }
    ]);
  });
  it('atribui IDs uma única vez, preservando a associação após reordenação e novas inclusões', () => {
    const grupos = atribuirIdsGruposOpcionais([
      { cidade: 'Roma', passeios: [] },
      { cidade: 'Paris', passeios: [] }
    ]);
    expect(grupos[0].registro_id).toMatch(
      /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/
    );
    expect(grupos[0].registro_id).not.toBe(grupos[1].registro_id);
    const reordenados = atribuirIdsGruposOpcionais([
      grupos[1],
      { cidade: 'Lisboa', passeios: [] },
      grupos[0]
    ]);
    expect(reordenados[0].registro_id).toBe(grupos[1].registro_id);
    expect(reordenados[2].registro_id).toBe(grupos[0].registro_id);
    expect(new Set(reordenados.map((grupo) => grupo.registro_id)).size).toBe(3);
    expect(atribuirIdsGruposOpcionais(reordenados)).toEqual(reordenados);
  });
  it('rejeita identificadores de grupo inválidos ou repetidos, inclusive em caixa diferente', () => {
    const id = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
    for (const registro_id of [null, '', 'not-a-uuid', 'aaaaaaaa-aaaa-1aaa-8aaa-aaaaaaaaaaaa']) {
      expect(() => parseRoteiroOpcionais([{ cidade: 'Roma', registro_id, passeios: [] }])).toThrow(
        'Identificação do grupo'
      );
    }
    expect(() =>
      parseRoteiroOpcionais([
        { cidade: 'Roma', registro_id: id, passeios: [] },
        { cidade: 'Paris', registro_id: id.toUpperCase(), passeios: [] }
      ])
    ).toThrow('duplicada');
  });
  it('rejeita conteúdo inválido em vez de apagar silenciosamente os opcionais', () => {
    for (const value of [
      null,
      {},
      [{ cidade: '', passeios: [] }],
      [{ cidade: 'Roma', passeios: [{ nome: '', descricao: 'Texto' }] }]
    ]) {
      expect(() => parseRoteiroOpcionais(value)).toThrow();
    }
  });
  it('gera PDF agrupado por cidade sem campos de data e escapa conteúdo', () => {
    const escape = (s: string) => s.replace(/</g, '&lt;').replace(/>/g, '&gt;');
    const html = buildOpcionaisHtml(exemplo, escape);
    expect(html.match(/<article class="card roteiro-card">/g)).toHaveLength(2);
    const [barcelona, paris] = html.split('</article>');
    expect(barcelona).toMatch(/<thead>[\s\S]*Barcelona[\s\S]*<\/thead>/);
    expect(barcelona).toContain('Bairro Gótico');
    expect(barcelona).toContain('Flamenco');
    expect(paris).toContain('Rio Sena');
    expect(html.indexOf('Barcelona')).toBeLessThan(html.indexOf('Paris'));
    expect(html).toContain('Passeio e jantar<br>Praça Reial');
    expect(html).not.toContain('Data');
    expect(
      buildOpcionaisHtml(
        [{ cidade: '<script>', passeios: [{ nome: '<img>', descricao: '<iframe>' }] }],
        escape
      )
    ).not.toContain('<script>');
    expect(buildOpcionaisHtml([], escape)).toBe('');
    expect(buildOpcionaisHtml([{ cidade: 'Roma', passeios: [] }], escape)).toBe('');
  });
  it('agrupa registros da mesma cidade sem juntar homônimos nem alterar os dados originais', () => {
    const grupos = [
      {
        cidade: 'Paris, França',
        cidade_id: 'geonames:1',
        passeios: [{ nome: 'A', descricao: '' }]
      },
      { cidade: 'Paris, Texas', cidade_id: 'geonames:2', passeios: [{ nome: 'B', descricao: '' }] },
      { cidade: 'Paris, França', cidade_id: 'geonames:1', passeios: [{ nome: 'C', descricao: '' }] }
    ];
    const html = buildOpcionaisHtml(
      grupos,
      (s) => s,
      (cidade) => cidade.split(',')[0]
    );
    const cards = html.split('</article>');
    expect(cards).toHaveLength(3);
    expect(cards[0]).toContain('<h3>A</h3>');
    expect(cards[0]).toContain('<h3>C</h3>');
    expect(cards[1]).toContain('<h3>B</h3>');
    expect(grupos[0].passeios).toHaveLength(1);
  });
});
