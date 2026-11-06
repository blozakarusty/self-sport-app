import { fail, redirect } from '@sveltejs/kit';
import { eq } from 'drizzle-orm';
import { db } from '#lib/server/db/index.ts';
import { athlete } from '#lib/server/db/schema.ts';
import { hrProfile } from '#lib/server/dashboard.ts';
import type { Actions, PageServerLoad } from './$types';

export const load: PageServerLoad = ({ locals }) => {
	if (!locals.athlete) redirect(303, '/');
	const a = locals.athlete;
	return {
		maxHr: a.maxHr,
		restHr: a.restHr,
		hr: hrProfile(a),
		hrZones: a.hrZones,
		weightKg: a.weightKg,
		units: a.units
	};
};

function parseHr(
	value: FormDataEntryValue | null,
	min: number,
	max: number
): number | null | 'invalid' {
	const s = String(value ?? '').trim();
	if (!s) return null;
	const n = Number(s);
	return Number.isInteger(n) && n >= min && n <= max ? n : 'invalid';
}

export const actions: Actions = {
	default: async ({ locals, request }) => {
		if (!locals.athlete) return fail(401);
		const form = await request.formData();
		const maxHr = parseHr(form.get('maxHr'), 120, 230);
		const restHr = parseHr(form.get('restHr'), 30, 100);
		if (maxHr === 'invalid' || restHr === 'invalid') {
			return fail(400, {
				error: 'Max HR must be 120–230 and rest HR 30–100 (whole numbers), or empty.'
			});
		}
		db.update(athlete).set({ maxHr, restHr }).where(eq(athlete.id, locals.athlete.id)).run();
		return { saved: true };
	}
};
