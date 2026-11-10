import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { getDataClient } from '$lib/server/data';

export const GET: RequestHandler = async () => {
  const result = await getDataClient().auth.mfa.getAuthenticatorAssuranceLevel();
  return json(result.data);
};
