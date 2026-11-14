import { diffDaysISODate, parseISODateParts } from '$lib/date';
import type { QuoteFlightSegment } from '$lib/quote/flights';

export type DetalhesItem = {
  start_date: string;
  end_date: string;
  categoria: string;
  adultos: number | null;
  adultos_valor: number;
  criancas: number | null;
  criancas_valor: number;
  infant: number | null;
  infant_valor: number;
  senior: number | null;
  senior_valor: number;
  tipo_apartamento: string;
  quantidade_apartamentos: number | null;
  regime: string;
  cambio: string;
  incluidos: string[];
};

export type ItemOrcamento = DetalhesItem & {
  id?: string;
  isOpen: boolean;
  title: string;
  product_name: string;
  item_type: string;
  quantity: number;
  unit_price: number;
  total_amount: number;
  city_name: string;
  destino_geografico_id: string;
  order_index: number;
  flightSegments: QuoteFlightSegment[];
};

export const tiposItem = [
  { value: 'servico', label: 'Serviço' },
  { value: 'pacote', label: 'Pacote' },
  { value: 'hotel', label: 'Hotel' },
  { value: 'passagem', label: 'Passagem Aérea' },
  { value: 'passeio', label: 'Passeio' },
  { value: 'show', label: 'Show' },
  { value: 'aluguel_carro', label: 'Aluguel de Carro' },
  { value: 'ingresso', label: 'Ingresso' },
  { value: 'transfer', label: 'Traslado' },
  { value: 'seguro', label: 'Seguro Viagem' },
  { value: 'outro', label: 'Outro' }
];

export function detalhesVazios(): DetalhesItem {
  return {
    start_date: '',
    end_date: '',
    categoria: '',
    adultos: null,
    adultos_valor: 0,
    criancas: null,
    criancas_valor: 0,
    infant: null,
    infant_valor: 0,
    senior: null,
    senior_valor: 0,
    tipo_apartamento: '',
    quantidade_apartamentos: null,
    regime: '',
    cambio: '',
    incluidos: []
  };
}

export function novoItemOrcamento(index: number, id = ''): ItemOrcamento {
  return {
    id,
    isOpen: false,
    title: '',
    product_name: '',
    item_type: 'servico',
    quantity: 1,
    unit_price: 0,
    total_amount: 0,
    city_name: '',
    destino_geografico_id: '',
    order_index: index,
    flightSegments: [],
    ...detalhesVazios(),
    adultos: 1,
    criancas: 0,
    infant: 0,
    senior: 0
  };
}

function registro(value: unknown): Record<string, unknown> {
  return value && typeof value === 'object' && !Array.isArray(value)
    ? Object.fromEntries(Object.entries(value))
    : {};
}

