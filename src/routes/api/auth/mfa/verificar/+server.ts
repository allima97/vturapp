import { json } from "@sveltejs/kit";
import type { RequestHandler } from "./$types";
import { getDataClient } from "$lib/server/data";

export const POST: RequestHandler = async ({ request }) => {
  const body = (await request.json().catch(() => ({}))) as {
    factorId?: string;
    challengeId?: string;
    code?: string;
  };
  const result = await getDataClient().auth.mfa.verify({
    factorId: String(body.factorId || ""),
    challengeId: String(body.challengeId || ""),
    code: String(body.code || ""),
  });
  if (result.error)
    return json({ error: result.error.message }, { status: 400 });
  return json(result.data);
};
