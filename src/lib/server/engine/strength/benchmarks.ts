/**
 * Strength and muscular-endurance benchmarks for kettlebell, bodyweight and
 * paralette training. Pure data and functions; targets are suggestions.
 */
import { addDays, dayOf } from '../metrics/load';
import { weekStart } from '../metrics/volume';

export type Category = 'push' | 'pull' | 'legs' | 'core' | 'body';

export interface BenchmarkDef {
	key: string;
	name: string;
	category: Category;
	unit: string;
	better: 'higher' | 'lower';
	/** How to test it, shown next to the result form */
	how: string;
	/** A fixed target (e.g. 10 pull-ups) or a multiplier on your baseline */
	target: { fixed: number } | { ratio: number; min?: number; max?: number } | null;
	/** Added automatically when you first open the Strength page */
	starter?: boolean;
}

export const BENCHMARK_LIBRARY: BenchmarkDef[] = [
	{
		key: 'pullups-max',
		name: 'Strict pull-ups',
		category: 'pull',
		unit: 'reps',
		better: 'higher',
		how: 'Dead hang, chin over the bar, no kipping. One set to failure.',
		target: { fixed: 10 },
		starter: true
	},
	{
		key: 'dead-hang',
		name: 'Dead hang',
		category: 'pull',
		unit: 's',
		better: 'higher',
		how: 'Hang from the bar, arms straight, as long as you can.',
		target: { ratio: 1.5, min: 60, max: 120 }
	},
	{
		key: 'pushups-max',
		name: 'Push-ups',
		category: 'push',
		unit: 'reps',
		better: 'higher',
		how: 'Chest to fist height, full lockout, body straight. One set to failure.',
		target: { ratio: 1.4, min: 30 },
		starter: true
	},
	{
		key: 'lsit-hold',
		name: 'L-sit on paralettes',
		category: 'core',
		unit: 's',
		better: 'higher',
		how: 'Legs straight and level with the floor (tuck counts half). Hold as long as you can.',
		target: { ratio: 2, min: 15, max: 30 }
	},
	{
		key: 'paralette-dips',
		name: 'Paralette dips',
		category: 'push',
		unit: 'reps',
		better: 'higher',
		how: 'Feet raised on a box behind you, lower until shoulders reach the paralettes. One set to failure.',
		target: { ratio: 1.5, min: 15 }
	},
	{
		key: 'pike-pushups',
		name: 'Pike push-ups',
		category: 'push',
		unit: 'reps',
		better: 'higher',
		how: 'Hips high, head to the floor between your hands. One set to failure.',
		target: { ratio: 1.5, min: 10 }
	},
	{
		key: 'kb-swings-5min',
		name: 'Kettlebell swings in 5 min',
		category: 'legs',
		unit: 'reps',
		better: 'higher',
		how: 'Two-hand swings to chest height with the same bell each time; rest as needed within 5 minutes.',
		target: { ratio: 1.2 },
		starter: true
	},
	{
		key: 'goblet-squat',
		name: 'Goblet squats',
		category: 'legs',
		unit: 'reps',
		better: 'higher',
		how: 'Same kettlebell each test, hips below knees. One set to failure.',
		target: { ratio: 1.5, min: 20 }
	},
	{
		key: 'pistol-squat',
		name: 'Pistol squats (weaker leg)',
		category: 'legs',
		unit: 'reps',
		better: 'higher',
		how: 'Full depth, no support (or to a box and note it). Count your weaker leg.',
		target: { ratio: 2, min: 5, max: 15 },
		starter: true
	},
	{
		key: 'calf-raise-sl',
		name: 'Single-leg calf raises',
		category: 'legs',
		unit: 'reps',
		better: 'higher',
		how: 'Off a step, full range, slow. Count your weaker leg. Key for running.',
		target: { ratio: 1.3, min: 25 }
	},
	{
		key: 'plank',
		name: 'Plank',
		category: 'core',
		unit: 's',
		better: 'higher',
		how: 'Forearms, body straight; stop when the hips drop.',
		target: { ratio: 1.5, min: 90, max: 180 },
		starter: true
	},
	{
		key: 'hollow-hold',
		name: 'Hollow body hold',
		category: 'core',
		unit: 's',
		better: 'higher',
		how: 'Lower back pressed down, arms and legs long and low.',
		target: { ratio: 1.5, min: 45, max: 90 }
	},
	{
		key: 'body-weight',
		name: 'Body weight',
		category: 'body',
		unit: 'kg',
		better: 'lower',
		how: 'Morning, after the toilet, before eating. Weekly is enough; the trend matters, not one day.',
		target: null,
		starter: true
	},
	{
		key: 'waist',
		name: 'Waist',
		category: 'body',
		unit: 'cm',
		better: 'lower',
		how: 'At the navel, relaxed, same time of day.',
		target: null
	}
];

