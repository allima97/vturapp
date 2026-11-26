import { describe, expect, it } from 'vitest';
import { ErroClaude, chamarFerramentaClaude, configPensamento } from './claude';
import { chamarGroq, esquemaEstrito } from './groq';
import {
  MODELOS_IA,
  carregarConfigIA,
  custoEstimadoUSD,
  gerarComIA,
  limparMemoriaConfigIA,
  modeloIA
} from './provedores';
import { FERRAMENTA_ROTEIRO, type SaidaNormalizada } from './esquema';
import { normalizarSaidaIA, posProcessarRoteiroIA, validarPedidoRoteiroIA } from './posProcessar';
import { PROMPT_SISTEMA_ROTEIRO, montarMensagemPedido } from './prompt';
import { chaveCacheRoteiro, classePerfil, extrairBlocosDias } from './reaproveitamento';
import type { PedidoRoteiroIA } from '$lib/roteiroIA/tipos';

const pedido: PedidoRoteiroIA = {
  origem: 'São Paulo',
  destinos: ['Roma', 'Barcelona'],
  data_inicio: '2027-08-10',
  data_fim: '2027-08-13',
  adultos: 2,
  criancas: 0,
  perfil: 'casal',
  observacoes: ''
};

const resolver = async (nome: string) =>
  nome === 'Atlantis'
    ? null
    : { cidade: nome, cidade_id: `geonames:${nome.length}`, geografica: true };

describe('validarPedidoRoteiroIA', () => {
  it('aceita um pedido completo', () => {
    expect(validarPedidoRoteiroIA({ ...pedido })).toEqual(pedido);
  });
  it('recusa datas invertidas e período longo demais', () => {
    expect(validarPedidoRoteiroIA({ ...pedido, data_fim: '2027-08-01' })).toMatch(/data de fim/);
    expect(validarPedidoRoteiroIA({ ...pedido, data_fim: '2027-12-31' })).toMatch(/no máximo/);
  });
  it('exige origem e destino', () => {
    expect(validarPedidoRoteiroIA({ ...pedido, origem: '' })).toMatch(/origem/);
    expect(validarPedidoRoteiroIA({ ...pedido, destinos: [] })).toMatch(/destino/);
  });
});

describe('normalizarSaidaIA', () => {
  const referencias = [
    { ref: 'a1', cidade: 'Roma', nome: 'Coliseu noturno', descricao: 'Visita guiada à noite.' },
    { ref: 'b1', cidade: 'Barcelona', nome: 'Tour Gaudí', descricao: 'Obras de Gaudí.' }
  ];

  it('expande referências, ignora códigos desconhecidos e marca opcionais novos', () => {
    const { saida, usadasBiblioteca } = normalizarSaidaIA(
      {
        dias: [
          { dia: 2, cidade: 'Roma', percurso: '', descricao: 'Café da manhã.' },
          { dia: 1, cidade: 'Roma', percurso: 'São Paulo → Roma', descricao: 'Embarque.' },
          { dia: 1, cidade: 'Roma', percurso: '', descricao: 'Duplicado.' },
          { dia: 9, cidade: 'Roma', percurso: '', descricao: 'Fora do período.' }
        ],
        opcionais_ref: [{ ref: 'a1', dia: 2 }, { ref: 'A1' }, { ref: 'b1' }, { ref: 'z9' }],
        opcionais_novos: [
          { cidade: 'Roma', passeios: [{ nome: 'Vaticano', descricao: 'Museus.' }] }
        ],
        inclui: ['Hospedagem'],
        nao_inclui: []
      },
      referencias,
      4
    );
    expect(saida.dias.map((d) => d.dia)).toEqual([1, 2]);
    expect(saida.opcionais).toEqual([
      {
        cidade: 'Roma',
        passeios: [
          { nome: 'Coliseu noturno', descricao: 'Visita guiada à noite.', dia: 2 },
          { nome: 'Vaticano', descricao: 'Museus.', novo: true }
        ]
      },
      { cidade: 'Barcelona', passeios: [{ nome: 'Tour Gaudí', descricao: 'Obras de Gaudí.' }] }
    ]);
    expect(usadasBiblioteca.map((r) => r.ref)).toEqual(['b1']);
  });
});

