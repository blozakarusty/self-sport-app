import { redirect } from '@sveltejs/kit';
import { listActivities } from '#lib/server/dashboard.ts';
import type { PageServerLoad } from './$types';

const PER_PAGE = 50;

export const load: PageServerLoad = ({ locals, url }) => {
	if (!locals.athlete) redirect(303, '/');
	const page = Math.max(1, Number(url.searchParams.get('page')) || 1);
	const sport = url.searchParams.get('sport') || undefined;
	return { page, sport, ...listActivities(locals.athlete, { page, perPage: PER_PAGE, sport }) };
};
