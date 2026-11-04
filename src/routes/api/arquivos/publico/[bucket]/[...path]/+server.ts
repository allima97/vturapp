import { error } from "@sveltejs/kit";
import type { RequestHandler } from "./$types";
import { getDataClient } from "$lib/server/data";
import { isPublicBucket } from "$lib/server/data/storageApi";

export const GET: RequestHandler = async ({ params }) => {
  if (!isPublicBucket(params.bucket)) throw error(403, "bucket privado");
  const path = params.path;
  const result = await getDataClient()
    .storage.from(params.bucket)
    .download(path);
  if (result.error || !result.data) throw error(404, "arquivo nao encontrado");
  return new Response(result.data as BodyInit);
};
