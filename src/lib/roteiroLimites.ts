export const LIMITES_ROTEIRO = {
  dias: { limite: 100, nome: 'dias' },
  hoteis: { limite: 100, nome: 'hotéis' },
  passeios: { limite: 100, nome: 'passeios' },
  transportes: { limite: 100, nome: 'transportes' },
  investimentos: { limite: 50, nome: 'investimentos' },
  pagamentos: { limite: 50, nome: 'pagamentos' }
} as const;

export function validarLimitesRoteiro(body: Record<string, unknown>): string | null {
  for (const [campo, { limite, nome }] of Object.entries(LIMITES_ROTEIRO)) {
    const registros = body[campo];
    if (Array.isArray(registros) && registros.length > limite)
      return `Este roteiro excede o limite de ${limite} ${nome} para edição.`;
  }
  return null;
}
