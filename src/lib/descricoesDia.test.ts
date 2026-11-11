import { describe, expect, it } from 'vitest';
import {
  agruparDescricoes,
  aplicarDescricao,
  destacarBusca,
  filtrarDescricoes,
  teclaLista
} from './descricoesDia';

describe('descrições salvas do dia', () => {
  it('deduplica pelo texto normalizado e ordena por uso e data', () => {
    const grupos = agruparDescricoes([
      { descricao: 'Visita à Sagrada Família', created_at: '2026-01-01T00:00:00Z' },
      { descricao: '  visita a sagrada familia ', created_at: '2026-03-01T00:00:00Z' },
      { descricao: 'Dia de praia', created_at: '2026-02-01T00:00:00Z' }
    ]);
    expect(grupos).toEqual([
      { texto: 'visita a sagrada familia', usos: 2, recente: '2026-03-01T00:00:00Z' },
      { texto: 'Dia de praia', usos: 1, recente: '2026-02-01T00:00:00Z' }
    ]);
    expect(filtrarDescricoes(grupos, 'SAGRADA').map((item) => item.usos)).toEqual([2]);
    expect(filtrarDescricoes(grupos, 'praia').map((item) => item.texto)).toEqual(['Dia de praia']);
  });

  it('destaca o termo ignorando acentos e escapa HTML', () => {
    expect(destacarBusca('Visita à <Sagrada> Família', 'sagrada')).toBe(
      'Visita à &lt;<mark>Sagrada</mark>&gt; Família'
    );
  });

  it('navega com setas e aplica substituição ou acréscimo', () => {
    expect(teclaLista('ArrowDown', 1, 2)).toEqual({ tipo: 'mover', indice: 0 });
    expect(teclaLista('ArrowUp', 0, 2)).toEqual({ tipo: 'mover', indice: 1 });
    expect(teclaLista('Enter', 0, 2)).toEqual({ tipo: 'escolher' });
    expect(teclaLista('Escape', 0, 2)).toEqual({ tipo: 'fechar' });
    expect(aplicarDescricao('Manhã livre', 'Tarde no museu', 'acrescentar')).toBe(
      'Manhã livre\n\nTarde no museu'
    );
    expect(aplicarDescricao('Manhã livre', 'Tarde no museu', 'substituir')).toBe('Tarde no museu');
  });
});
