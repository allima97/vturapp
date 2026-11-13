import { parseISODateParts } from '$lib/date';

export type DetalhesItem = {
  start_date: string;
  end_date: string;
  categoria: string;
  adultos: number | null;
  criancas: number | null;
  tipo_apartamento: string;
  quantidade_apartamentos: number | null;
  regime: string;
};

export const tiposItem = [
  { value: 'servico', label: 'Serviço' },
  { value: 'pacote', label: 'Pacote' },
  { value: 'hotel', label: 'Hotel' },
  { value: 'passagem', label: 'Passagem' },
  { value: 'passeio', label: 'Passeio' },
  { value: 'aluguel_carro', label: 'Aluguel de carro' },
  { value: 'ingresso', label: 'Ingresso' },
  { value: 'transfer', label: 'Transfer' },
  { value: 'seguro', label: 'Seguro' },
  { value: 'outro', label: 'Outro' }
];

export function detalhesVazios(): DetalhesItem {
  return {
    start_date: '',
    end_date: '',
    categoria: '',
    adultos: null,
    criancas: null,
    tipo_apartamento: '',
    quantidade_apartamentos: null,
    regime: ''
  };
}

function registro(value: unknown): Record<string, unknown> {
  return value && typeof value === 'object' && !Array.isArray(value)
    ? Object.fromEntries(Object.entries(value))
    : {};
}

function numero(value: unknown): number | null {
  return typeof value === 'number' && Number.isFinite(value) ? value : null;
}

function texto(value: unknown): string {
  return typeof value === 'string' ? value : '';
}

export function lerDetalhes(item: {
  start_date?: unknown;
  end_date?: unknown;
  raw?: unknown;
}): DetalhesItem {
  const detalhes = registro(registro(item.raw).detalhes_orcamento);
  return {
    start_date: texto(item.start_date),
    end_date: texto(item.end_date),
    categoria: texto(detalhes.categoria),
    adultos: numero(detalhes.adultos),
    criancas: numero(detalhes.criancas),
    tipo_apartamento: texto(detalhes.tipo_apartamento),
    quantidade_apartamentos: numero(detalhes.quantidade_apartamentos),
    regime: texto(detalhes.regime)
  };
}

export function validarDetalhes(item: DetalhesItem & { item_type: string }): string | null {
  const dataValida = (value: string) =>
    /^\d{4}-\d{2}-\d{2}$/.test(value) && parseISODateParts(value) !== null;
  if (!dataValida(item.start_date) || !dataValida(item.end_date))
    return 'Informe as datas de início e fim.';
  if (item.end_date < item.start_date) return 'A data final não pode ser anterior à inicial.';
  if (!item.categoria.trim()) return 'Informe a categoria.';
  if (
    item.adultos === null ||
    item.criancas === null ||
    !Number.isInteger(item.adultos) ||
    !Number.isInteger(item.criancas) ||
    item.adultos < 0 ||
    item.criancas < 0 ||
    item.adultos + item.criancas < 1
  )
    return 'Informe adultos e crianças, com pelo menos uma pessoa.';
  if (
    item.item_type === 'hotel' &&
    (!item.tipo_apartamento.trim() ||
      item.quantidade_apartamentos === null ||
      !Number.isInteger(item.quantidade_apartamentos) ||
      item.quantidade_apartamentos < 1 ||
      !item.regime.trim())
  )
    return 'Informe tipo e quantidade de apartamentos e regime do hotel.';
  return null;
}

export function rawDetalhes(item: DetalhesItem & { item_type: string }) {
  return {
    categoria: item.categoria.trim(),
    adultos: item.adultos,
    criancas: item.criancas,
    ...(item.item_type === 'hotel'
      ? {
          tipo_apartamento: item.tipo_apartamento.trim(),
          quantidade_apartamentos: item.quantidade_apartamentos,
          regime: item.regime.trim()
        }
      : {})
  };
}

export function resumoDetalhes(item: {
  start_date?: unknown;
  end_date?: unknown;
  raw?: unknown;
}): string[] {
  const detalhes = lerDetalhes(item);
  const resumo: string[] = [];
  if (detalhes.categoria) resumo.push(`Categoria: ${detalhes.categoria}`);
  if (detalhes.adultos !== null) resumo.push(`Adultos: ${detalhes.adultos}`);
  if (detalhes.criancas !== null) resumo.push(`Crianças: ${detalhes.criancas}`);
  if (detalhes.tipo_apartamento) resumo.push(`Apartamento: ${detalhes.tipo_apartamento}`);
  if (detalhes.quantidade_apartamentos !== null)
    resumo.push(`Apartamentos: ${detalhes.quantidade_apartamentos}`);
  if (detalhes.regime) resumo.push(`Regime: ${detalhes.regime}`);
  return resumo;
}
