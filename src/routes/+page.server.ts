import { fail } from '@sveltejs/kit';
import { getDashboard } from '#lib/server/dashboard.ts';
import { syncAthlete } from '#lib/server/jobs/sync.ts';
import { activityCount } from '#lib/server/sources/strava/index.ts';
import { currentVdot } from '#lib/server/performance.ts';
import { getGoalView } from '#lib/server/goals.ts';
import { strengthThisWeek } from '#lib/server/strength.ts';
import { getUpcoming, hasPlan, regeneratePlan } from '#lib/server/plan.ts';
import { activeGoal } from '#lib/server/goals.ts';
import type { Actions, PageServerLoad } from './$types';

function summarizeGoal(v: ReturnType<typeof getGoalView>) {
	if (!v) return null;
	return {
		name: v.goal.name,
		date: v.goal.date,
		targetTime: v.goal.targetTime,
		daysToGo: v.daysToGo,
		week: v.week,
		totalWeeks: v.totalWeeks,
		phase: v.current && { label: v.current.label, strengthPerWeek: v.current.strengthPerWeek },
		fitness: v.fitness
	};
}

function upcomingFor(a: NonNullable<App.Locals['athlete']>) {
	const g = activeGoal(a.id);
	if (!g) return null;
	if (!hasPlan(a.id, g.id)) regeneratePlan(a);
	return getUpcoming(a);
}

export const load: PageServerLoad = ({ locals, url }) => {
	if (!locals.athlete) {
		return {
			dashboard: null,
			vdot: null,
			goal: null,
			upcoming: null,
			strengthWeek: null,
			authError: url.searchParams.get('auth'),
			missingScopes: url.searchParams.get('missing')
		};
	}
	return {
		dashboard: getDashboard(locals.athlete),
		activityCount: activityCount(locals.athlete.id),
		vdot: currentVdot(locals.athlete),
		goal: summarizeGoal(getGoalView(locals.athlete)),
		upcoming: upcomingFor(locals.athlete),
		strengthWeek: strengthThisWeek(locals.athlete),
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