export function benchmarkDef(key: string | null): BenchmarkDef | undefined {
	return BENCHMARK_LIBRARY.find((b) => b.key === key);
}

/** Suggested target from a baseline result. */
export function suggestTarget(def: BenchmarkDef, baseline: number | null): number | null {
	if (!def.target) return null;
	if ('fixed' in def.target) return def.target.fixed;
	if (baseline == null) return def.target.min ?? null;
	let t = baseline * def.target.ratio;
	if (def.target.min != null) t = Math.max(t, def.target.min);
	if (def.target.max != null) t = Math.min(t, def.target.max);
	t = def.unit === 's' ? Math.round(t / 5) * 5 : Math.round(t);
	return def.better === 'higher' ? Math.max(t, baseline + 1) : t;
}

/**
 * Progress from baseline to target, 0..1 (can exceed 1). Null when there is
 * no target or no room between baseline and target.
 */
export function benchmarkProgress(
	baseline: number | null,
	latest: number | null,
	target: number | null,
	better: 'higher' | 'lower'
): number | null {
	if (baseline == null || latest == null || target == null) return null;
	const span = better === 'higher' ? target - baseline : baseline - target;
	if (span <= 0) return latest === baseline ? 1 : null;
	const done = better === 'higher' ? latest - baseline : baseline - latest;
	return Math.max(0, done / span);
}

/** Linear trend per week (least squares) over results; null with < 2 results. */
export function weeklyTrend(results: { date: string; value: number }[]): number | null {
	if (results.length < 2) return null;
	const xs = results.map((r) => Date.parse(r.date) / (7 * 864e5));
	const ys = results.map((r) => r.value);
	const mx = xs.reduce((a, b) => a + b, 0) / xs.length;
	const my = ys.reduce((a, b) => a + b, 0) / ys.length;
	const num = xs.reduce((s, x, i) => s + (x - mx) * (ys[i] - my), 0);
	const den = xs.reduce((s, x) => s + (x - mx) ** 2, 0);
	return den ? num / den : null;
}

export const STRENGTH_SPORTS = new Set(['WeightTraining', 'Workout', 'Crossfit']);

export interface StrengthWeek {
	week: string;
	push: number;
	pull: number;
	legs: number;
	full: number;
	untagged: number;
}

/** Strength sessions per week, by push / pull / legs tag. */
export function strengthWeeks(
	sessions: { startDateLocal: string; sportType: string; strengthSplit: string | null }[],
	today: string,
	weeks: number
): StrengthWeek[] {
	const last = weekStart(today);
	const first = addDays(last, -7 * (weeks - 1));
	const byWeek = new Map<string, StrengthWeek>();
	for (let w = first; w <= last; w = addDays(w, 7)) {
		byWeek.set(w, { week: w, push: 0, pull: 0, legs: 0, full: 0, untagged: 0 });
	}
	for (const s of sessions) {
		if (!STRENGTH_SPORTS.has(s.sportType)) continue;
		const b = byWeek.get(weekStart(dayOf(s.startDateLocal)));
		if (!b) continue;
		const key = (s.strengthSplit ?? 'untagged') as keyof Omit<StrengthWeek, 'week'>;
		b[key]++;
	}
	return [...byWeek.values()];
}
