import { encodeStoragePathSegment, sanitizeHref } from '$lib/security/url';

export type EmpresaOption = {
  id: string;
  nome_fantasia: string;
  status: string;
};

export type UserMini = {
  id: string;
  nome_completo: string | null;
  email: string | null;
  user_types?: { name: string | null } | null;
};

export type RecadoLeituraRow = {
  read_at: string;
  user_id: string;
  user?: UserMini | null;
};

export type RecadoArquivoRow = {
  id: string;
  company_id: string;
  recado_id: string;
  uploaded_by: string | null;
  file_name: string;
  storage_bucket: string | null;
  storage_path: string;
  mime_type: string | null;
  size_bytes: number | null;
  created_at: string;
  download_url?: string | null;
};

export type RecadoRow = {
  id: string;
  company_id: string;
  sender_id: string;
  receiver_id: string | null;
  assunto: string | null;
  conteudo: string;
  created_at: string;
  sender?: UserMini | null;
  receiver?: UserMini | null;
  sender_deleted: boolean;
  receiver_deleted: boolean;
  leituras?: RecadoLeituraRow[] | null;
  arquivos?: RecadoArquivoRow[] | null;
};

export type Thread = {
  id: string;
  name: string;
  type: 'company' | 'user';
  subtitle: string;
  lastMessage?: string;
  lastAt?: string;
  unreadCount: number;
};

const DATE_TIME_FORMATTER = new Intl.DateTimeFormat('pt-BR', {
  day: '2-digit',
  month: '2-digit',
  year: 'numeric',
  hour: '2-digit',
  minute: '2-digit'
});
const TIME_FORMATTER = new Intl.DateTimeFormat('pt-BR', { hour: '2-digit', minute: '2-digit' });
const DATE_FORMATTER = new Intl.DateTimeFormat('pt-BR');
const PT_BR_BASE_COLLATOR = new Intl.Collator('pt-BR', { sensitivity: 'base' });

export function formatDateTimeBR(value?: string | null) {
  if (!value) return '';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return String(value);
  return DATE_TIME_FORMATTER.format(date);
}

export function formatThreadTime(value?: string | null) {
  if (!value) return '';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return String(value);
  const now = new Date();
  const sameDay =
    date.getFullYear() === now.getFullYear() &&
    date.getMonth() === now.getMonth() &&
    date.getDate() === now.getDate();
  return sameDay ? TIME_FORMATTER.format(date) : DATE_FORMATTER.format(date);
}

export function getNomeExibicao(user?: UserMini | null) {
  const nome = String(user?.nome_completo || '').trim();
  if (nome) return nome;
  const email = String(user?.email || '').trim();
  if (email) return email;
  return 'Usuário';
}

export function normalizeSortKey(value: string) {
  return String(value || '')
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .trim();
}

export function getInitials(value?: string | null) {
  const cleaned = String(value || '').trim();
  if (!cleaned) return 'U';
  const parts = cleaned.match(/\S+/g) || [];
  const first = parts[0]?.[0] || '';
  const last = parts.length > 1 ? parts[parts.length - 1]?.[0] || '' : '';
  return `${first}${last}`.toUpperCase() || cleaned.slice(0, 2).toUpperCase();
}

export function buildRecadoPreview(recado?: RecadoRow | null) {
  if (!recado) return '';
  const assunto = String(recado.assunto || '').trim();
  if (assunto) return assunto;
  const texto = String(recado.conteudo || '').trim();
  if (texto) return texto.slice(0, 46);
  const arquivos = recado.arquivos || [];
  if (arquivos.length > 0) {
    const primeiro = arquivos[0];
    return arquivos.length > 1
      ? `${primeiro.file_name} (+${arquivos.length - 1})`
      : primeiro.file_name;
  }
  return 'Sem mensagens ainda';
}

export function formatBadge(count: number) {
  return count > 99 ? '99+' : String(count);
}

export function buildAttachmentUrl(bucket?: string | null, path?: string | null) {
  if (!bucket || !path) return '';
  const bucketSegment = encodeStoragePathSegment(bucket);
  const pathSegment = encodeStoragePathSegment(path);
  return `/api/arquivos/publico/${bucketSegment}/${pathSegment}`;
}

export function safeAttachmentHref(
  rawUrl?: string | null,
  bucket?: string | null,
  path?: string | null
) {
  return sanitizeHref(rawUrl, ['http:', 'https:']) || buildAttachmentUrl(bucket, path) || '#';
}

export function buildThreads(
  recados: RecadoRow[],
  usuariosEmpresa: UserMini[],
  userId: string | null
): Thread[] {
  const result: Thread[] = [];

  const companyRecados = recados.filter((recado) => !recado.receiver_id);
  const sortedCompany = [...companyRecados].sort(
    (a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime()
  );
  const lastCompany = sortedCompany[0];
  const companyUnread = companyRecados.filter(
    (recado) => userId && !recado.leituras?.some((entry) => entry.user_id === userId)
  ).length;

  result.push({
    id: 'company',
    name: 'Todos da empresa',
    type: 'company',
    subtitle: buildRecadoPreview(lastCompany) || 'Sem mensagens para toda a empresa',
    lastMessage: lastCompany?.conteudo || buildRecadoPreview(lastCompany),
    lastAt: lastCompany?.created_at,
    unreadCount: companyUnread
  });

  const pessoas = usuariosEmpresa
    .filter((user) => user.id && user.id !== userId)
    .sort((a, b) =>
      PT_BR_BASE_COLLATOR.compare(
        normalizeSortKey(getNomeExibicao(a)),
        normalizeSortKey(getNomeExibicao(b))
      )
    );

  for (const pessoa of pessoas) {
    const relevant = recados.filter((recado) => {
      const isToPessoa = recado.receiver_id === pessoa.id && recado.sender_id === userId;
      const isFromPessoa = recado.sender_id === pessoa.id && recado.receiver_id === userId;
      return Boolean(isToPessoa || isFromPessoa);
    });
    const sorted = [...relevant].sort(
      (a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime()
    );
    const last = sorted[0];
    const unread = relevant.filter(
      (recado) =>
        recado.receiver_id === userId && !recado.leituras?.some((entry) => entry.user_id === userId)
    ).length;

    result.push({
      id: pessoa.id,
      name: getNomeExibicao(pessoa),
      type: 'user',
      subtitle: buildRecadoPreview(last) || 'Sem mensagens ainda',
      lastMessage: last?.conteudo || buildRecadoPreview(last),
      lastAt: last?.created_at,
      unreadCount: unread
    });
  }

  return result;
}
