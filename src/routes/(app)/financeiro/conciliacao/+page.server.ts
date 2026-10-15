import { redirect } from '@sveltejs/kit';

export function load({ locals }) {
	if (locals.isSystemAdmin) {
		throw redirect(302, '/negado');
	}

	return {};
}
