import type { LayoutServerLoad } from './$types';

export const load: LayoutServerLoad = ({ locals }) => ({
	athlete: locals.athlete && {
		id: locals.athlete.id,
		firstName: locals.athlete.firstName
	}
});
