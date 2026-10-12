export type VoucherProvider = "special_tours" | "europamundo" | "sato_tours";

export type VoucherAssetProvider = "vtur" | VoucherProvider | "generic";

export type VoucherAssetKind = "logo" | "image" | "app_icon";

export type VoucherDia = {
  id?: string;
  dia_numero: number;
  titulo: string;
  descricao: string;
  data_referencia?: string | null;
  cidade?: string | null;
  ordem: number;
};

export type VoucherHotel = {
  id?: string;
  cidade: string;
  hotel: string;
  endereco?: string | null;
  data_inicio?: string | null;
  data_fim?: string | null;
  noites?: number | null;
  telefone?: string | null;
  contato?: string | null;
  status?: string | null;
  observacao?: string | null;
  ordem: number;
};

export type VoucherPassengerDetail = {
  nome: string;
  passenger_id?: string | null;
  tipo?: string | null;
  passaporte?: string | null;
  data_nascimento?: string | null;
  nacionalidade?: string | null;
  ordem: number;
};

export type VoucherTransferInfo = {
  detalhes?: string | null;
  notas?: string | null;
  telefone_transferista?: string | null;
};

export type VoucherEmergencyInfo = {
  escritorio?: string | null;
  emergencia_24h?: string | null;
  whatsapp?: string | null;
};

export type VoucherAppInfo = {
  nome: string;
  descricao?: string | null;
  ordem: number;
};

export type VoucherExtraData = {
  localizador_agencia?: string | null;
  passageiros_detalhes?: VoucherPassengerDetail[];
  traslado_chegada?: VoucherTransferInfo | null;
  traslado_saida?: VoucherTransferInfo | null;
  informacoes_importantes?: string | null;
  apps_recomendados?: VoucherAppInfo[];
  emergencia?: VoucherEmergencyInfo | null;
};

export type VoucherImportResult = {
  provider: VoucherProvider;
  nome: string;
  codigo_systur: string;
  codigo_fornecedor: string;
  reserva_online: string;
  passageiros: string;
  tipo_acomodacao: string;
  operador: string;
  resumo: string;
  data_inicio: string;
  data_fim: string;
  dias: VoucherDia[];
  hoteis: VoucherHotel[];
  extra_data: VoucherExtraData;
  source_text?: string;
};

export type VoucherRecord = {
  id: string;
  company_id: string;
  provider: VoucherProvider;
  nome: string;
  status?: 'rascunho' | 'finalizado' | 'cancelado' | null;
  codigo_systur?: string | null;
  codigo_fornecedor?: string | null;
  reserva_online?: string | null;
  passageiros?: string | null;
  tipo_acomodacao?: string | null;
  operador?: string | null;
  resumo?: string | null;
  data_inicio?: string | null;
  data_fim?: string | null;
  ativo?: boolean | null;
  created_at?: string | null;
  updated_at?: string | null;
  extra_data?: VoucherExtraData | null;
  voucher_dias?: VoucherDia[] | null;
  voucher_hoteis?: VoucherHotel[] | null;
};

export type VoucherForm = {
  id: string | null;
  provider: VoucherProvider;
  nome: string;
  codigo_systur: string;
  codigo_fornecedor: string;
  reserva_online: string;
  passageiros: string;
  tipo_acomodacao: string;
  operador: string;
  resumo: string;
  data_inicio: string;
  data_fim: string;
  ativo: boolean;
  status: 'rascunho' | 'finalizado' | 'cancelado';
  extra_data: VoucherExtraData;
  dias: VoucherDia[];
  hoteis: VoucherHotel[];
};

export type VoucherAssetRecord = {
  id: string;
  company_id: string;
  provider: VoucherAssetProvider;
  asset_kind: VoucherAssetKind;
  label?: string | null;
  storage_bucket: string;
  storage_path: string;
  mime_type?: string | null;
  size_bytes?: number | null;
  ativo?: boolean | null;
  ordem?: number | null;
  created_at?: string | null;
  updated_at?: string | null;
  preview_url?: string | null;
};
