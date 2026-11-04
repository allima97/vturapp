import { error } from "@sveltejs/kit";
import type { RequestHandler } from "./$types";
import { getDataClient } from "$lib/server/data";
import { isPublicBucket } from "$lib/server/data/storageApi";

export const GET: RequestHandler = async (event) => {
  const bucket = event.url.searchParams.get("bucket") || "";
  const path = event.url.searchParams.get("path") || "";
  if (!bucket || !path) throw error(400, "arquivo invalido");
  if (!isPublicBucket(bucket)) {
    const { session } = await event.locals.safeGetSession();
    if (!session?.user) throw error(401, "sem sessao");
  }
  const result = await getDataClient().storage.from(bucket).download(path);
  if (result.error || !result.data) throw error(404, "arquivo nao encontrado");
  const body = result.data instanceof Blob ? result.data : result.data;
  return new Response(body as BodyInit);
};
