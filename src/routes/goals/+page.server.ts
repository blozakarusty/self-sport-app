import { fail, redirect } from '@sveltejs/kit';
import { and, eq } from 'drizzle-orm';
import { db } from '#lib/server/db/index.ts';
import { goal } from '#lib/server/db/schema.ts';
import { athleteToday } from '#lib/server/dashboard.ts';
import { activeGoal, getGoalView } from '#lib/server/goals.ts';
import { regeneratePlan } from '#lib/server/plan.ts';
import { planSession } from '#lib/server/db/schema.ts';
import { gte } from 'drizzle-orm';
import { athleteEfforts } from '#lib/server/performance.ts';
import { estimateVdot } from '#lib/server/engine/performance/vdot.ts';
import type { Actions, PageServerLoad } from './$types';

export const load: PageServerLoad = ({ locals }) => {
	if (!locals.athlete) redirect(303, '/');
	return {
		view: getGoalView(locals.athlete),
		today: athleteToday(locals.athlete.id)
	};
};

const DISTANCES: Record<string, number> = {
	'5k': 5000,
	'10k': 10000,
	half: 21097.5,
	marathon: 42195
};

/** "3:20", "3:20:00", "45:30" (mm:ss when the first part ≥ 10 and there are 2 parts) */
function parseGoalTime(raw: string, distance: number): number | null {
	const parts = raw.trim().split(':').map(Number);
	if (parts.some((p) => !Number.isFinite(p) || p < 0)) return null;
	let sec: number;
	if (parts.length === 3) sec = parts[0] * 3600 + parts[1] * 60 + parts[2];
	else if (parts.length === 2) {
		// "3:20" for a marathon means hours:minutes; "22:30" for a 5K means minutes:seconds
		sec =
			distance >= 20_000 && parts[0] < 10
				? parts[0] * 3600 + parts[1] * 60
				: parts[0] * 60 + parts[1];
	} else return null;
	return sec > 0 ? sec : null;
}

function parseGoalForm(form: FormData) {
	const kind = String(form.get('kind') ?? 'marathon');
	const distance =
		kind === 'custom'
			? Number(String(form.get('km') ?? '').replace(',', '.')) * 1000
			: DISTANCES[kind];
	const date = String(form.get('date') ?? '');
	const elevationGain = Number(form.get('elevation') || 0);
	const time = distance ? parseGoalTime(String(form.get('time') ?? ''), distance) : null;
	const name = String(form.get('name') ?? '').trim();
	if (!distance || !(distance >= 1000 && distance <= 250_000))
		return { error: 'Pick a distance between 1 and 250 km.' };
	if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) return { error: 'Pick a race date.' };
	if (!time) return { error: 'Target time should look like 3:20:00 (or 22:30 for a 5K).' };
	if (!(elevationGain >= 0 && elevationGain <= 10_000))
		return { error: 'Elevation should be 0–10,000 m.' };
	return {
		values: {
			name:
				name ||
				({ '5k': '5K', '10k': '10K', half: 'Half marathon', marathon: 'Marathon' }[kind] ?? 'Race'),
			distance,
			date,
			targetTime: time,
			elevationGain
		}
	};
}

export const actions: Actions = {
	save: async ({ locals, request }) => {
		if (!locals.athlete) return fail(401);
		const parsed = parseGoalForm(await request.formData());
		if ('error' in parsed) return fail(400, { error: parsed.error });
		const today = athleteToday(locals.athlete.id);
		if (parsed.values.date <= today)
			return fail(400, { error: 'The race date should be in the future.' });

		const existing = activeGoal(locals.athlete.id);
		if (existing) {
			db.update(goal).set(parsed.values).where(eq(goal.id, existing.id)).run();
		} else {
			const startVdot = estimateVdot(athleteEfforts(locals.athlete.id), today)?.value ?? null;
			db.insert(goal)
				.values({ ...parsed.values, athleteId: locals.athlete.id, startDate: today, startVdot })
				.run();
		}
		regeneratePlan(locals.athlete);
		return { saved: true };
	},

	end: async ({ locals }) => {
		if (!locals.athlete) return fail(401);
		db.update(goal)
			.set({ active: false })
			.where(and(eq(goal.athleteId, locals.athlete.id), eq(goal.active, true)))
			.run();
		db.delete(planSession)
			.where(
				and(
					eq(planSession.athleteId, locals.athlete.id),
					gte(planSession.date, athleteToday(locals.athlete.id))
				)
			)
			.run();
		return { ended: true };
	}
};
