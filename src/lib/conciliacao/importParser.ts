import { strFromU8, unzipSync } from 'fflate';
import type { ConciliacaoLinhaInput } from '../../routes/api/v1/conciliacao/_types';

const MAX_IMPORT_FILE_BYTES = 8 * 1024 * 1024;
const MAX_EXCEL_FILE_BYTES = 4 * 1024 * 1024;
const MAX_SPREADSHEET_SHEETS = 8;
const MAX_SPREADSHEET_ROWS = 6000;
const MAX_SPREADSHEET_COLUMNS = 80;
const MAX_SPREADSHEET_CELL_CHARS = 500;

const HEADER_ALIASES: Record<string, keyof ConciliacaoLinhaInput> = {
  documento: 'documento',
  recibo: 'documento',
  numero_recibo: 'documento',
  numero: 'documento',
  movimento_data: 'movimento_data',
  data: 'movimento_data',
  data_movimento: 'movimento_data',
  status: 'status',
  descricao: 'descricao',
  historico: 'descricao',
  valor_lancamentos: 'valor_lancamentos',
  valor_lancamento: 'valor_lancamentos',
  valor: 'valor_lancamentos',
  valor_taxas: 'valor_taxas',
  taxas: 'valor_taxas',
  valor_descontos: 'valor_descontos',
  descontos: 'valor_descontos',
  valor_abatimentos: 'valor_abatimentos',
  abatimentos: 'valor_abatimentos',
  valor_nao_comissionavel: 'valor_nao_comissionavel',
  nao_comissionavel: 'valor_nao_comissionavel',
  valor_calculada_loja: 'valor_calculada_loja',
  calculada_loja: 'valor_calculada_loja',
  valor_visao_master: 'valor_visao_master',
  visao_master: 'valor_visao_master',
  valor_opfax: 'valor_opfax',
  opfax: 'valor_opfax',
  valor_saldo: 'valor_saldo',
  saldo: 'valor_saldo',
  valor_comissao_loja: 'valor_comissao_loja',
  comissao_loja: 'valor_comissao_loja',
  percentual_comissao_loja: 'percentual_comissao_loja',
  percentual_loja: 'percentual_comissao_loja',
  faixa_comissao: 'faixa_comissao',
  origem: 'origem'
};

type ParsedImportResult = {
  linhas: ConciliacaoLinhaInput[];
  ignored: number;
};

type ParsedImportFileResult = ParsedImportResult & {
  text: string;
  movimentoData: string | null;
};

type XlsxSheet = {
  name: string;
  rows: unknown[][];
};

function normalizeHeader(value: string) {
  return String(value || '')
    .trim()
    .normalize('NFD')
    .replace(/\p{Diacritic}/gu, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '');
}

function parseMoney(value: unknown): number | null {
  if (typeof value === 'number') {
    return Number.isFinite(value) ? value : null;
  }

  const raw = String(value ?? '').trim();
  if (!raw) return null;

  const cleaned = raw
    .replace(/\s+/g, '')
    .replace(/R\$/gi, '')
    .replace(/\.(?=\d{3}(\D|$))/g, '')
    .replace(',', '.');

  const parsed = Number(cleaned);
  return Number.isFinite(parsed) ? parsed : null;
}

