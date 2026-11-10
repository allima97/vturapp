import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { getDataClient } from '$lib/server/data';

export const POST: RequestHandler = async ({ request }) => {
  const body = (await request.json().catch(() => ({}))) as {
    password?: string;
  };
  const result = await getDataClient().auth.updateUser({
    password: String(body.password || '')
  });
  if (result.error) return json({ error: result.error.message }, { status: 400 });
  return json({ ok: true });
};
