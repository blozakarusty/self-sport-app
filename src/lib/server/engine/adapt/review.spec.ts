import { describe, expect, it } from 'vitest';
import type { RunDetails } from '../plan/runs';
import {
	applyCoachAdjustment,
	planChanges,
	retitle,
	reviewWeek,
	scaleRun,
	type PlanRow,
	type ReviewInput
} from './review';

const base: ReviewInput = {
	plannedKm: 40,
	actualKm: 39,
	keyTotal: 2,
	keyDone: 2,
	qualityMissed: false,
	longMissed: false,
	acwr: 1,
	tsb: -5
};

describe('reviewWeek', () => {
	it('progresses after a completed week', () => {
		expect(reviewWeek(base)).toMatchObject({ decision: 'progress', factor: 1 });
	});

	it('recovers on a load spike or deep fatigue, whatever the compliance', () => {
		expect(reviewWeek({ ...base, acwr: 1.6 })).toMatchObject({ decision: 'recover', factor: 0.8 });
		expect(reviewWeek({ ...base, tsb: -35 }).decision).toBe('recover');
	});

	it('reduces after a clearly short week or no key sessions', () => {
		expect(reviewWeek({ ...base, actualKm: 20 }).decision).toBe('reduce');
		expect(reviewWeek({ ...base, keyDone: 0 }).decision).toBe('reduce');
	});

	it('holds after a slightly short week and eases after an overshoot', () => {
		expect(reviewWeek({ ...base, actualKm: 30 })).toMatchObject({ decision: 'hold', factor: 1 });
		expect(reviewWeek({ ...base, actualKm: 55 })).toMatchObject({ decision: 'hold', factor: 0.95 });
	});

	it('copes with nothing planned', () => {
		expect(
			reviewWeek({ ...base, plannedKm: 0, actualKm: 0, keyTotal: 0, keyDone: 0 }).kmRatio
		).toBeNull();
	});
});

describe('coach guardrails', () => {
	const hold = reviewWeek({ ...base, actualKm: 30 });
	const reduce = reviewWeek({ ...base, actualKm: 20 });

	it('clamps the nudge and never exceeds the plan', () => {
		expect(applyCoachAdjustment(hold, -0.5)).toBe(0.9);
		expect(applyCoachAdjustment(hold, 0.5)).toBe(1);
	});

	it('cannot raise volume after a reduce decision', () => {
		expect(applyCoachAdjustment(reduce, 0.05)).toBe(0.85);
		expect(applyCoachAdjustment(reduce, -0.05)).toBe(0.8);
	});

	it('ignores nonsense', () => {
		expect(applyCoachAdjustment(reduce, Number.NaN)).toBe(0.85);
	});
});

const easy: RunDetails = {
	kind: 'run',
	km: 10,
	purpose: '',
	steps: [{ kind: 'steady', km: 10, pace: 'easy' }]
};
const longWithGoal: RunDetails = {
	kind: 'run',
	km: 30,
	purpose: '',
	steps: [
		{ kind: 'steady', km: 24, pace: 'easy' },
		{ kind: 'work', km: 6, pace: 'goal' }
	]
};
const row = (
	id: number,
	type: string,
	title: string,
	details: RunDetails,
	extra = {}
): PlanRow => ({
	id,
	type,
	kind: 'run',
	title,
	phase: 'build',
	week: 10,
	details,
	skipped: false,
	...extra
});

describe('scaling', () => {
	it('scales only the easy kilometres', () => {
		const s = scaleRun(longWithGoal, 0.8);
		expect(s.steps[0]).toMatchObject({ km: 19 });
		expect(s.steps[1]).toMatchObject({ km: 6 });
		expect(s.km).toBe(25);
	});

	it('keeps titles in step', () => {
		expect(retitle('Easy run 10 km + strides', 8.5)).toBe('Easy run 9 km + strides');
		expect(retitle('Long run 30 km, last 6 km at goal pace', 25)).toBe(
			'Long run 25 km, last 6 km at goal pace'
		);
	});
});

describe('planChanges', () => {
	const next = [
		row(1, 'easy', 'Easy run 10 km', easy),
		row(2, 'long', 'Long run 30 km', longWithGoal)
	];
	const after = [row(3, 'easy', 'Easy run 10 km', easy)];
	const none = { quality: null, long: null };
	const reduce = reviewWeek({ ...base, actualKm: 20 });

	it('leaves the plan alone after a good week', () => {
		expect(planChanges(reviewWeek(base), 1, next, after, none)).toEqual([]);
	});

	it('cuts next week and eases back over the week after', () => {
		const c = planChanges(reduce, 0.85, next, after, none);
		expect(c.map((x) => x.id)).toEqual([1, 2, 3]);
		expect((c[0].details as RunDetails).km).toBe(8.5);
		expect((c[2].details as RunDetails).km).toBe(9.5);
	});

	it('never touches the taper or race week', () => {
		const taper = next.map((r) => ({ ...r, phase: 'taper' as const }));
		expect(
			planChanges(
				reduce,
				0.85,
				taper,
				after.map((r) => ({ ...r, type: 'race' })),
				none
			)
		).toEqual([]);
	});

	it('repeats a missed quality session instead of moving up the ladder', () => {
		const review = reviewWeek({ ...base, keyDone: 1, qualityMissed: true });
		const q = row(5, 'quality', 'Threshold 4 × 10 min', easy);
		const missed = row(4, 'quality', 'Threshold 3 × 10 min', easy);
		const [c] = planChanges(review, 1, [q], [], { quality: missed, long: null });
		expect(c).toMatchObject({ id: 5, title: 'Threshold 3 × 10 min' });
	});

	it('does not grow the long run after a missed one', () => {
		const review = reviewWeek({ ...base, keyDone: 1, longMissed: true });
		const missed = row(4, 'long', 'Long run 25 km', { ...easy, km: 25 });
		const nextLong = row(5, 'long', 'Long run 30 km', {
			...easy,
			km: 30,
			steps: [{ kind: 'steady', km: 30, pace: 'easy' }]
		});
		const [c] = planChanges(review, 1, [nextLong], [], { quality: null, long: missed });
		expect((c.details as RunDetails).km).toBe(25);
	});

	it('skips sessions you skipped', () => {
		expect(
			planChanges(
				reduce,
				0.85,
				[row(1, 'easy', 'Easy run 10 km', easy, { skipped: true })],
				[],
				none
			)
		).toEqual([]);
	});
});
