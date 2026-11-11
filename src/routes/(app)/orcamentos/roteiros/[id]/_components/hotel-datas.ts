import { diffDaysISODate } from '$lib/date';
import type { RotHotel } from './tipos';

export function atualizarDataHotel(
  hotel: RotHotel,
  field: 'data_inicio' | 'data_fim',
  value: string
) {
  hotel[field] = value;
  if (!hotel.data_inicio || !hotel.data_fim) return;
  const noites = diffDaysISODate(hotel.data_inicio, hotel.data_fim);
  if (noites !== null && noites > 0) hotel.noites = noites;
}
