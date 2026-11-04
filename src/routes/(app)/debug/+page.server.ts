import { error } from '@sveltejs/kit';
import type { PageServerLoad } from './$types';
import {
  getAdminClient,
  isDebugEndpointEnabled,
  requireAuthenticatedUser,
  resolveUserScope
} from '$lib/server/v1';

export const load: PageServerLoad = async (event) => {
  if (!isDebugEndpointEnabled(event)) {
    throw error(404, 'Not found');
  }

  const user = event.locals.user || (await requireAuthenticatedUser(event));
  const scope = await resolveUserScope(getAdminClient(), user.id);
  if (!scope.isAdmin) {
    throw error(403, 'Sem acesso.');
  }

  return {};
};
