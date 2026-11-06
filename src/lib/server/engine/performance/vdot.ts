/**
 * Running fitness from Jack Daniels' VDOT model (Daniels & Gilbert, 1979).
 * Pure functions only. Distances in metres, times in seconds, paces in s/km.
 */

/** Oxygen cost (ml/kg/min) of running at `v` metres per minute. */
export function oxygenCost(v: number): number {
	return -4.6 + 0.182258 * v + 0.000104 * v * v;
}

/** Fraction of VO2max that can be sustained for `minutes`. */
export function sustainableFraction(minutes: number): number {
	return (
		0.8 + 0.1894393 * Math.exp(-0.012778 * minutes) + 0.2989558 * Math.exp(-0.1932605 * minutes)
	);
}

/** VDOT implied by covering `distance` metres in `seconds`. */
export function vdot(distance: number, seconds: number): number {
	const minutes = seconds / 60;
	return oxygenCost(distance / minutes) / sustainableFraction(minutes);
}

/** Speed (m/min) whose oxygen cost equals `vo2`. Inverse of {@link oxygenCost}. */
export function speedForOxygen(vo2: number): number {
	const a = 0.000104;
	const b = 0.182258;
	const c = -4.6 - vo2;
	return (-b + Math.sqrt(b * b - 4 * a * c)) / (2 * a);
}

/** Predicted race time (s) for `distance` metres at a given VDOT. */
export function predictTime(vdotValue: number, distance: number): number {
	// vdot(distance, t) falls as t grows, so bisect on t.
	let lo = (distance / 1000) * 60; // 1:00/km: faster than anyone
	let hi = (distance / 1000) * 1200; // 20:00/km
	for (let i = 0; i < 60; i++) {
		const mid = (lo + hi) / 2;
		if (vdot(distance, mid) > vdotValue) lo = mid;
		else hi = mid;
	}
	return (lo + hi) / 2;
}

const paceFromSpeed = (metresPerMin: number) => 60_000 / metresPerMin;

export interface TrainingPaces {
	/** [fast, slow] range */
	easy: [number, number];
	marathon: number;
	threshold: number;
	interval: number;
	repetition: number;
}

/**
 * Daniels training paces (s/km). Easy, threshold and interval come from
 * fixed fractions of VDOT; marathon and repetition from race predictions.
 */
export function trainingPaces(vdotValue: number): TrainingPaces {
	const atFraction = (f: number) => paceFromSpeed(speedForOxygen(vdotValue * f));
	return {
		easy: [atFraction(0.74), atFraction(0.62)],
		marathon: predictTime(vdotValue, 42195) / 42.195,
		threshold: atFraction(0.88),
		interval: atFraction(0.975),
		repetition: predictTime(vdotValue, 1609.34) / 1.60934
	};
}

export const RACE_DISTANCES = [
	{ name: '5K', distance: 5000 },
	{ name: '10K', distance: 10000 },
	{ name: 'Half marathon', distance: 21097.5 },
	{ name: 'Marathon', distance: 42195 }
] as const;

/**
 * Rough ultra/trail estimate: Riegel's formula from a marathon prediction,
 * with a steeper fatigue exponent past the marathon and 1 km of extra flat
 * distance per 100 m of climbing (a common rule of thumb). Low confidence.
 */
export function predictUltra(vdotValue: number, distance: number, elevationGain = 0): number {
	const marathon = predictTime(vdotValue, 42195);
	const equivalent = distance + (elevationGain / 100) * 1000;
	return marathon * (equivalent / 42195) ** 1.15;
}

export interface Effort {
	distance: number;
	time: number;
	date: string; // YYYY-MM-DD
	label: string;
	source: 'best-effort' | 'manual';
	activityId?: string;
}

export interface VdotEstimate {
	value: number;
	/** The effort that set the estimate */
	effort: Effort;
	/** VDOT of that effort before the age adjustment */
	raw: number;
}

/** Efforts shorter than this overstate endurance fitness. */
export const MIN_EFFORT_DISTANCE = 1500;
export const ESTIMATE_WINDOW_DAYS = 120;
/** Fitness is assumed to fade by this many VDOT points per 30 days of age. */
const DECAY_PER_30_DAYS = 0.5;

function daysBetween(a: string, b: string) {
	return (Date.parse(`${b}T00:00:00Z`) - Date.parse(`${a}T00:00:00Z`)) / 864e5;
}

/**
 * Best recent effort, age-adjusted. Training-run best efforts are usually
 * submaximal, so the maximum is the most honest estimate; older efforts count
 * a little less so the number follows detraining.
 */
export function estimateVdot(efforts: Effort[], today: string): VdotEstimate | null {
	let best: VdotEstimate | null = null;
	for (const e of efforts) {
		const age = daysBetween(e.date, today);
		if (age < 0 || age > ESTIMATE_WINDOW_DAYS || e.distance < MIN_EFFORT_DISTANCE) continue;
		const raw = vdot(e.distance, e.time);
		const value = raw - (age / 30) * DECAY_PER_30_DAYS;
		if (!best || value > best.value) best = { value, effort: e, raw };
	}
	return best;
}

/** Weekly VDOT trend: the estimate as it would have been at the end of each week. */
export function vdotHistory(
	efforts: Effort[],
	days: string[]
): { day: string; value: number | null }[] {
	return days.map((day) => ({ day, value: estimateVdot(efforts, day)?.value ?? null }));
}
