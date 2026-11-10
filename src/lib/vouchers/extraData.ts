import type {
  VoucherAppInfo,
  VoucherEmergencyInfo,
  VoucherExtraData,
  VoucherPassengerDetail,
  VoucherProvider,
  VoucherTransferInfo
} from './types';

function textValue(value?: string | null) {
  return String(value || '').trim();
}

function normalizeDateValue(value?: string | null) {
  const raw = textValue(value);
  if (!raw) return '';
  const isoMatch = raw.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (isoMatch) return raw;
  const brMatch = raw.match(/^(\d{2})\/(\d{2})\/(\d{4})$/);
  if (brMatch) return `${brMatch[3]}-${brMatch[2]}-${brMatch[1]}`;
  return raw;
}

function normalizePassengerDetail(value: unknown, index: number): VoucherPassengerDetail {
  const raw = (value && typeof value === 'object' ? value : {}) as Record<string, unknown>;
  return {
    nome: textValue(raw.nome as string | null | undefined),
    passenger_id: textValue(raw.passenger_id as string | null | undefined) || null,
    tipo: textValue(raw.tipo as string | null | undefined) || null,
    passaporte: textValue(raw.passaporte as string | null | undefined) || null,
    data_nascimento: normalizeDateValue(raw.data_nascimento as string | null | undefined) || null,
    nacionalidade: textValue(raw.nacionalidade as string | null | undefined) || null,
    ordem: Number.isFinite(Number(raw.ordem)) ? Number(raw.ordem) : index
  };
}

function normalizeTransferInfo(value: unknown): VoucherTransferInfo {
  const raw = (value && typeof value === 'object' ? value : {}) as Record<string, unknown>;
  return {
    detalhes: textValue(raw.detalhes as string | null | undefined) || null,
    notas: textValue(raw.notas as string | null | undefined) || null,
    telefone_transferista: textValue(raw.telefone_transferista as string | null | undefined) || null
  };
}

function normalizeEmergencyInfo(value: unknown): VoucherEmergencyInfo {
  const raw = (value && typeof value === 'object' ? value : {}) as Record<string, unknown>;
  return {
    escritorio: textValue(raw.escritorio as string | null | undefined) || null,
    emergencia_24h: textValue(raw.emergencia_24h as string | null | undefined) || null,
    whatsapp: textValue(raw.whatsapp as string | null | undefined) || null
  };
}

function normalizeAppInfo(value: unknown, index: number): VoucherAppInfo {
  const raw = (value && typeof value === 'object' ? value : {}) as Record<string, unknown>;
  return {
    nome: textValue(raw.nome as string | null | undefined),
    descricao: textValue(raw.descricao as string | null | undefined) || null,
    ordem: Number.isFinite(Number(raw.ordem)) ? Number(raw.ordem) : index
  };
}

export function createBlankPassengerDetail(index: number): VoucherPassengerDetail {
  return {
    nome: '',
    passenger_id: '',
    tipo: '',
    passaporte: '',
    data_nascimento: '',
    nacionalidade: '',
    ordem: index
  };
}

export function createBlankAppInfo(index: number): VoucherAppInfo {
  return {
    nome: '',
    descricao: '',
    ordem: index
  };
}

export function createEmptyVoucherExtraData(_provider?: VoucherProvider): VoucherExtraData {
  return {
    localizador_agencia: '',
    passageiros_detalhes: [],
    traslado_chegada: {
      detalhes: '',
      notas: '',
      telefone_transferista: ''
    },
    traslado_saida: {
      detalhes: '',
      notas: '',
      telefone_transferista: ''
    },
    informacoes_importantes: '',
    apps_recomendados: [],
    emergencia: {
      escritorio: '',
      emergencia_24h: '',
      whatsapp: ''
    }
  };
}

export function normalizeVoucherExtraData(
  value: unknown,
  provider?: VoucherProvider
): VoucherExtraData {
  const empty = createEmptyVoucherExtraData(provider);
  const raw = (value && typeof value === 'object' ? value : {}) as Record<string, unknown>;
  return {
    localizador_agencia:
      textValue(raw.localizador_agencia as string | null | undefined) ||
      empty.localizador_agencia ||
      '',
    passageiros_detalhes: Array.isArray(raw.passageiros_detalhes)
      ? raw.passageiros_detalhes
          .map((item, index: number) => normalizePassengerDetail(item, index))
          .filter((item: VoucherPassengerDetail) => item.nome)
          .sort((a: VoucherPassengerDetail, b: VoucherPassengerDetail) => a.ordem - b.ordem)
      : [],
    traslado_chegada: normalizeTransferInfo(raw.traslado_chegada || empty.traslado_chegada),
    traslado_saida: normalizeTransferInfo(raw.traslado_saida || empty.traslado_saida),
    informacoes_importantes:
      textValue(raw.informacoes_importantes as string | null | undefined) || '',
    apps_recomendados: Array.isArray(raw.apps_recomendados)
      ? raw.apps_recomendados
          .map((item, index: number) => normalizeAppInfo(item, index))
          .filter((item: VoucherAppInfo) => item.nome || item.descricao)
          .sort((a: VoucherAppInfo, b: VoucherAppInfo) => a.ordem - b.ordem)
      : [],
    emergencia: normalizeEmergencyInfo(raw.emergencia || empty.emergencia)
  };
}

export function buildPassengerSummary(details: VoucherPassengerDetail[]) {
  const lines: string[] = [];
  for (const item of details) {
    const name = textValue(item.nome);
    if (name) lines.push(name);
  }
  return lines.join('\n');
}

export function splitLinesFromMultilineText(value?: string | null) {
  const lines: string[] = [];
  for (const line of textValue(value).split(/\n+/)) {
    const trimmed = line.trim();
    if (trimmed) lines.push(trimmed);
  }
  return lines;
}
