import { newDia, reorder, type RotDia } from './tipos';

export function normalizeImportLine(value: string): string {
  return String(value || '')
    .replace(/\r/g, '')
    .replace(/\t/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

export function isImportSectionHeader(line: string): boolean {
  const normalized = normalizeImportLine(line)
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase();

  return (
    normalized === 'itinerario' ||
    normalized === 'itinerario de viagem' ||
    normalized === 'dia a dia' ||
    normalized === 'roteiro' ||
    normalized === 'programacao'
  );
}

export function parseDiaHeader(line: string): { dia: number | null; titulo: string } | null {
  const normalized = normalizeImportLine(line);
  if (!normalized || isImportSectionHeader(normalized)) return null;

  const patterns = [
    /^dia\s*(\d+)[ºoª]?\s*[:\-.–—]?\s*(.*)$/i,
    /^(\d+)[ºoª]?\s*dia\s*[:\-.–—]?\s*(.*)$/i,
    /^(\d+)[ºoª]?\s*[:\-.–—]\s*(.*)$/i
  ];

  for (const pattern of patterns) {
    const match = normalized.match(pattern);
    if (match) {
      return {
        dia: Number(match[1]) || null,
        titulo: normalizeImportLine(match[2])
      };
    }
  }

  return null;
}

export function isImportStopHeader(line: string): boolean {
  const normalized = normalizeImportLine(line)
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase();

  return (
    normalized.startsWith('servicos inclusos') ||
    normalized.startsWith('informacoes importantes') ||
    normalized.startsWith('formas de pagamento') ||
    normalized === 'importante' ||
    normalized.startsWith('importante ') ||
    normalized.startsWith('outros servicos')
  );
}

export function mapImportedTitleToDia(
  ordem: number,
  tituloBruto: string,
  descricaoLinhas: string[]
): RotDia {
  const titulo = normalizeImportLine(tituloBruto);
  const descricao = descricaoLinhas
    .map((line) => normalizeImportLine(line))
    .filter(Boolean)
    .join('\n');
  const routeParts = titulo
    .split(/\s(?:->|→|\/|-|–|—)\s/)
    .map((part) => normalizeImportLine(part))
    .filter(Boolean);

  const cidade = routeParts.length > 0 ? routeParts[0] : titulo;
  const percurso = routeParts.length > 1 ? titulo : '';

  return {
    ...newDia(ordem),
    ordem,
    cidade,
    percurso,
    descricao
  };
}

export function parseDiasImportText(text: string): RotDia[] {
  const raw = String(text || '')
    .replace(/\r/g, '')
    .trim();
  if (!raw) return [];

  const lines = raw.split('\n');
  const parsed: RotDia[] = [];

  let started = false;
  let expectingTitleFromNextLine = false;
  let currentTitle = '';
  let currentDescription: string[] = [];

  const commitCurrent = () => {
    if (!currentTitle.trim() && currentDescription.length === 0) return;
    parsed.push(
      mapImportedTitleToDia(
        parsed.length,
        currentTitle || `Dia ${parsed.length + 1}`,
        currentDescription
      )
    );
    currentTitle = '';
    currentDescription = [];
  };

  for (const rawLine of lines) {
    const line = normalizeImportLine(rawLine);
    if (!line) continue;
    if (isImportSectionHeader(line)) continue;

    if (started && isImportStopHeader(line)) {
      break;
    }

    const header = parseDiaHeader(line);
    if (header) {
      started = true;
      commitCurrent();
      currentTitle = header.titulo;
      currentDescription = [];
      expectingTitleFromNextLine = !currentTitle;
      continue;
    }

    if (!started) {
      continue;
    }

    if (expectingTitleFromNextLine) {
      currentTitle = line;
      expectingTitleFromNextLine = false;
      continue;
    }

    if (!currentTitle) {
      currentTitle = line;
    } else {
      currentDescription.push(line);
    }
  }

  commitCurrent();

  if (parsed.length > 0) {
    return reorder(parsed);
  }

  const blocks = raw
    .split(/\n{2,}/)
    .map((block) =>
      block
        .split('\n')
        .map((line) => normalizeImportLine(line))
        .filter(Boolean)
    )
    .filter((block) => block.length > 0);

  return reorder(
    blocks.map((block, index) => {
      const [titulo, ...descricaoLinhas] = block;
      return mapImportedTitleToDia(index, titulo || `Dia ${index + 1}`, descricaoLinhas);
    })
  );
}
