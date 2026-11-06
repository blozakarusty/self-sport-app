import { fail, redirect } from '@sveltejs/kit';
import { and, eq } from 'drizzle-orm';
import { db } from '#lib/server/db/index.ts';
import { athlete, performance, type PaceName, type PaceOverrides } from '#lib/server/db/schema.ts';
import { getPerformance } from '#lib/server/performance.ts';
import type { Actions, PageServerLoad } from './$types';

export const load: PageServerLoad = ({ locals }) => {
	if (!locals.athlete) redirect(303, '/');
	return getPerformance(locals.athlete);
};

/** "4:15" or "4:15/km" → 255 seconds; "" → null */
function parsePace(value: FormDataEntryValue | null): number | null | 'invalid' {
	const s = String(value ?? '')
		.trim()
		.replace(/\s*\/\s*km$/, '');
	if (!s) return null;
	const m = /^(\d{1,2}):([0-5]\d)$/.exec(s);
	if (!m) return 'invalid';
	const sec = Number(m[1]) * 60 + Number(m[2]);
	return sec >= 120 && sec <= 900 ? sec : 'invalid';
}

/** "19:58", "1:32:10" → seconds */
function parseTime(value: FormDataEntryValue | null): number | null {
	const parts = String(value ?? '')
		.trim()
		.split(':')
		.map(Number);
	if (parts.length < 2 || parts.length > 3 || parts.some((p) => !Number.isFinite(p) || p < 0))
		return null;
	const sec = parts.reduce((acc, p) => acc * 60 + p, 0);
	return sec > 0 ? sec : null;
}

const PACE_NAMES: PaceName[] = ['easy', 'marathon', 'threshold', 'interval', 'repetition'];

export const actions: Actions = {
	paces: async ({ locals, request }) => {
		if (!locals.athlete) return fail(401);
		const form = await request.formData();
		const overrides: PaceOverrides = {};
		for (const name of PACE_NAMES) {
			const v = parsePace(form.get(name));
			if (v === 'invalid')
				return fail(400, { paceError: `Use m:ss per km for ${name}, e.g. 4:15` });
			if (v != null) overrides[name] = v;
		}
		db.update(athlete)
			.set({ paceOverrides: Object.keys(overrides).length ? overrides : null })
			.where(eq(athlete.id, locals.athlete.id))
			.run();
		return { pacesSaved: true };
	},

	addResult: async ({ locals, request }) => {
		if (!locals.athlete) return fail(401);
		const form = await request.formData();
		const date = String(form.get('date') ?? '');
		const name = String(form.get('name') ?? '').trim() || 'Race';
		const km = Number(String(form.get('km') ?? '').replace(',', '.'));
		const time = parseTime(form.get('time'));
		if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) return fail(400, { resultError: 'Pick a date.' });
		if (!(km >= 1 && km <= 250)) return fail(400, { resultError: 'Distance must be 1–250 km.' });
		if (!time) return fail(400, { resultError: 'Time must look like 19:58 or 1:32:10.' });
		db.insert(performance)
			.values({ athleteId: locals.athlete.id, date, name, distance: km * 1000, time })
			.run();
		return { resultSaved: true };
	},

	deleteResult: async ({ locals, request }) => {
		if (!locals.athlete) return fail(401);
		const id = Number((await request.formData()).get('id'));
		db.delete(performance)
			.where(and(eq(performance.id, id), eq(performance.athleteId, locals.athlete.id)))
			.run();
		return { resultDeleted: true };
	}
};
