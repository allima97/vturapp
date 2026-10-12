import { VTUR_LOGO_PATH } from "$lib/brand";
// Migrado para Hono de src/routes/api/v1/crm/library/+server.ts — corpo IDÊNTICO ao original
// (só nome/assinatura do handler e caminhos de import mudaram). Ver src/lib/server/api/app.ts.
import type { SupabaseClient } from "@supabase/supabase-js";
import { getAdminClient, logServerError, requireAuthenticatedUser, resolveUserScope } from '$lib/server/v1';
import {
  OFFICIAL_CARD_THEMES,
  buildOfficialTemplateRows,
  buildOfficialThemeRows,
} from '$lib/cards/officialLibrary';
import { resolveThemeAssetMeta } from '$lib/cards/themeAssetMeta';
import { DYNAMIC_READ_HEADERS, NO_STORE_HEADERS } from '$lib/server/httpCache';
import { toUserMessage } from '$lib/utils/errors';

type ScopeValue = "system" | "master" | "gestor" | "user";
const THEME_SELECT =
  "id, user_id, nome, categoria, categoria_id, asset_url, storage_path, width_px, height_px, greeting_text, mensagem_max_linhas, mensagem_max_palavras, assinatura_max_linhas, assinatura_max_palavras, title_style, body_style, signature_style, scope, company_id, ativo";

type ThemeRow = {
  id: string;
  user_id: string | null;
  nome: string;
  categoria: string | null;
  categoria_id: string | null;
  asset_url: string;
  storage_path?: string | null;
  logo_url: string | null;
  logo_path: string | null;
  width_px: number | null;
  height_px: number | null;
  greeting_text: string | null;
  mensagem_max_linhas: number | null;
  mensagem_max_palavras: number | null;
  assinatura_max_linhas: number | null;
  assinatura_max_palavras: number | null;
  title_style: unknown;
  body_style: unknown;
  signature_style: unknown;
  scope: string | null;
  company_id: string | null;
  ativo: boolean | null;
};

type MessageRow = {
  id: string;
  user_id: string | null;
  nome: string;
  assunto: string | null;
  titulo: string;
  corpo: string;
  assinatura: string | null;
  theme_id: string | null;
  title_style: unknown;
  body_style: unknown;
  signature_style: unknown;
  categoria: string | null;
  scope: string | null;
  company_id: string | null;
  ativo: boolean | null;
};



type LegacyThemeRow = Omit<ThemeRow, "logo_url" | "logo_path">;

type ThemeFetchResult = {
  data: ThemeRow[];
  error: unknown;
  logoColumnsAvailable: boolean;
};

function normalizeScope(value?: string | null): ScopeValue {
  const scope = String(value || "").trim().toLowerCase();
  if (scope === "system" || scope === "master" || scope === "gestor" || scope === "user") return scope;
  // Compatibilidade com base legada: escopo vazio é tratado como "system".
  return "system";
}

function inCompany(companyId: string | null, allowed: Set<string>) {
  const key = String(companyId || "").trim();
  return key ? allowed.has(key) : false;
}

