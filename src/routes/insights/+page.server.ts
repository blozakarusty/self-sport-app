import { redirect } from '@sveltejs/kit';
import { getInsights } from '#lib/server/insights.ts';
import type { PageServerLoad } from './$types';

export const load: PageServerLoad = ({ locals }) => {
	if (!locals.athlete) redirect(303, '/');
	return getInsights(locals.athlete);
};
