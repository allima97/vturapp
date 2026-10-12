import type { ComponentType } from 'svelte';
import type {
  VoucherProvider,
  VoucherDia,
  VoucherHotel,
  VoucherExtraData
} from '$lib/vouchers/types';

// Tipo para o formulário do wizard
export interface WizardForm {
  provider: VoucherProvider;
  nome: string;
  codigo_sistema: string;
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
}

export interface WizardStep {
  id: number;
  label: string;
  icon: ComponentType;
  description: string;
}
