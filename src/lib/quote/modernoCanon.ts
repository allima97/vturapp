/**
 * Estilo "Moderno" canônico — fonte única de CSS para os PDFs de
 * Orçamento (Proposta de Viagem) e Roteiro Personalizado.
 *
 * Deve ser injetado no FIM do <style> de cada documento, para prevalecer
 * sobre as regras rot3-* legadas (mesma especificidade, declarado depois).
 * Cores: tokens do sistema (#1B2C80 navy, #4472C4 azul médio, #9AAAC2 borda,
 * #C5CED9 divisória, #EEF2F7 cor única de fundo de blocos, cabeçalhos,
 * etiquetas e chips, #D0DAEA linha sob títulos, #F7F9FC caixas de texto).
 */
export const MODERNO_CANON_CSS = `
/* ─── Moderno canônico ─────────────────────────────────────── */
.rot3-doc, .rot3-doc *, .rot3-secao, .rot3-secao *, .rot3-infos, .rot3-infos * { -webkit-print-color-adjust: exact; print-color-adjust: exact; }
.rot3-doc { font-family: Arial, Helvetica, sans-serif; }
.rot3-secao { font-family: Arial, Helvetica, sans-serif; }

/* Cabeçalho */
.rot3-kicker-bar { width: 210px; height: 3px; display: flex; overflow: hidden; margin: 0 auto 12px; border-radius: 0; }
.rot3-kicker-bar span:first-child, .rot3-kicker-bar span:nth-child(2), .rot3-kicker-bar span:last-child { flex: 1; }
.rot3-kicker-bar span:first-child { background: #1B2C80; }
.rot3-kicker-bar span:nth-child(2) { background: #4472C4; }
.rot3-kicker-bar span:nth-child(3) { background: #9AAAC2; }
.rot3-kicker { font-size: 9pt; font-weight: bold; letter-spacing: 3px; text-transform: uppercase; color: #4472C4; text-align: center; margin-bottom: 6px; }
.rot3-title { font-size: 24pt; font-weight: bold; color: #1B2C80; margin: 0 0 8px; line-height: 1.15; text-align: center; letter-spacing: .3px; }
.rot3-para { font-size: 10.5pt; color: #374151; margin: 0 0 8px; text-align: center; }
.rot3-para b, .rot3-para strong { color: #1F2937; font-weight: bold; }
.rot3-meta { font-size: 9.5pt; color: #4B5563; margin: 0 0 22px; text-align: center; }
.rot3-meta b { color: #1F2937; font-weight: bold; }
.rot3-meta .rot3-meta-val { color: #4B5563; font-weight: normal; }
.rot3-meta svg { color: #4B5563; }
.rot3-meta-sep { color: #6B7280; margin: 0 8px; }

/* Bloco resumo / cidades (+ CTA) */
.rot3-bloco { background: #EEF2F7; border: 1px solid #9AAAC2; border-radius: 10px; padding: 16px 20px 14px; margin: 0 0 18px; text-align: center; break-inside: avoid; }
.rot3-bloco-label { font-size: 9pt; font-weight: bold; letter-spacing: 2px; text-transform: uppercase; color: #1B2C80; margin-bottom: 10px; text-align: center; }
.rot3-rota { font-size: 11pt; font-weight: bold; color: #1F2937; line-height: 1.5; text-align: center; }
.rot3-rota-sep { color: #4472C4; margin: 0 8px; font-weight: normal; }

/* Títulos de seção */
.rot3-secao { margin: 26px 0 0; }
.rot3-secao-titulo, .rot3-itin-titulo, .rot3-cronograma-titulo { font-size: 13pt; font-weight: bold; letter-spacing: 1.5px; text-transform: uppercase; color: #1B2C80; border-bottom: 3px solid #D0DAEA; padding-bottom: 8px; margin: 0 0 14px; text-align: center; }
.rot3-itin, .rot3-cronograma { margin: 0 0 20px; }
.rot3-secao-titulo, .rot3-itin-titulo, .rot3-cronograma-titulo, .rot3-grupo-header, .rot3-hotel-header-row { break-after: avoid; page-break-after: avoid; }
.rot3-dgrupo > .rot3-grupo-header + .rot3-row { break-before: avoid; page-break-before: avoid; }

/* Linha do tempo (itinerário / cronograma) */
.rot3-dia { display: flex; gap: 0; margin: 0; align-items: stretch; break-inside: avoid; page-break-inside: avoid; }
.rot3-dia-pill-col { width: 136px; flex-shrink: 0; padding: 0; }
.rot3-dia-pill, .rot3-oc-pill { display: block; width: 128px; background: #EEF2F7; border: 1px solid #9AAAC2; border-radius: 6px; padding: 7px 6px 6px; font-size: 8.5pt; font-weight: bold; color: #1F2937; text-align: center; line-height: 1.45; white-space: normal; letter-spacing: 0; }
.rot3-dia-mid { position: relative; display: block; width: 64px; flex-shrink: 0; padding: 0; }
.rot3-dia-mid::after { content: ''; position: absolute; top: 0; bottom: 0; left: 43px; width: 1.5px; background: #9AAAC2; }
.rot3-dia-dot { position: absolute; left: 18px; top: 9px; width: 12px; height: 12px; border-radius: 50%; background: #1B2C80; border: 1.5px solid #1B2C80; box-shadow: inset 0 0 0 2px #fff; }
.rot3-dia-line { display: none; }
.rot3-dia-body { flex: 1; min-width: 0; border: 1px solid #9AAAC2; border-radius: 8px; padding: 12px 14px; background: #fff; margin: 0 0 12px; }
.rot3-dia-head { display: flex; justify-content: space-between; align-items: flex-start; gap: 10px; margin-bottom: 5px; }
.rot3-dia-rota { font-size: 10.5pt; font-weight: bold; color: #1B2C80; margin: 0 0 5px; line-height: 1.35; }
.rot3-dia-head .rot3-dia-rota { margin: 0; }
.rot3-dia-chip { flex-shrink: 0; border: 1px solid #9AAAC2; background: #EEF2F7; border-radius: 4px; padding: 3px 7px; font-size: 7.5pt; font-weight: bold; color: #1B2C80; text-transform: uppercase; white-space: nowrap; letter-spacing: .3px; }
.rot3-dia-desc { margin: 0; font-size: 9pt; color: #374151; line-height: 1.6; }
.rot3-dia-desc b { color: #1F2937; }

/* Tabelas de 3 colunas (passagem, hotéis, detalhamento) */
.rot3-tabela { border: 1px solid #9AAAC2; border-radius: 8px; overflow: hidden; background: #fff; margin-bottom: 16px; }
.rot3-grupo-header, .rot3-hotel-header-row { background: #EEF2F7; color: #1B2C80; font-size: 9.5pt; font-weight: bold; letter-spacing: 0; text-transform: none; padding: 9px 14px; border-bottom: 1px solid #9AAAC2; }
.rot3-hotel-header-row { display: flex; gap: 12px; }
.rot3-row { display: flex; gap: 12px; padding: 10px 14px; border-bottom: 1px solid #C5CED9; break-inside: avoid; page-break-inside: avoid; }
.rot3-tabela .rot3-row:last-child { border-bottom: none; }
.rot3-c1, .rot3-hotel-header-row > div:nth-child(1) { flex: 1.05; min-width: 0; }
.rot3-c2, .rot3-hotel-header-row > div:nth-child(2) { flex: 1.15; min-width: 0; }
.rot3-c3, .rot3-hotel-header-row > div:nth-child(3) { flex: .8; min-width: 0; }
.rot3-t { font-size: 9.5pt; font-weight: bold; color: #1B2C80; line-height: 1.4; }
.rot3-s { font-size: 8.5pt; color: #4B5563; line-height: 1.45; margin-top: 2px; }
.rot3-s b { color: #1B2C80; }
.rot3-a { font-size: 8.5pt; color: #4472C4; font-weight: bold; margin-top: 2px; }
.rot3-t + .rot3-t { margin-top: 6px; }
.rot3-s + .rot3-t { margin-top: 6px; }
.rot3-qtd { display: inline-block; margin-top: 5px; background: #EEF2F7; border: 1px solid #9AAAC2; border-radius: 4px; padding: 1px 5px; font-size: 7.5pt; font-weight: bold; color: #1B2C80; }
.rot3-chk { font-size: 8.5pt; font-weight: bold; color: #1B2C80; line-height: 1.55; }
.rot3-chk::before { content: '\\2713'; margin-right: 5px; }

/* Passeios opcionais / Formas de pagamento (roteiro) */
.rot3-t--escuro { color: #1F2937; }
.rot3-tabela--opc .rot3-c1, .rot3-tabela--opc .rot3-hotel-header-row > div:nth-child(1) { flex: .8; }
.rot3-tabela--opc .rot3-c2, .rot3-tabela--opc .rot3-hotel-header-row > div:nth-child(2) { flex: 2.1; }
.rot3-tabela--opc .rot3-c3, .rot3-tabela--opc .rot3-hotel-header-row > div:nth-child(3) { flex: .75; }
.rot3-tabela--pag .rot3-c1, .rot3-tabela--pag .rot3-hotel-header-row > div:nth-child(1) { flex: 1.05; }
.rot3-tabela--pag .rot3-c2, .rot3-tabela--pag .rot3-hotel-header-row > div:nth-child(2) { flex: 1.5; }
.rot3-tabela--pag .rot3-c3, .rot3-tabela--pag .rot3-hotel-header-row > div:nth-child(3) { flex: .85; }
.rot3-tabela--passeios .rot3-c1, .rot3-tabela--passeios .rot3-hotel-header-row > div:nth-child(1) { flex: .7; }
.rot3-tabela--passeios .rot3-c2, .rot3-tabela--passeios .rot3-hotel-header-row > div:nth-child(2) { flex: 1.6; }
.rot3-tabela--passeios .rot3-c3, .rot3-tabela--passeios .rot3-hotel-header-row > div:nth-child(3) { flex: .8; }
.rot3-obs { border: 1px solid #C5CED9; border-radius: 8px; background: #F7F9FC; padding: 10px 14px; font-size: 8.5pt; color: #374151; line-height: 1.55; margin: 0 0 16px; break-inside: avoid; }
.rot3-obs b { color: #1F2937; }

/* Detalhamento do orçamento: faixas de grupo sem moldura lateral */
.rot3-dgrupo { margin: 0 0 18px; }
.rot3-dgrupo > .rot3-grupo-header { border: none; border-radius: 8px 8px 0 0; }
.rot3-dgrupo > .rot3-row { padding-left: 14px; padding-right: 14px; }

/* Investimento (orçamento) */
.rot3-inv { border: 1px solid #9AAAC2; border-radius: 10px; overflow: hidden; background: #fff; margin: 0 0 16px; break-inside: avoid; page-break-inside: avoid; }
.rot3-inv-head { background: #EEF2F7; color: #1B2C80; text-align: center; font-size: 11pt; font-weight: bold; letter-spacing: 2px; padding: 10px; border-bottom: 1px solid #9AAAC2; }
.rot3-inv-cols { display: flex; }
.rot3-inv .rot3-inv-col { flex: 1; padding: 18px 16px 16px; text-align: center; }
.rot3-inv .rot3-inv-divider { width: 1px; background: #C5CED9; flex-shrink: 0; }
.rot3-inv .rot3-inv-label { display: flex; justify-content: center; align-items: center; gap: 6px; font-size: 9.5pt; font-weight: bold; letter-spacing: 1px; text-transform: uppercase; color: #1B2C80; margin-bottom: 8px; }
.rot3-inv .rot3-inv-col--pessoa .rot3-inv-label { color: #4472C4; }
.rot3-inv .rot3-inv-valor { font-family: Arial, Helvetica, sans-serif; font-size: 20pt; font-weight: bold; color: #1B2C80; line-height: 1.2; }
.rot3-inv .rot3-inv-sub { font-size: 8.5pt; color: #4B5563; margin-top: 6px; }
.rot3-inv-foot { display: flex; justify-content: center; align-items: center; gap: 6px; border-top: 1px solid #C5CED9; background: #F7F9FC; padding: 9px 14px; text-align: center; font-size: 8.5pt; font-weight: bold; color: #1F2937; }

/* Informações importantes */
.rot3-infos { border: 1px solid #C5CED9; border-left: 4px solid #1B2C80; border-radius: 8px; background: #F7F9FC; padding: 12px 18px 12px 16px; margin: 0 0 16px; break-inside: avoid; }
.rot3-infos-titulo { font-size: 9.5pt; font-weight: bold; letter-spacing: 1px; text-transform: uppercase; color: #1B2C80; margin-bottom: 8px; }
.rot3-infos ul { margin: 0; padding-left: 18px; }
.rot3-infos li { font-size: 8.5pt; color: #1F2937; line-height: 1.5; margin-bottom: 4px; }
.rot3-infos img { max-width: 100%; margin-top: 8px; border-radius: 6px; }

.rot3-doc-footer { margin-top: 24px; padding-top: 8px; border-top: none; font-size: 8pt; color: #6B7280; }

/* Cor única de realce (#EEF2F7): cabeçalhos das tabelas, bloco de resumo,
   etiquetas de dia/data e chips. */
.rot3-bloco, .rot3-dia-pill, .rot3-oc-pill, .rot3-dia-chip, .rot3-qtd { background: #EEF2F7; }

/* Impressão: tabela não se parte entre páginas (vai inteira para a próxima,
   levando o título junto). Se for maior que uma página, cada pedaço fecha a
   própria moldura em vez de ficar aberto. */
.rot3-tabela, .rot3-dgrupo { break-inside: avoid; page-break-inside: avoid; }
.rot3-tabela { -webkit-box-decoration-break: clone; box-decoration-break: clone; }

/* Tabelas sem moldura (mesmo estilo do detalhamento do Orçamento): faixa de
   cabeçalho arredondada em cima e linhas separadas por um traço embaixo. */
.rot3-tabela { border: none; border-radius: 0; overflow: visible; background: transparent; }
.rot3-tabela > .rot3-grupo-header, .rot3-tabela > .rot3-hotel-header-row { border: none; border-radius: 8px 8px 0 0; }
.rot3-tabela > .rot3-grupo-header ~ .rot3-grupo-header { margin-top: 18px; }
.rot3-tabela .rot3-row:last-child { border-bottom: 1px solid #C5CED9; }
`;

/** Lista de itens com ✓ (texto já escapado). */
export function rot3ChecksHtml(escaped: string[]): string {
  return escaped.filter(Boolean).map((s) => `<div class="rot3-chk">${s}</div>`).join('');
}

/** Separador "•" do cabeçalho/meta. */
export const ROT3_META_SEP = '<span class="rot3-meta-sep">•</span>';