function decodeHtmlEntities(value: string) {
  return String(value || '')
    .replace(/&nbsp;/gi, ' ')
    .replace(/&amp;/gi, '&')
    .replace(/&lt;/gi, '<')
    .replace(/&gt;/gi, '>')
    .replace(/&quot;/gi, '"')
    .replace(/&#39;/g, "'")
    .replace(/&#(\d+);/g, (_, code) => String.fromCharCode(Number(code)));
}

function htmlCellText(value: string) {
  return decodeHtmlEntities(
    String(value || '')
      .replace(/<script[\s\S]*?<\/script>/gi, ' ')
      .replace(/<style[\s\S]*?<\/style>/gi, ' ')
      .replace(/<[^>]+>/g, ' ')
  )
    .replace(/\s+/g, ' ')
    .trim();
}

function extractHtmlTableRows(text: string) {
  if (!/<table[\s>]|<tr[\s>]/i.test(text)) return [];

  const rows: string[][] = [];
  const rowMatches = String(text || '').matchAll(/<tr\b[\s\S]*?<\/tr>/gi);
  for (const rowMatch of rowMatches) {
    if (rows.length >= MAX_SPREADSHEET_ROWS) {
      throw new Error(`Planilha muito extensa. Limite máximo: ${MAX_SPREADSHEET_ROWS} linhas.`);
    }
    const rowHtml = rowMatch[0];
    const cells = Array.from(rowHtml.matchAll(/<t[dh]\b[\s\S]*?<\/t[dh]>/gi)).map((cellMatch) =>
      htmlCellText(cellMatch[0])
    ).slice(0, MAX_SPREADSHEET_COLUMNS).map((cell) => cell.slice(0, MAX_SPREADSHEET_CELL_CHARS));
    if (cells.some((cell) => cell.trim())) rows.push(cells);
  }

  return rows;
}

function normalizeSpreadsheetRows(rows: unknown[][], context = 'planilha') {
  if (rows.length > MAX_SPREADSHEET_ROWS) {
    throw new Error(`${context} muito extensa. Limite máximo: ${MAX_SPREADSHEET_ROWS} linhas.`);
  }

  return rows.map((row) =>
    (Array.isArray(row) ? row : [])
      .slice(0, MAX_SPREADSHEET_COLUMNS)
      .map((cell) =>
        typeof cell === 'string'
          ? cell.slice(0, MAX_SPREADSHEET_CELL_CHARS)
          : cell
      )
  );
}

function parseXmlAttributes(value: string) {
  const attrs: Record<string, string> = {};
  for (const match of String(value || '').matchAll(/([\w:.-]+)\s*=\s*"([^"]*)"/g)) {
    attrs[match[1]] = decodeHtmlEntities(match[2]);
  }
  return attrs;
}

function extractXmlTextTags(value: string) {
  return Array.from(String(value || '').matchAll(/<t\b[^>]*>([\s\S]*?)<\/t>/g))
    .map((match) => decodeHtmlEntities(match[1]))
    .join('');
}

function parseSharedStrings(xml: string) {
  return Array.from(String(xml || '').matchAll(/<si\b[\s\S]*?<\/si>/g)).map((match) =>
    extractXmlTextTags(match[0]).slice(0, MAX_SPREADSHEET_CELL_CHARS)
  );
}

function resolveZipPath(baseDir: string, target: string) {
  const rawTarget = String(target || '').trim();
  const raw = rawTarget.startsWith('/') ? rawTarget.slice(1) : `${baseDir}/${rawTarget}`;
  const parts: string[] = [];
  for (const part of raw.split('/')) {
    if (!part || part === '.') continue;
    if (part === '..') {
      parts.pop();
      continue;
    }
    parts.push(part);
  }
  return parts.join('/');
}

function parseWorkbookSheetTargets(workbookXml: string, relsXml: string) {
  const rels = new Map<string, string>();
  for (const relMatch of String(relsXml || '').matchAll(/<Relationship\b([^>]*)\/?>/g)) {
    const attrs = parseXmlAttributes(relMatch[1]);
    if (attrs.Id && attrs.Target) {
      rels.set(attrs.Id, resolveZipPath('xl', attrs.Target));
    }
  }

  return Array.from(String(workbookXml || '').matchAll(/<sheet\b([^>]*)\/?>/g))
    .slice(0, MAX_SPREADSHEET_SHEETS)
    .map((sheetMatch, index) => {
      const attrs = parseXmlAttributes(sheetMatch[1]);
      return {
        name: attrs.name || `Planilha ${index + 1}`,
        path: rels.get(attrs['r:id']) || `xl/worksheets/sheet${index + 1}.xml`
      };
    });
}

function columnNameToIndex(name: string) {
  let index = 0;
  for (const char of String(name || '').toUpperCase()) {
    const code = char.charCodeAt(0);
    if (code < 65 || code > 90) continue;
    index = index * 26 + (code - 64);
  }
  return Math.max(0, index - 1);
}

function parseXlsxCellValue(cellBody: string, type: string, sharedStrings: string[]) {
  if (type === 'inlineStr') {
    return extractXmlTextTags(cellBody).slice(0, MAX_SPREADSHEET_CELL_CHARS);
  }

  const value = decodeHtmlEntities(String(cellBody || '').match(/<v\b[^>]*>([\s\S]*?)<\/v>/)?.[1] || '');
  if (type === 's') {
    const index = Number(value);
    return Number.isInteger(index) ? sharedStrings[index] || '' : '';
  }
  if (type === 'str') return value.slice(0, MAX_SPREADSHEET_CELL_CHARS);
  if (type === 'b') return value === '1';

  const numeric = Number(value);
  if (value !== '' && Number.isFinite(numeric)) return numeric;
  return value.slice(0, MAX_SPREADSHEET_CELL_CHARS);
}

function parseXlsxSheetRows(xml: string, sharedStrings: string[]) {
  const rows: unknown[][] = [];
  for (const rowMatch of String(xml || '').matchAll(/<row\b[^>]*>([\s\S]*?)<\/row>/g)) {
    if (rows.length >= MAX_SPREADSHEET_ROWS) {
      throw new Error(`Planilha muito extensa. Limite máximo: ${MAX_SPREADSHEET_ROWS} linhas.`);
    }

    const cells: unknown[] = [];
    let nextIndex = 0;
    for (const cellMatch of rowMatch[1].matchAll(/<c\b([^>]*?)(?:\/>|>([\s\S]*?)<\/c>)/g)) {
      const attrs = parseXmlAttributes(cellMatch[1]);
      const ref = String(attrs.r || '');
      const colLetters = ref.match(/[A-Z]+/i)?.[0] || '';
      const colIndex = colLetters ? columnNameToIndex(colLetters) : nextIndex;
      nextIndex = colIndex + 1;
      if (colIndex >= MAX_SPREADSHEET_COLUMNS) continue;
      cells[colIndex] = parseXlsxCellValue(cellMatch[2] || '', attrs.t || '', sharedStrings);
    }

    rows.push(cells);
  }
  return normalizeSpreadsheetRows(rows, 'Planilha XLSX');
}

function rowsToDelimitedText(rows: unknown[][]) {
  return rows
    .map((row) =>
      row
        .map((cell) => {
          const value = String(cell ?? '');
          const escaped = value.replace(/"/g, '""');
          return /[;"\n\r]/.test(value) ? `"${escaped}"` : value;
        })
        .join(';')
    )
    .join('\n');
}

async function readXlsxWorkbook(file: File) {
  const buffer = await file.arrayBuffer();
  const zip = unzipSync(new Uint8Array(buffer), {
    filter(fileInfo) {
      const name = fileInfo.name.replace(/^\/+/, '');
      const isAllowed =
        name === 'xl/workbook.xml' ||
        name === 'xl/_rels/workbook.xml.rels' ||
        name === 'xl/sharedStrings.xml' ||
        name.startsWith('xl/worksheets/');
      return isAllowed && fileInfo.originalSize <= 5 * 1024 * 1024;
    }
  });

  const entryText = (name: string) => {
    const entry = zip[name];
    return entry ? strFromU8(entry) : '';
  };

  const workbookXml = entryText('xl/workbook.xml');
  if (!workbookXml) throw new Error('Planilha XLSX inválida: workbook ausente.');

  const sheetTargets = parseWorkbookSheetTargets(workbookXml, entryText('xl/_rels/workbook.xml.rels'));
  if (sheetTargets.length > MAX_SPREADSHEET_SHEETS) {
    throw new Error(`Planilha com abas demais. Limite máximo: ${MAX_SPREADSHEET_SHEETS} abas.`);
  }

  const sharedStrings = parseSharedStrings(entryText('xl/sharedStrings.xml'));
  const sheets: XlsxSheet[] = sheetTargets
    .map((sheet) => {
      const sheetXml = entryText(sheet.path);
      return {
        name: sheet.name,
        rows: sheetXml ? parseXlsxSheetRows(sheetXml, sharedStrings) : []
      };
    })
    .filter((sheet) => sheet.rows.length > 0);

  return { sheets };
}

function parseDate(value: unknown, fallbackDate?: string | null) {
  const raw = String(value ?? '').trim();
  if (!raw) return fallbackDate || null;
  if (/^\d{4}-\d{2}-\d{2}$/.test(raw)) return raw;

  const br = raw.match(/^(\d{2})\/(\d{2})\/(\d{4})$/);
  if (br) return `${br[3]}-${br[2]}-${br[1]}`;

  return fallbackDate || null;
}

function inferStatus(value: unknown): ConciliacaoLinhaInput['status'] {
  const raw = String(value ?? '').toUpperCase();
  if (raw.includes('ESTORNO')) return 'ESTORNO';
  if (raw.includes('BAIXA')) return 'BAIXA';
  if (raw.includes('OPFAX')) return 'OPFAX';
  return 'OUTRO';
}

function parseMovimentoDateFromTxt(text: string): string | null {
  const raw = String(text || '');
  const br = raw.match(
    /(?:Movimenta[cç][aã]o|Movimento|Data\s+Movimento)\s*(?:(?:do\s+)?Dia)?\s*:?\s*(\d{1,2})[\/.-](\d{1,2})[\/.-](\d{2,4})/i
  );
  if (br) {
    const day = br[1].padStart(2, '0');
    const month = br[2].padStart(2, '0');
    const year = br[3].length === 2 ? `20${br[3]}` : br[3];
    return `${year}-${month}-${day}`;
  }

  const iso = raw.match(
    /(?:Movimenta[cç][aã]o|Movimento|Data\s+Movimento)\s*(?:(?:do\s+)?Dia)?\s*:?\s*(\d{4})-(\d{2})-(\d{2})/i
  );
  if (!iso) return null;
  return `${iso[1]}-${iso[2]}-${iso[3]}`;
}

const MONTH_PT: Record<string, string> = {
  jan: '01',
  fev: '02',
  mar: '03',
  abr: '04',
  mai: '05',
  jun: '06',
  jul: '07',
  ago: '08',
  set: '09',
  out: '10',
  nov: '11',
  dez: '12'
};

function parseMovimentoDateFromFileName(fileName: string): string | null {
  const raw = String(fileName || '');
  const numeric = raw.match(/(\d{1,2})-(\d{2})-(\d{2,4})/);
  if (numeric) {
    const day = numeric[1].padStart(2, '0');
    const year = numeric[3].length === 2 ? `20${numeric[3]}` : numeric[3];
    return `${year}-${numeric[2]}-${day}`;
  }

  const shortMonth = raw.match(/(\d{1,2})-([a-z\u00e0-\u00fc]{2,4})-(\d{2,4})/i);
  if (!shortMonth) return null;
  const month = MONTH_PT[shortMonth[2].toLowerCase().slice(0, 3)];
  if (!month) return null;
  const day = shortMonth[1].padStart(2, '0');
  const year = shortMonth[3].length === 2 ? `20${shortMonth[3]}` : shortMonth[3];
  return `${year}-${month}-${day}`;
}

function splitLine(line: string, delimiter: string) {
  if (delimiter === '\t') return line.split('\t');
  return line.split(delimiter).map((cell) => cell.replace(/^"|"$/g, '').trim());
}

function inferDelimiter(text: string) {
  if (text.includes('\t')) return '\t';
  if (text.includes(';')) return ';';
  return ',';
}

function resolveFooterLabel(...values: Array<unknown>) {
  for (const value of values) {
    const normalized = normalizeHeader(String(value ?? ''));
    if (normalized === 'subtotal') return 'SUBTOTAL';
    if (normalized === 'total') return 'TOTAL';
  }
  return null;
}

function parseConciliacaoTxtLayout(text: string, origem = 'arquivo', fallbackDate?: string | null): ParsedImportResult {
  const lines = String(text || '')
    .replace(/\r\n?/g, '\n')
    .split('\n')
    .map((line) => line.replace(/\t/g, ' '));

  const movimentoData = parseMovimentoDateFromTxt(text) || fallbackDate || null;
  let ignored = 0;
  const linhas: ConciliacaoLinhaInput[] = [];

  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed) continue;
    if (/^DOCUMENTO\b/i.test(trimmed)) continue;
    if (/^CALCULADA\s+TOTAL\b/i.test(trimmed)) continue;

    const parts = trimmed.split(/\s{2,}/).filter(Boolean);
    if (parts.length < 4) {
      ignored += 1;
      continue;
    }

    if (resolveFooterLabel(parts[0], parts[1])) continue;

    const documento = String(parts[0] || '').trim();
    if (!/^\d{4}-\d{6,14}\b/.test(documento)) {
      ignored += 1;
      continue;
    }

    const descricao = String(parts[1] || '').trim() || null;
    linhas.push({
      documento,
      movimento_data: movimentoData,
      status: inferStatus(descricao),
      descricao,
      valor_lancamentos: parseMoney(parts[2]),
      valor_taxas: parseMoney(parts[3]),
      valor_descontos: parseMoney(parts[4]),
      valor_abatimentos: parseMoney(parts[5]),
      valor_calculada_loja: parseMoney(parts[6]),
      valor_visao_master: parseMoney(parts[8]),
      valor_opfax: parseMoney(parts[11]),
      valor_saldo: parseMoney(parts[12]),
      valor_nao_comissionavel: null,
      origem
    });
  }

  return { linhas, ignored };
}

function toDelimitedText(linhas: ConciliacaoLinhaInput[]) {
  const header = [
    'documento',
    'movimento_data',
    'status',
    'descricao',
    'valor_lancamentos',
    'valor_taxas',
    'valor_descontos',
    'valor_abatimentos',
    'valor_nao_comissionavel',
    'valor_calculada_loja',
    'valor_visao_master',
    'valor_opfax',
    'valor_saldo'
  ];

  const rows = linhas.map((row) =>
    [
      row.documento,
      row.movimento_data || '',
      row.status || '',
      row.descricao || '',
      row.valor_lancamentos ?? '',
      row.valor_taxas ?? '',
      row.valor_descontos ?? '',
      row.valor_abatimentos ?? '',
      row.valor_nao_comissionavel ?? '',
      row.valor_calculada_loja ?? '',
      row.valor_visao_master ?? '',
      row.valor_opfax ?? '',
      row.valor_saldo ?? ''
    ]
      .map((value) => String(value).replace(/;/g, ','))
      .join(';')
  );

  return [header.join(';'), ...rows].join('\n');
}

function parseConciliacaoRowsLayout(
  rows: unknown[][],
  origem: string,
  fallbackDate?: string | null
): ParsedImportFileResult | null {
  const headerIndex = rows.findIndex((row) =>
    row.some((cell) => normalizeHeader(String(cell || '')).includes('documento'))
  );

  if (headerIndex < 0) return null;

  const flatText = rows
    .flat()
    .map((cell) => String(cell || '').trim())
    .join('\n');
  const movimentoData =
    parseMovimentoDateFromTxt(flatText) || parseMovimentoDateFromFileName(origem) || fallbackDate || null;

  const headerRow = (rows[headerIndex] || []).map((cell: unknown) => String(cell || '').trim());

  const colIndex = (needles: string[], fallback = -1) => {
    const wanted = needles.map((value: string) => normalizeHeader(value));
    const normalizedHeader = headerRow.map((value: string) => normalizeHeader(value));
    const index = normalizedHeader.findIndex((head: string) => wanted.some((needle) => head.includes(needle)));
    return index >= 0 ? index : fallback;
  };

  const cDocumento = colIndex(['documento'], 0);
  const cDescricao = colIndex(['descricao', 'descri'], 1);
  const cLancamentos = colIndex(['lancamentos', 'lanc'], 2);
  const cTaxas = colIndex(['taxas'], 3);
  const cDescontos = colIndex(['descontos', 'descont'], 4);
  const cAbatimentos = colIndex(['abatimentos', 'abat'], 5);
  const cCalculadaLoja = colIndex(['calculada loja', 'calcul'], 6);
  const cVisaoMaster = colIndex(['visao master', 'visao', 'vis'], 8);
  const cOpfax = colIndex(['opfax'], 11);
  const cSaldo = colIndex(['saldo'], 12);

  let ignored = 0;
  const linhas: ConciliacaoLinhaInput[] = [];

  for (let i = headerIndex + 1; i < rows.length; i += 1) {
    const row = rows[i] || [];
    const documento = String(row[cDocumento] || '').trim();
    const descricao = cDescricao >= 0 ? String(row[cDescricao] || '').trim() : '';
    if (resolveFooterLabel(documento, descricao)) continue;
    if (!documento) {
      ignored += 1;
      continue;
    }

    const pick = (index: number) => (index >= 0 ? parseMoney(row[index]) : null);

    linhas.push({
      documento,
      movimento_data: movimentoData,
      status: inferStatus(descricao),
      descricao: descricao || null,
      valor_lancamentos: pick(cLancamentos),
      valor_taxas: pick(cTaxas),
      valor_descontos: pick(cDescontos),
      valor_abatimentos: pick(cAbatimentos),
      valor_nao_comissionavel: null,
      valor_calculada_loja: pick(cCalculadaLoja),
      valor_visao_master: pick(cVisaoMaster),
      valor_opfax: pick(cOpfax),
      valor_saldo: pick(cSaldo),
      origem: `arquivo:${origem}`
    });
  }

  return {
    linhas,
    ignored,
    text: toDelimitedText(linhas),
    movimentoData
  };
}

async function parseConciliacaoXlsLayout(
  file: File,
  fallbackDate?: string | null
): Promise<ParsedImportFileResult> {
  const workbook = await readXlsxWorkbook(file);

  const sheets = workbook.sheets
    .map((sheet) => {
      const rows = normalizeSpreadsheetRows(sheet.rows, `Aba ${sheet.name}`);
      const headerIndex = rows.findIndex((row) =>
        row.some((cell) => normalizeHeader(String(cell || '')).includes('documento'))
      );
      return { rows, headerIndex };
    })
    .filter((sheet: { rows: unknown[][] }) => Array.isArray(sheet.rows) && sheet.rows.length > 0);

  const selected = sheets.find((sheet: { headerIndex: number }) => sheet.headerIndex >= 0) || null;
  if (!selected) {
    return {
      linhas: [],
      ignored: 0,
      text: '',
      movimentoData: parseMovimentoDateFromFileName(file.name) || fallbackDate || null
    };
  }

  const flatWorkbookText = sheets
    .flatMap((sheet: { rows: unknown[][] }) => sheet.rows)
    .flat()
    .map((cell: unknown) => String(cell || '').trim())
    .join('\n');

  const movimentoDateCell = flatWorkbookText
    .split('\n')
    .find((cell: string) => /(?:Movimenta[cç][aã]o|Movimento|Data\s+Movimento)/i.test(cell));

  const movimentoData =
    parseMovimentoDateFromTxt(flatWorkbookText) ||
    (movimentoDateCell ? parseMovimentoDateFromTxt(movimentoDateCell) : null) ||
    parseMovimentoDateFromFileName(file.name) ||
    fallbackDate ||
    null;

  const rows = selected.rows;
  const headerRow = (rows[selected.headerIndex] || []).map((cell: unknown) => String(cell || '').trim());

  const colIndex = (needles: string[], fallback = -1) => {
    const wanted = needles.map((value: string) => normalizeHeader(value));
    const normalizedHeader = headerRow.map((value: string) => normalizeHeader(value));
    const index = normalizedHeader.findIndex((head: string) => wanted.some((needle) => head.includes(needle)));
    return index >= 0 ? index : fallback;
  };

  const cDocumento = colIndex(['documento'], 0);
  const cDescricao = colIndex(['descricao', 'descri'], 1);
  const cLancamentos = colIndex(['lancamentos', 'lanc'], 2);
  const cTaxas = colIndex(['taxas'], 3);
  const cDescontos = colIndex(['descontos', 'descont'], 4);
  const cAbatimentos = colIndex(['abatimentos', 'abat'], 5);
  const cCalculadaLoja = colIndex(['calculada loja', 'calcul'], 6);
  const cVisaoMaster = colIndex(['visao master', 'visao', 'vis'], 8);
  const cOpfax = colIndex(['opfax'], 11);
  const cSaldo = colIndex(['saldo'], 12);

  let ignored = 0;
  const linhas: ConciliacaoLinhaInput[] = [];

  for (let i = selected.headerIndex + 1; i < rows.length; i += 1) {
    const row = rows[i] || [];
    const documento = String(row[cDocumento] || '').trim();
    const descricao = cDescricao >= 0 ? String(row[cDescricao] || '').trim() : '';
    if (resolveFooterLabel(documento, descricao)) continue;
    if (!documento) {
      ignored += 1;
      continue;
    }

    const pick = (index: number) => (index >= 0 ? parseMoney(row[index]) : null);

    linhas.push({
      documento,
      movimento_data: movimentoData,
      status: inferStatus(descricao),
      descricao: descricao || null,
      valor_lancamentos: pick(cLancamentos),
      valor_taxas: pick(cTaxas),
      valor_descontos: pick(cDescontos),
      valor_abatimentos: pick(cAbatimentos),
      valor_nao_comissionavel: null,
      valor_calculada_loja: pick(cCalculadaLoja),
      valor_visao_master: pick(cVisaoMaster),
      valor_opfax: pick(cOpfax),
      valor_saldo: pick(cSaldo),
      origem: `arquivo:${file.name}`
    });
  }

  return {
    linhas,
    ignored,
    text: toDelimitedText(linhas),
    movimentoData
  };
}

export function parseConciliacaoImportText(
  text: string,
  fallbackDate?: string | null
): ParsedImportResult {
  const txtLayout = parseConciliacaoTxtLayout(text, 'arquivo', fallbackDate);
  if (txtLayout.linhas.length > 0) {
    return txtLayout;
  }

  const lines = String(text || '')
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean);

  if (lines.length === 0) {
    return { linhas: [], ignored: 0 };
  }

  const delimiter = inferDelimiter(lines.join('\n'));
  const headerCells = splitLine(lines[0], delimiter).map(normalizeHeader);
  const mappedHeaders = headerCells.map((header) => HEADER_ALIASES[header] || null);

  let ignored = 0;
  const linhas = lines.slice(1).map((line) => {
    const cells = splitLine(line, delimiter);
    const row: ConciliacaoLinhaInput = {
      documento: '',
      movimento_data: fallbackDate || null
    };

    for (const [index, field] of mappedHeaders.entries()) {
      if (!field) continue;
      const value = cells[index];
      if (value == null || value === '') continue;

      switch (field) {
        case 'documento':
        case 'descricao':
        case 'faixa_comissao':
        case 'origem':
          row[field] = String(value).trim();
          break;
        case 'movimento_data':
          row.movimento_data = parseDate(value, fallbackDate);
          break;
        case 'status':
          row.status = inferStatus(value);
          break;
        default:
          row[field] = parseMoney(value) as never;
          break;
      }
    }

    if (!String(row.documento || '').trim()) {
      ignored += 1;
      return null;
    }

    row.documento = String(row.documento).trim();
    row.movimento_data = parseDate(row.movimento_data, fallbackDate);
    row.status = inferStatus(row.status || row.descricao || null);
    row.origem = String(row.origem || 'arquivo').trim() || 'arquivo';
    return row;
  });

  return {
    linhas: linhas.filter((item): item is ConciliacaoLinhaInput => Boolean(item)),
    ignored
  };
}

