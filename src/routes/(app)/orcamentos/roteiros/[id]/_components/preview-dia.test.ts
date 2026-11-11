import { describe, expect, it } from 'vitest';
import { renderPreviewDia } from './preview-dia';
import { newDia } from './tipos';

describe('título dos dias no PDF do roteiro', () => {
  it.each([
    [1, 'São Paulo, São Paulo, Brasil', 'São Paulo - Roma'],
    [2, 'Barcelona, Província de Barcelona, Catalunha, Espanha', 'Roma - Barcelona'],
    [7, 'Paris, Ilha de França, França', 'Madrid - Paris']
  ])('mostra somente o percurso no título do dia %i', (numero, cidade, percurso) => {
    const dia = { ...newDia(numero - 1), cidade, percurso, descricao: 'Passeio' };
    const html = renderPreviewDia(dia, numero - 1, (data) => data);
    expect(html).toContain(`<h3>Dia ${numero} - ${percurso}</h3>`);
    expect(html).not.toContain(cidade);
    expect(html.split(percurso)).toHaveLength(2);
    expect(html).toContain('<p>Passeio</p>');
    expect(dia.cidade).toBe(cidade);
  });

  it('exibe apenas o número quando não há percurso, mesmo com cidade preenchida', () => {
    expect(renderPreviewDia({ ...newDia(0), percurso: 'São Paulo - Roma' }, 0, (v) => v)).toContain(
      '<h3>Dia 1 - São Paulo - Roma</h3>'
    );
    const html = renderPreviewDia(
      { ...newDia(0), cidade: 'Roma, Itália', percurso: '  ' },
      0,
      (v) => v
    );
    expect(html).toContain('<h3>Dia 1</h3>');
    expect(html).not.toContain('Roma');
  });

  it('mantém data, descrição e escape de HTML', () => {
    const html = renderPreviewDia(
      {
        ...newDia(0),
        cidade: 'São <Paulo>, Brasil',
        percurso: 'A & B',
        data: '2027-08-10',
        descricao: 'Primeira linha\nSegunda <linha>'
      },
      0,
      () => '10-08-2027'
    );
    expect(html).toContain('<h3>Dia 1 - A &amp; B</h3>');
    expect(html).toContain('<p class="meta">10-08-2027</p>');
    expect(html).not.toContain('São &lt;Paulo&gt;');
    expect(html).not.toContain('<p class="meta">A &amp; B</p>');
    expect(html).toContain('<p>Primeira linha<br>Segunda &lt;linha&gt;</p>');
  });
});
