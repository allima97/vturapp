import { describe, expect, it } from 'vitest';
import { strToU8, zipSync } from 'fflate';
import { parseConciliacaoImportFile } from './importParser';

function xmlEscape(value: unknown) {
  return String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function columnName(index: number) {
  let column = '';
  let value = index + 1;
  while (value > 0) {
    const remainder = (value - 1) % 26;
    column = String.fromCharCode(65 + remainder) + column;
    value = Math.floor((value - 1) / 26);
  }
  return column;
}

function createXlsxBuffer(rows: unknown[][]): ArrayBuffer {
  const sheetRows = rows
    .map((row, rowIndex) => {
      const cells = (row || [])
        .map((cell, colIndex) => {
          const ref = `${columnName(colIndex)}${rowIndex + 1}`;
          if (typeof cell === 'number') return `<c r="${ref}"><v>${cell}</v></c>`;
          return `<c r="${ref}" t="inlineStr"><is><t>${xmlEscape(cell)}</t></is></c>`;
        })
        .join('');
      return `<row r="${rowIndex + 1}">${cells}</row>`;
    })
    .join('');

  const files = {
    '[Content_Types].xml': `<?xml version="1.0" encoding="UTF-8"?>
      <Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">
        <Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>
        <Default Extension="xml" ContentType="application/xml"/>
        <Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/>
        <Override PartName="/xl/worksheets/sheet1.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/>
      </Types>`,
    '_rels/.rels': `<?xml version="1.0" encoding="UTF-8"?>
      <Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
        <Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="xl/workbook.xml"/>
      </Relationships>`,
    'xl/workbook.xml': `<?xml version="1.0" encoding="UTF-8"?>
      <workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships">
        <sheets><sheet name="Movimento" sheetId="1" r:id="rId1"/></sheets>
      </workbook>`,
    'xl/_rels/workbook.xml.rels': `<?xml version="1.0" encoding="UTF-8"?>
      <Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
        <Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet1.xml"/>
      </Relationships>`,
    'xl/worksheets/sheet1.xml': `<?xml version="1.0" encoding="UTF-8"?>
      <worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main">
        <sheetData>${sheetRows}</sheetData>
      </worksheet>`
  };

  const zipped = zipSync(
    Object.fromEntries(Object.entries(files).map(([name, text]) => [name, strToU8(text)]))
  );
  const copy = new Uint8Array(zipped.byteLength);
  copy.set(zipped);
  return copy.buffer;
}

describe('parseConciliacaoImportFile', () => {
  it('preserves BR money values from HTML .xls exports', async () => {
    const html = `
      <table>
        <tr>
          <th>DOCUMENTO</th>
          <th>DESCRICAO</th>
          <th>LANCAMENTOS</th>
          <th>TAXAS</th>
          <th>DESCONTOS</th>
          <th>ABATIMENTOS</th>
          <th>CALCULADA LOJA</th>
          <th>REPASSADA</th>
          <th>VISAO MASTER</th>
          <th>&nbsp;</th>
          <th>&nbsp;</th>
          <th>OPFAX</th>
          <th>SALDO</th>
        </tr>
        <tr>
          <td>5630-0000084046</td>
          <td>BAIXA DE RECIBO</td>
          <td><div align="right">22.356,00</div></td>
          <td><div align="right">2.700,00</div></td>
          <td>0,00</td>
          <td>0,00</td>
          <td><a href="#">1.867,32</a></td>
          <td>0,00</td>
          <td>1.867,32</td>
          <td>0,00</td>
          <td>0,00</td>
          <td>0,00</td>
          <td>1.867,32</td>
        </tr>
      </table>
    `;
    const file = new File([html], 'extrato_movimento.xls', { type: 'application/vnd.ms-excel' });

    const parsed = await parseConciliacaoImportFile(file);
    const row = parsed.linhas[0];

    expect(row.documento).toBe('5630-0000084046');
    expect(row.valor_lancamentos).toBe(22356);
    expect(row.valor_taxas).toBe(2700);
    expect(row.valor_calculada_loja).toBe(1867.32);
  });

  it('reads movimento date when an Excel export puts the date in the next cell', async () => {
    const rows = [
      ['Movimentação do Dia:', '18/02/2026'],
      [],
      [
        'DOCUMENTO',
        'DESCRICAO',
        'LANCAMENTOS',
        'TAXAS',
        'DESCONTOS',
        'ABATIMENTOS',
        'CALCULADA LOJA',
        'REPASSADA',
        'VISAO MASTER',
        '',
        '',
        'OPFAX',
        'SALDO'
      ],
      ['5630-0000084046', 'BAIXA DE RECIBO', 22356, 2700, 0, 0, 1867.32, 0, 1867.32, 0, 0, 0, 1867.32]
    ];
    const buffer = createXlsxBuffer(rows);
    const file = new File([buffer], 'extrato_movimento.xlsx', {
      type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
    });

    const parsed = await parseConciliacaoImportFile(file);

    expect(parsed.movimentoData).toBe('2026-02-18');
    expect(parsed.linhas[0].movimento_data).toBe('2026-02-18');
  });
});
