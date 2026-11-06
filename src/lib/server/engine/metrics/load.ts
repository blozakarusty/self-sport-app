/**
 * Training load: per-activity load, daily series, and the fitness/fatigue model.
 * Pure functions only, no I/O.
 *
 * Load unit: Banister TRIMP (minutes × HR reserve fraction × weighting).
 * Activities without HR get a duration × sport factor estimate, calibrated so an
 * easy run without HR lands close to the same run with HR.
 */

export interface LoadInput {
	startDateLocal: string; // 'YYYY-MM-DDTHH:mm:ss'
	sportType: string;
	movingTime: number; // seconds
	avgHr: number | null;
}

export interface HrProfile {
	maxHr: number;
	restHr: number;
}

export type LoadMethod = 'trimp' | 'estimate';

export interface ActivityLoad {
	load: number;
	method: LoadMethod;
}

/** Per-minute load for activities without HR (≈ easy aerobic effort per sport). */
const SPORT_FACTOR: Record<string, number> = {
	Run: 1.5,
	TrailRun: 1.6,
	VirtualRun: 1.5,
	Ride: 1.1,
	VirtualRide: 1.2,
	GravelRide: 1.1,
	MountainBikeRide: 1.3,
	Swim: 1.3,
	Tennis: 1.1,
	WeightTraining: 1.0,
	Workout: 1.0,
	Crossfit: 1.4,
	Hike: 0.9,
	Walk: 0.5,
	Yoga: 0.4
};
const DEFAULT_FACTOR = 1.0;

/** Male Banister weighting; good enough as a relative measure for one athlete. */
const TRIMP_K = 0.64;
const TRIMP_B = 1.92;

export function trimp(minutes: number, avgHr: number, hr: HrProfile): number {
	const reserve = (avgHr - hr.restHr) / (hr.maxHr - hr.restHr);
	const x = Math.min(Math.max(reserve, 0), 1);
	return minutes * x * TRIMP_K * Math.exp(TRIMP_B * x);
}

export function activityLoad(a: LoadInput, hr: HrProfile | null): ActivityLoad {
	const minutes = a.movingTime / 60;
	if (a.avgHr && hr && hr.maxHr > hr.restHr) {
		return { load: trimp(minutes, a.avgHr, hr), method: 'trimp' };
	}
	return { load: minutes * (SPORT_FACTOR[a.sportType] ?? DEFAULT_FACTOR), method: 'estimate' };
}

/** 'YYYY-MM-DD' helpers working on calendar days (no time zones involved). */
export function addDays(day: string, n: number): string {
	const d = new Date(`${day}T00:00:00Z`);
	d.setUTCDate(d.getUTCDate() + n);
	return d.toISOString().slice(0, 10);
}

export function dayOf(startDateLocal: string): string {
	return startDateLocal.slice(0, 10);
}

/** Daily load totals from `from` to `to` inclusive, with zero-filled rest days. */
export function dailyLoads(
	activities: LoadInput[],
	hr: HrProfile | null,
	from: string,
	to: string
): { day: string; load: number }[] {
	const totals = new Map<string, number>();
	for (const a of activities) {
		const day = dayOf(a.startDateLocal);
		if (day < from || day > to) continue;
		totals.set(day, (totals.get(day) ?? 0) + activityLoad(a, hr).load);
	}
	const out = [];
	for (let day = from; day <= to; day = addDays(day, 1)) {
		out.push({ day, load: totals.get(day) ?? 0 });
	}
	return out;
}

export interface FitnessPoint {
	day: string;
	load: number;
	/** Chronic training load, 42-day EWMA ("fitness") */
	ctl: number;
	/** Acute training load, 7-day EWMA ("fatigue") */
	atl: number;
	/** Training stress balance: yesterday's CTL − ATL ("form") */
	tsb: number;
	/** ATL / CTL; null while CTL is too small to be meaningful */
	acwr: number | null;
}

export const CTL_DAYS = 42;
export const ATL_DAYS = 7;

/**
 * Exponentially weighted fitness/fatigue model (Banister / Coggan PMC).
 * Pass a daily series that starts early enough (≥ ~3×42 days) for CTL to settle.
 */
export function fitnessSeries(daily: { day: string; load: number }[]): FitnessPoint[] {
	const kCtl = 1 - Math.exp(-1 / CTL_DAYS);
	const kAtl = 1 - Math.exp(-1 / ATL_DAYS);
	let ctl = 0;
	let atl = 0;
	return daily.map(({ day, load }) => {
		const tsb = ctl - atl;
		ctl += (load - ctl) * kCtl;
		atl += (load - atl) * kAtl;
		return { day, load, ctl, atl, tsb, acwr: ctl >= 5 ? atl / ctl : null };
	});
}

export type AcwrZone = 'low' | 'optimal' | 'caution' | 'high';

/** Commonly used heuristic bands; not a validated injury predictor. */
export function acwrZone(acwr: number): AcwrZone {
	if (acwr < 0.8) return 'low';
	if (acwr <= 1.3) return 'optimal';
	if (acwr <= 1.5) return 'caution';
	return 'high';
}

/**
 * Max HR estimate when the user hasn't set one: the highest recorded max HR,
 * ignoring implausible spikes (> 220 bpm).
 */
export function estimateMaxHr(maxHrs: (number | null)[]): number | null {
	const valid = maxHrs.filter((v): v is number => v != null && v > 100 && v <= 220);
	return valid.length ? Math.max(...valid) : null;
}

export const DEFAULT_REST_HR = 55;
