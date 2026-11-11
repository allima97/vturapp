export type DescricaoAgrupada = {
  texto: string;
  usos: number;
  recente: string;
};

export function normalizarTexto(value: string) {
  return value.toLowerCase().normalize('NFKD').replace(/\p{M}/gu, '').replace(/\s+/g, ' ').trim();
}

function normalizarChar(char: string) {
  const base = char.toLowerCase().normalize('NFKD').replace(/\p{M}/gu, '');
  return base || char;
}

export function agruparDescricoes(rows: { descricao: string; created_at: string | null }[]) {
  const grupos = new Map<string, DescricaoAgrupada>();
  for (const row of rows) {
    const texto = row.descricao.trim();
    const chave = normalizarTexto(texto);
    if (!chave) continue;
    const recente = row.created_at ?? '';
    const atual = grupos.get(chave);
    if (!atual) {
      grupos.set(chave, { texto, usos: 1, recente });
      continue;
    }
    atual.usos += 1;
    if (recente > atual.recente) {
      atual.recente = recente;
      atual.texto = texto;
    }
  }
  return [...grupos.values()].sort(
    (a, b) =>
      b.usos - a.usos || b.recente.localeCompare(a.recente) || a.texto.localeCompare(b.texto)
  );
}

export function filtrarDescricoes(itens: DescricaoAgrupada[], consulta: string) {
  const palavras = normalizarTexto(consulta)
    .split(' ')
    .filter((palavra) => palavra.length > 1);
  if (!palavras.length) return itens;
  return itens.filter((item) => {
    const texto = normalizarTexto(item.texto);
    return palavras.every((palavra) => texto.includes(palavra));
  });
}

function escapeHtml(value: string) {
  return value
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;');
}

export function destacarBusca(texto: string, consulta: string) {
  const palavras = [
    ...new Set(
      normalizarTexto(consulta)
        .split(' ')
        .filter((palavra) => palavra.length > 1)
    )
  ];
  const chars = [...texto];
  if (!palavras.length) return escapeHtml(texto);
  const normalizado = chars.map(normalizarChar).join('');
  const faixas: Array<[number, number]> = [];
  for (const palavra of palavras) {
    let from = 0;
    while (from < normalizado.length) {
      const at = normalizado.indexOf(palavra, from);
      if (at < 0) break;
      faixas.push([at, at + palavra.length]);
      from = at + palavra.length;
    }
  }
  if (!faixas.length) return escapeHtml(texto);
  faixas.sort((a, b) => a[0] - b[0] || b[1] - a[1]);
  const unidas: Array<[number, number]> = [];
  for (const faixa of faixas) {
    const ultima = unidas.at(-1);
    if (!ultima || faixa[0] > ultima[1]) unidas.push(faixa);
    else ultima[1] = Math.max(ultima[1], faixa[1]);
  }
  let html = '';
  let cursor = 0;
  for (const [inicio, fim] of unidas) {
    html += escapeHtml(chars.slice(cursor, inicio).join(''));
    html += `<mark>${escapeHtml(chars.slice(inicio, fim).join(''))}</mark>`;
    cursor = fim;
  }
  html += escapeHtml(chars.slice(cursor).join(''));
  return html;
}

export function teclaLista(key: string, indice: number, total: number) {
  if (key === 'Escape') return { tipo: 'fechar' } as const;
  if (key === 'Enter') return { tipo: 'escolher' } as const;
  if (key === 'ArrowDown')
    return { tipo: 'mover', indice: total ? (indice + 1) % total : 0 } as const;
  if (key === 'ArrowUp')
    return { tipo: 'mover', indice: total ? (indice - 1 + total) % total : 0 } as const;
  return null;
}

export function aplicarDescricao(atual: string, texto: string, modo: 'substituir' | 'acrescentar') {
  if (modo === 'substituir' || !atual.trim()) return texto;
  return `${atual.replace(/\s+$/, '')}\n\n${texto}`;
}
