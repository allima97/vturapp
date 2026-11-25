import { describe, expect, it } from 'vitest';
import { ErroClaude, chamarFerramentaClaude } from './claude';
import { FERRAMENTA_ROTEIRO } from './esquema';
import { posProcessarRoteiroIA, validarPedidoRoteiroIA } from './posProcessar';
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
  nome === 'Atlantis' ? null : { cidade: nome, cidade_id: `geonames:${nome.length}`, geografica: true };

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

describe('posProcessarRoteiroIA', () => {
  it('mantém só datas do período, em ordem, e avisa o que faltou', async () => {
    const r = await posProcessarRoteiroIA(
      {
        nome: 'Europa',
        dias: [
          { data: '2027-08-12', cidade: 'Barcelona', percurso: 'Roma - Barcelona', descricao: 'Trem.' },
          { data: '2027-08-10', cidade: 'Roma', percurso: 'São Paulo → Roma', descricao: 'Embarque.' },
          { data: '2027-09-01', cidade: 'Roma', percurso: '', descricao: 'Fora do período.' },
          { data: '2027-08-10', cidade: 'Roma', percurso: '', descricao: 'Duplicado.' }
        ],
        opcionais: [],
        inclui: ['Hospedagem'],
        nao_inclui: ['Seguro viagem']
      },
      pedido,
      resolver,
      'claude-sonnet-5-5'
    );
    expect(r.dias.map((d) => d.data)).toEqual(['2027-08-10', '2027-08-12']);
    expect(r.dias[1].percurso).toBe('Roma → Barcelona');
    expect(r.dias[0].cidade_id).toBe('geonames:4');
    expect(r.avisos.join(' ')).toMatch(/2 dia\(s\)/);
    expect(r.inclui_texto).toBe('Hospedagem');
  });

  it('remove valores e números de voo e marca cidade não encontrada', async () => {
    const r = await posProcessarRoteiroIA(
      {
        nome: 'X',
        dias: [
          {
            data: '2027-08-10',
            cidade: 'Atlantis',
            percurso: '',
            descricao: 'Embarque no voo LA 8120 por R$ 3.500,00 por pessoa.'
          }
        ],
        opcionais: [
          { cidade: 'Atlantis', passeios: [{ nome: 'Tour US$ 80', descricao: 'Passeio.', data: '2030-01-01' }] }
        ],
        inclui: [],
        nao_inclui: []
      },
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
    await expect(
      posProcessarRoteiroIA({ dias: [] }, pedido, resolver, 'm')
    ).rejects.toThrow(/nenhum dia/);
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
