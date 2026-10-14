export type RoteiroOpcionalCidade = {
  cidade: string;
  passeios: { nome: string; descricao: string }[];
};

/** Valida antes de gravar; a ordem dos arrays é a ordem exibida no PDF. */
export function parseRoteiroOpcionais(value: unknown): RoteiroOpcionalCidade[] {
  if (!Array.isArray(value) || value.length > 100) throw new Error('Informe até 100 cidades nos opcionais.');
  return value.map((item) => {
    if (!item || typeof item !== 'object' || typeof item.cidade !== 'string' ||
        !Array.isArray(item.passeios) || item.passeios.length > 100) {
      throw new Error('Cidade ou passeios opcionais inválidos.');
    }
    const cidade = item.cidade.trim();
    if (!cidade || cidade.length > 200) throw new Error('Informe o nome da cidade dos opcionais (até 200 caracteres).');
    const passeios = item.passeios.map((p: unknown) => {
      if (!p || typeof p !== 'object' || !('nome' in p) || !('descricao' in p) ||
          typeof p.nome !== 'string' || typeof p.descricao !== 'string') throw new Error('Passeio opcional inválido.');
      const nome = p.nome.trim();
      const descricao = p.descricao.trim();
      if (!nome || nome.length > 300 || descricao.length > 20000) throw new Error('Informe o nome do passeio (até 300 caracteres) e uma descrição de até 20.000 caracteres.');
      return { nome, descricao };
    });
    return { cidade, passeios };
  });
}

export function buildOpcionaisHtml(cidades: RoteiroOpcionalCidade[], escape: (text: string) => string): string {
  return cidades.filter(c => c.cidade && c.passeios.length).map(c => `
    <article class="card">
      <h3>${escape(c.cidade)}</h3>
      ${c.passeios.map(p => `<div><h4>${escape(p.nome)}</h4><p>${escape(p.descricao).replace(/\n/g, '<br>')}</p></div>`).join('')}
    </article>`).join('');
}
