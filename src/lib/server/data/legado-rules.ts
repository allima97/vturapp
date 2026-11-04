const NAME_FIELDS: Record<string, string[]> = {
  admin_avisos_templates: ["nome"],
  circuitos: ["nome"],
  cliente_acompanhantes: ["nome_completo"],
  clientes: ["nome"],
  commission_rule: ["nome"],
  consultorias_online: ["cliente_nome"],
  crm_template_categories: ["nome"],
  feriados: ["nome"],
  formas_pagamento: ["nome"],
  fornecedores: ["nome_completo"],
  message_templates_v2: ["nome"],
  minhas_preferencias: ["nome"],
  plans: ["nome"],
  quote_print_settings: ["consultor_nome", "filial_nome"],
  roteiro_personalizado: ["nome"],
  roteiro_transporte_tarifa: ["tarifa_nome"],
  servicos_fornecedor: ["nome"],
  servicos: ["nome"],
  subdivisoes: ["nome"],
  tipo_pacotes: ["nome"],
  tipo_produtos: ["nome"],
  todo_categorias: ["nome"],
  user_crm_assinaturas: ["nome"],
  user_message_template_themes: ["nome"],
  user_message_templates: ["nome"],
  users: ["nome_completo"],
  vendas_pagamentos: ["forma_nome"],
  vouchers: ["nome"],
};

const SMALL_WORDS = new Set(["de", "da", "do", "das", "dos", "e", "a"]);

export function normalizeNamePtBr(value: unknown) {
  if (value == null) return value;
  const trimmed = String(value).trim().replace(/\s+/g, " ");
  if (!trimmed) return trimmed;
  const titled = trimmed
    .toLowerCase()
    .split(" ")
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
    .join(" ");
  const lowered = titled
    .split(" ")
    .map((word, index) =>
      index > 0 && SMALL_WORDS.has(word.toLowerCase()) ? word.toLowerCase() : word,
    )
    .join(" ");
  return lowered.charAt(0).toUpperCase() + lowered.slice(1);
}

export function formatCpfCnpj(value: unknown) {
  if (value == null) return value;
  const raw = String(value).trim();
  if (!raw) return raw;
  const digits = raw.replace(/\D/g, "");
  if (digits.length === 11) {
    return digits.replace(/^(\d{3})(\d{3})(\d{3})(\d{2})$/, "$1.$2.$3-$4");
  }
  if (digits.length === 14) {
    return digits.replace(/^(\d{2})(\d{3})(\d{3})(\d{4})(\d{2})$/, "$1.$2.$3/$4-$5");
  }
  throw new Error("CPF/CNPJ invalido: esperado 11 ou 14 digitos.");
}

export function digitsOnly(value: unknown) {
  if (value == null) return value;
  return String(value).replace(/\D/g, "");
}

export function normalizeReciboNumero(value: unknown) {
  if (value == null || value === "") return null;
  return String(value).toUpperCase().replace(/[^A-Z0-9]/g, "");
}

export function applyLegadoRowRules(
  table: string,
  row: Record<string, unknown>,
  mode: "insert" | "update",
) {
  for (const field of NAME_FIELDS[table] || []) {
    if (field in row) row[field] = normalizeNamePtBr(row[field]);
  }
  if (table === "clientes" && "cpf" in row) row.cpf = formatCpfCnpj(row.cpf);
  if (table === "companies" && "cnpj" in row) row.cnpj = digitsOnly(row.cnpj);
  if (table === "vendas_recibos" && "numero_recibo" in row) {
    row.numero_recibo_normalizado = normalizeReciboNumero(row.numero_recibo);
  }
  if (table === "orcamentos" && mode === "insert") {
    if (row.data_orcamento == null) row.data_orcamento = new Date().toISOString();
    if (row.status == null || row.status === "") row.status = "Contato inicial";
  }
  return row;
}

export async function applyLegadoWriteEffects(
  db: D1Database,
  table: string,
  row: Record<string, unknown>,
) {
  if (table === "vendas_recibos" && row.venda_id && (row.data_venda == null || row.data_venda === "")) {
    const parent = await db
      .prepare("SELECT data_venda FROM legado_vendas WHERE id = ?")
      .bind(row.venda_id)
      .first<{ data_venda: string | null }>();
    if (parent?.data_venda) row.data_venda = parent.data_venda;
  }
  if (table === "comissionamento_geral" && row.produto_id) {
    const produto = await db
      .prepare("SELECT regra_comissionamento FROM legado_produtos WHERE id = ?")
      .bind(row.produto_id)
      .first<{ regra_comissionamento: string | null }>();
    const regra = String(produto?.regra_comissionamento || "").toLowerCase();
    if (regra === "geral") {
      if (row.meta_nao_atingida == null || row.meta_atingida == null || row.super_meta == null) {
        throw new Error("Produto com regra GERAL deve ter as tres metas preenchidas.");
      }
      row.diferenciado = null;
    }
    if (regra === "diferenciado") {
      if (row.diferenciado == null) {
        throw new Error("Produto com regra DIFERENCIADO deve ter o campo diferenciado.");
      }
      row.meta_nao_atingida = null;
      row.meta_atingida = null;
      row.super_meta = null;
    }
  }
  if (table === "metas_vendedor" && row.vendedor_id) {
    const tipo = await db
      .prepare(
        `SELECT upper(COALESCE(type.name, '')) AS name
         FROM legado_users AS user
         LEFT JOIN legado_user_types AS type ON type.id = user.user_type_id
         WHERE user.id = ?`,
      )
      .bind(row.vendedor_id)
      .first<{ name: string }>();
    if (!tipo) throw new Error("vendedor_id must reference an existing user");
    if (!tipo.name.includes("VENDEDOR") && !tipo.name.includes("GESTOR")) {
      throw new Error("vendedor_id must reference a user of type VENDEDOR or GESTOR");
    }
  }
}

export async function applyLegadoAfterInsert(
  db: D1Database,
  table: string,
  row: Record<string, unknown>,
) {
  const link = async (companyId: unknown, clienteId: unknown) => {
    if (!companyId || !clienteId) return;
    await db
      .prepare(
        "INSERT OR IGNORE INTO legado_clientes_company (company_id, cliente_id) VALUES (?, ?)",
      )
      .bind(companyId, clienteId)
      .run();
  };
  if (table === "clientes") await link(row.company_id, row.id);
  if (table === "vendas" || table === "viagens") await link(row.company_id, row.cliente_id);
  if (table === "consultorias_online" && row.cliente_id && row.created_by) {
    const user = await db
      .prepare("SELECT company_id FROM legado_users WHERE id = ?")
      .bind(row.created_by)
      .first<{ company_id: string | null }>();
    await link(user?.company_id, row.cliente_id);
  }
  if (table === "companies" && row.id) {
    await db
      .prepare(
        `INSERT INTO legado_company_billing (id, company_id, status)
         SELECT ?, ?, 'trial'
         WHERE NOT EXISTS (SELECT 1 FROM legado_company_billing WHERE company_id = ?)`,
      )
      .bind(crypto.randomUUID(), row.id, row.id)
      .run();
  }
}
