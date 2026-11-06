import { fail, redirect } from '@sveltejs/kit';
import { and, eq } from 'drizzle-orm';
import { db } from '#lib/server/db/index.ts';
import { athlete, planSession } from '#lib/server/db/schema.ts';
import { athleteToday } from '#lib/server/dashboard.ts';
import { addDays } from '#lib/server/engine/metrics/load.ts';
import { weekStart } from '#lib/server/engine/metrics/volume.ts';
import { activeGoal } from '#lib/server/goals.ts';
import {
	getSeason,
	getWeekWithWarnings,
	hasPlan,
	prefsFor,
	regeneratePlan
} from '#lib/server/plan.ts';
import type { Actions, PageServerLoad } from './$types';

export const load: PageServerLoad = ({ locals, url }) => {
	if (!locals.athlete) redirect(303, '/');
	const a = locals.athlete;
	const g = activeGoal(a.id);
	if (!g) return { goal: null };
	if (!hasPlan(a.id, g.id)) regeneratePlan(a);

	const today = athleteToday(a.id);
	const requested = url.searchParams.get('week');
	const monday = weekStart(requested && /^\d{4}-\d{2}-\d{2}$/.test(requested) ? requested : today);
	return {
		goal: { name: g.name, date: g.date, startDate: g.startDate },
		thisMonday: weekStart(today),
		prev: addDays(monday, -7),
		next: addDays(monday, 7),
		week: getWeekWithWarnings(a, monday),
		season: getSeason(a),
		prefs: prefsFor(a)
	};
};

function ownSession(athleteId: number, id: number) {
	return db
		.select()
		.from(planSession)
		.where(and(eq(planSession.id, id), eq(planSession.athleteId, athleteId)))
		.get();
}

export const actions: Actions = {
	move: async ({ locals, request }) => {
		if (!locals.athlete) return fail(401);
		const form = await request.formData();
		const s = ownSession(locals.athlete.id, Number(form.get('id')));
		const date = String(form.get('date') ?? '');
		if (!s) return fail(404, { error: 'Session not found.' });
		if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) return fail(400, { error: 'Pick a day.' });
		db.update(planSession).set({ date, moved: true }).where(eq(planSession.id, s.id)).run();
		return { moved: s.id };
	},

	skip: async ({ locals, request }) => {
		if (!locals.athlete) return fail(401);
		const s = ownSession(locals.athlete.id, Number((await request.formData()).get('id')));
		if (!s) return fail(404, { error: 'Session not found.' });
		db.update(planSession).set({ skipped: !s.skipped }).where(eq(planSession.id, s.id)).run();
		return { skipped: s.id };
	},

	prefs: async ({ locals, request }) => {
		if (!locals.athlete) return fail(401);
		const form = await request.formData();
		const longRunDay = form.get('longRunDay') === 'sat' ? 'sat' : 'sun';
		const optionalExtraRun = form.get('optionalExtraRun') === 'on';
		db.update(athlete)
			.set({ planPrefs: { longRunDay, optionalExtraRun } })
			.where(eq(athlete.id, locals.athlete.id))
			.run();
		regeneratePlan({ ...locals.athlete, planPrefs: { longRunDay, optionalExtraRun } });
		return { prefsSaved: true };
	},

	regenerate: async ({ locals }) => {
		if (!locals.athlete) return fail(401);
		regeneratePlan(locals.athlete);
		return { regenerated: true };
	}
};
