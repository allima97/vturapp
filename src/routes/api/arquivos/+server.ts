import { json } from "@sveltejs/kit";
import type { RequestHandler } from "./$types";
import { getDataClient } from "$lib/server/data";

export const POST: RequestHandler = async (event) => {
  const { session } = await event.locals.safeGetSession();
  if (!session?.user) return json({ error: "sem sessao" }, { status: 401 });
  const form = await event.request.formData();
  const bucket = String(form.get("bucket") || "");
  const path = String(form.get("path") || "");
  const file = form.get("file");
  if (!bucket || !path || !(file instanceof File))
    return json({ error: "arquivo invalido" }, { status: 400 });
  const result = await getDataClient()
    .storage.from(bucket)
    .upload(path, file, {
      contentType: file.type || "application/octet-stream",
      upsert: form.get("upsert") === "1",
    });
  return json(result, { status: result.error ? 400 : 200 });
};
