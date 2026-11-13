export function formatarDataPassagem(value: string | null | undefined, completa = false) {
  const match = /^(\d{4})-(\d{2})-(\d{2})/.exec(value || '');
  if (!match) return value || 'Não informada';
  const date = new Date(Date.UTC(Number(match[1]), Number(match[2]) - 1, Number(match[3])));
  return new Intl.DateTimeFormat('pt-BR', {
    timeZone: 'UTC',
    ...(completa ? { weekday: 'long' as const } : {}),
    day: '2-digit',
    month: completa ? ('long' as const) : ('short' as const),
    year: 'numeric'
  }).format(date);
}
