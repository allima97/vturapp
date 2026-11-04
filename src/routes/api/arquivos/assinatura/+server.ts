import { json } from "@sveltejs/kit";
import type { RequestHandler } from "./$types";
import { getDataClient } from "$lib/server/data";

export const POST: RequestHandler = async (event) => {
  const { session } = await event.locals.safeGetSession();
  if (!session?.user) return json({ error: "sem sessao" }, { status: 401 });
  const body = (await event.request.json().catch(() => ({}))) as {
    bucket?: string;
    path?: string;
    expiresIn?: number;
  };
  if (!body.bucket || !body.path)
    return json({ error: "arquivo invalido" }, { status: 400 });
  const result = await getDataClient()
    .storage.from(body.bucket)
    .createSignedUrl(body.path, Number(body.expiresIn || 3600));
  return json(result.data);
};
