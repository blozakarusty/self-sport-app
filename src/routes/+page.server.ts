import { fail } from '@sveltejs/kit';
import { getDashboard } from '#lib/server/dashboard.ts';
import { syncAthlete } from '#lib/server/jobs/sync.ts';
import { activityCount } from '#lib/server/sources/strava/index.ts';
import type { Actions, PageServerLoad } from './$types';

export const load: PageServerLoad = ({ locals, url }) => {
	if (!locals.athlete) {
		return {
			dashboard: null,
			authError: url.searchParams.get('auth'),
			missingScopes: url.searchParams.get('missing')
		};
	}
	return {
		dashboard: getDashboard(locals.athlete),
		activityCount: activityCount(locals.athlete.id),
		authError: null,
		missingScopes: null
	};
};

export const actions: Actions = {
	sync: async ({ locals }) => {
		if (!locals.athlete) return fail(401);
		try {
			const results = await syncAthlete(locals.athlete.id);
			return {
				synced: results.reduce((n, r) => n + r.upserted, 0),
				partial: results.some((r) => r.partial)
			};
		} catch (e) {
			return fail(502, { error: e instanceof Error ? e.message : 'Sync failed' });
		}
	}
};