function numero(value: unknown): number | null {
  const parsed = typeof value === 'number' ? value : Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

function texto(value: unknown): string {
  return typeof value === 'string' ? value : '';
}

function tipoNormalizado(value: string) {
  return value
    .trim()
    .toLowerCase()
    .replace(/[\s-]+/g, '_');
}

function isHotel(type: string) {
  return type === 'hotel' || type === 'hospedagem';
}

function isCar(type: string) {
  return type === 'aluguel_carro';
}

function isFlight(type: string) {
  return type === 'passagem';
}

function isActivity(type: string) {
  return ['servico', 'passeio', 'show', 'transfer'].includes(type);
}

function isTicket(type: string) {
  return type === 'ingresso';
}

function isInsurance(type: string) {
  return type === 'seguro' || type === 'seguro_viagem';
}

function isPassengerPriced(type: string) {
  return isFlight(type) || isActivity(type) || isTicket(type) || isInsurance(type);
}

function passageiros(item: Pick<DetalhesItem, 'adultos' | 'criancas' | 'infant' | 'senior'>) {
  return {
    adultos: Math.max(0, item.adultos || 0),
    criancas: Math.max(0, item.criancas || 0),
    infant: Math.max(0, item.infant || 0),
    senior: Math.max(0, item.senior || 0)
  };
}

function arredondarMoeda(value: number) {
  return Math.round((value + Number.EPSILON) * 100) / 100;
}

export function calcularTotaisItem(
  item: Pick<
    DetalhesItem,
    | 'quantidade_apartamentos'
    | 'adultos'
    | 'adultos_valor'
    | 'criancas'
    | 'criancas_valor'
    | 'infant'
    | 'infant_valor'
    | 'senior'
    | 'senior_valor'
  > & { item_type: string; quantity: number; unit_price: number }
) {
  const type = tipoNormalizado(item.item_type);
  const quantidades = passageiros(item);

  if (isHotel(type)) {
    const quantity = Math.max(0, item.quantidade_apartamentos || 0);
    const unitPrice = Math.max(0, item.unit_price || 0);
    return {
      quantity,
      unit_price: unitPrice,
      total_amount: arredondarMoeda(quantity * unitPrice)
    };
  }

  if (isCar(type)) {
    const quantity = Math.max(0, item.quantity || 0);
    const unitPrice = Math.max(0, item.unit_price || 0);
    return {
      quantity,
      unit_price: unitPrice,
      total_amount: arredondarMoeda(quantity * unitPrice)
    };
  }

  if (isPassengerPriced(type)) {
    const groups = [
      [quantidades.adultos, item.adultos_valor],
      [quantidades.criancas, item.criancas_valor],
      [quantidades.infant, item.infant_valor],
      ...(isInsurance(type) ? [[quantidades.senior, item.senior_valor]] : [])
    ];
    const quantity = groups.reduce((sum, [count]) => sum + Number(count || 0), 0);
    const total = arredondarMoeda(
      groups.reduce((sum, [count, value]) => sum + Number(count || 0) * Number(value || 0), 0)
    );
    return {
      quantity,
      unit_price: quantity > 0 ? total / quantity : 0,
      total_amount: total
    };
  }

  const quantity = Math.max(0, item.quantity || 0);
  const unitPrice = Math.max(0, item.unit_price || 0);
  return {
    quantity,
    unit_price: unitPrice,
    total_amount: arredondarMoeda(quantity * unitPrice)
  };
}

export function recalcularTotaisItem(item: ItemOrcamento) {
  Object.assign(item, calcularTotaisItem(item));
}

export function diasItem(type: string, start: string, end: string): number | null {
  const difference = diffDaysISODate(start, end);
  if (difference === null || difference < 0) return null;
  return isHotel(tipoNormalizado(type)) ? difference : difference + 1;
}

export function lerDetalhes(item: {
  start_date?: unknown;
  end_date?: unknown;
  raw?: unknown;
  item_type?: unknown;
  quantity?: unknown;
  unit_price?: unknown;
  total_amount?: unknown;
}): DetalhesItem {
  const detalhes = registro(registro(item.raw).detalhes_orcamento);
  const type = tipoNormalizado(texto(item.item_type));
  const adultos = numero(detalhes.adultos);
  const criancas = numero(detalhes.criancas);
  const infant = numero(detalhes.infant);
  const senior = numero(detalhes.senior);
  const temValoresPassageiros = [
    'adultos_valor',
    'criancas_valor',
    'infant_valor',
    'senior_valor'
  ].some((key) => Object.hasOwn(detalhes, key));
  const totalPassageiros =
    Math.max(0, adultos || 0) +
    Math.max(0, criancas || 0) +
    Math.max(0, infant || 0) +
    (isInsurance(type) ? Math.max(0, senior || 0) : 0);
  const valorLegado =
    !temValoresPassageiros && totalPassageiros > 0
      ? Math.max(0, numero(item.total_amount) || 0) / totalPassageiros
      : 0;
  return {
    start_date: texto(item.start_date),
    end_date: texto(item.end_date),
    categoria: texto(detalhes.categoria),
    adultos,
    adultos_valor: numero(detalhes.adultos_valor) ?? (adultos ? valorLegado : 0),
    criancas,
    criancas_valor: numero(detalhes.criancas_valor) ?? (criancas ? valorLegado : 0),
    infant,
    infant_valor: numero(detalhes.infant_valor) ?? (infant ? valorLegado : 0),
    senior,
    senior_valor: numero(detalhes.senior_valor) ?? (senior ? valorLegado : 0),
    tipo_apartamento: texto(detalhes.tipo_apartamento),
    quantidade_apartamentos:
      numero(detalhes.quantidade_apartamentos) ?? (isHotel(type) ? numero(item.quantity) : null),
    regime: texto(detalhes.regime),
    cambio: texto(detalhes.cambio),
    incluidos: Array.isArray(detalhes.incluidos)
      ? detalhes.incluidos.filter((value): value is string => typeof value === 'string')
      : []
  };
}

export function dadosItemParaValidacao(item: Record<string, unknown>) {
  return {
    ...lerDetalhes(item),
    item_type: texto(item.item_type) || 'servico',
    title: texto(item.title ?? item.descricao),
    city_name: texto(item.city_name ?? item.cidade),
    quantity: numero(item.quantity ?? item.quantidade) ?? 0,
    unit_price: numero(item.unit_price ?? item.valor_unitario) ?? 0,
    total_amount: numero(item.total_amount ?? item.valor_total) ?? 0
  };
}

export function totaisDoItem(item: Record<string, unknown>) {
  const dados = dadosItemParaValidacao(item);
  return calcularTotaisItem({
    ...dados,
    quantity: dados.quantity,
    unit_price: dados.unit_price
  });
}

export function validarDetalhes(
  item: DetalhesItem & {
    item_type: string;
    title?: unknown;
    city_name?: unknown;
    quantity?: unknown;
    unit_price?: unknown;
    total_amount?: unknown;
  }
): string | null {
  const type = tipoNormalizado(item.item_type);
  const title = texto(item.title).trim();
  const city = texto(item.city_name).trim();
  const dataValida = (value: string) =>
    /^\d{4}-\d{2}-\d{2}$/.test(value) && parseISODateParts(value) !== null;
  const counts = passageiros(item);
  const allCountsValid = [item.adultos, item.criancas, item.infant, item.senior].every(
    (value) => value === null || (Number.isInteger(value) && value >= 0)
  );
  const pricesValid = [
    item.adultos_valor,
    item.criancas_valor,
    item.infant_valor,
    item.senior_valor
  ].every((value) => Number.isFinite(value) && value >= 0);
  const hasPassenger = (includeSenior = false) =>
    counts.adultos + counts.criancas + counts.infant + (includeSenior ? counts.senior : 0) > 0;

  if (!title) return 'Informe a descrição do item.';
  if (!dataValida(item.start_date) || !dataValida(item.end_date))
    return 'Informe as datas de início e fim.';
  if (item.end_date < item.start_date) return 'A data final não pode ser anterior à inicial.';
  if (!isFlight(type) && !city) return 'Informe o destino.';

  if (isHotel(type)) {
    if (item.end_date === item.start_date) return 'O check-out deve ser posterior ao check-in.';
    if (!item.categoria.trim()) return 'Informe a categoria do hotel.';
    if (!item.tipo_apartamento.trim() || !item.regime.trim())
      return 'Informe o tipo de apartamento e o regime do hotel.';
    if (!allCountsValid || counts.adultos + counts.criancas < 1)
      return 'Informe ao menos um adulto ou uma criança.';
    if (
      item.quantidade_apartamentos === null ||
      !Number.isInteger(item.quantidade_apartamentos) ||
      item.quantidade_apartamentos < 1
    )
      return 'Informe a quantidade de apartamentos.';
  } else if (isCar(type)) {
    if (!['Manual', 'Automático'].includes(item.cambio)) return 'Selecione o câmbio do veículo.';
    if (
      !Number.isInteger(Number(item.quantity)) ||
      Number(item.quantity) < 1 ||
      !Number.isFinite(Number(item.unit_price)) ||
      Number(item.unit_price) <= 0
    )
      return 'Informe o valor unitário e a quantidade de carros.';
  } else if (isPassengerPriced(type)) {
    if (!allCountsValid || !pricesValid) return 'Informe quantidades e valores válidos.';
    if (!hasPassenger(isInsurance(type))) return 'Informe ao menos um passageiro.';
    if (
      isActivity(type) &&
      !['Serviço Compartilhado', 'Serviço Privativo'].includes(item.categoria)
    )
      return 'Selecione a categoria do serviço.';
    if (isTicket(type) && !item.categoria.trim()) return 'Informe a categoria do ingresso.';
  } else {
    if (!item.categoria.trim()) return 'Informe a categoria.';
    if (!allCountsValid || counts.adultos + counts.criancas < 1)
      return 'Informe adultos e crianças, com pelo menos uma pessoa.';
    if (
      !Number.isInteger(Number(item.quantity)) ||
      Number(item.quantity) < 1 ||
      !Number.isFinite(Number(item.unit_price)) ||
      Number(item.unit_price) <= 0
    )
      return 'Informe a quantidade e o valor unitário.';
  }

  const totais = calcularTotaisItem({
    ...item,
    item_type: type,
    quantity: Number(item.quantity) || 0,
    unit_price: Number(item.unit_price) || 0
  });
  if (
    !Number.isFinite(Number(item.total_amount)) ||
    totais.total_amount <= 0 ||
    Math.abs(totais.total_amount - Number(item.total_amount)) > 0.01
  )
    return 'O total do item deve ser maior que zero e corresponder às quantidades e valores.';
  return null;
}

export function rawDetalhes(item: DetalhesItem & { item_type: string }) {
  const type = tipoNormalizado(item.item_type);
  if (isHotel(type)) {
    return {
      categoria: item.categoria.trim(),
      adultos: item.adultos,
      criancas: item.criancas,
      tipo_apartamento: item.tipo_apartamento.trim(),
      quantidade_apartamentos: item.quantidade_apartamentos,
      regime: item.regime.trim()
    };
  }
  if (isCar(type)) {
    return { cambio: item.cambio, incluidos: item.incluidos };
  }
  if (isPassengerPriced(type)) {
    return {
      ...(isActivity(type) || isTicket(type) ? { categoria: item.categoria.trim() } : {}),
      adultos: item.adultos,
      adultos_valor: item.adultos_valor,
      criancas: item.criancas,
      criancas_valor: item.criancas_valor,
      infant: item.infant,
      infant_valor: item.infant_valor,
      ...(isInsurance(type) ? { senior: item.senior, senior_valor: item.senior_valor } : {})
    };
  }
  return {
    categoria: item.categoria.trim(),
    adultos: item.adultos,
    criancas: item.criancas
  };
}

export function resumoDetalhes(item: {
  start_date?: unknown;
  end_date?: unknown;
  raw?: unknown;
  item_type?: unknown;
}): string[] {
  const detalhes = lerDetalhes(item);
  const type = tipoNormalizado(texto(item.item_type));
  const resumo: string[] = [];
  const dias = diasItem(type, detalhes.start_date, detalhes.end_date);
  if (isHotel(type) && dias !== null && dias > 0) resumo.push(`Total de noites: ${dias}`);
  if ((isCar(type) || isInsurance(type)) && dias !== null) resumo.push(`Total de dias: ${dias}`);
  if (detalhes.categoria && !isCar(type) && !isFlight(type) && !isInsurance(type))
    resumo.push(`Categoria: ${detalhes.categoria}`);
  if (isCar(type)) {
    if (detalhes.cambio) resumo.push(`Câmbio: ${detalhes.cambio}`);
    if (detalhes.incluidos.length > 0) resumo.push(`Incluídos: ${detalhes.incluidos.join(', ')}`);
  }
  if (!isCar(type) && detalhes.adultos !== null && detalhes.adultos > 0)
    resumo.push(`Adultos: ${detalhes.adultos}`);
  if (!isCar(type) && detalhes.criancas !== null && detalhes.criancas > 0)
    resumo.push(`Crianças: ${detalhes.criancas}`);
  if (!isCar(type) && detalhes.infant !== null && detalhes.infant > 0)
    resumo.push(`Infant: ${detalhes.infant}`);
  if (isInsurance(type) && detalhes.senior !== null && detalhes.senior > 0)
    resumo.push(`Senior: ${detalhes.senior}`);
  if (isHotel(type)) {
    if (detalhes.tipo_apartamento) resumo.push(`Acomodação: ${detalhes.tipo_apartamento}`);
    if (detalhes.quantidade_apartamentos !== null)
      resumo.push(`Apartamentos: ${detalhes.quantidade_apartamentos}`);
    if (detalhes.regime) resumo.push(`Regime: ${detalhes.regime}`);
  }
  return resumo;
}

function dataResumo(value: string) {
  const parts = parseISODateParts(value);
  return parts
    ? `${String(parts.day).padStart(2, '0')}-${String(parts.month).padStart(2, '0')}-${parts.year}`
    : '';
}

export function resumoItemOrcamento(
  item: Pick<ItemOrcamento, 'city_name' | 'title' | 'start_date' | 'end_date' | 'item_type'>
) {
  const type = tipoNormalizado(item.item_type);
  const tipo = tiposItem.find((option) => option.value === type)?.label || item.item_type || 'Item';
  const cidade = item.city_name.trim();
  const descricao = item.title.trim() || 'Novo item';
  const inicio = dataResumo(item.start_date);
  const fim = dataResumo(item.end_date);
  let periodo = inicio && fim && inicio !== fim ? `${inicio} a ${fim}` : inicio || fim;
  const dias = diasItem(type, item.start_date, item.end_date);

  if (periodo && isHotel(type) && dias !== null && dias > 0) {
    periodo += ` (${dias} ${dias === 1 ? 'noite' : 'noites'})`;
  } else if (periodo && isCar(type) && dias !== null) {
    periodo += ` (${String(dias).padStart(2, '0')} ${dias === 1 ? 'dia' : 'dias'})`;
  }

  return [tipo, cidade, descricao, periodo].filter(Boolean).join(' · ');
}
