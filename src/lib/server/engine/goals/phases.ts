/**
 * Macro phases (periodization) from today to race day. Pure functions only.
 * Days are 'YYYY-MM-DD'; weeks run Monday–Sunday.
 */
import { addDays } from '../metrics/load';
import { weekStart } from '../metrics/volume';

export type PhaseName = 'base' | 'build' | 'peak' | 'taper';

export interface PhaseFocus {
	run: string;
	strength: string;
	/** suggested strength sessions per week */
	strengthPerWeek: number;
}

export const PHASE_INFO: Record<PhaseName, { label: string } & PhaseFocus> = {
	base: {
		label: 'Base',
		run: 'Build aerobic volume with easy running and strides; long run grows gradually.',
		strength:
			'Main strength block: push / pull / legs, heavier and slower. Best time to chase pull-ups.',
		strengthPerWeek: 3
	},
	build: {
		label: 'Build',
		run: 'Add threshold and marathon-pace work; volume keeps rising.',
		strength: 'Keep strength, lower volume: 2 sessions, legs away from key runs.',
		strengthPerWeek: 2
	},
	peak: {
		label: 'Peak',
		run: 'Race-specific: longest runs with marathon-pace blocks, highest volume.',
		strength: 'Maintenance: 2 short sessions, upper body and core, light legs.',
		strengthPerWeek: 2
	},
	taper: {
		label: 'Taper',
		run: 'Cut volume 30–50%, keep some intensity, arrive fresh.',
		strength: 'One light session in the first taper week, then rest.',
		strengthPerWeek: 1
	}
};

export interface Phase {
	name: PhaseName;
	/** Monday of the first week */
	start: string;
	/** Sunday of the last week (race day for taper) */
	end: string;
	weeks: number;
	/** Mondays of lighter recovery weeks inside the phase */
	recoveryWeeks: string[];
	/** Monday of the week to re-test benchmarks, if any */
	testWeek: string | null;
}

/** Taper length grows with race distance. */
export function taperWeeks(distance: number): number {
	if (distance <= 10_500) return 1;
	if (distance <= 25_000) return 2;
	return 3;
}

/**
 * Split the weeks between the start week and race week into phases:
 * taper by distance, then roughly 30% peak, 35% build and the rest base.
 * Short runways drop base first. Every 4th week of base/build/peak is a
 * recovery week, and benchmarks are re-tested in each phase's last week.
 */
export function macroPhases(startDay: string, raceDay: string, distance: number): Phase[] {
	const first = weekStart(startDay);
	const raceWeek = weekStart(raceDay);
	const total = Math.round((Date.parse(raceWeek) - Date.parse(first)) / (7 * 864e5)) + 1;
	if (total < 1) return [];

	const taper = Math.min(taperWeeks(distance), total);
	const rest = total - taper;
	let peak = Math.round(rest * 0.3);
	let build = Math.round(rest * 0.35);
	let base = rest - peak - build;
	if (rest < 6) {
		// too short for a base phase: build then peak
		base = 0;
		peak = Math.floor(rest / 2);
		build = rest - peak;
	}

	const plan: [PhaseName, number][] = [
		['base', base],
		['build', build],
		['peak', peak],
		['taper', taper]
	];
	const phases: Phase[] = [];
	let cursor = first;
	for (const [name, weeks] of plan) {
		if (weeks <= 0) continue;
		const mondays = Array.from({ length: weeks }, (_, i) => addDays(cursor, i * 7));
		phases.push({
			name,
			start: cursor,
			end: name === 'taper' ? raceDay : addDays(cursor, weeks * 7 - 1),
			weeks,
			recoveryWeeks: name === 'taper' ? [] : mondays.filter((_, i) => i % 4 === 3),
			testWeek: name === 'taper' ? null : mondays[mondays.length - 1]
		});
		cursor = addDays(cursor, weeks * 7);
	}
	return phases;
}

export function phaseOn(phases: Phase[], day: string): Phase | null {
	return phases.find((p) => day >= p.start && day <= p.end) ?? null;
}

/** 1-based week number of `day` within the whole plan. */
export function planWeek(phases: Phase[], day: string): number | null {
	if (!phases.length || day < phases[0].start) return null;
	return Math.floor((Date.parse(weekStart(day)) - Date.parse(phases[0].start)) / (7 * 864e5)) + 1;
}
