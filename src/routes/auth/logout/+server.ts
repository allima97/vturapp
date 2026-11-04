import { json, redirect } from "@sveltejs/kit";
import { SAME_ORIGIN_FETCH_SITES } from "$lib/server/requestGuards";
import type { RequestHandler } from "./$types";

function isSameSiteLogoutRequest(request: Request) {
  const fetchSite = String(
    request.headers.get("sec-fetch-site") || "",
  ).toLowerCase();
  if (fetchSite && !SAME_ORIGIN_FETCH_SITES.has(fetchSite)) return false;
  const origin = request.headers.get("origin");
  const referer = request.headers.get("referer");
  if (!origin && !referer) return true;
  const url = new URL(request.url);
  if (origin) {
    try {
      if (new URL(origin).origin !== url.origin) return false;
    } catch {
      return false;
    }
  }
  if (referer) {
    try {
      if (new URL(referer).origin !== url.origin) return false;
    } catch {
      return false;
    }
  }
  return true;
}

export const GET: RequestHandler = async ({ request, locals }) => {
  if (!isSameSiteLogoutRequest(request)) throw redirect(302, "/auth/login");
  await locals.dados.auth.signOut();
  throw redirect(302, "/auth/login");
};

export const POST: RequestHandler = async ({ request, locals }) => {
  if (!isSameSiteLogoutRequest(request)) {
    return json(
      { error: "Origem inválida." },
      { status: 403, headers: { "Cache-Control": "no-store" } },
    );
  }
  await locals.dados.auth.signOut();
  return json({ success: true }, { headers: { "Cache-Control": "no-store" } });
};