describe('posProcessarRoteiroIA', () => {
  const saida = (
    dias: SaidaNormalizada['dias'],
    opcionais: SaidaNormalizada['opcionais'] = []
  ) => ({
    dias,
    opcionais,
    inclui: ['Hospedagem'],
    nao_inclui: ['Seguro viagem']
  });

  it('aplica as datas do pedido aos dias 1..N e avisa o que faltou', async () => {
    const r = await posProcessarRoteiroIA(
      saida([
        { dia: 3, cidade: 'Barcelona', percurso: 'Roma - Barcelona', descricao: 'Trem.' },
        { dia: 1, cidade: 'Roma', percurso: 'São Paulo → Roma', descricao: 'Embarque.' }
      ]),
      pedido,
      resolver,
      'claude-sonnet-5-5'
    );
    expect(r.dias.map((d) => d.data)).toEqual(['2027-08-10', '2027-08-12']);
    expect(r.dias[1].percurso).toBe('Roma → Barcelona');
    expect(r.dias[0].cidade_id).toBe('geonames:4');
    expect(r.avisos.join(' ')).toMatch(/2 dia\(s\)/);
    expect(r.inclui_texto).toBe('Hospedagem');
    expect(r.nome).toBe('Viagem Roma, Barcelona - Agosto 2027');
  });

  it('o mesmo resultado guardado serve para outras datas', async () => {
    const guardado = saida(
      [{ dia: 1, cidade: 'Roma', percurso: '', descricao: 'Embarque.' }],
      [{ cidade: 'Roma', passeios: [{ nome: 'Coliseu', descricao: 'Visita.', dia: 1 }] }]
    );
    const outra = { ...pedido, data_inicio: '2028-03-01', data_fim: '2028-03-04' };
    const r = await posProcessarRoteiroIA(guardado, outra, resolver, 'm');
    expect(r.dias[0].data).toBe('2028-03-01');
    expect(r.opcionais[0].passeios[0]).toEqual({
      nome: 'Coliseu',
      descricao: 'Visita.',
      data: '2028-03-01'
    });
    expect(r.nome).toMatch(/Março 2028/);
  });

  it('remove valores e números de voo e marca cidade não encontrada', async () => {
    const r = await posProcessarRoteiroIA(
      saida(
        [
          {
            dia: 1,
            cidade: 'Atlantis',
            percurso: '',
            descricao: 'Embarque no voo LA 8120 por R$ 3.500,00 por pessoa.'
          }
        ],
        [
          {
            cidade: 'Atlantis',
            passeios: [{ nome: 'Tour US$ 80', descricao: 'Passeio.', dia: 30 }]
          }
        ]
      ),
      pedido,
      resolver,
      'claude-sonnet-5-5'
    );
    expect(r.dias[0].descricao).not.toMatch(/R\$|8120/);
    expect(r.dias[0].cidade_pendente).toBe(true);
    expect(r.dias[0].cidade_id).toBeNull();
    expect(r.opcionais[0].passeios[0].nome).toBe('Tour');
    expect(r.opcionais[0].passeios[0]).not.toHaveProperty('data');
    expect(r.avisos.join(' ')).toMatch(/Atlantis/);
    expect(r.avisos.join(' ')).toMatch(/removidos/);
  });

  it('falha quando nenhum dia é válido', async () => {
    await expect(posProcessarRoteiroIA(saida([]), pedido, resolver, 'm')).rejects.toThrow(
      /nenhum dia/
    );
  });
});

