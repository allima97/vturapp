import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { getDataClient } from '$lib/server/data';

export const GET: RequestHandler = async () => {
  const result = await getDataClient().auth.mfa.listFactors();
  return json(result.data, { status: result.error ? 401 : 200 });
};

export const POST: RequestHandler = async ({ request }) => {
  const body = (await request.json().catch(() => ({}))) as {
    friendlyName?: string;
  };
  const result = await getDataClient().auth.mfa.enroll({
    friendlyName: body.friendlyName
  });
  if (result.error) return json({ error: result.error.message }, { status: 400 });
  return json(result.data);
};

export const DELETE: RequestHandler = async ({ request }) => {
  const body = (await request.json().catch(() => ({}))) as {
    factorId?: string;
  };
  const result = await getDataClient().auth.mfa.unenroll({
    factorId: String(body.factorId || '')
  });
  return json({ ok: !result.error }, { status: result.error ? 400 : 200 });
};
