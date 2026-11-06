/**
 * How ready you are for a race goal: fitness gap, where you should be by now,
 * and supporting markers (volume, long run, race-pace work). Pure functions.
 * Volume and long-run targets are common coaching guidelines, not science.
 */
import { addDays, dayOf } from '../metrics/load';
import { RUN_SPORTS } from '../metrics/volume';
import { vdot } from '../performance/vdot';
import type { Phase } from './phases';

export function requiredVdot(distance: number, targetTime: number): number {
	return vdot(distance, targetTime);
}

/**
 * Expected VDOT on `day`: a straight line from the starting VDOT to the
 * target, reached when the taper starts, then flat to race day.
 */
export function expectedVdot(
	startDay: string,
	startVdot: number,
	targetVdot: number,
	taperStart: string,
	day: string
): number {
	const span = Date.parse(taperStart) - Date.parse(startDay);
	if (span <= 0) return targetVdot;
	const t = Math.min(Math.max((Date.parse(day) - Date.parse(startDay)) / span, 0), 1);
	return startVdot + (targetVdot - startVdot) * t;
}

export type GoalStatus = 'ahead' | 'on-track' | 'behind';

export function goalStatus(current: number, expected: number): GoalStatus {
	const diff = current - expected;
	if (diff > 0.5) return 'ahead';
	if (diff >= -0.3) return 'on-track';
	return 'behind';
}

export interface ReadinessTargets {
	/** km per week at the peak of training */
	peakWeeklyKm: number;
	/** longest single run to reach, km */
	longRunKm: number;
	/** km at goal pace over 4 weeks, at peak; 0 when not relevant */
	goalPaceKm4w: number;
}

/**
 * Peak targets by distance and ambition (target VDOT). Faster goals need
 * more volume; e.g. a 3:20 marathon (VDOT ~47) peaks around 62 km/week.
 */
export function readinessTargets(distance: number, targetVdot: number): ReadinessTargets {
	const ambition = Math.min(Math.max((targetVdot - 40) / 20, 0), 1); // 0 at VDOT 40, 1 at 60
	const lerp = (a: number, b: number) => Math.round(a + (b - a) * ambition);
	if (distance >= 40_000) {
		return {
			peakWeeklyKm: lerp(40, 100),
			longRunKm: distance > 43_000 ? 35 : 32,
			goalPaceKm4w: lerp(15, 40)
		};
	}
	if (distance >= 20_000) {
		return { peakWeeklyKm: lerp(35, 85), longRunKm: 20, goalPaceKm4w: lerp(10, 30) };
	}
	if (distance >= 9_000)
		return { peakWeeklyKm: lerp(30, 70), longRunKm: 15, goalPaceKm4w: lerp(6, 15) };
	return { peakWeeklyKm: lerp(25, 60), longRunKm: 12, goalPaceKm4w: lerp(4, 10) };
}

/**
 * Share of the peak target expected by `day`: ramps from the plan start up to
 * 100% by the start of the peak phase, holds, and drops during the taper.
 */
export function rampShare(phases: Phase[], day: string, startShare: number): number {
	const peak = phases.find((p) => p.name === 'peak');
	const taper = phases.find((p) => p.name === 'taper');
	if (!phases.length || !peak) return 1;
	if (taper && day >= taper.start) return 0.6;
	const span = Date.parse(peak.start) - Date.parse(phases[0].start);
	const t =
		span > 0 ? Math.min(Math.max((Date.parse(day) - Date.parse(phases[0].start)) / span, 0), 1) : 1;
	return startShare + (1 - startShare) * t;
}

export interface RunLike {
	startDateLocal: string;
	sportType: string;
	distance: number;
	movingTime: number;
	elevationGain: number;
	laps?: { distance: number; movingTime: number }[] | null;
	splits?: { distance: number; movingTime: number }[] | null;
}

export function weeklyKmAverage(runs: RunLike[], today: string, weeks = 4): number {
	const from = addDays(today, -7 * weeks + 1);
	const km = runs
		.filter(
			(r) =>
				RUN_SPORTS.has(r.sportType) &&
				dayOf(r.startDateLocal) >= from &&
				dayOf(r.startDateLocal) <= today
		)
		.reduce((s, r) => s + r.distance / 1000, 0);
	return km / weeks;
}

/**
 * Longest road run in the window. Trail runs and runs much longer than the
 * goal (an ultra) are left out: they don't show marathon-specific readiness.
 */
export function longestRoadRun(
	runs: RunLike[],
	today: string,
	goalDistance: number,
	days = 42
): number {
	const from = addDays(today, -days + 1);
	return runs
		.filter(
			(r) =>
				r.sportType === 'Run' &&
				dayOf(r.startDateLocal) >= from &&
				dayOf(r.startDateLocal) <= today &&
				r.distance <= goalDistance * 1.1
		)
		.reduce((m, r) => Math.max(m, r.distance / 1000), 0);
}

/** Km run within ±3% of goal pace, counted from laps, else per-km splits. */
export function goalPaceKm(runs: RunLike[], today: string, goalPace: number, days = 28): number {
	const from = addDays(today, -days + 1);
	let km = 0;
	for (const r of runs) {
		if (r.sportType !== 'Run' || dayOf(r.startDateLocal) < from || dayOf(r.startDateLocal) > today)
			continue;
		const segs = r.laps && r.laps.length > 1 ? r.laps : r.splits;
		for (const s of segs ?? []) {
			if (s.distance < 200 || s.movingTime <= 0) continue;
			const pace = s.movingTime / (s.distance / 1000);
			if (Math.abs(pace - goalPace) / goalPace <= 0.03) km += s.distance / 1000;
		}
	}
	return km;
}
