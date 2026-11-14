export type QuoteFlightSegment = {
  tipo_voo: string;
  trecho: string;
  cia_aerea: string;
  numero_voo: string;
  data_voo: string;
  classe_reserva: string;
  hora_saida: string;
  aeroporto_saida: string;
  duracao_voo: string;
  data_fim: string;
  hora_chegada: string;
  aeroporto_chegada: string;
  tarifa_nome: string;
};

function record(value: unknown): Record<string, unknown> {
  return value && typeof value === 'object' && !Array.isArray(value)
    ? Object.fromEntries(Object.entries(value))
    : {};
}

function text(value: unknown): string {
  return typeof value === 'string' ? value : '';
}

function flightType(value: string) {
  const normalized = value.trim().toLowerCase();
  if (normalized.includes('interno')) return 'Voo Interno';
  if (normalized.includes('fretamento')) return 'Fretamento';
  if (normalized.includes('internacional')) return 'Internacional';
  if (normalized.includes('nacional')) return 'Nacional';
  return 'Internacional';
}

function reservationClass(value: string) {
  const normalized = value.trim().toLowerCase();
  if (normalized.includes('premium')) return 'Econômica Premium';
  if (normalized.includes('executiva')) return 'Executiva';
  if (normalized.includes('primeira')) return 'Primeira Classe';
  return normalized ? 'Econômica' : '';
}

function flightTime(value: string) {
  const clean = value.replace(/\s*\(\+\d+\)\s*$/, '').trim();
  const match = clean.match(/^(\d{1,2})\s*(?::|h)?\s*(\d{2})$/i);
  return match ? `${match[1].padStart(2, '0')}:${match[2]}` : clean;
}

function toFlightSegment(value: unknown): QuoteFlightSegment {
  const segment = record(value);
  return {
    tipo_voo: flightType(text(segment.tipo_voo)),
    trecho: text(segment.trecho),
    cia_aerea: text(segment.cia_aerea),
    numero_voo: text(segment.numero_voo) || text(segment.descricao),
    data_voo: text(segment.data_voo) || text(segment.data_inicio),
    classe_reserva: reservationClass(text(segment.classe_reserva)),
    hora_saida: flightTime(text(segment.hora_saida)),
    aeroporto_saida: text(segment.aeroporto_saida),
    duracao_voo: flightTime(text(segment.duracao_voo)),
    data_fim: text(segment.data_fim),
    hora_chegada: flightTime(text(segment.hora_chegada)),
    aeroporto_chegada: text(segment.aeroporto_chegada),
    tarifa_nome: text(segment.tarifa_nome)
  };
}

export function newQuoteFlightSegment(): QuoteFlightSegment {
  return {
    tipo_voo: 'Nacional',
    trecho: '',
    cia_aerea: '',
    numero_voo: '',
    data_voo: '',
    classe_reserva: '',
    hora_saida: '',
    aeroporto_saida: '',
    duracao_voo: '',
    data_fim: '',
    hora_chegada: '',
    aeroporto_chegada: '',
    tarifa_nome: ''
  };
}

export function readQuoteFlightSegments(raw: unknown): QuoteFlightSegment[] {
  const aereoImport = record(record(raw).aereo_import);
  if (Array.isArray(aereoImport.segmentos)) {
    return aereoImport.segmentos.map(toFlightSegment);
  }
  if (
    aereoImport.data_voo ||
    aereoImport.data_inicio ||
    aereoImport.hora_saida ||
    aereoImport.aeroporto_saida
  ) {
    return [toFlightSegment(aereoImport)];
  }
  return [];
}

export function supportsFlightSegments(itemType: string): boolean {
  const normalized = itemType
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase();
  return (
    normalized.includes('passag') ||
    normalized.includes('aereo') ||
    normalized.includes('voo') ||
    normalized.trim() === 'trem'
  );
}
