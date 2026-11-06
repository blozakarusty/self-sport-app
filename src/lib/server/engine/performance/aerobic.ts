/**
 * Aerobic efficiency: how fast you run per heartbeat. Rising efficiency means
 * an easy heart rate buys a faster pace, even without races to measure fitness.
 */
import { addDays, dayOf } from '../metrics/load';
import { weekStart } from '../metrics/volume';

export interface RunInput {
	startDateLocal: string;
	sportType: string;
	distance: number; // m
	movingTime: number; // s
	elevationGain: number; // m
	avgHr: number | null;
}

/** Flat road runs of at least 5 km with HR; hills, trails and sprints distort the ratio. */
export function isEfficiencyRun(r: RunInput): boolean {
	if (r.sportType !== 'Run' || !r.avgHr || r.distance < 5000 || r.movingTime <= 0) return false;
	const pace = r.movingTime / (r.distance / 1000);
	return r.elevationGain / (r.distance / 1000) < 15 && pace > 180 && pace < 480;
}

/** Efficiency factor: metres per minute per bpm. */
export function efficiencyFactor(r: RunInput): number {
	return r.distance / (r.movingTime / 60) / r.avgHr!;
}

/** Pace (s/km) at `hr`, assuming speed scales with heart rate around easy effort. */
export function paceAtHr(ef: number, hr: number): number {
	return 60_000 / (ef * hr);
}

function median(xs: number[]): number {
	const s = [...xs].sort((a, b) => a - b);
	const m = Math.floor(s.length / 2);
	return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2;
}

export interface EfficiencyWeek {
	week: string;
	runs: number;
	/** pace (s/km) at the reference HR; null for weeks without qualifying runs */
	pace: number | null;
}

export function efficiencyTrend(
	runs: RunInput[],
	refHr: number,
	today: string,
	weeks: number
): EfficiencyWeek[] {
	const last = weekStart(today);
	const first = addDays(last, -7 * (weeks - 1));
	const byWeek = new Map<string, number[]>();
	for (let w = first; w <= last; w = addDays(w, 7)) byWeek.set(w, []);
	for (const r of runs) {
		if (!isEfficiencyRun(r)) continue;
		byWeek.get(weekStart(dayOf(r.startDateLocal)))?.push(efficiencyFactor(r));
	}
	return [...byWeek].map(([week, efs]) => ({
		week,
		runs: efs.length,
		pace: efs.length ? paceAtHr(median(efs), refHr) : null
	}));
}

/** Median pace at `refHr` over qualifying runs in [from, to]. */
export function efficiencyBetween(runs: RunInput[], refHr: number, from: string, to: string) {
	const efs = runs
		.filter(
			(r) => isEfficiencyRun(r) && dayOf(r.startDateLocal) >= from && dayOf(r.startDateLocal) <= to
		)
		.map(efficiencyFactor);
	return efs.length ? { pace: paceAtHr(median(efs), refHr), runs: efs.length } : null;
}

/** Midpoint of zone 2, or 75% of max HR when zones are unknown. */
export function defaultRefHr(
	zones: { min: number; max: number }[] | null,
	maxHr: number | null
): number | null {
	if (zones && zones.length >= 2 && zones[1].max > 0)
		return Math.round((zones[1].min + zones[1].max) / 2);
	return maxHr ? Math.round(maxHr * 0.75) : null;
}