function normalizeLibraryKey(value?: string | null) {
  return String(value || "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .trim();
}

function mergeThemesWithOfficial(userId: string, companyId: string | null, rows: ThemeRow[]) {
  const merged = new Map<string, ThemeRow>();

  for (const row of rows) {
    const key = normalizeLibraryKey(row.nome);
    if (!key || merged.has(key)) continue;
    merged.set(key, row);
  }

  for (const theme of buildOfficialThemeRows(userId, companyId)) {
    const key = normalizeLibraryKey(theme.nome);
    if (!key || merged.has(key)) continue;
    merged.set(key, {
      id: `official-theme:${key}`,
      user_id: userId,
      nome: theme.nome,
      categoria: theme.categoria,
      categoria_id: null,
      asset_url: theme.asset_url,
      storage_path: theme.storage_path,
      logo_url: VTUR_LOGO_PATH,
      logo_path: null,
      width_px: theme.width_px,
      height_px: theme.height_px,
      greeting_text: null,
      mensagem_max_linhas: null,
      mensagem_max_palavras: null,
      assinatura_max_linhas: null,
      assinatura_max_palavras: null,
      title_style: theme.title_style,
      body_style: theme.body_style,
      signature_style: theme.signature_style,
      scope: "system",
      company_id: companyId,
      ativo: theme.ativo,
    });
  }

  return Array.from(merged.values());
}

function normalizeThemeAsset(row: ThemeRow): ThemeRow {
  const resolved = resolveThemeAssetMeta(row);
  return {
    ...row,
    asset_url: resolved.asset_url,
    width_px: resolved.width_px || row.width_px,
    height_px: resolved.height_px || row.height_px,
  };
}

function mergeMessagesWithOfficial(userId: string, companyId: string | null, themes: ThemeRow[], rows: MessageRow[]) {
  const merged = new Map<string, MessageRow>();
  const themeIdByName = Object.fromEntries(
    themes.map((theme) => [String(theme.nome || "").trim(), String(theme.id || "").trim()])
  );
  const officialThemeCategoryByName = Object.fromEntries(
    OFFICIAL_CARD_THEMES.map((theme) => [String(theme.nome || "").trim(), String(theme.categoria || "").trim()])
  );

  for (const row of rows) {
    const key = `${normalizeLibraryKey(row.nome)}::${normalizeLibraryKey(row.categoria)}`;
    if (!key || merged.has(key)) continue;
    merged.set(key, row);
  }

  for (const template of buildOfficialTemplateRows(userId, companyId, themeIdByName)) {
    const categoryFromTheme = officialThemeCategoryByName[String(template.theme_id ? themes.find((theme) => theme.id === template.theme_id)?.nome || "" : "").trim()];
    const category = String(categoryFromTheme || template.categoria || "").trim();
    const key = `${normalizeLibraryKey(template.nome)}::${normalizeLibraryKey(category)}`;
    if (!key || merged.has(key)) continue;
    merged.set(key, {
      id: `official-template:${normalizeLibraryKey(template.nome)}`,
      user_id: userId,
      nome: template.nome,
      assunto: template.assunto,
      titulo: template.titulo,
      corpo: template.corpo,
      assinatura: template.assinatura,
      theme_id: template.theme_id,
      title_style: template.title_style,
      body_style: template.body_style,
      signature_style: template.signature_style,
      categoria: category,
      scope: "system",
      company_id: companyId,
      ativo: template.ativo,
    });
  }

  return Array.from(merged.values());
}

async function fetchThemes(client: SupabaseClient): Promise<ThemeFetchResult> {
  const result = await client.from("user_message_template_themes").select(THEME_SELECT).order("nome");
  return {
    data: ((result.data || []) as LegacyThemeRow[]).map((row) => ({
      ...row, logo_url: VTUR_LOGO_PATH, logo_path: null,
    })),
    error: result.error,
    logoColumnsAvailable: false,
  };
}

export async function handleCrmLibraryGet(event: import('@sveltejs/kit').RequestEvent) {
  try {
    const authClient = event.locals.supabase;
    const user = await requireAuthenticatedUser(event);
    const scope = await resolveUserScope(authClient, user.id);
    const userId = user.id;
    const isMaster = scope.papel === 'MASTER';
    const isAdmin = Boolean(scope.isAdmin);
    const currentCompanyId = String(scope.companyId || '').trim() || null;

    const masterCompanyIds = new Set<string>();
    if (isMaster) {
      const { data: vinculos } = await authClient
        .from("master_empresas")
        .select("company_id, status")
        .eq("master_id", userId);
      for (const row of vinculos || []) {
        const status = String(row?.status || "").toLowerCase();
        const companyId = String(row?.company_id || "").trim();
        if (!companyId) continue;
        if (status === "rejected") continue;
        masterCompanyIds.add(companyId);
      }
    }
    if (currentCompanyId) masterCompanyIds.add(currentCompanyId);

    const dataClient: SupabaseClient = getAdminClient();

    const [catsResp, themesResp, messagesResp, sigResp, settingsResp] = await Promise.all([
      dataClient
        .from("crm_template_categories")
        .select("id, nome, icone, sort_order")
        .eq("ativo", true)
        .order("sort_order"),
      fetchThemes(dataClient),
      dataClient
        .from("user_message_templates")
        .select("id, user_id, nome, assunto, titulo, corpo, assinatura, theme_id, title_style, body_style, signature_style, categoria, scope, company_id, ativo")
        .order("nome"),
      authClient
        .from("user_crm_assinaturas")
        .select("id, user_id, is_default, linha1, linha1_font_size, linha1_italic, linha2, linha2_font_size, linha2_italic, linha3, linha3_font_size, linha3_italic, updated_at")
        .eq("user_id", userId)
        .eq("is_default", true)
        .maybeSingle(),
      authClient
        .from("quote_print_settings")
        .select("consultor_nome")
        .eq("owner_user_id", userId)
        .maybeSingle(),
    ]);

    if (catsResp.error) {
      logServerError("[crm/library] erro ao carregar categorias", catsResp.error);
      return new Response(JSON.stringify({ error: "Erro ao carregar categorias." }), {
        status: 500,
        headers: { "content-type": "application/json; charset=utf-8", ...NO_STORE_HEADERS },
      });
    }
    if (themesResp.error) {
      logServerError("[crm/library] erro ao carregar modelos", themesResp.error);
      return new Response(JSON.stringify({ error: "Erro ao carregar modelos." }), {
        status: 500,
        headers: { "content-type": "application/json; charset=utf-8", ...NO_STORE_HEADERS },
      });
    }
    if (messagesResp.error) {
      logServerError("[crm/library] erro ao carregar textos", messagesResp.error);
      return new Response(JSON.stringify({ error: "Erro ao carregar textos." }), {
        status: 500,
        headers: { "content-type": "application/json; charset=utf-8", ...NO_STORE_HEADERS },
      });
    }

    const visibleThemes = ((themesResp.data || []) as ThemeRow[]).filter((row) => {
      const rowScope = normalizeScope(row.scope);
      if (isAdmin) return true;
      if (String(row.user_id || "") === userId) return true;
      if (rowScope === "system") return true;
      if (rowScope === "user") return false;
      if (rowScope === "gestor") {
        return inCompany(row.company_id, masterCompanyIds);
      }
      if (rowScope === "master") {
        return inCompany(row.company_id, masterCompanyIds);
      }
      return false;
    }).map(normalizeThemeAsset);

    const visibleMessages = ((messagesResp.data || []) as MessageRow[]).filter((row) => {
      const rowScope = normalizeScope(row.scope);
      if (isAdmin) return true;
      if (String(row.user_id || "") === userId) return true;
      if (rowScope === "system") return true;
      if (rowScope === "user") return false;
      if (rowScope === "gestor") {
        return inCompany(row.company_id, masterCompanyIds);
      }
      if (rowScope === "master") {
        return inCompany(row.company_id, masterCompanyIds);
      }
      return false;
    });

    const libraryThemes = mergeThemesWithOfficial(userId, currentCompanyId, visibleThemes);
    const libraryMessages = mergeMessagesWithOfficial(userId, currentCompanyId, libraryThemes, visibleMessages);

    const resolvedSettings = {
      consultor_nome: settingsResp.data?.consultor_nome || null,
      logo_url: VTUR_LOGO_PATH,
      logo_path: null,
    };

    return new Response(
      JSON.stringify({
        userId,
        userRole: scope.papel || null,
        isAdmin,
        currentCompanyId,
        categories: catsResp.data || [],
        themes: libraryThemes,
        messages: libraryMessages,
        signature: sigResp.data || null,
        settings: resolvedSettings,
        themeLogoColumnsAvailable: Boolean(themesResp.logoColumnsAvailable),
      }),
      {
        status: 200,
        headers: { "content-type": "application/json; charset=utf-8", ...DYNAMIC_READ_HEADERS },
      }
    );
  } catch (error: unknown) {
    logServerError("[crm/library] Falha ao carregar biblioteca", error);
    return new Response(
      JSON.stringify({
        error: "Falha ao carregar biblioteca CRM.",
      }),
      {
        status: 500,
        headers: { "content-type": "application/json; charset=utf-8", ...NO_STORE_HEADERS },
      }
    );
  }
}
