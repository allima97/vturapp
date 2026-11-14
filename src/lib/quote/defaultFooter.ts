export const defaultQuoteFooter = {
  exchange:
    'Preços em real (R$) convertido ao câmbio do dia sujeito a alteração e disponibilidade da tarifa.',
  children:
    'Valor da criança válido somente quando acompanhada de dois adultos pagantes no mesmo apartamento.',
  estimate: 'Este orçamento é apenas uma tomada de preço.',
  reservations:
    'Os serviços citados não estão reservados; a compra somente poderá ser confirmada após a confirmação dos fornecedores.',
  fares:
    'Este orçamento foi feito com base na menor tarifa para os serviços solicitados, podendo sofrer alteração devido à disponibilidade de lugares no ato da compra.'
} as const;

export const defaultQuoteFooterText = Object.values(defaultQuoteFooter).join('\n');
