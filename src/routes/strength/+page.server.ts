import { fail, redirect } from '@sveltejs/kit';
import { and, eq, inArray } from 'drizzle-orm';
import { db } from '#lib/server/db/index.ts';
import {
	activity,
	benchmark,
	benchmarkResult,
	STRENGTH_SPLITS,
	type StrengthSplit
} from '#lib/server/db/schema.ts';
import { addBenchmarkFromLibrary, getStrength } from '#lib/server/strength.ts';
import { regeneratePlan } from '#lib/server/plan.ts';
import { workingWeight } from '#lib/server/db/schema.ts';
import { BELLS, EXERCISES } from '#lib/server/engine/plan/strength.ts';
import { benchmarkDef, suggestTarget } from '#lib/server/engine/strength/benchmarks.ts';
import type { Actions, PageServerLoad } from './$types';

export const load: PageServerLoad = ({ locals }) => {
	if (!locals.athlete) redirect(303, '/');
	return getStrength(locals.athlete);
};

/** The benchmark, only if it belongs to this athlete. */
function ownBenchmark(athleteId: number, id: number) {
	return db
		.select()
		.from(benchmark)
		.where(and(eq(benchmark.id, id), eq(benchmark.athleteId, athleteId)))
		.get();
}

function parseValue(raw: FormDataEntryValue | null, unit: string): number | null {
	const s = String(raw ?? '')
		.trim()
		.replace(',', '.');
	if (!s) return null;
	// seconds may be entered as m:ss
	if (unit === 's' && s.includes(':')) {
		const [m, sec] = s.split(':').map(Number);
		return Number.isFinite(m) && Number.isFinite(sec) ? m * 60 + sec : null;
	}
	const n = Number(s);
	return Number.isFinite(n) && n >= 0 && n < 10_000 ? n : null;
}

export const actions: Actions = {
	weights: async ({ locals, request }) => {
		if (!locals.athlete) return fail(401);
		const form = await request.formData();
		for (const key of Object.keys(EXERCISES)) {
			const raw = form.get(key);
			if (raw == null) continue;
			const kg = Number(raw);
			if (!BELLS.includes(kg)) continue;
			db.insert(workingWeight)
				.values({ athleteId: locals.athlete.id, exercise: key, kg })
				.onConflictDoUpdate({
					target: [workingWeight.athleteId, workingWeight.exercise],
					set: { kg, updatedAt: new Date() }
				})
				.run();
		}
		// rebuild upcoming sessions so they use the new weights
		regeneratePlan(locals.athlete);
		return { weightsSaved: true };
	},

	tag: async ({ locals, request }) => {
		if (!locals.athlete) return fail(401);
		const form = await request.formData();
		const id = String(form.get('id') ?? '');
		const split = String(form.get('split') ?? '');
		const rpe = Number(form.get('rpe') || 0);
		if (split && !STRENGTH_SPLITS.includes(split as StrengthSplit))
			return fail(400, { error: 'Unknown session type.' });
		if (rpe && !(Number.isInteger(rpe) && rpe >= 1 && rpe <= 10))
			return fail(400, { error: 'Effort must be 1–10.' });
		db.update(activity)
			.set({ strengthSplit: (split || null) as StrengthSplit | null, rpe: rpe || null })
			.where(and(eq(activity.id, id), eq(activity.athleteId, locals.athlete.id)))
			.run();
		return { tagged: id };
	},

	addResult: async ({ locals, request }) => {
		if (!locals.athlete) return fail(401);
		const form = await request.formData();
		const b = ownBenchmark(locals.athlete.id, Number(form.get('benchmarkId')));
		if (!b) return fail(404, { error: 'Benchmark not found.' });
		const value = parseValue(form.get('value'), b.unit);
		const date = String(form.get('date') ?? '');
		if (value == null)
			return fail(400, { error: `Enter a number of ${b.unit}.`, benchmarkId: b.id });
		if (!/^\d{4}-\d{2}-\d{2}$/.test(date))
			return fail(400, { error: 'Pick a date.', benchmarkId: b.id });
		db.insert(benchmarkResult).values({ benchmarkId: b.id, date, value }).run();
		// First result sets a suggested target if you haven't chosen one
		if (b.target == null) {
			const def = benchmarkDef(b.key);
			const t = def ? suggestTarget(def, value) : null;
			if (t != null) db.update(benchmark).set({ target: t }).where(eq(benchmark.id, b.id)).run();
		}
		return { added: b.id };
	},

	deleteResult: async ({ locals, request }) => {
		if (!locals.athlete) return fail(401);
		const form = await request.formData();
		const b = ownBenchmark(locals.athlete.id, Number(form.get('benchmarkId')));
		if (!b) return fail(404);
		db.delete(benchmarkResult)
			.where(
				and(
					eq(benchmarkResult.id, Number(form.get('resultId'))),
					eq(benchmarkResult.benchmarkId, b.id)
				)
			)
			.run();
		return { deleted: true };
	},

	setTarget: async ({ locals, request }) => {
		if (!locals.athlete) return fail(401);
		const form = await request.formData();
		const b = ownBenchmark(locals.athlete.id, Number(form.get('benchmarkId')));
		if (!b) return fail(404);
		const raw = String(form.get('target') ?? '').trim();
		const target = raw ? parseValue(raw, b.unit) : null;
		if (raw && target == null)
			return fail(400, { error: `Target should be a number of ${b.unit}.`, benchmarkId: b.id });
		db.update(benchmark).set({ target }).where(eq(benchmark.id, b.id)).run();
		return { targetSet: b.id };
	},

	addBenchmark: async ({ locals, request }) => {
		if (!locals.athlete) return fail(401);
		const key = String((await request.formData()).get('key') ?? '');
		if (!benchmarkDef(key)) return fail(400, { error: 'Pick a benchmark.' });
		const exists = db
			.select({ id: benchmark.id })
			.from(benchmark)
			.where(and(eq(benchmark.athleteId, locals.athlete.id), inArray(benchmark.key, [key])))
			.get();
		if (!exists) addBenchmarkFromLibrary(locals.athlete.id, key);
		return { benchmarkAdded: key };
	},

	removeBenchmark: async ({ locals, request }) => {
		if (!locals.athlete) return fail(401);
		const id = Number((await request.formData()).get('benchmarkId'));
		db.delete(benchmark)
			.where(and(eq(benchmark.id, id), eq(benchmark.athleteId, locals.athlete.id)))
			.run();
		return { removed: id };
	}
};