export async function parseConciliacaoImportFile(
  file: File,
  fallbackDate?: string | null
): Promise<ParsedImportFileResult> {
  if (file.size > MAX_IMPORT_FILE_BYTES) {
    throw new Error('Arquivo muito grande para importação. Limite máximo: 8 MB.');
  }

  const fileName = String(file.name || '').toLowerCase();
  if (fileName.endsWith('.xlxs')) {
    throw new Error('Extensão de planilha inválida. Use .xlsx, .txt ou .csv.');
  }

  const isXlsx = fileName.endsWith('.xlsx');
  const isLegacyXls = fileName.endsWith('.xls') && !isXlsx;
  const isExcel = isXlsx || isLegacyXls;

  if (isExcel) {
    if (file.size > MAX_EXCEL_FILE_BYTES) {
      throw new Error('Planilha muito grande para importação. Limite máximo: 4 MB.');
    }

    if (isLegacyXls) {
      const buffer = await file.arrayBuffer();
      const utf8Text = new TextDecoder('utf-8').decode(buffer);
      const latin1Text = new TextDecoder('iso-8859-1').decode(buffer);
      const htmlCandidates = [utf8Text, latin1Text]
        .map((text) => parseConciliacaoRowsLayout(extractHtmlTableRows(text), file.name, fallbackDate))
        .filter((item): item is ParsedImportFileResult => Boolean(item));

      const parsedHtml = htmlCandidates.sort((a, b) => b.linhas.length - a.linhas.length)[0];
      if (parsedHtml?.linhas.length) return parsedHtml;

      throw new Error('Arquivos .xls binários não são aceitos. Exporte como .xlsx, .txt ou CSV antes de importar.');
    }

    const parsedXls = await parseConciliacaoXlsLayout(file, fallbackDate);
    if (parsedXls.linhas.length > 0) return parsedXls;

    const workbook = await readXlsxWorkbook(file);
    const firstSheet = workbook.sheets[0];
    if (!firstSheet) {
      return { linhas: [], ignored: 0, text: '', movimentoData: fallbackDate || null };
    }

    const text = rowsToDelimitedText(firstSheet.rows);
    const parsed = parseConciliacaoImportText(text, fallbackDate);
    return {
      ...parsed,
      text,
      movimentoData: parseMovimentoDateFromFileName(file.name) || fallbackDate || null
    };
  }

  const buffer = await file.arrayBuffer();
  const utf8Text = new TextDecoder('utf-8').decode(buffer);
  const latin1Text = new TextDecoder('iso-8859-1').decode(buffer);

  const utf8Parsed = parseConciliacaoImportText(utf8Text, fallbackDate);
  const latin1Parsed = parseConciliacaoImportText(latin1Text, fallbackDate);

  const useLatin1 = latin1Parsed.linhas.length > utf8Parsed.linhas.length;
  const text = useLatin1 ? latin1Text : utf8Text;
  const parsed = useLatin1 ? latin1Parsed : utf8Parsed;

  return {
    ...parsed,
    text,
    movimentoData: parseMovimentoDateFromTxt(text) || parseMovimentoDateFromFileName(file.name) || fallbackDate || null
  };
}