describe('mensagem e chave de cache', () => {
  const referencias = [
    {
      ref: 'a1',
      cidade: 'Roma',
      nome: 'Coliseu noturno',
      descricao: 'Descrição longa que fica no servidor.'
    }
  ];
  const destinos = [
    { nome: 'Roma', id: 'geonames:1' },
    { nome: 'Barcelona', id: 'geonames:2' }
  ];

  it('a mensagem não leva datas nem descrições do catálogo', () => {
    const m = montarMensagemPedido(pedido, referencias);
    expect(m).toContain('Duração: 4 dias');
    expect(m).toContain('a1 Coliseu noturno');
    expect(m).not.toContain('2027');
    expect(m).not.toContain('Descrição longa');
  });

  it('mesma chave em outras datas; muda com duração, perfil ou catálogo', async () => {
    const chave = (p: PedidoRoteiroIA, refs = referencias) =>
      chaveCacheRoteiro({ pedido: p, destinos, referencias: refs, modelo: 'claude-sonnet-5-5' });
    const base = await chave(pedido);
    expect(await chave({ ...pedido, data_inicio: '2028-01-05', data_fim: '2028-01-08' })).toBe(
      base
    );
    expect(await chave({ ...pedido, perfil: '  Casal. ' })).toBe(base);
    expect(await chave({ ...pedido, data_fim: '2027-08-14' })).not.toBe(base);
    expect(await chave({ ...pedido, perfil: 'família' })).not.toBe(base);
    expect(await chave(pedido, [{ ...referencias[0], nome: 'Outro' }])).not.toBe(base);
    // Biblioteca da IA (b*) não muda a chave.
    expect(
      await chave(pedido, [
        ...referencias,
        { ref: 'b1', cidade: 'Barcelona', nome: 'X', descricao: '' }
      ])
    ).toBe(base);
  });

  it('o prompt de sistema não depende do pedido', () => {
    expect(PROMPT_SISTEMA_ROTEIRO).not.toMatch(/\$\{|\d{4}-\d{2}-\d{2}/);
  });
});

describe('custoEstimadoUSD', () => {
  it('soma entrada, gravação e leitura de cache e saída', () => {
    expect(
      custoEstimadoUSD('claude-sonnet-5-5', {
        input_tokens: 1_000_000,
        cache_creation_input_tokens: 1_000_000,
        cache_read_input_tokens: 1_000_000,
        output_tokens: 1_000_000
      })
    ).toBe(2 + 2.5 + 0.1 + 10);
    expect(custoEstimadoUSD('modelo-desconhecido', {})).toBeNull();
  });
});

describe('chamarFerramentaClaude', () => {
  const chamar = (resposta: unknown, status = 200) =>
    chamarFerramentaClaude({
      apiKey: 'k',
      modelo: 'claude-opus-5-5',
      sistema: 's',
      mensagem: 'm',
      ferramenta: FERRAMENTA_ROTEIRO,
      fetcher: (async (_url: RequestInfo | URL, init?: RequestInit) => {
        const corpo = JSON.parse(String(init?.body));
        expect(corpo.model).toBe('claude-opus-5-5');
        expect(corpo.output_config.format.type).toBe('json_schema');
        expect(corpo).not.toHaveProperty('tool_choice');
        return new Response(JSON.stringify(resposta), { status });
      }) as typeof fetch
    });

  it('devolve a entrada da ferramenta e o modelo usado', async () => {
    const r = await chamar({
      model: 'claude-opus-5-5',
      content: [{ type: 'text', text: JSON.stringify({ nome: 'A' }) }],
      usage: { input_tokens: 10, output_tokens: 20 }
    });
    expect(r.entrada).toEqual({ nome: 'A' });
    expect(r.modelo).toBe('claude-opus-5-5');
  });

  it('traduz chave inválida e sobrecarga em mensagens para o consultor', async () => {
    await expect(chamar({ error: { message: 'x' } }, 401)).rejects.toThrow(/Chave da API/);
    const ocupado = await chamar({}, 529).catch((e) => e);
    expect(ocupado).toBeInstanceOf(ErroClaude);
    expect(ocupado.tentarDeNovo).toBe(true);
  });
});

describe('Groq', () => {
  it('converte o esquema para o modo strict (tudo obrigatório, opcionais anuláveis)', () => {
    const estrito = esquemaEstrito(FERRAMENTA_ROTEIRO.input_schema) as {
      properties: {
        opcionais_ref: { items: { required: string[]; properties: { dia: { type: unknown } } } };
      };
    };
    const item = estrito.properties.opcionais_ref.items;
    expect(item.required).toEqual(['ref', 'dia']);
    expect(item.properties.dia.type).toEqual(['integer', 'null']);
  });

  it('manda system fixo antes do pedido, raciocínio baixo e mapeia o uso com cache', async () => {
    const r = await chamarGroq({
      apiKey: 'g',
      modelo: 'openai/gpt-oss-120b',
      sistema: 'regras fixas',
      mensagem: 'pedido',
      esquema: { name: 'preencher_roteiro', schema: FERRAMENTA_ROTEIRO.input_schema },
      fetcher: (async (url: RequestInfo | URL, init?: RequestInit) => {
        expect(String(url)).toBe('https://api.groq.com/openai/v1/chat/completions');
        expect((init?.headers as Record<string, string>).authorization).toBe('Bearer g');
        const corpo = JSON.parse(String(init?.body));
        expect(corpo.messages.map((m: { role: string }) => m.role)).toEqual(['system', 'user']);
        expect(corpo.messages[0].content).toBe('regras fixas');
        expect(corpo.reasoning_effort).toBe('low');
        expect(corpo.response_format.json_schema.strict).toBe(true);
        return new Response(
          JSON.stringify({
            model: 'openai/gpt-oss-120b',
            choices: [{ finish_reason: 'stop', message: { content: '{"dias":[]}' } }],
            usage: {
              prompt_tokens: 1500,
              completion_tokens: 900,
              prompt_tokens_details: { cached_tokens: 1000 }
            }
          }),
          { status: 200 }
        );
      }) as typeof fetch
    });
    expect(r.entrada).toEqual({ dias: [] });
    expect(r.uso).toEqual({
      input_tokens: 500,
      cache_read_input_tokens: 1000,
      cache_creation_input_tokens: 0,
      output_tokens: 900
    });
  });

  it('limite do Groq (429) é recuperável; chave inválida não', async () => {
    const chamar = (status: number) =>
      chamarGroq({
        apiKey: 'g',
        modelo: 'openai/gpt-oss-20b',
        sistema: 's',
        mensagem: 'm',
        esquema: { name: 'x', schema: {} },
        fetcher: (async () => new Response('{}', { status })) as typeof fetch
      }).catch((e) => e);
    expect((await chamar(429)).tentarDeNovo).toBe(true);
    const chave = await chamar(401);
    expect(chave).toBeInstanceOf(ErroClaude);
    expect(chave.message).toMatch(/Groq/);
  });
});

describe('provedores', () => {
  it('direciona para o Groq ou para o Claude conforme o modelo', async () => {
    const urls: string[] = [];
    const fetcher = (async (url: RequestInfo | URL) => {
      urls.push(String(url));
      return new Response(
        JSON.stringify({
          content: [{ type: 'text', text: '{}' }],
          choices: [{ message: { content: '{}' } }]
        }),
        { status: 200 }
      );
    }) as typeof fetch;
    for (const id of ['openai/gpt-oss-120b', 'claude-haiku-5-5'])
      await gerarComIA({
        modelo: modeloIA(id)!,
        apiKey: 'k',
        sistema: 's',
        mensagem: 'm',
        ferramenta: FERRAMENTA_ROTEIRO,
        fetcher
      });
    expect(urls).toEqual([
      'https://api.groq.com/openai/v1/chat/completions',
      'https://api.anthropic.com/v1/messages'
    ]);
  });

  it('usa painel → variável → Haiku 5.5, nessa ordem', async () => {
    limparMemoriaConfigIA();
    expect((await carregarConfigIA(undefined, {}, false)).modelo.id).toBe('claude-haiku-5-5');
    expect(
      (await carregarConfigIA(undefined, { ROTEIRO_IA_MODELO: 'openai/gpt-oss-20b' }, false)).origem
    ).toBe('variavel');
    const db = {
      prepare: () => ({
        first: async () => ({ modelo: 'openai/gpt-oss-120b', updated_at: null, updated_by: null })
      })
    } as unknown as D1Database;
    const painel = await carregarConfigIA(db, { ROTEIRO_IA_MODELO: 'claude-sonnet-5-5' }, false);
    expect(painel.modelo.provedor).toBe('groq');
    expect(painel.origem).toBe('painel');
    limparMemoriaConfigIA();
  });

  it('todo modelo oferecido tem preço para o log de custo', () => {
    for (const m of MODELOS_IA)
      expect(custoEstimadoUSD(m.id, { output_tokens: 1_000_000 })).toBe(m.preco.saida);
  });
});

describe('pensamento do Claude', () => {
  it('desliga no Haiku e evita o pensamento antecipado no Sonnet', () => {
    expect(configPensamento('claude-haiku-5-5')).toEqual({ type: 'disabled' });
    expect(configPensamento('claude-sonnet-5-5')).toEqual({ type: 'between_tools' });
    expect(configPensamento('openai/gpt-oss-120b')).toBeNull();
  });

  it('a requisição do Haiku vai sem pensamento e a resposta cortada é marcada', async () => {
    const erroCortado = await chamarFerramentaClaude({
      apiKey: 'k',
      modelo: 'claude-haiku-5-5',
      sistema: 's',
      mensagem: 'm',
      ferramenta: FERRAMENTA_ROTEIRO,
      fetcher: (async (_u: RequestInfo | URL, init?: RequestInit) => {
        expect(JSON.parse(String(init?.body)).thinking).toEqual({ type: 'disabled' });
        return new Response(
          JSON.stringify({
            stop_reason: 'max_tokens',
            content: [{ type: 'text', text: '{"dias":[' }]
          }),
          { status: 200 }
        );
      }) as typeof fetch
    }).catch((e) => e);
    expect(erroCortado).toBeInstanceOf(ErroClaude);
    expect(erroCortado.cortado).toBe(true);
  });
});

describe('biblioteca de dias por cidade', () => {
  it('classifica o perfil do viajante', () => {
    expect(classePerfil({ perfil: 'Casal em lua de mel', observacoes: '', criancas: 0 })).toBe(
      'casal'
    );
    expect(classePerfil({ perfil: 'casal', observacoes: '', criancas: 2 })).toBe('familia');
    expect(classePerfil({ perfil: 'Terceira idade', observacoes: '', criancas: 0 })).toBe('senior');
    expect(classePerfil({ perfil: '', observacoes: '', criancas: 0 })).toBe('geral');
  });

  it('extrai só dias de passeio seguidos na mesma cidade, escritos pela IA', () => {
    const d = (dia: number, cidade: string, percurso = '', bloco = false) => ({
      dia,
      cidade,
      percurso,
      descricao: `Dia ${dia}.`,
      ...(bloco ? { bloco: true } : {})
    });
    const trechos = extrairBlocosDias(
      {
        dias: [
          d(1, 'Roma', 'São Paulo → Roma'),
          d(2, 'Roma'),
          d(3, 'Roma'),
          d(4, 'Paris', 'Roma → Paris'),
          d(5, 'Paris', '', true),
          d(6, 'Paris'),
          d(7, 'Paris', 'Paris → São Paulo')
        ],
        opcionais: [],
        inclui: [],
        nao_inclui: []
      },
      7
    );
    expect(trechos).toEqual([
      { cidade: 'Roma', descricoes: ['Dia 2.', 'Dia 3.'] },
      { cidade: 'Paris', descricoes: ['Dia 6.'] }
    ]);
  });

  it('expande o bloco pelo código, sem sobrescrever dias escritos pela IA', () => {
    const blocos = [{ ref: 'd1', cidade: 'Roma', dias: 3, descricoes: ['A.', 'B.', 'C.'] }];
    const { saida, blocosUsados } = normalizarSaidaIA(
      {
        dias: [
          { dia: 1, cidade: 'Roma', percurso: 'São Paulo → Roma', descricao: 'Chegada.' },
          { dia: 4, cidade: 'Roma', percurso: '', descricao: 'Escrito pela IA.' },
          { dia: 5, cidade: 'Roma', percurso: 'Roma → São Paulo', descricao: 'Volta.' }
        ],
        blocos_ref: [
          { ref: 'd1', dia: 2 },
          { ref: 'x9', dia: 2 }
        ]
      },
      [],
      5,
      blocos
    );
    expect(saida.dias.map((x) => [x.dia, x.descricao, Boolean(x.bloco)])).toEqual([
      [1, 'Chegada.', false],
      [2, 'A.', true],
      [3, 'B.', true],
      [4, 'Escrito pela IA.', false],
      [5, 'Volta.', false]
    ]);
    expect(blocosUsados).toEqual(blocos);
  });

  it('a mensagem lista os blocos com resumo curto', () => {
    const m = montarMensagemPedido(
      pedido,
      [],
      [
        {
          ref: 'd1',
          cidade: 'Roma',
          dias: 2,
          descricoes: ['Café da manhã. Coliseu e Fórum.', 'Vaticano.']
        }
      ]
    );
    expect(m).toContain('d1 Roma, 2 dia(s) de passeio: Coliseu e Fórum. | Vaticano.');
  });
});
