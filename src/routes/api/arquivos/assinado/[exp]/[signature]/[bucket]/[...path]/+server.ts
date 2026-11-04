import { error } from "@sveltejs/kit";
import type { RequestHandler } from "./$types";
import { getDataContext, getDataClient } from "$lib/server/data";
import { verifySignedFile } from "$lib/server/data/storageApi";

export const GET: RequestHandler = async ({ params }) => {
  const secret = getDataContext()?.secret || "";
  const valid = await verifySignedFile(
    secret,
    params.bucket,
    params.path,
    params.exp,
    params.signature,
  );
  if (!valid) throw error(401, "link expirado");
  const result = await getDataClient()
    .storage.from(params.bucket)
    .download(params.path);
  if (result.error || !result.data) throw error(404, "arquivo nao encontrado");
  return new Response(result.data as BodyInit);
};
